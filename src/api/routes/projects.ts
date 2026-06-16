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
import { getCodeGraphInstance, ok, projectIdResolver } from '../middleware';
import CodeGraph from '../../index';
import { isInitialized } from '../../directory';
import { getRegisteredProjects, registerProject as addToRegistry, getProjectSystemId, getProjectIdByPath } from '../registry';
import { taskManager } from '../task-manager-shared';
import { credentialService } from '../credential-shared';
import { saveUploadedFile } from '../source-fetcher';

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
 *   - systemId: optional — filter to only projects belonging to this system
 */
projectRoutes.get('/projects', async (c) => {
  const projects: Array<{ path: string; name: string; initialized: boolean; systemId?: string | null; id: string | null }> = [];

  // Add projects from the global registry (registered via `codegraph init`)
  const registeredPaths = getRegisteredProjects();
  for (const p of registeredPaths) {
    const name = path.basename(p);
    const initialized = isInitialized(p);
    const systemId = getProjectSystemId(p);
    const id = getProjectIdByPath(p);
    projects.push({ path: p, name, initialized, systemId, id });
  }

  // Scan from specified or default directory
  const scanDir = c.req.query('scanDir') || os.homedir();
  const depth = Math.min(parseInt(c.req.query('depth') || '3', 10), 5);

  const scanned = scanForProjects(scanDir, depth);

  // Merge scanned results, avoiding duplicates with registered projects
  const existingPaths = new Set(projects.map((p) => p.path));
  for (const p of scanned) {
    if (!existingPaths.has(p.path)) {
      const systemId = getProjectSystemId(p.path);
      projects.push({ ...p, systemId, id: getProjectIdByPath(p.path) });
    }
  }

  // If systemId query param provided, filter to only that system's projects
  const systemId = c.req.query('systemId');
  const filtered = systemId
    ? projects.filter((p) => p.systemId === systemId)
    : projects;

  return c.json(ok(filtered));
});

/**
 * Register a project path explicitly.
 * This is useful for projects that are not in the default scan directory.
 */
projectRoutes.post('/projects/register', async (c) => {
  const body = await c.req.json();
  const projectPath = body.path;
  const systemId = body.systemId;

  if (!projectPath) {
    return c.json({ ok: false, error: 'path is required' }, 400);
  }

  if (!isInitialized(projectPath)) {
    return c.json({ ok: false, error: `CodeGraph not initialized in ${projectPath}` }, 404);
  }

  try {
    await getCodeGraphInstance(projectPath);
    addToRegistry(projectPath, systemId);
    return c.json(ok({ path: projectPath, initialized: true }));
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});

/**
 * Get project statistics.
 */
projectRoutes.get('/projects/:id/stats', projectIdResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const stats = instance.getStats();
  return c.json(ok(stats));
});

/**
 * Get project index status.
 */
projectRoutes.get('/projects/:id/status', projectIdResolver(), async (c) => {
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
projectRoutes.post('/projects/:id/index', projectIdResolver(), async (c) => {
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
projectRoutes.post('/projects/:id/sync', projectIdResolver(), async (c) => {
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

const GIT_URL_RE = /^(https?:\/\/|git@|ssh:\/\/)/;
const NAME_RE = /^[a-zA-Z0-9_-]{3,50}$/;

/**
 * Create a task to clone a git repository and build its graph.
 */
projectRoutes.post('/projects/clone', async (c) => {
  const body = await c.req.json();
  const { name, url, branch, targetPath, systemId, credentialId } = body;

  if (!name || !NAME_RE.test(name)) {
    return c.json({ ok: false, error: '项目名称格式不正确（3-50字符，仅允许字母数字下划线连字符）' }, 400);
  }
  if (!url || !GIT_URL_RE.test(url)) {
    return c.json({ ok: false, error: 'Git URL 格式不正确' }, 400);
  }

  if (credentialId) {
    const cred = credentialService.getCredentialMeta(credentialId);
    if (!cred) {
      return c.json({ ok: false, error: '指定的凭证不存在' }, 400);
    }
  }

  const activeTasks = taskManager.listTasks({ status: 'active' });
  if (activeTasks.some(t => t.name === name)) {
    return c.json({ ok: false, error: '已存在同名任务正在运行' }, 409);
  }

  const task = await taskManager.createTask({
    name,
    source_type: 'git',
    source_url: url,
    branch: branch || undefined,
    target_path: targetPath || undefined,
    system_id: systemId || undefined,
    credential_id: credentialId || undefined,
  });

  taskManager.scheduleTask(task.id);

  return c.json({ ok: true, data: { taskId: task.id } }, 202);
});

/**
 * Create a task to upload an archive and build its graph.
 */
projectRoutes.post('/projects/upload', async (c) => {
  const body = await c.req.parseBody();
  const name = body.name as string;
  const file = body.file as File;
  const targetPath = body.targetPath as string | undefined;
  const systemId = body.systemId as string | undefined;

  if (!name || !NAME_RE.test(name)) {
    return c.json({ ok: false, error: '项目名称格式不正确（3-50字符，仅允许字母数字下划线连字符）' }, 400);
  }
  if (!file) {
    return c.json({ ok: false, error: '请上传文件' }, 400);
  }

  const maxSize = 500 * 1024 * 1024;
  if (file.size > maxSize) {
    return c.json({ ok: false, error: '文件过大，最大 500MB' }, 413);
  }

  const ext = path.extname(file.name).toLowerCase();
  if (!['.zip', '.gz', '.tgz'].includes(ext) && !file.name.toLowerCase().endsWith('.tar.gz')) {
    return c.json({ ok: false, error: '仅支持 .zip, .tar.gz, .tgz 格式' }, 400);
  }

  const activeTasks = taskManager.listTasks({ status: 'active' });
  if (activeTasks.some(t => t.name === name)) {
    return c.json({ ok: false, error: '已存在同名任务正在运行' }, 409);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const archivePath = saveUploadedFile(buffer, file.name);

  const task = await taskManager.createTask({
    name,
    source_type: 'upload',
    archive_path: archivePath,
    target_path: targetPath || undefined,
    system_id: systemId || undefined,
  });

  taskManager.scheduleTask(task.id);

  return c.json({ ok: true, data: { taskId: task.id } }, 202);
});
