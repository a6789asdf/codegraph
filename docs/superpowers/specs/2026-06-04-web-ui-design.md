# CodeGraph Web UI Design

Date: 2026-06-04

## Overview

A standalone web application providing visual and interactive access to CodeGraph's code intelligence capabilities. Serves both CodeGraph users (developers browsing code graphs, searching symbols, tracing call chains) and project team members (monitoring index health, analyzing code quality).

## Architecture

Monorepo approach: new `web/` directory for the Vue 2 frontend, new `src/api/` module for the HTTP API layer. Both live alongside existing code.

```
codegraph2/
├── src/
│   ├── api/                    # HTTP API layer (Hono)
│   │   ├── index.ts            # App entry, route registration
│   │   ├── routes/
│   │   │   ├── projects.ts     # Project list, status, stats
│   │   │   ├── search.ts       # Symbol search, FTS5 queries
│   │   │   ├── graph.ts        # Graph queries: callers/callees/impact/traverse
│   │   │   ├── routes.ts       # Route manifest, bridge relations
│   │   │   └── quality.ts      # Code quality: circular deps, dead code, dependency analysis
│   │   └── middleware.ts       # CORS, error handling, project path validation
│   └── ...                     # Existing code unchanged
├── web/                        # Vue 2 frontend
│   ├── src/
│   │   ├── views/              # 5 page views
│   │   ├── components/         # Shared components
│   │   ├── api/                # API call service layer
│   │   ├── store/              # Vuex 3 modules
│   │   ├── router/             # Vue Router 3
│   │   └── types/              # Shared types (generated from src/types.ts)
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
└── site/                       # Existing docs site (unchanged)
```

Data flow:

```
Vue 2 Frontend (web/) ──HTTP/JSON──> API Layer (src/api/) ──direct call──> CodeGraph (src/index.ts) ──> SQLite (FTS5)
```

## API Layer

Framework: Hono (lightweight, TypeScript-native, ~14KB, Node.js adapter).

All endpoints return `{ ok: boolean, data?: T, error?: string }`.

### Project Management

| Method | Path | Description | CodeGraph Method |
|--------|------|-------------|-----------------|
| GET | `/api/projects` | List initialized projects | Scan `.codegraph/` dirs |
| GET | `/api/projects/:path/stats` | Project statistics | `getStats()` |
| GET | `/api/projects/:path/status` | Index health status | `getStats()` + `getPendingFiles()` |
| POST | `/api/projects/:path/index` | Trigger full index | `indexAll()` |
| POST | `/api/projects/:path/sync` | Trigger incremental sync | `sync()` |

### Search & Query

| Method | Path | Description | CodeGraph Method |
|--------|------|-------------|-----------------|
| GET | `/api/projects/:path/search?q=&kind=&limit=` | Symbol search | `searchNodes()` |
| GET | `/api/projects/:path/nodes/:id` | Node detail + source | `getNode()` + `getCode()` |
| GET | `/api/projects/:path/nodes/:id/context` | Node context | `getContext()` |
| GET | `/api/projects/:path/files` | File list | `getFiles()` |

### Graph Traversal

| Method | Path | Description | CodeGraph Method |
|--------|------|-------------|-----------------|
| GET | `/api/projects/:path/callers/:nodeId?depth=` | Callers | `getCallers()` |
| GET | `/api/projects/:path/callees/:nodeId?depth=` | Callees | `getCallees()` |
| GET | `/api/projects/:path/impact/:nodeId?depth=` | Impact radius | `getImpactRadius()` |
| GET | `/api/projects/:path/traverse/:nodeId?direction=&edgeKinds=` | Graph traversal | `traverse()` |
| GET | `/api/projects/:path/path?from=&to=` | Shortest path | `findPath()` |

### Routes & Bridges

| Method | Path | Description | CodeGraph Method |
|--------|------|-------------|-----------------|
| GET | `/api/projects/:path/routes` | Route manifest | `getRoutingManifest()` |
| GET | `/api/projects/:path/top-route-file` | Primary route file | `getTopRouteFile()` |
| GET | `/api/projects/:path/frameworks` | Detected frameworks | `getDetectedFrameworks()` |

### Code Quality

| Method | Path | Description | CodeGraph Method |
|--------|------|-------------|-----------------|
| GET | `/api/projects/:path/circular-deps` | Circular dependencies | `findCircularDependencies()` |
| GET | `/api/projects/:path/dead-code?kinds=` | Dead code detection | `findDeadCode()` |
| GET | `/api/projects/:path/file-deps/:filePath` | File dependencies | `getFileDependencies()` |
| GET | `/api/projects/:path/file-dependents/:filePath` | File dependents | `getFileDependents()` |
| GET | `/api/projects/:path/metrics/:nodeId` | Node metrics | `getNodeMetrics()` |

Long-running operations (index, sync) return 202 Accepted with a task status polling endpoint.

`:path` parameter is URL-encoded project root path; API layer validates path legality.

## Frontend Pages

### 1. Dashboard

Project overview and quick actions.

- Project selector (a-select dropdown)
- Stats cards: node count, edge count, file count, language distribution, framework detection (a-card + a-statistic)
- Index status: health, pending files, last index time (a-badge + a-tag)
- Quick actions: trigger index/sync (a-button)

### 2. Graph Visualization

Interactive graph browsing with dual layout modes.

- Main canvas: force-directed (d3-force + SVG) / hierarchical (dagre + SVG), switchable
- Node coloring by NodeKind: class=blue, function=green, method=yellow, route=orange, etc.
- Click node: side panel shows detail (source code, context, edge list)
- Drag, zoom, box select
- Right-click context menu: expand callers/callees/impact, focus, collapse
- Search bar: type symbol name, highlight and locate node
- Large-scale fallback (>1000 nodes): switch to Canvas/WebGL rendering (pixi.js), loaded on demand

### 3. Search & Query

Symbol search with call chain tracing.

- Search bar: FTS5 full-text search with kind filter
- Result list: symbol name, type, file path, line number (a-list)
- Call chain panel: selected symbol shows callers/callees tree
- Impact analysis: expand impact radius, visualize affected scope
- Path query: from-to shortest path display

### 4. Routes & Bridges

Framework routes and cross-language bridges.

- Route table: URL, HTTP method, handler function, file location (a-table)
- Group/filter by framework (a-tag + a-checkbox-group)
- Bridge graph: Swift<->ObjC, RN Bridge, Expo Modules cross-language connections
- Click route to navigate to graph page's corresponding node

### 5. Code Quality

Dependency analysis and health checks.

- Circular dependencies: visualize dependency cycles
- Dead code list: unreferenced functions/methods/classes, filter by kind (a-table)
- File dependency graph: selected file's upstream/downstream dependencies
- Node metrics ranking: in-degree/out-degree/call count Top N

## Component Hierarchy

```
App.vue
├── AppLayout.vue              # Sidebar nav + top bar
│   ├── ProjectSelector.vue    # a-select project switch
│   └── NavMenu.vue            # a-menu 5 page entries
├── views/
│   ├── DashboardView.vue
│   │   ├── StatsCards.vue         # a-card + a-statistic
│   │   ├── IndexStatus.vue        # a-badge + a-tag
│   │   └── QuickActions.vue       # a-button
│   ├── GraphView.vue
│   │   ├── GraphCanvas.vue        # d3-force / dagre rendering
│   │   ├── GraphToolbar.vue       # Layout switch, zoom controls
│   │   ├── NodeDetailPanel.vue    # Side detail panel
│   │   └── GraphSearchBar.vue     # a-input-search
│   ├── SearchView.vue
│   │   ├── SearchBar.vue          # a-input-search + a-select filter
│   │   ├── SearchResultList.vue   # a-list
│   │   ├── CallChainPanel.vue     # a-tree
│   │   └── ImpactPanel.vue        # a-collapse
│   ├── RoutesView.vue
│   │   ├── RouteTable.vue         # a-table
│   │   ├── BridgeGraph.vue        # d3-force sub-graph
│   │   └── FrameworkFilter.vue    # a-tag + a-checkbox-group
│   └── QualityView.vue
│       ├── CircularDepsGraph.vue  # d3-force cycle visualization
│       ├── DeadCodeList.vue       # a-table
│       ├── FileDepGraph.vue       # dagre dependency graph
│       └── MetricsRanking.vue     # a-table + a-progress
└── components/
    ├── CodeViewer.vue         # Shiki syntax highlighting
    ├── BreadcrumbNav.vue      # a-breadcrumb
    └── LoadingState.vue       # a-spin
```

## State Management (Vuex 3)

```
store/
├── index.ts
└── modules/
    ├── project.ts      # projects[], currentProject, stats, status
    ├── graph.ts        # nodes Map, edges Map, layout mode, selectedNodeId, expandedNodes Set
    ├── search.ts       # query, results, callChain, impactData
    └── quality.ts      # circularDeps, deadCode, fileDeps, metrics
```

Data flow: user interaction -> API service call -> Vuex action -> mutation -> component reactive render.

API calls are encapsulated in `api/` service layer (not composables, since Vue 2 Options API).

## Key Interaction Flows

1. **Graph exploration**: search symbol -> locate node -> load direct neighbors (callers/callees) -> render subgraph -> click node -> side panel detail -> right-click "expand" -> load more neighbors -> incremental graph update.

2. **Impact analysis**: select node -> call /impact API -> return affected subgraph -> highlight in graph view OR list in search view.

3. **Project switch**: select project -> clear all Vuex modules -> reload stats/status -> each page loads data on demand.

## Caching Strategy

- Node/edge data: Vuex Map cache, cleared on project switch.
- Search results: no cache, fresh request each time.
- Stats/status: auto-refresh when returning to dashboard.
- Graph subgraph: loaded neighbor relations retained, new node expansions incrementally appended.

## Error Handling

- API layer: unified error format `{ ok: false, error: string }`.
- API service layer: catches errors, commits to Vuex error state.
- Component layer: displays errors via a-message / a-notification, does not block other features.
- Network disconnect: shows reconnect prompt.

## Tech Stack

| Category | Choice | Reason |
|----------|--------|--------|
| Framework | Vue 2 + Options API | User requirement |
| UI Library | ant-design-vue 1.x | User requirement, enterprise-grade components |
| Build | Vite + @vitejs/plugin-vue2 | Fast HMR, Vue 2 compatible |
| State | Vuex 3 | Vue 2 compatible |
| Router | Vue Router 3 | Vue 2 compatible |
| Graph Rendering | d3-force + dagre | Force-directed + hierarchical dual mode |
| HTTP | axios | ant-design-vue ecosystem standard |
| Code Highlighting | Shiki | VS Code-level syntax highlighting |

## CLI Integration

New subcommand in `src/bin/codegraph.ts`:

```bash
codegraph serve --api [--port 3000]    # Start API server (serves frontend static files in production)
codegraph serve --api --dev            # Dev mode (API only, frontend runs independently)
```

- `--api` flag reuses existing MCP project discovery logic.
- Default port 3000, configurable via `--port` or `CODEGRAPH_API_PORT`.
- Production mode auto-serves `web/dist/` static files.

## Testing

**API layer**: Vitest + real SQLite (no DB mocking), following existing `__tests__/` patterns. One test file per route module.

**Frontend**: Vitest + Vue Test Utils, covering key interactions (project switch, search flow, graph node expansion). Focus on correctness, not coverage percentage.

## Progressive Delivery

**P1 - Skeleton**: API layer + Dashboard + Search page.
**P2 - Graph Visualization**: Graph page + call chain tracing + impact analysis.
**P3 - Advanced Features**: Routes & Bridges page + Code Quality page.
