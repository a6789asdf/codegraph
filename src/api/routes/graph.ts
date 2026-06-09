/**
 * Graph Traversal Routes
 *
 * Endpoints for callers, callees, impact analysis,
 * graph traversal, and shortest path.
 */

import { Hono } from 'hono';
import CodeGraph from '../../index';
import { projectIdResolver, ok } from '../middleware';

export const graphRoutes = new Hono();

/**
 * Get callers of a function/method.
 * Query params: depth (default 1)
 */
graphRoutes.get('/projects/:id/callers/:nodeId', projectIdResolver(), async (c) => {
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
graphRoutes.get('/projects/:id/callees/:nodeId', projectIdResolver(), async (c) => {
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
graphRoutes.get('/projects/:id/impact/:nodeId', projectIdResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const nodeId = c.req.param('nodeId')!;
  const depth = parseInt(c.req.query('depth') || '3', 10);

  const node = instance.getNode(nodeId);
  if (!node) {
    return c.json({ ok: false, error: `Node not found: ${nodeId}` }, 404);
  }

  const impact = instance.getImpactRadius(nodeId, depth);
  const serialized = {
    nodes: Array.from(impact.nodes.values()),
    edges: impact.edges,
    roots: impact.roots,
  };
  return c.json(ok(serialized));
});

/**
 * Traverse the graph from a starting node.
 * Query params: direction (default 'both'), edgeKinds (comma-separated), maxDepth (default 3)
 */
graphRoutes.get('/projects/:id/traverse/:nodeId', projectIdResolver(), async (c) => {
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
  const serialized = {
    nodes: Array.from(subgraph.nodes.values()),
    edges: subgraph.edges,
    roots: subgraph.roots,
  };
  return c.json(ok(serialized));
});

/**
 * Find shortest path between two nodes.
 * Query params: from (required), to (required), edgeKinds (comma-separated)
 */
graphRoutes.get('/projects/:id/path', projectIdResolver(), async (c) => {
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
graphRoutes.get('/projects/:id/call-graph/:nodeId', projectIdResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const nodeId = c.req.param('nodeId')!;
  const depth = parseInt(c.req.query('depth') || '2', 10);

  const node = instance.getNode(nodeId);
  if (!node) {
    return c.json({ ok: false, error: `Node not found: ${nodeId}` }, 404);
  }

  const callGraph = instance.getCallGraph(nodeId, depth);
  const serialized = {
    nodes: Array.from(callGraph.nodes.values()),
    edges: callGraph.edges,
    roots: callGraph.roots,
  };
  return c.json(ok(serialized));
});

/**
 * Get type hierarchy for a class/interface.
 */
graphRoutes.get('/projects/:id/type-hierarchy/:nodeId', projectIdResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const nodeId = c.req.param('nodeId')!;

  const node = instance.getNode(nodeId);
  if (!node) {
    return c.json({ ok: false, error: `Node not found: ${nodeId}` }, 404);
  }

  const hierarchy = instance.getTypeHierarchy(nodeId);
  const serialized = {
    nodes: Array.from(hierarchy.nodes.values()),
    edges: hierarchy.edges,
    roots: hierarchy.roots,
  };
  return c.json(ok(serialized));
});
