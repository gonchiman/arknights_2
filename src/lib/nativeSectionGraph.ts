import type * as Iced from 'iced-x86'
import { address, decodeNativeBody, type NativeBody, type NativeContext } from './nativeAnalysis.ts'
import { generateNativeFlow } from './nativeFlow.ts'

export type SectionGraphEdge = {
  from: number; at: number; target?: number; to?: number
  kind: 'branch' | 'next' | 'jump' | 'return' | 'interrupt' | 'unknown'
  label: string; boundary?: string
}
export type SectionGraphNode = {
  id: number; start: number; end: number; body: NativeBody; entries: number[]
  calls: string[]; callCount: number; reached: number
}
export type NativeSectionGraph = { entry: number; names: string[]; nodes: SectionGraphNode[]; edges: SectionGraphEdge[]; warnings: string[] }
export const GRAPH_LIMITS = { sections: 32, instructions: 16000, bytes: 256 * 1024 }

// A bounded, reachable graph of PE runtime-function ranges. These ranges are
// not C# method boundaries. Calls are listed, not inlined; other named methods
// and unknown range boundaries remain explicit exits from this graph.
export function decodeNativeSectionGraph(context: NativeContext, entry: number, iced: typeof Iced): NativeSectionGraph {
  const { pe, symbols } = context
  const first = pe.functionAt(entry)
  const warnings = new Set<string>()
  const graph: NativeSectionGraph = { entry, names: symbols.get(entry) || [], nodes: [], edges: [], warnings: [] }
  if (!first) {
    graph.warnings = ['DLLの区間境界が見つからないため、区間のフロー図を生成できません。命令の参考表示を利用してください。']
    return graph
  }
  let upper = Math.min(first.start + GRAPH_LIMITS.bytes, pe.section(entry)!.rva + pe.section(entry)!.size)
  for (const rva of symbols.keys()) if (rva > entry && rva < upper) upper = rva
  const loaded = new Map<number, SectionGraphNode>()
  const instructionMaps = new Map<number, Map<number, number>>()
  let decoded = 0
  function resolve(target: number): { node?: SectionGraphNode; reason?: string } {
    if (!pe.executable(target)) return { reason: '実行領域外' }
    if (target < first!.start || target >= upper || (target !== entry && symbols.has(target))) return { reason: 'この図の範囲外' }
    const range = pe.functionAt(target)
    if (!range) return { reason: '区間境界が未特定' }
    if (range.start < first!.start || range.end > upper) return { reason: 'この図の範囲外' }
    let node = loaded.get(range.start)
    if (!node) {
      if (loaded.size >= GRAPH_LIMITS.sections || decoded >= GRAPH_LIMITS.instructions) {
        warnings.add('大きな処理のため、一部の区間を図の外として表示しています。移動先を開くと続けて調べられます。')
        return { reason: '表示上限' }
      }
      const body = decodeNativeBody(context, range.start, iced)
      if (decoded + body.instructions.length > GRAPH_LIMITS.instructions) {
        warnings.add('命令数の上限で探索を止めました。図の外の移動先を開くと続けて調べられます。')
        return { reason: '表示上限' }
      }
      decoded += body.instructions.length
      node = { id: 0, start: range.start, end: range.end, body, entries: [], calls: [], callCount: 0, reached: 0 }
      loaded.set(range.start, node)
      instructionMaps.set(range.start, new Map(body.instructions.map((ins, i) => [ins.rva, i])))
    }
    if (!instructionMaps.get(range.start)!.has(target)) {
      warnings.add('命令の境界を確認できない移動先があります。未特定として表示しています。')
      return { reason: '命令境界が未特定' }
    }
    return { node }
  }
  const root = resolve(entry)
  if (!root.node) { graph.warnings = [root.reason || '区間を読み取れませんでした。']; return graph }
  root.node.entries.push(entry)
  const queue = [entry], visited = new Set<number>()
  function follow(node: SectionGraphNode, at: number, target: number | undefined, kind: SectionGraphEdge['kind']) {
    const destination = target === undefined ? { reason: '移動先が未特定' } : resolve(target)
    const nextNode = destination.node
    if (nextNode && target !== undefined) {
      queue.push(target)
      if (nextNode.start !== node.start || target <= at) {
        if (!nextNode.entries.includes(target)) nextNode.entries.push(target)
        graph.edges.push({ from: node.start, at, target, to: nextNode.start, kind, label: '' })
      }
    } else graph.edges.push({ from: node.start, at, target, kind, label: '', boundary: destination.reason })
  }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const rva = queue[cursor]
    if (visited.has(rva)) continue
    const { node } = resolve(rva)
    if (!node) continue
    visited.add(rva); node.reached++
    const index = instructionMaps.get(node.start)!.get(rva)!
    const ins = node.body.instructions[index]
    const next = ins.rva + ins.bytes.split(' ').length
    if (ins.flow === 'branch') {
      follow(node, rva, ins.target, 'branch'); follow(node, rva, next, 'next')
    } else if (ins.flow === 'jump') follow(node, rva, ins.target, 'jump')
    else if (['next', 'call', 'indirect-call'].includes(ins.flow)) follow(node, rva, next, 'next')
    else graph.edges.push({ from: node.start, at: rva, kind: ins.flow === 'return' ? 'return' : ins.flow === 'interrupt' ? 'interrupt' : 'unknown', label: '' })
  }
  graph.nodes = [...loaded.values()].filter(n => n.reached > 0).sort((a, b) => a.start - b.start)
  const retained = new Set(graph.nodes.map(n => n.start))
  graph.nodes.forEach((node, index) => {
    const calls = node.body.instructions.filter(ins => visited.has(ins.rva) && (ins.flow === 'call' || ins.flow === 'indirect-call'))
    node.id = index + 1; node.callCount = calls.length
    node.calls = [...new Set(calls.flatMap(ins => ins.names.length ? ins.names : [ins.target === undefined ? '間接呼出し（名前未特定）' : `名前未特定 ${address(ins.target)}`]))]
    node.entries.sort((a, b) => a - b)
    // Incoming jumps into the middle of a range also break flag inference.
    const blocks = generateNativeFlow(node.body, node.entries)
    const byLast = new Map(blocks.map(b => [b.last, b]))
    for (const edge of graph.edges.filter(e => e.from === node.start)) {
      const block = byLast.get(edge.at)
      edge.label = edge.kind === 'branch' ? block?.edges[0]?.label || '条件成立'
        : edge.kind === 'next' ? block?.kind === 'branch' ? block.edges[1]?.label || '条件不成立' : block?.kind === 'call' || block?.kind === 'indirect-call' ? '戻ってきた場合' : '次へ'
        : edge.kind === 'jump' ? '移動' : edge.kind === 'return' ? '呼び出し元へ戻る' : edge.kind === 'interrupt' ? '中断' : '移動先が未特定'
      if (edge.to !== undefined && !retained.has(edge.to)) { edge.to = undefined; edge.boundary = '未解析' }
    }
    if (node.body.warnings.some(w => /上限|64 KB|読み取れない/.test(w))) warnings.add(`区間${node.id}は命令の一部だけを読み取っています。`)
  })
  graph.warnings = [...warnings]
  graph.edges.sort((a, b) => a.from - b.from || a.at - b.at || (a.target ?? 0) - (b.target ?? 0))
  return graph
}

export type SectionConnection = { from: number; to: number; inside: boolean; edges: SectionGraphEdge[]; label: string }
export function sectionConnections(graph: NativeSectionGraph): SectionConnection[] {
  const starts = new Map(graph.nodes.map(n => [n.start, n]))
  const groups = new Map<string, SectionConnection>()
  for (const edge of graph.edges) {
    if (edge.to === undefined || !starts.has(edge.to)) continue
    const inside = edge.target !== edge.to
    const key = `${edge.from}:${edge.to}:${inside}`
    const group = groups.get(key) || { from: edge.from, to: edge.to, inside, edges: [], label: '' }
    group.edges.push(edge); groups.set(key, group)
  }
  return [...groups.values()].map(group => ({ ...group, label: group.edges.length > 1 ? `${group.inside ? '途中へ' : '分岐'} ×${group.edges.length}` : `${group.edges[0].label}${group.inside ? '・途中へ' : ''}` }))
}

export type SectionGraphPosition = { x: number; y: number; width: number; height: number }
export type SectionGraphLayout = {
  width: number; height: number; positions: Map<number, SectionGraphPosition>; links: SectionConnection[]
}

// The compact wide layout follows the nearest forward-address successor. That
// is a drawing convention, not a prediction of which branch will execute.
// Remaining sections sit below a placed predecessor. Narrow layouts use only
// forward edges for ranks so loops cannot make the layout grow indefinitely.
export function layoutSectionGraph(graph: NativeSectionGraph, width: number): SectionGraphLayout {
  const canvasWidth = Number.isFinite(width) ? Math.max(1, width) : 680
  const nodes = [...graph.nodes].sort((a, b) => a.start - b.start)
  const links = sectionConnections(graph)
  const positions = new Map<number, SectionGraphPosition>()
  if (!nodes.length) return { width: canvasWidth, height: 0, positions, links }
  const nodeHeight = 44
  let height: number
  if (canvasWidth >= 560) {
    const columns = Math.min(4, nodes.length), gap = 36, outer = 20, step = nodeHeight + 64
    const nodeWidth = Math.min(168, (canvasWidth - outer * 2 - gap * (columns - 1)) / columns)
    const left = (canvasWidth - nodeWidth * columns - gap * (columns - 1)) / 2
    const cells = new Map<number, { row: number; column: number }>()
    const occupied = new Set<string>()
    const place = (start: number, row: number, column: number) => {
      cells.set(start, { row, column }); occupied.add(`${row}:${column}`)
    }
    let cursor: number | undefined = nodes.find(n => graph.entry >= n.start && graph.entry < n.end)?.start ?? nodes[0].start
    let chainIndex = 0
    while (cursor !== undefined && !cells.has(cursor)) {
      const row = Math.floor(chainIndex / columns), column = chainIndex % columns
      place(cursor, row, row % 2 ? columns - 1 - column : column)
      const source: number = cursor
      cursor = links.filter(e => e.from === source && e.to > source).sort((a, b) => a.to - b.to)[0]?.to
      chainIndex++
    }
    for (const node of nodes) {
      if (cells.has(node.start)) continue
      const predecessors = links.filter(e => e.to === node.start && e.from < node.start && cells.has(e.from))
        .sort((a, b) => cells.get(b.from)!.row - cells.get(a.from)!.row || b.from - a.from)
      const anchor = predecessors.length ? cells.get(predecessors[0].from) : undefined
      let row = anchor ? anchor.row + 1 : 0
      const preference = Array.from({ length: columns }, (_, column) => column)
        .sort((a, b) => Math.abs(a - (anchor?.column ?? 0)) - Math.abs(b - (anchor?.column ?? 0)) || a - b)
      while (preference.every(column => occupied.has(`${row}:${column}`))) row++
      place(node.start, row, preference.find(column => !occupied.has(`${row}:${column}`))!)
    }
    for (const [start, cell] of cells) positions.set(start, {
      x: left + cell.column * (nodeWidth + gap), y: 22 + cell.row * step, width: nodeWidth, height: nodeHeight,
    })
    height = Math.max(...[...positions.values()].map(box => box.y + box.height)) + 42
  } else {
    const outer = Math.min(22, canvasWidth / 10), gap = 56, step = nodeHeight + 38
    const columns = canvasWidth - outer * 2 >= 2 * 82 + gap ? 2 : 1
    const nodeWidth = Math.min(168, (canvasWidth - outer * 2 - gap * (columns - 1)) / columns)
    const ranks = new Map<number, number>(), levels = new Map<number, SectionGraphNode[]>()
    for (const node of nodes) {
      const rank = links.filter(e => e.to === node.start && e.from < e.to)
        .reduce((rank, edge) => Math.max(rank, (ranks.get(edge.from) ?? 0) + 1), 0)
      ranks.set(node.start, rank); levels.set(rank, [...levels.get(rank) || [], node])
    }
    let row = 0
    for (const [, peers] of [...levels].sort((a, b) => a[0] - b[0])) {
      for (let offset = 0; offset < peers.length; offset += columns) {
        const group = peers.slice(offset, offset + columns)
        const left = (canvasWidth - group.length * nodeWidth - (group.length - 1) * gap) / 2
        group.forEach((node, column) => positions.set(node.start, {
          x: left + column * (nodeWidth + gap), y: 16 + row * step, width: nodeWidth, height: nodeHeight,
        }))
        row++
      }
    }
    height = 16 + (row - 1) * step + nodeHeight + 20
  }
  return { width: canvasWidth, height, positions, links }
}

type Point = { x: number; y: number }
const point = (x: number, y: number): Point => ({ x, y })

// Each candidate is orthogonal. Reject a route through any box, including its
// own source or destination; touching the boundary at a port is allowed.
function clearRoute(points: Point[], boxes: SectionGraphPosition[]) {
  return points.every((p, index) => {
    if (!index) return true
    const previous = points[index - 1]
    return boxes.every(box => {
      if (Math.abs(previous.x - p.x) < 0.001) return !(p.x > box.x + 0.001 && p.x < box.x + box.width - 0.001
        && Math.max(previous.y, p.y) > box.y + 0.001 && Math.min(previous.y, p.y) < box.y + box.height - 0.001)
      return !(p.y > box.y + 0.001 && p.y < box.y + box.height - 0.001
        && Math.max(previous.x, p.x) > box.x + 0.001 && Math.min(previous.x, p.x) < box.x + box.width - 0.001)
    })
  })
}

export function sectionConnectionPath(layout: SectionGraphLayout, link: SectionConnection, index: number): { d: string; join?: Point } {
  const from = layout.positions.get(link.from), to = layout.positions.get(link.to)
  if (!from || !to) return { d: '' }
  const boxes = [...layout.positions.values()]
  const candidates: Point[][] = []
  const centerX = (box: SectionGraphPosition) => box.x + box.width / 2
  const centerY = (box: SectionGraphPosition) => box.y + box.height / 2
  const bottom = (box: SectionGraphPosition) => box.y + box.height
  const siblings = layout.links.filter(e => e.from === link.from && layout.positions.get(e.to)!.y > from.y)
    .sort((a, b) => Math.abs(centerX(layout.positions.get(b.to)!) - centerX(from)) - Math.abs(centerX(layout.positions.get(a.to)!) - centerX(from)) || a.to - b.to)
  const siblingIndex = siblings.indexOf(link)
  const sx = from.x + from.width * (siblingIndex < 0 ? .5 : (siblingIndex + 1) / (siblings.length + 1))
  const tx = centerX(to)
  if (link.from === link.to) {
    const x = from.x + from.width, rail = Math.min(layout.width - 2, x + 14)
    candidates.push([point(x, from.y + from.height * .7), point(rail, from.y + from.height * .7), point(rail, from.y + from.height * .3), point(x, from.y + from.height * .3)])
  } else if (from.y === to.y) {
    const right = to.x > from.x
    candidates.push([point(right ? from.x + from.width : from.x, centerY(from)), point(right ? to.x : to.x + to.width, centerY(to))])
  } else if (link.inside && to.y < from.y) {
    const startX = from.x + from.width * .72, endX = to.x + to.width * .26, corridor = (from.y + bottom(to)) / 2
    candidates.push([point(startX, from.y), point(startX, corridor), point(endX, corridor), point(endX, bottom(to))])
  } else if (to.y > from.y) {
    // A long sideways branch can use the empty column below its source and
    // meet the destination from below, leaving the short central routes clear.
    if (layout.width >= 560 && Math.abs(tx - centerX(from)) > from.width * 2) {
      const rail = layout.height - 18
      candidates.push([point(sx, bottom(from)), point(sx, rail), point(tx, rail), point(tx, bottom(to))])
    }
    if (Math.abs(tx - centerX(from)) < .001) candidates.push([point(tx, bottom(from)), point(tx, to.y)])
    if (layout.width >= 560 && to.x > from.x && to.y - from.y <= 108) {
      candidates.push([point(sx, bottom(from)), point(sx, centerY(to)), point(to.x, centerY(to))])
    }
    const corridor = (bottom(from) + to.y) / 2
    candidates.push([point(sx, bottom(from)), point(sx, corridor), point(tx, corridor), point(tx, to.y)])
  }
  // Global side rails lie outside every column. Horizontal legs sit in the
  // row gaps, which also handles backward edges and non-adjacent same-row links.
  const inset = Math.min(6 + index % 3 * 4, Math.min(...boxes.map(box => box.x)) / 2)
  const rails = link.to > link.from ? [layout.width - inset, inset] : [inset, layout.width - inset]
  for (const rail of rails) {
    const startY = bottom(from) + 10, endY = to.y - 10
    candidates.push([point(sx, bottom(from)), point(sx, startY), point(rail, startY), point(rail, endY), point(tx, endY), point(tx, to.y)])
  }
  const points = candidates.find(candidate => clearRoute(candidate, boxes))!
  const round = (value: number) => Number(value.toFixed(3))
  const d = points.map((p, i) => `${i ? 'L' : 'M'} ${round(p.x)} ${round(p.y)}`).join(' ')
  return { d, ...(link.inside ? { join: points[points.length - 1] } : {}) }
}
