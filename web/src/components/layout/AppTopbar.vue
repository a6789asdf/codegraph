<template>
  <a-layout-header class="topbar">
    <div class="topbar-left">
      <a-breadcrumb>
        <a-breadcrumb-item>
          <router-link to="/projects">项目</router-link>
        </a-breadcrumb-item>
        <a-breadcrumb-item>{{ projectName }}</a-breadcrumb-item>
        <a-breadcrumb-item>{{ pageTitle }}</a-breadcrumb-item>
      </a-breadcrumb>
    </div>
    <div class="topbar-right">
      <a-input-search
        v-model:value="searchQuery"
        placeholder="搜索函数、类、文件... (Ctrl+K)"
        style="width: 300px"
        @search="handleSearch"
      />
      <a-tag v-if="projectStore.status" color="success">图谱就绪</a-tag>
    </div>
  </a-layout-header>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()
const searchQuery = ref('')

const projectName = computed(() => {
  const proj = projectStore.projects.find(p => p.path === route.params.id)
  return proj?.name || (route.params.id as string)
})

const PAGE_TITLES: Record<string, string> = {
  Dashboard: '仪表盘',
  Search: '代码搜索',
  Graph: '图谱可视化',
  Impact: '影响分析',
  Flows: '执行流追踪',
  FlowDetail: '执行流详情',
  Architecture: '架构分析',
  Routes: '路由与桥接',
  Quality: '代码质量',
  Refactor: '重构工具',
  Review: '代码审查',
  Wiki: 'Wiki 文档',
}

const pageTitle = computed(() => {
  return PAGE_TITLES[(route.name as string) || ''] || ''
})

function handleSearch(q: string) {
  if (q.trim()) {
    const pid = route.params.id as string
    router.push({ path: `/projects/${pid}/search`, query: { q } })
  }
}

function onKeyDown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    const input = document.querySelector<HTMLInputElement>('.topbar-right input')
    input?.focus()
  }
}

onMounted(() => document.addEventListener('keydown', onKeyDown))
onUnmounted(() => document.removeEventListener('keydown', onKeyDown))
</script>

<style scoped>
.topbar {
  background: #fff;
  padding: 0 28px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #f0f0f0;
  position: sticky;
  top: 0;
  z-index: 50;
}
.topbar-left, .topbar-right {
  display: flex;
  align-items: center;
  gap: 16px;
}
</style>
