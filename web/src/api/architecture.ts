import http from './http';

function encodePath(projectPath: string): string {
  return encodeURIComponent(projectPath);
}

export default {
  getCommunities(projectPath: string) {
    return http.get(`/projects/${encodePath(projectPath)}/analysis/communities`);
  },

  getCommunityDetail(projectPath: string, communityId: string) {
    return http.get(`/projects/${encodePath(projectPath)}/analysis/communities/${encodeURIComponent(communityId)}`);
  },

  getCommunityGraphData(projectPath: string, communityId: string) {
    return http.get(`/projects/${encodePath(projectPath)}/visualization/community-graph/${encodeURIComponent(communityId)}`);
  },

  getHubNodes(projectPath: string, limit = 20) {
    return http.get(`/projects/${encodePath(projectPath)}/analysis/hub-nodes`, {
      params: { limit },
    });
  },

  getBridgeNodes(projectPath: string, limit = 20) {
    return http.get(`/projects/${encodePath(projectPath)}/analysis/bridge-nodes`, {
      params: { limit },
    });
  },

  getKnowledgeGaps(projectPath: string) {
    return http.get(`/projects/${encodePath(projectPath)}/analysis/knowledge-gaps`);
  },

  getSurprisingConnections(projectPath: string, limit = 15) {
    return http.get(`/projects/${encodePath(projectPath)}/analysis/surprising-connections`, {
      params: { limit },
    });
  },

  getGraphData(projectPath: string) {
    return http.get(`/projects/${encodePath(projectPath)}/visualization/graph-data`);
  },
};
