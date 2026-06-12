import { defineStore } from 'pinia'
import projectApi from '@/api/project'

const STORAGE_KEY = 'codegraph-current-system-id'

interface System {
  id: string
  name: string
  createdAt: string
  projectCount: number
}

export const useProjectStore = defineStore('project', {
  state: () => ({
    projects: [] as Array<{ id: string | null; path: string; name: string; initialized: boolean; systemId?: string | null }>,
    currentProject: null as string | null,
    currentProjectPath: null as string | null,
    stats: null as any,
    status: null as any,
    loading: false,
    error: null as string | null,
    systems: [] as System[],
    currentSystemId: localStorage.getItem(STORAGE_KEY) || null as string | null,
  }),
  getters: {
    dbSizeMB: (state) => {
      if (!state.stats?.dbSizeBytes) return 0
      return (state.stats.dbSizeBytes / (1024 * 1024)).toFixed(2)
    },
    currentSystemName: (state) => {
      if (!state.currentSystemId) return ''
      const sys = state.systems.find((s) => s.id === state.currentSystemId)
      return sys?.name || ''
    },
    currentProjectName: (state) => {
      if (!state.currentProject) return ''
      const proj = state.projects.find((p) => p.id === state.currentProject)
      return proj?.name || ''
    },
  },
  actions: {
    async fetchSystems() {
      try {
        this.systems = await projectApi.listSystems()
        // If no current system selected, default to the first one
        if (!this.currentSystemId && this.systems.length > 0) {
          this.currentSystemId = this.systems[0].id
          localStorage.setItem(STORAGE_KEY, this.currentSystemId)
        }
      } catch (err: any) {
        this.error = err.message
      }
    },
    async fetchProjects() {
      this.loading = true
      try {
        const res = await projectApi.listProjects(undefined, this.currentSystemId || undefined)
        this.projects = Array.isArray(res) ? res : (res.data || [])
      } catch (err: any) {
        this.error = err.message
      } finally {
        this.loading = false
      }
    },
    selectSystem(systemId: string) {
      this.currentSystemId = systemId
      localStorage.setItem(STORAGE_KEY, systemId)
      this.fetchProjects()
    },
    async createSystem(name: string) {
      const sys = await projectApi.createSystem(name)
      await this.fetchSystems()
      return sys
    },
    async deleteSystem(id: string) {
      await projectApi.deleteSystem(id)
      await this.fetchSystems()
      // If deleted the current system, switch to the first remaining one
      if (this.currentSystemId === id) {
        this.currentSystemId = this.systems[0]?.id || null
        if (this.currentSystemId) {
          localStorage.setItem(STORAGE_KEY, this.currentSystemId)
        } else {
          localStorage.removeItem(STORAGE_KEY)
        }
        this.fetchProjects()
      }
    },
    async selectProject(projectId: string) {
      this.currentProject = projectId
      this.stats = null
      this.status = null
      const proj = this.projects.find(p => p.id === projectId)
      this.currentProjectPath = proj?.path || null
      if (projectId) {
        await Promise.all([
          this.fetchStats(projectId),
          this.fetchStatus(projectId),
        ])
      }
    },
    async fetchStats(projectId?: string) {
      const id = projectId || this.currentProject
      if (!id) return
      try {
        this.stats = await projectApi.getStats(id)
      } catch (err: any) {
        this.error = err.message
      }
    },
    async fetchStatus(projectId?: string) {
      const id = projectId || this.currentProject
      if (!id) return
      try {
        this.status = await projectApi.getStatus(id)
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
