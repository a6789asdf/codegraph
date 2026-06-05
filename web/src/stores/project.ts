import { defineStore } from 'pinia'
import projectApi from '@/api/project'

export const useProjectStore = defineStore('project', {
  state: () => ({
    projects: [] as Array<{ path: string; name: string; initialized: boolean }>,
    currentProject: null as string | null,
    stats: null as any,
    status: null as any,
    loading: false,
    error: null as string | null,
  }),
  getters: {
    dbSizeMB: (state) => {
      if (!state.stats?.dbSizeBytes) return 0
      return (state.stats.dbSizeBytes / (1024 * 1024)).toFixed(2)
    },
  },
  actions: {
    async fetchProjects() {
      this.loading = true
      try {
        const res = await projectApi.listProjects()
        this.projects = Array.isArray(res) ? res : (res.data || [])
      } catch (err: any) {
        this.error = err.message
      } finally {
        this.loading = false
      }
    },
    async selectProject(projectPath: string) {
      this.currentProject = projectPath
      this.stats = null
      this.status = null
      await Promise.all([
        this.fetchStats(projectPath),
        this.fetchStatus(projectPath),
      ])
    },
    async fetchStats(projectPath?: string) {
      const path = projectPath || this.currentProject
      if (!path) return
      try {
        this.stats = await projectApi.getStats(path)
      } catch (err: any) {
        this.error = err.message
      }
    },
    async fetchStatus(projectPath?: string) {
      const path = projectPath || this.currentProject
      if (!path) return
      try {
        this.status = await projectApi.getStatus(path)
      } catch (err: any) {
        this.error = err.message
      }
    },
    async triggerIndex() {
      if (!this.currentProject) return
      try {
        await projectApi.triggerIndex(this.currentProject)
      } catch (err: any) {
        this.error = err.message
      }
    },
    async triggerSync() {
      if (!this.currentProject) return
      try {
        await projectApi.triggerSync(this.currentProject)
      } catch (err: any) {
        this.error = err.message
      }
    },
  },
})
