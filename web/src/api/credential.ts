import http from './http'

export interface CredentialMeta {
  id: string
  name: string
  type: 'https' | 'ssh'
  username: string | null
  has_passphrase: boolean
  created_at: string
  updated_at: string
  last_used_at: string | null
}

export interface CreateCredentialPayload {
  name: string
  type: 'https' | 'ssh'
  username?: string
  secret: string
  passphrase?: string
}

export default {
  list: () => http.get<CredentialMeta[]>('/credentials'),

  create: (payload: CreateCredentialPayload) =>
    http.post<CredentialMeta>('/credentials', payload),

  update: (id: string, patch: Partial<CreateCredentialPayload>) =>
    http.put<CredentialMeta>(`/credentials/${id}`, patch),

  remove: (id: string) =>
    http.delete<{ deleted: boolean }>(`/credentials/${id}`),
}
