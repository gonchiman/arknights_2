import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ANALYSIS_CATEGORY_LABELS, ANALYSIS_RESULT_LIMIT, GOLDENGLOW_AUTOCHESS_NOTE, GOLDENGLOW_EXTRACTION_LIMIT, GOLDENGLOW_EXTRACTION_SCOPE, MAX_ANALYSIS_FILE_BYTES, formatGoldenglowTable, searchGoldenglowAnalysis, type AnalysisCategory, type AnalysisOwner, type GoldenglowAnalysisCategory, type GoldenglowExtraction, type GoldenglowExtractionMatch } from '../lib/codeAnalysis'
import type { AnalysisRequest, AnalysisResponse } from '../lib/codeAnalysis.worker'
import { writeClipboardText } from '../lib/clipboard'
import { readLocalAnalysisFile } from '../lib/localAnalysisFile'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import { GoldenglowExtractionActions } from './GoldenglowExtractionActions'
import { NativeAnalysisPanel } from './NativeAnalysisPanel'
import './DamageCalculator.css'
import './GoldenglowGuidePage.css'
import './GoldenglowTargetSwitchGridPanel.css'
import './CodeAnalysisPage.css'

type Detail = { match: GoldenglowExtractionMatch; fileName: string; query: string; owner: AnalysisOwner | null }
const CATEGORIES = Object.entries(ANALYSIS_CATEGORY_LABELS) as [AnalysisCategory, string][]

export function CodeAnalysisPage() {
  const [extraction, setExtraction] = useState<GoldenglowExtraction | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<GoldenglowAnalysisCategory>('all')
  const [owner, setOwner] = useState<AnalysisOwner | null>(null)
  const [page, setPage] = useState(0)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const [metadataFile, setMetadataFile] = useState<File | null>(null)
  const [localRead, setLocalRead] = useState<'idle' | 'loading' | 'unavailable'>('idle')
  const [automaticallyLoaded, setAutomaticallyLoaded] = useState(false)
  const automaticRead = useRef<AbortController | null>(null)
  const worker = useRef<Worker | null>(null)
  const requestId = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const resultHeading = useRef<HTMLHeadingElement>(null)
  const focusResults = useRef(false)
  const result = useMemo(() => extraction ? searchGoldenglowAnalysis(extraction, query, category, page, owner?.id) : null, [extraction, query, category, page, owner])
  const tableText = useMemo(() => extraction ? formatGoldenglowTable(extraction, query, category, owner?.id) : '', [extraction, query, category, owner])
  const status = localRead === 'loading' ? 'DATを自動で読み込み中…' : busy ? 'GG関連を読み取り中…' : error ? '読み取り失敗' : extraction ? automaticallyLoaded ? '読み取り完了（自動）' : '読み取り完了' : localRead === 'unavailable' ? '自動読み込みできません。ファイルを選んでください。' : '未読み込み'
  const hasMatches = !!extraction && (extraction.names.length + extraction.classes.length + extraction.methods.length + extraction.fields.length > 0)

  useEffect(() => () => { requestId.current++; worker.current?.terminate() }, [])
  useEffect(() => {
    if (!import.meta.env.DEV || !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) return
    const controller = new AbortController()
    automaticRead.current = controller
    setLocalRead('loading')
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    void (async () => {
      try {
        const file = await readLocalAnalysisFile('metadata', import.meta.env.BASE_URL, controller.signal)
        if (automaticRead.current !== controller || controller.signal.aborted) return
        void loadFile(file, true)
      } catch {
        if (automaticRead.current === controller) setLocalRead('unavailable')
      } finally {
        window.clearTimeout(timeout)
        if (automaticRead.current === controller) automaticRead.current = null
      }
    })()
    return () => { controller.abort(); window.clearTimeout(timeout); if (automaticRead.current === controller) automaticRead.current = null }
  }, [])
  useEffect(() => {
    if (!result) return
    const list = resultHeading.current?.nextElementSibling
    if (list instanceof HTMLElement) list.scrollTop = 0
    if (focusResults.current) { focusResults.current = false; resultHeading.current?.focus() }
  }, [result])

  function resetResults() {
    setMetadataFile(null); setExtraction(null); setDetail(null); setOwner(null); setQuery(''); setCategory('all'); setPage(0); setError('')
    focusResults.current = false
  }

  function cancelAutomaticRead() {
    automaticRead.current?.abort(); automaticRead.current = null; setLocalRead('idle')
  }

  async function loadFile(file: File, automatic = false) {
    cancelAutomaticRead(); setAutomaticallyLoaded(automatic)
    const id = ++requestId.current
    worker.current?.terminate(); worker.current = null
    resetResults(); setFileName(file.name)
    if (file.size > MAX_ANALYSIS_FILE_BYTES) { setBusy(false); setError('読み込めるファイルは128 MBまでです。'); return }
    setBusy(true)
    try {
      const nextWorker = new Worker(new URL('../lib/codeAnalysis.worker.ts', import.meta.url), { type: 'module' })
      worker.current = nextWorker
      nextWorker.onmessage = (event: MessageEvent<AnalysisResponse>) => {
        if (event.data.requestId !== requestId.current || worker.current !== nextWorker) return
        nextWorker.terminate(); worker.current = null
        setBusy(false)
        if ('error' in event.data) { setError(event.data.error); return }
        setExtraction(event.data.extraction); setMetadataFile(file)
      }
      nextWorker.onerror = () => {
        if (worker.current !== nextWorker) return
        setBusy(false); setExtraction(null)
        setError('読み取り機能を起動できないか、途中で停止しました。ページを再読み込みして、同じファイルで試してください。')
        nextWorker.terminate(); worker.current = null
      }
      const buffer = await file.arrayBuffer()
      if (id !== requestId.current || worker.current !== nextWorker) return
      const request: AnalysisRequest = { type: 'load', requestId: id, fileName: file.name, buffer }
      nextWorker.postMessage(request, [buffer])
    } catch {
      if (id !== requestId.current) return
      setBusy(false); setError('ファイルを開けませんでした。もう一度選んでください。')
      worker.current?.terminate(); worker.current = null
    }
  }

  function showList(nextCategory: GoldenglowAnalysisCategory, nextOwner: AnalysisOwner | null = null) {
    setCategory(nextCategory); setOwner(nextOwner); setQuery(''); setPage(0); setDetail(null)
    focusResults.current = true
  }

  function clearFile() {
    cancelAutomaticRead(); setAutomaticallyLoaded(false)
    requestId.current++; worker.current?.terminate(); worker.current = null
    resetResults(); setBusy(false); setFileName('')
    if (fileInput.current) fileInput.current.value = ''
  }

  return <div className="calculator-page gg-reference-page code-analysis-page">
    <header className="page-intro">
      <div><span className="page-kicker">GOLDENGLOW ANALYSIS</span><h1>GGのDAT解析</h1></div>
      <a className="gg-reference-link" href="https://drive.google.com/drive/folders/1102ekIUHHCwqKh15-PyBFtdLoZGA2ige" target="_blank" rel="noopener noreferrer">解析の記録</a>
    </header>

    <CollapsibleCalculatorPanel id="code-analysis-conditions" number="01" title="DATを読み込む" summary={fileName || 'ファイル未選択'} collapsedLabel="ファイルを表示">
      <h3 id="code-file-title" className="gg-table-title">解析ファイル</h3>
      <ValueTable titleId="code-file-title">
        <tr><th scope="row">選ぶファイル</th><td><code>global-metadata.dat</code></td></tr>
        <tr><th scope="row"><label htmlFor="code-analysis-file">ファイル</label></th><td><div className="code-analysis-file-controls">
          <input ref={fileInput} type="file" id="code-analysis-file" accept=".dat" onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void loadFile(file)
            event.target.value = ''
          }} />
          {(fileName || localRead === 'loading') && <button type="button" className="button secondary" onClick={clearFile}>{busy || localRead === 'loading' ? '中止' : '解除'}</button>}
        </div></td></tr>
        <tr><th scope="row">選択中のファイル</th><td>{fileName || '—'}</td></tr>
        <tr><th scope="row">読み取り状態</th><td><span role="status">{status}</span></td></tr>
      </ValueTable>
      {error && <p className="code-analysis-error" role="alert">{error}</p>}
    </CollapsibleCalculatorPanel>

    <CollapsibleCalculatorPanel id="code-analysis-results" number="02" title="GG関連の一覧" summary={busy ? '読み取り中…' : error ? '読み取り失敗' : extraction ? `処理 ${extraction.methods.length}件 · データ項目 ${extraction.fields.length}件` : '未読み込み'} collapsedLabel="GG関連を表示">
      {!extraction ? <p className="code-analysis-note" role="status">{busy ? 'DATからGG関連の名前と所属を調べています…' : error ? '読み取りを完了できませんでした。上のメッセージを確認してください。' : 'DATを読み込んでください。'}</p> : <>
        {!hasMatches && <p className="code-analysis-note" role="status">このファイルには、GG関連の名前が見つかりませんでした。</p>}
        <div className="ggs-grid-toolbar code-analysis-toolbar">
        <div className="ggs-grid-actions code-analysis-filters" role="search" aria-label="GG関連の絞り込み">
          <label className="ggs-grid-step" htmlFor="dat-analysis-category">種類<select id="dat-analysis-category" value={category} onChange={(event) => showList(event.target.value as GoldenglowAnalysisCategory)}><option value="all">すべて</option>{CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="ggs-grid-step" htmlFor="code-analysis-query">検索語<input id="code-analysis-query" type="search" value={query} maxLength={200} placeholder="例 DealHitTarget" onChange={(event) => { setQuery(event.target.value); setPage(0) }} /></label>
          {owner && <div className="code-analysis-owner-filter"><span>所属: {owner.name}</span><button className="button secondary" type="button" onClick={() => showList(category)}>所属の絞り込みを解除</button></div>}
        </div>
        <GoldenglowExtractionActions key={`${extraction.extractedAt}:${category}:${query}:${owner?.id}`} extraction={extraction} tableText={tableText} count={result?.total || 0} />
        </div>
        <h3 ref={resultHeading} id="code-result-title" className="gg-table-title" tabIndex={-1}>GG関連の一覧</h3>
        <div className="ggs-grid-scroll code-analysis-candidates-wrap" role="region" aria-labelledby="code-result-title" tabIndex={0}>
          <table className="ggs-grid-table code-analysis-candidates" aria-labelledby="code-result-title">
            <colgroup><col className="code-analysis-name-column" /><col className="code-analysis-kind-column" /><col className="code-analysis-owner-column" /><col className="code-analysis-position-column" /><col className="code-analysis-position-column" /></colgroup>
            <thead><tr><th scope="col">名前</th><th scope="col">種類</th><th scope="col">所属</th><th scope="col">定義の保存位置</th><th scope="col">名前の保存位置</th></tr></thead>
            <tbody>{result?.matches.length ? result.matches.map(item => <tr key={`${item.category}:${item.id}`} className="code-analysis-selectable" onClick={event => {
              const trigger = event.currentTarget.querySelector<HTMLButtonElement>('.gg-detail-trigger')
              trigger?.focus({ preventScroll: true })
              trigger?.click()
            }}>
              <th scope="row"><button type="button" className="gg-detail-trigger" aria-haspopup="dialog" onClick={event => { event.stopPropagation(); setDetail({ match: item, fileName: extraction.summary.fileName, query: result.query, owner: result.owner }) }}><code>{item.name || '（名前なし）'}</code><span aria-hidden="true">›</span></button></th>
              <td>{item.category === 'classes' ? item.typeKind : ANALYSIS_CATEGORY_LABELS[item.category]}</td>
              <td className="code-analysis-owner">{item.owner?.name || item.namespace || '—'}</td>
              <td>{item.category === 'names' ? '—' : item.location.replace('ファイル位置 ', '')}</td>
              <td>{item.category === 'names' ? item.location.replace('ファイル位置 ', '') : item.nameLocation || '—'}</td>
            </tr>) : <tr><td colSpan={5}>一致する項目がありません。</td></tr>}</tbody>
          </table>
        </div>
        {result && result.total > 0 && <nav className="code-analysis-pagination" aria-label="一覧のページ切り替え">
          <span role="status">{(result.page * ANALYSIS_RESULT_LIMIT + 1).toLocaleString('ja-JP')}–{(result.page * ANALYSIS_RESULT_LIMIT + result.matches.length).toLocaleString('ja-JP')}件 / {result.total.toLocaleString('ja-JP')}件</span>
          {result.pageCount > 1 && <><button type="button" className="button secondary" disabled={result.page === 0} onClick={() => setPage(result.page - 1)}>前へ</button><button type="button" className="button secondary" disabled={result.page + 1 >= result.pageCount} onClick={() => setPage(result.page + 1)}>次へ</button></>}
        </nav>}
      </>}
    </CollapsibleCalculatorPanel>

    {extraction && metadataFile && <NativeAnalysisPanel key={extraction.extractedAt} dat={metadataFile} autoLoad={automaticallyLoaded} />}
    <CollapsibleCalculatorPanel id="dat-analysis-help" number={metadataFile ? "06" : "03"} title="読み方" summary="" defaultOpen={false} collapsedLabel="読み方を表示">
      <div className="code-analysis-help">
        <p>このPCの開発用プレビューでは、インストール先のDAT、続いて同じインストール先のDLLを自動で読み込みます。自動で読めない場合や別のファイルを調べたい場合は、ファイルを選んでください。DATを手動で選んだ場合は、それに対応するDLLも選んでください。行を押すと、所属や抽出理由などの詳細が開きます。</p>
        <p>対応ファイルはglobal-metadata.dat（IL2CPP版29、128 MB以下）と、同じインストールのGameAssembly.dll（Windows x64版、256 MB以下）です。</p>
        <p>自動読み込みはこのPCのプレビュー用サーバーからDATとDLLを受け取ります。解析はブラウザー内で行い、ファイルを実行したり外部へ送信したりしません。DATとDLLの構造を照合しますが、同じゲーム版かは自動では保証できません。ページを離れると読み取り結果は破棄します。</p>
        <p>AutoChessの項目が通常戦闘で使われるかは未確認です。</p>
      </div>
      <h3 id="code-workflow-title" className="gg-table-title">調べる順番</h3>
      <ValueTable titleId="code-workflow-title" className="code-analysis-workflow-table">
        <tr><th scope="row">クラスからたどる</th><td>クラス・型を開き、GG関連として抽出された処理やデータ項目を見る。処理の詳細から所属クラスにも戻れる。</td></tr>
        <tr><th scope="row">候補の役割を調べる</th><td>DealHitTarget・OnHitTarget・EmitProjectileなどを手がかりにする。名前だけでは、敵の選び方や撃破判定の仕組みまでは分からない。</td></tr>
        <tr><th scope="row">結果を残す</th><td>「表をコピー」で絞り込み結果を表形式でコピーする。ページをまたぐ結果も含む。「全件の詳細を保存」では抽出全体を記録できる。項目の詳細からは「出典ごとコピー」で個別に記録できる。</td></tr>
      </ValueTable>
      <div className="code-analysis-help"><p>{GOLDENGLOW_EXTRACTION_SCOPE}</p><p>名前が一致したクラスの処理・項目を含めます。ほかの所属先は参考情報として載せ、そのクラスの全項目までは追加しません。</p><p>{GOLDENGLOW_EXTRACTION_LIMIT}</p></div>
    </CollapsibleCalculatorPanel>
    {detail && <CodeAnalysisDetail key={`${detail.match.category}:${detail.match.id}`} detail={detail} onClose={() => setDetail(null)} onRelated={showList} />}
  </div>
}

function ValueTable({ titleId, className = '', children }: { titleId: string; className?: string; children: ReactNode }) {
  return <div className="gg-probability-table-wrap gg-value-table-wrap code-analysis-value-wrap"><table className={`gg-probability-table gg-value-table code-analysis-value-table ${className}`} aria-labelledby={titleId}><tbody>{children}</tbody></table></div>
}

function CodeAnalysisDetail({ detail, onClose, onRelated }: { detail: Detail; onClose: () => void; onRelated: (category: AnalysisCategory, owner: AnalysisOwner) => void }) {
  const [notice, setNotice] = useState('')
  const [copying, setCopying] = useState(false)
  async function copy() {
    if (copying) return
    setCopying(true)
    try {
      await writeClipboardText(`出典: ${detail.fileName}\n対象: GG関連の${ANALYSIS_CATEGORY_LABELS[detail.match.category]}\n検索語: ${detail.query || '指定なし'}\n所属の絞り込み: ${detail.owner?.name || '指定なし'}\n${detail.match.context}`)
      setNotice('出典と内容をコピーしました。')
    } catch { setNotice('コピーできませんでした。テキストを選択してコピーしてください。') }
    finally { setCopying(false) }
  }
  return <GoldenglowDetailModal title={detail.match.name} closeLabel="GGのDAT解析の詳細を閉じる" onClose={onClose} closeOnContextMenu>
    <div className="code-analysis-detail-content">
      <h3 id="code-detail-source-title" className="gg-table-title">出典と所属</h3>
      <ValueTable titleId="code-detail-source-title">
        <tr><th scope="row">ファイル</th><td>{detail.fileName}</td></tr>
        <tr><th scope="row">一覧の種類</th><td>{ANALYSIS_CATEGORY_LABELS[detail.match.category]}</td></tr>
        <tr><th scope="row">抽出の理由</th><td>{detail.match.reason === 'owner' ? '一致した項目の所属先（参考情報）' : detail.match.reason === 'name' ? 'GG関連の名前に一致' : 'GG関連のクラスに所属'}</td></tr>
        <tr><th scope="row">{detail.match.category === 'names' ? '名前の保存位置' : '定義の保存位置'}</th><td>{detail.match.location}</td></tr>
        {detail.match.category === 'classes' && <>
          <tr><th scope="row">種類</th><td>{detail.match.typeKind}</td></tr><tr><th scope="row">所属</th><td>{detail.match.namespace || '—'}</td></tr>
          <tr><th scope="row">GG関連の処理</th><td><button type="button" className="gg-detail-trigger" onClick={() => onRelated('methods', { id: detail.match.id, name: [detail.match.namespace, detail.match.name].filter(Boolean).join('.') })}>{detail.match.methodCount}件を見る <span aria-hidden="true">›</span></button></td></tr>
          <tr><th scope="row">GG関連のデータ項目</th><td><button type="button" className="gg-detail-trigger" onClick={() => onRelated('fields', { id: detail.match.id, name: [detail.match.namespace, detail.match.name].filter(Boolean).join('.') })}>{detail.match.fieldCount}件を見る <span aria-hidden="true">›</span></button></td></tr>
        </>}
        {detail.match.owner && <tr><th scope="row">所属クラス</th><td><button type="button" className="gg-detail-trigger" onClick={() => onRelated('classes', detail.match.owner!)}>{detail.match.owner.name}<span aria-hidden="true">›</span></button></td></tr>}
        {detail.match.parameters && <tr><th scope="row">引数の名前</th><td>{detail.match.parameters.length ? detail.match.parameters.map((name, i) => `${i + 1}. ${name || '（名前なし）'}`).join(' / ') : '引数なし'}</td></tr>}
      </ValueTable>
      {detail.match.autoChess && <p>{GOLDENGLOW_AUTOCHESS_NOTE}</p>}
      <div className="code-analysis-detail-actions"><button type="button" className="button secondary" onClick={() => void copy()} disabled={copying}>{copying ? 'コピー中…' : '出典ごとコピー'}</button></div>
      <h3 className="gg-table-title">DATから読み取った内容</h3>
      <pre>{detail.match.context}</pre>
      <p role="status">{notice}</p>
    </div>
  </GoldenglowDetailModal>
}
