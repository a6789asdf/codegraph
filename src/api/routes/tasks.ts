/**
 * Task Routes
 *
 * HTTP endpoints for querying and managing project setup tasks.
 */

import { Hono } from 'hono';
import { ok } from '../middleware';
import { taskManager } from '../task-manager-shared';

export const taskRoutes = new Hono();

taskRoutes.get('/projects/tasks', async (c) => {
  const status = c.req.query('status') as string | undefined;
  const systemId = c.req.query('systemId') as string | undefined;
  const filter: { status?: string; systemId?: string } = {};
  if (status) filter.status = status;
  if (systemId) filter.systemId = systemId;
  const tasks = taskManager.listTasks(Object.keys(filter).length > 0 ? filter : undefined);
  return c.json(ok(tasks));
});

taskRoutes.get('/projects/tasks/:id', async (c) => {
  const id = c.req.param('id');
  const task = taskManager.getTask(id);
  if (!task) {
    return c.json({ ok: false, error: 'Task not found' }, 404);
  }
  return c.json(ok(task));
});

taskRoutes.post('/projects/tasks/:id/retry', async (c) => {
  const id = c.req.param('id');
  const task = taskManager.getTask(id);
  if (!task) {
    return c.json({ ok: false, error: 'Task not found' }, 404);
  }
  if (task.status !== 'failed') {
    return c.json({ ok: false, error: 'Only failed tasks can be retried' }, 400);
  }
  taskManager.retryTask(id);
  return c.json(ok({ taskId: id }));
});

taskRoutes.delete('/projects/tasks/:id', async (c) => {
  const id = c.req.param('id');
  const task = taskManager.getTask(id);
  if (!task) {
    return c.json({ ok: false, error: 'Task not found' }, 404);
  }
  taskManager.removeTask(id);
  return c.json(ok({ deleted: true }));
});
