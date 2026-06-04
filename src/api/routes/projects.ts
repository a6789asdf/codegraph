/**
 * Project Management Routes
 *
 * Endpoints for listing projects, checking status, and triggering
 * index/sync operations.
 */

import { Hono } from 'hono';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getCodeGraphInstance, ok, projectResolver } from '../middleware';
import CodeGraph from '../../index';
import { isInitialized } from '../../directory';
import { getRegisteredProjects, registerProject as addToRegistry } from '../registry';

export const projectRoutes = new Hono();

// Directories to skip during recursive scan
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg',
  'dist', 'build', 'out', 'target', 'vendor',
  'Library', 'Applications', 'System', 'Proc',
  'Windows', 'Program Files', 'Program Files (x86)',
  'AppData', '.cache', '.local', '.npm', '.nvm',
  '.vscode', '.vscode-insiders', '.cursor',
]);

/**
 * Recursively scan for .codegraph/ directories up to a max depth.
 */
function scanForProjects(
  rootDir: string,
  maxDepth: number = 3,
  currentDepth: number = 0,
): Array<{ path: string; name: string; initialized: boolean }> {
  const results: Array<{ path: string; name: string; initialized: boolean }> = [];

  if (currentDepth > maxDepth) return results;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.') && currentDepth > 0) continue;
    if (SKIP_DIRS.has(entry.name)) continue;

    const fullPath = path.join(rootDir, entry.name);

    // Check if this directory has a .codegraph/ with codegraph.db
    if (isInitialized(fullPath)) {
      results.push({
        path: fullPath,
        name: entry.name,
        initialized: true,
      });
      // Don't recurse into initialized projects — they won't have nested ones
      continue;
    }

    // Recurse into subdirectories
    if (currentDepth < maxDepth) {
      results.push(...scanForProjects(fullPath, maxDepth, currentDepth + 1));
    }
  }

  return results;
}

/**
 * List all initialized CodeGraph projects.
 *
 * Scans common directories recursively (up to depth 3) and includes
 * any manually registered projects.
 *
 * Query params:
 *   - scanDir: custom root directory to scan (default: home directory)
 *   - depth: max scan depth (default: 3, max: 5)
 */
projectRoutes.get('/projects', async (c) => {
  const projects: Array<{ path: string; name: string; initialized: boolean }> = [];

  // Add projects from the global registry (registered via `codegraph init`)
  const registeredPaths = getRegisteredProjects();
  for (const p of registeredPaths) {
    const name = path.basename(p);
    const initialized = isInitialized(p);
    projects.push({ path: p, name, initialized });
  }

  // Scan from specified or default directory
  const scanDir = c.req.query('scanDir') || os.homedir();
  const depth = Math.min(parseInt(c.req.query('depth') || '3', 10), 5);

  const scanned = scanForProjects(scanDir, depth);

  // Merge scanned results, avoiding duplicates with registered projects
  const existingPaths = new Set(projects.map((p) => p.path));
  for (const p of scanned) {
    if (!existingPaths.has(p.path)) {
      projects.push(p);
    }
  }

  return c.json(ok(projects));
});

/**
 * Register a project path explicitly.
 * This is useful for projects that are not in the default scan directory.
 */
projectRoutes.post('/projects/register', async (c) => {
  const body = await c.req.json();
  const projectPath = body.path;

  if (!projectPath) {
    return c.json({ ok: false, error: 'path is required' }, 400);
  }

  if (!isInitialized(projectPath)) {
    return c.json({ ok: false, error: `CodeGraph not initialized in ${projectPath}` }, 404);
  }

  try {
    await getCodeGraphInstance(projectPath);
    addToRegistry(projectPath);
    return c.json(ok({ path: projectPath, initialized: true }));
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});

/**
 * Get project statistics.
 */
projectRoutes.get('/projects/:path/stats', projectResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const stats = instance.getStats();
  return c.json(ok(stats));
});

/**
 * Get project index status.
 */
projectRoutes.get('/projects/:path/status', projectResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const stats = instance.getStats();
  const pendingFiles = instance.getPendingFiles();
  const isWatching = instance.isWatching();
  const isIndexing = instance.isIndexing();
  const lastIndexedAt = instance.getLastIndexedAt();
  const backend = instance.getBackend();
  const journalMode = instance.getJournalMode();
  const frameworks = instance.getDetectedFrameworks();

  return c.json(ok({
    stats,
    pendingFiles,
    isWatching,
    isIndexing,
    lastIndexedAt,
    backend,
    journalMode,
    frameworks,
  }));
});

/**
 * Trigger full index.
 */
projectRoutes.post('/projects/:path/index', projectResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;

  if (instance.isIndexing()) {
    return c.json({ ok: false, error: 'Indexing already in progress' }, 409);
  }

  // Start indexing asynchronously
  instance.indexAll().then((result) => {
    console.log(`Index completed: ${result.filesIndexed} files indexed`);
  }).catch((err) => {
    console.error(`Index failed: ${err.message}`);
  });

  return c.json({ ok: true, data: { message: 'Indexing started' } }, 202);
});

/**
 * Trigger incremental sync.
 */
projectRoutes.post('/projects/:path/sync', projectResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;

  if (instance.isIndexing()) {
    return c.json({ ok: false, error: 'Indexing in progress, cannot sync' }, 409);
  }

  instance.sync().then((result) => {
    console.log(`Sync completed: ${result.filesAdded} added, ${result.filesModified} modified, ${result.filesRemoved} removed`);
  }).catch((err) => {
    console.error(`Sync failed: ${err.message}`);
  });

  return c.json({ ok: true, data: { message: 'Sync started' } }, 202);
});
