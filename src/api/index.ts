/**
 * CodeGraph HTTP API Server
 *
 * Hono-based REST API that wraps the CodeGraph programmatic API
 * for consumption by the web frontend.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import * as path from 'path';
import CodeGraph from '../index';
import { projectRoutes } from './routes/projects';
import { searchRoutes } from './routes/search';
import { graphRoutes } from './routes/graph';
import { routesRoutes } from './routes/routes';
import { qualityRoutes } from './routes/quality';
import { analysisRoutes } from './routes/analysis';
import { architectureRoutes } from './routes/architecture';
import { flowsRoutes } from './routes/flows';
import { reviewRoutes } from './routes/review';
import { refactorRoutes } from './routes/refactor';
import { wikiRoutes } from './routes/wiki';
import { errorHandler } from './middleware';

export interface ApiServerOptions {
  port?: number;
  dev?: boolean;
  staticDir?: string;
}

/**
 * Create and configure the Hono API application.
 */
export function createApiApp(options: ApiServerOptions = {}) {
  const app = new Hono();

  // Global middleware
  app.use('*', cors());
  app.use('*', logger());
  app.use('*', errorHandler());

  // Health check
  app.get('/api/health', (c) => c.json({ ok: true, data: { status: 'running' } }));

  // Mount route groups
  app.route('/api', projectRoutes);
  app.route('/api', searchRoutes);
  app.route('/api', graphRoutes);
  app.route('/api', routesRoutes);
  app.route('/api', qualityRoutes);
  app.route('/api', analysisRoutes);
  app.route('/api', architectureRoutes);
  app.route('/api', flowsRoutes);
  app.route('/api', reviewRoutes);
  app.route('/api', refactorRoutes);
  app.route('/api', wikiRoutes);

  // Serve frontend static files in production mode
  if (!options.dev && options.staticDir) {
    app.use('/*', serveStatic({ root: options.staticDir }));
    // SPA fallback: serve index.html for non-API routes
    app.get('*', async (c) => {
      const fs = await import('fs');
      const indexPath = path.join(options.staticDir!, 'index.html');
      const html = fs.readFileSync(indexPath, 'utf-8');
      return c.html(html);
    });
  }

  return app;
}

/**
 * Start the API server.
 */
export function startApiServer(options: ApiServerOptions = {}) {
  const port = options.port || parseInt(process.env.CODEGRAPH_API_PORT || '3000', 10);
  const app = createApiApp(options);

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`CodeGraph API server running on http://localhost:${info.port}`);
    if (!options.dev) {
      console.log(`Frontend available at http://localhost:${info.port}`);
    }
  });

  return port;
}

// Re-export for route handlers that need CodeGraph instances
export { CodeGraph };
