# 项目管理页面 — 实施计划（Tasks）

> 配套设计文档: [2026-06-09-project-management-page-design.md](./2026-06-09-project-management-page-design.md)
>
> 实施按从下到上、从依赖到调用方的顺序，每步均可独立测试。

---

## Phase 1 — 后端任务系统基础

### Task 1.1 创建任务数据库 schema
- 在 `src/api/task-db/` 下新建 `schema.sql` 与 `index.ts`
- schema 内容见设计文档 §3.1
- 复用 `src/db/index.ts` 的 `DatabaseConnection` 模式（`busy_timeout` 必须最先、WAL、PRAGMA optimize）
- 数据库文件路径: `path.join(os.homedir(), '.codegraph-tasks.db')`

**验证**: 编写单测覆盖建表 + 插入/查询基础流程。

### Task 1.2 实现 TaskManager 核心
- 新建 `src/api/task-manager.ts`
- 类签名见设计文档 §5.1
- 包含: `createTask`、`getTask`、`listTasks`、`updateStage`、`markCompleted`、`markFailed`、`retryTask`、`removeTask`、`recoverOnStartup`、`scheduleTask`、`runTask`(私有)
- 并发上限 `maxConcurrent = 2`，超出进 `pendingQueue`
- 任务结束（成功/失败）在 `finally` 中 `runningCount--` 并 `drainQueue()`

**验证**: `__tests__/task-manager.test.ts` 覆盖 CRUD、状态机、并发上限、startup recovery。

---

## Phase 2 — 代码获取模块

### Task 2.1 实现 sourceFetcher.cloneRepo
- 新建 `src/api/source-fetcher.ts`
- `cloneRepo(url, targetPath, { branch?, onProgress? })`
- `child_process.spawn('git', ['clone', '--progress', ...args])`
- 解析 stderr `Receiving objects: XX%` 映射进度
- 失败时清理 targetPath

### Task 2.2 实现 sourceFetcher.extractArchive
- `.zip` 用 `adm-zip`（先验证根 `package.json` 是否已有，否则新增依赖）
- `.tar.gz/.tgz` 用 `child_process.execFile('tar', ['xzf', ...])`
- 路径穿越防护：拒绝条目名含 `..`
- 总大小限制 ≤ 2GB

### Task 2.3 工具函数
- `findCodeRoot(extractedPath)`: 单子目录下钻逻辑
- `sanitize(name)`: 非 `[a-zA-Z0-9_-]` 替换为 `-`，空或冲突追加 4 位随机后缀
- `ensureEmptyDirectory(path)`: 已存在且非空抛错

**验证**: `__tests__/source-fetcher.test.ts` 覆盖 sanitize、findCodeRoot、路径穿越拒绝；用本地临时 git 仓库验证 cloneRepo。

---

## Phase 3 — 后端路由

### Task 3.1 检查 / 扩展 CodeGraph.indexAll 的 onProgress
- 阅读 `src/index.ts` 中 `indexAll` 实现
- 若已有进度回调接口则复用；否则添加可选参数（小范围、向后兼容）

### Task 3.2 扩展 projects.ts 路由
- 在 [src/api/routes/projects.ts](../../../src/api/routes/projects.ts) 新增:
  - `POST /clone`: body 校验 → `taskManager.createTask` → `scheduleTask` → 返回 202
  - `POST /upload`: `c.req.parseBody()` → 保存到 `os.tmpdir()/codegraph-upload-<uuid>.zip` → `createTask` → `scheduleTask`
- 同名运行中任务返回 409

### Task 3.3 新建 tasks.ts 路由
- 新建 `src/api/routes/tasks.ts`
- 端点见设计文档 §4
- `GET /` 支持 `?status=active|completed|failed`
- 默认返回最近 100 条

### Task 3.4 注册路由到 index.ts
- 在 [src/api/index.ts](../../../src/api/index.ts) 添加 `app.route('/api/projects/tasks', taskRoutes)`
- **顺序重要**: 必须在 `projectRoutes` 之前注册，避免 `:path` 通配吞掉 `tasks`
- 在 `createApiApp()` 中初始化 TaskManager 并调用 `recoverOnStartup()`

**验证**: `__tests__/api-tasks.test.ts` 覆盖端点响应与错误码；`__tests__/integration/project-management.test.ts` 跑端到端流程。

---

## Phase 4 — 前端 API + Store

### Task 4.1 新增 API 模块
- 新建 [web/src/api/task.ts](../../../web/src/api/task.ts)
- 方法: `list / get / retry / remove / createClone / createUpload`
- `createUpload` 使用 `FormData`，axios 自动设置 multipart Content-Type

### Task 4.2 新增 Pinia store
- 新建 [web/src/stores/task.ts](../../../web/src/stores/task.ts)
- state / getters / actions 见设计文档 §6.3
- 轮询策略: 3s（有活跃任务）/ 10s（无活跃任务）
- 检测 `running → completed` 时触发 `projectStore.fetchProjects()`

---

## Phase 5 — 前端 UI

### Task 5.1 创建 AddProjectDrawer 组件
- 新建 [web/src/components/project/AddProjectDrawer.vue](../../../web/src/components/project/AddProjectDrawer.vue)
- `<a-drawer width="520">` + `<a-tabs>` (Git / 上传)
- 字段与校验见设计文档 §6.2
- "高级选项" 折叠面板内含 `targetPath` 字段
- 提交成功后关闭 Drawer，调用 `taskStore.fetchTasks()` 刷新

### Task 5.2 改造 Projects.vue
- 在 [web/src/views/Projects.vue](../../../web/src/views/Projects.vue):
  - 顶部加 "➕ 添加项目" 按钮 → 打开 Drawer
  - 新增"进行中的任务"区块（条件渲染）：项目名 + 阶段文字 + 进度条
  - 新增"失败的任务"区块（条件渲染）：错误信息 + 重试/删除按钮
  - 保留"已就绪项目"现有卡片网格
- `onMounted` 启动 `taskStore.startPolling()`，`onUnmounted` 停止

---

## Phase 6 — 集成测试 & QA

### Task 6.1 端到端集成测试
- `__tests__/integration/project-management.test.ts`:
  - 本地 git 仓库的完整流程
  - 本地 zip 的完整流程
  - 进程重启 recovery

### Task 6.2 手动 QA 清单
- [ ] 添加 Git 项目 → 看进度 → 完成入列表
- [ ] 添加上传项目（zip + tar.gz）→ 看进度 → 完成入列表
- [ ] Git URL 错误 → 任务 failed → 点重试可恢复
- [ ] 同名重复 → 看 409 提示
- [ ] 三个任务并发提交 → 第 3 个排队
- [ ] 重启服务 → running 任务变 failed 并显示"服务重启"
- [ ] 路由顺序：访问 `/api/projects/tasks` 不被 `:path` 吞掉

---

## Phase 7 — 文档与依赖

### Task 7.1 依赖更新
- 根 `package.json` 添加 `adm-zip`、`uuid`（若缺）
- `npm install` 后跑 lint + typecheck

### Task 7.2 文档更新
- 在 `CLAUDE.md` 或 `README.md` 追加 "Web 项目管理 UI 前置依赖" 段落（git、tar）
- 提一句任务系统持久化到 `~/.codegraph-tasks.db`

---

## 执行顺序与依赖关系

```
Phase 1 (任务系统基础)
   │
   ├──► Phase 2 (代码获取)
   │       │
   │       └──► Phase 3 (路由) ─── 依赖 Phase 1 + Phase 2
   │                  │
   │                  └──► Phase 4 (前端 API + Store)
   │                            │
   │                            └──► Phase 5 (前端 UI)
   │                                       │
   └──────────────────────────────────────► Phase 6 (集成测试 + QA)
                                                 │
                                                 └──► Phase 7 (文档 + 依赖)
```

每个 Phase 完成后都跑 `npm test` 与 `npm run typecheck`，确保增量不破坏既有功能。
