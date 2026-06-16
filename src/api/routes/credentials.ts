/**
 * Credential Routes
 *
 * HTTP endpoints for managing Git credentials (HTTPS Token / SSH Key).
 * All endpoints return metadata only — never plaintext or ciphertext.
 */

import { Hono } from 'hono';
import { ok } from '../middleware';
import { credentialService } from '../credential-shared';

const NAME_RE = /^.{1,50}$/;

export const credentialRoutes = new Hono();

credentialRoutes.get('/credentials', async (c) => {
  return c.json(ok(credentialService.listCredentials()));
});

credentialRoutes.post('/credentials', async (c) => {
  const body = await c.req.json();
  if (!body.name || !NAME_RE.test(body.name)) {
    return c.json({ ok: false, error: '凭证名称格式不正确（1-50字符）' }, 400);
  }
  if (body.type !== 'https' && body.type !== 'ssh') {
    return c.json({ ok: false, error: '凭证类型必须是 https 或 ssh' }, 400);
  }
  if (!body.secret) {
    return c.json({ ok: false, error: 'secret 不能为空' }, 400);
  }
  try {
    const cred = credentialService.createCredential(body);
    return c.json(ok(cred), 201);
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE')) {
      return c.json({ ok: false, error: '凭证名称已存在' }, 409);
    }
    return c.json({ ok: false, error: err.message }, 500);
  }
});

credentialRoutes.put('/credentials/:id', async (c) => {
  const id = c.req.param('id');
  if (!credentialService.getCredentialMeta(id)) {
    return c.json({ ok: false, error: '凭证不存在' }, 404);
  }
  const body = await c.req.json();
  try {
    const cred = credentialService.updateCredential(id, body);
    return c.json(ok(cred));
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE')) {
      return c.json({ ok: false, error: '凭证名称已存在' }, 409);
    }
    return c.json({ ok: false, error: err.message }, 500);
  }
});

credentialRoutes.delete('/credentials/:id', async (c) => {
  const id = c.req.param('id');
  if (!credentialService.getCredentialMeta(id)) {
    return c.json({ ok: false, error: '凭证不存在' }, 404);
  }
  credentialService.deleteCredential(id);
  return c.json(ok({ deleted: true }));
});
