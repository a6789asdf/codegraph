import { defineStore } from 'pinia'
import qualityApi from '@/api/quality'
import { useProjectStore } from './project'

export const useQualityStore = defineStore('quality', {
  state: () => ({
    circularDeps: [] as string[][],
    deadCode: [] as any[],
    fileDeps: [] as string[],
    fileDependents: [] as string[],
    nodeMetrics: null as any,
    loading: false,
    error: null as string | null,
  }),
  actions: {
    async fetchCircularDeps() {
      const projectStore = useProjectStore()
      const projectId = projectStore.currentProject
      if (!projectId) return
      this.loading = true
      try {
        this.circularDeps = await qualityApi.getCircularDeps(projectId)
      } catch (err: any) {
        this.error = err.message
      } finally {
        this.loading = false
      }
    },
    async fetchDeadCode(kinds?: string[]) {
      const projectStore = useProjectStore()
      const projectId = projectStore.currentProject
      if (!projectId) return
      this.loading = true
      try {
        this.deadCode = await qualityApi.getDeadCode(projectId, kinds)
      } catch (err: any) {
        this.error = err.message
      } finally {
        this.loading = false
      }
    },
    async fetchFileDeps(filePath: string) {
      const projectStore = useProjectStore()
      const projectId = projectStore.currentProject
      if (!projectId) return
      try {
        this.fileDeps = await qualityApi.getFileDeps(projectId, filePath)
      } catch (err: any) {
        this.error = err.message
      }
    },
    async fetchNodeMetrics(nodeId: string) {
      const projectStore = useProjectStore()
      const projectId = projectStore.currentProject
      if (!projectId) return
      try {
        this.nodeMetrics = await qualityApi.getNodeMetrics(projectId, nodeId)
      } catch (err: any) {
        this.error = err.message
      }
    },
  },
})
