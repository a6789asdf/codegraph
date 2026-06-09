# 项目管理页面设计文档

- **日期**: 2026-06-09
- **范围**: 前端新增"项目管理"能力（在现有 `/projects` 页拓展）+ 后端代码拉取与异步建图任务系统
- **状态**: 待用户 review

---

## 1. 背景与目标

### 1.1 现状

CodeGraph 当前的项目接入流程：

1. 用户在终端进入项目目录，手动执行 `codegraph init` 创建 `.codegraph/codegraph.db`
2. Web 端 [Projects.vue](../../../web/src/views/Projects.vue) 通过 `GET /api/projects` 列出已注册项目，仅支持卡片展示与跳转
3. 注册新项目只能调用 `POST /api/projects/register`，且要求**目标路径已存在 `.codegraph/codegraph.db`**

### 1.2 痛点

- 用户必须先了解 CLI、进入正确目录、记忆命令才能注册项目
- 无法从 Web UI 直接接入外部 Git 仓库或上传的代码包
- 缺少"代码拉取 → 初始化 → 建图"的一站式流程
- 长时间运行的建图任务没有可视化反馈，用户不知道进度

### 1.3 目标

在 `/projects` 页面新增**项目管理能力**，让用户：

- 在 Web 端通过表单输入 **Git URL 或上传压缩包** 即可接入新项目
- 自动完成"拉取代码 → `CodeGraph.init` → `indexAll` → 注册"全流程
- 实时看到任务进度（轮询），任务失败可重试
- 任务状态持久化，服务重启不丢失记录

### 1.4 非目标

- 不支持 GitHub OAuth 等深度集成
- 不支持凭证保存（每次输入含 token 的 URL）
- 不支持任务的细粒度取消（一旦 `indexAll` 启动，必须等其完成或失败）
- 不引入 WebSocket / SSE 实时推送（用轮询）
- 不为本功能新建前端测试基础设施

---

## 2. 整体架构

### 2.1 架构图

```
┌──────────────────────────────────────────────────────────────┐
│                    Projects.vue (前端)                        │
│  ┌─────────────────┐    ┌──────────────────────────────┐     │
│  │ 项目卡片列表    │    │ AddProjectDrawer (新增)      │     │
│  │ (含任务状态条)  │    │  ├ Tab1: Git URL             │     │
│  │  ↑ 轮询 3s      │    │  └ Tab2: 上传压缩包          │     │
│  └─────────────────┘    └──────────────────────────────┘     │
└────────────────────────┬─────────────────────────────────────┘
                         │ axios (/api)
                         ▼
┌──────────────────────────────────────────────────────────────┐
│              Hono API Server (src/api)                       │
│  路由: projects.ts (扩展) + 新增 tasks.ts                    │
│       POST /projects/clone     POST /projects/upload         │
│       GET  /projects/tasks     GET  /projects/tasks/:id      │
│       POST /projects/tasks/:id/retry                         │
│       DELETE /projects/tasks/:id                             │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│         TaskManager (新模块 src/api/task-manager.ts)         │
│  ├─ 持久化到 ~/.codegraph-tasks.db (独立 SQLite)             │
│  ├─ 后台异步执行（fire-and-forget + Promise）                │
│  └─ 阶段执行器:                                              │
│      cloneRepo() ─► extractArchive() ─► initProject()        │
│      ─► indexAll() ─► registerProject()                      │
│                                                              │
│         SourceFetcher (新模块 src/api/source-fetcher.ts)     │
│  └─ git clone / zip&tar 解压封装                             │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 模块边界

| 模块 | 文件 | 职责 |
|---|---|---|
| **任务持久化与调度** | `src/api/task-manager.ts` | 任务 CRUD、状态机管理、后台调度 |
| **代码获取** | `src/api/source-fetcher.ts` | `git clone` 和 zip/tar.gz 解压封装 |
| **任务路由** | `src/api/routes/tasks.ts` | 任务列表/详情/重试/删除 HTTP 端点 |
| **projects 路由扩展** | `src/api/routes/projects.ts` | 新增 `/clone`、`/upload` 端点 |
| **前端添加表单** | `web/src/components/project/AddProjectDrawer.vue` | Drawer 表单 UI |
| **前端任务 store** | `web/src/stores/task.ts` | 任务列表状态 + 轮询管理 |
| **前端任务 API** | `web/src/api/task.ts` | 任务相关 HTTP 调用 |

### 2.3 设计原则

1. **解耦**: `source-fetcher` 与 `task-manager` 互不知道对方；TaskManager 通过传入回调驱动阶段，便于单独测试代码获取逻辑
2. **复用现有锁**: 建图阶段调用 `CodeGraph.indexAll()`，自动享受现有的 `indexMutex + FileLock` 保护，无需额外并发控制
3. **持久化位置**: 任务数据库存在 `~/.codegraph-tasks.db`（与 `~/.codegraph-projects.json` 注册表同级，全局视角）
4. **统一工作区**: 默认代码存放路径 `~/.codegraph/repos/<sanitized-name>`，可通过请求体 `targetPath` 覆盖

---

## 3. 数据模型

### 3.1 任务数据库表（`~/.codegraph-tasks.db`）

```sql
CREATE TABLE tasks (
  id            TEXT PRIMARY KEY,            -- UUID v4
  name          TEXT NOT NULL,               -- 项目名称（用户输入，sanitize 后用作文件夹名）
  source_type   TEXT NOT NULL,               -- 'git' | 'upload'
  source_url    TEXT,                        -- Git URL（仅 git 类型）
  branch        TEXT,                        -- Git 分支（仅 git 类型，可空）
  archive_path  TEXT,                        -- 上传文件的临时路径（仅 upload 类型）
  target_path   TEXT NOT NULL,               -- 最终代码存放的绝对路径
  status        TEXT NOT NULL DEFAULT 'pending', -- pending | running | completed | failed
  stage         TEXT,                        -- 当前执行阶段（见 3.3）
  progress_pct  INTEGER NOT NULL DEFAULT 0,  -- 0-100
  error_message TEXT,                        -- 失败时的错误详情
  result_path   TEXT,                        -- 成功时注册到 registry 的项目路径
  created_at    TEXT NOT NULL,               -- ISO 8601
  updated_at    TEXT NOT NULL,
  started_at    TEXT,
  completed_at  TEXT
);

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_created_at ON tasks(created_at DESC);
```

### 3.2 任务状态机

```
                        ┌── retry ──┐
                        ▼           │
  pending ──► running ──► completed
                   │
                   └──► failed
```

- `pending`: 已创建未调度（或被重试后重置）
- `running`: 后台执行中
- `completed`: 成功完成
- `failed`: 任一阶段抛错

### 3.3 执行阶段（`stage`）与进度映射

| stage | progress_pct | 说明 |
|---|---|---|
| `pending` | 0 | 刚创建，未被调度 |
| `resolving_path` | 5 | 解析目标路径、冲突检测、创建工作区目录 |
| `fetching` | 10-50 | `git clone --progress` 或解压压缩包；通过 stderr/解压回调线性映射 |
| `initializing` | 50-60 | `CodeGraph.init(codePath)` 创建 `.codegraph/` + 加载 grammars |
| `indexing` | 60-95 | `CodeGraph.indexAll()` tree-sitter 解析 + 引用解析（主要耗时） |
| `registering` | 95-99 | `registerProject(codePath)` 写入 `~/.codegraph-projects.json` |
| `completed` | 100 | 完成 |

失败时保留最后 `stage` 字段，便于诊断"在哪一步失败"。

---

## 4. API 端点

所有端点遵循现有 `{ ok, data, error }` 响应格式。

| 方法 | 路径 | 请求 | 响应 | 用途 |
|---|---|---|---|---|
| `POST` | `/api/projects/clone` | `{ name, url, branch?, targetPath? }` | `202 { taskId }` | 创建 Git 拉取任务 |
| `POST` | `/api/projects/upload` | multipart: `name, file, targetPath?` | `202 { taskId }` | 创建上传解压任务 |
| `GET` | `/api/projects/tasks` | query: `?status=active\|completed\|failed` | `200 { tasks: Task[] }` | 任务列表 |
| `GET` | `/api/projects/tasks/:id` | — | `200 { task: Task }` | 任务详情 |
| `POST` | `/api/projects/tasks/:id/retry` | — | `200 { taskId }` | 重置 failed 任务为 pending 并重新调度 |
| `DELETE` | `/api/projects/tasks/:id` | — | `200 { deleted: true }` | 删除任务记录（不动代码目录） |

### 错误码约定

- `400`: 请求参数无效（如 Git URL 格式错误）
- `409`: 同名任务正在运行
- `413`: 上传文件超过 500MB
- `500`: 服务器内部错误

---

## 5. 后端实现

### 5.1 `src/api/task-manager.ts`

```typescript
class TaskManager {
  private db: DatabaseConnection;  // 指向 ~/.codegraph-tasks.db
  private runningCount = 0;
  private readonly maxConcurrent = 2;
  private pendingQueue: string[] = [];

  async createTask(spec: CreateTaskSpec): Promise<Task>
  async getTask(id: string): Promise<Task | null>
  async listTasks(filter?: { status?: string }): Promise<Task[]>
  async updateStage(id: string, stage: string, progress: number): Promise<void>
  async markCompleted(id: string, resultPath: string): Promise<void>
  async markFailed(id: string, error: string): Promise<void>
  async retryTask(id: string): Promise<void>
  async removeTask(id: string): Promise<void>

  // 启动时调用：将上次进程残留的 running 任务标为 failed
  async recoverOnStartup(): Promise<void>

  // 调度入口
  scheduleTask(id: string): void

  // 内部：实际执行
  private async runTask(id: string): Promise<void>
}
```

**runTask 流程**（伪代码）:

```typescript
private async runTask(id: string) {
  const task = await this.getTask(id);
  const targetPath = task.target_path
    || path.join(os.homedir(), '.codegraph', 'repos', sanitize(task.name));

  try {
    await this.updateStage(id, 'resolving_path', 5);
    await ensureEmptyDirectory(targetPath);

    await this.updateStage(id, 'fetching', 10);
    if (task.source_type === 'git') {
      await sourceFetcher.cloneRepo(task.source_url, targetPath, {
        branch: task.branch,
        onProgress: (pct) => this.updateStage(id, 'fetching', 10 + Math.floor(pct * 0.4)),
      });
    } else {
      await sourceFetcher.extractArchive(task.archive_path, targetPath, {
        onProgress: (pct) => this.updateStage(id, 'fetching', 10 + Math.floor(pct * 0.4)),
      });
    }

    await this.updateStage(id, 'initializing', 55);
    const codePath = findCodeRoot(targetPath);
    const instance = await CodeGraph.init(codePath);

    await this.updateStage(id, 'indexing', 60);
    await instance.indexAll({
      onProgress: (pct) => this.updateStage(id, 'indexing', 60 + Math.floor(pct * 0.35)),
    });

    await this.updateStage(id, 'registering', 97);
    registerProject(codePath);
    await instance.close();

    await this.markCompleted(id, codePath);
  } catch (err) {
    await this.markFailed(id, err instanceof Error ? err.message : String(err));
    await cleanupTempFiles(task);
  } finally {
    this.runningCount--;
    this.drainQueue();
  }
}
```

**并发控制**: 同时最多 `maxConcurrent = 2` 个任务运行；超出进入 `pendingQueue`，前一任务结束时 `drainQueue()` 取下一个。

**注意**: `CodeGraph.indexAll` 当前签名是否支持 `onProgress` 回调需在实施阶段确认；若不支持，需先小范围扩展该 API。

### 5.2 `src/api/source-fetcher.ts`

```typescript
async cloneRepo(
  url: string,
  targetPath: string,
  options?: { branch?: string; onProgress?: (pct: number) => void }
): Promise<void>
```

**实现**: `child_process.spawn('git', ['clone', '--progress', ...args])`

- 解析 stderr 中 `Receiving objects: XX%` 行映射 `onProgress`
- 失败时 `rm -rf targetPath` 清理
- 标注前置依赖：系统需安装 `git`

```typescript
async extractArchive(
  archivePath: string,
  targetPath: string,
  options?: { onProgress?: (pct: number) => void }
): Promise<void>
```

**实现**:
- `.zip`: 使用 `adm-zip` npm 包（纯 JS，跨平台）
- `.tar.gz` / `.tgz`: `child_process.execFile('tar', ['xzf', archivePath, '-C', targetPath])`（Windows 10+ 自带 tar）
- 解压前安全检查：拒绝包含 `..` 的条目（路径穿越防护）
- 限制解压后总大小 ≤ 2GB

```typescript
function findCodeRoot(extractedPath: string): string
```

**用途**: 压缩包常见结构是 `repo-main/src/...`，解压后实际代码在子目录里。

**逻辑**: 若 `extractedPath` 下只有一个子目录且其包含 ≥ 1 个常见代码文件扩展名，则返回该子目录；否则返回 `extractedPath` 本身。

```typescript
function sanitize(name: string): string
```

**用途**: 把用户输入的项目名转为安全文件夹名。

**逻辑**: 只保留 `a-zA-Z0-9-_`，其余替换为 `-`；若清理后为空字符串或与现有目录冲突，追加 4 位随机后缀。

### 5.3 路由扩展

**`src/api/routes/projects.ts`** 新增端点：

```typescript
projectRoutes.post('/clone', async (c) => { /* 见 4 端点表 */ });
projectRoutes.post('/upload', async (c) => { /* multipart 解析 + 保存 tmpfile + 创建任务 */ });
```

**`src/api/routes/tasks.ts`** 新文件：

```typescript
const taskRoutes = new Hono();
taskRoutes.get('/', /* listTasks */);
taskRoutes.get('/:id', /* getTask */);
taskRoutes.post('/:id/retry', /* retryTask */);
taskRoutes.delete('/:id', /* removeTask */);
export { taskRoutes };
```

**`src/api/index.ts`** 注册新路由：

```typescript
app.route('/api/projects/tasks', taskRoutes);
```

**注意路由顺序**: `tasks` 子路由必须在 `projects/:path/...` 之前注册，避免 `:path` 通配吞掉 `tasks`。

### 5.4 启动时恢复

`createApiApp()` 中初始化 `TaskManager` 后立即调用 `taskManager.recoverOnStartup()`：将所有 `running` 状态的任务标记为 `failed`，`error_message = "任务被中断（服务重启）"`，让用户决定是否重试。

---

## 6. 前端实现

### 6.1 改造 `web/src/views/Projects.vue`

页面分为 4 个区块（自上而下）：

1. **页面标题区** + 右上角"➕ 添加项目"按钮（触发 Drawer）
2. **进行中的任务**（仅当 `activeTasks.length > 0` 时显示）：每项展示项目名、当前阶段文字、进度条
3. **失败的任务**（仅当 `failedTasks.length > 0` 时显示）：每项展示项目名、错误信息、"重试" / "删除" 按钮
4. **已就绪项目**（现有区块保持不变）

### 6.2 新组件 `web/src/components/project/AddProjectDrawer.vue`

Ant Design Vue `<a-drawer>`，从右侧滑出（宽 520px），内含 `<a-tabs>` 双 Tab。

**Git Tab 字段**:

| 字段 | 类型 | 校验 |
|---|---|---|
| 项目名称 | string | 必填，3-50 字符，正则 `^[a-zA-Z0-9_-]+$` |
| Git URL | string | 必填，正则 `^(https?://|git@|ssh://)` |
| 分支 | string | 可选 |
| 存放路径（高级） | string | 可选，绝对路径 |

**上传 Tab 字段**:

| 字段 | 类型 | 校验 |
|---|---|---|
| 项目名称 | string | 同上 |
| 文件 | File | 必填，`.zip\|.tar.gz\|.tgz`，≤500MB |
| 存放路径（高级） | string | 同上 |

提交按钮调用 `taskStore.createCloneTask` / `taskStore.createUploadTask`，成功后关闭 Drawer 并立即 `taskStore.fetchTasks()` 刷新。

### 6.3 新增 Pinia store `web/src/stores/task.ts`

```typescript
state: {
  tasks: Task[],
  pollingTimer: number | null,
}

getters: {
  activeTasks,      // status in pending/running
  failedTasks,      // status === failed
}

actions: {
  startPolling(),   // 3s 间隔，无活跃任务时自动降级到 10s
  stopPolling(),
  fetchTasks(),
  createCloneTask(payload),
  createUploadTask(formData),
  retryTask(taskId),
  removeTask(taskId),
}
```

**轮询策略**:

- `Projects.vue` `onMounted` 启动，`onUnmounted` 停止
- 间隔 3 秒；若 `activeTasks.length === 0`，降级到 10 秒
- 检测到任务从 `running → completed`，自动触发 `projectStore.fetchProjects()` 刷新项目列表

### 6.4 新增 API 模块 `web/src/api/task.ts`

```typescript
export const taskApi = {
  list(filter?: { status?: 'active' | 'completed' | 'failed' }),
  get(taskId: string),
  retry(taskId: string),
  remove(taskId: string),
  createClone(payload: { name, url, branch?, targetPath? }),
  createUpload(formData: FormData),
};
```

`createUpload` 使用 multipart，需手动设置 `Content-Type: multipart/form-data`（让 axios 自动处理 boundary）。

---

## 7. 错误处理与边界情况

### 7.1 错误矩阵

| 场景 | 检测时机 | 处理 | 用户可见 |
|---|---|---|---|
| Git URL 格式无效 | API 请求时 | 返回 400 | "Git URL 格式不正确" |
| 同名任务运行中 | 创建任务时 | 返回 409 | "已存在同名任务正在运行" |
| 目标路径已存在且非空 | resolving_path 阶段 | 任务 failed | "目标路径已存在文件" |
| Git clone 失败 | fetching 阶段 | 任务 failed + 清理空目录 | "Git clone 失败: <stderr 摘要>" |
| 压缩包损坏或含路径穿越 | fetching 阶段 | 任务 failed + 清理 | "压缩包解压失败: <原因>" |
| 上传文件超大 | 上传时 | 返回 413 | "文件过大，最大 500MB" |
| 解压后无代码文件 | initializing 阶段 | 任务 failed | "未检测到代码文件" |
| `CodeGraph.init` 失败 | initializing 阶段 | 任务 failed | "初始化失败: <原因>" |
| `indexAll` 失败 | indexing 阶段 | 任务 failed，保留 `.codegraph/` 便于诊断 | "建图失败: <原因>" |
| 进程重启中断 | 启动时 | running → failed，标注 "服务重启" | "任务被中断（服务重启）" |

### 7.2 边界情况

- **重复添加同一项目**: 注册前检查 `~/.codegraph-projects.json`，若 `codeRoot` 已注册则任务 failed，错误信息提示用户该项目已存在
- **并发上限**: 同时最多 2 个任务运行，超出进入 pendingQueue
- **磁盘空间**: fetching 阶段前检查目标分区 ≥ 1GB 可用空间
- **任务列表性能**: `listTasks` 默认返回最近 100 条
- **上传文件清理**: 任务结束（成功/失败）后删除 `tmpdir` 中的上传文件；启动时清理 `tmpdir` 中超过 24 小时的 `codegraph-upload-*` 残留
- **Windows 路径**: 所有路径用 `path.join`；注册表统一存正斜杠风格
- **sanitize 后冲突**: 例如 `my-project` 与 `my/project` 清理后相同，追加 4 位随机后缀

---

## 8. 测试策略

### 8.1 单元测试（vitest，沿用现有 `__tests__/` 结构）

| 文件 | 覆盖点 |
|---|---|
| `__tests__/task-manager.test.ts` | CRUD、状态机转换、重试、并发上限、startup recovery |
| `__tests__/source-fetcher.test.ts` | URL 校验、`sanitize`、`findCodeRoot`、路径穿越拒绝 |
| `__tests__/api-tasks.test.ts` | 路由响应、错误码 |

### 8.2 集成测试

`__tests__/integration/project-management.test.ts`:

- 本地 git 仓库（用 `git init` 创建临时仓库）的完整 clone → init → index → register 流程
- 本地 zip 文件的上传 → 解压 → init → index → register 流程
- 进程重启恢复：手动写入 running 任务，重启 TaskManager，验证状态变为 failed

### 8.3 前端测试

本次**不引入前端测试基础设施**（项目现状无）。通过手动 QA 验证 UI：

- 添加新项目（Git） → 看进度 → 完成 → 入列表
- 添加新项目（上传） → 同上
- 模拟失败 → 看错误信息 → 重试
- 同名重复 → 看冲突提示

---

## 9. 依赖与部署

### 9.1 新增 npm 依赖（根 `package.json`）

| 依赖 | 用途 | 备注 |
|---|---|---|
| `adm-zip` | zip 解压 | 纯 JS，跨平台 |
| `uuid` | 任务 ID | 若根已有则复用 |

multipart 上传优先使用 Hono 内置 `parseBody()`，不引入 `multer`。

### 9.2 系统前置依赖

- `git`（用于 clone）
- `tar`（用于 .tar.gz 解压，Windows 10+ 自带）

文档（`CLAUDE.md` 或 `README.md`）追加"Web 项目管理 UI 前置依赖"段落。

### 9.3 不引入

- 前端测试框架
- WebSocket / SSE 依赖
- 凭证管理 / 加密存储依赖

---

## 10. 实施顺序

1. **后端基础**: `task-manager.ts` + 任务表 schema + 单元测试
2. **代码获取**: `source-fetcher.ts` + 单元测试
3. **后端路由**: 扩展 `projects.ts` + 新增 `tasks.ts` + 路由集成测试
4. **前端 API + store**: `api/task.ts` + `stores/task.ts`
5. **前端 UI**: `AddProjectDrawer.vue` + 改造 `Projects.vue`
6. **集成测试 + 手动 QA**
7. **文档更新**: `CLAUDE.md` / `README.md` 追加前置依赖说明

---

## 11. 未来扩展（非本次实施）

- WebSocket / SSE 实时推送（在当前 TaskManager 上加一层事件订阅即可）
- 凭证管理（加密本地存储 + 选择已保存凭证）
- GitHub OAuth 集成
- 任务取消（需要在 `indexAll` 中支持 AbortSignal）
- 顶栏全局任务铃铛入口（让其他页面也能看任务）

---

## 12. 参考

- 现有项目列表实现: [Projects.vue](../../../web/src/views/Projects.vue)
- 现有项目 store: [project.ts](../../../web/src/stores/project.ts)
- 现有项目路由: [projects.ts](../../../src/api/routes/projects.ts)
- 注册表实现: [registry.ts](../../../src/api/registry.ts)
- 现有数据库连接模式: [db/index.ts](../../../src/db/index.ts)
- 现有 CodeGraph 门面类: [src/index.ts](../../../src/index.ts)
