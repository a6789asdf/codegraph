/**
 * Shared DB connection for tasks and credentials.
 *
 * Provides a single SQLite DatabaseSync instance shared between
 * TaskManager and CredentialService.
 */

import * as path from 'path';
import * as os from 'os';
import { TASKS_SCHEMA, runTaskMigrations } from './task-schema';

function getTasksDbPath(): string {
  return path.join(os.homedir(), '.codegraph-tasks.db');
}

let _db: any = null;

export function getSharedDb(): any {
  if (!_db) {
    const dbPath = getTasksDbPath();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseSync } = require('node:sqlite');
    _db = new DatabaseSync(dbPath);
    _db.exec('PRAGMA busy_timeout = 5000');
    _db.exec('PRAGMA journal_mode = WAL');
    _db.exec('PRAGMA foreign_keys = ON');

    // Create tables (idempotent) — skip indexes if columns don't exist yet
    try {
      _db.exec(TASKS_SCHEMA);
    } catch {
      // Table may exist with old schema, indexes referencing new columns will fail.
      // Run migrations first, then retry.
    }

    // Add any new columns to existing tables
    runTaskMigrations(_db);

    // Retry schema (indexes should now succeed)
    try {
      _db.exec(TASKS_SCHEMA);
    } catch {
      // Ignore — tables/indexes already exist
    }
  }
  return _db;
}
