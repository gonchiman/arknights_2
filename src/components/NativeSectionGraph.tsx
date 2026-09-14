import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { address } from '../lib/nativeAnalysis'
import { layoutSectionGraph, sectionConnectionPath, type NativeSectionGraph as Graph, type SectionGraphEdge } from '../lib/nativeSectionGraph'
import './NativeSectionGraph.css'

const shortName = (name: string) => name.includes('(') ? name.split('(')[0].split('.').at(-1)! : name

export function NativeSectionGraph({ graph, current, busy, onSelect, renderDetails }: { graph: Graph; current: number; busy: boolean; onSelect: (rva: number) => void; renderDetails: (conditions: ReactNode) => ReactNode }) {
  const host = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(680)
  const marker = useId().replace(/:/g, '')
  useEffect(() => {
    const element = host.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width > 0) setWidth(entry.contentRect.width) })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const layout = useMemo(() => layoutSectionGraph(graph, width), [graph, width])
  const selected = graph.nodes.find(n => current >= n.start && current < n.end)
  const selectedEdges = graph.edges.filter(e => e.from === selected?.start)
  const destinations = [...new Map(selectedEdges.map(edge => {
    const key = `${edge.kind}:${edge.target}:${edge.label}`
    return [key, { edge, matching: selectedEdges.filter(e => e.kind === edge.kind && e.target === edge.target && e.label === edge.label) }]
  })).values()]
  const targets = [...new Map(selectedEdges.map(edge => [
    `${edge.to}:${edge.target}:${edge.boundary}:${edge.target === undefined ? edge.label : ''}`, edge,
  ])).values()]
  const byStart = new Map(graph.nodes.map(n => [n.start, n]))
  const knownNames = selected?.calls.filter(name => !name.startsWith('名前未特定') && !name.startsWith('間接呼出し')) || []
  const callExamples = knownNames.slice(-2).map(shortName)
  function selectDestination(rva: number) {
    onSelect(rva)
    const destination = graph.nodes.find(node => rva >= node.start && rva < node.end)
    if (destination) host.current?.querySelector<HTMLButtonElement>(`[data-section-start="${destination.start}"]`)?.focus({ preventScroll: true })
  }
  function destinationText(edge: SectionGraphEdge, includeAddress = false) {
    const destination = edge.to === undefined ? undefined : byStart.get(edge.to)
    return destination ? `区間${destination.id}${edge.target !== destination.start ? `の途中${includeAddress ? ` ${address(edge.target!)}` : ''}` : ''}`
      : edge.target !== undefined ? `${edge.boundary === 'この図の範囲外' ? '図の外へ' : edge.boundary || '図の外'} ${address(edge.target)}` : edge.label
  }
  function destinationLink(edge: SectionGraphEdge, includeAddress = false) {
    const text = destinationText(edge, includeAddress)
    return edge.target === undefined ? <span>{text}</span> : <button type="button" className="native-link" title={address(edge.target)} aria-label={`${destinationText(edge, true)}の命令を見る`} disabled={busy || edge.boundary === '実行領域外' || edge.boundary === '命令境界が未特定'} onClick={() => selectDestination(edge.target!)}>{text}</button>
  }
  if (!graph.nodes.length) return <><p className="code-analysis-note">{graph.warnings.join(' ') || '区間を図にできませんでした。'}</p>{renderDetails(null)}</>
  const conditions = selected ? <>
    <h3 className="gg-table-title">移動条件 · 区間{selected.id}</h3>
    <div className="native-section-destinations">{destinations.length ? destinations.map(({ edge, matching }, i) => <div key={`${edge.at}-${i}`} className="native-section-destination" title={`元の命令：${matching.map(e => address(e.at)).join(' / ')}`}>
      {edge.label}{matching.length > 1 ? `（${matching.length}箇所）` : ''}{edge.target !== undefined && <> → {destinationLink(edge, true)}</>}
    </div>) : <span>読み取れませんでした。</span>}</div>
  </> : null
  return <section className="native-section-graph" aria-label="区間のフロー図">
    <div ref={host} className="native-section-scroll" role="group" aria-label="区間のフロー図。箱を選ぶと命令を表示">
      <div className="native-section-canvas" style={{ width: layout.width, height: layout.height }}>
        <svg className="native-section-lines" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} aria-hidden="true">
          <defs>{['normal', 'active'].map(kind => <marker key={kind} id={`${marker}-${kind}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path className={`native-section-arrow ${kind}`} d="M1 1 L7 4 L1 7 Z" /></marker>)}</defs>
          {layout.links.map((link, i) => {
            const geometry = sectionConnectionPath(layout, link, i), active = link.from === selected?.start || link.to === selected?.start
            return <g key={`${link.from}-${link.to}-${link.inside}`} className={active ? 'is-active' : undefined}>
              <path d={geometry.d} className={`native-section-route${link.inside ? ' is-interior' : ''}`} markerEnd={`url(#${marker}-${active ? 'active' : 'normal'})`} />
              {active && geometry.join && <circle cx={geometry.join.x} cy={geometry.join.y} r="3" className="native-section-entry" />}
            </g>
          })}
        </svg>
        {graph.nodes.map(node => {
          const position = layout.positions.get(node.start)!
          return <button type="button" key={node.start} data-section-start={node.start} style={{ left: position.x, top: position.y, width: position.width, height: position.height }} className="native-section-node" aria-pressed={selected?.start === node.start} aria-label={`区間${node.id}の命令を見る`} title={`${address(node.start)}〜${address(node.end)}（終端を含まない）\n${node.calls.join('\n')}`} disabled={busy} onClick={() => onSelect(node.start)}>
            区間{node.id}
          </button>
        })}
      </div>
    </div>
    <div className="native-section-sidebar">
    {selected && <div className="native-section-selection" aria-live="polite">
      <div className="native-section-selection-heading"><strong>区間{selected.id}全体</strong><span>{selected.body.instructions.length}命令 · 呼出し {selected.callCount}件</span></div>
      {current !== selected.start && <div className="native-section-position">選択位置 {address(current)}</div>}
      <div className="native-section-call" title={selected.calls.join('\n')}>{callExamples.length ? `呼出し例：${callExamples.join(' / ')}` : selected.callCount ? '呼び出し先の名前は未特定' : '呼出しなし'}</div>
      <div className="native-section-targets"><span>移動先：</span>{targets.length ? targets.map((edge, i) => <span className="native-section-destination" key={i}>{destinationLink(edge)}</span>) : <span>読み取れませんでした。</span>}</div>
    </div>}
    {renderDetails(conditions)}
    </div>
    {(graph.warnings.length > 0) && <p className="code-analysis-note native-section-warning" role="status">{graph.warnings.join(' ')}</p>}
  </section>
}
