import http from './http';

export default {
  search(projectId: string, q: string, kind?: string, limit?: number) {
    return http.get(`/projects/${projectId}/search`, {
      params: { q, kind, limit },
    });
  },

  getNode(projectId: string, nodeId: string, includeCode = true) {
    return http.get(`/projects/${projectId}/nodes/${encodeURIComponent(nodeId)}`, {
      params: { includeCode },
    });
  },

  getNodeContext(projectId: string, nodeId: string) {
    return http.get(`/projects/${projectId}/nodes/${encodeURIComponent(nodeId)}/context`);
  },

  getFiles(projectId: string) {
    return http.get(`/projects/${projectId}/files`);
  },

  getCallers(projectId: string, nodeId: string, depth = 1) {
    return http.get(`/projects/${projectId}/callers/${encodeURIComponent(nodeId)}`, {
      params: { depth },
    });
  },

  getCallees(projectId: string, nodeId: string, depth = 1) {
    return http.get(`/projects/${projectId}/callees/${encodeURIComponent(nodeId)}`, {
      params: { depth },
    });
  },

  getImpact(projectId: string, nodeId: string, depth = 3) {
    return http.get(`/projects/${projectId}/impact/${encodeURIComponent(nodeId)}`, {
      params: { depth },
    });
  },

  traverse(projectId: string, nodeId: string, direction = 'both', edgeKinds?: string[], maxDepth = 3) {
    return http.get(`/projects/${projectId}/traverse/${encodeURIComponent(nodeId)}`, {
      params: { direction, edgeKinds: edgeKinds?.join(','), maxDepth },
    });
  },

  findPath(projectId: string, fromId: string, toId: string, edgeKinds?: string[]) {
    return http.get(`/projects/${projectId}/path`, {
      params: { from: fromId, to: toId, edgeKinds: edgeKinds?.join(',') },
    });
  },

  getCallGraph(projectId: string, nodeId: string, depth = 2) {
    return http.get(`/projects/${projectId}/call-graph/${encodeURIComponent(nodeId)}`, {
      params: { depth },
    });
  },

  getTypeHierarchy(projectId: string, nodeId: string) {
    return http.get(`/projects/${projectId}/type-hierarchy/${encodeURIComponent(nodeId)}`);
  },
};
