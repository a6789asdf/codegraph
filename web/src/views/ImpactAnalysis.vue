<template>
  <div class="impact-page">
    <div class="page-header">
      <h2>影响分析</h2>
      <a-space>
        <a-select v-model:value="maxDepth" style="width: 140px">
          <a-select-option :value="1">深度 1</a-select-option>
          <a-select-option :value="2">深度 2</a-select-option>
          <a-select-option :value="3">深度 3</a-select-option>
          <a-select-option :value="5">深度 5</a-select-option>
        </a-select>
        <a-button type="primary" :loading="loading" @click="doAnalysis">
          <NodeIndexOutlined /> 分析影响
        </a-button>
      </a-space>
    </div>

    <a-card :bordered="false" style="margin-bottom: 16px">
      <div class="file-input-area">
        <label>变更文件（每行一个，或逗号分隔）：</label>
        <a-textarea
          v-model:value="changedFiles"
          :rows="3"
          placeholder="src/auth/tokens.py&#10;src/api/handlers.py"
        />
      </div>
    </a-card>

    <a-spin :spinning="loading">
      <a-row v-if="impactData" :gutter="[16, 16]" style="margin-bottom: 16px">
        <a-col :xs="24" :sm="8">
          <a-card :bordered="false" class="impact-stat">
            <div class="impact-stat-value" style="color: #1677ff">{{ impactData.total_impacted ?? impactData.nodes?.length ?? 0 }}</div>
            <div class="impact-stat-label">受影响节点</div>
          </a-card>
        </a-col>
        <a-col :xs="24" :sm="8">
          <a-card :bordered="false" class="impact-stat">
            <div class="impact-stat-value" style="color: #52c41a">{{ impactData.impacted_nodes?.filter((n: any) => n.depth === 0).length ?? 0 }}</div>
            <div class="impact-stat-label">直接变更</div>
          </a-card>
        </a-col>
        <a-col :xs="24" :sm="8">
          <a-card :bordered="false" class="impact-stat">
            <div class="impact-stat-value" style="color: #722ed1">{{ impactData.affected_tests?.length ?? 0 }}</div>
            <div class="impact-stat-label">受影响测试</div>
          </a-card>
        </a-col>
      </a-row>

      <a-card v-if="impactData" title="影响范围图" :bordered="false" style="margin-bottom: 16px">
        <ForceGraph
          :nodes="graphNodes"
          :links="graphLinks"
          :height="450"
          @node-click="onNodeClick"
        />
        <div class="depth-legend">
          <span v-for="i in maxDepth + 1" :key="i" class="depth-item">
            <span class="depth-dot" :style="{ background: depthColors[i - 1] }"></span>
            深度 {{ i - 1 }}
          </span>
        </div>
      </a-card>

      <a-card v-if="impactData?.impacted_nodes" title="受影响节点列表" :bordered="false">
        <a-table
          :columns="impactColumns"
          :data-source="impactData.impacted_nodes"
          :pagination="false"
          row-key="node"
          size="middle"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'depth'">
              <a-tag :color="depthColors[record.depth]">D{{ record.depth }}</a-tag>
            </template>
            <template v-if="column.key === 'node'">
              <code>{{ record.name || record.node }}</code>
            </template>
            <template v-if="column.key === 'kind'">
              <a-tag>{{ record.kind }}</a-tag>
            </template>
            <template v-if="column.key === 'reason'">
              <a-tag v-if="record.reason === 'direct_change'" color="red">直接变更</a-tag>
              <a-tag v-else-if="record.reason === 'calls_changed'" color="orange">调用链</a-tag>
              <span v-else>{{ record.reason }}</span>
            </template>
          </template>
        </a-table>
      </a-card>

      <a-empty v-if="!impactData && !loading" description="输入变更文件，点击「分析影响」开始" style="margin-top: 60px" />
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { NodeIndexOutlined } from '@ant-design/icons-vue'
import analysisApi from '@/api/analysis'
import ForceGraph from '@/components/graph/ForceGraph.vue'
import { useProjectStore } from '@/stores/project'

const route = useRoute()
const projectStore = useProjectStore()

const changedFiles = ref('')
const maxDepth = ref(2)
const loading = ref(false)
const impactData = ref<any>(null)

const depthColors = ['#ff4d4f', '#fa8c16', '#faad14', '#1677ff', '#52c41a', '#8c8c8c']

const impactColumns = [
  { title: '深度', key: 'depth', width: 70 },
  { title: '节点', key: 'node', ellipsis: true },
  { title: '类型', key: 'kind', width: 80 },
  { title: '文件', dataIndex: 'file_path', ellipsis: true },
  { title: '原因', key: 'reason', width: 100 },
]

const graphNodes = computed(() => {
  if (!impactData.value?.impacted_nodes) return []
  return impactData.value.impacted_nodes.map((n: any) => ({
    id: n.node,
    name: n.name,
    kind: n.kind,
    file: n.file_path,
    depth: n.depth,
    reason: n.reason,
    size: 6 - n.depth,
  }))
})

const graphLinks = computed(() => {
  if (!impactData.value?.impacted_nodes) return []
  const links: { source: string; target: string }[] = []
  const nodes = impactData.value.impacted_nodes
  for (let i = 0; i < nodes.length; i++) {
    for (let j = 0; j < nodes.length; j++) {
      if (nodes[j].depth === nodes[i].depth + 1) {
        links.push({ source: nodes[i].node, target: nodes[j].node })
      }
    }
  }
  return links
})

async function doAnalysis() {
  const files = changedFiles.value.split(/[\n,]/).map(f => f.trim()).filter(Boolean)
  if (!files.length) return
  loading.value = true
  try {
    impactData.value = await analysisApi.getImpact(projectStore.currentProject!, files, maxDepth.value)
  } catch (e) {
    console.error('Impact analysis failed', e)
  } finally {
    loading.value = false
  }
}

function onNodeClick(node: any) {
  console.log('Clicked:', node)
}

onMounted(() => {
  const pid = route.params.id as string
  if (pid && !projectStore.currentProject) {
    projectStore.selectProject(pid)
  }
  const file = route.query.file as string
  if (file) {
    changedFiles.value = decodeURIComponent(file)
  }
})
</script>

<style scoped>
.impact-page { max-width: 1100px; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.page-header h2 { margin: 0; font-size: 20px; font-weight: 600; }
.file-input-area label { display: block; margin-bottom: 8px; font-weight: 500; font-size: 13px; color: rgba(0,0,0,0.65); }
.impact-stat { text-align: center; padding: 8px 0; }
.impact-stat-value { font-size: 32px; font-weight: 700; }
.impact-stat-label { font-size: 13px; color: rgba(0,0,0,0.45); margin-top: 4px; }
.depth-legend { display: flex; justify-content: center; gap: 16px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #f0f0f0; }
.depth-item { display: flex; align-items: center; gap: 4px; font-size: 12px; color: rgba(0,0,0,0.45); }
.depth-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; }
code { font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace; font-size: 12px; background: #f5f5f5; padding: 1px 4px; border-radius: 3px; }
</style>
