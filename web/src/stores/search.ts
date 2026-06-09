import { defineStore } from 'pinia'
import searchApi from '@/api/search'
import { useProjectStore } from './project'

export const useSearchStore = defineStore('search', {
  state: () => ({
    query: '',
    kindFilter: null as string | null,
    results: [] as any[],
    selectedNode: null as any,
    nodeContext: null as any,
    callChain: { callers: [] as any[], callees: [] as any[] },
    impactData: null as any,
    loading: false,
    error: null as string | null,
  }),
  actions: {
    async search(query?: string) {
      const projectStore = useProjectStore()
      const projectId = projectStore.currentProject
      if (!projectId) return

      const q = query ?? this.query
      if (!q) return

      this.loading = true
      this.error = null
      try {
        this.results = await searchApi.search(projectId, q, this.kindFilter || undefined)
      } catch (err: any) {
        this.error = err.message
      } finally {
        this.loading = false
      }
    },
    async selectNode(nodeId: string) {
      const projectStore = useProjectStore()
      const projectId = projectStore.currentProject
      if (!projectId) return

      try {
        this.selectedNode = await searchApi.getNode(projectId, nodeId)
      } catch (err: any) {
        this.error = err.message
      }
    },
    async loadCallChain(nodeId: string) {
      const projectStore = useProjectStore()
      const projectId = projectStore.currentProject
      if (!projectId) return

      try {
        const [callers, callees] = await Promise.all([
          searchApi.getCallers(projectId, nodeId),
          searchApi.getCallees(projectId, nodeId),
        ])
        this.callChain = { callers, callees }
      } catch (err: any) {
        this.error = err.message
      }
    },
    async loadImpact({ nodeId, depth }: { nodeId: string; depth?: number }) {
      const projectStore = useProjectStore()
      const projectId = projectStore.currentProject
      if (!projectId) return

      try {
        this.impactData = await searchApi.getImpact(projectId, nodeId, depth)
      } catch (err: any) {
        this.error = err.message
      }
    },
  },
})
