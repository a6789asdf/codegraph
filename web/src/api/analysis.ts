import http from './http';

export default {
  getImpact(projectId: string, files: string[], maxDepth = 3) {
    return http.get(`/projects/${projectId}/analysis/impact`, {
      params: { files: files.join(','), max_depth: maxDepth },
    });
  },
};
