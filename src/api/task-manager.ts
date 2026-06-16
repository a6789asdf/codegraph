/**
 * TaskManager
 *
 * 管理项目管理任务（git clone / upload）的生命周期：
 * 创建、调度、执行、状态追踪、重试、清理。
 *
 * 任务状态持久化到 ~/.codegraph-tasks.db（独立 SQLite），
 * 服务重启后可通过 recoverOnStartup() 恢复中断的任务。
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { getSharedDb } from './shared-db';
import { cloneRepo, extractArchive, findCodeRoot, sanitize } from './source-fetcher';
import { registerProject, getRegisteredProjects } from './registry';
import type { DecryptedCredential } from './credential-service';
import CodeGraph from '../index';

export type TaskSourceType = 'git' | 'upload';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';
export type TaskStage =
  | 'pending'
  | 'resolving_path'
  | 'fetching'
  | 'initializing'
  | 'indexing'
  | 'registering'
  | 'completed';

export interface Task {
  id: string;
  name: string;
  source_type: TaskSourceType;
  source_url: string | null;
  branch: string | null;
  archive_path: string | null;
  target_path: string;
  system_id: string | null;
  status: TaskStatus;
  stage: TaskStage | null;
  progress_pct: number;
  error_message: string | null;
  result_path: string | null;
  credential_id: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface CreateTaskSpec {
  name: string;
  source_type: TaskSourceType;
  source_url?: string;
  branch?: string;
  archive_path?: string;
  target_path?: string;
  system_id?: string;
  credential_id?: string;
}

const MAX_CONCURRENT = 2;

function getDefaultReposDir(): string {
  return path.join(os.homedir(), '.codegraph', 'repos');
}

function nowISO(): string {
  return new Date().toISOString();
}

function rowToTask(row: any): Task {
  return {
    id: row.id,
    name: row.name,
    source_type: row.source_type,
    source_url: row.source_url,
    branch: row.branch,
    archive_path: row.archive_path,
    target_path: row.target_path,
    system_id: row.system_id,
    status: row.status,
    stage: row.stage,
    progress_pct: row.progress_pct,
    error_message: row.error_message,
    result_path: row.result_path,
    credential_id: row.credential_id || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
  };
}

export class TaskManager {
  private db: any;
  private runningCount = 0;
  private pendingQueue: string[] = [];
  private credentialResolver: ((id: string) => DecryptedCredential | null) | null = null;

  private constructor(db: any) {
    this.db = db;
  }

  setCredentialResolver(resolver: (id: string) => DecryptedCredential | null): void {
    this.credentialResolver = resolver;
  }

  static create(): TaskManager {
    const db = getSharedDb();
    return new TaskManager(db);
  }

  async createTask(spec: CreateTaskSpec): Promise<Task> {
    const id = randomUUID();
    const targetPath = spec.target_path
      || path.join(getDefaultReposDir(), sanitize(spec.name));
    const now = nowISO();

    this.db.prepare(
      `INSERT INTO tasks (id, name, source_type, source_url, branch, archive_path, target_path, system_id, status, stage, progress_pct, credential_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', 0, ?, ?, ?)`
    ).run(
      id, spec.name, spec.source_type,
      spec.source_url || null, spec.branch || null, spec.archive_path || null,
      targetPath, spec.system_id || null, spec.credential_id || null, now, now
    );

    return this.getTask(id)!;
  }

  getTask(id: string): Task | null {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    return row ? rowToTask(row) : null;
  }

  listTasks(filter?: { status?: string; systemId?: string }): Task[] {
    if (filter?.status) {
      if (filter.status === 'active') {
        if (filter.systemId) {
          const rows = this.db.prepare(
            "SELECT * FROM tasks WHERE status IN ('pending', 'running') AND system_id = ? ORDER BY created_at DESC LIMIT 100"
          ).all(filter.systemId);
          return rows.map(rowToTask);
        }
        const rows = this.db.prepare(
          "SELECT * FROM tasks WHERE status IN ('pending', 'running') ORDER BY created_at DESC LIMIT 100"
        ).all();
        return rows.map(rowToTask);
      }
      if (filter.systemId) {
        const rows = this.db.prepare(
          'SELECT * FROM tasks WHERE status = ? AND system_id = ? ORDER BY created_at DESC LIMIT 100'
        ).all(filter.status, filter.systemId);
        return rows.map(rowToTask);
      }
      const rows = this.db.prepare(
        'SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC LIMIT 100'
      ).all(filter.status);
      return rows.map(rowToTask);
    }
    if (filter?.systemId) {
      const rows = this.db.prepare(
        'SELECT * FROM tasks WHERE system_id = ? ORDER BY created_at DESC LIMIT 100'
      ).all(filter.systemId);
      return rows.map(rowToTask);
    }
    const rows = this.db.prepare(
      'SELECT * FROM tasks ORDER BY created_at DESC LIMIT 100'
    ).all();
    return rows.map(rowToTask);
  }

  updateStage(id: string, stage: TaskStage, progress: number): void {
    const now = nowISO();
    this.db.prepare(
      "UPDATE tasks SET stage = ?, progress_pct = ?, status = 'running', updated_at = ? WHERE id = ?"
    ).run(stage, Math.min(progress, 100), now, id);
  }

  markCompleted(id: string, resultPath: string): void {
    const now = nowISO();
    this.db.prepare(
      "UPDATE tasks SET status = 'completed', stage = 'completed', progress_pct = 100, result_path = ?, completed_at = ?, updated_at = ? WHERE id = ?"
    ).run(resultPath, now, now, id);
  }

  markFailed(id: string, error: string): void {
    const now = nowISO();
    this.db.prepare(
      "UPDATE tasks SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?"
    ).run(error, now, id);
  }

  retryTask(id: string): void {
    const task = this.getTask(id);
    if (!task || task.status !== 'failed') return;
    const now = nowISO();
    this.db.prepare(
      "UPDATE tasks SET status = 'pending', stage = 'pending', progress_pct = 0, error_message = NULL, started_at = NULL, completed_at = NULL, updated_at = ? WHERE id = ?"
    ).run(now, id);
    this.scheduleTask(id);
  }

  removeTask(id: string): void {
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  }

  recoverOnStartup(): void {
    this.db.prepare(
      "UPDATE tasks SET status = 'failed', error_message = '任务被中断（服务重启）', updated_at = ? WHERE status = 'running'"
    ).run(nowISO());
  }

  scheduleTask(id: string): void {
    if (this.runningCount < MAX_CONCURRENT) {
      this.runningCount++;
      const now = nowISO();
      this.db.prepare(
        "UPDATE tasks SET status = 'running', started_at = ?, updated_at = ? WHERE id = ?"
      ).run(now, now, id);
      this.runTask(id).catch((err) => {
        console.error(`Task ${id} unexpected error:`, err);
      });
    } else {
      this.pendingQueue.push(id);
    }
  }

  private drainQueue(): void {
    while (this.runningCount < MAX_CONCURRENT && this.pendingQueue.length > 0) {
      const nextId = this.pendingQueue.shift()!;
      this.runningCount++;
      const now = nowISO();
      this.db.prepare(
        "UPDATE tasks SET status = 'running', started_at = ?, updated_at = ? WHERE id = ?"
      ).run(now, now, nextId);
      this.runTask(nextId).catch((err) => {
        console.error(`Task ${nextId} unexpected error:`, err);
      });
    }
  }

  private async runTask(id: string): Promise<void> {
    const task = this.getTask(id);
    if (!task) return;

    try {
      this.updateStage(id, 'resolving_path', 5);
      await this.ensureTargetDirectory(task.target_path);

      this.updateStage(id, 'fetching', 10);
      let credential: DecryptedCredential | undefined = undefined;
      if (task.credential_id && this.credentialResolver) {
        credential = this.credentialResolver(task.credential_id) || undefined;
        if (!credential) {
          throw new Error('所选凭证已删除或数据损坏');
        }
      }
      if (task.source_type === 'git') {
        await cloneRepo(task.source_url!, task.target_path, {
          branch: task.branch || undefined,
          onProgress: (pct) => this.updateStage(id, 'fetching', 10 + Math.floor(pct * 0.4)),
          credential,
        });
      } else {
        await extractArchive(task.archive_path!, task.target_path, {
          onProgress: (pct) => this.updateStage(id, 'fetching', 10 + Math.floor(pct * 0.4)),
        });
      }

      this.updateStage(id, 'initializing', 55);
      const codePath = findCodeRoot(task.target_path);

      const registered = getRegisteredProjects();
      if (registered.includes(path.resolve(codePath))) {
        throw new Error(`项目已存在: ${codePath}`);
      }

      const instance = await CodeGraph.init(codePath, { index: false });

      this.updateStage(id, 'indexing', 60);
      await instance.indexAll({
        onProgress: (progress) => {
          if (progress.total > 0) {
            const pct = Math.floor((progress.current / progress.total) * 100);
            this.updateStage(id, 'indexing', 60 + Math.floor(pct * 0.35));
          }
        },
      });

      this.updateStage(id, 'registering', 97);
      registerProject(codePath, task.system_id || undefined);
      instance.close();

      this.markCompleted(id, codePath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.markFailed(id, msg);
      await this.cleanupOnFailure(task);
    } finally {
      this.runningCount--;
      this.drainQueue();
    }
  }

  private async ensureTargetDirectory(targetPath: string): Promise<void> {
    if (fs.existsSync(targetPath)) {
      const entries = fs.readdirSync(targetPath);
      if (entries.length > 0) {
        throw new Error(`目标路径已存在文件: ${targetPath}`);
      }
    } else {
      fs.mkdirSync(targetPath, { recursive: true });
    }
  }

  private async cleanupOnFailure(task: Task): Promise<void> {
    if (task.archive_path) {
      try {
        if (fs.existsSync(task.archive_path)) {
          fs.unlinkSync(task.archive_path);
        }
      } catch {
        // ignore cleanup errors
      }
    }
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      // ignore
    }
  }
}
