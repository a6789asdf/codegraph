import http from './http';

function encodePath(projectPath: string): string {
  return encodeURIComponent(projectPath);
}

export default {
  getImpact(projectPath: string, files: string[], maxDepth = 3) {
    return http.get(`/projects/${encodePath(projectPath)}/analysis/impact`, {
      params: { files: files.join(','), max_depth: maxDepth },
    });
  },
};
