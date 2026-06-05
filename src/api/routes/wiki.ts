/**
 * Wiki Documentation Routes
 *
 * Endpoints for auto-generated project documentation.
 * Wiki pages are derived from the code graph structure.
 */

import { Hono } from 'hono';
import CodeGraph from '../../index';
import { projectResolver, ok } from '../middleware';

export const wikiRoutes = new Hono();

/**
 * List all wiki pages.
 *
 * Pages are auto-generated from the code graph structure:
 * - Architecture overview
 * - Module documentation
 * - API reference
 */
wikiRoutes.get('/projects/:path/wiki/pages', projectResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;

  const pages: Array<{
    id: string;
    title: string;
    type: string;
    updated_at: number | null;
  }> = [];

  // Architecture overview page
  pages.push({
    id: 'architecture',
    title: 'Architecture Overview',
    type: 'overview',
    updated_at: instance.getLastIndexedAt(),
  });

  // Module pages based on top-level directories
  const files = instance.getFiles();
  const dirSet = new Set<string>();
  for (const file of files) {
    const parts = file.path.split('/');
    if (parts.length > 1) {
      dirSet.add(parts[0]!);
    }
  }

  for (const dir of Array.from(dirSet).sort()) {
    pages.push({
      id: `module-${dir}`,
      title: `${dir}/ Module`,
      type: 'module',
      updated_at: instance.getLastIndexedAt(),
    });
  }

  // API reference page (if routes exist)
  const manifest = instance.getRoutingManifest();
  if (manifest && manifest.totalRoutes > 0) {
    pages.push({
      id: 'api-reference',
      title: 'API Reference',
      type: 'api',
      updated_at: instance.getLastIndexedAt(),
    });
  }

  // Quality report page
  pages.push({
    id: 'quality-report',
    title: 'Quality Report',
    type: 'quality',
    updated_at: instance.getLastIndexedAt(),
  });

  return c.json(ok(pages));
});

/**
 * Get a specific wiki page's content (Markdown).
 */
wikiRoutes.get('/projects/:path/wiki/page/:pageId', projectResolver(), async (c) => {
  const instance = c.get('codegraph') as CodeGraph;
  const pageId = c.req.param('pageId')!;

  let content = '';

  switch (pageId) {
    case 'architecture':
      content = generateArchitecturePage(instance);
      break;

    case 'api-reference':
      content = generateApiReferencePage(instance);
      break;

    case 'quality-report':
      content = generateQualityReportPage(instance);
      break;

    default:
      // Module page
      if (pageId.startsWith('module-')) {
        const moduleName = pageId.replace('module-', '');
        content = generateModulePage(instance, moduleName);
      } else {
        return c.json({ ok: false, error: `Page not found: ${pageId}` }, 404);
      }
  }

  return c.json(ok({
    id: pageId,
    title: getPageTitle(pageId),
    content,
    updated_at: instance.getLastIndexedAt(),
  }));
});

/**
 * Trigger wiki regeneration.
 * Since wiki is auto-generated from the graph, this is a no-op
 * that returns success.
 */
wikiRoutes.post('/projects/:path/wiki/generate', projectResolver(), async (c) => {
  return c.json(ok({ status: 'ok', message: 'Wiki pages are auto-generated from the code graph' }));
});

function getPageTitle(pageId: string): string {
  if (pageId === 'architecture') return 'Architecture Overview';
  if (pageId === 'api-reference') return 'API Reference';
  if (pageId === 'quality-report') return 'Quality Report';
  if (pageId.startsWith('module-')) return `${pageId.replace('module-', '')}/ Module`;
  return pageId;
}

function generateArchitecturePage(instance: CodeGraph): string {
  const stats = instance.getStats();
  const files = instance.getFiles();
  const frameworks = instance.getDetectedFrameworks();

  let md = `# Architecture Overview\n\n`;

  md += `## Project Statistics\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Total Nodes | ${(stats as any).nodeCount?.toLocaleString() || 'N/A'} |\n`;
  md += `| Total Edges | ${(stats as any).edgeCount?.toLocaleString() || 'N/A'} |\n`;
  md += `| Source Files | ${(stats as any).fileCount?.toLocaleString() || 'N/A'} |\n`;
  md += `| Languages | ${(stats as any).languages?.join(', ') || 'N/A'} |\n`;
  md += `| Frameworks | ${frameworks.join(', ') || 'None detected'} |\n\n`;

  // Directory structure
  const dirMap = new Map<string, number>();
  for (const file of files) {
    const dir = file.path.split('/')[0] || 'root';
    dirMap.set(dir, (dirMap.get(dir) || 0) + 1);
  }

  md += `## Directory Structure\n\n`;
  md += `| Directory | Files |\n|-----------|-------|\n`;
  for (const [dir, count] of Array.from(dirMap.entries()).sort((a, b) => b[1] - a[1])) {
    md += `| ${dir}/ | ${count} |\n`;
  }

  return md;
}

function generateApiReferencePage(instance: CodeGraph): string {
  const manifest = instance.getRoutingManifest();
  if (!manifest) {
    return '# API Reference\n\nNo routes detected in this project.\n';
  }

  let md = `# API Reference\n\n`;
  md += `> ${manifest.totalRoutes} routes detected\n\n`;

  // Group by HTTP method
  const byMethod = new Map<string, typeof manifest.entries>();
  for (const entry of manifest.entries) {
    const method = entry.method || entry.handlerKind || 'GET';
    if (!byMethod.has(method)) byMethod.set(method, []);
    byMethod.get(method)!.push(entry);
  }

  for (const [method, entries] of byMethod) {
    md += `## ${method}\n\n`;
    for (const entry of entries) {
      md += `### \`${entry.url}\`\n\n`;
      md += `- **Handler**: \`${entry.handler}\`\n`;
      md += `- **File**: \`${entry.handlerFile}:${entry.handlerLine}\`\n\n`;
    }
  }

  return md;
}

function generateQualityReportPage(instance: CodeGraph): string {
  let md = `# Quality Report\n\n`;

  // Circular dependencies
  const circularDeps = instance.findCircularDependencies();
  md += `## Circular Dependencies\n\n`;
  if (circularDeps.length === 0) {
    md += `No circular dependencies detected.\n\n`;
  } else {
    md += `> ${circularDeps.length} circular dependencies found\n\n`;
    for (let i = 0; i < Math.min(circularDeps.length, 10); i++) {
      md += `${i + 1}. ${circularDeps[i]!.join(' → ')}\n`;
    }
    if (circularDeps.length > 10) {
      md += `\n... and ${circularDeps.length - 10} more\n`;
    }
    md += `\n`;
  }

  // Dead code
  const deadCode = instance.findDeadCode();
  md += `## Dead Code\n\n`;
  if (deadCode.length === 0) {
    md += `No dead code detected.\n\n`;
  } else {
    md += `> ${deadCode.length} unreferenced symbols found\n\n`;
    for (let i = 0; i < Math.min(deadCode.length, 20); i++) {
      const node = deadCode[i]!;
      md += `- \`${node.name}\` (${node.kind}) in ${node.filePath}:${node.startLine}\n`;
    }
    if (deadCode.length > 20) {
      md += `\n... and ${deadCode.length - 20} more\n`;
    }
  }

  return md;
}

function generateModulePage(instance: CodeGraph, moduleName: string): string {
  const files = instance.getFiles();
  const moduleFiles = files.filter(f => f.path.startsWith(moduleName + '/'));

  let md = `# ${moduleName}/ Module\n\n`;
  md += `> ${moduleFiles.length} files\n\n`;

  // List key symbols in this module
  const kinds: Array<'class' | 'function' | 'method' | 'interface'> = ['class', 'function', 'method', 'interface'];
  for (const kind of kinds) {
    const nodes = instance.getNodesByKind(kind);
    const moduleNodes = nodes.filter(n => n.filePath.startsWith(moduleName + '/'));

    if (moduleNodes.length > 0) {
      md += `## ${kind.charAt(0).toUpperCase() + kind.slice(1)}s\n\n`;
      for (const node of moduleNodes.slice(0, 30)) {
        md += `- \`${node.name}\` — ${node.filePath}:${node.startLine}\n`;
      }
      if (moduleNodes.length > 30) {
        md += `\n... and ${moduleNodes.length - 30} more\n`;
      }
      md += `\n`;
    }
  }

  return md;
}
