# Checklist

## 后端注册表
- [x] `ProjectEntry` 接口包含 `id: string` 字段
- [x] 旧版注册表（项目无 `id` 字段）读取时自动补全 UUID
- [x] `registerProject()` 新注册项目自动生成 UUID
- [x] `getProjectPathById(uuid)` 能正确返回对应项目路径
- [x] `getProjectIdByPath(path)` 能正确返回对应项目 UUID
- [x] `GET /api/projects` 返回的每个项目对象包含 `id` 字段

## 后端中间件
- [x] `projectIdResolver()` 中间件正确解析 UUID → 路径 → CodeGraph 实例
- [x] 回退机制：UUID 未找到时按路径处理（向后兼容）

## 后端 `:id` 路由（共 42 条）
- [x] `GET /api/projects/:id/stats` 正常工作
- [x] `GET /api/projects/:id/status` 正常工作
- [x] `POST /api/projects/:id/index` 正常工作
- [x] `POST /api/projects/:id/sync` 正常工作
- [x] `GET /api/projects/:id/search` 正常工作
- [x] `GET /api/projects/:id/nodes/:nodeId` 正常工作
- [x] `GET /api/projects/:id/nodes/:nodeId/context` 正常工作
- [x] `GET /api/projects/:id/files` 正常工作
- [x] `GET /api/projects/:id/callers/:nodeId` 正常工作
- [x] `GET /api/projects/:id/callees/:nodeId` 正常工作
- [x] `GET /api/projects/:id/impact/:nodeId` 正常工作
- [x] `GET /api/projects/:id/traverse/:nodeId` 正常工作
- [x] `GET /api/projects/:id/path` 正常工作
- [x] `GET /api/projects/:id/call-graph/:nodeId` 正常工作
- [x] `GET /api/projects/:id/type-hierarchy/:nodeId` 正常工作
- [x] `GET /api/projects/:id/circular-deps` 正常工作
- [x] `GET /api/projects/:id/dead-code` 正常工作
- [x] `GET /api/projects/:id/file-deps/:filePath` 正常工作
- [x] `GET /api/projects/:id/file-dependents/:filePath` 正常工作
- [x] `GET /api/projects/:id/metrics/:nodeId` 正常工作
- [x] `GET /api/projects/:id/routes` 正常工作
- [x] `GET /api/projects/:id/top-route-file` 正常工作
- [x] `GET /api/projects/:id/frameworks` 正常工作
- [x] `GET /api/projects/:id/analysis/impact` 正常工作
- [x] `GET /api/projects/:id/analysis/communities` 正常工作
- [x] `GET /api/projects/:id/analysis/communities/:communityId` 正常工作
- [x] `GET /api/projects/:id/visualization/community-graph/:communityId` 正常工作
- [x] `GET /api/projects/:id/analysis/hub-nodes` 正常工作
- [x] `GET /api/projects/:id/analysis/bridge-nodes` 正常工作
- [x] `GET /api/projects/:id/analysis/knowledge-gaps` 正常工作
- [x] `GET /api/projects/:id/analysis/surprising-connections` 正常工作
- [x] `GET /api/projects/:id/visualization/graph-data` 正常工作
- [x] `GET /api/projects/:id/flows` 正常工作
- [x] `GET /api/projects/:id/flows/:flowId` 正常工作
- [x] `GET /api/projects/:id/review/detect-changes` 正常工作
- [x] `GET /api/projects/:id/review/context` 正常工作
- [x] `GET /api/projects/:id/refactor/dead-code` 正常工作
- [x] `GET /api/projects/:id/refactor/suggestions` 正常工作
- [x] `POST /api/projects/:id/refactor/preview-rename` 正常工作
- [x] `GET /api/projects/:id/wiki/pages` 正常工作
- [x] `GET /api/projects/:id/wiki/page/:pageId` 正常工作
- [x] `POST /api/projects/:id/wiki/generate` 正常工作

## 原有 `:path` 路由兼容
- [x] 中间件支持路径回退（`getProjectPathById(decoded) || decoded`），旧路径 URL 仍可正常访问

## 前端 API 层
- [x] `web/src/api/project.ts` 使用 `projectId` 替代 `encodeURIComponent(projectPath)`
- [x] `web/src/api/search.ts` 使用 `projectId` 替代 `encodeURIComponent(projectPath)`
- [x] `web/src/api/architecture.ts` 使用 `projectId` 替代 `encodeURIComponent(projectPath)`
- [x] `web/src/api/flows.ts` 使用 `projectId` 替代 `encodeURIComponent(projectPath)`
- [x] `web/src/api/review.ts` 使用 `projectId` 替代 `encodeURIComponent(projectPath)`
- [x] `web/src/api/refactor.ts` 使用 `projectId` 替代 `encodeURIComponent(projectPath)`
- [x] `web/src/api/wiki.ts` 使用 `projectId` 替代 `encodeURIComponent(projectPath)`
- [x] `web/src/api/quality.ts` 使用 `projectId` 替代 `encodeURIComponent(projectPath)`
- [x] `web/src/api/routes.ts` 使用 `projectId` 替代 `encodeURIComponent(projectPath)`
- [x] `web/src/api/analysis.ts` 使用 `projectId` 替代 `encodeURIComponent(projectPath)`

## 前端 Store
- [x] `useProjectStore.currentProject` 存储项目 UUID
- [x] `useProjectStore.projects` 列表中每个项目包含 `id` 字段
- [x] `useProjectStore.selectProject(id)` 接收 UUID 参数
- [x] 通过 Store 调用的 API 均传递正确的项目 UUID

## 前端视图
- [x] 项目列表页点击项目后 URL 为 `/projects/<uuid>/dashboard`
- [x] 项目内各子页面 URL 均为 `/projects/<uuid>/...`
- [x] 搜索页跨页面导航使用 UUID 而非编码路径
