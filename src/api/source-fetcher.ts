/**
 * SourceFetcher
 *
 * 封装代码获取逻辑：git clone 和压缩包解压。
 * 与 TaskManager 解耦 —— 只负责"把代码放到指定目录"，
 * 不知道任务状态、进度追踪等上层概念。
 */

import { spawn, execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';
import type { DecryptedCredential } from './credential-service';

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.scala',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.swift', '.objc',
  '.php', '.lua', '.dart', '.vue', '.svelte',
]);

export interface FetchOptions {
  branch?: string;
  onProgress?: (pct: number) => void;
  credential?: DecryptedCredential;
}

/**
 * Clone a git repository.
 *
 * Uses `git clone --progress` and parses stderr for progress.
 * On failure, cleans up the target directory.
 *
 * If `options.credential` is provided:
 *   - HTTPS: uses GIT_ASKPASS temporary script for credentials
 *   - SSH:   uses GIT_SSH_COMMAND with temporary key file
 */
export async function cloneRepo(
  url: string,
  targetPath: string,
  options: FetchOptions = {},
): Promise<void> {
  const doClone = (env: Record<string, string | undefined>) =>
    new Promise<void>((resolve, reject) => {
      const args = ['clone', '--progress'];
      if (options.branch) {
        args.push('--branch', options.branch);
      }
      args.push(url, targetPath);

      const proc = spawn('git', args, { stdio: ['pipe', 'pipe', 'pipe'], env });

      let stderr = '';
      proc.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        const match = text.match(/Receiving objects:\s+(\d+)%/);
        if (match && match[1] && options.onProgress) {
          options.onProgress(parseInt(match[1], 10) / 100);
        }
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          try {
            if (fs.existsSync(targetPath)) {
              fs.rmSync(targetPath, { recursive: true, force: true });
            }
          } catch {
            // ignore cleanup errors
          }
          const summary = stderr.split('\n').filter(l => l.trim()).slice(-3).join('; ');
          reject(new Error(`Git clone 失败: ${summary}`));
        }
      });

      proc.on('error', (err) => {
        try {
          if (fs.existsSync(targetPath)) {
            fs.rmSync(targetPath, { recursive: true, force: true });
          }
        } catch {
          // ignore
        }
        reject(new Error(`Git clone 失败: ${err.message}`));
      });
    });

  if (!options.credential) {
    return doClone(process.env as Record<string, string | undefined>);
  }
  if (options.credential.type === 'https') {
    return withHttpsCredential(options.credential, doClone);
  }
  return withSshCredential(options.credential, doClone);
}

async function withHttpsCredential<T>(
  credential: DecryptedCredential,
  fn: (env: Record<string, string | undefined>) => Promise<T>,
): Promise<T> {
  const isWin = process.platform === 'win32';
  const uuid = randomUUID();
  const scriptPath = path.join(os.tmpdir(),
    isWin ? `codegraph-askpass-${uuid}.cmd` : `codegraph-askpass-${uuid}.sh`);

  const shellEsc = (s: string) => s.replace(/'/g, "'\\''");

  const script = isWin
    ? `@echo off\r\nif "%~1"=="" exit 0\r\necho %1 | findstr /i "Username" >nul && echo ${credential.username || 'token'}\r\necho %1 | findstr /i "Password" >nul && echo ${shellEsc(credential.secret)}\r\n`
    : `#!/bin/sh\ncase "$1" in\n  Username*) echo "${shellEsc(credential.username || 'token')}" ;;\n  Password*) echo "${shellEsc(credential.secret)}" ;;\nesac\n`;

  fs.writeFileSync(scriptPath, script);
  if (!isWin) {
    try { fs.chmodSync(scriptPath, 0o700); } catch { /* ignore */ }
  }

  try {
    return await fn({
      ...process.env,
      GIT_ASKPASS: scriptPath,
      GIT_TERMINAL_PROMPT: '0',
    });
  } finally {
    try { fs.unlinkSync(scriptPath); } catch { /* ignore */ }
  }
}

async function withSshCredential<T>(
  credential: DecryptedCredential,
  fn: (env: Record<string, string | undefined>) => Promise<T>,
): Promise<T> {
  const uuid = randomUUID();
  const keyPath = path.join(os.tmpdir(), `codegraph-ssh-${uuid}`);
  fs.writeFileSync(keyPath, credential.secret, { mode: 0o600 });

  let askPassPath: string | null = null;
  const env: Record<string, string | undefined> = {
    ...process.env,
    GIT_SSH_COMMAND: `ssh -i "${keyPath}" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o IdentitiesOnly=yes`,
    GIT_TERMINAL_PROMPT: '0',
  };

  if (credential.passphrase) {
    const isWin = process.platform === 'win32';
    askPassPath = path.join(os.tmpdir(),
      isWin ? `codegraph-sshpass-${uuid}.cmd` : `codegraph-sshpass-${uuid}.sh`);
    const shellEsc = (s: string) => s.replace(/'/g, "'\\''");
    fs.writeFileSync(
      askPassPath,
      isWin ? `@echo ${credential.passphrase}\r\n` : `#!/bin/sh\necho "${shellEsc(credential.passphrase)}"\n`,
    );
    if (!isWin) {
      try { fs.chmodSync(askPassPath, 0o700); } catch { /* ignore */ }
    }
    env.SSH_ASKPASS = askPassPath;
    env.SSH_ASKPASS_REQUIRE = 'force';
    env.DISPLAY = ':0';
  }

  try {
    return await fn(env);
  } finally {
    try { fs.unlinkSync(keyPath); } catch { /* ignore */ }
    if (askPassPath) {
      try { fs.unlinkSync(askPassPath); } catch { /* ignore */ }
    }
  }
}

/**
 * Extract an archive (zip or tar.gz) to a target directory.
 *
 * - .zip: uses adm-zip (pure JS, cross-platform)
 * - .tar.gz / .tgz: uses system `tar` command
 *
 * Security: rejects archives with path traversal entries (..).
 */
export async function extractArchive(
  archivePath: string,
  targetPath: string,
  options: FetchOptions = {},
): Promise<void> {
  const ext = path.extname(archivePath).toLowerCase();
  const isTarGz = ext === '.gz' || ext === '.tgz'
    || archivePath.toLowerCase().endsWith('.tar.gz');

  if (isTarGz) {
    await extractTarGz(archivePath, targetPath, options);
  } else {
    await extractZip(archivePath, targetPath, options);
  }
}

async function extractTarGz(
  archivePath: string,
  targetPath: string,
  options: FetchOptions,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    execFile('tar', ['xzf', archivePath, '-C', targetPath], (err, _stdout, stderr) => {
      if (err) {
        reject(new Error(`压缩包解压失败: ${stderr || err.message}`));
        return;
      }
      options.onProgress?.(1);
      resolve();
    });
  });
}

async function extractZip(
  archivePath: string,
  targetPath: string,
  options: FetchOptions,
): Promise<void> {
  let AdmZip: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    AdmZip = require('adm-zip');
  } catch {
    throw new Error('adm-zip 未安装，请运行 npm install adm-zip');
  }

  const zip = new AdmZip(archivePath);
  const entries = zip.getEntries();

  for (const entry of entries) {
    const entryName = entry.entryName;
    if (entryName.includes('..')) {
      throw new Error(`压缩包包含路径穿越条目: ${entryName}`);
    }
  }

  const total = entries.length;
  let extracted = 0;

  for (const entry of entries) {
    const dest = path.join(targetPath, entry.entryName);
    if (entry.isDirectory) {
      fs.mkdirSync(dest, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, entry.getData());
    }
    extracted++;
    if (total > 0 && options.onProgress) {
      options.onProgress(extracted / total);
    }
  }
}

/**
 * Find the actual code root within an extracted directory.
 *
 * Archives often have a single top-level directory (e.g. repo-main/),
 * so if the extracted path has exactly one subdirectory containing code files,
 * we drill down into it.
 */
export function findCodeRoot(extractedPath: string): string {
  const entries = fs.readdirSync(extractedPath, { withFileTypes: true });
  const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'));

  if (dirs.length === 1) {
    const firstDir = dirs[0];
    if (!firstDir) return extractedPath;
    const subDir = path.join(extractedPath, firstDir.name);
    const subEntries = fs.readdirSync(subDir, { withFileTypes: true });
    const hasCode = subEntries.some(e => {
      if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        return CODE_EXTENSIONS.has(ext);
      }
      return false;
    });
    if (hasCode) {
      return subDir;
    }
  }

  return extractedPath;
}

/**
 * Sanitize a project name for use as a directory name.
 *
 * Only allows a-zA-Z0-9_-; everything else becomes '-'.
 * If the result is empty or conflicts with an existing directory,
 * appends a 4-char random suffix.
 */
export function sanitize(name: string): string {
  let cleaned = name.replace(/[^a-zA-Z0-9_-]/g, '-');
  cleaned = cleaned.replace(/-+/g, '-').replace(/^-|-$/g, '');

  if (!cleaned) {
    cleaned = 'project';
  }

  const reposDir = path.join(os.homedir(), '.codegraph', 'repos');
  const candidate = path.join(reposDir, cleaned);
  if (fs.existsSync(candidate)) {
    const suffix = randomUUID().slice(0, 4);
    cleaned = `${cleaned}-${suffix}`;
  }

  return cleaned;
}

/**
 * Save an uploaded file to a temporary path.
 */
export function saveUploadedFile(buffer: Buffer, originalName: string): string {
  const tmpDir = os.tmpdir();
  const ext = path.extname(originalName).toLowerCase();
  const tmpPath = path.join(tmpDir, `codegraph-upload-${randomUUID()}${ext}`);
  fs.writeFileSync(tmpPath, buffer);
  return tmpPath;
}

/**
 * Clean up stale upload temp files older than 24 hours.
 */
export function cleanupStaleUploads(): void {
  const tmpDir = os.tmpdir();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;

  try {
    const entries = fs.readdirSync(tmpDir);
    for (const entry of entries) {
      if (!entry.startsWith('codegraph-upload-')) continue;
      const fullPath = path.join(tmpDir, entry);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(fullPath);
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}
