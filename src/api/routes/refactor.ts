/**
 * Refactoring Tool Routes
 *
 * Endpoints for dead code detection, rename preview,
 * and refactoring suggestions.
 */

import { Hono } from 'hono';
import CodeGraph from '../../index';
import { projectResolver, ok } from '../middleware';

export const refactorRoutes = new Hono();

/**
 * Find dead code (unreferenced symbols).
 *
 * Query params:
 *   - kinds: comma-separated NodeKinds (default: function,method,class,variable,constant)
 */
refactorRoutes.get('/projects/:path/refactor/dead-code', projectResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const kindsStr = c.req.query('kinds');
  const kinds = kindsStr
    ? kindsStr.split(',') as any[]
    : ['function', 'method', 'class', 'variable', 'constant'] as any[];

  const deadCode = instance.findDeadCode(kinds);

  const results = deadCode.map(node => ({
    node: node.id,
    kind: node.kind,
    name: node.name,
    file_path: node.filePath,
    line_start: node.startLine,
    line_end: node.endLine,
    reason: node.isExported ? 'exported_but_unused_internally' : 'no_incoming_references',
    confidence: node.isExported ? 0.5 : 0.9, // Exported symbols might be used externally
  }));

  return c.json(ok(results));
});

/**
 * Get refactoring suggestions.
 *
 * Analyzes the codebase for common refactoring opportunities:
 * - Large functions that should be split
 * - Highly-coupled modules
 * - Duplicate patterns (same name in different files)
 */
refactorRoutes.get('/projects/:path/refactor/suggestions', projectResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;

  const suggestions: Array<{
    type: string;
    target: string;
    targets?: string[];
    message: string;
    impact: 'low' | 'medium' | 'high';
  }> = [];

  // 1. Find large functions (many callees)
  const functionKinds: Array<'function' | 'method'> = ['function', 'method'];
  for (const kind of functionKinds) {
    try {
      const nodes = instance.getNodesByKind(kind);
      for (const node of nodes) {
        const metrics = instance.getNodeMetrics(node.id);
        if (metrics.callCount > 10) {
          suggestions.push({
            type: 'extract_module',
            target: node.name,
            message: `${kind} "${node.name}" calls ${metrics.callCount} other functions — consider extracting a module`,
            impact: metrics.callCount > 20 ? 'high' : 'medium',
          });
        }
      }
    } catch {
      // Skip
    }
  }

  // 2. Find highly-coupled files (many dependencies)
  const files = instance.getFiles();
  for (const file of files) {
    const deps = instance.getFileDependencies(file.path);
    if (deps.length > 10) {
      suggestions.push({
        type: 'consolidate',
        target: file.path,
        message: `File has ${deps.length} dependencies — consider splitting or consolidating`,
        impact: deps.length > 20 ? 'high' : 'medium',
      });
    }
  }

  // 3. Find duplicate function names across files
  const nameMap = new Map<string, string[]>();
  for (const kind of functionKinds) {
    try {
      const nodes = instance.getNodesByKind(kind);
      for (const node of nodes) {
        const existing = nameMap.get(node.name) || [];
        existing.push(node.id);
        nameMap.set(node.name, existing);
      }
    } catch {
      // Skip
    }
  }

  for (const [name, nodeIds] of nameMap) {
    if (nodeIds.length > 3) {
      suggestions.push({
        type: 'rename',
        targets: nodeIds,
        target: name,
        message: `"${name}" is defined ${nodeIds.length} times — consider more specific naming`,
        impact: 'low',
      });
    }
  }

  // Sort by impact
  const impactOrder = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact]);

  return c.json(ok(suggestions));
});

/**
 * Preview the impact of renaming a symbol.
 *
 * Query params:
 *   - qualified_name: current qualified name (required)
 *   - new_name: proposed new name (required)
 */
refactorRoutes.post('/projects/:path/refactor/preview-rename', projectResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const qualifiedName = c.req.query('qualified_name');
  const newName = c.req.query('new_name');

  if (!qualifiedName || !newName) {
    return c.json({ ok: false, error: 'Both "qualified_name" and "new_name" are required' }, 400);
  }

  // Search for the symbol
  const searchResults = instance.searchNodes(qualifiedName, { limit: 10 });

  if (searchResults.length === 0) {
    return c.json({ ok: false, error: `Symbol not found: ${qualifiedName}` }, 404);
  }

  const affectedNodes: Array<{
    qualified_name: string;
    name: string;
    file_path: string;
    line_start: number;
  }> = [];

  const affectedFiles = new Set<string>();

  for (const result of searchResults) {
    const node = result.node;
    affectedNodes.push({
      qualified_name: node.qualifiedName || node.name,
      name: node.name,
      file_path: node.filePath,
      line_start: node.startLine,
    });
    affectedFiles.add(node.filePath);

    // Find all usages
    const usages = instance.findUsages(node.id);
    for (const usage of usages) {
      affectedFiles.add(usage.node.filePath);
      affectedNodes.push({
        qualified_name: usage.node.qualifiedName || usage.node.name,
        name: usage.node.name,
        file_path: usage.node.filePath,
        line_start: usage.node.startLine,
      });
    }
  }

  // Deduplicate
  const uniqueNodes = Array.from(
    new Map(affectedNodes.map(n => [n.qualified_name + ':' + n.file_path, n])).values()
  );

  const estimatedImpact = `Renaming "${qualifiedName}" to "${newName}" will affect ${uniqueNodes.length} references across ${affectedFiles.size} files`;

  return c.json(ok({
    qualified_name: qualifiedName,
    new_name: newName,
    affected_nodes: uniqueNodes,
    affected_files: Array.from(affectedFiles),
    estimated_impact: estimatedImpact,
  }));
});
