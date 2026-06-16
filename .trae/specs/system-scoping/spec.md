# 系统级资源隔离 Spec

## Why
当前项目列表是全局扁平的，所有项目混合展示。随着项目数量增长，用户需要在不同业务系统之间快速切换视角，实现系统层面的资源隔离与分组管理。

## What Changes
- 引入「系统」概念：系统是一组项目的逻辑容器，一个系统下可有多个项目，每个项目属于唯一一个系统
- 扩展 `~/.codegraph-projects.json` 注册表结构，从扁平数组升级为带系统的结构化数据，并向后兼容旧格式
- 新增系统管理 API：列出/创建/删除系统
- 改造现有项目 API：支持按系统筛选项目列表
- 前端首页左上角增加系统切换下拉框，选择系统后仅展示该系统下的项目
- 项目创建（Git Clone / 压缩包上传）时绑定所属系统
- **BREAKING**: 注册表 JSON 结构变更，旧格式自动迁移到新格式

## Impact
- Affected specs: 项目列表展示、项目创建、注册表持久化
- Affected code:
  - `src/api/registry.ts` — 注册表结构升级，新增系统 CRUD
  - `src/api/routes/projects.ts` — 项目列表支持按 systemId 过滤，创建接口支持 systemId
  - `src/api/task-manager.ts` / `task-schema.ts` — 任务表增加 system_id 字段
  - `web/src/views/Projects.vue` — 首页增加系统选择器
  - `web/src/components/project/AddProjectDrawer.vue` — 创建时绑定系统
  - `web/src/stores/project.ts` — 增加系统状态管理
  - `web/src/api/project.ts` — 前端 API 适配

## ADDED Requirements

### Requirement: 系统管理
系统 SHALL 有唯一 ID、名称，系统列表持久化在注册表文件中。

#### Scenario: 创建系统
- **WHEN** 用户调用创建系统接口并提供系统名称
- **THEN** 系统创建成功并持久化到注册表，返回系统信息

#### Scenario: 列出所有系统
- **WHEN** 前端请求系统列表
- **THEN** 返回所有系统的 id、name 及项目数量

#### Scenario: 删除空系统
- **WHEN** 用户删除一个没有项目的系统
- **THEN** 系统被移除并持久化

#### Scenario: 拒绝删除非空系统
- **WHEN** 用户尝试删除一个仍有项目绑定的系统
- **THEN** 返回错误，拒绝删除

### Requirement: 项目与系统绑定
每个项目 SHALL 绑定到唯一一个系统。创建项目时必须指定系统。

#### Scenario: 创建项目时绑定系统
- **WHEN** 用户通过 Git Clone 或上传压缩包创建项目，并选择目标系统
- **THEN** 项目创建完成后自动归属到所选系统

#### Scenario: 旧项目迁移
- **WHEN** 系统检测到注册表为旧格式（projects 为字符串数组）
- **THEN** 自动创建默认系统，将所有已有项目迁移到默认系统下

### Requirement: 按系统筛选项目列表
首页 SHALL 仅展示当前选中系统下的项目。

#### Scenario: 选择系统后展示对应项目
- **WHEN** 用户在下拉框中选择某个系统
- **THEN** 项目列表仅展示该系统的项目，标题显示当前系统名称

#### Scenario: 默认选中第一个系统
- **WHEN** 用户首次打开首页
- **THEN** 默认选中第一个系统（或上次选择的系统，通过 localStorage 记忆）

### Requirement: 系统切换下拉框
首页左上角 SHALL 展示系统切换下拉框。

#### Scenario: 切换系统
- **WHEN** 用户点击下拉框选择另一个系统
- **THEN** 项目列表刷新为所选系统的项目，选择状态持久化到 localStorage

## MODIFIED Requirements

### Requirement: 项目列表展示
项目列表 API 新增可选 `systemId` 查询参数。传入时仅返回该系统的项目；不传时返回全部项目（保持兼容）。前端首页始终传入当前选中的 `systemId`。

### Requirement: 项目注册表结构
`~/.codegraph-projects.json` 结构从 `{ "projects": ["/path1", "/path2"] }` 升级为：
```json
{
  "version": 2,
  "systems": [
    { "id": "uuid", "name": "默认系统", "createdAt": "ISO" }
  ],
  "projects": [
    { "path": "/path/to/project", "systemId": "uuid" }
  ]
}
```
首次读取旧格式时自动执行迁移。
