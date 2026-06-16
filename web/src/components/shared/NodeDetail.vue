<template>
  <div class="node-detail">
    <a-descriptions :column="1" size="small" bordered>
      <a-descriptions-item label="类型">
        <a-tag :color="kindColor(node.node?.kind)">{{ node.node?.kind }}</a-tag>
      </a-descriptions-item>
      <a-descriptions-item label="名称">{{ node.node?.name }}</a-descriptions-item>
      <a-descriptions-item label="文件">
        <code>{{ node.node?.filePath }}:{{ node.node?.startLine }}</code>
      </a-descriptions-item>
      <a-descriptions-item v-if="node.node?.kind" label="类型标签">
        <a-tag>{{ node.node.kind }}</a-tag>
      </a-descriptions-item>
    </a-descriptions>

    <div v-if="node.callers?.length" class="section">
      <h4>调用者 ({{ node.callers.length }})</h4>
      <div v-for="c in node.callers" :key="c.id || c.node?.id" class="edge-item">
        <div class="edge-source">{{ c.node?.name || c.source }}</div>
        <div class="edge-file">{{ c.node?.filePath || c.file_path }}:{{ c.node?.startLine || c.line }}</div>
      </div>
    </div>

    <div v-if="node.callees?.length" class="section">
      <h4>被调用 ({{ node.callees.length }})</h4>
      <div v-for="c in node.callees" :key="c.id || c.node?.id" class="edge-item">
        <div class="edge-source">{{ c.node?.name || c.target }}</div>
        <div class="edge-file">{{ c.node?.filePath || c.file_path }}:{{ c.node?.startLine || c.line }}</div>
      </div>
    </div>

    <a-empty
      v-if="!node.callers?.length && !node.callees?.length"
      description="暂无关系数据"
      style="margin-top: 24px"
    />
  </div>
</template>

<script setup lang="ts">
defineProps<{ node: any }>()

function kindColor(kind: string): string {
  const map: Record<string, string> = {
    Function: 'blue', Class: 'green', Method: 'cyan',
    File: 'default', Type: 'orange', Test: 'purple',
    function: 'blue', class: 'green', method: 'cyan',
    interface: 'cyan', variable: 'purple', route: 'gold',
  }
  return map[kind] || 'default'
}
</script>

<style scoped>
.node-detail code {
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  background: #f5f5f5;
  padding: 1px 4px;
  border-radius: 3px;
}
.section { margin-top: 24px; }
.section h4 {
  font-size: 14px; font-weight: 600; margin-bottom: 12px;
  padding-bottom: 8px; border-bottom: 1px solid #f0f0f0;
}
.edge-item { padding: 8px 0; border-bottom: 1px solid #fafafa; }
.edge-source {
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 13px; color: rgba(0, 0, 0, 0.85);
}
.edge-file { font-size: 12px; color: rgba(0, 0, 0, 0.45); margin-top: 2px; }
</style>
