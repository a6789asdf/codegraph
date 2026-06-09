/**
 * Search & Query Routes
 *
 * Endpoints for symbol search, node details, and file listing.
 */

import { Hono } from 'hono';
import CodeGraph from '../../index';
import { projectIdResolver, ok } from '../middleware';

export const searchRoutes = new Hono();

/**
 * Search symbols by name.
 * Query params: q (required), kind (optional), limit (optional)
 */
searchRoutes.get('/projects/:id/search', projectIdResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const q = c.req.query('q');
  const kindStr = c.req.query('kind');
  const limit = parseInt(c.req.query('limit') || '50', 10);

  if (!q) {
    return c.json({ ok: false, error: 'Query parameter "q" is required' }, 400);
  }

  const results = instance.searchNodes(q, {
    kinds: kindStr ? [kindStr as any] : undefined,
    limit,
  });

  return c.json(ok(results));
});

/**
 * Get node detail by ID, optionally including source code.
 */
searchRoutes.get('/projects/:id/nodes/:id', projectIdResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const nodeId = c.req.param('id')!;
  const includeCode = c.req.query('includeCode') !== 'false';

  const node = instance.getNode(nodeId);
  if (!node) {
    return c.json({ ok: false, error: `Node not found: ${nodeId}` }, 404);
  }

  let code: string | null = null;
  if (includeCode) {
    code = await instance.getCode(nodeId);
  }

  return c.json(ok({ node, code }));
});

/**
 * Get full context for a node (ancestors, children, references).
 */
searchRoutes.get('/projects/:id/nodes/:id/context', projectIdResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const nodeId = c.req.param('id')!;

  const node = instance.getNode(nodeId);
  if (!node) {
    return c.json({ ok: false, error: `Node not found: ${nodeId}` }, 404);
  }

  const context = instance.getContext(nodeId);
  return c.json(ok(context));
});

/**
 * Get all tracked files.
 */
searchRoutes.get('/projects/:id/files', projectIdResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const files = instance.getFiles();
  return c.json(ok(files));
});
