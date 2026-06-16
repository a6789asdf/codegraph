# Git 代码拉取支持密钥配置 设计文档

- **日期**: 2026-06-09
- **范围**: 在现有项目管理流程基础上，为 Git 仓库拉取增加凭证（HTTPS Token / SSH Key）配置能力
- **状态**: 待用户 review
- **关联文档**: [项目管理页面设计](./2026-06-09-project-management-page-design.md)

---

## 1. 背景与目标

### 1.1 现状

CodeGraph 当前的 Git 拉取实现位于 [source-fetcher.ts](../../../src/api/source-fetcher.ts#L33-L84) 的 `cloneRepo()`，直接调用 `git clone --progress <url>`，**不携带任何凭证**。

前端 [AddProjectDrawer.vue](../../../web/src/components/project/AddProjectDrawer.vue) 的 Git Tab 仅暴露 `name / url / branch / targetPath` 四个字段，**没有凭证输入位**。

API [POST /projects/clone](../../../src/api/routes/projects.ts#L220-L247) 同样不接受凭证字段。

### 1.2 痛点

- 私有仓库无法拉取（GitHub Private Repo、企业内网 GitLab、Gitee 私有仓库等）
- 用户被迫将 token 拼到 URL 中（如 `https://<token>@github.com/...`），导致 token 出现在数据库、日志、进程列表中
- 完全无法支持 SSH 协议的私有仓库
- 多次拉取相同私有仓库时需重复输入凭证

### 1.3 目标

为 Web 端 Git 拉取流程增加**安全、可复用、可视化**的凭证配置能力：

- 同时支持 **HTTPS Token** 和 **SSH Key** 两种主流凭证类型
- 凭证 **加密持久化** 到本地，跨会话复用
- 创建 clone 任务时由用户**显式选择**凭证（无凭证 = 公开仓库）
- 凭证管理（增删改查）有独立 UI 入口

### 1.4 非目标

- 不支持 GitHub OAuth / GitLab OAuth 等深度集成
- 不支持基于机器特征 / 用户主密码的密钥派生（本期采用随机密钥文件方案）
- 不支持凭证的"自动匹配 host"（本期采用显式选择）
- 不支持凭证导入/导出
- 不支持凭证过期管理 / 自动刷新

---

## 2. 整体架构

### 2.1 架构图

```
┌──────────────────────────────────────────────────────────────┐
│                    Projects.vue (前端)                        │
│  ┌────────┐ ┌────────────────┐ ┌──────────────────────────┐  │
│  │ 标题   │ │ 🔑 凭证管理    │ │ ➕ 添加项目              │  │
│  └────────┘ └───────┬────────┘ └────────────┬─────────────┘  │
│                     ▼                       ▼                │
│             ┌───────────────┐   ┌──────────────────────────┐ │
│             │ Credential    │   │ AddProjectDrawer         │ │
│             │ Drawer (新增) │   │  ├ Git Tab               │ │
│             │  增删改查     │   │  │   └ 新增"凭证选择"   │ │
│             │  凭证元数据   │   │  └ Upload Tab (不变)     │ │
│             └───────────────┘   └──────────────────────────┘ │
└────────────────────────┬─────────────────────────────────────┘
                         │ axios (/api)
                         ▼
┌──────────────────────────────────────────────────────────────┐
│              Hono API Server (src/api)                       │
│  新增路由: credentials.ts                                    │
│    GET /credentials   POST /credentials                      │
│    PUT /credentials/:id   DELETE /credentials/:id            │
│                                                              │
│  扩展路由: projects.ts                                       │
│    POST /projects/clone   (新增 credentialId 字段)           │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│   CredentialService (新增 src/api/credential-service.ts)     │
│  ├─ 持久化到 ~/.codegraph-tasks.db (复用现有 db)             │
│  ├─ 加密: AES-256-GCM (node:crypto 内置)                     │
│  ├─ 密钥: ~/.codegraph/.credkey  (随机 32 字节, 权限 0600)   │
│  └─ API: list / create / update / delete /                   │
│          resolveCredential (返回明文, 仅内部调用)            │
│                                                              │
│   TaskManager (扩展 src/api/task-manager.ts)                 │
│  └─ runTask 在 fetching 阶段:                                │
│      resolveCredential(id) → cloneRepo(..., { credential })  │
│                                                              │
│   SourceFetcher (扩展 src/api/source-fetcher.ts)             │
│  └─ cloneRepo 新增 credential 参数:                          │
│      HTTPS → 写临时 GIT_ASKPASS 脚本                         │
│      SSH   → 写临时密钥文件 + GIT_SSH_COMMAND                │
│      finally 清理临时文件                                    │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 模块边界

| 模块 | 文件 | 职责 |
|---|---|---|
| **凭证管理与加密** | `src/api/credential-service.ts`（新增） | CRUD、AES-256-GCM 加解密、密钥文件管理 |
| **凭证单例** | `src/api/credential-shared.ts`（新增） | 服务进程内的 CredentialService 实例 |
| **凭证路由** | `src/api/routes/credentials.ts`（新增） | HTTP 端点：list/create/update/delete |
| **代码获取扩展** | `src/api/source-fetcher.ts`（修改） | `cloneRepo` 新增凭证注入（GIT_ASKPASS / GIT_SSH_COMMAND） |
| **任务表迁移** | `src/api/task-schema.ts`（修改） | 新增 `credential_id` 字段、新增 credentials 表 |
| **任务执行扩展** | `src/api/task-manager.ts`（修改） | 执行 clone 前解析凭证、传递给 SourceFetcher |
| **clone 路由扩展** | `src/api/routes/projects.ts`（修改） | `/clone` 接受 `credentialId`，校验凭证存在 |
| **前端凭证 API** | `web/src/api/credential.ts`（新增） | HTTP 调用 |
| **前端凭证 store** | `web/src/stores/credential.ts`（新增） | Pinia 状态 |
| **凭证管理 Drawer** | `web/src/components/project/CredentialDrawer.vue`（新增） | 凭证 UI |
| **添加项目 Drawer 改造** | `web/src/components/project/AddProjectDrawer.vue`（修改） | 新增凭证下拉框 |
| **Projects 页面改造** | `web/src/views/Projects.vue`（修改） | 新增"凭证管理"按钮 |
| **任务 API 改造** | `web/src/api/task.ts`（修改） | `createClone` payload 新增 `credentialId` |

### 2.3 设计原则

1. **加密对外不可见**：HTTP API 永不返回密文/明文，仅返回元数据
2. **明文最小化**：明文仅在 TaskManager 执行 cloneRepo 的极短窗口内驻留内存
3. **凭证与任务解耦**：删除凭证不影响已完成任务的历史记录；运行时才校验凭证存在
4. **复用现有 db**：凭证表与任务表同存 `~/.codegraph-tasks.db`，共用一个 SQLite 连接
5. **零外部依赖**：加解密用 `node:crypto`，临时文件用 `node:fs`/`node:os`

---

## 3. 数据模型

### 3.1 新增 credentials 表

```sql
CREATE TABLE IF NOT EXISTS credentials (
  id                   TEXT PRIMARY KEY,           -- UUID v4
  name                 TEXT NOT NULL UNIQUE,       -- 用户可读名称
  type                 TEXT NOT NULL,              -- 'https' | 'ssh'
  username             TEXT,                       -- 仅 https 类型（可空）
  secret_encrypted     TEXT NOT NULL,              -- AES-256-GCM 密文（base64）
  iv                   TEXT NOT NULL,              -- 加密 IV（base64）
  auth_tag             TEXT NOT NULL,              -- GCM auth tag（base64）
  passphrase_encrypted TEXT,                       -- 仅 ssh 类型（可空）
  passphrase_iv        TEXT,
  passphrase_auth_tag  TEXT,
  created_at           TEXT NOT NULL,              -- ISO 8601
  updated_at           TEXT NOT NULL,
  last_used_at         TEXT
);

CREATE INDEX IF NOT EXISTS idx_credentials_type ON credentials(type);
```

### 3.2 tasks 表扩展

通过 `ALTER TABLE` 在 `task-schema.ts` 中追加：

```sql
ALTER TABLE tasks ADD COLUMN credential_id TEXT;  -- 可空，无外键约束
```

**为什么不加外键**：允许删除凭证而不级联影响历史任务；运行时才校验。

### 3.3 任务状态机不变

`runTask` 在 `fetching` 阶段新增预步骤：
- 若 `credential_id` 非空 → `credentialService.resolveCredential(id)`
- 凭证不存在 → 任务直接 failed，错误信息"所选凭证已删除"
- 凭证存在 → 传给 `cloneRepo`，clone 完成后 `touchLastUsed(id)`

### 3.4 密钥文件

| 文件 | 路径 | 权限 | 内容 |
|---|---|---|---|
| 主密钥 | `~/.codegraph/.credkey` | 0600（POSIX）/ NTFS 默认（Windows） | 32 字节随机字节，base64 编码 |

**初始化逻辑**：
- `CredentialService.create()` 时执行 `loadOrCreateKey()`
- 文件不存在 → `crypto.randomBytes(32)` 生成 → 写入 → `fs.chmod(path, 0o600)`（Windows 跳过 chmod）
- 文件存在 → 直接读入 Buffer 常驻内存
- 父目录 `~/.codegraph/` 不存在时自动 `mkdirSync({ recursive: true })`

### 3.5 加密协议

| 项 | 值 |
|---|---|
| 算法 | AES-256-GCM |
| 密钥 | 32 字节（来自 `.credkey`） |
| IV | 每条记录独立，12 字节随机 |
| Auth Tag | GCM 模式自带 16 字节认证标签 |
| 编码 | 所有二进制字段 base64 后写库 |

SSH passphrase 与 SSH 私钥**分别独立加密**（独立 IV/tag），允许 passphrase 为空。

---

## 4. API 端点

所有端点遵循现有 `{ ok, data, error }` 响应格式。

### 4.1 新增凭证路由

| 方法 | 路径 | 请求 | 响应 | 用途 |
|---|---|---|---|---|
| `GET` | `/api/credentials` | — | `200 { credentials: CredentialMeta[] }` | 列表 |
| `POST` | `/api/credentials` | `CreateCredentialSpec` | `201 { credential: CredentialMeta }` | 创建 |
| `PUT` | `/api/credentials/:id` | `Partial<CreateCredentialSpec>` | `200 { credential: CredentialMeta }` | 更新 |
| `DELETE` | `/api/credentials/:id` | — | `200 { deleted: true }` | 删除 |

**CredentialMeta**（API 返回结构，**绝不含密文/明文**）：

```typescript
{
  id: string;
  name: string;
  type: 'https' | 'ssh';
  username: string | null;
  has_passphrase: boolean;  // 仅 SSH 类型有意义
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
}
```

**CreateCredentialSpec**：

```typescript
{
  name: string;              // 必填，唯一
  type: 'https' | 'ssh';     // 必填
  username?: string;         // 仅 https
  secret: string;            // 必填：HTTPS 的 token / SSH 的私钥内容
  passphrase?: string;       // 仅 ssh，可空
}
```

### 4.2 clone 路由扩展

`POST /api/projects/clone` 新增字段：

```typescript
{
  name: string;
  url: string;
  branch?: string;
  targetPath?: string;
  credentialId?: string;     // 新增；不传则视为公开仓库
}
```

### 4.3 错误码

| 端点 | 状态码 | 场景 |
|---|---|---|
| `POST /credentials` | 400 | name 为空或格式错误、type 无效、secret 为空 |
| `POST /credentials` | 409 | name 与已有凭证冲突 |
| `PUT /credentials/:id` | 404 | 凭证不存在 |
| `PUT /credentials/:id` | 409 | name 改为与他人冲突 |
| `DELETE /credentials/:id` | 404 | 凭证不存在 |
| `POST /projects/clone` | 400 | `credentialId` 指向不存在的凭证 |

---

## 5. 后端实现

### 5.1 `src/api/credential-service.ts`（新增）

```typescript
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

export class CredentialService {
  private db: any;
  private key: Buffer;

  static create(db: any): CredentialService;

  // 公开 API（路由层调用）
  listCredentials(): CredentialMeta[];
  getCredentialMeta(id: string): CredentialMeta | null;
  createCredential(spec: CreateCredentialSpec): CredentialMeta;
  updateCredential(id: string, patch: Partial<CreateCredentialSpec>): CredentialMeta;
  deleteCredential(id: string): void;

  // 内部 API（TaskManager 调用，明文不出 server 进程）
  resolveCredential(id: string): DecryptedCredential | null;
  touchLastUsed(id: string): void;

  // 私有
  private loadOrCreateKey(): Buffer;
  private encrypt(plain: string): { ciphertext: string; iv: string; authTag: string };
  private decrypt(ciphertext: string, iv: string, authTag: string): string;
}
```

**关键实现要点**：
- `name` 唯一约束在 DB 层（`UNIQUE` 索引）+ 服务层 try/catch 转 409
- `updateCredential` 局部更新：未传 `secret` → 保留原密文/IV/tag；传了 → 重新加密
- `resolveCredential` 在解密失败时返回 `null`（不抛错），由调用方决定如何处理
- 密钥 Buffer 常驻 `this.key`，进程生命周期内不重新读

### 5.2 `src/api/source-fetcher.ts`（修改）

`FetchOptions` 与 `cloneRepo` 签名扩展：

```typescript
export interface FetchOptions {
  branch?: string;
  onProgress?: (pct: number) => void;
  credential?: DecryptedCredential;  // 新增
}
```

**HTTPS 注入实现**（`GIT_ASKPASS` 机制）：

```typescript
async function withHttpsCredential<T>(
  credential: DecryptedCredential,
  fn: (env: NodeJS.ProcessEnv) => Promise<T>,
): Promise<T> {
  // 1. 写一个临时 shell 脚本，stdout 输出 username/password
  //    git 在需要凭证时会 spawn 此脚本，参数是 "Username for ..." 或 "Password for ..."
  const scriptPath = path.join(os.tmpdir(), `codegraph-askpass-${randomUUID()}.sh`);
  const isWin = process.platform === 'win32';

  const script = isWin
    // Windows: 用 .cmd 脚本通过参数判断
    ? `@echo off\r\nif "%~1"=="" exit 0\r\necho %1 | findstr /i "Username" >nul && echo ${credential.username || 'token'}\r\necho %1 | findstr /i "Password" >nul && echo ${credential.secret}\r\n`
    : `#!/bin/sh\ncase "$1" in\n  Username*) echo "${credential.username || 'token'}" ;;\n  Password*) echo "${credential.secret}" ;;\nesac\n`;

  const finalPath = isWin ? scriptPath.replace(/\.sh$/, '.cmd') : scriptPath;
  fs.writeFileSync(finalPath, script);
  if (!isWin) fs.chmodSync(finalPath, 0o700);

  try {
    return await fn({
      ...process.env,
      GIT_ASKPASS: finalPath,
      GIT_TERMINAL_PROMPT: '0',
    });
  } finally {
    try { fs.unlinkSync(finalPath); } catch { /* ignore */ }
  }
}
```

**SSH 注入实现**（`GIT_SSH_COMMAND` 机制）：

```typescript
async function withSshCredential<T>(
  credential: DecryptedCredential,
  fn: (env: NodeJS.ProcessEnv) => Promise<T>,
): Promise<T> {
  const keyPath = path.join(os.tmpdir(), `codegraph-ssh-${randomUUID()}`);
  fs.writeFileSync(keyPath, credential.secret, { mode: 0o600 });

  // passphrase 通过 SSH_ASKPASS + DISPLAY="" 提供（非交互场景）
  let askPassPath: string | null = null;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_SSH_COMMAND: `ssh -i "${keyPath}" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o IdentitiesOnly=yes`,
    GIT_TERMINAL_PROMPT: '0',
  };

  if (credential.passphrase) {
    askPassPath = path.join(os.tmpdir(), `codegraph-sshpass-${randomUUID()}.sh`);
    const isWin = process.platform === 'win32';
    const finalPath = isWin ? askPassPath.replace(/\.sh$/, '.cmd') : askPassPath;
    fs.writeFileSync(
      finalPath,
      isWin ? `@echo ${credential.passphrase}\r\n` : `#!/bin/sh\necho "${credential.passphrase}"\n`,
    );
    if (!isWin) fs.chmodSync(finalPath, 0o700);
    askPassPath = finalPath;
    env.SSH_ASKPASS = finalPath;
    env.SSH_ASKPASS_REQUIRE = 'force';
    env.DISPLAY = ':0';  // 触发 SSH_ASKPASS 生效
  }

  try {
    return await fn(env);
  } finally {
    try { fs.unlinkSync(keyPath); } catch { /* ignore */ }
    if (askPassPath) { try { fs.unlinkSync(askPassPath); } catch { /* ignore */ } }
  }
}
```

**`cloneRepo` 改造**：

```typescript
export async function cloneRepo(
  url: string,
  targetPath: string,
  options: FetchOptions = {},
): Promise<void> {
  const runClone = (env: NodeJS.ProcessEnv) =>
    new Promise<void>((resolve, reject) => {
      const args = ['clone', '--progress'];
      if (options.branch) args.push('--branch', options.branch);
      args.push(url, targetPath);

      const proc = spawn('git', args, { stdio: ['pipe', 'pipe', 'pipe'], env });
      // ...（其余 stderr 解析 / 进度回调 / 错误清理逻辑保持不变）
    });

  if (!options.credential) {
    return runClone(process.env);
  }
  if (options.credential.type === 'https') {
    return withHttpsCredential(options.credential, runClone);
  }
  return withSshCredential(options.credential, runClone);
}
```

### 5.3 `src/api/task-schema.ts`（修改）

```typescript
export const TASKS_SCHEMA = `
  -- 现有 tasks 表定义保持不变
  CREATE TABLE IF NOT EXISTS tasks ( ... );
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);

  -- 新增 credentials 表
  CREATE TABLE IF NOT EXISTS credentials ( ... );
  CREATE INDEX IF NOT EXISTS idx_credentials_type ON credentials(type);
`;

// 新增 migration 辅助
export function runTaskMigrations(db: any): void {
  // 给老用户的 tasks 表追加 credential_id 字段（幂等）
  try {
    const columns = db.prepare("PRAGMA table_info(tasks)").all();
    const hasCredentialId = columns.some((c: any) => c.name === 'credential_id');
    if (!hasCredentialId) {
      db.exec('ALTER TABLE tasks ADD COLUMN credential_id TEXT');
    }
  } catch {
    // 表可能尚未创建，忽略
  }
}
```

### 5.4 `src/api/task-manager.ts`（修改）

- `CreateTaskSpec` 新增 `credential_id?: string`
- `Task` 接口新增 `credential_id: string | null`
- `createTask` INSERT 时存储 `credential_id`
- `TaskManager.create()` 中追加 `runTaskMigrations(db)` 调用
- `runTask` 在 `fetching` 阶段：

```typescript
let credential: DecryptedCredential | undefined = undefined;
if (task.credential_id) {
  credential = credentialService.resolveCredential(task.credential_id) || undefined;
  if (!credential) {
    throw new Error('所选凭证已删除或数据损坏');
  }
}

await cloneRepo(task.source_url!, task.target_path, {
  branch: task.branch || undefined,
  onProgress: (pct) => this.updateStage(id, 'fetching', 10 + Math.floor(pct * 0.4)),
  credential,
});

if (task.credential_id) {
  credentialService.touchLastUsed(task.credential_id);
}
```

### 5.5 `src/api/credential-shared.ts`（新增）

```typescript
import { CredentialService } from './credential-service';
import { taskManager } from './task-manager-shared';

// 共用 taskManager 的 db 连接
export const credentialService = CredentialService.create((taskManager as any).db);
```

> **实现注意**：`taskManager.db` 当前是 private，需在 TaskManager 上加 `getDb()` 公开方法，或将 db 抽到独立模块。建议后者：把 `~/.codegraph-tasks.db` 的连接抽到 `src/api/shared-db.ts`，taskManager 与 credentialService 都从此处取。

### 5.6 路由新增 `src/api/routes/credentials.ts`

```typescript
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
    if (err.message?.includes('UNIQUE')) {
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
    if (err.message?.includes('UNIQUE')) {
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
```

`src/api/index.ts` 注册：
```typescript
app.route('/api', credentialRoutes);
```

### 5.7 `src/api/routes/projects.ts` 改造

`/clone` 端点新增 `credentialId` 处理：

```typescript
const { name, url, branch, targetPath, credentialId } = body;

if (credentialId) {
  const cred = credentialService.getCredentialMeta(credentialId);
  if (!cred) {
    return c.json({ ok: false, error: '指定的凭证不存在' }, 400);
  }
}

const task = await taskManager.createTask({
  name,
  source_type: 'git',
  source_url: url,
  branch: branch || undefined,
  target_path: targetPath || undefined,
  credential_id: credentialId || undefined,
});
```

---

## 6. 前端实现

### 6.1 新增 `web/src/api/credential.ts`

```typescript
import http from './http'

export interface CredentialMeta {
  id: string
  name: string
  type: 'https' | 'ssh'
  username: string | null
  has_passphrase: boolean
  created_at: string
  updated_at: string
  last_used_at: string | null
}

export interface CreateCredentialPayload {
  name: string
  type: 'https' | 'ssh'
  username?: string
  secret: string
  passphrase?: string
}

export default {
  list: () => http.get<CredentialMeta[]>('/credentials'),
  create: (payload: CreateCredentialPayload) =>
    http.post<CredentialMeta>('/credentials', payload),
  update: (id: string, patch: Partial<CreateCredentialPayload>) =>
    http.put<CredentialMeta>(`/credentials/${id}`, patch),
  remove: (id: string) =>
    http.delete<{ deleted: boolean }>(`/credentials/${id}`),
}
```

### 6.2 新增 `web/src/stores/credential.ts`

```typescript
import { defineStore } from 'pinia'
import credentialApi, { type CredentialMeta } from '@/api/credential'

export const useCredentialStore = defineStore('credential', {
  state: () => ({
    credentials: [] as CredentialMeta[],
    loading: false,
  }),
  getters: {
    httpsCredentials: (s) => s.credentials.filter(c => c.type === 'https'),
    sshCredentials: (s) => s.credentials.filter(c => c.type === 'ssh'),
  },
  actions: {
    async fetchCredentials() {
      this.loading = true
      try {
        const list = await credentialApi.list()
        this.credentials = Array.isArray(list) ? list : []
      } finally {
        this.loading = false
      }
    },
    async createCredential(payload) {
      const cred = await credentialApi.create(payload)
      await this.fetchCredentials()
      return cred
    },
    async updateCredential(id, patch) {
      const cred = await credentialApi.update(id, patch)
      await this.fetchCredentials()
      return cred
    },
    async removeCredential(id) {
      await credentialApi.remove(id)
      await this.fetchCredentials()
    },
  },
})
```

### 6.3 新增 `web/src/components/project/CredentialDrawer.vue`

Drawer 结构：

| 区块 | 内容 |
|---|---|
| 标题 | "凭证管理" |
| 列表区 | `<a-list>` 渲染 `credentialStore.credentials`，每项包含：类型 Tag + 名称 + 用户名/passphrase 信息 + 最近使用时间 + 编辑/删除按钮 |
| 新建/编辑表单 | 类型 radio + name + (HTTPS: username/token) / (SSH: private key textarea + passphrase) + 保存/取消按钮 |

**关键交互**：
- 列表项类型 Tag：HTTPS 蓝色，SSH 绿色
- 编辑时 secret/passphrase 字段显示 `••••••••` 占位符；提交时若为空字符串，**不传该字段**（后端保留原值）
- 删除用 `a-popconfirm`，提示文案："删除后不影响已完成任务，但使用此凭证的进行中任务会失败"
- 表单类型切换时清空联动字段
- HTTPS 密码字段用 `<a-input-password>`，自带显示/隐藏切换

### 6.4 改造 `web/src/components/project/AddProjectDrawer.vue`

Git Tab 在"分支"字段下方新增：

```vue
<a-form-item label="访问凭证" name="credentialId">
  <a-space style="display: flex">
    <a-select
      v-model:value="gitForm.credentialId"
      placeholder="无凭证（公开仓库）"
      allowClear
      style="flex: 1"
    >
      <a-select-option
        v-for="cred in credentialStore.credentials"
        :key="cred.id"
        :value="cred.id"
      >
        <a-tag :color="cred.type === 'https' ? 'blue' : 'green'">
          {{ cred.type.toUpperCase() }}
        </a-tag>
        {{ cred.name }}
      </a-select-option>
    </a-select>
    <a-button type="link" @click="openCredentialDrawer">管理</a-button>
  </a-space>
</a-form-item>
```

**逻辑改造**：
- `gitForm` 新增 `credentialId: undefined`
- Drawer `onVisibleChange(true)` 时调用 `credentialStore.fetchCredentials()`
- 提交时：`taskStore.createCloneTask({ ...gitForm, credentialId: gitForm.credentialId || undefined })`
- "管理"按钮：`emit('open-credential')` 或在父组件中切换 `credentialDrawerVisible`

### 6.5 改造 `web/src/views/Projects.vue`

标题区按钮组扩展为：

```vue
<a-space>
  <a-button @click="credentialDrawerVisible = true">
    <template #icon><KeyOutlined /></template>
    凭证管理
  </a-button>
  <a-button type="primary" @click="addDrawerVisible = true">
    <template #icon><PlusOutlined /></template>
    添加项目
  </a-button>
</a-space>

<AddProjectDrawer
  v-model:visible="addDrawerVisible"
  @open-credential="credentialDrawerVisible = true"
  @created="onCreated"
/>
<CredentialDrawer v-model:visible="credentialDrawerVisible" />
```

### 6.6 改造 `web/src/api/task.ts`

```typescript
createClone(payload: {
  name: string
  url: string
  branch?: string
  targetPath?: string
  credentialId?: string  // 新增
}) {
  return http.post<{ taskId: string }>('/projects/clone', payload)
}
```

---

## 7. 错误处理与边界情况

### 7.1 错误矩阵

| 场景 | 检测时机 | 处理 | 用户可见 |
|---|---|---|---|
| 凭证名称重复 | POST/PUT `/credentials` | 返回 409 | "凭证名称已存在" |
| 凭证 secret 为空 | POST `/credentials` | 返回 400 | "secret 不能为空" |
| `credentialId` 指向不存在凭证 | POST `/clone` | 返回 400 | "指定的凭证不存在" |
| 凭证在任务执行时已被删除 | 任务 fetching 阶段 | 任务 failed | "所选凭证已删除或数据损坏" |
| HTTPS Token 错误 | git clone 返回非零 | 任务 failed + 清理目录 | "Git clone 失败: Authentication failed" |
| SSH Key 错误或 passphrase 错 | git clone 返回非零 | 任务 failed + 清理目录 | "Git clone 失败: Permission denied (publickey)" |
| `.credkey` 缺失（首次启动） | `loadOrCreateKey()` | 自动生成 | 不可见 |
| `.credkey` 被外部覆盖 | `resolveCredential` 解密 | 返回 null → 任务 failed | "所选凭证已删除或数据损坏" |
| 临时文件清理失败 | clone finally | 日志记录，不影响任务 | 不可见 |
| Windows 上 git/ssh 不在 PATH | git clone error 事件 | 任务 failed | "Git clone 失败: spawn git ENOENT" |

### 7.2 安全措施清单

| 措施 | 位置 | 说明 |
|---|---|---|
| AES-256-GCM 加密 | `CredentialService` | 每条凭证独立 IV，认证加密防篡改 |
| 密钥文件权限 0600 | `loadOrCreateKey()` | POSIX 平台 chmod；Windows 依赖 NTFS 默认 |
| API 不返回密文/明文 | `credentials.ts` 路由 | 仅返回 `CredentialMeta` |
| HTTPS 不拼 URL | `withHttpsCredential` | `GIT_ASKPASS` 注入，token 不入 URL / 日志 / ps |
| 临时文件随机命名 + finally 清理 | `withHttpsCredential` / `withSshCredential` | UUID 命名，clone 后立即 unlink |
| 临时 SSH Key 权限 0600 | `withSshCredential` | `fs.writeFileSync(..., { mode: 0o600 })` |
| `GIT_TERMINAL_PROMPT=0` | clone env | 凭证错误时 git 不会阻塞等待人工输入 |
| SSH `StrictHostKeyChecking=no` | `GIT_SSH_COMMAND` | 自动化场景必须；用户已知风险 |
| SSH `IdentitiesOnly=yes` | `GIT_SSH_COMMAND` | 防止误用 ssh-agent 中的其他 key |
| 前端编辑不回填密文 | `CredentialDrawer.vue` | 占位符 `••••••••`，空字符串不提交 |
| 删除二次确认 | `CredentialDrawer.vue` | `a-popconfirm` 防误删 |

### 7.3 密钥文件损坏的处理策略

**前提**：本设计明确**不提供自动恢复**。这是加密存储的基本契约——主密钥丢失等价于数据丢失。

**用户体验**：
- 密钥文件缺失 → 启动时静默生成新密钥，旧凭证全部解密失败
- 用户首次使用旧凭证 → 任务 failed，错误信息明确提示"凭证数据损坏"
- 用户操作：删除损坏凭证 → 重新创建

**为什么不做密钥备份/恢复**：超出本期范围；如未来需要，可独立扩展"密钥备份/导出"能力。

### 7.4 其他边界

- **凭证名称大小写**：DB UNIQUE 约束默认大小写敏感，"GitHub" 和 "github" 视为两个凭证（符合直觉）
- **同时编辑同一凭证**：本系统单进程，无并发冲突；多端浏览器并发编辑由"最后写入获胜"
- **凭证数量上限**：不做硬限制；列表 UI 用 `<a-list>` 自带的虚拟滚动应对大量数据（实际预期 < 50）
- **服务进程崩溃**：密钥常驻内存，崩溃后下次启动重新加载，无副作用

---

## 8. 测试策略

### 8.1 单元测试（vitest）

| 文件 | 覆盖点 |
|---|---|
| `__tests__/credential-service.test.ts` | CRUD、name 唯一约束、`encrypt`/`decrypt` 往返、`resolveCredential` 返回明文、`touchLastUsed` 更新时间、`loadOrCreateKey` 创建/读取、解密失败返回 null |
| `__tests__/source-fetcher-cred.test.ts` | `withHttpsCredential` 临时文件生成 + finally 清理、`withSshCredential` 临时密钥文件权限 0600 + 清理、`cloneRepo` 无 credential 时行为不变、Windows/POSIX 平台分支 |
| `__tests__/task-manager-cred.test.ts` | `CreateTaskSpec.credential_id` 持久化、运行时 `credential_id` 指向已删除凭证 → 任务 failed、运行时 `touchLastUsed` 被调用 |
| `__tests__/credentials-route.test.ts` | 路由响应、错误码（400/404/409）、不返回密文字段 |

### 8.2 集成测试

`__tests__/integration/credential-clone.test.ts`：
- **HTTPS 全流程**：用 `git daemon` 或本地 file:// 协议模拟仓库 + Basic Auth → 创建 HTTPS 凭证 → clone 任务 → 任务 completed
- **SSH 全流程**：`ssh-keygen` 生成临时密钥对 → 启动本地 sshd（或使用 `git --bare` + ssh+本地）→ 创建 SSH 凭证 → clone 任务 → 任务 completed
- **凭证不存在场景**：创建凭证 → 创建 clone 任务 → 删除凭证 → 任务执行 → 任务 failed 并含特定错误信息
- **CI 兼容**：SSH 集成测试在缺少 ssh 环境时跳过（`skip` 守卫）

### 8.3 前端手动 QA 清单

- [ ] 凭证管理：创建 HTTPS 凭证 → 列表展示
- [ ] 凭证管理：创建 SSH 凭证（含 passphrase）→ 列表展示 `has_passphrase` 标识
- [ ] 凭证管理：编辑凭证不填密文 → 保存后原密文保留（用其 clone 验证）
- [ ] 凭证管理：编辑凭证修改密文 → 保存后新密文生效
- [ ] 凭证管理：删除凭证 → 二次确认 → 列表移除
- [ ] 添加项目：Git Tab 凭证下拉框显示已保存凭证
- [ ] 添加项目：选择凭证 → 提交 → 任务 completed
- [ ] 添加项目：选择凭证后任务执行中删除凭证 → 任务 failed 错误信息明确
- [ ] 添加项目：不选凭证（公开仓库）→ 行为同改造前

---

## 9. 依赖与部署

### 9.1 新增 npm 依赖

**无**。加解密用 `node:crypto`（Node 内置），临时文件用 `node:fs` + `node:os`（Node 内置），UUID 用 `crypto.randomUUID()`（Node 内置）。

### 9.2 系统前置依赖

- `git`（已有）
- `ssh`（Linux/Mac 自带；Windows 需 Git Bash / OpenSSH 客户端，Windows 10+ 默认包含 OpenSSH）

`CLAUDE.md` / `README.md` 在"Web 项目管理 UI 前置依赖"段落补充：
> 拉取私有仓库需要：HTTPS Token（推荐 Personal Access Token）或 SSH 私钥；SSH 拉取额外依赖系统 PATH 中可执行的 `ssh` 命令。

### 9.3 数据迁移

- 现有用户 `~/.codegraph-tasks.db` 中无 credentials 表 → 启动时自动 `CREATE TABLE IF NOT EXISTS` 创建
- 现有 tasks 表无 `credential_id` 字段 → `runTaskMigrations()` 自动 `ALTER TABLE ADD COLUMN`
- 升级**无需用户介入**

---

## 10. 实施顺序

| 步骤 | 内容 | 文件 | 依赖 |
|---|---|---|---|
| 1 | 共享 DB 抽象：新增 `src/api/shared-db.ts`，将 `~/.codegraph-tasks.db` 的连接创建逻辑（`new DatabaseSync(path); PRAGMA ...`）从 `task-manager.ts` 的 `static create()` 中抽离为 `getSharedDb()` 函数；`TaskManager.create()` 和 `CredentialService.create()` 均调用此函数获取 db 实例 | `src/api/shared-db.ts`（新增）、`src/api/task-manager.ts`（修改） | 无 |
| 2 | CredentialService + 加解密 + 密钥文件 + 单元测试 | `src/api/credential-service.ts`、`__tests__/credential-service.test.ts` | 步骤 1 |
| 3 | task-schema migration（新增 credentials 表 + tasks.credential_id） | `src/api/task-schema.ts` | 步骤 2 |
| 4 | TaskManager 扩展 + 单元测试 | `src/api/task-manager.ts`、`__tests__/task-manager-cred.test.ts` | 步骤 3 |
| 5 | SourceFetcher 扩展（HTTPS/SSH 注入）+ 单元测试 | `src/api/source-fetcher.ts`、`__tests__/source-fetcher-cred.test.ts` | 步骤 2 |
| 6 | credentials 路由 + 凭证 shared 单例 | `src/api/credential-shared.ts`、`src/api/routes/credentials.ts`、注册到 `index.ts` | 步骤 2 |
| 7 | projects /clone 端点改造 | `src/api/routes/projects.ts` | 步骤 4, 6 |
| 8 | 前端 API + store | `web/src/api/credential.ts`、`web/src/stores/credential.ts` | 步骤 6 |
| 9 | CredentialDrawer 组件 | `web/src/components/project/CredentialDrawer.vue` | 步骤 8 |
| 10 | AddProjectDrawer 改造 + task API 改造 | `web/src/components/project/AddProjectDrawer.vue`、`web/src/api/task.ts` | 步骤 8 |
| 11 | Projects 页面集成 | `web/src/views/Projects.vue` | 步骤 9, 10 |
| 12 | 集成测试 + 手动 QA | `__tests__/integration/credential-clone.test.ts` | 全部 |
| 13 | 文档更新 | `CLAUDE.md` / `README.md` | 全部 |

---

## 11. 未来扩展（非本期）

- 凭证按 host 自动匹配（保存时关联 `github.com` / `*.gitlab.company.com` 模式）
- 凭证主密码派生（用户输入主密码，PBKDF2 派生加密密钥）
- 凭证导入/导出（含密码二次加密）
- GitHub / GitLab OAuth 集成（一次授权，自动获取 token）
- 凭证使用历史与审计日志
- 拉取后定期 `git fetch` 时复用凭证（增量同步私有仓库）

---

## 12. 参考

- 现有 Git 拉取实现: [source-fetcher.ts](../../../src/api/source-fetcher.ts)
- 现有任务管理: [task-manager.ts](../../../src/api/task-manager.ts)
- 现有任务表 schema: [task-schema.ts](../../../src/api/task-schema.ts)
- 现有项目管理设计文档: [2026-06-09-project-management-page-design.md](./2026-06-09-project-management-page-design.md)
- 添加项目 Drawer: [AddProjectDrawer.vue](../../../web/src/components/project/AddProjectDrawer.vue)
- Projects 页面: [Projects.vue](../../../web/src/views/Projects.vue)
- Git ASKPASS 机制: [git-credential man page](https://git-scm.com/docs/gitcredentials)
- Node.js crypto AES-GCM: [Node crypto docs](https://nodejs.org/api/crypto.html#class-cipher)