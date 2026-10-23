import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import type { SkillRecord } from '../types/skill'
import { buildSkillKMeansCorpus, type SkillKMeansConfig, type SkillKMeansDocument, type SkillKMeansResult } from '../lib/skillKMeans'
import { EMPTY_SKILL_KMEANS_RUN, SkillKMeansRunner } from '../lib/skillKMeansRunner'
import { AnalysisTabs, AnalysisTabPanel } from './AnalysisTabs'
import type { OpenOperatorDetail } from './OperatorDetailLink'
import { SkillClusteringSource, SkillClusteringTerms } from './SkillClusteringSource'
import { SkillKMeansLearningChart } from './SkillKMeansLearningChart'
import './DamageCalculator.css'
import './SkillKMeansPage.css'

interface Props { rows: SkillRecord[]; loading: boolean; onOpenOperatorDetail: OpenOperatorDetail }
const TABS = [['settings', '条件設定'], ['results', '学習結果'], ['compare', '比較・診断']] as const
type Tab = typeof TABS[number][0]
type Draft = { kA: string; kB: string; seedA: string; seedB: string }
const INITIAL_DRAFT: Draft = { kA: '3', kB: '5', seedA: '2', seedB: '2' }
interface Submission { documents: SkillKMeansDocument[]; configs: [SkillKMeansConfig, SkillKMeansConfig]; sourceRows: readonly SkillRecord[] }
interface ExperimentRecord { id: number; configs: [SkillKMeansConfig, SkillKMeansConfig]; distances: [number, number]; documents: number; terms: number }
const formatDistance = (value: number) => value.toLocaleString('ja-JP', { maximumFractionDigits: 4 })
const documentLabel = (doc: SkillKMeansDocument) => `${doc.operatorName} S${doc.skillIndex} · ${doc.skillName}`
const configLabel = (config: SkillKMeansConfig) => `K=${config.k} · seed=${config.seed}`
const stopLabel = (result: SkillKMeansResult) => result.stopReason === 'max-iterations'
  ? `上限${result.config.maxIterations}回` : result.converged ? '収束' : '途中結果'

function readConfigs(draft: Draft, count: number): [SkillKMeansConfig, SkillKMeansConfig] | null {
  const integer = (value: string, min: number, max: number) => value.trim() !== ''
    && Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max
  if (!integer(draft.kA, 2, Math.min(count, 30)) || !integer(draft.kB, 2, Math.min(count, 30))
    || !integer(draft.seedA, 0, 99999) || !integer(draft.seedB, 0, 99999)) return null
  return [{ k: Number(draft.kA), seed: Number(draft.seedA), maxIterations: 30 },
    { k: Number(draft.kB), seed: Number(draft.seedB), maxIterations: 30 }]
}

export function SkillKMeansPage({ rows, loading, onOpenOperatorDetail }: Props) {
  const corpus = useMemo(() => buildSkillKMeansCorpus(rows), [rows])
  const [draft, setDraft] = useState<Draft>(INITIAL_DRAFT)
  const [tab, setTab] = useState<Tab>('settings')
  const [experiment, setExperiment] = useState<0 | 1>(0)
  const [selectedId, setSelectedId] = useState('')
  const [compareId, setCompareId] = useState('')
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [run, setRun] = useState(EMPTY_SKILL_KMEANS_RUN)
  const [history, setHistory] = useState<ExperimentRecord[]>([])
  const runner = useRef<SkillKMeansRunner | null>(null)
  const recordId = useRef(0)
  const id = useId()
  const statusId = useId()
  useEffect(() => {
    const instance = new SkillKMeansRunner(setRun)
    runner.current = instance
    return () => { instance.dispose(); if (runner.current === instance) runner.current = null }
  }, [])
  const configs = readConfigs(draft, corpus.documents.length)
  const dirty = submission !== null && (JSON.stringify(configs) !== JSON.stringify(submission.configs) || submission.sourceRows !== rows)
  const busy = ['preparing', 'running', 'pausing'].includes(run.status)
  const documents = submission?.documents ?? []
  const result = run.results?.[experiment]
  const recordMap = useMemo(() => new Map((submission?.sourceRows ?? rows).map(row => [row.id, row])), [submission, rows])
  const selectedIndex = result ? findDocumentIndex(documents, result, selectedId) : -1
  const selectedGroup = result && selectedIndex >= 0 ? result.assignments[selectedIndex] : -1
  const members = result ? documents.map((doc, index) => ({ doc, index }))
    .filter(({ index }) => result.assignments[index] === selectedGroup && selectedGroup >= 0) : []
  const comparedIndex = run.results ? findDocumentIndex(documents, run.results[0], compareId) : -1
  const compared = documents[comparedIndex]
  const usableCount = result?.counts.reduce((sum, count) => sum + count, 0) ?? 0
  const status = loading ? '読み込み中' : run.status === 'preparing' ? '準備中'
    : run.status === 'pausing' ? '停止中'
      : run.status === 'running' ? '学習中'
        : run.status === 'error' ? '学習エラー'
          : dirty ? '条件変更・未実行'
            : run.status === 'complete' ? '学習完了'
              : run.status === 'paused' ? '一時停止' : '未学習'
  const runStatus = <div className="skill-kmeans-status">
    <span role="status" aria-live="polite">{status}</span>
    {busy && <button type="button" className="button secondary" disabled={run.status === 'pausing'} onClick={() => runner.current?.pause()}>学習を停止</button>}
  </div>

  function focusResults() {
    setTab('results')
    window.requestAnimationFrame(() => document.getElementById(`${id}-tab-results`)?.focus({ preventScroll: true }))
  }
  function start(stepOnly: boolean) {
    if (!configs || busy || loading || !runner.current) return
    const next: Submission = { documents: [...corpus.documents], configs: configs.map(config => ({ ...config })) as Submission['configs'], sourceRows: rows }
    setSubmission(next)
    runner.current.start(next.documents, next.configs, stepOnly)
    focusResults()
  }
  function chooseGroup(group: number) {
    if (!result) return
    const index = result.representativeIndices[group]
    if (index >= 0 && documents[index]) setSelectedId(documents[index].id)
  }
  function recordExperiment() {
    if (!run.results || run.status !== 'complete') return
    const [a, b] = run.results
    const entry: ExperimentRecord = { id: ++recordId.current, configs: [{ ...a.config }, { ...b.config }],
      distances: [a.history.at(-1)!.meanSquaredDistance, b.history.at(-1)!.meanSquaredDistance], documents: usableCount, terms: run.termsCount }
    setHistory(current => [entry, ...current].slice(0, 10))
  }

  return <section className="calculator-page skill-kmeans-page">
    <header className="page-intro"><h1>K-means 学習ラボ</h1><div className="skill-kmeans-actions"><a className="button secondary" href="#/analysis/skills/hierarchical">階層クラスタリングへ</a><a className="button secondary" href="#/skill-classification">スキル大分類へ</a></div></header>
    <div className="skill-kmeans-content">
      {run.error && <p className="skill-kmeans-error" role="alert">{run.error}</p>}
      <AnalysisTabs tabs={TABS} activeTab={tab} onChange={setTab} idPrefix={id} label="K-means学習の表示" />
      <AnalysisTabPanel idPrefix={id} tab="settings" activeTab={tab} title="学習条件">
        <form className="analysis-panel-body" onSubmit={event => { event.preventDefault(); start(false) }}>
          <dl className="skill-kmeans-data"><dt>学習データ</dt><dd>最高レベルのスキル説明文 · {loading ? '読み込み中' : `${corpus.documents.length.toLocaleString('ja-JP')}件`}</dd></dl>
          <section className="skill-kmeans-section">
            <div className="skill-kmeans-section-heading"><h3>実験条件</h3><div id={statusId}>{runStatus}</div></div>
            <fieldset className="skill-kmeans-config" disabled={busy || loading} aria-label="実験条件">
              <table className="skill-kmeans-table skill-kmeans-config-table"><thead><tr><th scope="col">条件</th><th scope="col">実験 A</th><th scope="col">実験 B</th></tr></thead>
                <tbody><tr><th scope="row">クラスタ数 K</th>{(['A', 'B'] as const).map(key => <td key={key}>
                  <input type="number" min="2" max={Math.max(2, Math.min(30, corpus.documents.length))} step="1" aria-label={`実験${key}のクラスタ数`}
                    value={draft[`k${key}`]} onChange={event => setDraft(current => ({ ...current, [`k${key}`]: event.target.value }))} />
                </td>)}</tr><tr><th scope="row">乱数 seed</th>{(['A', 'B'] as const).map(key => <td key={key}>
                  <input type="number" min="0" max="99999" step="1" aria-label={`実験${key}のseed`}
                    value={draft[`seed${key}`]} onChange={event => setDraft(current => ({ ...current, [`seed${key}`]: event.target.value }))} />
                </td>)}</tr></tbody>
              </table>
            </fieldset>
          </section>
          <div className="skill-kmeans-actions"><button type="submit" className="button" disabled={busy || loading || !configs} aria-describedby={statusId}>学習する</button>
            <button type="button" className="button secondary" disabled={busy || loading || !configs} onClick={() => start(true)}>1反復から確認</button>
            {!loading && !configs && <span className="skill-kmeans-error" role="alert">{corpus.documents.length < 2 ? '学習データ不足' : `整数のみ · K：2〜${Math.min(30, corpus.documents.length)} / seed：0〜99999`}</span>}
          </div>
        </form>
      </AnalysisTabPanel>
      <AnalysisTabPanel idPrefix={id} tab="results" activeTab={tab} title="学習結果">
        <div className="analysis-panel-body">
          {!result ? <EmptyResults busy={busy} status={runStatus} onSettings={() => setTab('settings')} /> : <>
            <section className="skill-kmeans-section">
              <div className="skill-kmeans-result-toolbar"><label><span>実験</span><select aria-label="確認する実験" value={experiment} onChange={event => setExperiment(Number(event.target.value) as 0 | 1)}><option value="0">実験 A</option><option value="1">実験 B</option></select></label>
                <div className="skill-kmeans-result-state"><span>{configLabel(result.config)}</span>{runStatus}</div>
              </div>
              <dl className="skill-kmeans-metrics"><div><dt>反復回数</dt><dd>{result.iteration}回</dd></div><div><dt>平均二乗距離</dt><dd>{formatDistance(result.history.at(-1)!.meanSquaredDistance)}</dd></div>
                <div><dt>所属変更</dt><dd>{result.history.at(-1)!.changes === null ? '—' : `${result.history.at(-1)!.changes}件`}</dd></div></dl>
              <div className="skill-kmeans-actions"><button type="button" className="button secondary" disabled={run.status !== 'paused'} onClick={() => runner.current?.step()}>次の1反復</button><button type="button" className="button secondary" disabled={run.status !== 'paused'} onClick={() => runner.current?.resume()}>続けて学習</button>
                {result.converged && <span className="skill-kmeans-stop-state">{stopLabel(result)}</span>}
              </div>
              {documents.length > usableCount && <dl className="skill-kmeans-data"><dt>学習データ</dt><dd>利用 {usableCount}件 · 除外 {documents.length - usableCount}件</dd></dl>}
            </section>
            <div className="skill-kmeans-result-content">
              <section className="skill-kmeans-section"><h3>グループ</h3>
                <div className={`skill-kmeans-groups experiment-${experiment}`} aria-label="確認するグループ">
                  {result.counts.map((count, group) => <button type="button" key={group} aria-pressed={selectedGroup === group} disabled={count === 0}
                    aria-label={`G${group + 1}、${count}件を確認`} onClick={() => chooseGroup(group)}>
                    <span>G{group + 1}</span><span className="skill-kmeans-track"><i style={{ width: `${usableCount ? count / usableCount * 100 : 0}%` }} /></span><span>{count}件</span>
                  </button>)}
                </div>
              </section>
              {selectedGroup >= 0 && <section className="skill-kmeans-inspect"><h3>G{selectedGroup + 1} · {members.length}件</h3><div className="skill-kmeans-inspect-body">
                <dl className="skill-kmeans-term-field"><dt>代表語</dt><dd><SkillClusteringTerms terms={result.representativeTerms[selectedGroup]} /></dd></dl>
                <label><span>スキル</span><select aria-label="グループ内のスキル" value={documents[selectedIndex]?.id ?? ''} onChange={event => setSelectedId(event.target.value)}>{members.map(({ doc }) => <option key={doc.id} value={doc.id}>{documentLabel(doc)}</option>)}</select></label>
                <SkillClusteringSource document={documents[selectedIndex]} recordMap={recordMap} onOpenOperatorDetail={onOpenOperatorDetail} />
              </div></section>}
            </div>
          </>}
        </div>
      </AnalysisTabPanel>
      <AnalysisTabPanel idPrefix={id} tab="compare" activeTab={tab} title="比較・診断">
        <div className="analysis-panel-body">
          {!run.results ? <EmptyResults busy={busy} status={runStatus} onSettings={() => setTab('settings')} /> : <>
            <SkillKMeansLearningChart key={run.requestId} results={run.results} status={runStatus} />
            {compared && <section className="skill-kmeans-section skill-kmeans-memberships">
              <h3>所属の比較</h3>
              <select aria-label="比較するスキル" value={compared.id} onChange={event => setCompareId(event.target.value)}>{documents.map((doc, index) => run.results![0].assignments[index] >= 0 && <option key={doc.id} value={doc.id}>{documentLabel(doc)}</option>)}</select>
              <table className="skill-kmeans-table skill-kmeans-comparison-table" aria-label="スキルの所属比較"><thead><tr><th scope="col">項目</th><th scope="col">実験 A</th><th scope="col">実験 B</th></tr></thead><tbody>
                <tr><th scope="row">所属</th>{run.results.map((item, index) => <td key={index}>G{item.assignments[comparedIndex] + 1}</td>)}</tr>
                <tr><th scope="row">件数</th>{run.results.map((item, index) => <td key={index}>{item.counts[item.assignments[comparedIndex]]}件</td>)}</tr>
                <tr><th scope="row">代表語</th>{run.results.map((item, index) => <td key={index}><SkillClusteringTerms terms={item.representativeTerms[item.assignments[comparedIndex]]} /></td>)}</tr>
                <tr><th scope="row">グループ</th>{run.results.map((_, index) => <td key={index}><button type="button" className="button secondary" aria-label={`実験${index === 0 ? 'A' : 'B'}のグループを見る`}
                  onClick={() => { setExperiment(index as 0 | 1); setSelectedId(compared.id); focusResults() }}>見る</button></td>)}</tr>
              </tbody></table>
              <SkillClusteringSource document={compared} recordMap={recordMap} onOpenOperatorDetail={onOpenOperatorDetail} />
            </section>}
          </>}
          <details className="skill-kmeans-history"><summary>実験の記録 <span>{history.length}件</span></summary>
            <div className="skill-kmeans-actions"><button type="button" className="button secondary" disabled={run.status !== 'complete'} onClick={recordExperiment}>この2条件を記録</button></div>
            {history.length > 0 && <table className="skill-kmeans-table skill-kmeans-history-table" aria-label="記録した実験"><thead><tr><th scope="col">実験 A</th><th scope="col">実験 B</th><th scope="col">平均二乗距離 A／B</th></tr></thead><tbody>{history.map(entry => <tr key={entry.id}><td>{configLabel(entry.configs[0])}</td><td>{configLabel(entry.configs[1])}</td><td>{formatDistance(entry.distances[0])} ／ {formatDistance(entry.distances[1])}</td></tr>)}</tbody></table>}
          </details>
        </div>
      </AnalysisTabPanel>
    </div>
  </section>
}

function findDocumentIndex(documents: readonly SkillKMeansDocument[], result: SkillKMeansResult, id: string) {
  const index = documents.findIndex(doc => doc.id === id)
  return index >= 0 && result.assignments[index] >= 0 ? index : result.representativeIndices.find(value => value >= 0) ?? -1
}

function EmptyResults({ busy, status, onSettings }: { busy: boolean; status: ReactNode; onSettings: () => void }) {
  return <div className="skill-kmeans-empty">{status}
    {!busy && <button type="button" className="button secondary" onClick={onSettings}>条件設定へ</button>}</div>
}
