import { Module } from 'vuex';
import qualityApi from '@/api/quality';

interface QualityState {
  circularDeps: string[][];
  deadCode: any[];
  fileDeps: string[];
  fileDependents: string[];
  nodeMetrics: any | null;
  loading: boolean;
  error: string | null;
}

const quality: Module<QualityState, any> = {
  namespaced: true,
  state: {
    circularDeps: [],
    deadCode: [],
    fileDeps: [],
    fileDependents: [],
    nodeMetrics: null,
    loading: false,
    error: null,
  },
  mutations: {
    SET_CIRCULAR_DEPS(state, deps: string[][]) {
      state.circularDeps = deps;
    },
    SET_DEAD_CODE(state, deadCode: any[]) {
      state.deadCode = deadCode;
    },
    SET_FILE_DEPS(state, deps: string[]) {
      state.fileDeps = deps;
    },
    SET_FILE_DEPENDENTS(state, dependents: string[]) {
      state.fileDependents = dependents;
    },
    SET_NODE_METRICS(state, metrics: any | null) {
      state.nodeMetrics = metrics;
    },
    SET_LOADING(state, loading: boolean) {
      state.loading = loading;
    },
    SET_ERROR(state, error: string | null) {
      state.error = error;
    },
  },
  actions: {
    async fetchCircularDeps({ commit, rootState }) {
      const projectPath = rootState.project.currentProject;
      if (!projectPath) return;
      commit('SET_LOADING', true);
      try {
        const deps = await qualityApi.getCircularDeps(projectPath);
        commit('SET_CIRCULAR_DEPS', deps);
      } catch (err: any) {
        commit('SET_ERROR', err.message);
      } finally {
        commit('SET_LOADING', false);
      }
    },
    async fetchDeadCode({ commit, rootState }, kinds?: string[]) {
      const projectPath = rootState.project.currentProject;
      if (!projectPath) return;
      commit('SET_LOADING', true);
      try {
        const deadCode = await qualityApi.getDeadCode(projectPath, kinds);
        commit('SET_DEAD_CODE', deadCode);
      } catch (err: any) {
        commit('SET_ERROR', err.message);
      } finally {
        commit('SET_LOADING', false);
      }
    },
    async fetchFileDeps({ commit, rootState }, filePath: string) {
      const projectPath = rootState.project.currentProject;
      if (!projectPath) return;
      try {
        const deps = await qualityApi.getFileDeps(projectPath, filePath);
        commit('SET_FILE_DEPS', deps);
      } catch (err: any) {
        commit('SET_ERROR', err.message);
      }
    },
    async fetchNodeMetrics({ commit, rootState }, nodeId: string) {
      const projectPath = rootState.project.currentProject;
      if (!projectPath) return;
      try {
        const metrics = await qualityApi.getNodeMetrics(projectPath, nodeId);
        commit('SET_NODE_METRICS', metrics);
      } catch (err: any) {
        commit('SET_ERROR', err.message);
      }
    },
  },
};

export default quality;
