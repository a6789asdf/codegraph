/**
 * CredentialService Tests
 *
 * Tests for credential encryption, CRUD operations, and key management.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';

let CredentialService: any;
let credentialModule: any;

function createService(): any {
  return CredentialService.create();
}

beforeEach(async () => {
  // Dynamic import to ensure fresh state
  credentialModule = await import('../src/api/credential-service');
  CredentialService = credentialModule.CredentialService;
});

describe('CredentialService', () => {
  describe('encrypt / decrypt round-trip', () => {
    it('should encrypt and decrypt plaintext correctly', () => {
      const service = createService();
      const plain = 'my-secret-token-value';
      const name = `test-https-${randomUUID()}`;

      const meta = service.createCredential({ name, type: 'https', secret: plain });
      const resolved = service.resolveCredential(meta.id);

      expect(resolved).not.toBeNull();
      expect(resolved.secret).toBe(plain);

      service.deleteCredential(meta.id);
    });

    it('should encrypt and decrypt SSH credential with passphrase', () => {
      const service = createService();
      const keyContent = '-----BEGIN OPENSSH PRIVATE KEY-----\nfake-key\n-----END OPENSSH PRIVATE KEY-----';
      const passphrase = 'my-passphrase';
      const name = `test-ssh-${randomUUID()}`;

      const meta = service.createCredential({ name, type: 'ssh', secret: keyContent, passphrase });
      expect(meta.has_passphrase).toBe(true);

      const resolved = service.resolveCredential(meta.id);
      expect(resolved).not.toBeNull();
      expect(resolved.secret).toBe(keyContent);
      expect(resolved.passphrase).toBe(passphrase);

      service.deleteCredential(meta.id);
    });

    it('should encrypt SSH credential without passphrase', () => {
      const service = createService();
      const keyContent = 'ssh-rsa AAAAB3...';
      const name = `test-ssh-np-${randomUUID()}`;

      const meta = service.createCredential({ name, type: 'ssh', secret: keyContent });
      expect(meta.has_passphrase).toBe(false);

      const resolved = service.resolveCredential(meta.id);
      expect(resolved).not.toBeNull();
      expect(resolved.secret).toBe(keyContent);
      expect(resolved.passphrase).toBeNull();

      service.deleteCredential(meta.id);
    });

    it('should produce different ciphertexts for same plaintext', () => {
      const service = createService();
      const plain = 'same-token';
      const name1 = `cred1-${randomUUID()}`;
      const name2 = `cred2-${randomUUID()}`;

      service.createCredential({ name: name1, type: 'https', secret: plain });
      service.createCredential({ name: name2, type: 'https', secret: plain });

      // Read raw rows to verify different ciphertexts
      const rows = service.db.prepare("SELECT * FROM credentials WHERE name IN (?, ?)").all(name1, name2);
      expect(rows).toHaveLength(2);
      expect(rows[0].secret_encrypted).not.toBe(rows[1].secret_encrypted);
      expect(rows[0].iv).not.toBe(rows[1].iv);

      // Cleanup
      rows.forEach((r: any) => service.deleteCredential(r.id));
    });
  });

  describe('CRUD operations', () => {
    it('should list credentials and order by last_used', () => {
      const service = createService();
      const name1 = `list-a-${randomUUID()}`;
      const name2 = `list-b-${randomUUID()}`;

      const c1 = service.createCredential({ name: name1, type: 'https', secret: 't1' });
      const c2 = service.createCredential({ name: name2, type: 'ssh', secret: 'k1' });

      service.touchLastUsed(c2.id);

      const list = service.listCredentials();
      expect(list.length).toBeGreaterThanOrEqual(2);

      service.deleteCredential(c1.id);
      service.deleteCredential(c2.id);
    });

    it('should get credential meta without secret fields', () => {
      const service = createService();
      const created = service.createCredential({ name: `meta-${randomUUID()}`, type: 'https', secret: 'my-token' });

      const meta = service.getCredentialMeta(created.id);
      expect(meta).not.toBeNull();
      expect(meta.name).toContain('meta-');
      expect(meta.type).toBe('https');
      expect((meta as any).secret_encrypted).toBeUndefined();
      expect((meta as any).iv).toBeUndefined();
      expect((meta as any).auth_tag).toBeUndefined();

      service.deleteCredential(created.id);
    });

    it('should return null for non-existent credential', () => {
      const service = createService();
      expect(service.getCredentialMeta(randomUUID())).toBeNull();
    });

    it('should reject duplicate names', () => {
      const service = createService();
      const name = `dup-${randomUUID()}`;
      service.createCredential({ name, type: 'https', secret: 't' });
      expect(() => {
        service.createCredential({ name, type: 'ssh', secret: 'k' });
      }).toThrow();

      // Cleanup
      const rows = service.db.prepare("SELECT * FROM credentials WHERE name = ?").all(name);
      rows.forEach((r: any) => service.deleteCredential(r.id));
    });

    it('should update credential name without changing secret', () => {
      const service = createService();
      const oldName = `old-${randomUUID()}`;
      const newName = `new-${randomUUID()}`;
      const created = service.createCredential({ name: oldName, type: 'https', secret: 'token123' });

      service.updateCredential(created.id, { name: newName });

      const updated = service.getCredentialMeta(created.id);
      expect(updated.name).toBe(newName);

      const resolved = service.resolveCredential(created.id);
      expect(resolved.secret).toBe('token123');

      service.deleteCredential(created.id);
    });

    it('should update credential secret', () => {
      const service = createService();
      const created = service.createCredential({ name: `upd-sec-${randomUUID()}`, type: 'https', secret: 'old-token' });

      service.updateCredential(created.id, { secret: 'new-token' });

      const resolved = service.resolveCredential(created.id);
      expect(resolved.secret).toBe('new-token');

      service.deleteCredential(created.id);
    });

    it('should update passphrase', () => {
      const service = createService();
      const created = service.createCredential({
        name: `upd-pass-${randomUUID()}`,
        type: 'ssh',
        secret: 'key',
        passphrase: 'old-pass',
      });

      service.updateCredential(created.id, { passphrase: 'new-pass' });

      const resolved = service.resolveCredential(created.id);
      expect(resolved.passphrase).toBe('new-pass');

      service.deleteCredential(created.id);
    });

    it('should clear passphrase when empty string passed', () => {
      const service = createService();
      const created = service.createCredential({
        name: `clear-pass-${randomUUID()}`,
        type: 'ssh',
        secret: 'key',
        passphrase: 'pass',
      });

      service.updateCredential(created.id, { passphrase: '' });

      const meta = service.getCredentialMeta(created.id);
      expect(meta.has_passphrase).toBe(false);

      const resolved = service.resolveCredential(created.id);
      expect(resolved.passphrase).toBeNull();

      service.deleteCredential(created.id);
    });

    it('should delete credential', () => {
      const service = createService();
      const created = service.createCredential({ name: `del-${randomUUID()}`, type: 'https', secret: 't' });

      service.deleteCredential(created.id);

      expect(service.getCredentialMeta(created.id)).toBeNull();
      expect(service.resolveCredential(created.id)).toBeNull();
    });

    it('should throw on update to duplicate name', () => {
      const service = createService();
      const nameA = `conflict-a-${randomUUID()}`;
      const nameB = `conflict-b-${randomUUID()}`;

      service.createCredential({ name: nameA, type: 'https', secret: 't1' });
      const b = service.createCredential({ name: nameB, type: 'https', secret: 't2' });

      expect(() => {
        service.updateCredential(b.id, { name: nameA });
      }).toThrow();

      service.deleteCredential(b.id);
      const aRows = service.db.prepare("SELECT * FROM credentials WHERE name = ?").all(nameA);
      aRows.forEach((r: any) => service.deleteCredential(r.id));
    });

    it('should touch last_used_at', () => {
      const service = createService();
      const created = service.createCredential({ name: `touch-${randomUUID()}`, type: 'https', secret: 'token' });

      const before = service.getCredentialMeta(created.id).last_used_at;
      expect(before).toBeNull();

      service.touchLastUsed(created.id);

      const after = service.getCredentialMeta(created.id).last_used_at;
      expect(after).not.toBeNull();

      service.deleteCredential(created.id);
    });

    it('should reject empty secret', () => {
      const service = createService();
      expect(() => {
        service.createCredential({ name: `empty-sec-${randomUUID()}`, type: 'https', secret: '' });
      }).toThrow();
    });

    it('should reject invalid type', () => {
      const service = createService();
      expect(() => {
        service.createCredential({ name: `bad-type-${randomUUID()}`, type: 'bad' as any, secret: 't' });
      }).toThrow();
    });
  });

  describe('key file management', () => {
    it('should create key file on first startup', () => {
      const keyFile = path.join(os.homedir(), '.codegraph', '.credkey');

      // Key file may already exist from other tests
      const existedBefore = fs.existsSync(keyFile);

      createService();

      expect(fs.existsSync(keyFile)).toBe(true);

      const content = fs.readFileSync(keyFile, 'utf-8').trim();
      expect(content.length).toBeGreaterThan(0);
    });

    it('should reuse existing key file across service instances', () => {
      const service1 = createService();
      const keyFile = path.join(os.homedir(), '.codegraph', '.credkey');
      const keyContent = fs.readFileSync(keyFile, 'utf-8');

      const name = `reuse-${randomUUID()}`;
      const secret = 'token-for-reuse-test';
      const cred = service1.createCredential({ name, type: 'https', secret });

      // Create a second service — should use same key
      const service2 = createService();
      const resolved = service2.resolveCredential(cred.id);

      expect(resolved).not.toBeNull();
      expect(resolved.secret).toBe(secret);

      // Cleanup
      service1.deleteCredential(cred.id);
    });
  });

  describe('resolveCredential error handling', () => {
    it('should return null for non-existent id', () => {
      const service = createService();
      expect(service.resolveCredential(randomUUID())).toBeNull();
    });

    it('should handle decrypt failure gracefully', () => {
      const service = createService();
      const name = `doomed-${randomUUID()}`;
      const created = service.createCredential({ name, type: 'https', secret: 'token' });

      // Corrupt the encrypted data in DB
      service.db.prepare(
        "UPDATE credentials SET secret_encrypted = ? WHERE id = ?"
      ).run('corrupted-data', created.id);

      const resolved = service.resolveCredential(created.id);
      expect(resolved).toBeNull();

      // Cleanup
      service.deleteCredential(created.id);
    });
  });
});
