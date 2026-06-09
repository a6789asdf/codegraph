import http from './http';

export default {
  detectChanges(projectId: string, base = 'HEAD~1') {
    return http.get(`/projects/${projectId}/review/detect-changes`, {
      params: { base },
    });
  },

  getReviewContext(projectId: string, target: string) {
    return http.get(`/projects/${projectId}/review/context`, {
      params: { target },
    });
  },
};
