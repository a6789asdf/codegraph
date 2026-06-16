<template>
  <a-layout-sider
    :width="240"
    style="background: #001529; position: fixed; left: 0; top: 0; bottom: 0; z-index: 100; overflow-y: auto"
  >
    <div class="sidebar-logo">
      <div class="title">项目洞察</div>
      <div class="subtitle">v0.2</div>
    </div>

    <div class="project-selector">
      <label>当前项目</label>
      <a-select
        v-model:value="currentProjectId"
        style="width: 100%"
        size="small"
        @change="handleProjectChange"
      >
        <a-select-option v-for="p in projectStore.projects" :key="p.id" :value="p.id">
          {{ p.name }}
        </a-select-option>
      </a-select>
    </div>

    <a-menu
      v-model:selectedKeys="selectedKeys"
      mode="inline"
      theme="dark"
      @click="handleMenuClick"
    >
      <a-menu-item-group key="overview" title="概览">
        <a-menu-item key="dashboard">
          <DashboardOutlined />
          <span>仪表盘</span>
        </a-menu-item>
      </a-menu-item-group>
      <a-menu-item-group key="explore" title="探索">
        <a-menu-item key="search">
          <SearchOutlined />
          <span>代码搜索</span>
        </a-menu-item>
        <a-menu-item key="graph">
          <DeploymentUnitOutlined />
          <span>图谱可视化</span>
        </a-menu-item>
        <a-menu-item key="impact">
          <NodeIndexOutlined />
          <span>影响分析</span>
        </a-menu-item>
        <a-menu-item key="flows">
          <BranchesOutlined />
          <span>执行流追踪</span>
        </a-menu-item>
      </a-menu-item-group>
      <a-menu-item-group key="architecture" title="架构">
        <a-menu-item key="architecture">
          <BlockOutlined />
          <span>架构分析</span>
        </a-menu-item>
        <a-menu-item key="routes">
          <ApiOutlined />
          <span>路由与桥接</span>
        </a-menu-item>
        <a-menu-item key="refactor">
          <ToolOutlined />
          <span>重构工具</span>
        </a-menu-item>
      </a-menu-item-group>
      <a-menu-item-group key="quality" title="质量">
        <a-menu-item key="review">
          <SafetyOutlined />
          <span>代码审查</span>
        </a-menu-item>
      </a-menu-item-group>
      <a-menu-item-group key="docs" title="文档">
        <a-menu-item key="wiki">
          <ReadOutlined />
          <span>Wiki 文档</span>
        </a-menu-item>
      </a-menu-item-group>
    </a-menu>
  </a-layout-sider>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  DashboardOutlined, SearchOutlined,
  NodeIndexOutlined, BranchesOutlined, BlockOutlined,
  ApiOutlined, ToolOutlined, DeploymentUnitOutlined,
  SafetyOutlined, ReadOutlined,
} from '@ant-design/icons-vue'
import { useProjectStore } from '@/stores/project'

const router = useRouter()
const route = useRoute()
const projectStore = useProjectStore()

const currentProjectId = computed({
  get: () => route.params.id as string,
  set: (_val: string) => {},
})

const selectedKeys = computed(() => {
  const name = route.name as string
  return [name?.toLowerCase() || 'dashboard']
})

function handleMenuClick({ key }: { key: string }) {
  const pid = currentProjectId.value
  router.push(`/projects/${pid}/${key}`)
}

function handleProjectChange(pid: string) {
  projectStore.selectProject(pid)
  router.push(`/projects/${pid}/dashboard`)
}

onMounted(() => {
  projectStore.fetchProjects()
})
</script>

<style scoped>
.sidebar-logo {
  padding: 20px 24px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.sidebar-logo .title {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.02em;
  line-height: 1.4;
}
.sidebar-logo .subtitle {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.65);
  font-family: monospace;
}
.project-selector {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.project-selector label {
  display: block;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
</style>
