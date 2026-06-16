# Tasks

## Phase 1: 后端注册表改造

- [x] **Task 1: 注册表增加项目 UUID 支持**
  - [x] 1.1 修改 `src/api/registry.ts` 中 `ProjectEntry` 接口，新增 `id: string` 字段
  - [x] 1.2 修改 `readRegistry()` 函数，检测旧格式（无 `id` 字段的项目），自动补全 UUID 并写回
  - [x] 1.3 修改 `registerProject()` 函数，新注册项目自动生成 `randomUUID()` 作为 `id`
  - [x] 1.4 新增 `getProjectPathById(id: string): string | null` 函数，通过 UUID 查找项目路径
  - [x] 1.5 新增 `getProjectIdByPath(path: string): string | null` 函数，通过路径查找项目 UUID
  - [x] 1.6 修改 `getRegisteredProjects()` 返回值，新增按 systemId 过滤时同时返回 `id` 字段

- [x] **Task 2: 后端中间件新增 UUID 解析器**
  - [x] 2.1 在 `src/api/middleware.ts` 中新增 `projectIdResolver()` 中间件，将 `:id` UUID 参数解析为项目路径
  - [x] 2.2 中间件通过 `getProjectPathById()` 查找路径，未找到时回退为直接路径
  - [x] 2.3 中间件复用 `getCodeGraphInstance()` 获取/创建 CodeGraph 实例，注入 `c.set('codegraph', instance)` 和 `c.set('projectPath', projectPath)`

- [x] **Task 3: 后端路由新增 `:id` 版本（并行兼容）**
  - [x] 3.1 为 `src/api/routes/projects.ts` 中 4 条 `:path` 路由替换为 `:id` 路由（使用 `projectIdResolver()`）
  - [x] 3.2 修改 `GET /api/projects` 列表接口，返回的每个项目对象增加 `id` 字段
  - [x] 3.3 为 `src/api/routes/search.ts` 中 4 条路由替换为 `:id` 版本
  - [x] 3.4 为 `src/api/routes/graph.ts` 中 7 条路由替换为 `:id` 版本
  - [x] 3.5 为 `src/api/routes/architecture.ts` 中 8 条路由替换为 `:id` 版本
  - [x] 3.6 为 `src/api/routes/flows.ts` 中 2 条路由替换为 `:id` 版本
  - [x] 3.7 为 `src/api/routes/review.ts` 中 2 条路由替换为 `:id` 版本
  - [x] 3.8 为 `src/api/routes/refactor.ts` 中 3 条路由替换为 `:id` 版本
  - [x] 3.9 为 `src/api/routes/wiki.ts` 中 3 条路由替换为 `:id` 版本
  - [x] 3.10 为 `src/api/routes/quality.ts` 中 5 条路由替换为 `:id` 版本
  - [x] 3.11 为 `src/api/routes/routes.ts` 中 3 条路由替换为 `:id` 版本
  - [x] 3.12 为 `src/api/routes/analysis.ts` 中 1 条路由替换为 `:id` 版本

- [x] **Task 4: 后端 API 入口路由挂载**
  - [x] 4.1 确认 `src/api/index.ts` 中路由挂载无需改动（`:id` 替换 `:path` 在同一路由组内）

## Phase 2: 前端 API 层改造

- [x] **Task 5: 前端 API 文件改为传递项目 ID**
  - [x] 5.1 修改 `web/src/api/project.ts`：移除 `encodePath()`，API 调用参数从 `projectPath` 改为 `projectId`
  - [x] 5.2 修改 `web/src/api/search.ts`：同上
  - [x] 5.3 修改 `web/src/api/graph.ts`：（不存在，跳过）
  - [x] 5.4 修改 `web/src/api/architecture.ts`：同上
  - [x] 5.5 修改 `web/src/api/flows.ts`：同上
  - [x] 5.6 修改 `web/src/api/review.ts`：同上
  - [x] 5.7 修改 `web/src/api/refactor.ts`：同上
  - [x] 5.8 修改 `web/src/api/wiki.ts`：同上
  - [x] 5.9 修改 `web/src/api/quality.ts`：同上
  - [x] 5.10 修改 `web/src/api/routes.ts`：同上
  - [x] 5.11 修改 `web/src/api/analysis.ts`：同上

## Phase 3: 前端视图与状态管理层改造

- [x] **Task 6: 前端 Store 适配项目 ID**
  - [x] 6.1 修改 `web/src/stores/project.ts`：`currentProject` 存储 UUID；项目列表类型增加 `id` 字段；`selectProject(id)` 改为接收 UUID
  - [x] 6.2 修改 `web/src/stores/search.ts`：使用 `currentProject`（UUID）调用 API
  - [x] 6.3 修改 `web/src/stores/quality.ts`：同上

- [x] **Task 7: 前端视图导航适配**
  - [x] 7.1 修改 `web/src/views/Projects.vue`：`openProject()` 使用 `p.id` 代替 `p.path`
  - [x] 7.2 修改 `web/src/views/SearchView.vue`：导航跳转中的 `pid` 使用 UUID
  - [x] 7.3 修改所有视图文件中的 `selectProject(decodeURIComponent(pid))` → `selectProject(pid)`
  - [x] 7.4 修改 `web/src/views/GraphView.vue` 和 `RoutesView.vue` 中局部变量 `projectPath` → `projectId`

# Task Dependencies

- Task 2 依赖 Task 1（中间件依赖注册表查找函数）
- Task 3 依赖 Task 2（`:id` 路由依赖 UUID 解析中间件）
- Task 4 依赖 Task 3（确认路由挂载无误）
- Task 5 依赖 Task 3 和 Task 4（前端 API 需要后端 `:id` 路由就绪）
- Task 6 依赖 Task 5（Store 调用更新后的 API）
- Task 7 依赖 Task 6（视图通过 Store 获取项目 ID）

Task 1、Task 5、Task 6、Task 7 可在其依赖就绪后并行开发。
