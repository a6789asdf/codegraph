import http from './http'

export interface Task {
  id: string
  name: string
  source_type: 'git' | 'upload'
  source_url: string | null
  branch: string | null
  archive_path: string | null
  target_path: string
  system_id: string | null
  status: 'pending' | 'running' | 'completed' | 'failed'
  stage: string | null
  progress_pct: number
  error_message: string | null
  result_path: string | null
  created_at: string
  updated_at: string
  started_at: string | null
  completed_at: string | null
}

export default {
  list(filter?: { status?: 'active' | 'completed' | 'failed'; systemId?: string }) {
    const params: any = {}
    if (filter?.status) params.status = filter.status
    if (filter?.systemId) params.systemId = filter.systemId
    return http.get<Task[]>('/projects/tasks', { params })
  },

  get(taskId: string) {
    return http.get<Task>(`/projects/tasks/${taskId}`)
  },

  retry(taskId: string) {
    return http.post<{ taskId: string }>(`/projects/tasks/${taskId}/retry`)
  },

  remove(taskId: string) {
    return http.delete<{ deleted: boolean }>(`/projects/tasks/${taskId}`)
  },

  createClone(payload: { name: string; url: string; branch?: string; targetPath?: string; systemId?: string; credentialId?: string }) {
    return http.post<{ taskId: string }>('/projects/clone', payload)
  },

  createUpload(formData: FormData) {
    return http.post<{ taskId: string }>('/projects/upload', formData, {
      timeout: 120000,
    })
  },
}
