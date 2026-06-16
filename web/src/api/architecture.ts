import http from './http';

export default {
  getCommunities(projectId: string) {
    return http.get(`/projects/${projectId}/analysis/communities`);
  },

  getCommunityDetail(projectId: string, communityId: string) {
    return http.get(`/projects/${projectId}/analysis/communities/${encodeURIComponent(communityId)}`);
  },

  getCommunityGraphData(projectId: string, communityId: string) {
    return http.get(`/projects/${projectId}/visualization/community-graph/${encodeURIComponent(communityId)}`);
  },

  getHubNodes(projectId: string, limit = 20) {
    return http.get(`/projects/${projectId}/analysis/hub-nodes`, {
      params: { limit },
    });
  },

  getBridgeNodes(projectId: string, limit = 20) {
    return http.get(`/projects/${projectId}/analysis/bridge-nodes`, {
      params: { limit },
    });
  },

  getKnowledgeGaps(projectId: string) {
    return http.get(`/projects/${projectId}/analysis/knowledge-gaps`);
  },

  getSurprisingConnections(projectId: string, limit = 15) {
    return http.get(`/projects/${projectId}/analysis/surprising-connections`, {
      params: { limit },
    });
  },

  getGraphData(projectId: string) {
    return http.get(`/projects/${projectId}/visualization/graph-data`);
  },
};
