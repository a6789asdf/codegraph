import http from './http';

function encodePath(projectPath: string): string {
  return encodeURIComponent(projectPath);
}

export interface FlowsPageResult {
  items: any[];
  total: number;
  page: number;
  pageSize: number;
}

export default {
  getFlows(projectPath: string, page: number = 1, pageSize: number = 20): Promise<FlowsPageResult> {
    return http.get(`/projects/${encodePath(projectPath)}/flows`, {
      params: { page, pageSize },
    });
  },

  getFlowDetail(projectPath: string, flowId: string) {
    return http.get(`/projects/${encodePath(projectPath)}/flows/${encodeURIComponent(flowId)}`);
  },
};
