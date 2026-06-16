# 变更影响分析服务设计文档

**日期**: 2026-06-16（初稿）/ 2026-06-17（基于高保真原型重构）
**状态**: 设计完成，待审核
**高保真原型**: `change-impact-analysis-mockup.html`

---

## 1. 概述

在 CodeGraph 项目内扩展**变更影响分析**功能，支持用户创建分析任务，异步执行 git diff 变更识别与影响分析，生成报告并支持人工分析结论和导出。

本设计基于高保真原型 `change-impact-analysis-mockup.html`（3185 行，暗色主题，纯原生 HTML/CSS/JS 实现）进行落地设计，对接 CodeGraph 现有的 Hono API、TaskManager 异步任务模式、SQLite WAL 持久化、Vue 3 + Ant Design Vue 前端。

### 1.1 核心价值

- **基于 CodeGraph 知识图谱**：复用已有的 22 种节点类型、影响半径计算（`getImpactRadius`）、引用查找（`findUsages`）能力
- **节点优先级机制**：P0/P1/P2/P3 四级优先级，按语义分组加权计算风险评分
- **迭代内多提交支持**：一个变更项可关联多个 git commit，按时间线倒序展示
- **双模式详情交互**：行内展开（快速浏览）与侧边抽屉（深度审查）两种视图模式
- **企业级多仓库**：支持 50000+ 文件、月度变更 2000+ 文件，5-10 分钟内完成

---

## 2. 需求

### 2.1 核心流程

```
创建系统 → 创建项目（绑定仓库+凭证）→ 创建分析任务（选择版本范围）
→ 异步执行（git diff → 变更分类 → 影响分析 → 报告生成）
→ 查看报告（概览卡片 + 树形目录 + 变更项列表）
→ 变更项详情（Diff + 提交信息 + 影响节点 + 分析结论）
→ 提交结论 → 导出报告
```

### 2.2 功能需求

| 需求 | 说明 |
|------|------|
| **系统/项目管理** | 多层级组织：系统 → 项目 → 仓库（多仓库），项目绑定 Git 凭证 |
| **变更识别** | 支持 code/config/sql/script/other 五类变更，按 CodeGraph 节点类型语义化展示 |
| **影响分析** | 基于 CodeGraph 图谱计算影响半径，按节点优先级加权评分 |
| **LLM 深度分析** | 可选功能，适配器模式支持多后端（OpenAI/DeepSeek/通义千问/自定义） |
| **报告导出** | Markdown / PDF / CSV / HTML 四种格式 |
| **代码来源** | 混合模式（本地 Git + 远程 Git API） |
| **多提交支持** | 迭代内一个变更项可关联多个 commit，按时间线展示 |
| **批量操作** | 批量 LLM 分析、批量标记已结论 |
| **性能目标** | 企业级多仓库（50000+ 文件，月度变更 2000+ 文件），5-10 分钟内完成 |

---

## 3. 架构决策

**方案选择**: 扩展 CodeGraph API + SQLite 队列（轻量方案）

**理由**:
- 零外部依赖，复用 CodeGraph 现有的 TaskManager 异步任务模式、Hono API 框架、SQLite WAL 持久化
- 复用现有的 `CredentialService`（AES-256-GCM 加密）、`shared-db`（`~/.codegraph-tasks.db`）
- 复用现有的 `GraphTraverser.getImpactRadius` / `findUsages` / `getNodesInFile` 核心算法
- 通过 `worker_threads` 实现多仓库并行处理

---

## 4. 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│              Vue 3 前端 (Ant Design Vue 4)                    │
│  /                              → 项目管理首页                │
│  /projects/:id/tasks            → 任务管理页                  │
│  /projects/:id/tasks/:taskId    → 报告分析页                  │
│  /settings                      → 系统设置页                  │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP API / SSE
┌──────────────────────▼──────────────────────────────────────┐
│              CodeGraph Hono API (扩展)                        │
│  /api/systems/*                 ← 系统管理（已有）            │
│  /api/projects/*                ← 项目管理（已有）            │
│  /api/credentials/*             ← 凭证管理（已有）            │
│  /api/projects/:id/change-analysis/*  ← 变更分析（新增）      │
│  /api/change-analysis/reports/*       ← 报告查询（新增）      │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│           ChangeAnalysisManager (新增核心模块)                │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐       │
│  │ GitDiffEngine│  │ImpactEngine  │  │ LLMAnalyzer   │       │
│  │ git diff解析 │  │CodeGraph图谱 │  │ 可选深度分析   │       │
│  │ 变更分类     │  │影响半径计算   │  │ 多后端可配置   │       │
│  │ 节点映射     │  │优先级加权     │  │               │       │
│  └─────────────┘  └──────────────┘  └───────────────┘       │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ SQLite 任务队列 (复用 shared-db 模式)                 │    │
│  │ change_tasks + change_reports + change_items +       │    │
│  │ change_commits + change_impacted_nodes               │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. 数据模型

数据库文件: `~/.codegraph-change-analysis.db`，SQLite WAL 模式（`busy_timeout=5000`、`journal_mode=WAL`、`foreign_keys=ON`），与现有 `~/.codegraph-tasks.db` 模式一致。

### 5.1 change_tasks — 分析任务

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| system_id | TEXT NOT NULL | 关联系统 |
| project_id | TEXT NOT NULL | 关联 CodeGraph 项目 |
| name | TEXT NOT NULL | 任务名称 |
| description | TEXT | 任务描述 |
| repo_refs | TEXT NOT NULL | JSON: 仓库版本范围数组 `[{repo_id, from_ref, to_ref}]` |
| impact_depth | INTEGER NOT NULL DEFAULT 2 | 影响分析深度（1/2/3） |
| status | TEXT NOT NULL | pending / running / completed / failed |
| stage | TEXT | 当前执行阶段 |
| progress_pct | INTEGER | 进度百分比 0-100 |
| error_message | TEXT | 错误信息 |
| creator | TEXT | 创建人 |
| created_at | TEXT NOT NULL | ISO 时间戳 |
| updated_at | TEXT NOT NULL | |
| started_at | TEXT | |
| completed_at | TEXT | |

**任务状态机**: `pending → running → completed/failed`，failed 可 retry 回到 pending。

**执行阶段**: `diffing → classifying → analyzing → generating_report → completed`

### 5.2 change_reports — 分析报告

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| task_id | TEXT NOT NULL UNIQUE | 一对一关联任务 |
| project_id | TEXT NOT NULL | 项目 ID |
| from_refs | TEXT NOT NULL | JSON: 起始版本数组 |
| to_refs | TEXT NOT NULL | JSON: 目标版本数组 |
| total_files | INTEGER | 变更文件总数 |
| total_items | INTEGER | 变更项总数 |
| total_commits | INTEGER | 提交总数 |
| risk_score | REAL | 综合风险评分 0-1 |
| risk_level | TEXT | low / medium / high / critical |
| category_distribution | TEXT | JSON: 分类分布 `{code, config, sql, script, other}` |
| risk_distribution | TEXT | JSON: 风险分布 `{critical, high, medium, low}` |
| priority_distribution | TEXT | JSON: 优先级分布 `{P0, P1, P2, P3}` |
| analyzed_count | INTEGER | 已分析数 |
| concluded_count | INTEGER | 已结论数 |
| summary | TEXT | AI 生成的摘要 |
| created_at | TEXT NOT NULL | |
| updated_at | TEXT NOT NULL | |

### 5.3 change_items — 变更项

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| report_id | TEXT NOT NULL | 关联报告 |
| repo_id | TEXT NOT NULL | 仓库标识 |
| category | TEXT NOT NULL | code / config / sql / script / other |
| category_label | TEXT NOT NULL | 分类显示文本 |
| change_type | TEXT NOT NULL | added / modified / deleted / renamed |
| file_path | TEXT NOT NULL | 文件路径 |
| old_path | TEXT | renamed 时的原路径 |
| language | TEXT | 代码语言 |
| **node_kind** | TEXT | **CodeGraph 节点类型（22 种之一）** |
| **qualified_name** | TEXT | **节点全限定名（主标题）** |
| **signature** | TEXT | **节点签名（副标题）** |
| **priority** | TEXT | **派生字段：P0/P1/P2/P3（由 node_kind 映射）** |
| add_lines | INTEGER | 新增行数 |
| del_lines | INTEGER | 删除行数 |
| authors | TEXT | JSON: 变更人员数组 |
| impacted_nodes_count | INTEGER | 受影响节点数 |
| impacted_nodes | TEXT | JSON: 受影响节点列表（按优先级分组） |
| affected_tests | TEXT | JSON: 受影响测试列表 |
| risk_score | REAL | 单项风险评分 0-1 |
| risk_level | TEXT | low / medium / high / critical |
| analysis_status | TEXT | pending / analyzing / concluded |
| impact_level | TEXT | none / low / medium / high / critical |
| risk_description | TEXT | 风险描述 |
| mitigation | TEXT | 建议措施 |
| conclusion | TEXT | 最终结论 |
| analyzed_by | TEXT | 分析人 |
| analyzed_at | TEXT | 分析时间 |
| llm_analysis | TEXT | JSON: LLM 生成的分析 |
| diff_content | TEXT | JSON: diff 行数组 `[{type, num, text}]` |
| created_at | TEXT NOT NULL | |
| updated_at | TEXT NOT NULL | |

### 5.4 change_commits — 提交信息（新增，支持多提交）

一个变更项在迭代内可能关联多个 git commit。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| item_id | TEXT NOT NULL | 关联变更项 |
| commit_hash | TEXT NOT NULL | commit hash（7 位短 hash） |
| author | TEXT NOT NULL | 提交人 |
| committed_at | TEXT NOT NULL | 提交时间 |
| message | TEXT NOT NULL | 提交信息 |
| seq | INTEGER NOT NULL | 序号（0 = 最早，渲染时倒序） |
| created_at | TEXT NOT NULL | |

**索引**: `(item_id, seq)` 复合索引。

### 5.5 change_impacted_nodes — 受影响节点（新增，支持分组展示）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| item_id | TEXT NOT NULL | 关联变更项 |
| node_id | TEXT NOT NULL | CodeGraph 节点 ID |
| node_kind | TEXT NOT NULL | 节点类型 |
| node_name | TEXT NOT NULL | 节点名称 |
| priority | TEXT NOT NULL | P0/P1/P2/P3 |
| relation | TEXT | 关系类型（直接调用/深度 N/直接导出/类型引用等） |
| depth | INTEGER | 影响深度 |
| created_at | TEXT NOT NULL | |

**索引**: `(item_id, priority)` 复合索引，用于按优先级分组查询。

---

## 6. CodeGraph 节点类型与优先级机制

### 6.1 22 种 NodeKind 完整列表

源自 `src/types.ts` 的 `NODE_KINDS` 数组，按语义分组映射为 P0-P3 四级优先级。

| 优先级 | NodeKind | 显示标签 | 权重 | 语义分组 |
|--------|----------|----------|------|----------|
| **P0 跨边界契约** | `route` | route | ×1.5 | HTTP 路由 |
| | `interface` | interface | ×1.5 | 接口定义 |
| | `protocol` | protocol | ×1.5 | 协议 |
| | `trait` | trait | ×1.5 | Trait（Rust/PHP） |
| | `export` | export | ×1.5 | 模块导出 |
| | `api_method` | method(API) | ×1.5 | API 方法（自定义标签） |
| | `sql_method` | method(SQL) | ×1.5 | SQL 方法（MyBatis 等，自定义标签） |
| **P1 行为变更** | `function` | function | ×1.3 | 函数 |
| | `method` | method | ×1.3 | 方法 |
| | `class` | class | ×1.3 | 类 |
| | `struct` | struct | ×1.3 | 结构体 |
| | `component` | component | ×1.3 | 前端组件 |
| **P2 配置/类型** | `enum` | enum | ×0.8 | 枚举 |
| | `enum_member` | enum_member | ×0.8 | 枚举成员 |
| | `constant` | constant | ×0.8 | 常量 |
| | `type_alias` | type_alias | ×0.8 | 类型别名 |
| | `field` | field | ×0.8 | 字段 |
| | `property` | property | ×0.8 | 属性 |
| **P3 局部** | `variable` | variable | ×0.5 | 变量 |
| | `parameter` | parameter | ×0.5 | 参数 |
| | `import` | import | ×0.5 | 导入 |
| | `namespace` | namespace | ×0.5 | 命名空间 |
| | `module` | module | ×0.5 | 模块 |
| | `file` | file | ×0.5 | 文件 |

> **注**: `api_method` 与 `sql_method` 为业务层自定义标签，底层仍映射为 `method` 节点类型，通过文件路径/签名特征识别（如 `@Mapping` 注解 → api_method，MyBatis XML mapper → sql_method）。

### 6.2 风险评分公式

```
单项风险评分 = min(1, 基础分(diff复杂度) × 节点优先级权重)

基础分 = min(1, impactedNodes × 0.05 + affectedTests × 0.1)

综合风险评分 = Σ(单项风险评分) / 变更项总数
```

风险等级映射: `>0.7 → critical, >0.5 → high, >0.3 → medium, else → low`

### 6.3 节点类型语义化展示

变更项根据 `node_kind` 差异化展示图标与标题：

| node_kind | 图标 | 主标题 | 副标题 |
|-----------|------|--------|--------|
| `route` | 🌐 | qualifiedName | path · signature |
| `interface`/`protocol`/`trait` | 🔌 | qualifiedName | path · signature |
| `export` | 📤 | `export {qn}` | path |
| `api_method` | ⚙️ | qualifiedName | path · signature |
| `sql_method` | 🗄️ | qualifiedName | path · signature |
| `function` | ƒ | qualifiedName | path |
| `method` | Ⓜ | qualifiedName | path |
| `class` | 🏛 | `class {qn}` | path · signature |
| `struct` | STRUCT | `struct {qn}` | path |
| `component` | 🧩 | `<{qn} />` | path |
| `enum` | ENUM | `enum {qn}` | path · signature |
| `constant` | 🔒 | qualifiedName | path · signature |
| `variable` | VAR | qualifiedName | path · signature |
| default | 📄 | qualifiedName | path |

---

## 7. 核心模块

### 7.1 GitDiffEngine — 变更内容识别与分类

**输入**: `repo_refs[]`（仓库版本范围数组）、仓库路径、凭证
**输出**: `ChangeItem[]`（分类后的变更项列表，含节点映射）

**流程**:
1. 对每个仓库执行 `git diff --stat from_ref to_ref` → 获取变更文件列表
2. `git log from_ref..to_ref --format="%H|%an|%ae|%at|%s" -- {file}` → 获取每个文件的提交历史（支持多提交）
3. `git diff from_ref to_ref -- {file}` → 获取每个文件的详细 diff
4. 按文件扩展名/内容特征自动分类:
   - **代码类**: .ts/.js/.py/.java/.go/.rs/.cs/.php/.rb/.swift/.kt 等
   - **配置类**: .yaml/.yml/.json/.xml/.properties/.env/.toml/.ini/.conf/.cfg
   - **SQL类**: .sql 文件 + 内容包含 DDL/DML 语句的文件
   - **脚本类**: .sh/.bat/.ps1/.lua/.rb/.pl 等
   - **其他**: 无法归类的文件
5. 解析 diff 统计: +行数/-行数/变更类型（added/modified/deleted/renamed）
6. **节点映射**: 对代码类文件，调用 `CodeGraph.getNodesInFile(filePath)` 获取文件中的节点，将 diff hunk 与节点位置匹配，确定 `node_kind`、`qualified_name`、`signature`
7. **优先级派生**: 根据 `node_kind` 查询优先级映射表，派生 `priority` 字段
8. **提交关联**: 将步骤 2 获取的提交历史与变更项关联，写入 `change_commits` 表

### 7.2 ImpactEngine — 影响半径计算

**输入**: `ChangeItem[]` + CodeGraph 实例
**输出**: 每个 ChangeItem 的 `impacted_nodes` + `affected_tests` + `risk_score`

**流程**:
- 对每个代码类变更项:
  1. 获取文件中所有节点 (`CodeGraph.getNodesInFile`)
  2. 计算影响半径 (`CodeGraph.getImpactRadius`, depth=配置值)
  3. 查找受影响测试 (`CodeGraph.findUsages` + test 文件过滤)
  4. 按节点优先级分组受影响节点（P0/P1/P2/P3）
  5. 计算风险评分（基础分 × 优先级权重）
- 对配置/SQL/脚本类:
  1. 文本匹配查找引用
  2. 基于文件路径启发式推断影响范围

**复用现有代码**:
- `src/graph/traversal.ts:466` — `GraphTraverser.getImpactRadius(nodeId, maxDepth)`
- `src/graph/traversal.ts:440` — `GraphTraverser.findUsages(nodeId)`
- `src/index.ts:682` — `CodeGraph.getNodesInFile(filePath)`
- `src/index.ts:875` — `CodeGraph.getImpactRadius(nodeId, maxDepth)`
- `src/index.ts:840` — `CodeGraph.findUsages(nodeId)`

### 7.3 LLMAnalyzer — 可选 LLM 深度分析

**适配器模式**:
```typescript
interface LLMProvider {
  id: string;
  name: string;
  analyze(prompt: string, context: string): Promise<string>;
}
```

**内置适配器**:
- `OpenAIProvider`: GPT-4/GPT-4o，通过 OpenAI API
- `DeepSeekProvider`: DeepSeek，兼容 OpenAI API 格式
- `QwenProvider`: 通义千问，通过 DashScope API
- `CustomProvider`: 自定义 HTTP 端点，用户配置 URL 和请求格式

**配置方式**: 环境变量或前端设置页面
- `CHANGE_ANALYSIS_LLM_PROVIDER`: 选择的 provider
- `CHANGE_ANALYSIS_LLM_API_KEY`: API Key
- `CHANGE_ANALYSIS_LLM_BASE_URL`: 自定义端点
- `CHANGE_ANALYSIS_LLM_MODEL`: 模型名称

### 7.4 ChangeAnalysisManager — 任务编排

**复用 TaskManager 模式**（`src/api/task-manager.ts`）:
- `createTask()` → 入队
- `scheduleTask()` → `worker_threads` 并行执行
- 任务状态机: `pending → running → completed/failed`
- 执行阶段: `diffing → classifying → analyzing → generating_report → completed`
- `MAX_CONCURRENT = 3`（可通过 `CHANGE_ANALYSIS_MAX_CONCURRENT` 配置）
- `recoverOnStartup()`: 服务重启时将 running 状态的任务标记为 failed

---

## 8. API 设计

所有路由挂载在 CodeGraph 现有 Hono API 下，新增路由组 `change-analysis`。

### 8.1 任务管理

```
POST   /api/projects/:id/change-analysis/tasks              创建分析任务
GET    /api/projects/:id/change-analysis/tasks              列出任务
GET    /api/projects/:id/change-analysis/tasks/:taskId      获取任务详情（含进度）
POST   /api/projects/:id/change-analysis/tasks/:taskId/retry  重试失败任务
DELETE /api/projects/:id/change-analysis/tasks/:taskId      删除任务
```

**创建任务请求体**:
```json
{
  "name": "6月迭代变更分析",
  "description": "v2.0.0 到 v2.1.0 的变更",
  "repo_refs": [
    {"repo_id": "user-service", "from_ref": "v2.0.0", "to_ref": "v2.1.0"},
    {"repo_id": "user-service-common", "from_ref": "v1.4.0", "to_ref": "v1.5.0"}
  ],
  "impact_depth": 2
}
```

### 8.2 报告查询

```
GET    /api/change-analysis/reports/:reportId                   报告详情（含概览统计）
GET    /api/change-analysis/reports/:reportId/items             变更项列表（分页/筛选）
GET    /api/change-analysis/reports/:reportId/items/:itemId     变更项详情（含 commits + impacted_nodes）
GET    /api/change-analysis/reports/:reportId/tree              树形目录结构
```

**变更项列表查询参数**:
- `category`: 按分类筛选 (code/config/sql/script/other)
- `priority`: 按优先级筛选 (P0/P1/P2/P3)
- `node_kind`: 按节点类型筛选（22 种之一）
- `risk_level`: 按风险等级筛选 (critical/high/medium/low)
- `analysis_status`: 按分析状态筛选 (pending/analyzing/concluded)
- `tree_node`: 树形目录节点 ID（按仓库/目录/文件筛选）
- `page` / `pageSize`: 分页（默认 page=1, pageSize=50）

**变更项详情响应**:
```json
{
  "item": { "...change_items 字段..." },
  "commits": [
    {"hash": "a1b2c3d", "author": "张三", "time": "2026-06-17T09:13:00Z", "message": "fix(auth): ...", "seq": 0},
    {"hash": "f4e5d6c", "author": "李四", "time": "2026-06-17T10:13:00Z", "message": "fix: 根据 PR 评审...", "seq": 1}
  ],
  "impacted_nodes": {
    "P0": [{"node_id": "...", "node_kind": "route", "node_name": "GET /api/v1/auth/verify", "relation": "直接调用", "depth": 1}],
    "P1": [...],
    "P2": [...],
    "P3": [...]
  },
  "diff": [{"type": "context", "num": 42, "text": "def validate_token(...):"}]
}
```

### 8.3 分析结论

```
PUT    /api/change-analysis/reports/:reportId/items/:itemId/analysis    提交/更新分析结论
POST   /api/change-analysis/reports/:reportId/items/:itemId/llm-analyze  触发 LLM 深度分析
POST   /api/change-analysis/reports/:reportId/batch-analyze             批量提交分析结论
POST   /api/change-analysis/reports/:reportId/batch-llm-analyze         批量 LLM 分析
```

**分析结论请求体**:
```json
{
  "impact_level": "high",
  "risk_description": "该接口变更影响所有下游服务",
  "mitigation": "需要通知下游团队并做兼容性测试",
  "conclusion": "高风险变更，需回归测试"
}
```

### 8.4 报告导出

```
GET    /api/change-analysis/reports/:reportId/export?format=markdown
GET    /api/change-analysis/reports/:reportId/export?format=pdf
GET    /api/change-analysis/reports/:reportId/export?format=csv
GET    /api/change-analysis/reports/:reportId/export?format=html
```

### 8.5 SSE 进度推送

```
GET    /api/projects/:id/change-analysis/tasks/:taskId/events
```

**SSE 事件格式**:
```
event: progress
data: {"stage": "analyzing", "progress_pct": 60, "message": "正在分析影响范围..."}

event: completed
data: {"reportId": "xxx", "totalItems": 150}

event: failed
data: {"error": "git diff failed: invalid ref v2.0.0"}
```

---

## 9. 前端设计

### 9.1 路由设计

```
/                                      → HomeView.vue           项目管理首页
/projects/:projectId/tasks             → TaskListView.vue       任务管理页
/projects/:projectId/tasks/:taskId     → ReportView.vue         报告分析页
/settings                              → SettingsView.vue       系统设置页
```

**设置页 toggle 机制**: 齿轮按钮记录 `previousPage` 与 `previousNavIndex`，再次点击返回原页面。

### 9.2 全局布局

```
┌──────────────────────────────────────────────────────────┐
│ ┌────────┐  ┌──────────────────────────────────────────┐ │
│ │ 全局    │  │  上下文面包屑（任务页/报告页，sticky）      │ │
│ │ 导航    │  ├──────────────────────────────────────────┤ │
│ │ 220px  │  │                                          │ │
│ │        │  │  页面内容区（padding 28px 36px）           │ │
│ │ 项目管理│  │                                          │ │
│ │ 任务管理│  │                                          │ │
│ │ 报告分析│  │                                          │ │
│ │        │  │                                          │ │
│ │ ──────│  │                                          │ │
│ │ ⚙ 设置 │  │                                          │ │
│ └────────┘  └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

**全局导航**（固定左侧 220px）:
- 品牌区：渐变图标 + 「变更影响分析」+ 副标题「Change Impact Analysis」
- 导航项：项目管理 / 任务管理（badge）/ 报告分析
- 底部：用户头像 + 用户名 + 角色 + 齿轮按钮

### 9.3 项目管理首页 — HomeView.vue

**顶部标题栏**（sticky）:
- 系统选择器（下拉，显示系统列表 + 项目数）
- 「+ 新建系统」按钮

**项目列表区**:
- 标题「项目列表」+ 项目计数 + 「+ 创建项目」按钮
- 项目表格（sticky 列）：项目名 / 仓库数 / 任务数 / 创建人 / 创建时间 / 操作
- 分页

**创建项目模态框**:
- 归属系统（disabled，自动填充）
- 项目名称
- 代码仓库（多行动态添加）:
  - 仓库地址 input
  - 分支 input
  - 凭证 select（无凭证 / GitHub Token / GitLab Key / + 新建凭证）
  - 校验按钮（点击后异步校验，显示 ✓/✗ 状态）
  - 移除按钮

### 9.4 任务管理页 — TaskListView.vue

**上下文面包屑**（sticky 顶部）:
- 系统 / {系统名}（下拉）
- 项目 / {项目名}（下拉）

**页面头部**:
- 标题「变更影响分析任务」
- 副标题（项目名 · 仓库数 · 描述）
- 「+ 创建任务」按钮

**任务表格**（sticky 工具栏 + 表格）:
- 工具栏 inline-tab: 全部(N) / 运行中(N) / 已完成(N) / 失败(N)
- 表格列: 任务名 / 仓库版本范围 / 状态+进度（合并列，运行中显示进度条+脉冲动画）/ 变更摘要（文件数/项数/风险分）/ 耗时 / 创建人 / 创建时间 / 操作
- 操作列 sticky 右侧: 查看报告（completed）/ 重试（failed）/ 删除

**创建任务模态框**:
- 任务名称 input
- 代码仓库版本范围（多仓库行，每行: 仓库 select + 起始版本 → 目标版本）
- 影响分析深度 select（1 快速 / 2 推荐 / 3 深度）
- 备注 textarea

### 9.5 报告分析页 — ReportView.vue（核心页面）

**上下文面包屑**（sticky 顶部，三级）:
- 系统 / {系统名}
- 项目 / {项目名}
- 任务 / {任务名}（下拉，显示已完成任务，每项含 ✓ + 任务名 + 版本范围 + 风险分）

**页面头部**:
- 标题「变更影响报告」
- 副标题（任务名 · 仓库数 · 生成时间）
- 「导出 ▼」「批量分析」按钮

#### 9.5.1 顶部统计卡片区（grid 2fr / 1.8fr / 1.2fr）

**卡片 A：变更概览**（左，最宽）
- 三个大数字摘要: 变更文件数(蓝) / 变更项数(黄) / 受影响测试数(红)
- 变更分类分布（5 行进度条）: 代码(蓝) / 配置(紫) / SQL(黄) / 脚本(绿) / 其他(灰)

**卡片 B：风险分析**（中）
- 左侧: 综合风险评分仪表盘（SVG 圆环，0-1 评分 + HIGH/MEDIUM/LOW 标签）
- 右侧: 风险等级分布（4 行进度条: 严重/高/中/低）
- 底部分隔区: 节点优先级分布
  - 堆叠条形图（P0 红 / P1 橙 / P2 黄 / P3 灰）
  - 图例: P0×1.5 · P1×1.3 · P2×0.8 · P3×0.5
  - 计数: 跨边界 N / 行为 N / 配置 N / 局部 N

**卡片 C：分析进度**（右，最窄）
- 大数字: 已分析数(绿) / 总数 + 已结论数(蓝)
- 双进度条: 已分析% / 已结论%
- 状态分布图例: 已分析(绿点) / 分析中(蓝点) / 待分析(灰点)

#### 9.5.2 树形目录侧边栏（左侧 280px）

- 标题「变更目录」+ 计数
- 树形结构（递归渲染）:
  - L0 项目根节点（📁，count，默认展开+选中）
  - L1 仓库节点（📁，默认展开）
  - L2 目录节点（📄）
  - L3 文件节点（📄）
  - L4 函数节点（⚙，可选）
- 节点结构: 箭头(▶展开旋转90°) + 图标 + 标签 + 计数徽章
- 缩进: `paddingLeft = 12 + depth * 16`
- 激活态: 浅蓝背景 + 蓝色文字
- **联动逻辑**: 点击节点 → 设置选中状态 → 自动调用变更项列表筛选

#### 9.5.3 变更项列表表格（右侧）

**表格容器**（flex column）:
1. 批量操作栏（默认隐藏，选中后显示）
2. 工具栏（筛选器 + 视图模式切换）
3. 表格主体（横向滚动，sticky 列）
4. 分页

**批量操作栏**:
- 左: 「已选择 N 项」
- 右: 「🤖 批量 LLM 分析」/ 「批量标记已结论」/ 「取消」

**工具栏筛选器**（4 个 select）:
- 优先级（P0/P1/P2/P3，带 emoji 圆点）
- 节点类型（22 种，按优先级 4 个 optgroup 分组）
- 风险等级（严重/高/中/低）
- 分析状态（待分析/分析中/已结论）
- 实时计数文本「（N 项）」

**视图模式切换**（右侧）:
- 行内展开（☰，默认）: 在列表中直接查看 Diff 与结论
- 侧边抽屉（🗗）: 右侧大窗口审查

**表格列定义**（11 列，min-width 1200px）:

| # | 列名 | 宽度 | sticky | 内容 |
|---|------|------|--------|------|
| 1 | checkbox | 36px | left | 全选 |
| 2 | 变更项 | min 280px | - | 展开图标 + 节点图标 + qualifiedName + +N/-N + 副标题 |
| 3 | 节点类型 | 110px | - | node-kind-badge |
| 4 | 优先级 | 60px | - | priority-badge (P0/P1/P2/P3) |
| 5 | 变更分类 | 70px | - | tag (代码/配置/SQL/脚本/其他) |
| 6 | 变更类型 | 60px | - | 修改/新增 |
| 7 | 变更人员 | 110px | - | ≤2人逗号分隔; >2人显示前2人 +N 徽章 |
| 8 | 风险等级 | 70px | - | tag (严重/高/中/低) |
| 9 | 影响节点 | 70px | - | 数字（等宽字体） |
| 10 | 分析状态 | 80px | - | tag (待分析/分析中/已结论) |
| 11 | 操作 | 70px | right | 「详情」按钮 |

**Sticky 列实现**:
- 左侧 checkbox: `position: sticky; left: 0; z-index: 2`
- 右侧操作: `position: sticky; right: 0; z-index: 5`（表头 z-index 6）
- 滚动阴影: 右侧 sticky 列左侧 12px 渐变阴影（`.is-scrolled` 类）
- `border-collapse: separate; border-spacing: 0`（sticky 在 td 上生效的前提）

#### 9.5.4 变更项详情交互 — 行内展开（方案 D，默认）

`toggleInlineExpand(idx)`:
- 同一时刻仅展开一行
- 点击行 → 在该行下方插入展开行（colspan 11）
- 触发行 `.expanded` 类: 背景变深 + 首列左侧 3px 蓝色 inset shadow + 展开图标旋转 90°
- `slideDown` 动画 0.25s

**展开内容**（grid 1fr / 380px）:

**左栏：Diff 内容**（max-height 480px，overflow-y auto）
- 标题行: 「Diff 内容 · qualifiedName」+ 「🗗 大视图」按钮（切换到抽屉）
- **提交信息块**（renderCommitInfo）:
  - 单提交: 圆形头像 + 提交信息 + meta（作者 · 时间 · hash）
  - 多提交: `.commit-list` 容器，倒序展示，每个块带 `#1 #2` 序号 + 时间线连接线
- **Diff 行**: add(绿背景) / del(红背景) / context(灰)，行号 4 字符右对齐
- 底部元信息行: 节点类型 / 优先级 / 受影响节点数 / 风险 / 变更人员 / 「查看影响节点列表 →」

**右栏：快速结论**
- 标题: 「快速结论」+ 「🤖 AI 辅助」按钮
- 影响等级 select（根据 item.risk 预选）
- 最终结论 textarea（3 行）
- 按钮行: 「收起」/ 「保存草稿」/ 「提交」

#### 9.5.5 变更项详情交互 — 侧边抽屉

`openDrawerForRow(idx)`:
- 全局浮层，宽度 `min(960px, 92vw)`，从右侧滑入 0.25s
- 遮罩半透明黑（z-index 200），抽屉 z-index 201
- 响应式: ≤1100px 时上下分栏

**Header（固定）**:
- file-path（qualifiedName，等宽字体）
- 节点类型徽章 + 优先级徽章 + 分类 tag + 风险 tag
- 元信息: `+N -N · 变更类型 · 语言 · 变更人员 A、B`
- 路径
- 关闭按钮 ×

**Body（左右分栏）**:

**左栏**（flex 1.4）:
- 标题行: 「Diff 内容 · signature」+ 视图切换（统一/分栏）+ 复制按钮
- **Diff 内容**: 提交信息块 + diff 行
- **受影响节点折叠区**（默认展开）:
  - 按 P0/P1/P2/P3 分组（4 个 node-group）
  - P3 默认折叠，含「展开」链接
  - 每个节点行: 节点类型徽章 + 等宽符号名 + 关系标签（直接调用/深度 N/直接导出/类型引用）

**右栏**（宽 380px）:
- 标题: 「分析结论」+ 「🤖 AI 辅助填写」按钮
- 表单:
  - 影响等级 select
  - 风险描述 textarea（4 行）
  - 建议措施 textarea（3 行）
  - 最终结论 textarea（3 行）
- **审查历史折叠区**（默认折叠）: 记录列表（人 · 时间 · 操作 · 结论）

**Footer（固定）**:
- 左: ‹ › 上一项/下一项
- 右: 「取消」/ 「保存草稿」/ 「提交结论」

### 9.6 系统设置页 — SettingsView.vue

**Tab 切换**: 通用设置 / LLM 配置 / 性能配置 / 凭证管理

**LLM 配置卡**:
- LLM 提供商 select（OpenAI / DeepSeek / 通义千问 / 自定义端点 / 禁用）
- 模型名称 input
- API Key password input
- 自定义端点 URL input
- 「保存配置」+「测试连接」按钮

**性能配置卡**:
- 最大并发任务数 number（1-10，默认 3）
- 影响分析深度 select（1 快速 / 2 推荐 / 3 深度）
- Git Diff 超时（秒）number（默认 120）
- 报告保留天数 number（默认 90）
- 「保存配置」按钮

**凭证管理卡**:
- 「+ 添加凭证」按钮
- 表格: 名称 / 类型 / 创建时间 / 操作（编辑 + 删除）
- 复用现有 `CredentialService`（AES-256-GCM 加密）

### 9.7 前端组件清单

```
web/src/
  api/change-analysis.ts                          ← API 调用封装
  views/
    HomeView.vue                                  ← 项目管理首页
    TaskListView.vue                              ← 任务管理页
    ReportView.vue                                ← 报告分析页
    SettingsView.vue                              ← 系统设置页
  components/change-analysis/
    GlobalNav.vue                                 ← 全局导航
    ContextBreadcrumb.vue                         ← 上下文面包屑（2级/3级）
    CreateTaskModal.vue                           ← 创建任务模态框
    CreateProjectModal.vue                        ← 创建项目模态框
    CreateSystemModal.vue                         ← 新建系统模态框
    ReportOverviewCards.vue                       ← 报告概览三卡片
    ChangeTreeSidebar.vue                         ← 树形目录侧边栏
    ChangeListTable.vue                           ← 变更项列表表格
    ChangeItemCell.vue                            ← 变更项语义化单元格
    InlineExpandRow.vue                           ← 行内展开行
    ItemDetailDrawer.vue                          ← 变更项详情抽屉
    CommitInfoBlock.vue                           ← 提交信息块（单/多提交）
    DiffViewer.vue                                ← Diff 查看器
    ImpactedNodeList.vue                          ← 受影响节点列表（按优先级分组）
    AnalysisForm.vue                              ← 分析结论表单
    BatchActionBar.vue                            ← 批量操作栏
    NodeKindBadge.vue                             ← 节点类型徽章
    PriorityBadge.vue                             ← 优先级徽章
    RiskGauge.vue                                 ← 风险评分仪表盘（SVG 圆环）
    DistributionBar.vue                           ← 分布进度条/堆叠条
  stores/change-analysis.ts                       ← Pinia store
  composables/
    useChangeList.ts                              ← 变更项列表查询/筛选逻辑
    useTreeNavigation.ts                          ← 树形目录联动逻辑
    useItemDetail.ts                              ← 变更项详情交互逻辑
    useSSE.ts                                     ← SSE 进度推送
```

---

## 10. 视觉规范

### 10.1 色彩系统（暗色主题）

| 类别 | 变量 | 值 | 用途 |
|------|------|-----|------|
| 背景 | `--bg-primary` | `#0a0e1a` | 页面底色 |
| | `--bg-secondary` | `#111827` | 卡片/侧栏/表头 |
| | `--bg-card` | `#1a2236` | 卡片背景 |
| | `--bg-card-hover` | `#1f2a42` | hover |
| | `--bg-elevated` | `#243049` | 凸起元素 |
| 边框 | `--border` | `rgba(255,255,255,0.06)` | 默认 |
| | `--border-active` | `rgba(99,145,255,0.4)` | 激活 |
| 文字 | `--text-primary` | `#e8ecf4` | 主文字 |
| | `--text-secondary` | `#8b95a8` | 次要 |
| | `--text-muted` | `#5a6478` | 弱化 |
| 强调 | `--accent` | `#6391ff` | 主色（蓝） |
| | `--accent-hover` | `#7da5ff` | hover |
| | `--accent-bg` | `rgba(99,145,255,0.1)` | 强调背景 |
| 状态 | `--success` | `#34d399` | 成功（绿） |
| | `--warning` | `#fbbf24` | 警告（黄） |
| | `--danger` | `#f87171` | 危险（红） |
| 风险 | `--critical` | `#ef4444` | 严重 |
| | `--high` | `#f97316` | 高 |
| | `--medium` | `#eab308` | 中 |
| | `--low` | `#22c55e` | 低 |
| 优先级 | P0 | `#f87171` | 跨边界契约 |
| | P1 | `#fb923c` | 行为变更 |
| | P2 | `#fbbf24` | 配置/类型 |
| | P3 | `#94a3b8` | 局部 |

### 10.2 字体

- **系统字体**: `-apple-system, 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', sans-serif`
- **等宽字体**: `'Cascadia Code', 'Fira Code', 'Consolas', monospace`
- 等宽用于: 行数、节点 qualifiedName、commit hash、文件路径、统计数字、徽章

### 10.3 圆角与阴影

- `--radius: 10px`（卡片、表格容器）
- `--radius-sm: 6px`（按钮、输入框、徽章）
- `--radius-lg: 14px`（模态框）
- `--shadow: 0 1px 3px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.2)`
- 抽屉阴影: `-4px 0 16px rgba(0,0,0,0.3)`
- 模态框阴影: `0 8px 32px rgba(0,0,0,0.4)`

### 10.4 间距

- 全局导航宽度: 220px
- 树形目录宽度: 280px
- 主内容 padding: 28px 36px
- 卡片 padding: 20px
- 表格 th padding: 11px 20px; td padding: 13px 20px
- 树节点 padding-left: `12 + depth * 16` px

### 10.5 响应式断点

- `≤1200px`: 统计卡片改 2 列，树形目录改 200px
- `≤1100px`: 抽屉双栏改上下分栏（左栏 max-height 50%）
- `≤900px`: 隐藏树形目录，统计卡片改 1 列

### 10.6 动画

| 动画 | 时长 | 用途 |
|------|------|------|
| fadeIn | 0.3s | 页面切换 |
| slideDown | 0.25s | 行内展开内容 |
| slideIn | 0.25s | 抽屉滑入 |
| modalIn | 0.2s | 模态框进入 |
| pulse-bar | 1.4s | 运行中任务进度条脉冲 |
| pulse-dot | 1.2s | 运行中状态点脉冲 |
| skeleton-loading | 1.4s | 骨架屏 shimmer |

---

## 11. 性能策略

**目标**: 企业级多仓库（50000+ 文件，月度变更 2000+ 文件），5-10 分钟内完成。

| 策略 | 说明 |
|------|------|
| 仓库级并行 | 多仓库任务通过 `worker_threads` 并行执行 |
| 文件级批处理 | git diff 一次性获取，按分类批量处理 |
| 增量图查询 | 复用 CodeGraph 已构建的索引，不做全量重建 |
| 分页加载 | 报告变更项前端分页，不一次性加载 2000+ 条 |
| SSE 流式推送 | 进度实时推送，用户感知等待时间短 |
| LLM 可选 | 默认不调用 LLM，仅静态分析；LLM 按需触发单个变更项 |
| 批量影响计算 | 对同一文件的多个节点，合并 `getImpactRadius` 调用 |
| Sticky 列优化 | 表格 sticky 列使用 `border-collapse: separate`，避免重绘 |

**预估耗时分解**（2000 变更文件）:
- git diff: ~30s
- 变更分类 + 节点映射: ~15s
- 影响分析（CodeGraph 查询）: ~3-5min（2000 文件 × 平均 3 节点 × getImpactRadius）
- 报告生成: ~10s
- 总计: ~4-6min

---

## 12. 错误处理

| 场景 | 处理策略 |
|------|---------|
| Git diff 失败（无效 ref） | 任务标记 failed，错误信息提示检查 ref 是否存在 |
| 远程仓库认证失败 | 任务 failed，提示检查凭证配置 |
| CodeGraph 索引不存在 | 任务 failed，提示先执行 `codegraph index` |
| worker_threads 崩溃 | 进程级 catch，任务标记 failed + "任务被中断" |
| LLM API 调用失败 | 单项标记 llm_error，不影响整体报告生成 |
| 导出格式不支持 | 400 错误，列出支持的格式 |
| SQLite 并发写冲突 | WAL 模式 + busy_timeout=5000，与现有模式一致 |
| 仓库校验失败 | 创建项目时实时校验，显示 ✗ 状态，阻止提交 |

---

## 13. 测试策略

- **单元测试**:
  - GitDiffEngine 分类逻辑、节点映射
  - ImpactEngine 评分算法、优先级加权
  - LLMProvider 适配器
  - 优先级映射表（22 种 NodeKind → P0-P3）
- **集成测试**:
  - 完整任务流程（创建→执行→报告生成→导出），使用本地 git 仓库 fixture
  - 多提交场景（一个变更项关联多个 commit）
  - 树形目录与列表联动
- **性能测试**:
  - 模拟 2000 文件变更场景，验证 10 分钟内完成
  - 表格 sticky 列滚动性能（1000+ 行）
- **E2E 测试**:
  - 行内展开 / 抽屉双模式切换
  - 批量操作流程

---

## 14. 新增文件结构

```
src/
  api/
    routes/
      change-analysis.ts                          ← API 路由
    change-analysis/
      manager.ts                                  ← ChangeAnalysisManager 任务编排
      git-diff-engine.ts                          ← GitDiffEngine 变更识别与分类
      impact-engine.ts                            ← ImpactEngine 影响半径计算
      llm-analyzer.ts                             ← LLMAnalyzer 可选深度分析
      providers/
        openai.ts                                 ← OpenAI 适配器
        deepseek.ts                               ← DeepSeek 适配器
        qwen.ts                                   ← 通义千问适配器
        custom.ts                                 ← 自定义 HTTP 端点适配器
      db.ts                                       ← SQLite 连接与 schema
      priority.ts                                 ← 节点优先级映射表
      export/
        markdown.ts                               ← Markdown 导出
        pdf.ts                                    ← PDF 导出
        csv.ts                                    ← CSV 导出
        html.ts                                   ← HTML 导出
      types.ts                                    ← 类型定义

web/src/
  api/change-analysis.ts                          ← 前端 API 调用
  views/
    HomeView.vue                                  ← 项目管理首页
    TaskListView.vue                              ← 任务管理页
    ReportView.vue                                ← 报告分析页
    SettingsView.vue                              ← 系统设置页
  components/change-analysis/
    GlobalNav.vue                                 ← 全局导航
    ContextBreadcrumb.vue                         ← 上下文面包屑
    CreateTaskModal.vue                           ← 创建任务模态框
    CreateProjectModal.vue                        ← 创建项目模态框
    CreateSystemModal.vue                         ← 新建系统模态框
    ReportOverviewCards.vue                       ← 报告概览三卡片
    ChangeTreeSidebar.vue                         ← 树形目录侧边栏
    ChangeListTable.vue                           ← 变更项列表表格
    ChangeItemCell.vue                            ← 变更项语义化单元格
    InlineExpandRow.vue                           ← 行内展开行
    ItemDetailDrawer.vue                          ← 变更项详情抽屉
    CommitInfoBlock.vue                           ← 提交信息块
    DiffViewer.vue                                ← Diff 查看器
    ImpactedNodeList.vue                          ← 受影响节点列表
    AnalysisForm.vue                              ← 分析结论表单
    BatchActionBar.vue                            ← 批量操作栏
    NodeKindBadge.vue                             ← 节点类型徽章
    PriorityBadge.vue                             ← 优先级徽章
    RiskGauge.vue                                 ← 风险评分仪表盘
    DistributionBar.vue                           ← 分布进度条
  stores/change-analysis.ts                       ← Pinia store
  composables/
    useChangeList.ts                              ← 变更项列表逻辑
    useTreeNavigation.ts                          ← 树形目录联动
    useItemDetail.ts                              ← 变更项详情交互
    useSSE.ts                                     ← SSE 进度推送
```

---

## 15. 依赖新增

**后端**:
- `playwright`（PDF 导出，轻量跨平台，按需安装）
- 无其他重依赖，LLM 调用用原生 `fetch`

**前端**:
- 无新增依赖，复用现有 Ant Design Vue 4 + D3 + highlight.js + marked

---

## 16. 实施计划

### 16.1 阶段划分

| 阶段 | 内容 | 依赖 |
|------|------|------|
| **P1 基础设施** | 数据模型 + DB schema + ChangeAnalysisManager 骨架 | 无 |
| **P2 核心引擎** | GitDiffEngine + ImpactEngine + 优先级映射 | P1 |
| **P3 API 层** | 路由 + SSE + 导出 | P2 |
| **P4 前端框架** | 路由 + 全局布局 + 导航 + 面包屑 | P3 |
| **P5 项目管理** | 首页 + 创建项目/系统模态框 | P4 |
| **P6 任务管理** | 任务列表页 + 创建任务模态框 | P5 |
| **P7 报告分析** | 概览卡片 + 树形目录 + 变更项列表 | P6 |
| **P8 详情交互** | 行内展开 + 抽屉双模式 + 提交信息块 | P7 |
| **P9 设置页** | LLM 配置 + 性能配置 + 凭证管理 | P4 |
| **P10 LLM 集成** | LLMAnalyzer + 适配器 + AI 辅助 | P3, P8 |
| **P11 导出** | Markdown / PDF / CSV / HTML | P3 |
| **P12 测试优化** | 单元 + 集成 + 性能 + E2E | 全部 |

### 16.2 关键设计决策记录

1. **节点优先级为派生字段**: `priority` 由 `node_kind` 映射得出，不独立存储在 CodeGraph 图谱中，仅在变更分析时计算
2. **多提交支持**: `change_commits` 独立表，一个变更项可关联多个 commit，按 `seq` 排序
3. **受影响节点独立表**: `change_impacted_nodes` 独立表，支持按优先级分组查询，避免 JSON 解析
4. **api_method / sql_method 为业务标签**: 底层映射为 `method` 节点，通过文件路径/签名特征识别
5. **表格 sticky 列需 `border-collapse: separate`**: 否则 `position: sticky` 在 td 上不生效
6. **行内展开与抽屉共用渲染函数**: `renderDiff` / `renderCommitInfo` 在两种模式下复用
7. **复用现有 CredentialService**: 不重建凭证系统，直接复用 `src/api/credential-service.ts`
8. **复用现有 TaskManager 模式**: 不重建任务队列，参照 `src/api/task-manager.ts` 实现新的 `ChangeAnalysisManager`

---

## 附录 A: 数据示例

### A.1 变更项示例（function，critical，已结论，多提交）

```json
{
  "id": "item-001",
  "report_id": "report-001",
  "repo_id": "user-service",
  "category": "code",
  "category_label": "代码",
  "change_type": "modified",
  "file_path": "src/auth/token_validator.py",
  "language": "Python",
  "node_kind": "function",
  "qualified_name": "validate_token(token: str) -> TokenResult",
  "signature": "def validate_token(token: str) -> TokenResult",
  "priority": "P1",
  "add_lines": 45,
  "del_lines": 23,
  "authors": ["张三", "李四"],
  "impacted_nodes_count": 24,
  "risk_score": 0.85,
  "risk_level": "critical",
  "analysis_status": "concluded",
  "diff_content": [
    {"type": "context", "num": 42, "text": "def validate_token(token: str) -> TokenResult:"},
    {"type": "del", "num": 43, "text": "    if not token or len(token) < 10:"},
    {"type": "add", "num": 43, "text": "    if not token or len(token) < 16:"}
  ]
}
```

### A.2 提交信息示例（多提交，倒序展示）

```json
[
  {
    "hash": "f4e5d6c",
    "author": "李四",
    "time": "2026-06-17T10:13:00Z",
    "message": "fix: 根据 PR 评审意见修复边界问题",
    "seq": 1
  },
  {
    "hash": "a1b2c3d",
    "author": "张三",
    "time": "2026-06-16T09:13:00Z",
    "message": "fix(auth): 加强 token 校验，最小长度提升至 16，新增 revoked 前缀检测",
    "seq": 0
  }
]
```

### A.3 受影响节点示例（按优先级分组）

```json
{
  "P0": [
    {"node_kind": "route", "node_name": "GET /api/v1/auth/verify", "relation": "直接调用", "depth": 1},
    {"node_kind": "interface", "node_name": "TokenValidator", "relation": "深度 1", "depth": 1}
  ],
  "P1": [
    {"node_kind": "method", "node_name": "AuthMiddleware.handle", "relation": "直接调用", "depth": 1},
    {"node_kind": "class", "node_name": "UserService", "relation": "深度 2", "depth": 2}
  ],
  "P2": [
    {"node_kind": "constant", "node_name": "MAX_TOKEN_LENGTH", "relation": "类型引用", "depth": 1}
  ],
  "P3": [
    {"node_kind": "variable", "node_name": "token_cache", "relation": "深度 3", "depth": 3}
  ]
}
```
