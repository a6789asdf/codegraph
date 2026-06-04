/**
 * Graph Traversal Routes
 *
 * Endpoints for callers, callees, impact analysis,
 * graph traversal, and shortest path.
 */

import { Hono } from 'hono';
import CodeGraph from '../../index';
import { projectResolver, ok } from '../middleware';

export const graphRoutes = new Hono();

/**
 * Get callers of a function/method.
 * Query params: depth (default 1)
 */
graphRoutes.get('/projects/:path/callers/:nodeId', projectResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const nodeId = c.req.param('nodeId')!;
  const depth = parseInt(c.req.query('depth') || '1', 10);

  const node = instance.getNode(nodeId);
  if (!node) {
    return c.json({ ok: false, error: `Node not found: ${nodeId}` }, 404);
  }

  const callers = instance.getCallers(nodeId, depth);
  return c.json(ok(callers));
});

/**
 * Get callees of a function/method.
 * Query params: depth (default 1)
 */
graphRoutes.get('/projects/:path/callees/:nodeId', projectResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const nodeId = c.req.param('nodeId')!;
  const depth = parseInt(c.req.query('depth') || '1', 10);

  const node = instance.getNode(nodeId);
  if (!node) {
    return c.json({ ok: false, error: `Node not found: ${nodeId}` }, 404);
  }

  const callees = instance.getCallees(nodeId, depth);
  return c.json(ok(callees));
});

/**
 * Get impact radius of a node.
 * Query params: depth (default 3)
 */
graphRoutes.get('/projects/:path/impact/:nodeId', projectResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const nodeId = c.req.param('nodeId')!;
  const depth = parseInt(c.req.query('depth') || '3', 10);

  const node = instance.getNode(nodeId);
  if (!node) {
    return c.json({ ok: false, error: `Node not found: ${nodeId}` }, 404);
  }

  const impact = instance.getImpactRadius(nodeId, depth);
  return c.json(ok(impact));
});

/**
 * Traverse the graph from a starting node.
 * Query params: direction (default 'both'), edgeKinds (comma-separated), maxDepth (default 3)
 */
graphRoutes.get('/projects/:path/traverse/:nodeId', projectResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const nodeId = c.req.param('nodeId')!;
  const direction = c.req.query('direction') || 'both';
  const edgeKindsStr = c.req.query('edgeKinds');
  const maxDepth = parseInt(c.req.query('maxDepth') || '3', 10);

  const node = instance.getNode(nodeId);
  if (!node) {
    return c.json({ ok: false, error: `Node not found: ${nodeId}` }, 404);
  }

  const edgeKinds = edgeKindsStr ? edgeKindsStr.split(',') as any[] : undefined;
  const subgraph = instance.traverse(nodeId, { direction: direction as any, edgeKinds, maxDepth });
  return c.json(ok(subgraph));
});

/**
 * Find shortest path between two nodes.
 * Query params: from (required), to (required), edgeKinds (comma-separated)
 */
graphRoutes.get('/projects/:path/path', projectResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const fromId = c.req.query('from');
  const toId = c.req.query('to');
  const edgeKindsStr = c.req.query('edgeKinds');

  if (!fromId || !toId) {
    return c.json({ ok: false, error: 'Both "from" and "to" query parameters are required' }, 400);
  }

  const edgeKinds = edgeKindsStr ? edgeKindsStr.split(',') as any[] : undefined;
  const pathResult = instance.findPath(fromId, toId, edgeKinds);

  if (!pathResult) {
    return c.json(ok(null));
  }

  return c.json(ok(pathResult));
});

/**
 * Get call graph for a function/method.
 * Query params: depth (default 2)
 */
graphRoutes.get('/projects/:path/call-graph/:nodeId', projectResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const nodeId = c.req.param('nodeId')!;
  const depth = parseInt(c.req.query('depth') || '2', 10);

  const node = instance.getNode(nodeId);
  if (!node) {
    return c.json({ ok: false, error: `Node not found: ${nodeId}` }, 404);
  }

  const callGraph = instance.getCallGraph(nodeId, depth);
  return c.json(ok(callGraph));
});

/**
 * Get type hierarchy for a class/interface.
 */
graphRoutes.get('/projects/:path/type-hierarchy/:nodeId', projectResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const nodeId = c.req.param('nodeId')!;

  const node = instance.getNode(nodeId);
  if (!node) {
    return c.json({ ok: false, error: `Node not found: ${nodeId}` }, 404);
  }

  const hierarchy = instance.getTypeHierarchy(nodeId);
  return c.json(ok(hierarchy));
});
