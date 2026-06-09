<template>
  <div class="graph-view">
    <a-card :bordered="false" style="margin-bottom: 16px">
      <a-space>
        <a-input-search
          v-model:value="searchQuery"
          placeholder="搜索符号定位节点..."
          style="width: 300px"
          @search="onSearchNode"
        />
        <a-radio-group v-model:value="graphStore.layout" button-style="solid" @change="onLayoutChange">
          <a-radio-button value="force">力导向图</a-radio-button>
          <a-radio-button value="dagre">分层布局</a-radio-button>
        </a-radio-group>
        <a-button-group>
          <a-button @click="zoomIn"><ZoomInOutlined /></a-button>
          <a-button @click="zoomOut"><ZoomOutOutlined /></a-button>
          <a-button @click="resetView"><FullscreenOutlined /></a-button>
        </a-button-group>
        <a-button danger @click="graphStore.clearGraph()"><DeleteOutlined /> 清空</a-button>
      </a-space>
    </a-card>

    <a-row :gutter="16">
      <a-col :span="graphStore.selectedNodeId ? 16 : 24">
        <ForceGraph
          v-if="graphStore.hasNodes"
          :nodes="graphNodes"
          :links="graphLinks"
          :height="600"
          @node-click="onNodeClick"
        />
        <a-card v-else :bordered="false" :body-style="{ padding: 0 }">
          <a-empty style="padding-top: 200px" description="搜索符号并展开节点以构建图谱" />
        </a-card>
      </a-col>
      <a-col :span="8" v-if="graphStore.selectedNodeId">
        <a-card title="节点详情" :bordered="false">
          <a-descriptions :column="1" size="small" v-if="graphStore.selectedNodeData">
            <a-descriptions-item label="名称">{{ graphStore.selectedNodeData.name }}</a-descriptions-item>
            <a-descriptions-item label="类型">
              <a-tag :color="kindColor(graphStore.selectedNodeData.kind)">{{ graphStore.selectedNodeData.kind }}</a-tag>
            </a-descriptions-item>
            <a-descriptions-item label="文件">{{ graphStore.selectedNodeData.file }}</a-descriptions-item>
            <a-descriptions-item label="行号">{{ graphStore.selectedNodeData.startLine }}</a-descriptions-item>
          </a-descriptions>
          <a-divider />
          <a-space direction="vertical" style="width: 100%">
            <a-button size="small" type="primary" block @click="expandNode('callers')">
              展开调用者
            </a-button>
            <a-button size="small" block @click="expandNode('callees')">
              展开被调用者
            </a-button>
            <a-button size="small" block @click="expandNode('impact')">
              展开影响范围
            </a-button>
          </a-space>
          <a-divider v-if="nodeCode" />
          <div v-if="nodeCode">
            <h4>源码</h4>
            <CodeViewer :code="nodeCode" :language="detectLang(graphStore.selectedNodeData?.file)" :show-header="false" />
          </div>
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import { ZoomInOutlined, ZoomOutOutlined, FullscreenOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import ForceGraph from '@/components/graph/ForceGraph.vue'
import CodeViewer from '@/components/CodeViewer.vue'
import { useGraphStore } from '@/stores/graph'
import { useProjectStore } from '@/stores/project'
import searchApi from '@/api/search'

const route = useRoute()
const graphStore = useGraphStore()
const projectStore = useProjectStore()

const searchQuery = ref('')
const nodeCode = ref('')

const KIND_COLORS: Record<string, string> = {
  class: '#1890ff', function: '#52c41a', method: '#faad14',
  variable: '#722ed1', interface: '#13c2c2', route: '#fa8c16',
  component: '#eb2f96', module: '#2f54eb', file: '#8c8c8c',
}

const graphNodes = computed(() => graphStore.nodeList)
const graphLinks = computed(() => graphStore.edgeList.map(e => ({
  source: typeof e.source === 'object' ? (e.source as any).id : e.source,
  target: typeof e.target === 'object' ? (e.target as any).id : e.target,
  kind: e.kind,
})))

function kindColor(kind: string) {
  return KIND_COLORS[kind] || '#8c8c8c'
}

function detectLang(file?: string): string {
  if (!file) return 'typescript'
  const ext = file.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = { ts: 'typescript', tsx: 'typescript', js: 'javascript', py: 'python', go: 'go' }
  return map[ext || ''] || 'typescript'
}

function onLayoutChange() {
  // Layout is reactive via graphStore.layout
}

async function onSearchNode(query: string) {
  const projectId = projectStore.currentProject
  if (!projectId || !query) return

  try {
    const results = await searchApi.search(projectId, query)
    if (results && results.length > 0) {
      const firstResult = results[0]
      const node = firstResult.node
      graphStore.addGraphData({ nodes: [node], edges: [] })
      graphStore.selectNode(node.id)

      const [callers, callees] = await Promise.all([
        searchApi.getCallers(projectId, node.id),
        searchApi.getCallees(projectId, node.id),
      ])

      const newNodes: any[] = []
      const newEdges: any[] = []
      for (const c of callers) {
        newNodes.push(c.node)
        newEdges.push({ source: c.node.id, target: node.id, kind: c.edge?.kind })
      }
      for (const c of callees) {
        newNodes.push(c.node)
        newEdges.push({ source: node.id, target: c.node.id, kind: c.edge?.kind })
      }
      graphStore.addGraphData({ nodes: newNodes, edges: newEdges })
    }
  } catch (err: any) {
    message.error('搜索失败: ' + err.message)
  }
}

async function expandNode(type: string) {
  const projectId = projectStore.currentProject
  const nodeId = graphStore.selectedNodeId
  if (!projectId || !nodeId) return

  try {
    let data: any
    if (type === 'callers') {
      data = await searchApi.getCallers(projectId, nodeId)
    } else if (type === 'callees') {
      data = await searchApi.getCallees(projectId, nodeId)
    } else if (type === 'impact') {
      data = await searchApi.getImpact(projectId, nodeId)
    }

    if (data) {
      const newNodes: any[] = []
      const newEdges: any[] = []
      if (Array.isArray(data)) {
        for (const item of data) {
          newNodes.push(item.node)
          const src = type === 'callers' ? item.node.id : nodeId
          const tgt = type === 'callers' ? nodeId : item.node.id
          newEdges.push({ source: src, target: tgt, kind: item.edge?.kind })
        }
      } else if (data.nodes && data.edges) {
        const nodesArray = Array.isArray(data.nodes) ? data.nodes : Object.values(data.nodes)
        newNodes.push(...nodesArray)
        newEdges.push(...data.edges)
      }
      graphStore.addGraphData({ nodes: newNodes, edges: newEdges })
      graphStore.expandNode(nodeId)
    }
  } catch (err: any) {
    message.error('展开失败: ' + err.message)
  }
}

async function onNodeClick(node: any) {
  graphStore.selectNode(node.id)
  // Load code
  const projectId = projectStore.currentProject
  if (!projectId) return
  try {
    const data = await searchApi.getNode(projectId, node.id, true)
    nodeCode.value = data?.code || ''
  } catch {
    nodeCode.value = ''
  }
}

function zoomIn() { /* ForceGraph handles zoom internally */ }
function zoomOut() { /* ForceGraph handles zoom internally */ }
function resetView() { /* ForceGraph handles zoom internally */ }

onMounted(() => {
  const pid = route.params.id as string
  if (pid && !projectStore.currentProject) {
    projectStore.selectProject(pid)
  }
})
</script>

<style scoped>
.graph-view { max-width: 1200px; }
</style>
