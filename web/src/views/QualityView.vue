<template>
  <div class="quality-view">
    <a-tabs default-active-key="circular" @change="onTabChange">
      <a-tab-pane key="circular" tab="循环依赖">
        <a-card :bordered="false">
          <a-button type="primary" @click="fetchCircularDeps" :loading="loading" style="margin-bottom: 16px">
            检测循环依赖
          </a-button>
          <div v-if="circularDeps.length > 0">
            <a-alert
              :message="`检测到 ${circularDeps.length} 个循环依赖`"
              type="warning"
              show-icon
              style="margin-bottom: 16px"
            />
            <a-list :data-source="circularDeps" size="small">
              <a-list-item slot="renderItem" slot-scope="cycle, index">
                <a-list-item-meta>
                  <template #title>循环 #{{ index + 1 }}</template>
                  <template #description>
                    <a-breadcrumb separator="→">
                      <a-breadcrumb-item v-for="(file, i) in cycle" :key="i">
                        {{ file }}
                      </a-breadcrumb-item>
                    </a-breadcrumb>
                  </template>
                </a-list-item-meta>
              </a-list-item>
            </a-list>
          </div>
          <a-empty v-else-if="!loading" description="暂无循环依赖数据" />
        </a-card>
      </a-tab-pane>

      <a-tab-pane key="deadcode" tab="死代码">
        <a-card :bordered="false">
          <a-space style="margin-bottom: 16px">
            <a-select v-model="deadCodeKinds" mode="multiple" style="width: 300px" placeholder="类型过滤">
              <a-select-option value="function">function</a-select-option>
              <a-select-option value="method">method</a-select-option>
              <a-select-option value="class">class</a-select-option>
              <a-select-option value="variable">variable</a-select-option>
              <a-select-option value="constant">constant</a-select-option>
            </a-select>
            <a-button type="primary" @click="fetchDeadCode" :loading="loading">
              检测死代码
            </a-button>
          </a-space>
          <a-table
            :columns="deadCodeColumns"
            :data-source="deadCode"
            :loading="loading"
            :pagination="{ pageSize: 20 }"
            size="small"
            row-key="id"
          >
            <template #kind="text">
              <a-tag :color="kindColor(text)">{{ text }}</a-tag>
            </template>
          </a-table>
          <a-empty v-if="!loading && deadCode.length === 0" description="暂无死代码数据" />
        </a-card>
      </a-tab-pane>

      <a-tab-pane key="deps" tab="文件依赖">
        <a-card :bordered="false">
          <a-input-search
            v-model="filePath"
            placeholder="输入文件路径..."
            enter-button="查询"
            style="max-width: 500px; margin-bottom: 16px"
            @search="fetchFileDeps"
          />
          <a-row :gutter="16">
            <a-col :span="12">
              <a-card title="依赖的文件" size="small">
                <a-list :data-source="fileDeps" size="small">
                  <a-list-item slot="renderItem" slot-scope="dep">
                    <span style="font-size: 12px">{{ dep }}</span>
                  </a-list-item>
                </a-list>
                <a-empty v-if="fileDeps.length === 0" description="无依赖" />
              </a-card>
            </a-col>
            <a-col :span="12">
              <a-card title="被依赖的文件" size="small">
                <a-list :data-source="fileDependents" size="small">
                  <a-list-item slot="renderItem" slot-scope="dep">
                    <span style="font-size: 12px">{{ dep }}</span>
                  </a-list-item>
                </a-list>
                <a-empty v-if="fileDependents.length === 0" description="无被依赖" />
              </a-card>
            </a-col>
          </a-row>
        </a-card>
      </a-tab-pane>

      <a-tab-pane key="metrics" tab="节点度量">
        <a-card :bordered="false">
          <a-input-search
            v-model="metricsNodeId"
            placeholder="输入节点 ID..."
            enter-button="查询"
            style="max-width: 500px; margin-bottom: 16px"
            @search="fetchNodeMetrics"
          />
          <a-descriptions v-if="nodeMetrics" :column="2" bordered size="small">
            <a-descriptions-item label="入边数">{{ nodeMetrics.incomingEdgeCount }}</a-descriptions-item>
            <a-descriptions-item label="出边数">{{ nodeMetrics.outgoingEdgeCount }}</a-descriptions-item>
            <a-descriptions-item label="调用数">{{ nodeMetrics.callCount }}</a-descriptions-item>
            <a-descriptions-item label="调用者数">{{ nodeMetrics.callerCount }}</a-descriptions-item>
            <a-descriptions-item label="子节点数">{{ nodeMetrics.childCount }}</a-descriptions-item>
            <a-descriptions-item label="深度">{{ nodeMetrics.depth }}</a-descriptions-item>
          </a-descriptions>
          <a-empty v-else description="输入节点 ID 查看度量" />
        </a-card>
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<script>
import { mapState } from 'vuex';

const KIND_COLORS = {
  class: 'blue',
  function: 'green',
  method: 'orange',
  variable: 'purple',
  interface: 'cyan',
  constant: 'geekblue',
};

export default {
  name: 'QualityView',
  data() {
    return {
      deadCodeKinds: ['function', 'method'],
      filePath: '',
      metricsNodeId: '',
      loading: false,
      deadCodeColumns: [
        { title: '名称', dataIndex: 'name', key: 'name', ellipsis: true },
        { title: '类型', dataIndex: 'kind', key: 'kind', width: 100, scopedSlots: { customRender: 'kind' } },
        { title: '文件', dataIndex: 'file', key: 'file', ellipsis: true },
        { title: '行号', dataIndex: 'startLine', key: 'startLine', width: 80 },
      ],
    };
  },
  computed: {
    ...mapState('quality', ['circularDeps', 'deadCode', 'fileDeps', 'fileDependents', 'nodeMetrics']),
  },
  methods: {
    kindColor(kind) {
      return KIND_COLORS[kind] || 'default';
    },
    onTabChange() {},
    async fetchCircularDeps() {
      this.loading = true;
      try {
        await this.$store.dispatch('quality/fetchCircularDeps');
      } finally {
        this.loading = false;
      }
    },
    async fetchDeadCode() {
      this.loading = true;
      try {
        await this.$store.dispatch('quality/fetchDeadCode', this.deadCodeKinds.length > 0 ? this.deadCodeKinds : undefined);
      } finally {
        this.loading = false;
      }
    },
    async fetchFileDeps() {
      if (!this.filePath) return;
      this.loading = true;
      try {
        await this.$store.dispatch('quality/fetchFileDeps', this.filePath);
      } finally {
        this.loading = false;
      }
    },
    async fetchNodeMetrics() {
      if (!this.metricsNodeId) return;
      this.loading = true;
      try {
        await this.$store.dispatch('quality/fetchNodeMetrics', this.metricsNodeId);
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>
