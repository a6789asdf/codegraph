<template>
  <div class="code-viewer">
    <pre><code>{{ code }}</code></pre>
  </div>
</template>

<script>
export default {
  name: 'CodeViewer',
  props: {
    code: {
      type: String,
      default: '',
    },
    language: {
      type: String,
      default: 'typescript',
    },
  },
};
</script>

<style scoped>
.code-viewer {
  background: #1e1e1e;
  border-radius: 6px;
  padding: 16px;
  overflow-x: auto;
  max-height: 500px;
  overflow-y: auto;
}
.code-viewer pre {
  margin: 0;
}
.code-viewer code {
  color: #d4d4d4;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
}
</style>
