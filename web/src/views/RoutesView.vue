<template>
  <div class="routes-view">
    <a-card title="路由清单" :bordered="false" style="margin-bottom: 16px">
      <template #extra>
        <a-select v-model="frameworkFilter" style="width: 200px" placeholder="框架过滤" allow-clear @change="onFilterChange">
          <a-select-option v-for="fw in frameworks" :key="fw" :value="fw">{{ fw }}</a-select-option>
        </a-select>
      </template>
      <a-table
        :columns="routeColumns"
        :data-source="filteredRoutes"
        :loading="loading"
        :pagination="{ pageSize: 20 }"
        size="small"
        row-key="url"
      >
        <template #method="text">
          <a-tag :color="methodColor(text)">{{ text }}</a-tag>
        </template>
        <template #handler="text, record">
          <a @click="navigateToNode(record)">{{ text }}</a>
        </template>
      </a-table>
      <a-empty v-if="!loading && filteredRoutes.length === 0" description="未检测到路由" />
    </a-card>

    <a-card title="检测到的框架" :bordered="false">
      <a-tag v-for="fw in frameworks" :key="fw" color="blue" style="margin-bottom: 8px; font-size: 14px; padding: 4px 12px">
        {{ fw }}
      </a-tag>
      <a-empty v-if="frameworks.length === 0" description="未检测到框架" />
    </a-card>
  </div>
</template>

<script>
import routesApi from '@/api/routes';

const METHOD_COLORS = {
  GET: 'green',
  POST: 'blue',
  PUT: 'orange',
  DELETE: 'red',
  PATCH: 'purple',
  HEAD: 'default',
  OPTIONS: 'default',
};

export default {
  name: 'RoutesView',
  data() {
    return {
      routeManifest: null,
      frameworks: [],
      frameworkFilter: undefined,
      loading: false,
      routeColumns: [
        { title: 'URL', dataIndex: 'url', key: 'url', ellipsis: true },
        { title: '方法', dataIndex: 'method', key: 'method', width: 100, scopedSlots: { customRender: 'method' } },
        { title: 'Handler', dataIndex: 'handler', key: 'handler', ellipsis: true, scopedSlots: { customRender: 'handler' } },
        { title: '文件', dataIndex: 'handlerFile', key: 'handlerFile', ellipsis: true },
        { title: '行号', dataIndex: 'handlerLine', key: 'handlerLine', width: 80 },
        { title: '类型', dataIndex: 'handlerKind', key: 'handlerKind', width: 100 },
      ],
    };
  },
  computed: {
    filteredRoutes() {
      if (!this.routeManifest?.entries) return [];
      return this.routeManifest.entries;
    },
  },
  watch: {
    '$store.state.project.currentProject': {
      handler() {
        this.loadData();
      },
      immediate: true,
    },
  },
  methods: {
    methodColor(method) {
      return METHOD_COLORS[method] || 'default';
    },
    async loadData() {
      const projectPath = this.$store.state.project.currentProject;
      if (!projectPath) return;

      this.loading = true;
      try {
        const [manifest, frameworks] = await Promise.all([
          routesApi.getRoutes(projectPath),
          routesApi.getFrameworks(projectPath),
        ]);
        this.routeManifest = manifest;
        this.frameworks = frameworks || [];
      } catch (err) {
        this.$message.error('加载路由数据失败: ' + err.message);
      } finally {
        this.loading = false;
      }
    },
    onFilterChange() {
      // Client-side filtering can be added here
    },
    navigateToNode(record) {
      // Navigate to graph view with the handler node
      this.$router.push({ name: 'graph', query: { nodeId: record.handler } });
    },
  },
};
</script>
