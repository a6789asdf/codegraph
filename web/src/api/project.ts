import http from './http';

export default {
  listProjects(scanDir?: string, systemId?: string) {
    return http.get('/projects', { params: { scanDir, systemId } });
  },

  registerProject(projectId: string, systemId?: string) {
    return http.post('/projects/register', { path: projectId, systemId });
  },

  getStats(projectId: string) {
    return http.get(`/projects/${projectId}/stats`);
  },

  getStatus(projectId: string) {
    return http.get(`/projects/${projectId}/status`);
  },

  triggerIndex(projectId: string) {
    return http.post(`/projects/${projectId}/index`);
  },

  triggerSync(projectId: string) {
    return http.post(`/projects/${projectId}/sync`);
  },

  listSystems() {
    return http.get<Array<{ id: string; name: string; createdAt: string; projectCount: number }>>('/systems');
  },

  createSystem(name: string) {
    return http.post<{ id: string; name: string; createdAt: string }>('/systems', { name });
  },

  deleteSystem(id: string) {
    return http.delete(`/systems/${id}`);
  },
};
