<template>
  <div class="graph-view">
    <a-card :bordered="false" style="margin-bottom: 16px">
      <a-space>
        <a-input-search
          v-model="searchQuery"
          placeholder="搜索符号定位节点..."
          style="width: 300px"
          @search="onSearchNode"
        />
        <a-radio-group v-model="layout" button-style="solid" @change="onLayoutChange">
          <a-radio-button value="force">力导向图</a-radio-button>
          <a-radio-button value="dagre">分层布局</a-radio-button>
        </a-radio-group>
        <a-button-group>
          <a-button icon="zoom-in" @click="zoomIn" />
          <a-button icon="zoom-out" @click="zoomOut" />
          <a-button icon="fullscreen" @click="resetView" />
        </a-button-group>
        <a-button icon="delete" @click="clearGraph">清空</a-button>
      </a-space>
    </a-card>

    <a-row :gutter="16">
      <a-col :span="selectedNodeId ? 16 : 24">
        <a-card :bordered="false" :body-style="{ padding: 0 }">
          <div ref="graphContainer" class="graph-canvas" style="height: 600px; background: #fafafa; position: relative">
            <a-empty v-if="!hasNodes" style="padding-top: 200px" description="搜索符号并展开节点以构建图谱" />
          </div>
        </a-card>
      </a-col>
      <a-col :span="8" v-if="selectedNodeId">
        <a-card title="节点详情" :bordered="false">
          <a-descriptions :column="1" size="small" v-if="selectedNodeData">
            <a-descriptions-item label="名称">{{ selectedNodeData.name }}</a-descriptions-item>
            <a-descriptions-item label="类型">
              <a-tag :color="kindColor(selectedNodeData.kind)">{{ selectedNodeData.kind }}</a-tag>
            </a-descriptions-item>
            <a-descriptions-item label="文件">{{ selectedNodeData.file }}</a-descriptions-item>
            <a-descriptions-item label="行号">{{ selectedNodeData.startLine }}</a-descriptions-item>
          </a-descriptions>
          <a-divider />
          <a-space direction="vertical" style="width: 100%">
            <a-button size="small" type="primary" block @click="expandNode('callers')">
              展开调用者
            </a-button>
            <a-button size="small" block @click="expandNode('callees')">
              展开被调用者
            </a-button>
            <a-button size="small" block @click="expandNode('impact')">
              展开影响范围
            </a-button>
          </a-space>
          <a-divider />
          <div v-if="nodeCode">
            <h4>源码</h4>
            <code-viewer :code="nodeCode" />
          </div>
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<script>
import { mapState } from 'vuex';
import * as d3 from 'd3';
import CodeViewer from '@/components/CodeViewer.vue';
import searchApi from '@/api/search';

const KIND_COLORS = {
  class: '#1890ff',
  function: '#52c41a',
  method: '#faad14',
  variable: '#722ed1',
  interface: '#13c2c2',
  route: '#fa8c16',
  component: '#eb2f96',
  module: '#2f54eb',
  file: '#8c8c8c',
};

export default {
  name: 'GraphView',
  components: { CodeViewer },
  data() {
    return {
      searchQuery: '',
      nodeCode: '',
      svg: null,
      simulation: null,
      transform: d3.zoomIdentity,
    };
  },
  computed: {
    ...mapState('graph', ['nodes', 'edges', 'layout', 'selectedNodeId']),
    hasNodes() {
      return Object.keys(this.nodes).length > 0;
    },
    selectedNodeData() {
      return this.selectedNodeId ? this.nodes[this.selectedNodeId] : null;
    },
  },
  watch: {
    nodes: {
      handler() {
        this.renderGraph();
      },
      deep: true,
    },
    layout() {
      this.renderGraph();
    },
  },
  methods: {
    kindColor(kind) {
      return KIND_COLORS[kind] || '#8c8c8c';
    },
    onLayoutChange() {
      this.$store.dispatch('graph/setLayout', this.layout);
    },
    async onSearchNode(query) {
      const projectPath = this.$store.state.project.currentProject;
      if (!projectPath || !query) return;

      try {
        const results = await searchApi.search(projectPath, query);
        if (results && results.length > 0) {
          const firstResult = results[0];
          const node = firstResult.node;
          this.$store.dispatch('graph/addGraphData', { nodes: [node], edges: [] });
          this.$store.dispatch('graph/selectNode', node.id);

          // Auto-expand callers and callees
          const [callers, callees] = await Promise.all([
            searchApi.getCallers(projectPath, node.id),
            searchApi.getCallees(projectPath, node.id),
          ]);

          const newNodes = [];
          const newEdges = [];
          for (const c of callers) {
            newNodes.push(c.node);
            newEdges.push({ source: c.node.id, target: node.id, kind: c.edge.kind });
          }
          for (const c of callees) {
            newNodes.push(c.node);
            newEdges.push({ source: node.id, target: c.node.id, kind: c.edge.kind });
          }
          this.$store.dispatch('graph/addGraphData', { nodes: newNodes, edges: newEdges });
        }
      } catch (err) {
        this.$message.error('搜索失败: ' + err.message);
      }
    },
    async expandNode(type) {
      const projectPath = this.$store.state.project.currentProject;
      const nodeId = this.selectedNodeId;
      if (!projectPath || !nodeId) return;

      try {
        let data;
        if (type === 'callers') {
          data = await searchApi.getCallers(projectPath, nodeId);
        } else if (type === 'callees') {
          data = await searchApi.getCallees(projectPath, nodeId);
        } else if (type === 'impact') {
          data = await searchApi.getImpact(projectPath, nodeId);
        }

        if (data) {
          const newNodes = [];
          const newEdges = [];
          if (Array.isArray(data)) {
            for (const item of data) {
              newNodes.push(item.node);
              const src = type === 'callers' ? item.node.id : nodeId;
              const tgt = type === 'callers' ? nodeId : item.node.id;
              newEdges.push({ source: src, target: tgt, kind: item.edge.kind });
            }
          } else if (data.nodes && data.edges) {
            newNodes.push(...data.nodes);
            newEdges.push(...data.edges);
          }
          this.$store.dispatch('graph/addGraphData', { nodes: newNodes, edges: newEdges });
          this.$store.dispatch('graph/expandNode', nodeId);
        }
      } catch (err) {
        this.$message.error('展开失败: ' + err.message);
      }
    },
    clearGraph() {
      this.$store.dispatch('graph/clearGraph');
    },
    zoomIn() {
      if (this.svg) {
        this.svg.transition().call(d3.zoom().scaleBy, 1.3);
      }
    },
    zoomOut() {
      if (this.svg) {
        this.svg.transition().call(d3.zoom().scaleBy, 0.7);
      }
    },
    resetView() {
      if (this.svg) {
        this.svg.transition().call(d3.zoom().transform, d3.zoomIdentity);
      }
    },
    renderGraph() {
      const container = this.$refs.graphContainer;
      if (!container || !this.hasNodes) return;

      // Clear previous SVG
      d3.select(container).select('svg').remove();

      const width = container.clientWidth;
      const height = container.clientHeight;

      const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height);

      this.svg = svg;

      const g = svg.append('g');

      // Zoom
      const zoom = d3.zoom()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => {
          g.attr('transform', event.transform);
        });
      svg.call(zoom);

      const nodeList = Object.values(this.nodes);
      const edgeList = Object.values(this.edges);

      // Draw edges
      const link = g.append('g')
        .selectAll('line')
        .data(edgeList)
        .join('line')
        .attr('stroke', '#999')
        .attr('stroke-opacity', 0.6)
        .attr('stroke-width', 1);

      // Draw nodes
      const node = g.append('g')
        .selectAll('circle')
        .data(nodeList)
        .join('circle')
        .attr('r', 8)
        .attr('fill', (d) => this.kindColor(d.kind))
        .attr('stroke', (d) => d.id === this.selectedNodeId ? '#ff4d4f' : '#fff')
        .attr('stroke-width', (d) => d.id === this.selectedNodeId ? 3 : 1.5)
        .style('cursor', 'pointer')
        .on('click', (event, d) => {
          this.$store.dispatch('graph/selectNode', d.id);
          this.loadNodeCode(d.id);
        })
        .call(d3.drag()
          .on('start', (event, d) => {
            if (!event.active) this.simulation?.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) this.simulation?.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
        );

      // Labels
      const label = g.append('g')
        .selectAll('text')
        .data(nodeList)
        .join('text')
        .text((d) => d.name)
        .attr('font-size', 10)
        .attr('dx', 12)
        .attr('dy', 4);

      // Force simulation
      if (this.layout === 'force') {
        this.simulation = d3.forceSimulation(nodeList)
          .force('link', d3.forceLink(edgeList).id((d) => d.id).distance(80))
          .force('charge', d3.forceManyBody().strength(-200))
          .force('center', d3.forceCenter(width / 2, height / 2))
          .on('tick', () => {
            link
              .attr('x1', (d) => d.source.x)
              .attr('y1', (d) => d.source.y)
              .attr('x2', (d) => d.target.x)
              .attr('y2', (d) => d.target.y);
            node
              .attr('cx', (d) => d.x)
              .attr('cy', (d) => d.y);
            label
              .attr('x', (d) => d.x)
              .attr('y', (d) => d.y);
          });
      } else {
        // Simple dagre-like layout using d3 hierarchy
        // For simplicity, use a top-down tree layout
        const root = nodeList[0];
        if (root) {
          root.x = width / 2;
          root.y = 50;
        }
        // Position other nodes in rows
        const remaining = nodeList.slice(1);
        const cols = Math.ceil(Math.sqrt(remaining.length));
        remaining.forEach((n, i) => {
          n.x = (i % cols) * (width / (cols + 1)) + width / (cols + 1);
          n.y = Math.floor(i / cols) * 80 + 120;
        });

        link
          .attr('x1', (d) => (d.source.x || 0))
          .attr('y1', (d) => (d.source.y || 0))
          .attr('x2', (d) => (d.target.x || 0))
          .attr('y2', (d) => (d.target.y || 0));
        node
          .attr('cx', (d) => d.x || 0)
          .attr('cy', (d) => d.y || 0);
        label
          .attr('x', (d) => d.x || 0)
          .attr('y', (d) => d.y || 0);
      }
    },
    async loadNodeCode(nodeId) {
      const projectPath = this.$store.state.project.currentProject;
      if (!projectPath) return;
      try {
        const data = await searchApi.getNode(projectPath, nodeId, true);
        this.nodeCode = data?.code || '';
      } catch {
        this.nodeCode = '';
      }
    },
  },
};
</script>

<style scoped>
.graph-canvas {
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  overflow: hidden;
}
</style>
