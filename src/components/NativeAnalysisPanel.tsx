import { useEffect, useRef, useState, type ReactNode } from 'react'
import { address, formatNativeBody, MAX_NATIVE_BYTES, type NativeBody, type NativeSummary } from '../lib/nativeAnalysis'
import { getNativeMethodGuide, isGuideBlockVisible } from '../lib/nativeMethodGuide'
import type { NativeRequest } from '../lib/nativeAnalysis.worker'
import { writeClipboardText } from '../lib/clipboard'
import { readLocalAnalysisFile } from '../lib/localAnalysisFile'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { PersistentDetails } from './PersistentDetails'
import { NativeFlowTable } from './NativeFlowTable'
import { NativeFlowDetails } from './NativeFlowDetails'
import { NativeSectionGraph } from './NativeSectionGraph'
import type { NativeSectionGraph as SectionGraph } from '../lib/nativeSectionGraph'
import './NativeAnalysisPanel.css'

const RVA_DESCRIPTION = 'DLLをメモリに読み込んだときの先頭からの距離です。命令の場所を示す目印で、DLLファイル内の保存位置とは異なります。'

export function NativeAnalysisPanel({ dat, autoLoad = false }: { dat: File; autoLoad?: boolean }) {
  const [summary, setSummary] = useState<NativeSummary | null>(null)
  const [body, setBody] = useState<NativeBody | null>(null)
  const [graph, setGraph] = useState<SectionGraph | null>(null)
  const [selectedRva, setSelectedRva] = useState<number | null>(null)
  const graphRef = useRef<SectionGraph | null>(null), keepDiagram = useRef(false)
  const [status, setStatus] = useState('DLL未選択')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<number[]>([])
  const [notice, setNotice] = useState('')
  const [copying, setCopying] = useState(false)
  const [automaticallyLoaded, setAutomaticallyLoaded] = useState(false)
  const automaticRead = useRef<AbortController | null>(null)
  const worker = useRef<Worker | null>(null), requestId = useRef(0)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => () => { requestId.current++; worker.current?.terminate() }, [])
  useEffect(() => {
    if (!autoLoad || !import.meta.env.DEV || !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) return
    const controller = new AbortController()
    automaticRead.current = controller
    setBusy(true); setStatus('DLLを自動で読み込み中…')
    const timeout = window.setTimeout(() => controller.abort(), 30000)
    void (async () => {
      try {
        const file = await readLocalAnalysisFile('binary', import.meta.env.BASE_URL, controller.signal)
        if (automaticRead.current !== controller || controller.signal.aborted) return
        void load(file, true)
      } catch {
        if (automaticRead.current === controller) { setBusy(false); setStatus('自動読み込みできません。DLLを選んでください。') }
      } finally {
        window.clearTimeout(timeout)
        if (automaticRead.current === controller) automaticRead.current = null
      }
    })()
    return () => { controller.abort(); window.clearTimeout(timeout); if (automaticRead.current === controller) automaticRead.current = null }
  }, [dat, autoLoad])
  useEffect(() => {
    if (!body) return
    if (!keepDiagram.current) heading.current?.focus()
    const el = heading.current?.nextElementSibling
    if (!(el instanceof HTMLElement)) return
    el.scrollTop = 0; el.scrollLeft = 0
    const row = document.getElementById(`native-instruction-${selectedRva ?? body.rva}`)
    if (row) el.scrollTop = Math.max(0, row.getBoundingClientRect().top - el.getBoundingClientRect().top - (el.querySelector('thead')?.getBoundingClientRect().height ?? 0))
  }, [body, selectedRva])

  function inspectInstruction(rva: number) {
    const row = document.getElementById(`native-instruction-${rva}`)
    row?.focus({ preventScroll: true })
    row?.scrollIntoView({ block: 'nearest' })
  }
  function clear() {
    automaticRead.current?.abort(); automaticRead.current = null; setAutomaticallyLoaded(false)
    keepDiagram.current = false
    requestId.current++; worker.current?.terminate(); worker.current = null
    setGraph(null); graphRef.current = null; setSelectedRva(null)
    setSummary(null); setBody(null); setHistory([]); setError(''); setNotice(''); setBusy(false); setStatus('DLL未選択')
  }
  function openBody(rva: number, back = false, root = false, fromDiagram = false) {
    if (!worker.current) return
    if (!root && !back && body && rva === selectedRva) return
    keepDiagram.current = fromDiagram
    setSelectedRva(rva)
    setHistory(old => root ? [] : back ? old.slice(0, -1) : body ? [...old, selectedRva ?? body.rva].slice(-30) : old)
    const cached = !root && graphRef.current?.nodes.find(n => n.body.instructions.some(i => i.rva === rva))
    if (cached) { setBody(cached.body); setNotice(''); setError(''); setBusy(false); setStatus('命令の読み取り完了'); return }
    setGraph(null); graphRef.current = null
    setBody(null); setNotice(''); setBusy(true); setError(''); setStatus('命令を読み取っています…')
    worker.current.postMessage({ id: ++requestId.current, type: 'body', rva } satisfies NativeRequest)
  }
  async function load(file: File, automatic = false) {
    clear()
    setAutomaticallyLoaded(automatic)
    if (!/\.dll$/i.test(file.name) || file.size > MAX_NATIVE_BYTES) { setError('Windows x64版のGameAssembly.dll（256 MB以下）を選んでください。'); return }
    const id = ++requestId.current
    setBusy(true); setStatus('ファイルを読み込んでいます…')
    try {
      const w = new Worker(new URL('../lib/nativeAnalysis.worker.ts', import.meta.url), { type: 'module' }); worker.current = w
      w.onmessage = ({ data }) => {
        if (data.id !== requestId.current || worker.current !== w) return
        if (data.type === 'progress') { setStatus(data.text); return }
        setBusy(false)
        if (data.type === 'error') { setError(data.error); setStatus('読み取り失敗'); return }
        if (data.type === 'loaded') {
          const loaded = data.summary as NativeSummary
          setSummary(loaded); setStatus('対応表を読み取りました')
          const first = loaded.methods.find(m => m.name === 'DealHitTarget' && !m.autoChess && m.rva !== null) || loaded.methods.find(m => m.rva !== null)
          if (first?.rva != null) openBody(first.rva, false, true, automatic)
        } else { setBody(data.body); setGraph(data.graph); graphRef.current = data.graph; setStatus('命令の読み取り完了') }
      }
      w.onerror = () => { if (worker.current !== w) return; requestId.current++; w.terminate(); worker.current = null; setBusy(false); setSummary(null); setBody(null); setGraph(null); graphRef.current = null; setHistory([]); setError('処理の読み取り機能が停止しました。DLLを選び直してください。'); setStatus('読み取り失敗') }
      const [metadata, binary] = await Promise.all([dat.arrayBuffer(), file.arrayBuffer()])
      if (id !== requestId.current || worker.current !== w) return
      w.postMessage({ id, type: 'load', datName: dat.name, dllName: file.name, dat: metadata, dll: binary } satisfies NativeRequest, [metadata, binary])
    } catch { if (id !== requestId.current) return; worker.current?.terminate(); worker.current = null; setBusy(false); setError('ファイルを開けませんでした。選び直してください。'); setStatus('読み取り失敗') }
  }
  async function copy() {
    if (!summary || !body || copying) return
    const id = requestId.current
    setCopying(true)
    try { await writeClipboardText(formatNativeBody(summary, body)); if (id === requestId.current) setNotice('出典と表示中の命令をコピーしました。') }
    catch { if (id === requestId.current) setNotice('コピーできませんでした。表の文字を選択してコピーしてください。') }
    finally { setCopying(false) }
  }
  const guide = summary && body ? getNativeMethodGuide(summary, body.rva) : null
  function renderFlowDetails(conditions: ReactNode) {
    if (!body) return null
    return <NativeFlowDetails conditions={conditions}
      flow={<NativeFlowTable key={body.rva} body={body} busy={busy} onInspect={inspectInstruction} onFollow={openBody} />}
      reviewed={guide ? <>
        <h3 id="native-guide-title" className="gg-table-title">{guide.title}</h3>
        <div className="ggs-grid-scroll"><table className="ggs-grid-table native-guide-table" aria-labelledby="native-guide-title"><thead><tr><th scope="col">まとまり</th><th scope="col">確認できた動作</th><th scope="col">ゲーム上の意味・未確認の点</th><th scope="col">命令を見る</th></tr></thead><tbody>
          {guide.blocks.map(block => <tr key={block.title}>
            <th scope="row" title={isGuideBlockVisible(block, body.instructions.map(i => i.rva)) ? '下の命令一覧に表示中' : undefined}>{block.title}</th>
            <td>{block.action}</td><td>{block.interpretation}</td>
            <td>{block.evidence.map(item => <button key={item.rva} type="button" className="native-link" title={address(item.rva)} disabled={busy} onClick={() => openBody(item.rva)}>{item.label} ›</button>)}</td>
          </tr>)}
        </tbody></table></div>
      </> : null}
    />
  }
  const fileStatus = summary ? automaticallyLoaded ? 'DLL読み込み済み（自動）' : 'DLL読み込み済み' : status
  return <>
  <CollapsibleCalculatorPanel id="native-analysis" number="03" title="DLLを読み込む" summary={fileStatus} collapsedLabel="ファイル選択を表示">
    <h3 id="native-file-title" className="gg-table-title">処理本体のファイル</h3>
    <div className="gg-probability-table-wrap gg-value-table-wrap code-analysis-value-wrap"><table className="gg-probability-table gg-value-table code-analysis-value-table" aria-labelledby="native-file-title"><tbody>
      <tr><th scope="row">選ぶファイル</th><td>同じインストールの GameAssembly.dll</td></tr>
      <tr><th scope="row"><label htmlFor="native-file">DLLファイル</label></th><td><div className="code-analysis-file-controls"><input id="native-file" type="file" accept=".dll" onChange={e => { const file = e.target.files?.[0]; if (file) void load(file); e.target.value = '' }} />{(busy || summary || error) && <button type="button" className="button secondary" onClick={clear}>{busy ? '中止' : '解除'}</button>}</div></td></tr>
      <tr><th scope="row">読み取り状態</th><td role="status">{fileStatus}</td></tr>
    </tbody></table></div>
    {error && !summary && <p className="code-analysis-error" role="alert">{error}</p>}
    {summary && <PersistentDetails className="gg-skill-effect" persistenceId="native-file-source"><summary>読み込んだファイルの情報<span className="gg-skill-effect-disclosure" aria-hidden="true" /></summary><div className="gg-skill-effect-body code-analysis-help">
      <p>DLL: {summary.dllName}</p><p>DAT: {summary.datName}</p>
      <p>照合したモジュール: {summary.modules.join(' / ')}</p><p>DAT SHA-256: {summary.datHash}</p><p>DLL SHA-256: {summary.dllHash}</p>
    </div></PersistentDetails>}
  </CollapsibleCalculatorPanel>
  <CollapsibleCalculatorPanel id="native-methods" number="04" title="処理を選ぶ" summary={summary ? `${summary.methods.length}件の処理` : 'DLL未読み込み'} collapsedLabel="処理一覧を表示" disabled={!summary} disabledLabel="DLLを読み込んでください">
    {summary && <>
      <h3 id="native-methods-title" className="gg-table-title">本体と対応づけたGGの処理</h3>
      <div className="ggs-grid-scroll"><table className="ggs-grid-table native-method-table" aria-labelledby="native-methods-title"><thead><tr><th scope="col">処理</th><th scope="col">所属</th><th scope="col" className="native-rva-help" title={RVA_DESCRIPTION}>本体のRVA</th><th scope="col">DLL内の保存位置</th></tr></thead><tbody>
        {[...summary.methods].sort((a, b) => Number(a.autoChess) - Number(b.autoChess)).map(m => {
          const disabled = busy || m.rva === null
          const selectMethod = () => { if (!disabled && m.rva !== null) openBody(m.rva, false, true) }
          return <tr key={m.id} className={disabled ? undefined : 'native-method-selectable'} onClick={selectMethod}>
            <th scope="row"><button type="button" className="native-link" disabled={disabled} onClick={event => { event.stopPropagation(); selectMethod() }}>{m.name} ›</button></th>
            <td title={m.autoChess ? 'AutoChess側・通常戦闘での使用は未確認' : undefined}>{m.owner}</td>
            <td>{m.rva === null ? '対応先なし' : address(m.rva)}</td>
            <td>{m.offset === null ? '—' : address(m.offset)}</td>
          </tr>
        })}
      </tbody></table></div>
    </>}
  </CollapsibleCalculatorPanel>
  <CollapsibleCalculatorPanel id="native-instructions" number="05" title="命令を調べる" summary={summary ? status : 'DLL未読み込み'} collapsedLabel="命令を表示" disabled={!summary} disabledLabel="DLLを読み込んでください">
    {summary && error && <p className="code-analysis-error" role="alert">{error}</p>}
    {summary && !body && <p className="code-analysis-note" role="status">{busy ? status : error ? 'パネル4で処理を選び直してください。' : 'パネル4で処理を選んでください。'}</p>}
    {(body || history.length > 0) && <div className="ggs-grid-toolbar native-toolbar"><div className="ggs-grid-actions"><button className="button secondary" disabled={busy || !history.length} onClick={() => openBody(history[history.length - 1], true)}>前の処理へ</button>{body?.nextRva !== undefined && <button className="button secondary" disabled={busy} onClick={() => openBody(body.nextRva!)}>この区間の続きへ</button>}</div><button className="button secondary" disabled={!body || copying || busy} onClick={() => void copy()}>{copying ? 'コピー中…' : '命令を出典付きでコピー'}</button></div>}
    {notice && <p className="code-analysis-note" role="status">{notice}</p>}
    {body && <>
      <p className="native-current">{graph?.names.join(' / ') || body.names.join(' / ') || `名前未特定の区間 ${address(body.rva)}`}</p>
      <PersistentDetails className="gg-skill-effect native-flow-overview" persistenceId="native-method-guide"><summary><span>処理の流れを見る</span>{!!graph?.nodes.length && <span className="native-flow-count">{graph.nodes.length}区間</span>}<span className="gg-skill-effect-disclosure" aria-hidden="true" /></summary><div className="gg-skill-effect-body">
        {graph ? <NativeSectionGraph graph={graph} current={selectedRva ?? body.rva} busy={busy} onSelect={rva => openBody(rva, false, false, true)} renderDetails={renderFlowDetails} /> : renderFlowDetails(null)}
      </div></PersistentDetails>
      <h3 ref={heading} tabIndex={-1} id="native-body-title" className="gg-table-title">命令の一覧（配置順）</h3>
      <div className="ggs-grid-scroll" role="region" aria-labelledby="native-body-title" tabIndex={0}><table className="ggs-grid-table native-body-table" aria-labelledby="native-body-title"><thead><tr><th scope="col" className="native-rva-help" title={RVA_DESCRIPTION}>RVA</th><th scope="col">区分</th><th scope="col">命令</th><th scope="col">意味</th><th scope="col">分岐・呼び出し先</th></tr></thead><tbody>
        {body.instructions.map(i => <tr key={i.rva} id={`native-instruction-${i.rva}`} aria-current={i.rva === selectedRva ? 'true' : undefined} tabIndex={-1}><th scope="row">{address(i.rva)}</th><td>{i.kind}</td><td><code>{i.text}</code></td><td>{i.meaning}</td><td>{i.target === undefined ? i.kind.startsWith('間接') ? '静的解析では未特定' : '—' : i.follow ? <button className="native-link" disabled={busy} onClick={() => openBody(i.target!)}>{i.names.join(' / ') || address(i.target)} ›</button> : <span title="この区間内、または追跡対象外">{address(i.target)}</span>}</td></tr>)}
      </tbody></table></div>
    </>}
    <PersistentDetails className="gg-skill-effect" persistenceId="native-reading"><summary>読み方・表示範囲<span className="gg-skill-effect-disclosure" aria-hidden="true" /></summary><div className="gg-skill-effect-body code-analysis-help">
      {body && <><p>{body.range}</p>{body.warnings.map(w => <p key={w}>{w}</p>)}</>}
      <p>フロー図の箱はDLLの範囲表にある区間です。分岐と直後の継続で到達する区間を自動でたどり、呼び出し先の別処理は展開しません。矢印は区間間の移動で、破線は区間の途中への合流です。区間内の細かな分岐は表や命令で確認できます。箱には区間番号を表示し、選択した区間の命令数・呼出し例・移動先を図の横または下にまとめます。移動条件は必要なときに開いて確認できます。</p>
      <p>別の名前付き処理、境界不明の領域、先頭から256 KB・32区間などの上限で探索を止めます。この図はC#の処理全体や実際の到達可能性を保証するものではありません。呼び出し後の経路は戻ってくる場合のものです。AIは使わず、ゲーム上の意味も推測して付けていません。</p>
        <p>「処理の流れ」は表示中の命令から自動生成します。同じ処理への連続した呼び出しは、途中へ入る分岐がなければまとめます。「何をするか」を押すと根拠を、番号を押すと命令を確認できます。番号は配置順で、実行順や到達できることを保証しません。別の区間や間接呼び出しの中身は未解析です。呼び出し後の経路は、その処理が戻る場合だけ進みます。ゲーム上の役割は自動では確定しません。</p>
      <p>「解析済みの説明」は、確認済みのDAT・DLLと一致するDealHitTargetに対応します。自動生成とは別の調査結果で、異常時の処理などは一部省略しています。</p>
      <p>「比較」と「条件分岐」で条件を確かめ、「呼出し」から別の処理へ進みます。上からの並びはファイル内の配置順で、実際の実行順ではありません。</p>
      <p>「意味」はCPUの命令としての動作の要約です。フラグは比較や計算の結果を記録する印で、条件分岐が参照します。表示は機械語を命令に直したものです。元のC#コードや日本語の仕様への復元ではありません。間接呼出し・仮想呼出し・実行時の差し替えは未解決です。敵HPや爆発の判定は、命令とデータの意味をさらに調べる必要があります。</p>
    </div></PersistentDetails>
  </CollapsibleCalculatorPanel>
  </>
}
