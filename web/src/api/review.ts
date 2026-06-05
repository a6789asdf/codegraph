import http from './http';

function encodePath(projectPath: string): string {
  return encodeURIComponent(projectPath);
}

export default {
  detectChanges(projectPath: string, base = 'HEAD~1') {
    return http.get(`/projects/${encodePath(projectPath)}/review/detect-changes`, {
      params: { base },
    });
  },

  getReviewContext(projectPath: string, target: string) {
    return http.get(`/projects/${encodePath(projectPath)}/review/context`, {
      params: { target },
    });
  },
};
