<template>
  <div class="code-viewer">
    <div class="code-header" v-if="showHeader">
      <span class="code-lang">{{ language }}</span>
      <a-button size="small" type="text" @click="copyCode">
        <CopyOutlined /> 复制
      </a-button>
    </div>
    <pre><code ref="codeRef" :class="`language-${language}`">{{ code }}</code></pre>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { CopyOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import hljs from 'highlight.js'

const props = withDefaults(defineProps<{
  code: string
  language?: string
  showHeader?: boolean
}>(), {
  language: 'typescript',
  showHeader: true,
})

const codeRef = ref<HTMLElement>()

function highlight() {
  if (codeRef.value && props.code) {
    try {
      const result = hljs.highlight(props.code, { language: props.language })
      codeRef.value.innerHTML = result.value
    } catch {
      codeRef.value.textContent = props.code
    }
  }
}

function copyCode() {
  navigator.clipboard.writeText(props.code).then(() => {
    message.success('已复制到剪贴板')
  })
}

watch(() => props.code, highlight)
onMounted(highlight)
</script>

<style scoped>
.code-viewer {
  background: #1e1e1e;
  border-radius: 8px;
  overflow: hidden;
}
.code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: #2d2d2d;
  border-bottom: 1px solid #3e3e3e;
}
.code-lang {
  color: #999;
  font-size: 12px;
  text-transform: uppercase;
}
.code-viewer pre {
  margin: 0;
  padding: 16px;
  overflow-x: auto;
  max-height: 500px;
  overflow-y: auto;
}
.code-viewer code {
  color: #d4d4d4;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
}
</style>
