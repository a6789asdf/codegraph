# Tasks: 系统级资源隔离

- [x] Task 1: 升级注册表结构 (registry.ts)
  - [x] 1.1 定义新 Registry 接口（system 数组 + project 对象数组）
  - [x] 1.2 实现旧格式自动迁移逻辑（检测 projects 为 string[] → 创建默认系统 + 转换）
  - [x] 1.3 新增 `createSystem(name)`、`deleteSystem(id)`、`getSystems()` 方法
  - [x] 1.4 改造 `registerProject(path, systemId)` 接收 systemId 参数（默认指向默认系统）
  - [x] 1.5 改造 `getRegisteredProjects()` 支持按 systemId 过滤

- [x] Task 2: 后端 API 新增系统接口 (routes/projects.ts 或新建 routes/systems.ts)
  - [x] 2.1 `GET /api/systems` — 列出所有系统（含项目数量）
  - [x] 2.2 `POST /api/systems` — 创建系统
  - [x] 2.3 `DELETE /api/systems/:id` — 删除系统（校验无项目）
  - [x] 2.4 注册路由到 api/index.ts

- [x] Task 3: 改造后端项目 API 支持系统绑定
  - [x] 3.1 `GET /api/projects` 新增可选 `systemId` 查询参数，过滤返回
  - [x] 3.2 `POST /api/projects/register` 支持 systemId
  - [x] 3.3 `POST /api/projects/clone` 支持 systemId，写入 task
  - [x] 3.4 `POST /api/projects/upload` 支持 systemId，写入 task

- [x] Task 4: 任务表增加 system_id 字段 (task-schema.ts, task-manager.ts)
  - [x] 4.1 更新 `TASKS_SCHEMA` 增加可选 system_id 列
  - [x] 4.2 更新 `CreateTaskSpec` 接口增加 systemId 字段
  - [x] 4.3 任务完成 `registerProject` 时传入 systemId

- [x] Task 5: 前端 Project Store 增加系统状态 (stores/project.ts)
  - [x] 5.1 新增 `systems` 状态、`currentSystemId` 状态
  - [x] 5.2 新增 `fetchSystems()` action
  - [x] 5.3 `fetchProjects()` 传入 currentSystemId 过滤
  - [x] 5.4 `selectSystem()` action 更新 currentSystemId 并刷新项目
  - [x] 5.5 currentSystemId 持久化到 localStorage，初始化时恢复

- [x] Task 6: 前端首页增加系统切换下拉框 (views/Projects.vue)
  - [x] 6.1 在页面 hero 区左上角添加系统下拉选择器
  - [x] 6.2 支持创建新系统（内联输入或弹窗）
  - [x] 6.3 选择系统后重新加载项目列表
  - [x] 6.4 页面标题区展示当前系统名称

- [x] Task 7: 前端创建项目时绑定系统 (components/project/AddProjectDrawer.vue)
  - [x] 7.1 在表单中增加系统选择下拉框（必填）
  - [x] 7.2 Git Clone 和压缩包上传两种模式均添加系统选择
  - [x] 7.3 提交时将 systemId 传入创建接口

- [x] Task 8: 前端 API 层适配 (api/project.ts)
  - [x] 8.1 `listProjects()` 支持传入 systemId 参数
  - [x] 8.2 新增 `listSystems()`、`createSystem(name)`、`deleteSystem(id)` 方法

# Task Dependencies
- Task 2 depends on Task 1（系统接口依赖升级后的注册表）
- Task 3 depends on Task 1（项目过滤依赖新注册表方法）
- Task 4 depends on Task 1（任务关联系统 id）
- Task 5 depends on Task 2, Task 3（前端 store 依赖后端 API）
- Task 6 depends on Task 5（页面组件依赖 store 状态）
- Task 7 depends on Task 5, Task 2（创建表单依赖系统列表和 store）
- Task 8 depends on Task 2, Task 3（前端 API 层适配后端接口）
- Task 5 can be done in parallel with Task 6, Task 7, Task 8 after Task 2-4 complete
