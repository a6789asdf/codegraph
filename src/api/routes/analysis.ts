/**
 * Impact Analysis Routes
 *
 * Endpoints for analyzing the blast radius of changes
 * to specific files or symbols.
 */

import { Hono } from 'hono';
import CodeGraph from '../../index';
import { projectIdResolver, ok } from '../middleware';

export const analysisRoutes = new Hono();

/**
 * Analyze the impact of changes to specific files.
 *
 * Query params:
 *   - files: comma-separated list of file paths (required)
 *   - max_depth: maximum traversal depth (default 3)
 */
analysisRoutes.get('/projects/:id/analysis/impact', projectIdResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const filesStr = c.req.query('files');
  const maxDepth = parseInt(c.req.query('max_depth') || '3', 10);

  if (!filesStr) {
    return c.json({ ok: false, error: 'Query parameter "files" is required' }, 400);
  }

  const files = filesStr.split(',').map(f => f.trim()).filter(Boolean);

  // Collect all impacted nodes by traversing from each file's nodes
  const impactedNodes: Array<{
    node: string;
    name: string;
    kind: string;
    file_path: string;
    depth: number;
    reason: string;
  }> = [];
  const visitedNodes = new Set<string>();
  const impactedFlows: string[] = [];

  for (const filePath of files) {
    // Get all nodes in the changed file
    const nodesInFile = instance.getNodesInFile(filePath);

    for (const node of nodesInFile) {
      if (visitedNodes.has(node.id)) continue;
      visitedNodes.add(node.id);

      // Direct change
      impactedNodes.push({
        node: node.id,
        name: node.name,
        kind: node.kind,
        file_path: node.filePath,
        depth: 0,
        reason: 'direct_change',
      });

      // Traverse impact radius
      try {
        const impact = instance.getImpactRadius(node.id, maxDepth);
        for (const [id, impactNode] of impact.nodes) {
          if (visitedNodes.has(id)) continue;
          visitedNodes.add(id);

          // Calculate depth based on shortest path
          let depth = maxDepth;
          for (const edge of impact.edges) {
            if (edge.target === id || edge.source === id) {
              depth = 1;
              break;
            }
          }

          impactedNodes.push({
            node: id,
            name: impactNode.name,
            kind: impactNode.kind,
            file_path: impactNode.filePath,
            depth,
            reason: depth === 1 ? 'calls_changed' : 'transitive',
          });
        }
      } catch {
        // Node may not support impact traversal
      }
    }
  }

  // Find affected tests (nodes in test files that reference impacted nodes)
  const affectedTests: Array<{ node: string; file_path: string }> = [];
  for (const impacted of impactedNodes) {
    try {
      const usages = instance.findUsages(impacted.node);
      for (const usage of usages) {
        if (usage.node.filePath.includes('test') || usage.node.filePath.includes('spec')) {
          if (!affectedTests.some(t => t.node === usage.node.id)) {
            affectedTests.push({ node: usage.node.id, file_path: usage.node.filePath });
          }
        }
      }
    } catch {
      // Skip
    }
  }

  // Compute risk score (0-1) based on number of impacted nodes and tests
  const riskScore = Math.min(1, (impactedNodes.length * 0.05 + affectedTests.length * 0.1));

  return c.json(ok({
    total_impacted: impactedNodes.length,
    impacted_nodes: impactedNodes,
    affected_tests: affectedTests,
    affected_flows: impactedFlows,
    risk_score: Math.round(riskScore * 100) / 100,
    risk_level: riskScore > 0.7 ? 'high' : riskScore > 0.4 ? 'medium' : 'low',
  }));
});
