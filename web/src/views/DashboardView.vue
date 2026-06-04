<template>
  <div class="dashboard">
    <a-row :gutter="16" style="margin-bottom: 24px">
      <a-col :span="6">
        <a-card>
          <a-statistic title="节点数" :value="stats.nodeCount || 0" :value-style="{ color: '#1890ff' }">
            <template #prefix><a-icon type="node-index" /></template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card>
          <a-statistic title="边数" :value="stats.edgeCount || 0" :value-style="{ color: '#52c41a' }">
            <template #prefix><a-icon type="swap" /></template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card>
          <a-statistic title="文件数" :value="stats.fileCount || 0" :value-style="{ color: '#722ed1' }">
            <template #prefix><a-icon type="file-text" /></template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card>
          <a-statistic title="数据库大小" :value="dbSizeMB" suffix="MB" :value-style="{ color: '#fa8c16' }">
            <template #prefix><a-icon type="database" /></template>
          </a-statistic>
        </a-card>
      </a-col>
    </a-row>

    <a-row :gutter="16" style="margin-bottom: 24px">
      <a-col :span="12">
        <a-card title="索引状态" :bordered="false">
          <div v-if="status">
            <a-descriptions :column="1" size="small">
              <a-descriptions-item label="状态">
                <a-badge :status="statusBadge" :text="statusText" />
              </a-descriptions-item>
              <a-descriptions-item label="后端">
                <a-tag>{{ status.backend || 'N/A' }}</a-tag>
              </a-descriptions-item>
              <a-descriptions-item label="日志模式">
                <a-tag :color="status.journalMode === 'wal' ? 'green' : 'orange'">
                  {{ status.journalMode || 'N/A' }}
                </a-tag>
              </a-descriptions-item>
              <a-descriptions-item label="最后索引">
                {{ lastIndexedAt }}
              </a-descriptions-item>
              <a-descriptions-item label="文件监控">
                <a-tag :color="status.isWatching ? 'green' : 'default'">
                  {{ status.isWatching ? '运行中' : '未启动' }}
                </a-tag>
              </a-descriptions-item>
              <a-descriptions-item label="待同步文件">
                <a-badge :count="pendingCount" :overflow-count="99" />
              </a-descriptions-item>
            </a-descriptions>
          </div>
          <a-empty v-else description="请先选择项目" />
        </a-card>
      </a-col>
      <a-col :span="12">
        <a-card title="检测到的框架" :bordered="false">
          <div v-if="status && status.frameworks && status.frameworks.length">
            <a-tag v-for="fw in status.frameworks" :key="fw" color="blue" style="margin-bottom: 8px">
              {{ fw }}
            </a-tag>
          </div>
          <a-empty v-else description="未检测到框架" />
        </a-card>
        <a-card title="快捷操作" :bordered="false" style="margin-top: 16px">
          <a-space>
            <a-button type="primary" icon="sync" :loading="indexing" @click="triggerIndex">
              全量索引
            </a-button>
            <a-button icon="cloud-upload" :loading="syncing" @click="triggerSync">
              增量同步
            </a-button>
          </a-space>
        </a-card>
      </a-col>
    </a-row>

    <a-card title="语言分布" v-if="stats && stats.nodesByKind">
      <a-row>
        <a-col :span="12">
          <div v-for="(count, kind) in stats.nodesByKind" :key="kind" style="margin-bottom: 8px">
            <span style="display: inline-block; width: 100px">{{ kind }}</span>
            <a-progress :percent="kindPercent(count)" :stroke-color="kindColor(kind)" style="display: inline-block; width: 300px" />
            <span style="margin-left: 8px; color: #666">{{ count }}</span>
          </div>
        </a-col>
      </a-row>
    </a-card>
  </div>
</template>

<script>
import { mapState } from 'vuex';

const KIND_COLORS = {
  class: '#1890ff',
  function: '#52c41a',
  method: '#faad14',
  variable: '#722ed1',
  interface: '#13c2c2',
  route: '#fa8c16',
  component: '#eb2f96',
  module: '#2f54eb',
};

export default {
  name: 'DashboardView',
  data() {
    return {
      indexing: false,
      syncing: false,
    };
  },
  computed: {
    ...mapState('project', ['stats', 'status']),
    dbSizeMB() {
      if (!this.stats?.dbSizeBytes) return 0;
      return (this.stats.dbSizeBytes / (1024 * 1024)).toFixed(2);
    },
    statusBadge() {
      if (!this.status) return 'default';
      if (this.status.isIndexing) return 'processing';
      if (this.pendingCount > 0) return 'warning';
      return 'success';
    },
    statusText() {
      if (!this.status) return '未连接';
      if (this.status.isIndexing) return '索引中...';
      if (this.pendingCount > 0) return '有待同步文件';
      return '正常';
    },
    lastIndexedAt() {
      if (!this.status?.lastIndexedAt) return 'N/A';
      return new Date(this.status.lastIndexedAt).toLocaleString('zh-CN');
    },
    pendingCount() {
      return this.status?.pendingFiles?.length || 0;
    },
  },
  methods: {
    kindPercent(count) {
      if (!this.stats?.nodeCount) return 0;
      return Math.round((count / this.stats.nodeCount) * 100);
    },
    kindColor(kind) {
      return KIND_COLORS[kind] || '#8c8c8c';
    },
    async triggerIndex() {
      this.indexing = true;
      try {
        await this.$store.dispatch('project/triggerIndex');
        this.$message.success('索引已启动');
      } catch (err) {
        this.$message.error('索引启动失败: ' + err.message);
      } finally {
        this.indexing = false;
      }
    },
    async triggerSync() {
      this.syncing = true;
      try {
        await this.$store.dispatch('project/triggerSync');
        this.$message.success('同步已启动');
      } catch (err) {
        this.$message.error('同步启动失败: ' + err.message);
      } finally {
        this.syncing = false;
      }
    },
  },
};
</script>
