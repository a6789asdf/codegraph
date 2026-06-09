# Task Plan: Git 代码拉取支持密钥配置

## Goal
为 CodeGraph 的 Git 仓库拉取增加凭证配置能力，支持 HTTPS Token 和 SSH Key 两种凭证的加密持久化、显式选择和安全注入。

## Current Phase
Phase 1

## Phases

### Phase 1: Backend Core — 凭证基础服务
- [ ] 共享 DB 抽象：新增 `src/api/shared-db.ts`，抽离 `~/.codegraph-tasks.db` 连接逻辑
- [ ] `CredentialService` 实现：CRUD + AES-256-GCM 加解密 + 密钥文件管理
- [ ] `task-schema.ts` migration：新增 credentials 表 + tasks 表 credential_id 字段
- [ ] `TaskManager` 扩展：任务执行时解析凭证、传递给 SourceFetcher
- [ ] 单元测试：credential-service、task-manager-cred
- **Status:** pending

### Phase 2: 凭证注入 — SourceFetcher 扩展
- [ ] `FetchOptions` 新增 `credential` 参数
- [ ] HTTPS 注入：`withHttpsCredential`（GIT_ASKPASS 临时脚本）
- [ ] SSH 注入：`withSshCredential`（GIT_SSH_COMMAND + 临时密钥文件）
- [ ] `cloneRepo` 重构：按凭证类型分发到不同注入函数
- [ ] 单元测试：source-fetcher-cred
- **Status:** pending

### Phase 3: Backend API — 路由层
- [ ] `credential-shared.ts` 单例
- [ ] `credentials.ts` 路由：GET/POST/PUT/DELETE /api/credentials
- [ ] `/projects/clone` 端点改造：接受 credentialId，校验凭证存在
- [ ] 路由注册到 `src/api/index.ts`
- [ ] 单元测试：credentials-route
- **Status:** pending

### Phase 4: Frontend — API 层与状态管理
- [ ] `web/src/api/credential.ts`：HTTP 调用封装
- [ ] `web/src/stores/credential.ts`：Pinia store
- [ ] `web/src/api/task.ts`：createClone payload 增加 credentialId
- **Status:** pending

### Phase 5: Frontend — UI 组件实现
- [ ] `CredentialDrawer.vue`：凭证管理侧滑面板（列表 + 新建/编辑表单）
- [ ] `AddProjectDrawer.vue` 改造：Git Tab 增加凭证选择下拉框
- [ ] `Projects.vue` 改造：标题区增加"凭证管理"按钮
- **Status:** pending

### Phase 6: 测试与文档
- [ ] 集成测试：credential-clone 全流程
- [ ] 手动 QA 清单验证（前端）
- [ ] 文档更新：CLAUDE.md / README.md 补充凭证配置说明
- **Status:** pending

## Key Questions
1. HTTPS GIT_ASKPASS 脚本在 Windows 上的行为是否正确？ — 需在 Windows 上手动验证 .cmd 脚本的 GIT_ASKPASS 机制
2. SSH passphrase 注入与 SSH_ASKPASS 在不同 SSH 版本上的兼容性？ — 在 CI 中可能需要 skip SSH 集成测试
3. 编辑凭证时不填密文 → 保持原值的逻辑是否正确？ — 前端"空字符串不提交"需严格测试

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| AES-256-GCM 加密 | Node 内置 crypto，认证加密防篡改 |
| 随机密钥文件 .credkey | 零用户交互，实现简单 |
| GIT_ASKPASS 注入 (非 URL) | Token 不出现在进程列表/日志/URL 中 |
| GIT_SSH_COMMAND 注入 | 标准 SSH 注入方式，支持 IdentitiesOnly |
| 凭证表与任务表同库 | 复用现有 db 连接，减少文件碎片 |
| 凭证与任务无外键 | 允许删除凭证不影响历史任务记录 |
| API 不返回密文/明文 | 响应体仅含元数据，减小泄露面 |
| 前端编辑时不回填密文 | 占位符方案，空字符串不提交保留原值 |
| 零外部依赖 | crypto/fs/os 均为 Node 内置 |

## Notes
- Spec 文件: `docs/superpowers/specs/2026-06-09-git-credential-config-design.md`
- 关联 Spec: `docs/superpowers/specs/2026-06-09-project-management-page-design.md`
- 更新 phase 状态: pending → in_progress → complete
- 实施前重读本计划文件
- 记录所有错误到本表
