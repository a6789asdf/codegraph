/**
 * Code Review Routes
 *
 * Endpoints for automated code review assistance:
 * change detection, impact analysis, and review context generation.
 */

import { Hono } from 'hono';
import CodeGraph from '../../index';
import { projectResolver, ok } from '../middleware';
import * as fs from 'fs';
import * as path from 'path';

export const reviewRoutes = new Hono();

/**
 * Detect changes and analyze their impact.
 *
 * Compares the current state against a base reference (e.g., HEAD~1).
 * For now, uses file modification times as a proxy for git diff.
 *
 * Query params:
 *   - base: base reference (default: HEAD~1, informational only)
 */
reviewRoutes.get('/projects/:path/review/detect-changes', projectResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const projectPath = c.get('projectPath') as string;
  const baseRef = c.req.query('base') || 'HEAD~1';

  // Find recently modified files as a proxy for "changed files"
  const files = instance.getFiles();
  const changedFiles: string[] = [];
  const now = Date.now();
  const recentThreshold = 24 * 60 * 60 * 1000; // 24 hours

  for (const file of files) {
    try {
      const fullPath = path.join(projectPath, file.path);
      const stat = fs.statSync(fullPath);
      if (now - stat.mtimeMs < recentThreshold) {
        changedFiles.push(file.path);
      }
    } catch {
      // File may not exist on disk
    }
  }

  // Analyze impact of changed files
  const findings: Array<{
    file: string;
    line_range: string;
    severity: 'high' | 'medium' | 'low';
    message: string;
    affected_nodes: Array<{ id: string; name: string; kind: string }>;
  }> = [];

  const affectedFlows: string[] = [];
  let totalRisk = 0;

  for (const filePath of changedFiles) {
    const nodesInFile = instance.getNodesInFile(filePath);

      // Check if any node in the file has many dependents (high risk)
    for (const node of nodesInFile) {
      try {
        const metrics = instance.getNodeMetrics(node.id);
        const severity: 'high' | 'medium' | 'low' =
          metrics.callerCount > 10 ? 'high' :
          metrics.callerCount > 3 ? 'medium' : 'low';

        if (severity !== 'low' || metrics.callerCount > 0) {
          findings.push({
            file: filePath,
            line_range: `L${node.startLine}-L${node.endLine}`,
            severity,
            message: `Modified ${node.kind} "${node.name}" is referenced by ${metrics.callerCount} callers`,
            affected_nodes: [{ id: node.id, name: node.name, kind: node.kind }],
          });

          totalRisk += severity === 'high' ? 3 : severity === 'medium' ? 2 : 1;
        }
      } catch {
        // Skip
      }
    }

    // Check if this file is part of any route handler flow
    const dependents = instance.getFileDependents(filePath);
    for (const dep of dependents) {
      if (dep.includes('route') || dep.includes('controller') || dep.includes('handler')) {
        if (!affectedFlows.includes(dep)) {
          affectedFlows.push(dep);
        }
      }
    }
  }

  const riskScore = Math.min(1, totalRisk * 0.05);
  const riskLevel = riskScore > 0.7 ? 'high' : riskScore > 0.4 ? 'medium' : 'low';

  return c.json(ok({
    base_ref: baseRef,
    changed_files: changedFiles,
    findings,
    affected_flows: affectedFlows,
    risk_score: Math.round(riskScore * 100) / 100,
    risk_level: riskLevel,
  }));
});

/**
 * Get review context for a specific function/method.
 *
 * Returns the source code, callers, callees, and test coverage info
 * to assist in code review.
 *
 * Query params:
 *   - target: qualified name of the function/method (required)
 */
reviewRoutes.get('/projects/:path/review/context', projectResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const target = c.req.query('target');

  if (!target) {
    return c.json({ ok: false, error: 'Query parameter "target" is required' }, 400);
  }

  // Search for the target node
  const searchResults = instance.searchNodes(target, { limit: 5 });
  if (searchResults.length === 0) {
    return c.json({ ok: false, error: `Symbol not found: ${target}` }, 404);
  }

  const node = searchResults[0]!.node;

  // Get source code
  let sourceSnippet: string | null = null;
  try {
    sourceSnippet = await instance.getCode(node.id);
  } catch {
    // Code may not be available
  }

  // Get callers and callees
  const callers = instance.getCallers(node.id, 1);
  const callees = instance.getCallees(node.id, 1);

  // Find related tests
  const tests: Array<{ source: string; target: string }> = [];
  const usages = instance.findUsages(node.id);
  for (const usage of usages) {
    if (usage.node.filePath.includes('test') || usage.node.filePath.includes('spec')) {
      tests.push({ source: usage.node.name || usage.node.id, target: usage.edge.kind });
    }
  }

  // Generate review prompts based on the code structure
  const reviewPrompts: string[] = [];
  if (callers.length > 10) {
    reviewPrompts.push(`This function has ${callers.length} callers — changes may have wide impact`);
  }
  if (callees.length > 15) {
    reviewPrompts.push(`This function calls ${callees.length} other functions — consider simplifying`);
  }
  if (tests.length === 0) {
    reviewPrompts.push('No test coverage found for this function — consider adding tests');
  }
  if (node.kind === 'method' && callers.length === 0) {
    reviewPrompts.push('This method has no callers — verify it is still needed');
  }

  return c.json(ok({
    node: {
      id: node.id,
      name: node.name,
      kind: node.kind,
      file: node.filePath,
      startLine: node.startLine,
      endLine: node.endLine,
    },
    source_snippet: sourceSnippet,
    callers: callers.map(c => ({ source: c.node.name || c.node.id, target: c.edge.kind })),
    callees: callees.map(c => ({ source: c.node.name || c.node.id, target: c.edge.kind })),
    tests,
    review_prompts: reviewPrompts,
  }));
});
