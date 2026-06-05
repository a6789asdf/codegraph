<template>
  <div class="projects-page">
    <div class="hero">
      <h1>项目洞察</h1>
      <p class="hero-subtitle">知识图谱驱动的项目分析平台 · v0.2</p>
    </div>

    <a-spin :spinning="projectStore.loading">
      <a-row :gutter="[20, 20]">
        <a-col v-for="p in projectStore.projects" :key="p.path" :xs="24" :sm="12" :lg="8">
          <a-card hoverable class="project-card" @click="openProject(p)">
            <div class="card-header">
              <ApartmentOutlined class="card-icon" />
              <div>
                <div class="card-title">{{ p.name }}</div>
                <div class="card-path">{{ p.path }}</div>
              </div>
            </div>

            <a-row :gutter="12" class="card-stats" v-if="projectStore.stats">
              <a-col :span="8">
                <div class="stat-value">{{ (projectStore.stats.nodeCount || 0).toLocaleString() }}</div>
                <div class="stat-label">节点</div>
              </a-col>
              <a-col :span="8">
                <div class="stat-value">{{ (projectStore.stats.edgeCount || 0).toLocaleString() }}</div>
                <div class="stat-label">边</div>
              </a-col>
              <a-col :span="8">
                <div class="stat-value">{{ projectStore.stats.fileCount || 0 }}</div>
                <div class="stat-label">文件</div>
              </a-col>
            </a-row>

            <div class="card-footer">
              <a-tag v-if="p.initialized" color="green">已索引</a-tag>
              <a-tag v-else color="default">未索引</a-tag>
            </div>
          </a-card>
        </a-col>
      </a-row>

      <a-empty v-if="!projectStore.loading && !projectStore.projects.length" description="暂无已注册项目" style="margin-top: 60px">
        <template #description>
          <p>在项目根目录运行以下命令注册：</p>
          <code>codegraph register &lt;path&gt;</code>
        </template>
      </a-empty>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ApartmentOutlined } from '@ant-design/icons-vue'
import { useProjectStore } from '@/stores/project'

const router = useRouter()
const projectStore = useProjectStore()

function openProject(p: any) {
  projectStore.selectProject(p.path)
  router.push(`/projects/${encodeURIComponent(p.path)}`)
}

onMounted(() => {
  projectStore.fetchProjects()
})
</script>

<style scoped>
.projects-page { max-width: 1000px; margin: 60px auto; padding: 0 24px; }
.hero { text-align: center; margin-bottom: 40px; }
.hero h1 { font-size: 32px; font-weight: 700; margin: 0; color: rgba(0,0,0,0.85); }
.hero-subtitle { font-size: 15px; color: rgba(0,0,0,0.45); margin-top: 8px; }
.project-card { border-radius: 12px; transition: box-shadow 0.2s; }
.project-card:hover { box-shadow: 0 6px 20px rgba(0,0,0,0.1); }
.card-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.card-icon { font-size: 32px; color: #1677ff; }
.card-title { font-size: 18px; font-weight: 600; }
.card-path { font-size: 12px; color: rgba(0,0,0,0.45); margin-top: 2px; font-family: monospace; }
.card-stats { text-align: center; padding: 12px 0; border-top: 1px solid #f0f0f0; border-bottom: 1px solid #f0f0f0; }
.card-stats .stat-value { font-size: 20px; font-weight: 700; color: rgba(0,0,0,0.85); }
.card-stats .stat-label { font-size: 11px; color: rgba(0,0,0,0.45); margin-top: 2px; }
.card-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; }
code {
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 13px; background: #f5f5f5; padding: 4px 8px; border-radius: 4px;
}
</style>
