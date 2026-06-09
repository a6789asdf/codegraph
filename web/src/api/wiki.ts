import http from './http';

export default {
  getPages(projectId: string) {
    return http.get(`/projects/${projectId}/wiki/pages`);
  },

  getPage(projectId: string, pageId: string) {
    return http.get(`/projects/${projectId}/wiki/page/${encodeURIComponent(pageId)}`);
  },

  generate(projectId: string) {
    return http.post(`/projects/${projectId}/wiki/generate`);
  },
};
