import { defineStore } from 'pinia'
import credentialApi, { type CredentialMeta, type CreateCredentialPayload } from '@/api/credential'

export const useCredentialStore = defineStore('credential', {
  state: () => ({
    credentials: [] as CredentialMeta[],
    loading: false,
  }),
  getters: {
    httpsCredentials: (s) => s.credentials.filter(c => c.type === 'https'),
    sshCredentials: (s) => s.credentials.filter(c => c.type === 'ssh'),
  },
  actions: {
    async fetchCredentials() {
      this.loading = true
      try {
        const list = await credentialApi.list()
        this.credentials = Array.isArray(list) ? list : []
      } finally {
        this.loading = false
      }
    },
    async createCredential(payload: CreateCredentialPayload) {
      const cred = await credentialApi.create(payload)
      await this.fetchCredentials()
      return cred
    },
    async updateCredential(id: string, patch: Partial<CreateCredentialPayload>) {
      const cred = await credentialApi.update(id, patch)
      await this.fetchCredentials()
      return cred
    },
    async removeCredential(id: string) {
      await credentialApi.remove(id)
      await this.fetchCredentials()
    },
  },
})
