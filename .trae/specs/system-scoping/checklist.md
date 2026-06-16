# Checklist: 系统级资源隔离

- [x] 旧格式注册表（projects 为 string[]）首次读取时自动迁移为新格式，不丢失数据
- [x] `GET /api/systems` 返回系统列表，包含每个系统下的项目数量
- [x] `POST /api/systems` 可创建新系统，名称必填
- [x] `DELETE /api/systems/:id` 删除空系统成功，删除非空系统返回错误
- [x] `GET /api/projects?systemId=xxx` 仅返回指定系统的项目
- [x] `POST /api/projects/clone` 和 `POST /api/projects/upload` 支持 systemId 参数，项目完成后正确归属到指定系统
- [x] 任务表 tasks 正确存储并传递 system_id
- [x] 首页左上角展示系统切换下拉框，列出所有系统
- [x] 选择系统后项目列表实时更新为该系统的项目
- [x] 默认系统为「默认系统」，用户可在下拉框中切换
- [x] 系统选择持久化到 localStorage，刷新页面后保持选中状态
- [x] 创建项目（Git Clone / 压缩包上传）时表单包含系统选择
- [x] 页面标题/副标题区域展示当前选中的系统名称
