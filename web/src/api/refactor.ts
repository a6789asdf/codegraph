import http from './http';

function encodePath(projectPath: string): string {
  return encodeURIComponent(projectPath);
}

export default {
  getDeadCode(projectPath: string, kinds?: string[]) {
    return http.get(`/projects/${encodePath(projectPath)}/refactor/dead-code`, {
      params: { kinds: kinds?.join(',') },
    });
  },

  getSuggestions(projectPath: string) {
    return http.get(`/projects/${encodePath(projectPath)}/refactor/suggestions`);
  },

  previewRename(projectPath: string, qualifiedName: string, newName: string) {
    return http.post(`/projects/${encodePath(projectPath)}/refactor/preview-rename`, null, {
      params: { qualified_name: qualifiedName, new_name: newName },
    });
  },
};
