<template>
  <div class="routes-page">
    <div class="page-header">
      <h2>路由与桥接</h2>
    </div>

    <a-card title="路由清单" :bordered="false" style="margin-bottom: 16px">
      <template #extra>
        <a-select v-model:value="frameworkFilter" style="width: 200px" placeholder="框架过滤" allow-clear @change="onFilterChange">
          <a-select-option v-for="fw in frameworks" :key="fw" :value="fw">{{ fw }}</a-select-option>
        </a-select>
      </template>
      <a-table
        :columns="routeColumns"
        :data-source="filteredRoutes"
        :loading="loading"
        :pagination="{ pageSize: 20 }"
        size="small"
        row-key="url"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'method'">
            <a-tag :color="methodColor(record.method)">{{ record.method }}</a-tag>
          </template>
          <template v-if="column.key === 'handler'">
            <a @click="navigateToNode(record)" style="font-family: monospace">{{ record.handler }}</a>
          </template>
        </template>
      </a-table>
      <a-empty v-if="!loading && filteredRoutes.length === 0 && frameworks.length > 0" description="当前过滤条件下无匹配路由" />
      <a-empty v-if="!loading && filteredRoutes.length === 0 && frameworks.length === 0" description="未检测到路由 — 项目可能未使用支持的 Web 框架" />
    </a-card>

    <a-card title="检测到的框架" :bordered="false">
      <a-tag v-for="fw in frameworks" :key="fw" color="blue" style="margin-bottom: 8px; font-size: 14px; padding: 4px 12px">
        {{ fw }}
      </a-tag>
      <a-empty v-if="frameworks.length === 0" description="未检测到框架" />
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import routesApi from '@/api/routes'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()

const routeManifest = ref<any>(null)
const frameworks = ref<string[]>([])
const frameworkFilter = ref<string | undefined>(undefined)
const loading = ref(false)

const METHOD_COLORS: Record<string, string> = {
  GET: 'green', POST: 'blue', PUT: 'orange', DELETE: 'red',
  PATCH: 'purple', HEAD: 'default', OPTIONS: 'default',
}

const routeColumns = [
  { title: 'URL', dataIndex: 'url', key: 'url', ellipsis: true },
  { title: '方法', dataIndex: 'method', key: 'method', width: 100 },
  { title: '框架', dataIndex: 'framework', key: 'framework', width: 120 },
  { title: 'Handler', dataIndex: 'handler', key: 'handler', ellipsis: true },
  { title: '文件', dataIndex: 'handlerFile', key: 'handlerFile', ellipsis: true },
  { title: '行号', dataIndex: 'handlerLine', key: 'handlerLine', width: 80 },
  { title: '类型', dataIndex: 'handlerKind', key: 'handlerKind', width: 100 },
]

const filteredRoutes = computed(() => {
  if (!routeManifest.value?.entries) return []
  if (!frameworkFilter.value) return routeManifest.value.entries
  return routeManifest.value.entries.filter((e: any) => e.framework === frameworkFilter.value)
})

function methodColor(method: string) {
  return METHOD_COLORS[method] || 'default'
}

async function loadData() {
  const projectPath = projectStore.currentProject
  if (!projectPath) return
  loading.value = true
  try {
    const [manifest, fws] = await Promise.all([
      routesApi.getRoutes(projectPath),
      routesApi.getFrameworks(projectPath),
    ])
    routeManifest.value = manifest || { entries: [], topHandlerFile: null, topHandlerFileCount: 0, totalRoutes: 0 }
    frameworks.value = fws || []
  } catch (err: any) {
    console.error('加载路由数据失败:', err)
  } finally {
    loading.value = false
  }
}

function onFilterChange() { /* Client-side filtering handled by computed */ }

function navigateToNode(record: any) {
  const pid = route.params.id
  router.push({ path: `/projects/${pid}/graph`, query: { nodeId: record.handler } })
}

onMounted(() => {
  const pid = route.params.id as string
  if (pid && !projectStore.currentProject) {
    projectStore.selectProject(decodeURIComponent(pid))
  }
  loadData()
})

watch(() => projectStore.currentProject, () => { loadData() })
</script>

<style scoped>
.routes-page { max-width: 1100px; }
.page-header { margin-bottom: 20px; }
.page-header h2 { margin: 0; font-size: 20px; font-weight: 600; }
</style>
