import { useEffect, useMemo, useRef, useState } from 'react'
import { address, type NativeBody } from '../lib/nativeAnalysis'
import { summarizeNativeFlow } from '../lib/nativeFlow'

const PAGE_SIZE = 50

export function NativeFlowTable({ body, onInspect, onFollow, busy }: { body: NativeBody; onInspect: (rva: number) => void; onFollow: (rva: number) => void; busy: boolean }) {
  const blocks = useMemo(() => summarizeNativeFlow(body), [body])
  const [page, setPage] = useState(0)
  const [active, setActive] = useState<number | null>(null)
  const selected = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (active !== null) { selected.current?.focus(); selected.current?.scrollIntoView({ block: 'nearest' }) }
  }, [active, page])
  function goToBlock(id: number) { setPage(Math.floor((id - 1) / PAGE_SIZE)); setActive(id) }
  return <>
    <h3 id="native-auto-flow-title" className="gg-table-title">表示中の区間の流れ（自動生成）</h3>
    <div className="ggs-grid-scroll native-flow-scroll"><table className="ggs-grid-table native-flow-table" aria-labelledby="native-auto-flow-title">
      <thead><tr><th scope="col">番号</th><th scope="col">何をするか</th><th scope="col">次の動き</th></tr></thead>
      <tbody>{blocks.length ? blocks.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(block => <tr key={block.start} aria-current={active === block.id ? 'true' : undefined}>
        <th scope="row"><button ref={active === block.id ? selected : undefined} type="button" className="native-link" aria-label={`${block.id}の命令を見る`} title={`${address(block.start)}〜${address(block.last)}（末尾命令）、${block.count}命令。押すと命令一覧へ移動`} onClick={() => onInspect(block.start)}>{block.id} ›</button></th>
        <td><details className="native-flow-evidence"><summary>{block.action}</summary>{block.evidence.map((text, index) => <p key={index}>{text}</p>)}</details></td>
        <td>{block.edges.map((edge, i) => <div key={i} className="native-flow-edge">{edge.label}{edge.target !== undefined && <> → {edge.block !== undefined
          ? <button type="button" className="native-link" onClick={() => goToBlock(edge.block!)}>{edge.block}へ</button>
          : edge.follow ? <button type="button" className="native-link" title={address(edge.target)} disabled={busy} onClick={() => onFollow(edge.target!)}>別の区間を開く ›</button>
          : <span title={address(edge.target)}>表示範囲の外</span>}</>}</div>)}</td>
      </tr>) : <tr><td colSpan={3}>読み取れた命令がありません。</td></tr>}</tbody>
    </table></div>
    {blocks.length > PAGE_SIZE && <nav className="code-analysis-pagination" aria-label="流れのページ切り替え"><span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, blocks.length)} / {blocks.length}件</span><button type="button" className="button secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>前へ</button><button type="button" className="button secondary" disabled={(page + 1) * PAGE_SIZE >= blocks.length} onClick={() => setPage(page + 1)}>次へ</button></nav>}
  </>
}
