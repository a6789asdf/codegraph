<template>
  <div class="community-detail-page">
    <div class="page-header">
      <h2>社区详情</h2>
      <a-button @click="goBack">
        <ArrowLeftOutlined /> 返回架构分析
      </a-button>
    </div>

    <a-spin :spinning="loading">
      <template v-if="community">
        <a-card :bordered="false" style="margin-bottom: 16px">
          <h3 style="margin: 0 0 8px">{{ community.name }}</h3>
          <p style="color: rgba(0,0,0,0.45); margin: 0">{{ community.description }}</p>

          <a-row :gutter="24" style="margin-top: 16px">
            <a-col :span="6">
              <div class="meta-value">{{ community.node_count }}</div>
              <div class="meta-label">节点数</div>
            </a-col>
            <a-col :span="6">
              <div class="meta-value">{{ community.file_count }}</div>
              <div class="meta-label">文件数</div>
            </a-col>
            <a-col :span="6">
              <div class="meta-value">{{ community.primary_language }}</div>
              <div class="meta-label">主要语言</div>
            </a-col>
            <a-col :span="6">
              <div class="meta-value">{{ (community.cohesion * 100).toFixed(0) }}%</div>
              <div class="meta-label">内聚度</div>
            </a-col>
          </a-row>
        </a-card>

        <a-card v-if="community.files?.length" title="社区文件" :bordered="false" style="margin-bottom: 16px">
          <a-space wrap>
            <a-tag v-for="file in community.files" :key="file" color="blue">
              <code style="background: none; color: inherit">{{ file }}</code>
            </a-tag>
          </a-space>
        </a-card>

        <a-card title="社区可视化" :bordered="false">
          <ForceGraph
            v-if="graphData"
            :nodes="graphData.nodes"
            :links="graphData.links"
            :height="450"
          />
          <a-empty v-else description="暂无可视化数据" />
        </a-card>
      </template>

      <a-empty v-if="!community && !loading" description="社区未找到" />
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeftOutlined } from '@ant-design/icons-vue'
import architectureApi from '@/api/architecture'
import ForceGraph from '@/components/graph/ForceGraph.vue'
import { useProjectStore } from '@/stores/project'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()

const loading = ref(false)
const community = ref<any>(null)
const graphData = ref<any>(null)

function goBack() {
  router.push(`/projects/${route.params.id}/architecture`)
}

onMounted(async () => {
  const pid = route.params.id as string
  if (pid && !projectStore.currentProject) {
    projectStore.selectProject(pid)
  }
  const cid = route.params.communityId as string
  if (cid) {
    loading.value = true
    try {
      community.value = await architectureApi.getCommunityDetail(projectStore.currentProject!, cid)
      graphData.value = await architectureApi.getCommunityGraphData(projectStore.currentProject!, cid)
    } catch (e) { console.error(e) }
    finally { loading.value = false }
  }
})
</script>

<style scoped>
.community-detail-page { max-width: 1100px; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.page-header h2 { margin: 0; font-size: 20px; font-weight: 600; }
.meta-value { font-size: 22px; font-weight: 700; color: rgba(0,0,0,0.85); }
.meta-label { font-size: 13px; color: rgba(0,0,0,0.45); margin-top: 2px; }
code { font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace; font-size: 12px; background: #f5f5f5; padding: 1px 4px; border-radius: 3px; }
</style>
