<template>
  <div class="dashboard">
    <div class="page-header">
      <h2>仪表盘</h2>
      <a-tag v-if="projectStore.status" color="processing">
        {{ projectStore.status.isIndexing ? '索引中...' : '图谱就绪' }}
      </a-tag>
    </div>

    <a-spin :spinning="projectStore.loading">
      <!-- Stats Row -->
      <a-row :gutter="[16, 16]" class="stats-row">
        <a-col :xs="24" :sm="12" :md="6">
          <StatCard
            :icon="ClusterOutlined" color="#1677ff"
            label="图节点" :value="projectStore.stats?.nodeCount ?? 0" format="number"
          />
        </a-col>
        <a-col :xs="24" :sm="12" :md="6">
          <StatCard
            :icon="ApartmentOutlined" color="#52c41a"
            label="关系边" :value="projectStore.stats?.edgeCount ?? 0" format="number"
          />
        </a-col>
        <a-col :xs="24" :sm="12" :md="6">
          <StatCard
            :icon="FileOutlined" color="#faad14"
            label="源文件" :value="projectStore.stats?.fileCount ?? 0" format="number"
          />
        </a-col>
        <a-col :xs="24" :sm="12" :md="6">
          <StatCard
            :icon="DatabaseOutlined" color="#722ed1"
            label="数据库大小" :value="projectStore.stats?.dbSizeBytes ?? 0" format="bytes"
          />
        </a-col>
      </a-row>

      <!-- Second Row -->
      <a-row :gutter="[16, 16]" style="margin-top: 16px">
        <a-col :xs="24" :md="14">
          <a-card title="节点类型分布" :bordered="false">
            <div class="lang-list">
              <div
                v-for="(count, kind) in projectStore.stats?.nodesByKind ?? {}"
                :key="kind" class="lang-item"
              >
                <span class="lang-name">{{ kind }}</span>
                <a-progress
                  :percent="kindPercent(count as any as number)"
                  :stroke-color="kindColor(kind as any as string)"
                  :show-info="false"
                  style="flex: 1; margin: 0 12px"
                />
                <span class="lang-count">{{ count }}</span>
              </div>
              <a-empty v-if="!Object.keys(projectStore.stats?.nodesByKind ?? {}).length" description="暂无数据" />
            </div>
          </a-card>
        </a-col>

        <a-col :xs="24" :md="10">
          <a-card title="索引状态" :bordered="false">
            <div v-if="projectStore.status">
              <a-descriptions :column="1" size="small">
                <a-descriptions-item label="状态">
                  <a-badge :status="statusBadge" :text="statusText" />
                </a-descriptions-item>
                <a-descriptions-item label="后端">
                  <a-tag>{{ projectStore.status.backend || 'N/A' }}</a-tag>
                </a-descriptions-item>
                <a-descriptions-item label="日志模式">
                  <a-tag :color="projectStore.status.journalMode === 'wal' ? 'green' : 'orange'">
                    {{ projectStore.status.journalMode || 'N/A' }}
                  </a-tag>
                </a-descriptions-item>
                <a-descriptions-item label="文件监控">
                  <a-tag :color="projectStore.status.isWatching ? 'green' : 'default'">
                    {{ projectStore.status.isWatching ? '运行中' : '未启动' }}
                  </a-tag>
                </a-descriptions-item>
              </a-descriptions>
            </div>
            <a-empty v-else description="请先选择项目" />
          </a-card>

          <a-card title="快捷操作" :bordered="false" style="margin-top: 16px">
            <a-space direction="vertical" style="width: 100%" :size="12">
              <a-button type="primary" block @click="$router.push(`/projects/${$route.params.id}/search`)">
                <SearchOutlined /> 搜索代码
              </a-button>
              <a-button block @click="$router.push(`/projects/${$route.params.id}/impact`)">
                <NodeIndexOutlined /> 影响分析
              </a-button>
              <a-button block @click="$router.push(`/projects/${$route.params.id}/architecture`)">
                <BlockOutlined /> 架构分析
              </a-button>
              <a-button block @click="$router.push(`/projects/${$route.params.id}/review`)">
                <SafetyOutlined /> 代码审查
              </a-button>
              <a-button block @click="$router.push(`/projects/${$route.params.id}/wiki`)">
                <ReadOutlined /> Wiki 文档
              </a-button>
            </a-space>
          </a-card>

          <a-card title="索引操作" :bordered="false" style="margin-top: 16px">
            <a-space>
              <a-button type="primary" :loading="indexing" @click="triggerIndex">
                <SyncOutlined /> 全量索引
              </a-button>
              <a-button :loading="syncing" @click="triggerSync">
                <CloudUploadOutlined /> 增量同步
              </a-button>
            </a-space>
          </a-card>
        </a-col>
      </a-row>

      <!-- Frameworks -->
      <a-row :gutter="[16, 16]" style="margin-top: 16px">
        <a-col :span="24">
          <a-card title="检测到的框架" :bordered="false">
            <div v-if="projectStore.status?.frameworks?.length">
              <a-tag v-for="fw in projectStore.status.frameworks" :key="fw" color="blue" style="margin-bottom: 8px; font-size: 14px; padding: 4px 12px">
                {{ fw }}
              </a-tag>
            </div>
            <a-empty v-else description="未检测到框架" />
          </a-card>
        </a-col>
      </a-row>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  ClusterOutlined, ApartmentOutlined, FileOutlined, DatabaseOutlined,
  SearchOutlined, NodeIndexOutlined, BlockOutlined,
  SafetyOutlined, ReadOutlined, SyncOutlined, CloudUploadOutlined,
} from '@ant-design/icons-vue'
import StatCard from '@/components/shared/StatCard.vue'
import { useProjectStore } from '@/stores/project'

const route = useRoute()
const projectStore = useProjectStore()
const indexing = ref(false)
const syncing = ref(false)

const KIND_COLORS: Record<string, string> = {
  class: '#1890ff', function: '#52c41a', method: '#faad14',
  variable: '#722ed1', interface: '#13c2c2', route: '#fa8c16',
  component: '#eb2f96', module: '#2f54eb',
}

function kindPercent(count: number): number {
  const total = projectStore.stats?.nodeCount || 0
  return total ? Math.round((count / total) * 100) : 0
}

function kindColor(kind: string): string {
  return KIND_COLORS[kind] || '#8c8c8c'
}

const statusBadge = computed(() => {
  if (!projectStore.status) return 'default'
  if (projectStore.status.isIndexing) return 'processing'
  if (projectStore.status.pendingFiles?.length > 0) return 'warning'
  return 'success'
})

const statusText = computed(() => {
  if (!projectStore.status) return '未连接'
  if (projectStore.status.isIndexing) return '索引中...'
  if (projectStore.status.pendingFiles?.length > 0) return '有待同步文件'
  return '正常'
})

async function triggerIndex() {
  indexing.value = true
  try {
    await projectStore.triggerIndex()
    message.success('索引已启动')
  } catch (err: any) {
    message.error('索引启动失败: ' + err.message)
  } finally {
    indexing.value = false
  }
}

async function triggerSync() {
  syncing.value = true
  try {
    await projectStore.triggerSync()
    message.success('同步已启动')
  } catch (err: any) {
    message.error('同步启动失败: ' + err.message)
  } finally {
    syncing.value = false
  }
}

onMounted(() => {
  const pid = route.params.id as string
  if (pid && !projectStore.currentProject) {
    projectStore.selectProject(decodeURIComponent(pid))
  }
})
</script>

<style scoped>
.dashboard { max-width: 1200px; }
.page-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 20px;
}
.page-header h2 { margin: 0; font-size: 20px; font-weight: 600; }
.lang-list { padding: 4px 0; }
.lang-item { display: flex; align-items: center; padding: 8px 0; }
.lang-item + .lang-item { border-top: 1px solid #f0f0f0; }
.lang-name { width: 100px; font-size: 13px; color: rgba(0,0,0,0.65); flex-shrink: 0; }
.lang-count { width: 40px; text-align: right; font-size: 13px; color: rgba(0,0,0,0.45); }
</style>
