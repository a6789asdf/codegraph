/**
 * Architecture Analysis Routes
 *
 * Endpoints for community detection, hub/bridge node identification,
 * and architectural insights.
 */

import { Hono } from 'hono';
import CodeGraph from '../../index';
import { projectIdResolver, ok } from '../middleware';

export const architectureRoutes = new Hono();

/**
 * Detect code communities using file-level import graph clustering.
 *
 * Uses a simple label-propagation-like approach on the file dependency graph.
 */
architectureRoutes.get('/projects/:id/analysis/communities', projectIdResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;

  // Build file dependency graph
  const files = instance.getFiles();
  const fileDeps = new Map<string, Set<string>>();

  for (const file of files) {
    const deps = instance.getFileDependencies(file.path);
    const dependents = instance.getFileDependents(file.path);
    const allRelated = new Set([...deps, ...dependents]);
    fileDeps.set(file.path, allRelated);
  }

  // Simple community detection: group files by shared directory prefix
  // and import relationships (label propagation)
  const communities = detectCommunities(files.map(f => f.path), fileDeps);

  for (const community of communities) {
    let nodeCount = 0;
    for (const filePath of community.files) {
      try {
        const nodesInFile = instance.getNodesInFile(filePath);
        nodeCount += nodesInFile.length;
      } catch {
      }
    }
    community.node_count = nodeCount;
  }

  return c.json(ok(communities));
});

architectureRoutes.get('/projects/:id/analysis/communities/:communityId', projectIdResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const communityId = c.req.param('communityId');

  const files = instance.getFiles();
  const fileDeps = new Map<string, Set<string>>();

  for (const file of files) {
    const deps = instance.getFileDependencies(file.path);
    const dependents = instance.getFileDependents(file.path);
    const allRelated = new Set([...deps, ...dependents]);
    fileDeps.set(file.path, allRelated);
  }

  const communities = detectCommunities(files.map(f => f.path), fileDeps);
  const community = communities.find(c => c.id === communityId);

  if (!community) {
    return c.json({ ok: false, error: 'Community not found' }, 404);
  }

  let nodeCount = 0;
  for (const filePath of community.files) {
    try {
      const nodesInFile = instance.getNodesInFile(filePath);
      nodeCount += nodesInFile.length;
    } catch {
      // skip
    }
  }
  community.node_count = nodeCount;

  return c.json(ok(community));
});

architectureRoutes.get('/projects/:id/visualization/community-graph/:communityId', projectIdResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const communityId = c.req.param('communityId');

  const files = instance.getFiles();
  const fileDeps = new Map<string, Set<string>>();

  for (const file of files) {
    const deps = instance.getFileDependencies(file.path);
    const dependents = instance.getFileDependents(file.path);
    const allRelated = new Set([...deps, ...dependents]);
    fileDeps.set(file.path, allRelated);
  }

  const communities = detectCommunities(files.map(f => f.path), fileDeps);
  const community = communities.find(c => c.id === communityId);

  if (!community) {
    return c.json({ ok: false, error: 'Community not found' }, 404);
  }

  const communityFiles = new Set(community.files);

  const VISUAL_KINDS = ['class', 'interface', 'function', 'method', 'module', 'route', 'component'] as const;

  const nodes: Array<{
    id: string;
    name: string;
    kind: string;
    group: string;
    file: string;
    filePath: string;
    size: number;
  }> = [];

  const nodeIds = new Set<string>();

  for (const kind of VISUAL_KINDS) {
    try {
      const kindNodes = instance.getNodesByKind(kind);
      for (const node of kindNodes) {
        if (!communityFiles.has(node.filePath)) continue;
        nodeIds.add(node.id);
        const parts = node.filePath.split('/');
        nodes.push({
          id: node.id,
          name: node.name,
          kind: node.kind,
          group: parts.length > 1 ? parts[0]! : 'root',
          file: node.filePath,
          filePath: node.filePath,
          size: Math.max(5, Math.min(20, 5)),
        });
      }
    } catch {
      // skip
    }
  }

  const links: Array<{
    source: string;
    target: string;
    kind: string;
  }> = [];

  for (const nodeId of nodeIds) {
    const outgoing = instance.getOutgoingEdges(nodeId);
    for (const edge of outgoing) {
      if (nodeIds.has(edge.target) && edge.kind !== 'contains') {
        links.push({
          source: edge.source,
          target: edge.target,
          kind: edge.kind,
        });
      }
    }
  }

  return c.json(ok({ nodes, links }));
});

/**
 * Get hub nodes (high-degree nodes that many others depend on).
 *
 * Hub nodes have high in-degree (many callers/references).
 */
architectureRoutes.get('/projects/:id/analysis/hub-nodes', projectIdResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const limit = parseInt(c.req.query('limit') || '20', 10);

  const hubNodes: Array<{
    node: string;
    name: string;
    qualified_name: string;
    kind: string;
    file_path: string;
    degree: number;
  }> = [];

  // Check common node kinds for high-degree nodes
  const kinds: Array<'function' | 'method' | 'class' | 'interface'> = ['function', 'method', 'class', 'interface'];

  for (const kind of kinds) {
    try {
      const nodes = instance.getNodesByKind(kind);
      for (const node of nodes) {
        const metrics = instance.getNodeMetrics(node.id);
        const degree = metrics.incomingEdgeCount + metrics.outgoingEdgeCount;
        if (degree >= 5) {
          hubNodes.push({
            node: node.id,
            name: node.name,
            qualified_name: node.qualifiedName,
            kind: node.kind,
            file_path: node.filePath,
            degree,
          });
        }
      }
    } catch {
      // Skip
    }
  }

  // Sort by degree descending
  hubNodes.sort((a, b) => b.degree - a.degree);

  return c.json(ok(hubNodes.slice(0, limit)));
});

/**
 * Get bridge nodes (nodes that connect different communities).
 *
 * Bridge nodes have high betweenness centrality — removing them
 * would disconnect parts of the graph.
 */
architectureRoutes.get('/projects/:id/analysis/bridge-nodes', projectIdResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const limit = parseInt(c.req.query('limit') || '20', 10);

  const bridgeNodes: Array<{
    node: string;
    name: string;
    qualified_name: string;
    kind: string;
    file_path: string;
    betweenness: number;
  }> = [];

  // Approximate betweenness centrality using import graph
  const files = instance.getFiles();
  const fileDeps = new Map<string, string[]>();

  for (const file of files) {
    fileDeps.set(file.path, instance.getFileDependencies(file.path));
  }

  // Count how many shortest paths go through each file
  const pathCounts = new Map<string, number>();

  for (const [source, deps] of fileDeps) {
    for (const target of deps) {
      // Files that are imported by both source and target are bridges
      const targetDeps = fileDeps.get(target) || [];
      for (const intermediate of deps) {
        if (targetDeps.includes(intermediate) && intermediate !== source && intermediate !== target) {
          pathCounts.set(intermediate, (pathCounts.get(intermediate) || 0) + 1);
        }
      }
    }
  }

  // Map file-level bridges to node-level
  const maxCount = Math.max(...Array.from(pathCounts.values()), 1);
  for (const [filePath, count] of pathCounts) {
    const nodesInFile = instance.getNodesInFile(filePath);
    // Pick the most referenced node in the file as the bridge representative
    let bestNode: any = null;
    let bestDegree = 0;
    for (const node of nodesInFile) {
      try {
        const metrics = instance.getNodeMetrics(node.id);
        const degree = metrics.incomingEdgeCount + metrics.outgoingEdgeCount;
        if (degree > bestDegree) {
          bestDegree = degree;
          bestNode = node;
        }
      } catch {
        // Skip
      }
    }

    if (bestNode) {
      bridgeNodes.push({
        node: bestNode.id,
        name: bestNode.name,
        qualified_name: bestNode.qualifiedName,
        kind: bestNode.kind,
        file_path: filePath,
        betweenness: count / maxCount,
      });
    }
  }

  bridgeNodes.sort((a, b) => b.betweenness - a.betweenness);

  return c.json(ok(bridgeNodes.slice(0, limit)));
});

/**
 * Get knowledge gaps (files with many dependents but few imports).
 */
architectureRoutes.get('/projects/:id/analysis/knowledge-gaps', projectIdResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;

  const files = instance.getFiles();
  const gaps: Array<{
    file_path: string;
    dependent_count: number;
    import_count: number;
    gap_score: number;
  }> = [];

  for (const file of files) {
    const deps = instance.getFileDependencies(file.path);
    const dependents = instance.getFileDependents(file.path);
    const gapScore = dependents.length - deps.length;

    if (gapScore > 3) {
      gaps.push({
        file_path: file.path,
        dependent_count: dependents.length,
        import_count: deps.length,
        gap_score: gapScore,
      });
    }
  }

  gaps.sort((a, b) => b.gap_score - a.gap_score);

  return c.json(ok(gaps.slice(0, 20)));
});

architectureRoutes.get('/projects/:id/analysis/surprising-connections', projectIdResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const limit = parseInt(c.req.query('limit') || '15', 10);

  const files = instance.getFiles();
  const fileDeps = new Map<string, string[]>();
  const fileDependents = new Map<string, string[]>();

  for (const file of files) {
    fileDeps.set(file.path, instance.getFileDependencies(file.path));
    fileDependents.set(file.path, instance.getFileDependents(file.path));
  }

  const dirGroups = new Map<string, string[]>();
  for (const file of files) {
    const parts = file.path.split('/');
    const dir = parts.length > 1 ? parts[0]! : 'root';
    if (!dirGroups.has(dir)) dirGroups.set(dir, []);
    dirGroups.get(dir)!.push(file.path);
  }

  const nodeDegreeMap = new Map<string, number>();
  const nodeFileMap = new Map<string, string>();
  const nodeKindMap = new Map<string, string>();
  const nodeNameMap = new Map<string, string>();
  const nodeQNameMap = new Map<string, string>();

  const kinds: Array<'function' | 'method' | 'class' | 'interface'> = ['function', 'method', 'class', 'interface'];
  for (const kind of kinds) {
    try {
      const nodes = instance.getNodesByKind(kind);
      for (const node of nodes) {
        const metrics = instance.getNodeMetrics(node.id);
        const degree = metrics.incomingEdgeCount + metrics.outgoingEdgeCount;
        nodeDegreeMap.set(node.id, degree);
        nodeFileMap.set(node.id, node.filePath);
        nodeKindMap.set(node.id, node.kind);
        nodeNameMap.set(node.id, node.name);
        nodeQNameMap.set(node.id, node.qualifiedName);
      }
    } catch {
      // Skip
    }
  }

  const allDegrees = Array.from(nodeDegreeMap.values());
  const sortedDegrees = allDegrees.sort((a, b) => a - b);
  const medianDegree = sortedDegrees.length > 0
    ? sortedDegrees[Math.floor(sortedDegrees.length / 2)]!
    : 5;
  const hubThreshold = Math.max(medianDegree * 3, 10);

  const surprising: Array<{
    source: string;
    source_qualified: string;
    target: string;
    target_qualified: string;
    edge_kind: string;
    surprise_score: number;
    reasons: string[];
    source_file: string;
    target_file: string;
  }> = [];

  const visitedEdges = new Set<string>();

  for (const [nodeId] of nodeDegreeMap) {
    const outgoing = instance.getOutgoingEdges(nodeId);
    for (const edge of outgoing) {
      if (edge.kind === 'contains') continue;
      if (!nodeDegreeMap.has(edge.target)) continue;

      const edgeKey = `${edge.source}->${edge.target}:${edge.kind}`;
      if (visitedEdges.has(edgeKey)) continue;
      visitedEdges.add(edgeKey);

      let score = 0;
      const reasons: string[] = [];

      const sourceFile = nodeFileMap.get(edge.source) || '';
      const targetFile = nodeFileMap.get(edge.target) || '';
      const sourceDir = sourceFile.split('/')[0] || 'root';
      const targetDir = targetFile.split('/')[0] || 'root';

      if (sourceDir !== targetDir) {
        score += 0.3;
        reasons.push('cross-community');
      }

      const sourceExt = sourceFile.split('.').pop() || '';
      const targetExt = targetFile.split('.').pop() || '';
      if (sourceExt && targetExt && sourceExt !== targetExt) {
        score += 0.2;
        reasons.push('cross-language');
      }

      const sourceDegree = nodeDegreeMap.get(edge.source) || 0;
      const targetDegree = nodeDegreeMap.get(edge.target) || 0;

      if (sourceDegree <= 2 && targetDegree >= hubThreshold) {
        score += 0.2;
        reasons.push('peripheral-to-hub');
      }

      const sourceIsTest = sourceFile.includes('test') || sourceFile.includes('spec') || sourceFile.includes('__tests__');
      const targetIsTest = targetFile.includes('test') || targetFile.includes('spec') || targetFile.includes('__tests__');
      if (sourceIsTest !== targetIsTest && edge.kind === 'calls') {
        score += 0.15;
        reasons.push('cross-test-boundary');
      }

      const sourceKind = nodeKindMap.get(edge.source) || '';
      if (sourceKind === 'interface' || sourceKind === 'type') {
        score += 0.15;
        reasons.push('non-standard-edge');
      }

      if (score > 0) {
        surprising.push({
          source: nodeNameMap.get(edge.source) || edge.source,
          source_qualified: nodeQNameMap.get(edge.source) || edge.source,
          target: nodeNameMap.get(edge.target) || edge.target,
          target_qualified: nodeQNameMap.get(edge.target) || edge.target,
          edge_kind: edge.kind,
          surprise_score: Math.round(score * 100) / 100,
          reasons,
          source_file: sourceFile,
          target_file: targetFile,
        });
      }
    }
  }

  surprising.sort((a, b) => b.surprise_score - a.surprise_score);

  return c.json(ok(surprising.slice(0, limit)));
});

architectureRoutes.get('/projects/:id/visualization/graph-data', projectIdResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;

  const VISUAL_KINDS = ['class', 'interface', 'function', 'method', 'module', 'route', 'component'] as const;

  const nodes: Array<{
    id: string;
    name: string;
    kind: string;
    group: string;
    file: string;
    filePath: string;
    size: number;
  }> = [];

  const nodeIds = new Set<string>();

  for (const kind of VISUAL_KINDS) {
    try {
      const kindNodes = instance.getNodesByKind(kind);
      for (const node of kindNodes) {
        nodeIds.add(node.id);
        const parts = node.filePath.split('/');
        nodes.push({
          id: node.id,
          name: node.name,
          kind: node.kind,
          group: parts.length > 1 ? parts[0]! : 'root',
          file: node.filePath,
          filePath: node.filePath,
          size: Math.max(5, Math.min(20, 5)),
        });
      }
    } catch {
      // skip
    }
  }

  const links: Array<{
    source: string;
    target: string;
    kind: string;
  }> = [];

  for (const nodeId of nodeIds) {
    const outgoing = instance.getOutgoingEdges(nodeId);
    for (const edge of outgoing) {
      if (nodeIds.has(edge.target) && edge.kind !== 'contains') {
        links.push({
          source: edge.source,
          target: edge.target,
          kind: edge.kind,
        });
      }
    }
  }

  return c.json(ok({ nodes, links }));
});

/**
 * Simple community detection based on directory grouping and import density.
 */
function detectCommunities(
  filePaths: string[],
  fileDeps: Map<string, Set<string>>,
): Array<{
  id: string;
  name: string;
  description: string;
  node_count: number;
  file_count: number;
  primary_language: string;
  cohesion: number;
  files: string[];
}> {
  // Group files by top-level directory
  const dirGroups = new Map<string, string[]>();

  for (const filePath of filePaths) {
    const parts = filePath.split('/');
    const dir = parts.length > 1 ? parts[0]! : 'root';

    if (!dirGroups.has(dir)) {
      dirGroups.set(dir, []);
    }
    dirGroups.get(dir)!.push(filePath);
  }

  const communities: Array<{
    id: string;
    name: string;
    description: string;
    node_count: number;
    file_count: number;
    primary_language: string;
    cohesion: number;
    files: string[];
  }> = [];

  let communityId = 0;
  for (const [dir, files] of dirGroups) {
    // Calculate cohesion: ratio of internal edges to total possible edges
    let internalEdges = 0;
    let totalPossibleEdges = files.length * (files.length - 1);

    for (const file of files) {
      const deps = fileDeps.get(file) || new Set();
      for (const dep of deps) {
        if (files.includes(dep)) {
          internalEdges++;
        }
      }
    }

    const cohesion = totalPossibleEdges > 0 ? internalEdges / totalPossibleEdges : 0;

    // Detect primary language
    const langCounts = new Map<string, number>();
    for (const file of files) {
      const ext = file.split('.').pop() || '';
      const langMap: Record<string, string> = {
        ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript',
        py: 'Python', go: 'Go', rs: 'Rust', java: 'Java', rb: 'Ruby',
        php: 'PHP', swift: 'Swift', kt: 'Kotlin', cs: 'C#',
      };
      const lang = langMap[ext.toLowerCase()] || 'Unknown';
      langCounts.set(lang, (langCounts.get(lang) || 0) + 1);
    }
    const primaryLanguage = Array.from(langCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';

    communities.push({
      id: `community-${communityId++}`,
      name: dir === 'root' ? 'Root' : dir,
      description: `Code community in ${dir}/ directory`,
      node_count: 0, // Will be filled by node count per file
      file_count: files.length,
      primary_language: primaryLanguage,
      cohesion: Math.round(cohesion * 100) / 100,
      files,
    });
  }

  // Sort by file count descending
  communities.sort((a, b) => b.file_count - a.file_count);

  return communities;
}
