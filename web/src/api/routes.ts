import http from './http';

export default {
  getRoutes(projectId: string, limit?: number) {
    return http.get(`/projects/${projectId}/routes`, {
      params: { limit },
    });
  },

  getTopRouteFile(projectId: string) {
    return http.get(`/projects/${projectId}/top-route-file`);
  },

  getFrameworks(projectId: string) {
    return http.get(`/projects/${projectId}/frameworks`);
  },
};
