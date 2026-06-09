import http from './http';

export default {
  getDeadCode(projectId: string, kinds?: string[]) {
    return http.get(`/projects/${projectId}/refactor/dead-code`, {
      params: { kinds: kinds?.join(',') },
    });
  },

  getSuggestions(projectId: string) {
    return http.get(`/projects/${projectId}/refactor/suggestions`);
  },

  previewRename(projectId: string, qualifiedName: string, newName: string) {
    return http.post(`/projects/${projectId}/refactor/preview-rename`, null, {
      params: { qualified_name: qualifiedName, new_name: newName },
    });
  },
};
