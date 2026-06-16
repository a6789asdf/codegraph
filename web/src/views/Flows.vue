<template>
  <div class="flows-page">
    <div class="page-header">
      <h2>执行流追踪</h2>
      <a-button type="primary" @click="fetchFlows" :loading="loading">
        <ReloadOutlined /> 刷新
      </a-button>
    </div>

    <a-spin :spinning="loading">
      <a-table
        :columns="columns"
        :data-source="flows"
        :pagination="pagination"
        row-key="id"
        class="flows-table"
        :custom-row="(record: any) => ({ onClick: () => goFlow(record), style: { cursor: 'pointer' } })"
        @change="onTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <span class="flow-name">{{ record.name }}</span>
            <div class="flow-entry">入口: <a-tooltip :title="record.entry_point" placement="topLeft"><code>{{ record.entry_point }}</code></a-tooltip></div>
          </template>
          <template v-if="column.key === 'entry_source'">
            <a-tag :color="sourceColor(record.entry_source)">{{ sourceLabel(record.entry_source) }}</a-tag>
          </template>
          <template v-if="column.key === 'criticality'">
            <a-progress
              :percent="record.criticality * 100" :show-info="false" size="small"
              :stroke-color="record.criticality > 0.8 ? '#ff4d4f' : record.criticality > 0.5 ? '#fa8c16' : '#52c41a'"
              style="width: 120px"
            />
            <span class="crit-num">{{ (record.criticality * 100).toFixed(0) }}%</span>
          </template>
          <template v-if="column.key === 'node_count'">
            <a-tag color="blue">{{ record.node_count }} 节点</a-tag>
          </template>
          <template v-if="column.key === 'depth'">
            <span>{{ record.depth }}</span>
          </template>
          <template v-if="column.key === 'file_count'">
            <a-tag color="cyan">{{ record.file_count }} 文件</a-tag>
          </template>
          <template v-if="column.key === 'actions'">
            <a-button type="link" @click.stop="goFlow(record)">查看详情</a-button>
          </template>
        </template>
        <template #emptyText>
          <a-empty description="暂无执行流数据" />
        </template>
      </a-table>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ReloadOutlined } from '@ant-design/icons-vue'
import flowsApi from '@/api/flows'
import { useProjectStore } from '@/stores/project'

const router = useRouter()
const route = useRoute()
const projectStore = useProjectStore()

const loading = ref(false)
const flows = ref<any[]>([])

const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `共 ${total} 条`,
})

const columns = [
  { title: '执行流', key: 'name', ellipsis: false },
  { title: '来源', key: 'entry_source', width: 100 },
  { title: '关键性', key: 'criticality', width: 160 },
  { title: '节点', key: 'node_count', width: 100 },
  { title: '深度', key: 'depth', width: 80 },
  { title: '文件', key: 'file_count', width: 100 },
  { title: '操作', key: 'actions', width: 100 },
]

function sourceLabel(source: string): string {
  const map: Record<string, string> = {
    route: '路由',
    root: '根节点',
    decorator: '装饰器',
    name_pattern: '命名模式',
  }
  return map[source] || source
}

function sourceColor(source: string): string {
  const map: Record<string, string> = {
    route: 'green',
    root: 'blue',
    decorator: 'orange',
    name_pattern: 'purple',
  }
  return map[source] || 'default'
}

async function fetchFlows() {
  loading.value = true
  try {
    const res = await flowsApi.getFlows(projectStore.currentProject!, pagination.current, pagination.pageSize)
    flows.value = res.items
    pagination.total = res.total
  } catch (e) { console.error('Failed to fetch flows', e) }
  finally { loading.value = false }
}

function onTableChange(pag: any) {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchFlows()
}

function goFlow(record: any) {
  router.push(`/projects/${route.params.id}/flows/${record.id}`)
}

onMounted(() => {
  const pid = route.params.id as string
  if (pid && !projectStore.currentProject) {
    projectStore.selectProject(pid)
  }
  fetchFlows()
})
</script>

<style scoped>
.flows-page { width: 100%; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.page-header h2 { margin: 0; font-size: 20px; font-weight: 600; }
.flows-table { background: #fff; border-radius: 8px; }
.flows-table :deep(.ant-table) { table-layout: fixed; }
.flows-table :deep(.ant-table-thead > tr > th) { white-space: nowrap; }
.flow-name { font-weight: 600; font-size: 14px; }
.flow-entry { font-size: 12px; color: rgba(0,0,0,0.45); margin-top: 2px; display: flex; align-items: center; min-width: 0; }
.flow-entry code { font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace; font-size: 11px; background: #f5f5f5; padding: 1px 4px; border-radius: 3px; display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; }
.crit-num { margin-left: 8px; font-size: 12px; color: rgba(0,0,0,0.45); }
</style>
