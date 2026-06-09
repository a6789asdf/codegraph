import http from './http';

export interface FlowsPageResult {
  items: any[];
  total: number;
  page: number;
  pageSize: number;
}

export default {
  getFlows(projectId: string, page: number = 1, pageSize: number = 20): Promise<FlowsPageResult> {
    return http.get(`/projects/${projectId}/flows`, {
      params: { page, pageSize },
    });
  },

  getFlowDetail(projectId: string, flowId: string) {
    return http.get(`/projects/${projectId}/flows/${encodeURIComponent(flowId)}`);
  },
};
