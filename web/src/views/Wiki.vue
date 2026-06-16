<template>
  <div class="wiki-page">
    <div class="page-header">
      <h2>Wiki 文档</h2>
      <a-space>
        <a-button :loading="generating" @click="generateWiki">
          <ReloadOutlined /> 重新生成
        </a-button>
      </a-space>
    </div>

    <a-spin :spinning="loading">
      <a-row :gutter="[16, 16]">
        <a-col :xs="24" :md="8">
          <a-card title="页面列表" :bordered="false">
            <a-menu v-model:selectedKeys="selectedKeys" mode="inline" @click="handleSelect">
              <a-menu-item v-for="page in pages" :key="page.id">
                <ReadOutlined style="margin-right: 8px" />
                {{ page.title }}
              </a-menu-item>
            </a-menu>
            <a-empty v-if="!pages.length && !loading" description="暂无文档页" />
          </a-card>
        </a-col>

        <a-col :xs="24" :md="16">
          <a-card :bordered="false" :title="currentPage?.title ?? '选择页面'">
            <a-spin :spinning="contentLoading">
              <div v-if="pageContent" class="wiki-content" v-html="renderedContent" />
              <a-empty v-if="!pageContent && !contentLoading" description="选择左侧页面查看文档内容" />
            </a-spin>
          </a-card>
        </a-col>
      </a-row>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ReadOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import { marked } from 'marked'
import wikiApi from '@/api/wiki'
import { useProjectStore } from '@/stores/project'

const route = useRoute()
const projectStore = useProjectStore()

const pages = ref<any[]>([])
const selectedKeys = ref<string[]>([])
const pageContent = ref<string>('')
const loading = ref(false)
const contentLoading = ref(false)
const generating = ref(false)

const currentPage = computed(() => {
  return pages.value.find(p => p.id === selectedKeys.value[0])
})

const renderedContent = computed(() => {
  if (!pageContent.value) return ''
  return marked.parse(pageContent.value) as string
})

async function fetchPages() {
  loading.value = true
  try { pages.value = await wikiApi.getPages(projectStore.currentProject!) as any[] }
  catch (e) { console.error(e) }
  finally { loading.value = false }
}

async function handleSelect({ key }: { key: string }) {
  selectedKeys.value = [key]
  contentLoading.value = true
  try {
    const result = await wikiApi.getPage(projectStore.currentProject!, key) as any
    pageContent.value = result.content || ''
  } catch (e) { console.error(e) }
  finally { contentLoading.value = false }
}

async function generateWiki() {
  generating.value = true
  try {
    const result = await wikiApi.generate(projectStore.currentProject!) as any
    if (result.status === 'ok') await fetchPages()
  } catch (e) { console.error(e) }
  finally { generating.value = false }
}

onMounted(() => {
  const pid = route.params.id as string
  if (pid && !projectStore.currentProject) {
    projectStore.selectProject(pid)
  }
  fetchPages()
})
</script>

<style scoped>
.wiki-page { max-width: 1100px; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.page-header h2 { margin: 0; font-size: 20px; font-weight: 600; }
.wiki-content { font-size: 14px; line-height: 1.8; color: rgba(0,0,0,0.75); }
.wiki-content :deep(h1) { font-size: 24px; margin-top: 0; }
.wiki-content :deep(h2) { font-size: 18px; margin-top: 24px; border-bottom: 1px solid #f0f0f0; padding-bottom: 8px; }
.wiki-content :deep(h3) { font-size: 15px; margin-top: 20px; }
.wiki-content :deep(code) { font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace; background: #f5f5f5; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
.wiki-content :deep(pre) { background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 13px; line-height: 1.5; }
.wiki-content :deep(pre code) { background: none; padding: 0; color: inherit; }
.wiki-content :deep(ul), .wiki-content :deep(ol) { padding-left: 24px; }
.wiki-content :deep(blockquote) { border-left: 3px solid #1677ff; margin: 12px 0; padding: 8px 16px; background: #f0f5ff; color: rgba(0,0,0,0.65); }
</style>
