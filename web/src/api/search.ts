import http from './http';

function encodePath(projectPath: string): string {
  return encodeURIComponent(projectPath);
}

export default {
  search(projectPath: string, q: string, kind?: string, limit?: number) {
    return http.get(`/projects/${encodePath(projectPath)}/search`, {
      params: { q, kind, limit },
    });
  },

  getNode(projectPath: string, nodeId: string, includeCode = true) {
    return http.get(`/projects/${encodePath(projectPath)}/nodes/${encodeURIComponent(nodeId)}`, {
      params: { includeCode },
    });
  },

  getNodeContext(projectPath: string, nodeId: string) {
    return http.get(`/projects/${encodePath(projectPath)}/nodes/${encodeURIComponent(nodeId)}/context`);
  },

  getFiles(projectPath: string) {
    return http.get(`/projects/${encodePath(projectPath)}/files`);
  },

  getCallers(projectPath: string, nodeId: string, depth = 1) {
    return http.get(`/projects/${encodePath(projectPath)}/callers/${encodeURIComponent(nodeId)}`, {
      params: { depth },
    });
  },

  getCallees(projectPath: string, nodeId: string, depth = 1) {
    return http.get(`/projects/${encodePath(projectPath)}/callees/${encodeURIComponent(nodeId)}`, {
      params: { depth },
    });
  },

  getImpact(projectPath: string, nodeId: string, depth = 3) {
    return http.get(`/projects/${encodePath(projectPath)}/impact/${encodeURIComponent(nodeId)}`, {
      params: { depth },
    });
  },

  traverse(projectPath: string, nodeId: string, direction = 'both', edgeKinds?: string[], maxDepth = 3) {
    return http.get(`/projects/${encodePath(projectPath)}/traverse/${encodeURIComponent(nodeId)}`, {
      params: { direction, edgeKinds: edgeKinds?.join(','), maxDepth },
    });
  },

  findPath(projectPath: string, fromId: string, toId: string, edgeKinds?: string[]) {
    return http.get(`/projects/${encodePath(projectPath)}/path`, {
      params: { from: fromId, to: toId, edgeKinds: edgeKinds?.join(',') },
    });
  },

  getCallGraph(projectPath: string, nodeId: string, depth = 2) {
    return http.get(`/projects/${encodePath(projectPath)}/call-graph/${encodeURIComponent(nodeId)}`, {
      params: { depth },
    });
  },

  getTypeHierarchy(projectPath: string, nodeId: string) {
    return http.get(`/projects/${encodePath(projectPath)}/type-hierarchy/${encodeURIComponent(nodeId)}`);
  },
};
