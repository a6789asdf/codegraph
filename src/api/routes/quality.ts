/**
 * Code Quality Routes
 *
 * Endpoints for circular dependency detection, dead code analysis,
 * file dependency graphs, and node metrics.
 */

import { Hono } from 'hono';
import CodeGraph from '../../index';
import { projectResolver, ok } from '../middleware';

export const qualityRoutes = new Hono();

/**
 * Find circular dependencies.
 */
qualityRoutes.get('/projects/:path/circular-deps', projectResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const cycles = instance.findCircularDependencies();
  return c.json(ok(cycles));
});

/**
 * Find dead code (unreferenced symbols).
 * Query params: kinds (comma-separated NodeKinds)
 */
qualityRoutes.get('/projects/:path/dead-code', projectResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const kindsStr = c.req.query('kinds');
  const kinds = kindsStr ? kindsStr.split(',') as any[] : undefined;

  const deadCode = instance.findDeadCode(kinds);
  return c.json(ok(deadCode));
});

/**
 * Get file dependencies (what this file depends on).
 */
qualityRoutes.get('/projects/:path/file-deps/:filePath', projectResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const filePath = decodeURIComponent(c.req.param('filePath')!);

  const deps = instance.getFileDependencies(filePath);
  return c.json(ok(deps));
});

/**
 * Get file dependents (what depends on this file).
 */
qualityRoutes.get('/projects/:path/file-dependents/:filePath', projectResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const filePath = decodeURIComponent(c.req.param('filePath')!);

  const dependents = instance.getFileDependents(filePath);
  return c.json(ok(dependents));
});

/**
 * Get node metrics.
 */
qualityRoutes.get('/projects/:path/metrics/:nodeId', projectResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const nodeId = c.req.param('nodeId')!;

  const node = instance.getNode(nodeId);
  if (!node) {
    return c.json({ ok: false, error: `Node not found: ${nodeId}` }, 404);
  }

  const metrics = instance.getNodeMetrics(nodeId);
  return c.json(ok({ node, metrics }));
});
