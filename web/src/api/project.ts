import http from './http';

function encodePath(projectPath: string): string {
  return encodeURIComponent(projectPath);
}

export default {
  listProjects(scanDir?: string) {
    return http.get('/projects', { params: { scanDir } });
  },

  registerProject(projectPath: string) {
    return http.post('/projects/register', { path: projectPath });
  },

  getStats(projectPath: string) {
    return http.get(`/projects/${encodePath(projectPath)}/stats`);
  },

  getStatus(projectPath: string) {
    return http.get(`/projects/${encodePath(projectPath)}/status`);
  },

  triggerIndex(projectPath: string) {
    return http.post(`/projects/${encodePath(projectPath)}/index`);
  },

  triggerSync(projectPath: string) {
    return http.post(`/projects/${encodePath(projectPath)}/sync`);
  },
};
