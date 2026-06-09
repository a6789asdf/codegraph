<template>
  <div class="projects-page">
    <div class="system-bar">
      <a-select
        v-model:value="projectStore.currentSystemId"
        class="system-select"
        placeholder="选择系统"
        @change="onSystemChange"
      >
        <a-select-option v-for="sys in projectStore.systems" :key="sys.id" :value="sys.id">
          <span class="system-option">{{ sys.name }}</span>
          <span class="system-count">{{ sys.projectCount }} 个项目</span>
        </a-select-option>
      </a-select>
      <a-button type="link" size="small" @click="showCreateSystemModal = true">
        <PlusOutlined /> 新建系统
      </a-button>
    </div>

    <div class="hero">
      <h1>{{ projectStore.currentSystemName || '项目洞察' }}</h1>
      <p class="hero-subtitle">知识图谱驱动的项目分析平台 · v0.2</p>
      <a-button type="primary" size="large" class="add-btn" @click="drawerVisible = true">
        <template #icon><PlusOutlined /></template>
        添加项目
      </a-button>
      <a-button size="large" class="cred-btn" @click="credentialDrawerVisible = true">
        <template #icon><KeyOutlined /></template>
        凭证管理
      </a-button>
    </div>

    <div v-if="taskStore.activeTasks.length > 0" class="task-section">
      <h3 class="section-title">
        <loading-outlined spin style="margin-right: 6px" />
        进行中的任务 ({{ taskStore.activeTasks.length }})
      </h3>
      <div class="task-list">
        <div v-for="task in taskStore.activeTasks" :key="task.id" class="task-item">
          <div class="task-info">
            <span class="task-name">{{ task.name }}</span>
            <span class="task-stage">{{ stageLabel(task) }}</span>
          </div>
          <a-progress
            :percent="task.progress_pct"
            :showInfo="true"
            :strokeColor="'#1677ff'"
            size="small"
          />
        </div>
      </div>
    </div>

    <div v-if="taskStore.failedTasks.length > 0" class="task-section task-section-failed">
      <h3 class="section-title">
        <close-circle-outlined style="margin-right: 6px; color: #ff4d4f" />
        失败的任务 ({{ taskStore.failedTasks.length }})
      </h3>
      <div class="task-list">
        <div v-for="task in taskStore.failedTasks" :key="task.id" class="task-item task-item-failed">
          <div class="task-info">
            <span class="task-name">{{ task.name }}</span>
            <a-tooltip :title="task.error_message">
              <span class="task-error">{{ task.error_message }}</span>
            </a-tooltip>
          </div>
          <div class="task-actions">
            <a-button size="small" type="link" @click="taskStore.retryTask(task.id)">重试</a-button>
            <a-popconfirm title="确定删除此任务记录？" @confirm="taskStore.removeTask(task.id)">
              <a-button size="small" type="link" danger>删除</a-button>
            </a-popconfirm>
          </div>
        </div>
      </div>
    </div>

    <div class="projects-section">
      <h3 class="section-title">
        <apartment-outlined style="margin-right: 6px" />
        已就绪项目 ({{ projectStore.projects.length }})
      </h3>

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

        <a-empty v-if="!projectStore.loading && !projectStore.projects.length && taskStore.activeTasks.length === 0" style="margin-top: 60px">
          <template #description>
            <p>暂无已注册项目</p>
            <p style="color: rgba(0,0,0,0.45)">点击上方"添加项目"按钮开始</p>
          </template>
        </a-empty>
      </a-spin>
    </div>

    <AddProjectDrawer v-model:visible="drawerVisible" @created="onTaskCreated" @openCredential="credentialDrawerVisible = true" />
    <CredentialDrawer v-model:visible="credentialDrawerVisible" />

    <a-modal
      v-model:open="showCreateSystemModal"
      title="创建系统"
      @ok="handleCreateSystem"
      :confirmLoading="creatingSystem"
    >
      <a-input v-model:value="newSystemName" placeholder="输入系统名称" />
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  ApartmentOutlined,
  PlusOutlined,
  KeyOutlined,
  LoadingOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons-vue'
import { useProjectStore } from '@/stores/project'
import { useTaskStore } from '@/stores/task'
import AddProjectDrawer from '@/components/project/AddProjectDrawer.vue'
import CredentialDrawer from '@/components/project/CredentialDrawer.vue'

const router = useRouter()
const projectStore = useProjectStore()
const taskStore = useTaskStore()
const drawerVisible = ref(false)
const credentialDrawerVisible = ref(false)

const showCreateSystemModal = ref(false)
const newSystemName = ref('')
const creatingSystem = ref(false)

function openProject(p: any) {
  projectStore.selectProject(p.id)
  router.push(`/projects/${p.id}`)
}

function stageLabel(task: any): string {
  const map: Record<string, string> = {
    pending: '等待中',
    resolving_path: '解析路径',
    fetching: task.source_type === 'git' ? '正在拉取代码' : '正在解压',
    initializing: '正在初始化',
    indexing: '正在建图',
    registering: '正在注册',
    completed: '已完成',
  }
  return map[task.stage] || task.stage || '处理中'
}

function onTaskCreated() {
  taskStore.fetchTasks()
}

function onSystemChange(value: string) {
  projectStore.selectSystem(value)
}

async function handleCreateSystem() {
  if (!newSystemName.value.trim()) return
  creatingSystem.value = true
  try {
    const sys = await projectStore.createSystem(newSystemName.value.trim())
    const newId = (sys as any)?.id || (sys as any)?.data?.id || projectStore.systems[projectStore.systems.length - 1]?.id
    if (newId) {
      projectStore.selectSystem(newId)
    }
    newSystemName.value = ''
    showCreateSystemModal.value = false
  } catch {
    // error is handled in store
  } finally {
    creatingSystem.value = false
  }
}

onMounted(async () => {
  await projectStore.fetchSystems()
  projectStore.fetchProjects()
  taskStore.startPolling()
})

onUnmounted(() => {
  taskStore.stopPolling()
})
</script>

<style scoped>
.projects-page { max-width: 1000px; margin: 60px auto; padding: 0 24px; }
.hero { text-align: center; margin-bottom: 40px; position: relative; }
.hero h1 { font-size: 32px; font-weight: 700; margin: 0; color: rgba(0,0,0,0.85); }
.hero-subtitle { font-size: 15px; color: rgba(0,0,0,0.45); margin-top: 8px; }
.add-btn { margin-top: 16px; }
.cred-btn { margin-top: 16px; margin-left: 12px; }

.system-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 24px; }
.system-select { min-width: 200px; }
.system-select :deep(.ant-select-selector) { font-size: 14px; font-weight: 500; height: 36px !important; display: flex; align-items: center; }
.system-option { font-weight: 500; }
.system-count { font-size: 12px; color: rgba(0,0,0,0.45); margin-left: 8px; }

.section-title {
  font-size: 16px; font-weight: 600; color: rgba(0,0,0,0.85);
  margin-bottom: 16px; display: flex; align-items: center;
}

.task-section {
  margin-bottom: 32px;
  padding: 20px;
  background: #f6f8fa;
  border-radius: 12px;
}
.task-section-failed {
  background: #fff2f0;
}

.task-list { display: flex; flex-direction: column; gap: 12px; }
.task-item {
  background: #fff; border-radius: 8px; padding: 12px 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
.task-item-failed { border-left: 3px solid #ff4d4f; }

.task-info { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.task-name { font-weight: 600; font-size: 14px; }
.task-stage { font-size: 13px; color: #1677ff; }
.task-error {
  font-size: 12px; color: #ff4d4f;
  max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  display: inline-block; vertical-align: middle;
}
.task-actions { display: flex; gap: 4px; }

.projects-section { margin-top: 8px; }
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
</style>
