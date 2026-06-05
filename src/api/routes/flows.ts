/**
 * Execution Flow Routes
 *
 * Endpoints for tracking execution flows through the codebase.
 * An execution flow is a chain of function calls from an entry point
 * (e.g., route handler, main function, framework-decorated handler)
 * through to a side effect (e.g., database call).
 *
 * Entry point detection strategy (inspired by code-review-graph):
 * 1. Route handlers from getRoutingManifest (framework-detected routes)
 * 2. Functions with no incoming CALLS edges (true root nodes)
 * 3. Functions with framework decorators (@app.get, @router.post, etc.)
 * 4. Functions matching conventional entry-point name patterns (main, handler, etc.)
 */

import { Hono } from 'hono';
import CodeGraph from '../../index';
import { projectResolver, ok } from '../middleware';

export const flowsRoutes = new Hono();

// ---------------------------------------------------------------------------
// Entry-point detection helpers
// ---------------------------------------------------------------------------

/** Decorator patterns that indicate a framework entry point */
const FRAMEWORK_DECORATOR_PATTERNS: RegExp[] = [
  // Python web frameworks
  /app\.(get|post|put|delete|patch|route|websocket)/i,
  /router\.(get|post|put|delete|patch|route)/i,
  /blueprint\.(route|before_request|after_request)/i,
  // CLI frameworks
  /click\.(command|group)/i,
  // Task queues
  /(celery\.)?(task|shared_task|periodic_task)/i,
  // Java Spring
  /(Get|Post|Put|Delete|Patch|RequestMapping)Mapping/i,
  /(Scheduled|EventListener|Bean|Configuration)/i,
  // JS/TS frameworks
  /(Component|Injectable|Controller|Module|Guard|Pipe)/i,
  /(Subscribe|Mutation|Query|Resolver)/i,
  // Express / Koa / Hono route handlers
  /(app|router)\.(get|post|put|delete|patch|use|all)\b/,
  // Angular
  /(Component|Injectable|Directive|Pipe)/i,
  // React
  /Component/i,
];

/** Name patterns that indicate conventional entry points */
const ENTRY_NAME_PATTERNS: RegExp[] = [
  /^main$/,
  /^__main__$/,
  /^handler$/,
  /^handle$/,
  /^lambda_handler$/,
  /^on_/,
  /^handle_/,
  // FastAPI / ASGI
  /^lifespan$/,
  // Express middleware
  /^(middleware|errorHandler)$/,
  // React/Angular lifecycle
  /^(componentDidMount|componentDidUpdate|componentWillUnmount|render)$/,
  /^ng(OnInit|OnChanges|OnDestroy|DoCheck|AfterContentInit|AfterViewInit)$/,
];

/** File patterns that look like test files */
const TEST_FILE_RE = /([\\/]__tests__[\\/]|\.spec\.[jt]sx?$|\.test\.[jt]sx?$|[\\/]test_[^/\\]*\.py$)/;

function isTestFile(filePath: string): boolean {
  return TEST_FILE_RE.test(filePath);
}

function hasFrameworkDecorator(decorators: string[] | undefined): boolean {
  if (!decorators || decorators.length === 0) return false;
  for (const dec of decorators) {
    for (const pat of FRAMEWORK_DECORATOR_PATTERNS) {
      if (pat.test(dec)) return true;
    }
  }
  return false;
}

function matchesEntryName(name: string): boolean {
  for (const pat of ENTRY_NAME_PATTERNS) {
    if (pat.test(name)) return true;
  }
  return false;
}

interface EntryPoint {
  id: string;
  name: string;
  qualifiedName: string;
  kind: string;
  filePath: string;
  source: 'route' | 'root' | 'decorator' | 'name_pattern';
}

/**
 * Detect entry points using multiple strategies:
 * 1. Route handlers from routing manifest
 * 2. Functions with no incoming CALLS edges
 * 3. Functions with framework decorators
 * 4. Functions matching conventional name patterns
 */
function detectEntryPoints(instance: CodeGraph): EntryPoint[] {
  const entryPoints: EntryPoint[] = [];
  const seenIds = new Set<string>();

  // Strategy 1: Route handlers from routing manifest
  const manifest = instance.getRoutingManifest();
  if (manifest) {
    for (const entry of manifest.entries) {
      if (seenIds.has(entry.handlerId)) continue;
      seenIds.add(entry.handlerId);
      entryPoints.push({
        id: entry.handlerId,
        name: entry.handler,
        qualifiedName: entry.handler,
        kind: entry.handlerKind,
        filePath: entry.handlerFile,
        source: 'route',
      });
    }
  }

  // Strategy 2-4: Scan function/method nodes
  const candidateKinds = ['function', 'method'] as const;
  for (const kind of candidateKinds) {
    const nodes = instance.getNodesByKind(kind);
    for (const node of nodes) {
      if (seenIds.has(node.id)) continue;
      if (isTestFile(node.filePath)) continue;

      let isEntry = false;
      let source: EntryPoint['source'] = 'root';

      // Strategy 2: No incoming CALLS edges (true root)
      const incomingEdges = instance.getIncomingEdges(node.id);
      const callsIncoming = incomingEdges.filter(e => e.kind === 'calls');
      if (callsIncoming.length === 0 && !node.isExported) {
        isEntry = true;
        source = 'root';
      }

      // Strategy 3: Framework decorator match
      if (hasFrameworkDecorator(node.decorators)) {
        isEntry = true;
        source = 'decorator';
      }

      // Strategy 4: Conventional name match
      if (matchesEntryName(node.name)) {
        isEntry = true;
        source = 'name_pattern';
      }

      if (isEntry) {
        seenIds.add(node.id);
        entryPoints.push({
          id: node.id,
          name: node.name,
          qualifiedName: node.qualifiedName,
          kind: node.kind,
          filePath: node.filePath,
          source,
        });
      }
    }
  }

  return entryPoints;
}

// ---------------------------------------------------------------------------
// Flow tracing via BFS
// ---------------------------------------------------------------------------

interface FlowData {
  id: string;
  name: string;
  description: string;
  entry_point: string;
  entry_point_id: string;
  entry_source: string;
  node_count: number;
  depth: number;
  file_count: number;
  criticality: number;
}

/**
 * Trace a single execution flow from an entry point via forward BFS
 * through the call graph.
 */
function traceFlow(instance: CodeGraph, entry: EntryPoint, maxDepth: number = 3): FlowData | null {
  try {
    const callGraph = instance.getCallGraph(entry.id, maxDepth);
    if (callGraph.nodes.size < 2) return null; // Skip trivial single-node flows

    let actualMaxDepth = 0;
    const files = new Set<string>();

    for (const [, node] of callGraph.nodes) {
      files.add(node.filePath);
      try {
        const metrics = instance.getNodeMetrics(node.id);
        if (metrics.depth > actualMaxDepth) actualMaxDepth = metrics.depth;
      } catch {
        // Skip
      }
    }

    // Compute criticality (simplified version of code-review-graph's scoring)
    const nodeCount = callGraph.nodes.size;
    const fileCount = files.size;
    const fileSpread = Math.min((fileCount - 1) / 4.0, 1.0);
    const depthScore = Math.min(actualMaxDepth / 10.0, 1.0);
    const criticality = Math.min(1, fileSpread * 0.30 + depthScore * 0.10 + nodeCount * 0.02);

    const flowId = `flow-${entry.id.replace(/[^a-zA-Z0-9]/g, '_')}`;

    return {
      id: flowId,
      name: entry.name,
      description: `Execution flow from ${entry.source === 'route' ? 'route handler' : entry.source === 'decorator' ? 'decorated handler' : entry.source === 'name_pattern' ? 'entry function' : 'root function'} ${entry.name}`,
      entry_point: entry.qualifiedName,
      entry_point_id: entry.id,
      entry_source: entry.source,
      node_count: nodeCount,
      depth: actualMaxDepth,
      file_count: fileCount,
      criticality: Math.round(criticality * 100) / 100,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * List all detected execution flows.
 */
flowsRoutes.get('/projects/:path/flows', projectResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;

  const page = Math.max(1, Number(c.req.query('page')) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize')) || 20));

  const entryPoints = detectEntryPoints(instance);
  if (entryPoints.length === 0) {
    return c.json(ok({ items: [], total: 0, page, pageSize }));
  }

  const flows: FlowData[] = [];
  for (const ep of entryPoints) {
    const flow = traceFlow(instance, ep);
    if (flow) {
      flows.push(flow);
    }
  }

  flows.sort((a, b) => b.criticality - a.criticality);

  const total = flows.length;
  const start = (page - 1) * pageSize;
  const items = flows.slice(start, start + pageSize);

  return c.json(ok({ items, total, page, pageSize }));
});

/**
 * Get detailed execution flow data for a specific flow.
 */
flowsRoutes.get('/projects/:path/flows/:flowId', projectResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const flowId = c.req.param('flowId')!;

  // Find the matching entry point from the flow ID
  const entryPoints = detectEntryPoints(instance);
  const entry = entryPoints.find(ep => {
    const expectedId = `flow-${ep.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return expectedId === flowId;
  });

  if (!entry) {
    return c.json({ ok: false, error: `Flow not found: ${flowId}` }, 404);
  }

  // Build the execution flow graph
  const callGraph = instance.getCallGraph(entry.id, 4);

  // Convert Map to array for JSON serialization
  const nodes: Array<{
    id: string;
    kind: string;
    name: string;
    file: string;
    group?: string;
  }> = [];

  for (const [, node] of callGraph.nodes) {
    nodes.push({
      id: node.id,
      kind: node.kind,
      name: node.name,
      file: node.filePath,
      group: node.filePath.split('/')[0],
    });
  }

  const links = callGraph.edges.map(e => ({
    source: e.source,
    target: e.target,
    kind: e.kind,
  }));

  // Calculate criticality
  let maxDepth = 0;
  const files = new Set<string>();
  for (const [, node] of callGraph.nodes) {
    files.add(node.filePath);
    try {
      const metrics = instance.getNodeMetrics(node.id);
      if (metrics.depth > maxDepth) maxDepth = metrics.depth;
    } catch {
      // Skip
    }
  }

  const fileSpread = Math.min((files.size - 1) / 4.0, 1.0);
  const depthScore = Math.min(maxDepth / 10.0, 1.0);
  const criticality = Math.min(1, fileSpread * 0.30 + depthScore * 0.10 + nodes.length * 0.02);

  return c.json(ok({
    id: flowId,
    name: entry.name,
    description: `Execution flow from ${entry.source === 'route' ? 'route handler' : entry.source === 'decorator' ? 'decorated handler' : entry.source === 'name_pattern' ? 'entry function' : 'root function'} ${entry.name}`,
    entry_point: entry.qualifiedName,
    entry_point_id: entry.id,
    entry_source: entry.source,
    node_count: nodes.length,
    depth: maxDepth,
    file_count: files.size,
    criticality: Math.round(criticality * 100) / 100,
    nodes,
    links,
  }));
});
