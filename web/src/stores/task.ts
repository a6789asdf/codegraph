import { defineStore } from 'pinia'
import taskApi, { type Task } from '@/api/task'
import { useProjectStore } from './project'

export const useTaskStore = defineStore('task', {
  state: () => ({
    tasks: [] as Task[],
    pollingTimer: null as ReturnType<typeof setInterval> | null,
    prevActiveIds: new Set<string>(),
  }),

  getters: {
    activeTasks: (state) => state.tasks.filter(t => t.status === 'pending' || t.status === 'running'),
    failedTasks: (state) => state.tasks.filter(t => t.status === 'failed'),
  },

  actions: {
    async fetchTasks() {
      try {
        const [active, failed] = await Promise.all([
          taskApi.list({ status: 'active' }),
          taskApi.list({ status: 'failed' }),
        ])
        const activeArr = Array.isArray(active) ? active : []
        const failedArr = Array.isArray(failed) ? failed : []
        this.tasks = [...activeArr, ...failedArr]

        const currentActiveIds = new Set(this.activeTasks.map(t => t.id))
        for (const id of this.prevActiveIds) {
          if (!currentActiveIds.has(id)) {
            const completed = this.tasks.find(t => t.id === id && t.status === 'completed')
            if (completed) {
              const projectStore = useProjectStore()
              projectStore.fetchProjects()
            }
          }
        }
        this.prevActiveIds = currentActiveIds
      } catch {
        // ignore polling errors
      }
    },

    startPolling() {
      if (this.pollingTimer) return
      this.fetchTasks()
      const interval = this.activeTasks.length > 0 ? 3000 : 10000
      this.pollingTimer = setInterval(() => this.fetchTasks(), interval)
    },

    stopPolling() {
      if (this.pollingTimer) {
        clearInterval(this.pollingTimer)
        this.pollingTimer = null
      }
    },

    async createCloneTask(payload: { name: string; url: string; branch?: string; targetPath?: string; systemId?: string }) {
      const result = await taskApi.createClone(payload)
      await this.fetchTasks()
      this.adjustPollingInterval()
      return result
    },

    async createUploadTask(formData: FormData) {
      const result = await taskApi.createUpload(formData)
      await this.fetchTasks()
      this.adjustPollingInterval()
      return result
    },

    async retryTask(taskId: string) {
      await taskApi.retry(taskId)
      await this.fetchTasks()
      this.adjustPollingInterval()
    },

    async removeTask(taskId: string) {
      await taskApi.remove(taskId)
      await this.fetchTasks()
    },

    adjustPollingInterval() {
      if (!this.pollingTimer) return
      this.stopPolling()
      const interval = this.activeTasks.length > 0 ? 3000 : 10000
      this.pollingTimer = setInterval(() => this.fetchTasks(), interval)
    },
  },
})
