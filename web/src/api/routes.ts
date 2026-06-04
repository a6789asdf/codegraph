import http from './http';

function encodePath(projectPath: string): string {
  return encodeURIComponent(projectPath);
}

export default {
  getRoutes(projectPath: string, limit?: number) {
    return http.get(`/projects/${encodePath(projectPath)}/routes`, {
      params: { limit },
    });
  },

  getTopRouteFile(projectPath: string) {
    return http.get(`/projects/${encodePath(projectPath)}/top-route-file`);
  },

  getFrameworks(projectPath: string) {
    return http.get(`/projects/${encodePath(projectPath)}/frameworks`);
  },
};
