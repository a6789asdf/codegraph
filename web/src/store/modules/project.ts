import { Module } from 'vuex';
import projectApi from '@/api/project';

interface ProjectState {
  projects: Array<{ path: string; name: string; initialized: boolean }>;
  currentProject: string | null;
  stats: any | null;
  status: any | null;
  loading: boolean;
  error: string | null;
}

const project: Module<ProjectState, any> = {
  namespaced: true,
  state: {
    projects: [],
    currentProject: null,
    stats: null,
    status: null,
    loading: false,
    error: null,
  },
  mutations: {
    SET_PROJECTS(state, projects) {
      state.projects = projects;
    },
    SET_CURRENT_PROJECT(state, path) {
      state.currentProject = path;
    },
    SET_STATS(state, stats) {
      state.stats = stats;
    },
    SET_STATUS(state, status) {
      state.status = status;
    },
    SET_LOADING(state, loading) {
      state.loading = loading;
    },
    SET_ERROR(state, error) {
      state.error = error;
    },
    CLEAR_PROJECT_DATA(state) {
      state.stats = null;
      state.status = null;
    },
  },
  actions: {
    async fetchProjects({ commit }) {
      commit('SET_LOADING', true);
      try {
        const res = await projectApi.listProjects();
        commit('SET_PROJECTS', Array.isArray(res) ? res : (res.data || []));
      } catch (err: any) {
        commit('SET_ERROR', err.message);
      } finally {
        commit('SET_LOADING', false);
      }
    },
    async selectProject({ commit, dispatch }, projectPath: string) {
      commit('SET_CURRENT_PROJECT', projectPath);
      commit('CLEAR_PROJECT_DATA');
      await Promise.all([
        dispatch('fetchStats', projectPath),
        dispatch('fetchStatus', projectPath),
      ]);
    },
    async fetchStats({ commit }, projectPath: string) {
      try {
        const res = await projectApi.getStats(projectPath);
        commit('SET_STATS', res);
      } catch (err: any) {
        commit('SET_ERROR', err.message);
      }
    },
    async fetchStatus({ commit }, projectPath: string) {
      try {
        const res = await projectApi.getStatus(projectPath);
        commit('SET_STATUS', res);
      } catch (err: any) {
        commit('SET_ERROR', err.message);
      }
    },
    async triggerIndex({ commit, state }) {
      if (!state.currentProject) return;
      try {
        await projectApi.triggerIndex(state.currentProject);
      } catch (err: any) {
        commit('SET_ERROR', err.message);
      }
    },
    async triggerSync({ commit, state }) {
      if (!state.currentProject) return;
      try {
        await projectApi.triggerSync(state.currentProject);
      } catch (err: any) {
        commit('SET_ERROR', err.message);
      }
    },
  },
};

export default project;
