import test from 'node:test'
import assert from 'node:assert/strict'
import iced from 'iced-x86'
import { readPE, type NativeContext } from '../src/lib/nativeAnalysis.ts'
import { decodeNativeSectionGraph, layoutSectionGraph, sectionConnections, sectionConnectionPath, GRAPH_LIMITS, type NativeSectionGraph, type SectionGraphLayout } from '../src/lib/nativeSectionGraph.ts'

function fixture(ranges: [number, number][], programs: [number, number[]][], names: [number, string[]][] = [[0x1000, ['Example.Main()']], [0x1020, ['Example.Helper()']]]): NativeContext {
  const dll = new ArrayBuffer(0x3000), v = new DataView(dll), bytes = new Uint8Array(dll)
  const u16 = (p: number, n: number) => v.setUint16(p, n, true), u32 = (p: number, n: number) => v.setUint32(p, n, true)
  u16(0, 0x5A4D); u32(60, 0x80); u32(0x80, 0x4550); u16(0x84, 0x8664); u16(0x86, 2); u16(0x94, 240)
  const opt = 0x98; u16(opt, 0x20B); v.setBigUint64(opt + 24, 0x180000000n, true)
  u32(opt + 108, 16); u32(opt + 136, 0x4000); u32(opt + 140, ranges.length * 12)
  for (const [i, rva, raw, size, flags] of [[0, 0x1000, 0x400, 0x1000, 0x60000020], [1, 0x4000, 0x2000, 0x1000, 0x40000040]]) {
    const p = opt + 240 + i * 40; u32(p + 12, rva); u32(p + 16, size); u32(p + 20, raw); u32(p + 36, flags)
  }
  ranges.forEach(([start, end], i) => { u32(0x2000 + i * 12, start); u32(0x2004 + i * 12, end) })
  programs.forEach(([rva, code]) => bytes.set(code, rva - 0x1000 + 0x400))
  return { pe: readPE(dll), symbols: new Map(names), methods: [], modules: [] }
}

test('follows both branch outcomes, keeps middle-of-range joins, and does not inline calls or decode past a return', () => {
  const context = fixture([[0x1000, 0x1004], [0x1004, 0x100A], [0x1010, 0x1016], [0x1020, 0x1021]], [
    [0x1000, [0x85, 0xC0, 0x74, 0x0C]],
    [0x1004, [0xE8, 0x17, 0, 0, 0, 0xC3]],
    [0x1010, [0xE9, 0xF4, 0xFF, 0xFF, 0xFF, 0xCC]],
    [0x1020, [0xC3]],
  ])
  const graph = decodeNativeSectionGraph(context, 0x1000, iced)
  assert.deepEqual(graph.nodes.map(n => n.start), [0x1000, 0x1004, 0x1010])
  assert.deepEqual(graph.edges.filter(e => e.from === 0x1000).map(e => [e.label, e.to]), [['0以外なら', 0x1004], ['0なら', 0x1010]])
  assert.deepEqual(graph.nodes[1].calls, ['Example.Helper()'])
  assert.equal(graph.nodes[2].reached, 1)
  assert.equal(graph.edges.some(e => e.kind === 'interrupt'), false)
  const join = sectionConnections(graph).find(e => e.from === 0x1010)!
  assert.equal(join.to, 0x1004); assert.equal(join.inside, true); assert.equal(join.edges[0].target, 0x1009)
  assert.match(join.label, /途中/)
})

test('loops terminate, while indirect transfers and other named methods remain explicit exits', () => {
  const loop = decodeNativeSectionGraph(fixture([[0x1000, 0x1006]], [[0x1000, [0x83, 0xF8, 1, 0x75, 0xFB, 0xC3]]]), 0x1000, iced)
  assert.equal(loop.nodes.length, 1); assert.equal(loop.nodes[0].reached, 3)
  assert.ok(loop.edges.some(e => e.to === e.from))
  assert.ok(loop.edges.some(e => e.kind === 'return'))
  const indirect = decodeNativeSectionGraph(fixture([[0x1000, 0x1002]], [[0x1000, [0xFF, 0xE0]]]), 0x1000, iced)
  assert.equal(indirect.edges[0].kind, 'unknown'); assert.equal(indirect.edges[0].target, undefined)
  const external = decodeNativeSectionGraph(fixture([[0x1000, 0x1002], [0x1020, 0x1021]], [[0x1000, [0xEB, 0x1E]], [0x1020, [0xC3]]]), 0x1000, iced)
  assert.equal(external.nodes.length, 1); assert.equal(external.edges[0].target, 0x1020)
  assert.equal(external.edges[0].to, undefined); assert.equal(external.edges[0].boundary, 'この図の範囲外')
})

test('missing or invalid instruction boundaries never become invented graph nodes', () => {
  const missing = decodeNativeSectionGraph(fixture([], [[0x1000, [0xC3]]]), 0x1000, iced)
  assert.equal(missing.nodes.length, 0); assert.match(missing.warnings[0], /境界/)
  const invalid = decodeNativeSectionGraph(fixture([[0x1000, 0x1005]], [[0x1000, [0x85, 0xC0, 0x74, 0xFD, 0xC3]]]), 0x1000, iced)
  assert.ok(invalid.edges.some(e => e.target === 0x1001 && e.boundary === '命令境界が未特定'))
})

test('large graphs stop at the section budget with a usable exit, and layout keeps every box in bounds', () => {
  const ranges: [number, number][] = [], programs: [number, number[]][] = []
  for (let n = 0; n < GRAPH_LIMITS.sections + 5; n++) { ranges.push([0x1000 + n * 2, 0x1002 + n * 2]); programs.push([0x1000 + n * 2, [0x90, 0x90]]) }
  const graph = decodeNativeSectionGraph(fixture(ranges, programs, [[0x1000, ['Example.Large()']]]), 0x1000, iced)
  assert.equal(graph.nodes.length, GRAPH_LIMITS.sections)
  assert.ok(graph.edges.some(e => e.boundary === '表示上限'))
  assert.ok(graph.warnings.length)
  const layout = layoutSectionGraph(graph, 320)
  assert.equal(layout.positions.size, graph.nodes.length)
  for (const box of layout.positions.values()) {
    assert.ok(box.x >= 0 && box.y >= 0)
    assert.ok(box.x + box.width <= layout.width && box.y + box.height <= layout.height)
  }
})

function diagram(count: number, connections: [number, number, boolean?][]): NativeSectionGraph {
  const start = (id: number) => 0x2000 + id * 0x100
  return {
    entry: start(1), names: [], warnings: [],
    nodes: Array.from({ length: count }, (_, i) => ({
      id: i + 1, start: start(i + 1), end: start(i + 1) + 0x80,
      body: { rva: start(i + 1), offset: 0, names: [], range: '', warnings: [], instructions: [] },
      entries: [start(i + 1)], calls: [], callCount: 0, reached: 1,
    })),
    edges: connections.map(([from, to, inside]) => ({
      from: start(from), at: start(from) + 8, to: start(to), target: start(to) + (inside ? 0x20 : 0), kind: 'branch', label: '条件成立',
    })),
  }
}

const compactExample = () => diagram(7, [[1, 2], [1, 6], [2, 3], [2, 5], [2, 7], [3, 4], [3, 5], [4, 7], [5, 4, true], [5, 7]])

function checkGeometry(layout: SectionGraphLayout, count: number, width: number) {
  const boxes = [...layout.positions.values()], epsilon = .002
  assert.equal(layout.width, width, 'the graph fits its host instead of creating horizontal overflow')
  assert.equal(boxes.length, count)
  boxes.forEach((box, i) => {
    assert.equal(box.height, 44)
    assert.ok(box.width > 0 && box.x >= 0 && box.y >= 0)
    assert.ok(box.x + box.width <= width + epsilon && box.y + box.height <= layout.height)
    for (const other of boxes.slice(i + 1)) assert.ok(box.x + box.width <= other.x + epsilon || other.x + other.width <= box.x + epsilon
      || box.y + box.height <= other.y + epsilon || other.y + other.height <= box.y + epsilon, 'boxes must not overlap')
  })
  layout.links.forEach((link, index) => {
    const route = sectionConnectionPath(layout, link, index)
    const points = [...route.d.matchAll(/[ML] ([\d.-]+) ([\d.-]+)/g)].map(match => ({ x: Number(match[1]), y: Number(match[2]) }))
    assert.ok(points.length >= 2, 'every connection must retain a drawable path')
    assert.equal(!!route.join, link.inside)
    points.forEach((p, i) => {
      assert.ok(p.x >= -epsilon && p.y >= 0 && p.x <= width + epsilon && p.y <= layout.height, 'routes stay inside the canvas')
      if (!i) return
      const previous = points[i - 1]
      assert.ok(Math.abs(p.x - previous.x) < epsilon || Math.abs(p.y - previous.y) < epsilon)
      for (const box of boxes) {
        const vertical = Math.abs(p.x - previous.x) < epsilon
        const crossesBox = vertical
          ? p.x > box.x + epsilon && p.x < box.x + box.width - epsilon && Math.max(p.y, previous.y) > box.y + epsilon && Math.min(p.y, previous.y) < box.y + box.height - epsilon
          : p.y > box.y + epsilon && p.y < box.y + box.height - epsilon && Math.max(p.x, previous.x) > box.x + epsilon && Math.min(p.x, previous.x) < box.x + box.width - epsilon
        assert.equal(crossesBox, false, `connection ${link.from} → ${link.to} must not pass through a box`)
      }
    })
    const source = layout.positions.get(link.from)!, destination = layout.positions.get(link.to)!
    const onBoundary = (p: { x: number; y: number }, box: typeof source) => p.x >= box.x - epsilon && p.x <= box.x + box.width + epsilon
      && p.y >= box.y - epsilon && p.y <= box.y + box.height + epsilon
      && [Math.abs(p.x - box.x), Math.abs(p.x - box.x - box.width), Math.abs(p.y - box.y), Math.abs(p.y - box.y - box.height)].some(distance => distance < epsilon)
    assert.ok(onBoundary(points[0], source), 'the path starts at its source')
    assert.ok(onBoundary(points.at(-1)!, destination), 'the arrow ends at its actual destination')
  })
}

test('compact wide graph follows the chain across four columns and keeps all seven sections in two rows', () => {
  const graph = compactExample(), layout = layoutSectionGraph(graph, 680)
  checkGeometry(layout, 7, 680)
  const row = (y: number) => graph.nodes.filter(node => layout.positions.get(node.start)!.y === y)
    .sort((a, b) => layout.positions.get(a.start)!.x - layout.positions.get(b.start)!.x).map(node => node.id)
  assert.deepEqual(row(22), [1, 2, 3, 4])
  assert.deepEqual(row(130), [6, 5, 7])
  assert.equal(layout.positions.get(graph.nodes[4].start)!.x, layout.positions.get(graph.nodes[2].start)!.x)
  assert.equal(layout.height, 216)
  assert.equal(layout.links.length, 10)
  const longLink = layout.links.find(link => link.from === graph.nodes[1].start && link.to === graph.nodes[6].start)!
  const route = sectionConnectionPath(layout, longLink, layout.links.indexOf(longLink))
  assert.match(route.d, /198/, 'the long branch uses the rail below all boxes')
  const interior = layout.links.find(link => link.inside)!, target = layout.positions.get(interior.to)!
  const join = sectionConnectionPath(layout, interior, layout.links.indexOf(interior)).join!
  assert.equal(join.y, target.y + target.height, 'the backward interior link meets the bottom of its target')
  assert.deepEqual(interior.edges.map(edge => edge.target), [graph.nodes[3].start + 0x20], 'exact interior addresses survive the layout')
})

test('narrow graphs use compact ranks and wrap crowded ranks without clipping sections or connections', () => {
  for (const width of [320, 288, 220, 560]) checkGeometry(layoutSectionGraph(compactExample(), width), 7, width)
  const narrow = layoutSectionGraph(compactExample(), 320)
  assert.equal(narrow.height, 408)
  assert.equal(new Set([...narrow.positions.values()].map(box => box.y)).size, 5)
  const crowded = diagram(32, Array.from({ length: 31 }, (_, i): [number, number] => [1, i + 2]))
  for (const width of [320, 220, 560, 1200]) checkGeometry(layoutSectionGraph(crowded, width), 32, width)
})

test('backward, self-loop, non-adjacent and interior connections remain drawable around arbitrary section boxes', () => {
  const connections: [number, number, boolean?][] = []
  for (let id = 1; id <= 32; id++) {
    if (id < 32) connections.push([id, id + 1])
    if (id > 3) connections.push([id, id - 3, true])
    if (id + 4 <= 32) connections.push([id, id + 4])
    connections.push([id, id])
  }
  const graph = diagram(32, connections)
  graph.nodes.reverse()
  for (const width of [320, 560, 736]) checkGeometry(layoutSectionGraph(graph, width), 32, width)
})
