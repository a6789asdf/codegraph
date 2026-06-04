/**
 * Project Registry
 *
 * A file-based registry of CodeGraph-initialized projects.
 * Shared between CLI (init/uninit) and API server.
 *
 * Registry file: ~/.codegraph-projects.json
 * Format: { "projects": ["/path/to/project1", "/path/to/project2"] }
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const REGISTRY_FILE = path.join(os.homedir(), '.codegraph-projects.json');

interface Registry {
  projects: string[];
}

function readRegistry(): Registry {
  try {
    if (fs.existsSync(REGISTRY_FILE)) {
      const content = fs.readFileSync(REGISTRY_FILE, 'utf-8');
      const data = JSON.parse(content);
      return { projects: Array.isArray(data.projects) ? data.projects : [] };
    }
  } catch {
    // Corrupted or unreadable — start fresh
  }
  return { projects: [] };
}

function writeRegistry(registry: Registry): void {
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2), 'utf-8');
}

/**
 * Register a project path in the global registry.
 * Called by `codegraph init`.
 */
export function registerProject(projectPath: string): void {
  const resolved = path.resolve(projectPath);
  const registry = readRegistry();
  if (!registry.projects.includes(resolved)) {
    registry.projects.push(resolved);
    writeRegistry(registry);
  }
}

/**
 * Unregister a project path from the global registry.
 * Called by `codegraph uninit`.
 */
export function unregisterProject(projectPath: string): void {
  const resolved = path.resolve(projectPath);
  const registry = readRegistry();
  const idx = registry.projects.indexOf(resolved);
  if (idx !== -1) {
    registry.projects.splice(idx, 1);
    writeRegistry(registry);
  }
}

/**
 * Get all registered project paths.
 * Used by the API server to list known projects.
 */
export function getRegisteredProjects(): string[] {
  return readRegistry().projects;
}
