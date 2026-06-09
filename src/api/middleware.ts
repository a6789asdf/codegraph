/**
 * API Middleware
 *
 * Shared middleware for error handling, project path resolution,
 * and CodeGraph instance management.
 */

import { Context, Next } from 'hono';
import CodeGraph from '../index';
import { getProjectPathById } from './registry';

// Extend Hono's context variable map so c.get/c.set are type-safe
declare module 'hono' {
  interface ContextVariableMap {
    codegraph: CodeGraph;
    projectPath: string;
  }
}

/**
 * Cache of open CodeGraph instances, keyed by project root path.
 * Reusing instances avoids repeated SQLite connection setup.
 */
const instanceCache = new Map<string, CodeGraph>();

/**
 * Get or create a CodeGraph instance for a project path.
 */
export async function getCodeGraphInstance(projectPath: string): Promise<CodeGraph> {
  const resolved = decodeURIComponent(projectPath);
  const cached = instanceCache.get(resolved);
  if (cached) return cached;

  const instance = await CodeGraph.open(resolved);
  instanceCache.set(resolved, instance);
  return instance;
}

/**
 * Close and remove a CodeGraph instance from cache.
 */
export function closeCodeGraphInstance(projectPath: string): void {
  const resolved = decodeURIComponent(projectPath);
  const instance = instanceCache.get(resolved);
  if (instance) {
    instance.close();
    instanceCache.delete(resolved);
  }
}

/**
 * Error handling middleware.
 */
export function errorHandler() {
  return async (c: Context, next: Next): Promise<Response | void> => {
    try {
      await next();
    } catch (err: any) {
      const status = err.status || 500;
      const message = err.message || 'Internal server error';
      return c.json({ ok: false, error: message }, status as 500);
    }
  };
}

/**
 * Project path resolver middleware.
 * Validates and resolves the `:path` parameter, then attaches
 * the CodeGraph instance to the context.
 */
export function projectResolver() {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const rawPath = c.req.param('path');
    if (!rawPath) {
      return c.json({ ok: false, error: 'Project path is required' }, 400);
    }

    const projectPath = decodeURIComponent(rawPath);

    try {
      const instance = await getCodeGraphInstance(projectPath);
      c.set('codegraph', instance);
      c.set('projectPath', projectPath);
      return await next();
    } catch (err: any) {
      return c.json({ ok: false, error: `Failed to open project: ${err.message}` }, 404);
    }
  };
}

/**
 * Project ID resolver middleware.
 * Resolves a project ID (UUID) or path to a CodeGraph instance.
 * Tries UUID lookup first, falls back to treating the parameter as a path.
 */
export function projectIdResolver() {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const id = c.req.param('id');
    if (!id) {
      return c.json({ ok: false, error: 'Project ID is required' }, 400);
    }

    const decoded = decodeURIComponent(id);
    const projectPath = getProjectPathById(decoded) || decoded;

    try {
      const instance = await getCodeGraphInstance(projectPath);
      c.set('codegraph', instance);
      c.set('projectPath', projectPath);
      return await next();
    } catch (err: any) {
      return c.json({ ok: false, error: `Failed to open project: ${err.message}` }, 404);
    }
  };
}

/**
 * JSON success response helper.
 */
export function ok<T>(data: T) {
  return { ok: true as const, data };
}

/**
 * JSON error response helper.
 */
export function fail(error: string, status: number = 400) {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
