import http from './http';

export default {
  getCircularDeps(projectId: string) {
    return http.get(`/projects/${projectId}/circular-deps`);
  },

  getDeadCode(projectId: string, kinds?: string[]) {
    return http.get(`/projects/${projectId}/dead-code`, {
      params: { kinds: kinds?.join(',') },
    });
  },

  getFileDeps(projectId: string, filePath: string) {
    return http.get(`/projects/${projectId}/file-deps/${encodeURIComponent(filePath)}`);
  },

  getFileDependents(projectId: string, filePath: string) {
    return http.get(`/projects/${projectId}/file-dependents/${encodeURIComponent(filePath)}`);
  },

  getNodeMetrics(projectId: string, nodeId: string) {
    return http.get(`/projects/${projectId}/metrics/${encodeURIComponent(nodeId)}`);
  },
};
