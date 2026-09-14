import type { NativeBody, NativeInstruction } from './nativeAnalysis.ts'

export type NativeFlowKind = 'next' | 'call' | 'indirect-call' | 'branch' | 'jump' | 'indirect-jump' | 'return' | 'interrupt' | 'unknown'
export type FlowEdge = { label: string; target?: number; block?: number; follow: boolean }
export type FlowBlock = { id: number; start: number; last: number; count: number; action: string; names: string[]; edges: FlowEdge[]; kind: NativeFlowKind; evidence: string[]; calls: number }
const hex = (n: number) => `0x${n.toString(16).toUpperCase()}`

function smallNumber(operand: string | undefined): string | undefined {
  if (!operand || !/^(?:[0-9]+|[0-9][0-9a-f]*h)$/i.test(operand)) return undefined
  const value = operand.endsWith('h') ? parseInt(operand.slice(0, -1), 16) : Number(operand)
  return value <= 1000 ? String(value) : undefined
}

// Only describe a comparison when the branch's ZF still comes from that
// comparison. Do not trace across calls, incoming paths, or missing facts.
function comparisonSummary(instructions: NativeInstruction[]) {
  const branch = instructions.at(-1)!, operation = branch.facts?.operation
  if (operation !== 'je' && operation !== 'jne') return undefined
  for (let n = instructions.length - 2; n >= 0; n--) {
    const ins = instructions[n], facts = ins.facts
    if (!facts || ins.flow !== 'next') return undefined
    if (!facts.writesZeroFlag) continue
    const [a, b] = facts.operands
    let action: string, yes: string, no: string
    if (facts.operation === 'test' && a && a === b) {
      action = '値が0か確かめる'; yes = '0なら'; no = '0以外なら'
    } else if (facts.operation === 'cmp' && a && b) {
      const number = smallNumber(b)
      action = number !== undefined ? `値が${number}か確かめる` : '2つの値が同じか確かめる'
      yes = number !== undefined ? `${number}なら` : '同じなら'
      no = number !== undefined ? `${number}以外なら` : '異なるなら'
    } else return undefined
    return { action, taken: operation === 'je' ? yes : no, other: operation === 'je' ? no : yes,
      evidence: [`比較した命令：${ins.text}`, `進む先を決める命令：${branch.text}`, 'この値がゲーム内で何を表すかは未特定です。'] }
  }
  return undefined
}

function callAction(names: string[], count = 1) {
  const short = [...new Set(names.map(name => name.split('(')[0].split('.').at(-1)))]
  const subject = !names.length ? '名前不明の処理' : short.length === 1 ? `「${short[0]}」` : '複数の名前が対応する処理'
  return `${subject}を${count > 1 ? `${count}回` : ''}呼ぶ`
}

// Segment the decoded window only. Calls end a summary block but are not
// inlined; a continuation after a call is conditional on that call returning.
export function generateNativeFlow(body: NativeBody, entryPoints: number[] = []): FlowBlock[] {
  const instructions = body.instructions
  if (!instructions.length) return []
  const positions = new Map(instructions.map((ins, index) => [ins.rva, index]))
  const starts = new Set([0])
  for (const rva of entryPoints) { const index = positions.get(rva); if (index !== undefined) starts.add(index) }
  instructions.forEach((ins, index) => {
    if (ins.flow !== 'next' && index + 1 < instructions.length) starts.add(index + 1)
    if (ins.target !== undefined && ['branch', 'jump', 'call'].includes(ins.flow)) {
      const destination = positions.get(ins.target)
      if (destination !== undefined) starts.add(destination)
    }
  })
  const boundaries = [...starts].sort((a, b) => a - b)
  const ids = new Map(boundaries.map((start, i) => [instructions[start].rva, i + 1]))
  const edge = (label: string, target?: number, follow = false): FlowEdge => ({ label, target, block: target === undefined ? undefined : ids.get(target), follow })
  return boundaries.map((start, index) => {
    const end = boundaries[index + 1] ?? instructions.length
    const last: NativeInstruction = instructions[end - 1]
    const next = instructions[end]?.rva ?? body.nextRva
    const resume = (label: string) => edge(next === undefined ? `${label}：続き未確認` : label, next, next !== undefined)
    let action: string, edges: FlowEdge[]
    let evidence = [`最後の命令：${last.text}`]
    switch (last.flow) {
      case 'branch': {
        const comparison = comparisonSummary(instructions.slice(start, end))
        action = comparison?.action ?? '条件を確かめる（内容は未特定）'
        if (comparison) evidence = comparison.evidence
        edges = [edge(comparison?.taken ?? '条件成立', last.target, last.follow), resume(comparison?.other ?? '条件不成立')]; break
      }
      case 'jump':
        action = '別の箇所へ進む'
        edges = [edge('移動先', last.target, last.follow)]; break
      case 'call':
        action = callAction(last.names)
        evidence = [...last.names.map(name => `対応する名前：${name}`), `呼び出し命令：${last.text}`, '呼び出し前の値の準備なども、この行に含みます。']
        edges = [edge('呼び出し先', last.target, last.follow), resume('戻ってきた場合')]; break
      case 'indirect-call':
        action = '実行時に選ばれる処理を呼ぶ'
        edges = [edge('呼び出し先は未特定'), resume('戻ってきた場合')]; break
      case 'indirect-jump':
        action = '実行時に選ばれる箇所へ進む'
        edges = [edge('移動先は未特定')]; break
      case 'return':
        action = 'この処理を終えて、呼び出し元へ戻る'
        edges = [edge('この経路を終了')]; break
      case 'interrupt':
        action = '処理を中断する'
        edges = [edge('その後の経路は未確認')]; break
      case 'unknown':
        action = '動作をまだ説明できない'
        edges = [edge('進む先は未確認')]; break
      default: {
        const single = end - start === 1 ? last.facts : undefined
        const number = single?.operation === 'mov' ? smallNumber(single.operands[1]) : undefined
        action = number !== undefined ? `${number}という値を保存する` : '値の読み書き・計算などを行う'
        edges = [resume('次へ')]
      }
    }
    return { id: index + 1, start: instructions[start].rva, last: last.rva, count: end - start, action, names: last.flow === 'call' ? last.names : [], edges, kind: last.flow, evidence, calls: last.flow === 'call' ? 1 : 0 }
  })
}

// Combine repeated calls only along an exclusive fall-through chain. An
// independently targeted block must remain visible as its own entry point.
export function summarizeNativeFlow(body: NativeBody): FlowBlock[] {
  const blocks = generateNativeFlow(body)
  const incoming = new Map<number, number>()
  for (const block of blocks) for (const edge of block.edges) {
    if (edge.block !== undefined) incoming.set(edge.block, (incoming.get(edge.block) ?? 0) + 1)
  }
  const result: FlowBlock[] = [], remap = new Map<number, number>()
  for (const block of blocks) {
    const previous = result.at(-1)
    if (previous?.kind === 'call' && block.kind === 'call' && previous.edges[0].target !== undefined
      && previous.edges[0].target === block.edges[0].target && previous.edges[1].block === block.id
      && incoming.get(block.id) === 1 && previous.names.join('\n') === block.names.join('\n')) {
      previous.calls += block.calls; previous.last = block.last; previous.count += block.count
      previous.edges = block.edges; previous.action = callAction(previous.names, previous.calls)
      previous.evidence = [...previous.names.map(name => `対応する名前：${name}`), `同じ呼び出し先へ${previous.calls}回。各呼び出しの引数や、その間の値の準備は異なる場合があります。`]
      remap.set(block.id, previous.id)
    } else {
      const copy = { ...block, id: result.length + 1, edges: block.edges.map(edge => ({ ...edge })) }
      result.push(copy); remap.set(block.id, copy.id)
    }
  }
  return result.map(block => ({ ...block, edges: block.edges.map(edge => ({ ...edge, block: edge.block === undefined ? undefined : remap.get(edge.block) })) }))
}

export function flowEdgeDestination(edge: FlowEdge) {
  return edge.block !== undefined ? `まとまり ${edge.block}` : edge.target !== undefined ? `表示外 ${hex(edge.target)}` : ''
}

export function formatNativeFlow(body: NativeBody) {
  const blocks = summarizeNativeFlow(body)
  return ['表示中の区間の流れ（自動生成）', '命令の配置と分岐先から生成。処理全体やゲーム上の役割を確定した説明ではありません。',
    'まとまり\t先頭RVA\t末尾命令RVA\t命令数\t動作\t呼び出す処理名\t進む先',
    ...blocks.map(b => [b.id, hex(b.start), hex(b.last), b.count, b.action, b.names.join(' / '), b.edges.map(e => `${e.label}${e.target !== undefined ? ` → ${flowEdgeDestination(e)}` : ''}`).join(' / ')].join('\t'))].join('\r\n')
}
