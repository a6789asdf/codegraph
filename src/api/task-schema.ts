/**
 * 任务数据库 schema
 *
 * 用于持久化项目管理任务（git clone / upload）的执行状态。
 * 以及 Git 凭证的加密存储。
 * 数据库文件存储在 ~/.codegraph-tasks.db，与 ~/.codegraph-projects.json 注册表同级。
 *
 * 任务状态机:
 *   pending --> running --> completed
 *                  |
 *                  +-----> failed --(retry)--> pending
 */

export const TASKS_SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  source_type   TEXT NOT NULL,
  source_url    TEXT,
  branch        TEXT,
  archive_path  TEXT,
  target_path   TEXT NOT NULL,
  system_id     TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  stage         TEXT,
  progress_pct  INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  result_path   TEXT,
  credential_id TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  started_at    TEXT,
  completed_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_system_id ON tasks(system_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);

CREATE TABLE IF NOT EXISTS credentials (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL UNIQUE,
  type                 TEXT NOT NULL,
  username             TEXT,
  secret_encrypted     TEXT NOT NULL,
  iv                   TEXT NOT NULL,
  auth_tag             TEXT NOT NULL,
  passphrase_encrypted TEXT,
  passphrase_iv        TEXT,
  passphrase_auth_tag  TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  last_used_at         TEXT
);

CREATE INDEX IF NOT EXISTS idx_credentials_type ON credentials(type);
`;

export function runTaskMigrations(db: any): void {
  try {
    const columns = db.prepare("PRAGMA table_info(tasks)").all();
    const hasCredentialId = columns.some((c: any) => c.name === 'credential_id');
    if (!hasCredentialId) {
      db.exec('ALTER TABLE tasks ADD COLUMN credential_id TEXT');
    }
    const hasSystemId = columns.some((c: any) => c.name === 'system_id');
    if (!hasSystemId) {
      db.exec('ALTER TABLE tasks ADD COLUMN system_id TEXT');
    }
  } catch {
    // 表可能尚未创建，忽略
  }
}
