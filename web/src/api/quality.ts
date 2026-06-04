import http from './http';

function encodePath(projectPath: string): string {
  return encodeURIComponent(projectPath);
}

export default {
  getCircularDeps(projectPath: string) {
    return http.get(`/projects/${encodePath(projectPath)}/circular-deps`);
  },

  getDeadCode(projectPath: string, kinds?: string[]) {
    return http.get(`/projects/${encodePath(projectPath)}/dead-code`, {
      params: { kinds: kinds?.join(',') },
    });
  },

  getFileDeps(projectPath: string, filePath: string) {
    return http.get(`/projects/${encodePath(projectPath)}/file-deps/${encodeURIComponent(filePath)}`);
  },

  getFileDependents(projectPath: string, filePath: string) {
    return http.get(`/projects/${encodePath(projectPath)}/file-dependents/${encodeURIComponent(filePath)}`);
  },

  getNodeMetrics(projectPath: string, nodeId: string) {
    return http.get(`/projects/${encodePath(projectPath)}/metrics/${encodeURIComponent(nodeId)}`);
  },
};
