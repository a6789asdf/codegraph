# 变更影响分析服务设计文档

**日期**: 2026-06-16
**状态**: 设计完成，待审核

## 概述

在 CodeGraph 项目内扩展变更影响分析功能，支持用户创建分析任务，异步执行 git diff 变更识别与影响分析，生成报告并支持人工分析结论和导出。

## 需求

- **核心流程**: 创建分析任务 → 异步执行 → 生成报告 → 查看变更项 → 提交分析结论 → 导出报告
- **变更识别**: 支持代码类、配置类、SQL类、脚本类等各种变更内容，按变更项分类展示
- **影响分析**: 基于 CodeGraph 知识图谱计算影响半径，AI 辅助生成初步结论，人工审核修改
- **LLM 深度分析**: 可选功能，适配器模式支持多后端（OpenAI/DeepSeek/通义千问/自定义）
- **报告导出**: Markdown / PDF / CSV / HTML 四种格式
- **代码来源**: 混合模式（本地 Git + 远程 Git API）
- **性能目标**: 企业级多仓库（50000+ 文件，月度变更 2000+ 文件），5-10 分钟内完成

## 架构决策

**方案选择**: 扩展 CodeGraph API + SQLite 队列（轻量方案）

理由: 零外部依赖，复用 CodeGraph 现有的 TaskManager 异步任务模式、Hono API 框架、SQLite WAL 持久化、Vue 前端。通过 worker_threads 实现多仓库并行处理。

## 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    Vue 前端 (Ant Design)                  │
│  /projects/:id/change-analysis  ← 任务列表页             │
│  /change-analysis/reports/:id   ← 报告详情页             │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP API / SSE
┌──────────────────────▼──────────────────────────────────┐
│              CodeGraph Hono API (扩展)                    │
│  /api/projects/:id/change-analysis/*   ← 任务与报告路由  │
│  /api/change-analysis/reports/*        ← 报告详情与导出  │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│           ChangeAnalysisManager (新增核心模块)            │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ GitDiffEngine│  │ImpactEngine  │  │ LLMAnalyzer   │  │
│  │ git diff解析 │  │CodeGraph图谱 │  │ 可选深度分析   │  │
│  │ 变更分类     │  │影响半径计算   │  │ 多后端可配置   │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │ SQLite 任务队列 (复用 shared-db 模式)             │    │
│  │ change_tasks + change_reports + change_items     │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

## 数据模型

数据库文件: `~/.codegraph-change-analysis.db`，SQLite WAL 模式。

### change_tasks - 分析任务

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| project_id | TEXT NOT NULL | 关联 CodeGraph 项目 |
| name | TEXT NOT NULL | 任务名称 |
| description | TEXT | 任务描述 |
| source_type | TEXT NOT NULL | 'local_git' / 'remote_git' |
| source_url | TEXT | 远程仓库 URL |
| branch | TEXT | 分支 |
| from_ref | TEXT NOT NULL | 起始版本（commit/tag/branch） |
| to_ref | TEXT NOT NULL | 目标版本 |
| credential_id | TEXT | 凭证 ID |
| status | TEXT NOT NULL | pending / running / completed / failed |
| stage | TEXT | 当前执行阶段 |
| progress_pct | INTEGER | 进度百分比 0-100 |
| error_message | TEXT | 错误信息 |
| created_at | TEXT NOT NULL | ISO 时间戳 |
| updated_at | TEXT NOT NULL | ISO 时间戳 |
| started_at | TEXT | 开始时间 |
| completed_at | TEXT | 完成时间 |

任务状态机: `pending → running → completed/failed`，failed 可 retry 回到 pending。

执行阶段: `diffing → classifying → analyzing → generating_report → completed`

### change_reports - 分析报告

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| task_id | TEXT NOT NULL UNIQUE | 一对一关联任务 |
| project_id | TEXT NOT NULL | 项目 ID |
| from_ref | TEXT NOT NULL | 起始版本 |
| to_ref | TEXT NOT NULL | 目标版本 |
| total_files | INTEGER | 变更文件总数 |
| total_items | INTEGER | 变更项总数 |
| risk_score | REAL | 综合风险评分 0-1 |
| risk_level | TEXT | low / medium / high / critical |
| summary | TEXT | AI 生成的摘要 |
| created_at | TEXT NOT NULL | |
| updated_at | TEXT NOT NULL | |

### change_items - 变更项

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| report_id | TEXT NOT NULL | 关联报告 |
| category | TEXT NOT NULL | code / config / sql / script / other |
| change_type | TEXT NOT NULL | added / modified / deleted / renamed |
| file_path | TEXT NOT NULL | 文件路径 |
| language | TEXT | 代码语言 |
| old_path | TEXT | renamed 时的原路径 |
| diff_summary | TEXT | diff 摘要（+行数/-行数） |
| impacted_nodes | TEXT | JSON: 受影响的节点列表 |
| affected_tests | TEXT | JSON: 受影响的测试列表 |
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
| created_at | TEXT NOT NULL | |
| updated_at | TEXT NOT NULL | |

## 核心模块

### 1. GitDiffEngine - 变更内容识别与分类

输入: from_ref, to_ref, 仓库路径
输出: ChangeItem[]（分类后的变更项列表）

流程:
1. `git diff --stat from_ref to_ref` → 获取变更文件列表
2. `git diff from_ref to_ref` → 获取每个文件的详细 diff
3. 按文件扩展名/内容特征自动分类:
   - 代码类: .ts/.js/.py/.java/.go/.rs/.cs/.php/.rb/.swift/.kt 等
   - 配置类: .yaml/.yml/.json/.xml/.properties/.env/.toml/.ini/.conf/.cfg
   - SQL类: .sql 文件 + 内容包含 DDL/DML 语句的文件
   - 脚本类: .sh/.bat/.ps1/.lua/.rb/.pl 等
   - 其他: 无法归类的文件
4. 解析 diff 统计: +行数/-行数/变更类型（added/modified/deleted/renamed）

### 2. ImpactEngine - 影响半径计算

输入: ChangeItem[] + CodeGraph 实例
输出: 每个 ChangeItem 的 impacted_nodes + affected_tests

流程:
- 对每个代码类变更项:
  1. 获取文件中所有节点 (`getNodesInFile`)
  2. 计算影响半径 (`getImpactRadius`, depth=2)
  3. 查找受影响测试 (`findUsages` + test 文件过滤)
  4. 计算风险评分 (基于影响节点数和测试数)
- 对配置/SQL/脚本类:
  1. 文本匹配查找引用
  2. 基于文件路径启发式推断影响范围

风险评分公式: `min(1, impactedNodes * 0.05 + affectedTests * 0.1)`

风险等级映射: `>0.7 → critical, >0.5 → high, >0.3 → medium, else → low`

### 3. LLMAnalyzer - 可选 LLM 深度分析

适配器模式:
```typescript
interface LLMProvider {
  id: string;
  name: string;
  analyze(prompt: string, context: string): Promise<string>;
}
```

内置适配器:
- OpenAIProvider: GPT-4/GPT-4o，通过 OpenAI API
- DeepSeekProvider: DeepSeek，兼容 OpenAI API 格式
- QwenProvider: 通义千问，通过 DashScope API
- CustomProvider: 自定义 HTTP 端点，用户配置 URL 和请求格式

配置方式: 环境变量或前端设置页面
- `CHANGE_ANALYSIS_LLM_PROVIDER`: 选择的 provider
- `CHANGE_ANALYSIS_LLM_API_KEY`: API Key
- `CHANGE_ANALYSIS_LLM_BASE_URL`: 自定义端点
- `CHANGE_ANALYSIS_LLM_MODEL`: 模型名称

### 4. ChangeAnalysisManager - 任务编排

复用 TaskManager 的模式:
- `createTask()` → 入队
- `scheduleTask()` → worker_threads 并行执行
- 任务状态机: pending → running → completed/failed
- 执行阶段: diffing → classifying → analyzing → generating_report → completed
- `MAX_CONCURRENT = 3`（可通过 `CHANGE_ANALYSIS_MAX_CONCURRENT` 配置）
- `recoverOnStartup()`: 服务重启时将 running 状态的任务标记为 failed

## API 设计

所有路由挂载在 CodeGraph 现有 Hono API 下。

### 任务管理

```
POST   /api/projects/:id/change-analysis/tasks          创建分析任务
GET    /api/projects/:id/change-analysis/tasks          列出任务
GET    /api/projects/:id/change-analysis/tasks/:taskId  获取任务详情（含进度）
POST   /api/projects/:id/change-analysis/tasks/:taskId/retry  重试失败任务
DELETE /api/projects/:id/change-analysis/tasks/:taskId  删除任务
```

创建任务请求体:
```json
{
  "name": "6月迭代变更分析",
  "description": "v2.0.0 到 v2.1.0 的变更",
  "source_type": "local_git",
  "source_url": null,
  "branch": "main",
  "from_ref": "v2.0.0",
  "to_ref": "v2.1.0",
  "credential_id": null
}
```

### 报告查询

```
GET    /api/projects/:id/change-analysis/reports                列出报告
GET    /api/change-analysis/reports/:reportId                   报告详情
GET    /api/change-analysis/reports/:reportId/items             变更项列表（分页/筛选）
GET    /api/change-analysis/reports/:reportId/items/:itemId     变更项详情
```

变更项列表支持查询参数:
- `category`: 按分类筛选 (code/config/sql/script/other)
- `risk_level`: 按风险等级筛选
- `analysis_status`: 按分析状态筛选
- `page` / `pageSize`: 分页（默认 page=1, pageSize=50）

### 分析结论

```
PUT    /api/change-analysis/reports/:reportId/items/:itemId/analysis  提交/更新分析结论
POST   /api/change-analysis/reports/:reportId/items/:itemId/llm-analyze  触发 LLM 深度分析
POST   /api/change-analysis/reports/:reportId/batch-analyze           批量提交分析结论
```

分析结论请求体:
```json
{
  "impact_level": "high",
  "risk_description": "该接口变更影响所有下游服务",
  "mitigation": "需要通知下游团队并做兼容性测试",
  "conclusion": "高风险变更，需回归测试"
}
```

### 报告导出

```
GET    /api/change-analysis/reports/:reportId/export?format=markdown
GET    /api/change-analysis/reports/:reportId/export?format=pdf
GET    /api/change-analysis/reports/:reportId/export?format=csv
GET    /api/change-analysis/reports/:reportId/export?format=html
```

### SSE 进度推送

```
GET    /api/projects/:id/change-analysis/tasks/:taskId/events
```

SSE 事件格式:
```
event: progress
data: {"stage": "analyzing", "progress_pct": 60, "message": "正在分析影响范围..."}

event: completed
data: {"reportId": "xxx", "totalItems": 150}

event: failed
data: {"error": "git diff failed: invalid ref v2.0.0"}
```

## 前端设计

### 新增路由

```
/projects/:id/change-analysis        → ChangeAnalysis.vue (任务列表页)
/change-analysis/reports/:reportId   → ChangeReport.vue (报告详情页)
```

### 任务列表页 - ChangeAnalysis.vue

- 顶部: 创建任务按钮 → 抽屉式表单（选择来源类型、填写 from/to ref、分支等）
- 主体: 任务卡片列表，显示状态/进度/创建时间
- 每个任务卡片: 进度条 + 当前阶段 + 操作按钮（查看报告/重试/删除）
- SSE 实时更新进行中的任务进度

### 报告详情页 - ChangeReport.vue

- 顶部统计卡片: 变更文件数 / 变更项数 / 风险评分 / 受影响测试数
- Tab 分类展示: 全部 | 代码类 | 配置类 | SQL类 | 脚本类 | 其他
- 变更项表格: 文件路径 / 变更类型 / 风险等级 / 分析状态 / 操作
- 点击变更项 → 侧边抽屉展示详情:
  - diff 内容（语法高亮，复用 highlight.js）
  - 影响范围图（复用 ForceGraph 组件）
  - 受影响节点列表
  - 分析结论表单（影响等级/风险描述/建议措施/结论）
  - "LLM 深度分析"按钮（可选）
- 导出按钮: 下拉选择格式

### 新增前端组件

```
web/src/
  api/change-analysis.ts            ← API 调用封装
  views/ChangeAnalysis.vue          ← 任务列表页
  views/ChangeReport.vue            ← 报告详情页
  components/change-analysis/
    CreateTaskDrawer.vue            ← 创建任务抽屉
    ChangeItemDetail.vue            ← 变更项详情抽屉
    AnalysisForm.vue                ← 分析结论表单
    DiffViewer.vue                  ← Diff 查看器
  stores/change-analysis.ts         ← Pinia store
```

## 性能策略

目标: 企业级多仓库（50000+ 文件，月度变更 2000+ 文件），5-10 分钟内完成。

| 策略 | 说明 |
|------|------|
| 仓库级并行 | 多仓库任务通过 worker_threads 并行执行 |
| 文件级批处理 | git diff 一次性获取，按分类批量处理 |
| 增量图查询 | 复用 CodeGraph 已构建的索引，不做全量重建 |
| 分页加载 | 报告变更项前端分页，不一次性加载 2000+ 条 |
| SSE 流式推送 | 进度实时推送，用户感知等待时间短 |
| LLM 可选 | 默认不调用 LLM，仅静态分析；LLM 按需触发单个变更项 |
| 批量影响计算 | 对同一文件的多个节点，合并 getImpactRadius 调用 |

预估耗时分解（2000 变更文件）:
- git diff: ~30s
- 变更分类: ~10s
- 影响分析（CodeGraph 查询）: ~3-5min（2000 文件 * 平均 3 节点 * getImpactRadius）
- 报告生成: ~10s
- 总计: ~4-6min

## 错误处理

| 场景 | 处理策略 |
|------|---------|
| Git diff 失败（无效 ref） | 任务标记 failed，错误信息提示检查 ref 是否存在 |
| 远程仓库认证失败 | 任务 failed，提示检查凭证配置 |
| CodeGraph 索引不存在 | 任务 failed，提示先执行 codegraph index |
| worker_threads 崩溃 | 进程级 catch，任务标记 failed + "任务被中断" |
| LLM API 调用失败 | 单项标记 llm_error，不影响整体报告生成 |
| 导出格式不支持 | 400 错误，列出支持的格式 |
| SQLite 并发写冲突 | WAL 模式 + busy_timeout=5000，与现有模式一致 |

## 测试策略

- **单元测试**: GitDiffEngine 分类逻辑、ImpactEngine 评分算法、LLMProvider 适配器
- **集成测试**: 完整任务流程（创建→执行→报告生成→导出），使用本地 git 仓库 fixture
- **性能测试**: 模拟 2000 文件变更场景，验证 10 分钟内完成

## 新增文件结构

```
src/
  api/
    routes/
      change-analysis.ts          ← API 路由
    change-analysis/
      manager.ts                  ← ChangeAnalysisManager 任务编排
      git-diff-engine.ts          ← GitDiffEngine 变更识别与分类
      impact-engine.ts            ← ImpactEngine 影响半径计算
      llm-analyzer.ts             ← LLMAnalyzer 可选深度分析
      providers/
        openai.ts                 ← OpenAI 适配器
        deepseek.ts               ← DeepSeek 适配器
        qwen.ts                   ← 通义千问适配器
        custom.ts                 ← 自定义 HTTP 端点适配器
      db.ts                       ← SQLite 连接与 schema
      export/
        markdown.ts               ← Markdown 导出
        pdf.ts                    ← PDF 导出
        csv.ts                    ← CSV 导出
        html.ts                   ← HTML 导出
      types.ts                    ← 类型定义

web/src/
  api/change-analysis.ts          ← 前端 API 调用
  views/ChangeAnalysis.vue        ← 任务列表页
  views/ChangeReport.vue          ← 报告详情页
  components/change-analysis/
    CreateTaskDrawer.vue          ← 创建任务抽屉
    ChangeItemDetail.vue          ← 变更项详情抽屉
    AnalysisForm.vue              ← 分析结论表单
    DiffViewer.vue                ← Diff 查看器
  stores/change-analysis.ts       ← Pinia store
```

## 依赖新增

后端:
- playwright（PDF 导出，轻量跨平台，按需安装）
- 无其他重依赖，LLM 调用用原生 fetch

前端:
- 无新增依赖，复用现有 Ant Design + D3 + highlight.js
