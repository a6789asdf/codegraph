<template>
  <div class="search-page">
    <div class="page-header">
      <h2>代码搜索</h2>
    </div>

    <div class="search-input-area">
      <a-input-search
        v-model:value="query"
        placeholder="搜索函数、类、文件... (支持模糊匹配)"
        size="large"
        enter-button="搜索"
        :loading="searchStore.loading"
        @search="doSearch"
        style="max-width: 600px"
      />
      <div class="search-hints">
        <a-tag
          v-for="hint in searchHints" :key="hint"
          class="hint-tag" @click="query = hint; doSearch()"
        >{{ hint }}</a-tag>
      </div>
    </div>

    <a-table
      :columns="columns"
      :data-source="searchStore.results"
      :loading="searchStore.loading"
      :pagination="false"
      row-key="id"
      class="results-table"
      :custom-row="(record: any) => ({ onClick: () => showDetail(record), style: { cursor: 'pointer' } })"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <div class="node-name">
            <a-tag :color="kindColor(record.node?.kind)" style="margin-right: 8px; border-radius: 4px">
              {{ record.node?.kind }}
            </a-tag>
            <span class="node-qualified">{{ record.node?.name }}</span>
          </div>
        </template>
        <template v-if="column.key === 'file_path'">
          <span class="file-path">{{ record.node?.filePath }}:{{ record.node?.startLine }}</span>
        </template>
        <template v-if="column.key === 'actions'">
          <a-space>
            <a-button size="small" @click.stop="showDetail(record)">详情</a-button>
            <a-button size="small" @click.stop="goImpact(record)">影响分析</a-button>
          </a-space>
        </template>
      </template>
      <template #emptyText>
        <a-empty :description="searched ? '未找到匹配结果' : '输入关键词开始搜索'" />
      </template>
    </a-table>

    <!-- Node Detail Drawer -->
    <a-drawer
      :title="selectedNode?.node?.name ?? '节点详情'"
      :open="drawerOpen"
      :width="560"
      @close="drawerOpen = false"
    >
      <NodeDetail v-if="selectedNode" :node="selectedNode" />

      <a-divider v-if="selectedNode?.code" />

      <div v-if="selectedNode?.code" style="margin-top: 16px">
        <h4>源码</h4>
        <CodeViewer :code="selectedNode.code" :language="detectLang(selectedNode.node?.filePath)" />
      </div>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import api from '@/api/http'
import NodeDetail from '@/components/shared/NodeDetail.vue'
import CodeViewer from '@/components/CodeViewer.vue'
import { useSearchStore } from '@/stores/search'
import { useProjectStore } from '@/stores/project'

const router = useRouter()
const route = useRoute()
const searchStore = useSearchStore()
const projectStore = useProjectStore()

const query = ref('')
const searched = ref(false)
const selectedNode = ref<any>(null)
const drawerOpen = ref(false)

const searchHints = ['auth', 'login', 'handler', 'User', 'token', 'service', 'repository']

const columns = [
  { title: '节点', key: 'name', width: 320 },
  { title: '文件', key: 'file_path', ellipsis: true },
  { title: '操作', key: 'actions', width: 160 },
]

function kindColor(kind: string): string {
  const map: Record<string, string> = {
    Function: 'blue', Class: 'green', Method: 'cyan',
    function: 'blue', class: 'green', method: 'cyan',
    File: 'default', Type: 'orange', Test: 'purple',
    interface: 'cyan', variable: 'purple', route: 'gold',
  }
  return map[kind] || 'default'
}

function detectLang(file?: string): string {
  if (!file) return 'typescript'
  const ext = file.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', go: 'go', rs: 'rust', java: 'java', vue: 'html',
  }
  return map[ext || ''] || 'typescript'
}

async function doSearch() {
  if (!query.value.trim()) return
  searched.value = true
  searchStore.query = query.value
  await searchStore.search()
}

async function showDetail(record: any) {
  try {
    const nodeId = record.node?.id || record.nodeId
    if (nodeId) {
      await searchStore.selectNode(nodeId)
      selectedNode.value = searchStore.selectedNode
    } else {
      selectedNode.value = record
    }
    drawerOpen.value = true
  } catch (e) {
    console.error('Failed to fetch node detail', e)
  }
}

function goImpact(record: any) {
  const pid = route.params.id
  const filePath = record.node?.filePath || ''
  router.push(`/projects/${pid}/impact?file=${encodeURIComponent(filePath)}`)
}

onMounted(() => {
  const q = route.query.q as string
  if (q) {
    query.value = q
    doSearch()
  }
  const pid = route.params.id as string
  if (pid && !projectStore.currentProject) {
    projectStore.selectProject(pid)
  }
})
</script>

<style scoped>
.search-page { max-width: 1000px; }
.page-header { margin-bottom: 20px; }
.page-header h2 { margin: 0; font-size: 20px; font-weight: 600; }
.search-input-area { margin-bottom: 24px; }
.search-hints { margin-top: 10px; display: flex; gap: 6px; flex-wrap: wrap; }
.hint-tag { cursor: pointer; }
.results-table { background: #fff; border-radius: 8px; }
.node-name { display: flex; align-items: center; }
.node-qualified { font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace; font-size: 13px; }
.file-path { font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace; font-size: 12px; color: rgba(0,0,0,0.45); }
</style>
