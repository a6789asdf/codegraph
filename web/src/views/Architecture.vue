<template>
  <div class="architecture-page">
    <div class="page-header">
      <h2>架构分析</h2>
    </div>

    <a-tabs v-model:activeKey="activeTab">
      <a-tab-pane key="communities" tab="代码社区">
        <a-table
          :columns="communityColumns"
          :data-source="communities"
          :loading="loading.communities"
          :pagination="false"
          row-key="id"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              <router-link :to="`/projects/${$route.params.id}/architecture/communities/${record.id}`">
                {{ record.name }}
              </router-link>
            </template>
            <template v-if="column.key === 'cohesion'">
              <a-progress
                :percent="record.cohesion * 100" :show-info="false" size="small"
                :stroke-color="record.cohesion > 0.7 ? '#52c41a' : record.cohesion > 0.4 ? '#faad14' : '#ff4d4f'"
              />
            </template>
          </template>
        </a-table>
        <a-empty v-if="!communities.length && !loading.communities" description="暂无社区数据" />
      </a-tab-pane>

      <a-tab-pane key="hubs" tab="架构热点">
        <a-table
          :columns="hubColumns"
          :data-source="hubNodes"
          :loading="loading.hubs"
          :pagination="false"
          row-key="node"
          size="middle"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'node'"><a-tooltip :title="record.qualified_name || record.node"><code>{{ record.name || record.node }}</code></a-tooltip></template>
            <template v-if="column.key === 'kind'"><a-tag>{{ record.kind }}</a-tag></template>
            <template v-if="column.key === 'degree'">
              <a-tag :color="record.degree > 20 ? 'red' : record.degree > 10 ? 'orange' : 'blue'">{{ record.degree }}</a-tag>
            </template>
          </template>
        </a-table>
      </a-tab-pane>

      <a-tab-pane key="bridges" tab="架构瓶颈">
        <a-table
          :columns="bridgeColumns"
          :data-source="bridgeNodes"
          :loading="loading.bridges"
          :pagination="false"
          row-key="node"
          size="middle"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'node'"><a-tooltip :title="record.qualified_name || record.node"><code>{{ record.name || record.node }}</code></a-tooltip></template>
            <template v-if="column.key === 'kind'"><a-tag>{{ record.kind }}</a-tag></template>
            <template v-if="column.key === 'betweenness'">
              <a-progress :percent="record.betweenness * 100" :show-info="false" size="small"
                :stroke-color="record.betweenness > 0.3 ? '#ff4d4f' : '#faad14'" />
            </template>
          </template>
        </a-table>
      </a-tab-pane>

      <a-tab-pane key="gaps" tab="知识缺口">
        <a-list
          :data-source="knowledgeGaps"
          :loading="loading.gaps"
        >
          <template #renderItem="{ item }">
            <a-list-item>
              <a-list-item-meta>
                <template #avatar>
                  <a-tag :color="item.gap_score > 10 ? 'red' : item.gap_score > 5 ? 'orange' : 'blue'">
                    {{ item.gap_score > 10 ? 'high' : item.gap_score > 5 ? 'medium' : 'low' }}
                  </a-tag>
                </template>
                <template #title>
                  <code>{{ item.file_path }}</code>
                </template>
                <template #description>
                  被依赖 {{ item.dependent_count }} 次，仅导入 {{ item.import_count }} 个依赖，缺口分数 {{ item.gap_score }}
                </template>
              </a-list-item-meta>
            </a-list-item>
          </template>
        </a-list>
        <a-empty v-if="!knowledgeGaps.length && !loading.gaps" description="暂无知识缺口数据" />
      </a-tab-pane>

      <a-tab-pane key="surprising" tab="意外耦合">
        <a-list
          :data-source="surprisingConnections"
          :loading="loading.surprising"
        >
          <template #renderItem="{ item }">
            <a-list-item>
              <a-list-item-meta>
                <template #title>
                  <a-tooltip :title="item.source_qualified"><code>{{ item.source }}</code></a-tooltip>
                  <span style="margin: 0 8px; color: #999">→</span>
                  <a-tooltip :title="item.target_qualified"><code>{{ item.target }}</code></a-tooltip>
                  <a-tag style="margin-left: 8px">{{ item.edge_kind }}</a-tag>
                  <a-tag v-for="reason in item.reasons" :key="reason" color="orange" style="margin-left: 4px">{{ reason }}</a-tag>
                </template>
                <template #description>
                  惊喜分数 {{ item.surprise_score }} · {{ item.source_file }} → {{ item.target_file }}
                </template>
              </a-list-item-meta>
            </a-list-item>
          </template>
        </a-list>
        <a-empty v-if="!surprisingConnections.length && !loading.surprising" description="暂无意外耦合数据" />
      </a-tab-pane>

      <a-tab-pane key="graph" tab="全图可视化">
        <a-spin :spinning="loading.graph">
          <ForceGraph v-if="graphData" :nodes="graphData.nodes" :links="graphData.links" :height="600" />
          <a-empty v-if="!graphData && !loading.graph" description="暂无图数据" />
        </a-spin>
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import architectureApi from '@/api/architecture'
import ForceGraph from '@/components/graph/ForceGraph.vue'
import { useProjectStore } from '@/stores/project'

const route = useRoute()
const projectStore = useProjectStore()

const activeTab = ref('communities')
const communities = ref<any[]>([])
const hubNodes = ref<any[]>([])
const bridgeNodes = ref<any[]>([])
const knowledgeGaps = ref<any[]>([])
const surprisingConnections = ref<any[]>([])
const graphData = ref<any>(null)

const loading = ref({ communities: false, hubs: false, bridges: false, gaps: false, surprising: false, graph: false })

const communityColumns = [
  { title: '社区', key: 'name', width: 200 },
  { title: '描述', dataIndex: 'description', ellipsis: true },
  { title: '节点', dataIndex: 'node_count', width: 70 },
  { title: '文件', dataIndex: 'file_count', width: 70 },
  { title: '语言', dataIndex: 'primary_language', width: 100 },
  { title: '内聚度', key: 'cohesion', width: 150 },
]

const hubColumns = [
  { title: '节点', key: 'node', ellipsis: true },
  { title: '类型', key: 'kind', width: 80 },
  { title: '连接度', key: 'degree', width: 80 },
  { title: '文件', dataIndex: 'file_path', ellipsis: true },
]

const bridgeColumns = [
  { title: '节点', key: 'node', ellipsis: true },
  { title: '类型', key: 'kind', width: 80 },
  { title: '中介中心性', key: 'betweenness', width: 150 },
  { title: '文件', dataIndex: 'file_path', ellipsis: true },
]

async function fetchCommunities() {
  loading.value.communities = true
  try { communities.value = await architectureApi.getCommunities(projectStore.currentProject!) as any[] }
  catch (e) { console.error(e) }
  finally { loading.value.communities = false }
}

async function fetchHubs() {
  loading.value.hubs = true
  try { hubNodes.value = await architectureApi.getHubNodes(projectStore.currentProject!) as any[] }
  catch (e) { console.error(e) }
  finally { loading.value.hubs = false }
}

async function fetchBridges() {
  loading.value.bridges = true
  try { bridgeNodes.value = await architectureApi.getBridgeNodes(projectStore.currentProject!) as any[] }
  catch (e) { console.error(e) }
  finally { loading.value.bridges = false }
}

async function fetchGaps() {
  loading.value.gaps = true
  try { knowledgeGaps.value = await architectureApi.getKnowledgeGaps(projectStore.currentProject!) as any[] }
  catch (e) { console.error(e) }
  finally { loading.value.gaps = false }
}

async function fetchSurprising() {
  loading.value.surprising = true
  try { surprisingConnections.value = await architectureApi.getSurprisingConnections(projectStore.currentProject!) as any[] }
  catch (e) { console.error(e) }
  finally { loading.value.surprising = false }
}

async function fetchGraph() {
  loading.value.graph = true
  try { graphData.value = await architectureApi.getGraphData(projectStore.currentProject!) as any }
  catch (e) { console.error(e) }
  finally { loading.value.graph = false }
}

onMounted(() => {
  const pid = route.params.id as string
  if (pid && !projectStore.currentProject) {
    projectStore.selectProject(pid)
  }
  fetchCommunities()
  fetchHubs()
  fetchBridges()
  fetchGaps()
  fetchSurprising()
  fetchGraph()
})
</script>

<style scoped>
.architecture-page { max-width: 1100px; }
.page-header { margin-bottom: 20px; }
.page-header h2 { margin: 0; font-size: 20px; font-weight: 600; }
code { font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace; font-size: 12px; background: #f5f5f5; padding: 1px 4px; border-radius: 3px; }
:deep(.ant-list-item-meta-title code) { font-size: 13px; }
</style>
