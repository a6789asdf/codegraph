<template>
  <div class="quality-page">
    <div class="page-header">
      <h2>代码质量</h2>
    </div>

    <a-tabs v-model:activeKey="activeTab">
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

      <a-tab-pane key="metrics" tab="节点度量">
        <a-card :bordered="false">
          <a-input-search
            v-model:value="metricsNodeId"
            placeholder="输入节点 ID..."
            enter-button="查询"
            style="max-width: 500px; margin-bottom: 16px"
            @search="qualityStore.fetchNodeMetrics(metricsNodeId)"
          />
          <a-descriptions v-if="qualityStore.nodeMetrics" :column="2" bordered size="small">
            <a-descriptions-item label="入边数">{{ qualityStore.nodeMetrics.incomingEdgeCount }}</a-descriptions-item>
            <a-descriptions-item label="出边数">{{ qualityStore.nodeMetrics.outgoingEdgeCount }}</a-descriptions-item>
            <a-descriptions-item label="调用数">{{ qualityStore.nodeMetrics.callCount }}</a-descriptions-item>
            <a-descriptions-item label="调用者数">{{ qualityStore.nodeMetrics.callerCount }}</a-descriptions-item>
            <a-descriptions-item label="子节点数">{{ qualityStore.nodeMetrics.childCount }}</a-descriptions-item>
            <a-descriptions-item label="深度">{{ qualityStore.nodeMetrics.depth }}</a-descriptions-item>
          </a-descriptions>
          <a-empty v-else description="输入节点 ID 查看度量" />
        </a-card>
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useQualityStore } from '@/stores/quality'
import { useProjectStore } from '@/stores/project'

const route = useRoute()
const qualityStore = useQualityStore()
const projectStore = useProjectStore()

const activeTab = ref('circular')
const deadCodeKinds = ref<string[]>(['function', 'method'])
const filePath = ref('')
const metricsNodeId = ref('')

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

onMounted(() => {
  const pid = route.params.id as string
  if (pid && !projectStore.currentProject) {
    projectStore.selectProject(decodeURIComponent(pid))
  }
})
</script>

<style scoped>
.quality-page { max-width: 1100px; }
.page-header { margin-bottom: 20px; }
.page-header h2 { margin: 0; font-size: 20px; font-weight: 600; }
</style>
