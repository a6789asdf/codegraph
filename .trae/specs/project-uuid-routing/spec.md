# 项目 UUID 路由 Spec

## Why
当前项目相关 URL 使用文件系统绝对路径（如 `http://localhost:5173/projects/D:/Code/jacoco/dashboard`）作为项目唯一标识，不仅暴露服务器文件路径，且 URL 可读性差、编码复杂。需要改为使用 32 位 UUID 作为项目标识进行访问。

## What Changes
- 注册表中为每个项目自动生成 32 位 UUID（`id` 字段），作为项目唯一标识
- 后端新增 `:id` 参数路由，通过 UUID 解析项目路径后执行原有逻辑
- 前端路由参数 `:id` 的值从 `encodeURIComponent(path)` 切换为项目 UUID
- 前端所有 API 调用从传 `encodeURIComponent(path)` 改为传项目 UUID
- **BREAKING**: 已有项目在注册表升级时自动补全 UUID；旧版 `:path` 路由保留兼容但不再推荐使用

## Impact
- Affected specs: 无（新增独立 spec）
- Affected code:
  - `src/api/registry.ts` — 注册表数据结构、增删查改函数
  - `src/api/middleware.ts` — 新增 `projectIdResolver()` 中间件
  - `src/api/routes/*.ts` — 所有 11 个路由文件（共 42 条路由）新增 `:id` 版本
  - `src/api/index.ts` — 路由挂载顺序
  - `web/src/api/*.ts` — 全部 10 个前端 API 文件
  - `web/src/router/index.ts` — 无需改动（`:id` 参数名不变）
  - `web/src/views/*.vue` — 导航跳转使用 UUID
  - `web/src/stores/*.ts` — 存储 currentProject 从 path 改为 id

## ADDED Requirements

### Requirement: 注册表项目 UUID 标识
注册表中的每个项目条目 SHALL 包含一个 32 位 UUID 作为唯一标识符。

#### Scenario: 新建项目自动生成 UUID
- **WHEN** 通过 CLI `codegraph init` 或 API 注册新项目
- **THEN** 系统自动生成 32 位 UUID 并存入注册表 `projects[].id` 字段

#### Scenario: 已有项目升级补全 UUID
- **WHEN** 读取旧版注册表（ProjectEntry 无 `id` 字段）
- **THEN** 系统自动为每个缺失 `id` 的项目补全 UUID 并写回注册表

#### Scenario: 通过 UUID 查找项目路径
- **WHEN** 调用 `getProjectPathById(uuid)` 
- **THEN** 返回对应的项目绝对路径，若未找到则返回 `null`

### Requirement: 后端 UUID 路由解析
后端 SHALL 支持通过项目 UUID 访问所有项目相关 API。

#### Scenario: 通过 UUID 获取项目统计
- **WHEN** 客户端请求 `GET /api/projects/:id/stats`（`:id` 为 UUID）
- **THEN** 中间件解析 UUID → 项目路径 → 创建 CodeGraph 实例 → 返回统计信息

#### Scenario: 无效 UUID 返回 404
- **WHEN** 客户端请求 `GET /api/projects/<invalid-uuid>/stats`
- **THEN** 返回 `{ ok: false, error: "Project not found" }` 及 404 状态码

### Requirement: 前端 UUID 路由导航
前端所有项目内导航 SHALL 使用项目 UUID 作为路由参数值。

#### Scenario: 从项目列表打开项目
- **WHEN** 用户在项目列表点击某项目
- **THEN** 浏览器导航至 `/projects/<project-uuid>/dashboard`

#### Scenario: 项目内部子页面导航
- **WHEN** 用户在项目内导航至搜索页
- **THEN** 浏览器 URL 为 `/projects/<project-uuid>/search`

### Requirement: 前端 API 调用使用 UUID
前端所有项目相关 API 请求 SHALL 使用项目 UUID 替代 `encodeURIComponent(path)`。

#### Scenario: 获取项目统计
- **WHEN** 调用 `projectApi.getStats(projectId)`
- **THEN** 请求 `GET /api/projects/<project-uuid>/stats`

## MODIFIED Requirements

### Requirement: 注册表 ProjectEntry 结构
`ProjectEntry` 接口 SHALL 新增 `id: string` 字段。

**Before:**
```typescript
interface ProjectEntry {
  path: string;
  systemId: string;
}
```

**After:**
```typescript
interface ProjectEntry {
  id: string;     // 32位UUID，项目唯一标识
  path: string;
  systemId: string;
}
```

### Requirement: 项目列表 API 响应
`GET /api/projects` 响应中的每个项目对象 SHALL 包含 `id` 字段。

**Before:**
```json
{ "path": "/home/user/project", "name": "project", "initialized": true, "systemId": "uuid" }
```

**After:**
```json
{ "id": "uuid", "path": "/home/user/project", "name": "project", "initialized": true, "systemId": "uuid" }
```

### Requirement: 前端项目 Store 状态
`useProjectStore` 中的 `currentProject` SHALL 存储项目 UUID 而非路径。项目列表条目 SHALL 包含 `id` 字段。

### Requirement: 中间件实例缓存
`instanceCache` 的 key SHALL 同时支持路径和 UUID 两种索引方式，确保同一项目不重复建连。

## REMOVED Requirements
无移除的需求。
