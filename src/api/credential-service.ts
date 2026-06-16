/**
 * CredentialService
 *
 * 管理 Git 凭证的加密持久化、CRUD 和明文解析。
 * 使用 AES-256-GCM 加密，密钥存储在 ~/.codegraph/.credkey。
 * 与 TaskManager 共用 ~/.codegraph-tasks.db。
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { getSharedDb } from './shared-db';

export type CredentialType = 'https' | 'ssh';

export interface CredentialMeta {
  id: string;
  name: string;
  type: CredentialType;
  username: string | null;
  has_passphrase: boolean;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
}

export interface CreateCredentialSpec {
  name: string;
  type: CredentialType;
  username?: string;
  secret: string;
  passphrase?: string;
}

export interface DecryptedCredential {
  id: string;
  name: string;
  type: CredentialType;
  username: string | null;
  secret: string;
  passphrase: string | null;
}

const KEY_FILE = path.join(os.homedir(), '.codegraph', '.credkey');
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

function nowISO(): string {
  return new Date().toISOString();
}

function rowToMeta(row: any): CredentialMeta {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    username: row.username || null,
    has_passphrase: !!row.passphrase_encrypted,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_used_at: row.last_used_at || null,
  };
}

export class CredentialService {
  private db: any;
  private key: Buffer;

  private constructor(db: any, key: Buffer) {
    this.db = db;
    this.key = key;
  }

  static create(): CredentialService {
    const db = getSharedDb();
    const key = loadOrCreateKey();
    return new CredentialService(db, key);
  }

  listCredentials(): CredentialMeta[] {
    const rows = this.db.prepare(
      'SELECT * FROM credentials ORDER BY last_used_at DESC, created_at DESC'
    ).all();
    return rows.map(rowToMeta);
  }

  getCredentialMeta(id: string): CredentialMeta | null {
    const row = this.db.prepare('SELECT * FROM credentials WHERE id = ?').get(id);
    return row ? rowToMeta(row) : null;
  }

  createCredential(spec: CreateCredentialSpec): CredentialMeta {
    const id = randomUUID();
    const now = nowISO();

    if (spec.type !== 'https' && spec.type !== 'ssh') {
      throw new Error('凭证类型必须是 https 或 ssh');
    }
    if (!spec.secret) {
      throw new Error('secret 不能为空');
    }

    const { ciphertext, iv, authTag } = this.encrypt(spec.secret);

    let passEnc: string | null = null;
    let passIv: string | null = null;
    let passTag: string | null = null;

    if (spec.passphrase) {
      const enc = this.encrypt(spec.passphrase);
      passEnc = enc.ciphertext;
      passIv = enc.iv;
      passTag = enc.authTag;
    }

    this.db.prepare(
      `INSERT INTO credentials (id, name, type, username, secret_encrypted, iv, auth_tag,
        passphrase_encrypted, passphrase_iv, passphrase_auth_tag, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, spec.name, spec.type, spec.username || null,
      ciphertext, iv, authTag,
      passEnc, passIv, passTag,
      now, now
    );

    return this.getCredentialMeta(id)!;
  }

  updateCredential(id: string, patch: Partial<CreateCredentialSpec>): CredentialMeta {
    const now = nowISO();
    const existing = this.db.prepare('SELECT * FROM credentials WHERE id = ?').get(id);
    if (!existing) {
      throw new Error('凭证不存在');
    }

    const name = patch.name !== undefined ? patch.name : existing.name;
    const type = patch.type !== undefined ? patch.type : existing.type;
    const username = patch.username !== undefined ? patch.username : existing.username;

    let ciphertext = existing.secret_encrypted;
    let iv = existing.iv;
    let authTag = existing.auth_tag;

    if (patch.secret) {
      const enc = this.encrypt(patch.secret);
      ciphertext = enc.ciphertext;
      iv = enc.iv;
      authTag = enc.authTag;
    }

    let passEnc = existing.passphrase_encrypted;
    let passIv = existing.passphrase_iv;
    let passTag = existing.passphrase_auth_tag;

    if (patch.passphrase !== undefined) {
      if (patch.passphrase) {
        const enc = this.encrypt(patch.passphrase);
        passEnc = enc.ciphertext;
        passIv = enc.iv;
        passTag = enc.authTag;
      } else {
        passEnc = null;
        passIv = null;
        passTag = null;
      }
    }

    this.db.prepare(
      `UPDATE credentials SET name = ?, type = ?, username = ?,
        secret_encrypted = ?, iv = ?, auth_tag = ?,
        passphrase_encrypted = ?, passphrase_iv = ?, passphrase_auth_tag = ?,
        updated_at = ?
       WHERE id = ?`
    ).run(
      name, type, username || null,
      ciphertext, iv, authTag,
      passEnc, passIv, passTag,
      now, id
    );

    return this.getCredentialMeta(id)!;
  }

  deleteCredential(id: string): void {
    this.db.prepare('DELETE FROM credentials WHERE id = ?').run(id);
  }

  resolveCredential(id: string): DecryptedCredential | null {
    const row = this.db.prepare('SELECT * FROM credentials WHERE id = ?').get(id);
    if (!row) return null;

    try {
      const secret = this.decrypt(row.secret_encrypted, row.iv, row.auth_tag);

      let passphrase: string | null = null;
      if (row.passphrase_encrypted && row.passphrase_iv && row.passphrase_auth_tag) {
        passphrase = this.decrypt(
          row.passphrase_encrypted, row.passphrase_iv, row.passphrase_auth_tag
        );
      }

      return {
        id: row.id,
        name: row.name,
        type: row.type,
        username: row.username || null,
        secret,
        passphrase,
      };
    } catch {
      return null;
    }
  }

  touchLastUsed(id: string): void {
    const now = nowISO();
    this.db.prepare(
      'UPDATE credentials SET last_used_at = ? WHERE id = ?'
    ).run(now, id);
  }

  private encrypt(plaintext: string): { ciphertext: string; iv: string; authTag: string } {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag().toString('base64');

    return {
      ciphertext: encrypted,
      iv: iv.toString('base64'),
      authTag,
    };
  }

  private decrypt(ciphertext: string, iv: string, authTag: string): string {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      this.key,
      Buffer.from(iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));

    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}

function loadOrCreateKey(): Buffer {
  const dir = path.dirname(KEY_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(KEY_FILE)) {
    const base64 = fs.readFileSync(KEY_FILE, 'utf-8').trim();
    if (base64) {
      const buf = Buffer.from(base64, 'base64');
      if (buf.length === KEY_LENGTH) {
        return buf;
      }
    }
    throw new Error('密钥文件已损坏');
  }

  const newKey = crypto.randomBytes(KEY_LENGTH);
  fs.writeFileSync(KEY_FILE, newKey.toString('base64'), { mode: 0o600 });
  return newKey;
}
