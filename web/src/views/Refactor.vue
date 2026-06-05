<template>
  <div class="refactor-page">
    <div class="page-header">
      <h2>重构工具</h2>
    </div>

    <a-tabs v-model:activeKey="activeTab">
      <a-tab-pane key="dead" tab="死代码检测">
        <a-button type="primary" style="margin-bottom: 16px" @click="fetchDeadCode" :loading="loading.dead">
          <SearchOutlined /> 扫描死代码
        </a-button>
        <a-table
          :columns="deadColumns"
          :data-source="deadCode"
          :loading="loading.dead"
          :pagination="false"
          row-key="node"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'node'"><code>{{ record.name || record.node }}</code></template>
            <template v-if="column.key === 'kind'"><a-tag>{{ record.kind }}</a-tag></template>
            <template v-if="column.key === 'confidence'">
              <a-progress :percent="record.confidence * 100" :show-info="false" size="small"
                :stroke-color="record.confidence > 0.8 ? '#ff4d4f' : '#faad14'" />
            </template>
          </template>
          <template #emptyText>
            <a-empty description="点击「扫描死代码」检测未引用的代码" />
          </template>
        </a-table>
      </a-tab-pane>

      <a-tab-pane key="rename" tab="重命名预览">
        <a-card :bordered="false" title="预览重命名影响">
          <a-space direction="vertical" style="width: 100%">
            <a-input v-model:value="renameFrom" placeholder="源符号 (如 auth.service.authenticate_user)" />
            <a-input v-model:value="renameTo" placeholder="新名称 (如 verify_user_credentials)" />
            <a-button type="primary" :loading="loading.rename" @click="previewRename">预览影响</a-button>
          </a-space>
        </a-card>

        <a-card v-if="renameResult" :bordered="false" title="影响范围" style="margin-top: 16px">
          <a-alert
            :message="`预计影响 ${renameResult.affected_files?.length ?? 0} 个文件`"
            :description="renameResult.estimated_impact"
            type="warning" show-icon style="margin-bottom: 16px"
          />
          <a-table
            :columns="renameColumns"
            :data-source="renameResult.affected_nodes"
            :pagination="false" row-key="qualified_name" size="middle"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'qualified_name'"><code>{{ record.qualified_name }}</code></template>
            </template>
          </a-table>
        </a-card>
      </a-tab-pane>

      <a-tab-pane key="suggestions" tab="重构建议">
        <a-list :data-source="suggestions" :loading="loading.suggestions">
          <template #renderItem="{ item }">
            <a-list-item>
              <a-list-item-meta>
                <template #avatar>
                  <a-tag :color="suggestionColor(item.type)">{{ item.type }}</a-tag>
                </template>
                <template #title>{{ item.target || item.targets?.join(', ') }}</template>
                <template #description>{{ item.message }}</template>
              </a-list-item-meta>
            </a-list-item>
          </template>
        </a-list>
        <a-button style="margin-top: 16px" @click="fetchSuggestions" :loading="loading.suggestions">刷新建议</a-button>
      </a-tab-pane>

      <a-tab-pane key="deps" tab="文件依赖">
        <a-card :bordered="false">
          <a-input-search
            v-model:value="filePath"
            placeholder="输入文件路径..."
            enter-button="查询"
            style="max-width: 500px; margin-bottom: 16px"
            @search="qualityStore.fetchFileDeps(filePath)"
          />
          <a-row :gutter="16">
            <a-col :span="12">
              <a-card title="依赖的文件" size="small">
                <a-list :data-source="qualityStore.fileDeps" size="small">
                  <template #renderItem="{ item }">
                    <a-list-item><span style="font-size: 12px; font-family: monospace">{{ item }}</span></a-list-item>
                  </template>
                </a-list>
                <a-empty v-if="qualityStore.fileDeps.length === 0" description="无依赖" />
              </a-card>
            </a-col>
            <a-col :span="12">
              <a-card title="被依赖的文件" size="small">
                <a-list :data-source="qualityStore.fileDependents" size="small">
                  <template #renderItem="{ item }">
                    <a-list-item><span style="font-size: 12px; font-family: monospace">{{ item }}</span></a-list-item>
                  </template>
                </a-list>
                <a-empty v-if="qualityStore.fileDependents.length === 0" description="无被依赖" />
              </a-card>
            </a-col>
          </a-row>
        </a-card>
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { SearchOutlined } from '@ant-design/icons-vue'
import refactorApi from '@/api/refactor'
import { useProjectStore } from '@/stores/project'
import { useQualityStore } from '@/stores/quality'

const route = useRoute()
const projectStore = useProjectStore()
const qualityStore = useQualityStore()

const activeTab = ref('dead')
const deadCode = ref<any[]>([])
const suggestions = ref<any[]>([])
const renameFrom = ref('')
const renameTo = ref('')
const renameResult = ref<any>(null)
const loading = ref({ dead: false, rename: false, suggestions: false })
const filePath = ref('')

const deadColumns = [
  { title: '节点', key: 'node', ellipsis: true, dataIndex: 'name' },
  { title: '类型', key: 'kind', width: 80 },
  { title: '文件', dataIndex: 'file_path', ellipsis: true },
  { title: '行', dataIndex: 'line_start', width: 60 },
  { title: '原因', dataIndex: 'reason', ellipsis: true },
  { title: '可信度', key: 'confidence', width: 120 },
]

const renameColumns = [
  { title: '符号', key: 'qualified_name', ellipsis: true },
  { title: '文件', dataIndex: 'file_path', ellipsis: true },
  { title: '行', dataIndex: 'line_start', width: 60 },
]

function suggestionColor(type: string): string {
  const map: Record<string, string> = { extract_module: 'blue', rename: 'orange', consolidate: 'purple' }
  return map[type] || 'default'
}

async function fetchDeadCode() {
  loading.value.dead = true
  try { deadCode.value = await refactorApi.getDeadCode(projectStore.currentProject!) as any[] }
  catch (e) { console.error(e) }
  finally { loading.value.dead = false }
}

async function previewRename() {
  if (!renameFrom.value || !renameTo.value) return
  loading.value.rename = true
  try { renameResult.value = await refactorApi.previewRename(projectStore.currentProject!, renameFrom.value, renameTo.value) }
  catch (e) { console.error(e) }
  finally { loading.value.rename = false }
}

async function fetchSuggestions() {
  loading.value.suggestions = true
  try { suggestions.value = await refactorApi.getSuggestions(projectStore.currentProject!) as any[] }
  catch (e) { console.error(e) }
  finally { loading.value.suggestions = false }
}

onMounted(() => {
  const pid = route.params.id as string
  if (pid && !projectStore.currentProject) {
    projectStore.selectProject(decodeURIComponent(pid))
  }
  fetchSuggestions()
})
</script>

<style scoped>
.refactor-page { max-width: 900px; }
.page-header { margin-bottom: 20px; }
.page-header h2 { margin: 0; font-size: 20px; font-weight: 600; }
code { font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace; font-size: 12px; background: #f5f5f5; padding: 1px 4px; border-radius: 3px; }
</style>
