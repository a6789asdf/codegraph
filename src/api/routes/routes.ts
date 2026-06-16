/**
 * Routes & Bridges Routes
 *
 * Endpoints for framework route manifests and
 * cross-language bridge relationships.
 */

import { Hono } from 'hono';
import CodeGraph from '../../index';
import { projectIdResolver, ok } from '../middleware';

export const routesRoutes = new Hono();

/**
 * Get routing manifest for the project.
 * Query params: limit (optional)
 */
routesRoutes.get('/projects/:id/routes', projectIdResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined;

  const manifest = instance.getRoutingManifest(limit);
  return c.json(ok(manifest));
});

/**
 * Get the primary route file (densest route concentration).
 */
routesRoutes.get('/projects/:id/top-route-file', projectIdResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const topRouteFile = instance.getTopRouteFile();
  return c.json(ok(topRouteFile));
});

/**
 * Get detected frameworks.
 */
routesRoutes.get('/projects/:id/frameworks', projectIdResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const frameworks = instance.getDetectedFrameworks();
  return c.json(ok(frameworks));
});
