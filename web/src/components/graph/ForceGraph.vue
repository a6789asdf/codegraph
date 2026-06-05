<template>
  <div ref="containerRef" class="force-graph-container" :style="{ height: height + 'px' }" />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as d3 from 'd3'

interface Node {
  id: string
  name?: string
  group?: string
  kind?: string
  file?: string
  filePath?: string
  size?: number
  depth?: number
  reason?: string
}

interface Link {
  source: string
  target: string
  kind?: string
}

const props = withDefaults(defineProps<{
  nodes: Node[]
  links: Link[]
  height?: number
}>(), {
  height: 500,
})

const emit = defineEmits<{ nodeClick: [node: Node] }>()

const containerRef = ref<HTMLDivElement>()

let svg: d3.Selection<SVGSVGElement, unknown, null, undefined>
let simulation: d3.Simulation<any, any>
let resizeObserver: ResizeObserver | null = null
let isMounted = false
let isRendering = false

const KIND_COLORS: Record<string, string> = {
  Function: '#1677ff', Class: '#52c41a', Method: '#13c2c2', File: '#8c8c8c',
  Type: '#faad14', Test: '#722ed1',
  function: '#1677ff', class: '#52c41a', method: '#13c2c2', file: '#8c8c8c',
  interface: '#13c2c2', variable: '#722ed1', route: '#fa8c16', component: '#eb2f96', module: '#2f54eb',
}

const GROUP_COLORS: Record<string, string> = {
  auth: '#1677ff', api: '#52c41a', data: '#faad14', email: '#722ed1',
  utils: '#13c2c2', ui: '#eb2f96', core: '#2f54eb', tests: '#fa541c',
  default: '#1677ff',
}

function render() {
  if (!containerRef.value || !isMounted || isRendering) return
  isRendering = true
  try {
    if (simulation) {
      simulation.stop()
      simulation = undefined as any
    }
    const el = containerRef.value
    el.innerHTML = ''
    const width = el.clientWidth
    const height = props.height

  svg = d3.select(el).append('svg').attr('width', width).attr('height', height)
  const g = svg.append('g')

  // Zoom
  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.1, 4])
    .on('zoom', (event) => { g.attr('transform', event.transform) })
  svg.call(zoom)

  // Prepare data
  const linkData = props.links.map(l => ({ ...l }))
  const nodeMap = new Map<string, any>()
  for (const n of props.nodes) {
    nodeMap.set(n.id, { ...n })
  }

  const validLinks = linkData.filter(l => {
    const src = typeof l.source === 'string' ? l.source : (l.source as any)?.id ?? String(l.source)
    const tgt = typeof l.target === 'string' ? l.target : (l.target as any)?.id ?? String(l.target)
    return nodeMap.has(src) && nodeMap.has(tgt)
  })

  // Simulation
  simulation = d3.forceSimulation(Array.from(nodeMap.values()))
    .force('link', d3.forceLink(validLinks).id((d: any) => d.id).distance(80))
    .force('charge', d3.forceManyBody().strength(-200))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(25))
    .on('tick', ticked)

  // Arrow marker
  svg.append('defs').selectAll('marker')
    .data(['arrow'])
    .join('marker')
    .attr('id', 'arrow')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 20)
    .attr('refY', 0)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('fill', '#999')
    .attr('d', 'M0,-5L10,0L0,5')

  // Links
  const link = g.append('g')
    .selectAll('line')
    .data(validLinks)
    .join('line')
    .attr('stroke', '#d9d9d9')
    .attr('stroke-width', 1.5)
    .attr('marker-end', 'url(#arrow)')

  // Link labels
  const linkLabel = g.append('g')
    .selectAll('text')
    .data(validLinks)
    .join('text')
    .text(d => d.kind || '')
    .attr('font-size', 9)
    .attr('fill', '#999')
    .attr('text-anchor', 'middle')
    .style('display', 'none')

  // Nodes
  const node = g.append('g')
    .selectAll('g')
    .data(Array.from(nodeMap.values()))
    .join('g')
    .attr('class', 'node')
    .style('cursor', 'pointer')
    .on('click', (_event, d) => {
      emit('nodeClick', d)
      link.attr('stroke', l =>
        (l.source as any).id === d.id || (l.target as any).id === d.id ? '#1677ff' : '#d9d9d9'
      )
      link.attr('stroke-width', l =>
        (l.source as any).id === d.id || (l.target as any).id === d.id ? 2.5 : 1.5
      )
    })
    .on('mouseenter', function(_event, d) {
      linkLabel.style('display', ld =>
        ((ld.source as any).id === d.id || (ld.target as any).id === d.id) ? 'block' : 'none'
      )
    })
    .on('mouseleave', () => { linkLabel.style('display', 'none') })
    .call(d3.drag<any, any>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart()
        d.fx = d.x; d.fy = d.y
      })
      .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0)
        d.fx = null; d.fy = null
      })
    )

  // Circles
  node.append('circle')
    .attr('r', d => Math.max(5, Math.min(20, (d.size || 5) * 1.5)))
    .attr('fill', d => {
      if (d.depth !== undefined) {
        const depthColors = ['#ff4d4f', '#fa8c16', '#faad14', '#1677ff', '#52c41a']
        return depthColors[Math.min(d.depth, depthColors.length - 1)]
      }
      return KIND_COLORS[d.kind] || GROUP_COLORS[d.group] || GROUP_COLORS.default
    })
    .attr('stroke', '#fff')
    .attr('stroke-width', 2)
    .attr('opacity', 0.85)

  // Labels
  node.append('text')
    .text(d => {
      // Prefer the name field (e.g. "authenticateUser"), fall back to last segment of id
      if (d.name) return d.name
      const parts = d.id.split('.')
      return parts[parts.length - 1]
    })
    .attr('x', 0)
    .attr('y', d => (d.size || 5) * 1.5 + 14)
    .attr('text-anchor', 'middle')
    .attr('font-size', 10)
    .attr('fill', '#595959')
    .style('pointer-events', 'none')

  // Tooltip
  node.append('title')
    .text(d => `${d.name || d.id}\n${d.kind || ''} ${d.filePath || d.file || ''}`)

  function ticked() {
    link
      .attr('x1', (d: any) => d.source.x)
      .attr('y1', (d: any) => d.source.y)
      .attr('x2', (d: any) => d.target.x)
      .attr('y2', (d: any) => d.target.y)
    linkLabel
      .attr('x', (d: any) => (d.source.x + d.target.x) / 2)
      .attr('y', (d: any) => (d.source.y + d.target.y) / 2)
    node.attr('transform', (d: any) => `translate(${d.x},${d.y})`)
  }
  } finally {
    isRendering = false
  }
}

onMounted(() => {
  isMounted = true
  render()
  if (containerRef.value) {
    resizeObserver = new ResizeObserver(() => { render() })
    resizeObserver.observe(containerRef.value)
  }
})

onUnmounted(() => {
  isMounted = false
  if (simulation) {
    simulation.stop()
    simulation = undefined as any
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})

watch(() => [props.nodes, props.links], () => {
  render()
}, { deep: true })
</script>

<style scoped>
.force-graph-container {
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
  border: 1px solid #f0f0f0;
}
</style>
