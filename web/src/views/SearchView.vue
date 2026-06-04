<template>
  <div class="search-view">
    <a-card :bordered="false" style="margin-bottom: 16px">
      <a-input-search
        v-model="query"
        placeholder="搜索符号名称..."
        enter-button="搜索"
        size="large"
        :loading="loading"
        @search="onSearch"
        style="max-width: 600px; margin-right: 16px"
      />
      <a-select v-model="kindFilter" style="width: 150px" placeholder="类型过滤" allow-clear @change="onSearch">
        <a-select-option value="class">class</a-select-option>
        <a-select-option value="function">function</a-select-option>
        <a-select-option value="method">method</a-select-option>
        <a-select-option value="interface">interface</a-select-option>
        <a-select-option value="variable">variable</a-select-option>
        <a-select-option value="route">route</a-select-option>
        <a-select-option value="component">component</a-select-option>
        <a-select-option value="module">module</a-select-option>
      </a-select>
    </a-card>

    <a-row :gutter="16">
      <a-col :span="14">
        <a-card title="搜索结果" :bordered="false">
          <a-list
            :data-source="results"
            :loading="loading"
            size="small"
          >
            <a-list-item slot="renderItem" slot-scope="item">
              <a-list-item-meta>
                <template #title>
                  <a @click="selectResult(item)" style="cursor: pointer">{{ item.node.name }}</a>
                </template>
                <template #description>
                  <a-tag :color="kindColor(item.node.kind)" size="small">{{ item.node.kind }}</a-tag>
                  <span style="color: #999; font-size: 12px">{{ item.node.file }}:{{ item.node.startLine }}</span>
                </template>
              </a-list-item-meta>
            </a-list-item>
          </a-list>
          <div v-if="loading === false && results.length === 0">
            <a-empty :description="query ? '无搜索结果' : '输入关键词开始搜索'" />
          </div>
        </a-card>
      </a-col>

      <a-col :span="10">
        <a-card title="节点详情" :bordered="false">
          <template v-if="selectedNode">
            <a-descriptions :column="1" size="small">
              <a-descriptions-item label="名称">{{ selectedNode.node.name }}</a-descriptions-item>
              <a-descriptions-item label="类型">
                <a-tag :color="kindColor(selectedNode.node.kind)">{{ selectedNode.node.kind }}</a-tag>
              </a-descriptions-item>
              <a-descriptions-item label="文件">{{ selectedNode.node.file }}</a-descriptions-item>
              <a-descriptions-item label="行号">{{ selectedNode.node.startLine }} - {{ selectedNode.node.endLine }}</a-descriptions-item>
            </a-descriptions>

            <a-divider />

            <a-tabs size="small">
              <a-tab-pane key="code" tab="源码">
                <code-viewer :code="selectedNode.code || ''" />
              </a-tab-pane>
              <a-tab-pane key="callers" tab="调用者">
                <a-list :data-source="callChain.callers" size="small">
                  <a-list-item slot="renderItem" slot-scope="item">
                    <a-list-item-meta>
                      <template #title>{{ item.node.name }}</template>
                      <template #description>
                        <a-tag size="small">{{ item.node.kind }}</a-tag>
                        {{ item.edge.kind }}
                      </template>
                    </a-list-item-meta>
                  </a-list-item>
                </a-list>
                <div v-if="callChain.callers.length === 0">
                  <a-empty description="无调用者" />
                </div>
              </a-tab-pane>
              <a-tab-pane key="callees" tab="被调用">
                <a-list :data-source="callChain.callees" size="small">
                  <a-list-item slot="renderItem" slot-scope="item">
                    <a-list-item-meta>
                      <template #title>{{ item.node.name }}</template>
                      <template #description>
                        <a-tag size="small">{{ item.node.kind }}</a-tag>
                        {{ item.edge.kind }}
                      </template>
                    </a-list-item-meta>
                  </a-list-item>
                </a-list>
                <div v-if="callChain.callees.length === 0">
                  <a-empty description="无被调用者" />
                </div>
              </a-tab-pane>
              <a-tab-pane key="impact" tab="影响分析">
                <a-button size="small" type="primary" @click="loadImpact" :loading="impactLoading">
                  分析影响范围
                </a-button>
                <div v-if="impactData" style="margin-top: 12px">
                  <p>受影响节点: {{ impactData.nodes ? impactData.nodes.length : 0 }}</p>
                  <p>受影响边: {{ impactData.edges ? impactData.edges.length : 0 }}</p>
                  <a-list :data-source="impactData.nodes || []" size="small" style="max-height: 300px; overflow: auto">
                    <a-list-item slot="renderItem" slot-scope="node">
                      <a-list-item-meta>
                        <template #title>{{ node.name }}</template>
                        <template #description>
                          <a-tag size="small">{{ node.kind }}</a-tag>
                          {{ node.file }}
                        </template>
                      </a-list-item-meta>
                    </a-list-item>
                  </a-list>
                </div>
              </a-tab-pane>
            </a-tabs>
          </template>
          <template v-else>
            <a-empty description="选择搜索结果查看详情" />
          </template>
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<script>
import { mapState } from 'vuex';
import CodeViewer from '@/components/CodeViewer.vue';

const KIND_COLORS = {
  class: 'blue',
  function: 'green',
  method: 'orange',
  variable: 'purple',
  interface: 'cyan',
  route: 'gold',
  component: 'magenta',
  module: 'geekblue',
};

export default {
  name: 'SearchView',
  components: { CodeViewer },
  data() {
    return {
      query: '',
      kindFilter: undefined,
      impactLoading: false,
    };
  },
  computed: {
    ...mapState('search', ['results', 'selectedNode', 'callChain', 'impactData', 'loading']),
  },
  methods: {
    kindColor(kind) {
      return KIND_COLORS[kind] || 'default';
    },
    onSearch() {
      this.$store.commit('search/SET_QUERY', this.query);
      this.$store.commit('search/SET_KIND_FILTER', this.kindFilter || null);
      this.$store.dispatch('search/search');
    },
    selectResult(item) {
      this.$store.dispatch('search/selectNode', item.node.id);
      this.$store.dispatch('search/loadCallChain', item.node.id);
    },
    async loadImpact() {
      if (this.selectedNode && this.selectedNode.node) {
        this.impactLoading = true;
        try {
          await this.$store.dispatch('search/loadImpact', {
            nodeId: this.selectedNode.node.id,
            depth: 3,
          });
        } finally {
          this.impactLoading = false;
        }
      }
    },
  },
};
</script>
