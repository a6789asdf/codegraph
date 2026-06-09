<template>
  <div class="flow-detail-page">
    <div class="page-header">
      <h2>执行流详情</h2>
      <a-button @click="goBack">
        <ArrowLeftOutlined /> 返回
      </a-button>
    </div>

    <a-spin :spinning="loading">
      <template v-if="flowData">
        <a-card :bordered="false" style="margin-bottom: 16px">
          <a-descriptions :column="2">
            <a-descriptions-item label="名称">{{ flowData.name }}</a-descriptions-item>
            <a-descriptions-item label="入口"><code>{{ flowData.entry_point }}</code></a-descriptions-item>
            <a-descriptions-item label="描述" :span="2">{{ flowData.description }}</a-descriptions-item>
            <a-descriptions-item label="节点数">{{ flowData.node_count }}</a-descriptions-item>
            <a-descriptions-item label="关键性">
              <a-progress
                :percent="flowData.criticality * 100" :show-info="false" size="small"
                :stroke-color="flowData.criticality > 0.8 ? '#ff4d4f' : '#fa8c16'"
                style="width: 120px; display: inline-block"
              />
              {{ (flowData.criticality * 100).toFixed(0) }}%
            </a-descriptions-item>
          </a-descriptions>
        </a-card>

        <a-card title="执行流图谱" :bordered="false">
          <ForceGraph
            v-if="flowData.nodes"
            :nodes="flowData.nodes"
            :links="flowData.links || []"
            :height="500"
          />
        </a-card>
      </template>
      <a-empty v-if="!flowData && !loading" description="未找到执行流数据" />
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeftOutlined } from '@ant-design/icons-vue'
import flowsApi from '@/api/flows'
import ForceGraph from '@/components/graph/ForceGraph.vue'
import { useProjectStore } from '@/stores/project'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()

const loading = ref(false)
const flowData = ref<any>(null)

function goBack() {
  router.push(`/projects/${route.params.id}/flows`)
}

onMounted(async () => {
  const pid = route.params.id as string
  if (pid && !projectStore.currentProject) {
    projectStore.selectProject(pid)
  }
  const flowId = route.params.flowId as string
  if (flowId) {
    loading.value = true
    try { flowData.value = await flowsApi.getFlowDetail(projectStore.currentProject!, flowId) }
    catch (e) { console.error(e) }
    finally { loading.value = false }
  }
})
</script>

<style scoped>
.flow-detail-page { max-width: 1100px; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.page-header h2 { margin: 0; font-size: 20px; font-weight: 600; }
code { font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace; font-size: 12px; background: #f5f5f5; padding: 1px 4px; border-radius: 3px; }
</style>
