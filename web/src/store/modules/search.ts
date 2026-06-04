import { Module } from 'vuex';
import searchApi from '@/api/search';

interface SearchState {
  query: string;
  kindFilter: string | null;
  results: any[];
  selectedNode: any | null;
  nodeContext: any | null;
  callChain: { callers: any[]; callees: any[] };
  impactData: any | null;
  loading: boolean;
  error: string | null;
}

const search: Module<SearchState, any> = {
  namespaced: true,
  state: {
    query: '',
    kindFilter: null,
    results: [],
    selectedNode: null,
    nodeContext: null,
    callChain: { callers: [], callees: [] },
    impactData: null,
    loading: false,
    error: null,
  },
  mutations: {
    SET_QUERY(state, query: string) {
      state.query = query;
    },
    SET_KIND_FILTER(state, kind: string | null) {
      state.kindFilter = kind;
    },
    SET_RESULTS(state, results: any[]) {
      state.results = results;
    },
    SET_SELECTED_NODE(state, node: any | null) {
      state.selectedNode = node;
    },
    SET_NODE_CONTEXT(state, context: any | null) {
      state.nodeContext = context;
    },
    SET_CALL_CHAIN(state, { callers, callees }: { callers: any[]; callees: any[] }) {
      state.callChain = { callers, callees };
    },
    SET_IMPACT_DATA(state, data: any | null) {
      state.impactData = data;
    },
    SET_LOADING(state, loading: boolean) {
      state.loading = loading;
    },
    SET_ERROR(state, error: string | null) {
      state.error = error;
    },
  },
  actions: {
    async search({ commit, state, rootState }, query?: string) {
      const projectPath = rootState.project.currentProject;
      if (!projectPath) return;

      const q = query ?? state.query;
      if (!q) return;

      commit('SET_LOADING', true);
      commit('SET_ERROR', null);
      try {
        const results = await searchApi.search(projectPath, q, state.kindFilter || undefined);
        commit('SET_RESULTS', results);
      } catch (err: any) {
        commit('SET_ERROR', err.message);
      } finally {
        commit('SET_LOADING', false);
      }
    },
    async selectNode({ commit, rootState }, nodeId: string) {
      const projectPath = rootState.project.currentProject;
      if (!projectPath) return;

      try {
        const nodeData = await searchApi.getNode(projectPath, nodeId);
        commit('SET_SELECTED_NODE', nodeData);
      } catch (err: any) {
        commit('SET_ERROR', err.message);
      }
    },
    async loadCallChain({ commit, rootState }, nodeId: string) {
      const projectPath = rootState.project.currentProject;
      if (!projectPath) return;

      try {
        const [callers, callees] = await Promise.all([
          searchApi.getCallers(projectPath, nodeId),
          searchApi.getCallees(projectPath, nodeId),
        ]);
        commit('SET_CALL_CHAIN', { callers, callees });
      } catch (err: any) {
        commit('SET_ERROR', err.message);
      }
    },
    async loadImpact({ commit, rootState }, { nodeId, depth }: { nodeId: string; depth?: number }) {
      const projectPath = rootState.project.currentProject;
      if (!projectPath) return;

      try {
        const impact = await searchApi.getImpact(projectPath, nodeId, depth);
        commit('SET_IMPACT_DATA', impact);
      } catch (err: any) {
        commit('SET_ERROR', err.message);
      }
    },
  },
};

export default search;
