import { defineStore } from 'pinia'

export const useGraphStore = defineStore('graph', {
  state: () => ({
    nodes: {} as Record<string, any>,
    edges: {} as Record<string, any>,
    layout: 'force' as 'force' | 'dagre',
    selectedNodeId: null as string | null,
    expandedNodes: [] as string[],
    loading: false,
    error: null as string | null,
  }),
  getters: {
    nodeList: (state) => Object.values(state.nodes),
    edgeList: (state) => Object.values(state.edges),
    hasNodes: (state) => Object.keys(state.nodes).length > 0,
    selectedNodeData: (state) => state.selectedNodeId ? state.nodes[state.selectedNodeId] : null,
  },
  actions: {
    selectNode(nodeId: string | null) {
      this.selectedNodeId = nodeId
    },
    setLayout(layout: 'force' | 'dagre') {
      this.layout = layout
    },
    addGraphData({ nodes, edges }: { nodes: any[]; edges: any[] }) {
      for (const node of (nodes || [])) {
        this.nodes[node.id] = node
      }
      for (const edge of (edges || [])) {
        this.edges[edge.id || `${edge.source}-${edge.target}`] = edge
      }
    },
    expandNode(nodeId: string) {
      if (!this.expandedNodes.includes(nodeId)) {
        this.expandedNodes.push(nodeId)
      }
    },
    clearGraph() {
      this.nodes = {}
      this.edges = {}
      this.selectedNodeId = null
      this.expandedNodes = []
    },
  },
})
