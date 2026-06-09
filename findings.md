# Findings & Decisions

## Requirements

- 支持 HTTPS Token 凭证（用户名 + Token）
- 支持 SSH Key 凭证（私钥内容 + 可选 passphrase）
- 凭证加密持久化到本地（AES-256-GCM，密钥文件 ~/.codegraph/.credkey）
- 创建 clone 任务时显式选择凭证（下拉框）
- 凭证管理 UI 独立入口（CredentialDrawer）
- 旧任务兼容（credential_id 为空即公开仓库）
- 删除凭证不影响已完成任务
- 临时文件（ASKPASS 脚本/SSH Key）使用后立即清理
- API 永不返回密文/明文
- 零新增外部 npm 依赖

## Research Findings

- Node 内置 `crypto` 支持 `aes-256-gcm`，创建 `createCipheriv('aes-256-gcm', key, iv)` 即可
- GIT_ASKPASS 机制：git 需要凭证时会调用 GIT_ASKPASS 环境变量指向的程序，参数为 "Username for 'xxx'" 或 "Password for 'xxx'"
- 设置 `GIT_TERMINAL_PROMPT=0` 防止 git fallback 到终端交互
- SSH 注入用 `GIT_SSH_COMMAND` 和 `SSH_ASKPASS` + `SSH_ASKPASS_REQUIRE=force` + `DISPLAY=:0`（仅 passphrase 时需 SSH_ASKPASS）
- SSH `IdentitiesOnly=yes` 防止 ssh 使用 agent 中其他 key
- `StrictHostKeyChecking=no` + `UserKnownHostsFile=/dev/null` 跳过首次主机验证（自动化场景必须）
- 项目使用 `node:sqlite` (DatabaseSync) 而非 `better-sqlite3`，遵循现有模式
- 项目前端使用 Vue 3 + Ant Design Vue 3 + Pinia，遵循现有 Drawer/Tabs/Form 模式
- 现有 `task-manager.ts` 中 TaskManager.create() 直接 new DatabaseSync，需抽离为共享函数
- PRAGMA 配置：busy_timeout=5000、journal_mode=WAL、foreign_keys=ON

## Technical Decisions

| Decision | Rationale |
|----------|-----------|
| 用 `node:sqlite` 的 DatabaseSync | 与项目现有 db 使用方式一致 |
| 遵循 Hono 路由风格 | 与现有 projects/tasks 路由一致 |
| 凭证表存 tasks.db 同库 | 启动时一次连接，减少文件碎片 |
| GIT_ASKPASS 临时脚本 | 避免 token 出现在 URL/进程列表/日志 |
| 临时文件 UUID 命名 + finally | 防冲突 + 保证清理 |
| Windows .cmd vs POSIX .sh | 平台分支，Git for Windows 支持 .cmd 作为 GIT_ASKPASS |
| CredentialDrawer 独立组件 | 可在多处复用（未来顶栏入口） |
| 编辑时前端不传空 secret | 后端 `updateCredential` 检查 `secret` 字段是否传入，未传入则保留原密文 |

## Resources

- Spec: `docs/superpowers/specs/2026-06-09-git-credential-config-design.md`
- 关联 Spec: `docs/superpowers/specs/2026-06-09-project-management-page-design.md`
- source-fetcher.ts: `src/api/source-fetcher.ts`
- task-manager.ts: `src/api/task-manager.ts`
- task-schema.ts: `src/api/task-schema.ts`
- AddProjectDrawer.vue: `web/src/components/project/AddProjectDrawer.vue`
- Projects.vue: `web/src/views/Projects.vue`
- task store: `web/src/stores/task.ts`
- project store: `web/src/stores/project.ts`
- credential API 参考: `web/src/api/task.ts`
- Git credentials docs: https://git-scm.com/docs/gitcredentials
- Node crypto AES-GCM: https://nodejs.org/api/crypto.html#class-cipher

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| (无，实施阶段记录) | |

## Visual/Browser Findings

- CredentialDrawer 设计：独立 Drawer 520px 宽，内部 `<a-tabs>` 切换"凭证列表"和"新建/编辑"，遵循 AddProjectDrawer 风格
- 凭证下拉框展示：类型 Tag（HTTPS 蓝色/SSH 绿色）+ 名称，遵循 Ant Design Vue Select 自定义 option 模式
