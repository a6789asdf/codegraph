/**
 * System Management Routes
 *
 * Endpoints for listing, creating, and deleting systems.
 */

import { Hono } from 'hono';
import { ok } from '../middleware';
import { getSystems, createSystem, deleteSystem } from '../registry';

export const systemRoutes = new Hono();

const SYSTEM_NAME_RE = /^[a-zA-Z0-9_\-\u4e00-\u9fa5]{1,50}$/;

/**
 * List all systems.
 */
systemRoutes.get('/systems', async (c) => {
  const systems = getSystems();
  return c.json(ok(systems));
});

/**
 * Create a new system.
 */
systemRoutes.post('/systems', async (c) => {
  const body = await c.req.json();
  const { name } = body;

  if (!name || !SYSTEM_NAME_RE.test(name)) {
    return c.json({ ok: false, error: '系统名称格式不正确（1-50字符，仅允许中文、字母、数字、下划线、连字符）' }, 400);
  }

  const system = createSystem(name);
  return c.json(ok(system));
});

/**
 * Delete a system.
 */
systemRoutes.delete('/systems/:id', async (c) => {
  const id = c.req.param('id');

  try {
    deleteSystem(id);
    return c.json(ok({ deleted: true }));
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 400);
  }
});
