<template>
  <div class="review-page">
    <div class="page-header">
      <h2>代码审查</h2>
    </div>

    <a-tabs v-model:activeKey="activeTab">
      <a-tab-pane key="changes" tab="变更检测">
        <a-card :bordered="false" style="margin-bottom: 16px">
          <a-space>
            <span>基准版本：</span>
            <a-input v-model:value="baseRef" placeholder="HEAD~1" style="width: 150px" />
            <a-button type="primary" :loading="loading.changes" @click="detectChanges">
              <SafetyOutlined /> 检测变更
            </a-button>
          </a-space>
        </a-card>

        <a-spin :spinning="loading.changes">
          <template v-if="changesData">
            <a-card :bordered="false" style="margin-bottom: 16px">
              <a-row :gutter="24">
                <a-col :span="8">
                  <div class="review-stat">
                    <div class="review-stat-value" :style="{ color: changesData.risk_level === 'high' ? '#ff4d4f' : changesData.risk_level === 'medium' ? '#fa8c16' : '#52c41a' }">
                      {{ changesData.risk_score }}
                    </div>
                    <div class="review-stat-label">风险评分</div>
                  </div>
                </a-col>
                <a-col :span="8">
                  <div class="review-stat">
                    <div class="review-stat-value">{{ changesData.findings?.length ?? 0 }}</div>
                    <div class="review-stat-label">发现数</div>
                  </div>
                </a-col>
                <a-col :span="8">
                  <div class="review-stat">
                    <div class="review-stat-value">{{ changesData.affected_flows?.length ?? 0 }}</div>
                    <div class="review-stat-label">受影响流</div>
                  </div>
                </a-col>
              </a-row>
            </a-card>

            <a-card title="审查发现" :bordered="false">
              <a-list :data-source="changesData.findings" item-layout="vertical">
                <template #renderItem="{ item }">
                  <a-list-item>
                    <a-list-item-meta>
                      <template #avatar>
                        <a-tag :color="item.severity === 'high' ? 'red' : item.severity === 'medium' ? 'orange' : 'blue'">
                          {{ item.severity }}
                        </a-tag>
                      </template>
                      <template #title>{{ item.file }} <span style="color: #999; font-weight: normal">({{ item.line_range }})</span></template>
                      <template #description>
                        <div>{{ item.message }}</div>
                        <div style="margin-top: 4px">
                          <a-tag v-for="n in item.affected_nodes" :key="n.id" style="margin-top: 4px">{{ n.name || n.id }}</a-tag>
                        </div>
                      </template>
                    </a-list-item-meta>
                  </a-list-item>
                </template>
              </a-list>
            </a-card>
          </template>
          <a-empty v-if="!changesData && !loading.changes" description="点击「检测变更」开始代码审查" style="margin-top: 60px" />
        </a-spin>
      </a-tab-pane>

      <a-tab-pane key="context" tab="审查上下文">
        <a-card :bordered="false" title="获取函数审查上下文">
          <a-space style="width: 100%">
            <a-input v-model:value="reviewTarget" placeholder="输入限定名 (如 auth.service.authenticate_user)" style="width: 400px" />
            <a-button type="primary" :loading="loading.context" @click="getReviewContext">
              <FileSearchOutlined /> 获取上下文
            </a-button>
          </a-space>
        </a-card>

        <a-spin :spinning="loading.context">
          <template v-if="reviewContext">
            <a-card v-if="reviewContext.source_snippet" title="源码" :bordered="false" style="margin-top: 16px">
              <CodeViewer :code="reviewContext.source_snippet" :show-header="false" />
            </a-card>

            <a-card v-if="reviewContext.review_prompts?.length" title="审查提示" :bordered="false" style="margin-top: 16px">
              <ul class="prompt-list">
                <li v-for="(p, i) in reviewContext.review_prompts" :key="i">{{ p }}</li>
              </ul>
            </a-card>

            <a-row :gutter="[16, 16]" style="margin-top: 16px">
              <a-col :span="8">
                <a-card title="调用者" :bordered="false" size="small">
                  <div v-for="c in reviewContext.callers" :key="c.id" class="rel-item"><code>{{ c.source }}</code></div>
                  <a-empty v-if="!reviewContext.callers?.length" description="无" />
                </a-card>
              </a-col>
              <a-col :span="8">
                <a-card title="被调用" :bordered="false" size="small">
                  <div v-for="c in reviewContext.callees" :key="c.id" class="rel-item"><code>{{ c.target }}</code></div>
                  <a-empty v-if="!reviewContext.callees?.length" description="无" />
                </a-card>
              </a-col>
              <a-col :span="8">
                <a-card title="测试" :bordered="false" size="small">
                  <div v-for="t in reviewContext.tests" :key="t.id" class="rel-item"><code>{{ t.target }}</code></div>
                  <a-empty v-if="!reviewContext.tests?.length" description="无" />
                </a-card>
              </a-col>
            </a-row>
          </template>
        </a-spin>
      </a-tab-pane>

      <a-tab-pane key="circular" tab="循环依赖">
        <a-card :bordered="false">
          <a-button type="primary" @click="qualityStore.fetchCircularDeps()" :loading="qualityStore.loading" style="margin-bottom: 16px">
            检测循环依赖
          </a-button>
          <div v-if="qualityStore.circularDeps.length > 0">
            <a-alert
              :message="`检测到 ${qualityStore.circularDeps.length} 个循环依赖`"
              type="warning"
              show-icon
              style="margin-bottom: 16px"
            />
            <a-list :data-source="qualityStore.circularDeps" size="small">
              <template #renderItem="{ item, index }">
                <a-list-item>
                  <a-list-item-meta>
                    <template #title>循环 #{{ index + 1 }}</template>
                    <template #description>
                      <a-breadcrumb separator="→">
                        <a-breadcrumb-item v-for="(file, i) in item" :key="i">
                          {{ file }}
                        </a-breadcrumb-item>
                      </a-breadcrumb>
                    </template>
                  </a-list-item-meta>
                </a-list-item>
              </template>
            </a-list>
          </div>
          <a-empty v-else-if="!qualityStore.loading" description="暂无循环依赖数据" />
        </a-card>
      </a-tab-pane>

      <a-tab-pane key="deadcode" tab="死代码">
        <a-card :bordered="false">
          <a-space style="margin-bottom: 16px">
            <a-select v-model:value="deadCodeKinds" mode="multiple" style="width: 300px" placeholder="类型过滤">
              <a-select-option value="function">function</a-select-option>
              <a-select-option value="method">method</a-select-option>
              <a-select-option value="class">class</a-select-option>
              <a-select-option value="variable">variable</a-select-option>
              <a-select-option value="constant">constant</a-select-option>
            </a-select>
            <a-button type="primary" @click="qualityStore.fetchDeadCode(deadCodeKinds.length > 0 ? deadCodeKinds : undefined)" :loading="qualityStore.loading">
              检测死代码
            </a-button>
          </a-space>
          <a-table
            :columns="deadCodeColumns"
            :data-source="qualityStore.deadCode"
            :loading="qualityStore.loading"
            :pagination="{ pageSize: 20 }"
            size="small"
            row-key="id"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'kind'">
                <a-tag :color="kindColor(record.kind)">{{ record.kind }}</a-tag>
              </template>
            </template>
          </a-table>
          <a-empty v-if="!qualityStore.loading && qualityStore.deadCode.length === 0" description="暂无死代码数据" />
        </a-card>
      </a-tab-pane>

    </a-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { SafetyOutlined, FileSearchOutlined } from '@ant-design/icons-vue'
import reviewApi from '@/api/review'
import CodeViewer from '@/components/CodeViewer.vue'
import { useProjectStore } from '@/stores/project'
import { useQualityStore } from '@/stores/quality'

const route = useRoute()
const projectStore = useProjectStore()
const qualityStore = useQualityStore()

const activeTab = ref('changes')
const baseRef = ref('HEAD~1')
const changesData = ref<any>(null)
const reviewTarget = ref('')
const reviewContext = ref<any>(null)
const loading = ref({ changes: false, context: false })

const deadCodeKinds = ref<string[]>(['function', 'method'])

const KIND_COLORS: Record<string, string> = {
  class: 'blue', function: 'green', method: 'orange',
  variable: 'purple', interface: 'cyan', constant: 'geekblue',
}

const deadCodeColumns = [
  { title: '名称', dataIndex: 'name', key: 'name', ellipsis: true },
  { title: '类型', dataIndex: 'kind', key: 'kind', width: 100 },
  { title: '文件', dataIndex: 'file', key: 'file', ellipsis: true },
  { title: '行号', dataIndex: 'startLine', key: 'startLine', width: 80 },
]

function kindColor(kind: string) {
  return KIND_COLORS[kind] || 'default'
}

async function detectChanges() {
  loading.value.changes = true
  try { changesData.value = await reviewApi.detectChanges(projectStore.currentProject!, baseRef.value) }
  catch (e) { console.error(e) }
  finally { loading.value.changes = false }
}

async function getReviewContext() {
  if (!reviewTarget.value) return
  loading.value.context = true
  try { reviewContext.value = await reviewApi.getReviewContext(projectStore.currentProject!, reviewTarget.value) }
  catch (e) { console.error(e) }
  finally { loading.value.context = false }
}

onMounted(() => {
  const pid = route.params.id as string
  if (pid && !projectStore.currentProject) {
    projectStore.selectProject(decodeURIComponent(pid))
  }
})
</script>

<style scoped>
.review-page { max-width: 1000px; }
.page-header { margin-bottom: 20px; }
.page-header h2 { margin: 0; font-size: 20px; font-weight: 600; }
.review-stat { text-align: center; }
.review-stat-value { font-size: 32px; font-weight: 700; }
.review-stat-label { font-size: 13px; color: rgba(0,0,0,0.45); margin-top: 4px; }
.prompt-list { margin: 0; padding-left: 20px; }
.prompt-list li { padding: 6px 0; color: rgba(0,0,0,0.65); }
.rel-item { padding: 4px 0; }
.rel-item code { font-size: 12px; background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
code { font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace; }
</style>
