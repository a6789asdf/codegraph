import { Module } from 'vuex';

interface GraphState {
  nodes: Record<string, any>;
  edges: Record<string, any>;
  layout: 'force' | 'dagre';
  selectedNodeId: string | null;
  expandedNodes: string[];
  loading: boolean;
  error: string | null;
}

const graph: Module<GraphState, any> = {
  namespaced: true,
  state: {
    nodes: {},
    edges: {},
    layout: 'force',
    selectedNodeId: null,
    expandedNodes: [],
    loading: false,
    error: null,
  },
  mutations: {
    ADD_NODES(state, nodes: any[]) {
      for (const node of nodes) {
        Vue.set(state.nodes, node.id, node);
      }
    },
    ADD_EDGES(state, edges: any[]) {
      for (const edge of edges) {
        Vue.set(state.edges, edge.id || `${edge.source}-${edge.target}`, edge);
      }
    },
    SET_LAYOUT(state, layout: 'force' | 'dagre') {
      state.layout = layout;
    },
    SET_SELECTED_NODE(state, nodeId: string | null) {
      state.selectedNodeId = nodeId;
    },
    ADD_EXPANDED_NODE(state, nodeId: string) {
      if (!state.expandedNodes.includes(nodeId)) {
        state.expandedNodes.push(nodeId);
      }
    },
    SET_LOADING(state, loading: boolean) {
      state.loading = loading;
    },
    SET_ERROR(state, error: string | null) {
      state.error = error;
    },
    CLEAR_GRAPH(state) {
      state.nodes = {};
      state.edges = {};
      state.selectedNodeId = null;
      state.expandedNodes = [];
    },
  },
  actions: {
    selectNode({ commit }, nodeId: string | null) {
      commit('SET_SELECTED_NODE', nodeId);
    },
    setLayout({ commit }, layout: 'force' | 'dagre') {
      commit('SET_LAYOUT', layout);
    },
    addGraphData({ commit }, { nodes, edges }: { nodes: any[]; edges: any[] }) {
      commit('ADD_NODES', nodes || []);
      commit('ADD_EDGES', edges || []);
    },
    expandNode({ commit }, nodeId: string) {
      commit('ADD_EXPANDED_NODE', nodeId);
    },
    clearGraph({ commit }) {
      commit('CLEAR_GRAPH');
    },
  },
};

// Need Vue for Vue.set in mutations
import Vue from 'vue';

export default graph;
