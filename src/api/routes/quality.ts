/**
 * Code Quality Routes
 *
 * Endpoints for circular dependency detection, dead code analysis,
 * file dependency graphs, and node metrics.
 */

import { Hono } from 'hono';
import CodeGraph from '../../index';
import { projectIdResolver, ok } from '../middleware';

export const qualityRoutes = new Hono();

/**
 * Find circular dependencies.
 */
qualityRoutes.get('/projects/:id/circular-deps', projectIdResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const cycles = instance.findCircularDependencies();
  return c.json(ok(cycles));
});

/**
 * Find dead code (unreferenced symbols).
 * Query params: kinds (comma-separated NodeKinds)
 */
qualityRoutes.get('/projects/:id/dead-code', projectIdResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const kindsStr = c.req.query('kinds');
  const kinds = kindsStr ? kindsStr.split(',') as any[] : undefined;

  const deadCode = instance.findDeadCode(kinds);
  return c.json(ok(deadCode));
});

/**
 * Get file dependencies (what this file depends on).
 */
qualityRoutes.get('/projects/:id/file-deps/:filePath', projectIdResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const filePath = decodeURIComponent(c.req.param('filePath')!);

  const deps = instance.getFileDependencies(filePath);
  return c.json(ok(deps));
});

/**
 * Get file dependents (what depends on this file).
 */
qualityRoutes.get('/projects/:id/file-dependents/:filePath', projectIdResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const filePath = decodeURIComponent(c.req.param('filePath')!);

  const dependents = instance.getFileDependents(filePath);
  return c.json(ok(dependents));
});

/**
 * Get node metrics.
 */
qualityRoutes.get('/projects/:id/metrics/:nodeId', projectIdResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const nodeId = c.req.param('nodeId')!;

  const node = instance.getNode(nodeId);
  if (!node) {
    return c.json({ ok: false, error: `Node not found: ${nodeId}` }, 404);
  }

  const metrics = instance.getNodeMetrics(nodeId);
  return c.json(ok({ node, metrics }));
});
