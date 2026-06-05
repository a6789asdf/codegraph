import http from './http';

function encodePath(projectPath: string): string {
  return encodeURIComponent(projectPath);
}

export default {
  getPages(projectPath: string) {
    return http.get(`/projects/${encodePath(projectPath)}/wiki/pages`);
  },

  getPage(projectPath: string, pageId: string) {
    return http.get(`/projects/${encodePath(projectPath)}/wiki/page/${encodeURIComponent(pageId)}`);
  },

  generate(projectPath: string) {
    return http.post(`/projects/${encodePath(projectPath)}/wiki/generate`);
  },
};
