import test from 'node:test'
import assert from 'node:assert/strict'
import { generateNativeFlow, summarizeNativeFlow, formatNativeFlow, type NativeFlowKind } from '../src/lib/nativeFlow.ts'
import type { NativeBody, NativeInstruction } from '../src/lib/nativeAnalysis.ts'

const ins = (rva: number, flow: NativeFlowKind = 'next', target?: number, follow = false): NativeInstruction => ({ rva, flow, target, follow, offset: rva, bytes: '90', text: 'instruction', meaning: '', kind: '操作', names: [] })
const body = (instructions: NativeInstruction[], nextRva?: number): NativeBody => ({ rva: instructions[0]?.rva ?? 0, offset: 0, names: [], warnings: [], range: '', instructions, nextRva })

test('forward and backward branches split at destination boundaries without flattening both paths', () => {
  const flow = generateNativeFlow(body([ins(100), ins(101), ins(102, 'branch', 106), ins(103), ins(104, 'jump', 101), ins(106, 'return')]))
  assert.deepEqual(flow.map(b => [b.start, b.last]), [[100, 100], [101, 102], [103, 104], [106, 106]])
  assert.deepEqual(flow[1].edges.map(e => [e.label, e.block]), [['条件成立', 4], ['条件不成立', 3]])
  assert.equal(flow[2].edges[0].block, 2)
  assert.equal(flow[3].edges[0].target, undefined)
})

test('calls retain symbol aliases and have a conditional return continuation', () => {
  const call = { ...ins(102, 'call', 500, true), names: ['Example.DicePRD()', 'Alias.Shared()'] }
  const flow = generateNativeFlow(body([ins(100), call, ins(103, 'return'), ins(104)]))
  assert.equal(flow[0].count, 2)
  assert.deepEqual(flow[0].names, call.names)
  assert.deepEqual(flow[0].edges.map(e => [e.label, e.target, e.block]), [['呼び出し先', 500, undefined], ['戻ってきた場合', 103, 2]])
  assert.equal(flow[1].edges[0].target, undefined, 'return must not fall through into the following block')
  assert.match(flow[2].edges[0].label, /続き未確認/)
})

test('indirect transfers, interrupts and unsupported control flow do not invent targets', () => {
  for (const kind of ['indirect-jump', 'interrupt', 'unknown'] as const) {
    const flow = generateNativeFlow(body([ins(100, kind), ins(101)]))
    assert.equal(flow[0].edges.length, 1)
    assert.equal(flow[0].edges[0].target, undefined)
  }
  const flow = generateNativeFlow(body([ins(100, 'indirect-call'), ins(101)]))
  assert.equal(flow[0].edges[0].target, undefined)
  assert.equal(flow[0].edges[1].block, 2)
})

test('window limits and non-instruction branch targets stay unconfirmed', () => {
  const truncated = generateNativeFlow(body([ins(100)]))
  assert.match(truncated[0].edges[0].label, /続き未確認/)
  const continued = generateNativeFlow(body([ins(100)], 105))
  assert.equal(continued[0].edges[0].target, 105)
  assert.equal(continued[0].edges[0].follow, true)
  const unaligned = generateNativeFlow(body([ins(100, 'branch', 102), ins(105)]))
  assert.equal(unaligned[0].edges[0].block, undefined)
  assert.equal(unaligned[0].edges[0].follow, false)
  assert.deepEqual(generateNativeFlow(body([])), [])
})

test('export includes the complete flow and identifies the automatic, partial scope', () => {
  const sample = body(Array.from({ length: 150 }, (_, i) => ins(i, 'call', 1000 + i, true)))
  assert.equal(generateNativeFlow(sample).length, 150)
  const text = formatNativeFlow(sample)
  assert.match(text, /表示中の区間の流れ（自動生成）/)
  assert.match(text, /ゲーム上の役割を確定した説明ではありません/)
  assert.match(text, /150\t0x95/)
  assert.doesNotMatch(text, /自爆|敵HP/)
})

const decoded = (rva: number, operation: string, operands: string[], writesZeroFlag = false, flow: NativeFlowKind = 'next', target?: number): NativeInstruction => ({
  ...ins(rva, flow, target), text: `${operation} ${operands.join(',')}`, facts: { operation, operands, writesZeroFlag },
})

test('zero and equality checks explain both outcomes from the actual flag producer', () => {
  const flow = generateNativeFlow(body([
    decoded(100, 'cmp', ['byte [rel 123h]', '0'], true), decoded(101, 'mov', ['rbx', 'rcx']), decoded(102, 'jne', ['200'], false, 'branch', 200),
    decoded(103, 'cmp', ['eax', '1'], true), decoded(104, 'je', ['200'], false, 'branch', 200), ins(200, 'return'),
  ]))
  assert.equal(flow[0].action, '値が0か確かめる')
  assert.deepEqual(flow[0].edges.map(e => e.label), ['0以外なら', '0なら'])
  assert.equal(flow[1].action, '値が1か確かめる')
  assert.deepEqual(flow[1].edges.map(e => e.label), ['1なら', '1以外なら'])
  assert.match(flow[0].evidence[0], /byte \[rel 123h\]/)
  assert.doesNotMatch(flow[0].action, /敵|HP|初期化/)
  const same = generateNativeFlow(body([decoded(1, 'test', ['rax', 'rax'], true), decoded(2, 'je', ['10'], false, 'branch', 10)]))
  assert.equal(same[0].action, '値が0か確かめる')
})

test('comparison interpretation stops at flag changes, calls and new entry points', () => {
  for (const barrier of [decoded(2, 'add', ['rax', '1'], true), ins(2), decoded(2, 'call', ['100'], false, 'call', 100)]) {
    const flow = generateNativeFlow(body([decoded(1, 'cmp', ['eax', '0'], true), barrier, decoded(3, 'jne', ['20'], false, 'branch', 20)]))
    assert.match(flow.at(-1)!.action, /内容は未特定/)
  }
  const joined = generateNativeFlow(body([ins(1, 'branch', 4), decoded(2, 'cmp', ['eax', '0'], true), decoded(4, 'jne', ['20'], false, 'branch', 20)]))
  assert.match(joined.at(-1)!.action, /内容は未特定/)
  const bitmask = generateNativeFlow(body([decoded(1, 'test', ['eax', '2'], true), decoded(2, 'je', ['20'], false, 'branch', 20)]))
  assert.match(bitmask[0].action, /内容は未特定/)
})

test('repeated calls collapse while preserving branch destinations, coverage and conditional continuation', () => {
  const sample = body([ins(100, 'branch', 106), ins(101, 'call', 500, true), ins(102), ins(103, 'call', 500, true), ins(104, 'call', 500, true), ins(105), ins(106, 'return')])
  const short = summarizeNativeFlow(sample)
  assert.equal(short.length, 4)
  assert.equal(short[1].action, '名前不明の処理を3回呼ぶ')
  assert.equal(short[1].count, 4)
  assert.equal(short[1].last, 104)
  assert.deepEqual(short[0].edges.map(e => e.block), [4, 2])
  assert.equal(short[1].edges[1].block, 3)
  assert.equal(short.reduce((count, block) => count + block.count, 0), sample.instructions.length)
  assert.match(formatNativeFlow(sample), /3回呼ぶ/)
  const multipleEntry = summarizeNativeFlow(body([ins(100, 'branch', 103), ins(101, 'call', 500), ins(102), ins(103, 'call', 500), ins(104, 'return')]))
  assert.equal(multipleEntry.length, 5, 'the independently targeted second call must stay separate')
})
