/**
 * Project Registry
 *
 * A file-based registry of CodeGraph-initialized projects.
 * Shared between CLI (init/uninit) and API server.
 *
 * Registry file: ~/.codegraph-projects.json
 * Format (v3):
 * {
 *   "version": 3,
 *   "systems": [{ "id": "uuid", "name": "...", "createdAt": "ISO" }],
 *   "projects": [{ "id": "uuid", "path": "/path/to/project", "systemId": "uuid" }]
 * }
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';

const REGISTRY_FILE = path.join(os.homedir(), '.codegraph-projects.json');

interface System {
  id: string;
  name: string;
  createdAt: string;
}

interface ProjectEntry {
  id: string;
  path: string;
  systemId: string;
}

interface Registry {
  version: number;
  systems: System[];
  projects: ProjectEntry[];
}

function ensureDefaultSystem(registry: Registry): void {
  if (registry.systems.length === 0) {
    registry.systems.push({
      id: randomUUID(),
      name: '默认系统',
      createdAt: new Date().toISOString(),
    });
  }
}

function readRegistry(): Registry {
  let needsMigration = false;
  let registry: Registry;

  try {
    if (fs.existsSync(REGISTRY_FILE)) {
      const content = fs.readFileSync(REGISTRY_FILE, 'utf-8');
      const data = JSON.parse(content);

      // Detect v1 format: no version field or projects is a string array
      if (!data.version || (Array.isArray(data.projects) && data.projects.length > 0 && typeof data.projects[0] === 'string')) {
        const defaultSystem: System = {
          id: randomUUID(),
          name: '默认系统',
          createdAt: new Date().toISOString(),
        };

        const oldPaths: string[] = Array.isArray(data.projects) ? data.projects : [];
        registry = {
          version: 3,
          systems: [defaultSystem],
          projects: oldPaths.map((p) => ({ id: randomUUID(), path: p, systemId: defaultSystem.id })),
        };
        needsMigration = true;
      } else {
        registry = {
          version: data.version || 2,
          systems: Array.isArray(data.systems) ? data.systems : [],
          projects: Array.isArray(data.projects) ? data.projects : [],
        };

        // v2 → v3 migration: add UUID to projects missing `id` field
        if (registry.version < 3) {
          for (const proj of registry.projects) {
            if (!(proj as any).id) {
              (proj as any).id = randomUUID();
            }
          }
          registry.version = 3;
          needsMigration = true;
        }
      }
    } else {
      registry = { version: 3, systems: [], projects: [] };
      needsMigration = true;
    }
  } catch {
    // Corrupted or unreadable — start fresh
    registry = { version: 3, systems: [], projects: [] };
    needsMigration = true;
  }

  ensureDefaultSystem(registry);

  if (needsMigration) {
    writeRegistry(registry);
  }

  return registry;
}

function writeRegistry(registry: Registry): void {
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2), 'utf-8');
}

/**
 * Get all systems with computed project counts.
 */
export function getSystems(): Array<System & { projectCount: number }> {
  const registry = readRegistry();
  return registry.systems.map((sys) => ({
    ...sys,
    projectCount: registry.projects.filter((p) => p.systemId === sys.id).length,
  }));
}

/**
 * Create a new system.
 */
export function createSystem(name: string): System {
  const registry = readRegistry();
  const system: System = {
    id: randomUUID(),
    name,
    createdAt: new Date().toISOString(),
  };
  registry.systems.push(system);
  writeRegistry(registry);
  return system;
}

/**
 * Delete a system. Only allowed if the system has no projects.
 */
export function deleteSystem(id: string): void {
  const registry = readRegistry();
  const projectCount = registry.projects.filter((p) => p.systemId === id).length;
  if (projectCount > 0) {
    throw new Error(`Cannot delete system: still has ${projectCount} project(s) associated`);
  }
  const idx = registry.systems.findIndex((s) => s.id === id);
  if (idx === -1) {
    throw new Error(`System not found: ${id}`);
  }
  registry.systems.splice(idx, 1);
  writeRegistry(registry);
}

/**
 * Get the default system id (first system, or create one if none exist).
 */
export function getDefaultSystemId(): string {
  const registry = readRegistry();
  ensureDefaultSystem(registry);
  return registry.systems[0]?.id || '';
}

/**
 * Register a project path in the global registry.
 * Called by `codegraph init`.
 * If systemId is not provided, uses the default system.
 * If the path already exists, updates its systemId (preserves existing UUID).
 */
export function registerProject(projectPath: string, systemId?: string): void {
  const resolved = path.resolve(projectPath);
  const registry = readRegistry();
  const targetSystemId = systemId || getDefaultSystemId();

  const existing = registry.projects.find((p) => p.path === resolved);
  if (existing) {
    existing.systemId = targetSystemId;
  } else {
    registry.projects.push({ id: randomUUID(), path: resolved, systemId: targetSystemId });
  }
  writeRegistry(registry);
}

/**
 * Unregister a project path from the global registry.
 * Called by `codegraph uninit`.
 */
export function unregisterProject(projectPath: string): void {
  const resolved = path.resolve(projectPath);
  const registry = readRegistry();
  const idx = registry.projects.findIndex((p) => p.path === resolved);
  if (idx !== -1) {
    registry.projects.splice(idx, 1);
    writeRegistry(registry);
  }
}

/**
 * Get the systemId for a registered project path.
 * Returns null if the project is not registered.
 */
export function getProjectSystemId(projectPath: string): string | null {
  const resolved = path.resolve(projectPath);
  const registry = readRegistry();
  const entry = registry.projects.find((p) => p.path === resolved);
  return entry ? entry.systemId : null;
}

/**
 * Get registered project paths.
 * If systemId is provided, returns only paths belonging to that system.
 * If not provided, returns all paths (backward compatible — returns string[]).
 */
export function getRegisteredProjects(systemId?: string): string[] {
  const registry = readRegistry();
  if (systemId) {
    return registry.projects.filter((p) => p.systemId === systemId).map((p) => p.path);
  }
  return registry.projects.map((p) => p.path);
}

/**
 * Lookup a project path by its UUID.
 * Returns null if the UUID is not found.
 */
export function getProjectPathById(id: string): string | null {
  const registry = readRegistry();
  const entry = registry.projects.find((p) => p.id === id);
  return entry ? entry.path : null;
}

/**
 * Lookup a project UUID by its path.
 * Returns null if the path is not registered.
 */
export function getProjectIdByPath(projectPath: string): string | null {
  const resolved = path.resolve(projectPath);
  const registry = readRegistry();
  const entry = registry.projects.find((p) => p.path === resolved);
  return entry ? entry.id : null;
}
