import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import type { SkillRecord } from '../types/skill'
import { buildSkillClusteringCorpus, type SkillClusteringDocument } from '../lib/skillClusteringFeatures'
import type { SkillHdbscanConfig, SkillHdbscanResult } from '../lib/skillHdbscan'
import { EMPTY_SKILL_HDBSCAN_RUN, SkillHdbscanRunner } from '../lib/skillHdbscanRunner'
import { AnalysisTabs, AnalysisTabPanel } from './AnalysisTabs'
import type { OpenOperatorDetail } from './OperatorDetailLink'
import { SkillClusteringDocumentSource, SkillClusteringRepresentativeTerms } from './SkillClusteringDetails'
import './DamageCalculator.css'
import './SkillKMeansPage.css'
import './SkillHdbscanPage.css'

interface Props { rows: SkillRecord[]; loading: boolean; onOpenOperatorDetail: OpenOperatorDetail }
const TABS = [['settings', '条件設定'], ['results', '学習結果'], ['compare', '比較・診断']] as const
const STAGES = [['preparing', '説明文処理'], ['distances', '距離計算'], ['hierarchy', '階層構築'], ['extract', 'グループ抽出']] as const
type Tab = typeof TABS[number][0]
type Draft = { minClusterSize: string; minSamples: string; clusterSelectionMethod: 'eom' | 'leaf' }
const INITIAL_DRAFT: Draft = { minClusterSize: '10', minSamples: '5', clusterSelectionMethod: 'eom' }
interface Submission {
  documents: SkillClusteringDocument[]
  config: SkillHdbscanConfig
  sourceRows: SkillRecord[]
  sourceRowsIdentity: readonly SkillRecord[]
}
interface ExperimentRecord {
  id: number
  requestId: number
  submission: Submission
  result: SkillHdbscanResult
  termsCount: number
}
const documentLabel = (doc: SkillClusteringDocument) => `${doc.operatorName} S${doc.skillIndex} · ${doc.skillName}`
const methodLabel = (method: SkillHdbscanConfig['clusterSelectionMethod']) => method === 'leaf' ? '細分化を優先' : 'まとまりを優先'
const configLabel = (config: SkillHdbscanConfig) => `最小${config.minClusterSize}件 / 近傍${config.minSamples} / ${methodLabel(config.clusterSelectionMethod)}`
const groupLabel = (group: number) => group === -1 ? '未分類' : group === -2 ? '除外' : `G${group + 1}`
const classifiedCount = (result: SkillHdbscanResult) => result.counts.reduce((sum, count) => sum + count, 0)
const usableCount = (result: SkillHdbscanResult) => classifiedCount(result) + result.noiseCount
const noiseLabel = (result: SkillHdbscanResult) => `${result.noiseCount}件 / ${usableCount(result) ? `${(result.noiseCount / usableCount(result) * 100).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}%` : '—'}`
const groupCount = (result: SkillHdbscanResult, group: number) => group === -1 ? result.noiseCount : group === -2 ? result.excludedCount : result.counts[group]
const membershipTerms = (result: SkillHdbscanResult, index: number) => result.assignments[index] >= 0 ? result.representativeTerms[result.assignments[index]] : []

function findActiveGroup(result: SkillHdbscanResult | null, selectedGroup: number | null): number | null {
  if (!result) return null
  if (selectedGroup !== null && groupCount(result, selectedGroup) > 0) return selectedGroup
  const firstGroup = result.counts.findIndex(count => count > 0)
  return firstGroup >= 0 ? firstGroup : result.noiseCount > 0 ? -1 : result.excludedCount > 0 ? -2 : null
}

function readConfig(draft: Draft, count: number): SkillHdbscanConfig | null {
  const integer = (value: string, min: number) => value.trim() !== '' && Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= count
  if (!integer(draft.minClusterSize, 2) || !integer(draft.minSamples, 1)) return null
  return { minClusterSize: Number(draft.minClusterSize), minSamples: Number(draft.minSamples), clusterSelectionMethod: draft.clusterSelectionMethod }
}

export function SkillHdbscanPage({ rows, loading, onOpenOperatorDetail }: Props) {
  const corpus = useMemo(() => buildSkillClusteringCorpus(rows), [rows])
  const [draft, setDraft] = useState<Draft>(INITIAL_DRAFT)
  const [tab, setTab] = useState<Tab>('settings')
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [compareId, setCompareId] = useState('')
  const [compareRecordId, setCompareRecordId] = useState<number | null>(null)
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [run, setRun] = useState(EMPTY_SKILL_HDBSCAN_RUN)
  const [history, setHistory] = useState<ExperimentRecord[]>([])
  const runner = useRef<SkillHdbscanRunner | null>(null)
  const nextRecordId = useRef(0)
  const id = useId()
  useEffect(() => {
    const instance = new SkillHdbscanRunner(setRun)
    runner.current = instance
    return () => { instance.dispose(); if (runner.current === instance) runner.current = null }
  }, [])

  const config = readConfig(draft, corpus.documents.length)
  const dirty = submission !== null && (JSON.stringify(config) !== JSON.stringify(submission.config) || submission.sourceRowsIdentity !== rows)
  const busy = run.status === 'running'
  const result = run.result
  const documents = submission?.documents ?? []
  const recordMap = useMemo(() => new Map((submission?.sourceRows ?? []).map(row => [row.id, row])), [submission])
  const activeGroup = findActiveGroup(result, selectedGroup)
  const members = useMemo(() => result && activeGroup !== null ? documents.map((doc, index) => ({ doc, index }))
    .filter(({ index }) => result.assignments[index] === activeGroup) : [], [documents, result, activeGroup])
  const selected = members.find(({ doc }) => doc.id === selectedId)
    ?? members.find(({ index }) => activeGroup !== null && activeGroup >= 0 && index === result?.representativeIndices[activeGroup])
    ?? members[0]
  const saved = history.some(entry => entry.requestId === run.requestId)
  const comparison = history.find(entry => entry.id === compareRecordId) ?? history[0]
  const comparisonIndices = useMemo(() => new Map((comparison?.submission.documents ?? []).map((doc, index) => [doc.id, index])), [comparison])
  const commonDocuments = useMemo(() => documents.map((doc, index) => ({ doc, index, previousIndex: comparisonIndices.get(doc.id) }))
    .filter((entry): entry is { doc: SkillClusteringDocument; index: number; previousIndex: number } => entry.previousIndex !== undefined), [documents, comparisonIndices])
  const compared = commonDocuments.find(({ doc }) => doc.id === compareId) ?? commonDocuments[0]
  const previousRecordMap = useMemo(() => new Map((comparison?.submission.sourceRows ?? []).map(row => [row.id, row])), [comparison])
  const status = loading ? '読み込み中' : busy ? STAGES.find(([stage]) => stage === run.stage)?.[1] ?? '学習中'
    : run.status === 'error' ? '学習エラー' : run.status === 'cancelled' ? '中止'
      : dirty ? '条件変更・未実行' : run.status === 'complete' ? '学習完了' : '未学習'
  const runStatus = <div className="skill-kmeans-status"><span role="status" aria-live="polite">{status}</span>
    {busy && <button type="button" className="button secondary" onClick={() => runner.current?.cancel()}>中止</button>}
  </div>

  function changeTab(next: Tab) {
    setTab(next)
    window.requestAnimationFrame(() => document.getElementById(`${id}-tab-${next}`)?.focus({ preventScroll: true }))
  }
  function start() {
    if (!config || busy || loading || !runner.current) return
    const next: Submission = { documents: structuredClone(corpus.documents), config: { ...config }, sourceRows: structuredClone(rows), sourceRowsIdentity: rows }
    setSubmission(next)
    setSelectedGroup(null)
    setSelectedId('')
    setCompareId('')
    runner.current.start(next.documents, next.config)
    changeTab('results')
  }
  function chooseGroup(group: number) {
    setSelectedGroup(group)
    setSelectedId('')
  }
  function recordExperiment() {
    if (!result || !submission || run.status !== 'complete' || saved) return
    const entry: ExperimentRecord = { id: ++nextRecordId.current, requestId: run.requestId, submission,
      result: structuredClone(result), termsCount: run.termsCount }
    setHistory(current => [entry, ...current].slice(0, 10))
    setCompareRecordId(entry.id)
  }
  const recordAction = <button type="button" className="button secondary" disabled={run.status !== 'complete' || saved} onClick={recordExperiment}>{saved ? '記録済み' : '実験を記録'}</button>

  return <section className="calculator-page skill-kmeans-page skill-hdbscan-page">
    <header className="page-intro"><h1>HDBSCAN 学習ラボ</h1><a className="button secondary" href="#/analysis/skills/kmeans">K-meansへ</a></header>
    <div className="skill-kmeans-content">
      {run.error && <p className="skill-kmeans-error" role="alert">{run.error}</p>}
      <AnalysisTabs tabs={TABS} activeTab={tab} onChange={setTab} idPrefix={id} label="HDBSCAN学習の表示" />
      <AnalysisTabPanel idPrefix={id} tab="settings" activeTab={tab} title="学習条件">
        <form className="analysis-panel-body" onSubmit={event => { event.preventDefault(); start() }}>
          <dl className="skill-kmeans-data"><dt>学習データ</dt><dd>最高レベルのスキル説明文 · {loading ? '読み込み中' : `${corpus.documents.length.toLocaleString('ja-JP')}件`}</dd></dl>
          <section className="skill-kmeans-section">
            <div className="skill-kmeans-section-heading"><h3>実験条件</h3>{runStatus}</div>
            <fieldset className="skill-kmeans-config skill-hdbscan-fields" disabled={busy || loading} aria-label="実験条件">
              <label><span>最小グループ件数</span><input type="number" min="2" max={corpus.documents.length} step="1" required value={draft.minClusterSize}
                onChange={event => setDraft(current => ({ ...current, minClusterSize: event.target.value }))} /></label>
              <label><span>密度判定の近傍数</span><input type="number" min="1" max={corpus.documents.length} step="1" required value={draft.minSamples}
                onChange={event => setDraft(current => ({ ...current, minSamples: event.target.value }))} /></label>
              <label className="skill-hdbscan-field-full"><span>グループの選び方</span><select value={draft.clusterSelectionMethod}
                onChange={event => setDraft(current => ({ ...current, clusterSelectionMethod: event.target.value as Draft['clusterSelectionMethod'] }))}>
                <option value="eom">まとまりを優先</option><option value="leaf">細分化を優先</option>
              </select></label>
            </fieldset>
          </section>
          <div className="skill-kmeans-actions"><button type="submit" className="button" disabled={busy || loading || !config}>学習する</button>
            {!loading && !config && <span className="skill-kmeans-error" role="alert">{corpus.documents.length < 2 ? '学習データ不足' : `整数のみ · 最小グループ件数：2〜${corpus.documents.length} / 近傍数：1〜${corpus.documents.length}`}</span>}
          </div>
        </form>
      </AnalysisTabPanel>
      <AnalysisTabPanel idPrefix={id} tab="results" activeTab={tab} title="学習結果">
        <div className="analysis-panel-body">
          {!result ? <><EmptyResults busy={busy} status={runStatus} onSettings={() => changeTab('settings')} />
            {busy && <ol className="skill-hdbscan-stages" aria-label="処理段階">{STAGES.map(([stage, label]) => <li key={stage} aria-current={stage === run.stage ? 'step' : undefined}>{label}</li>)}</ol>}
          </> : <>
            <section className="skill-kmeans-section">
              <div className="skill-kmeans-result-toolbar"><span>{configLabel(result.config)}</span>{runStatus}</div>
              <dl className="skill-kmeans-metrics"><div><dt>グループ数</dt><dd>{result.counts.length}</dd></div><div><dt>分類済み</dt><dd>{classifiedCount(result)}<span>件</span></dd></div><div><dt>未分類</dt><dd>{result.noiseCount}<span>件 · {usableCount(result) ? `${(result.noiseCount / usableCount(result) * 100).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}%` : '—'}</span></dd></div></dl>
              <dl className="skill-kmeans-data"><dt>学習データ</dt><dd>利用 {usableCount(result)}件 · 除外 {result.excludedCount}件 · 語彙 {run.termsCount}語</dd></dl>
            </section>
            <div className="skill-kmeans-result-content">
              <section className="skill-kmeans-section"><h3>グループ</h3>
                <div className="skill-kmeans-groups skill-hdbscan-groups" aria-label="確認するグループ">
                  {[...result.counts.map((_, group) => group), -1, ...(result.excludedCount > 0 ? [-2] : [])].map(group => {
                    const count = groupCount(result, group)
                    return <button type="button" key={group} className={group < 0 ? 'skill-hdbscan-ungrouped' : undefined} disabled={count === 0}
                      aria-pressed={activeGroup === group} aria-label={`${groupLabel(group)}、${count}件を確認`} onClick={() => chooseGroup(group)}>
                      <span>{groupLabel(group)}</span><span className="skill-kmeans-track" aria-hidden="true"><i style={{ width: `${documents.length ? count / documents.length * 100 : 0}%` }} /></span><span>{count}件</span>
                    </button>
                  })}
                </div>
              </section>
              {selected && activeGroup !== null && <section className="skill-kmeans-inspect"><h3>{groupLabel(activeGroup)} · {members.length}件</h3><div className="skill-kmeans-inspect-body">
                <dl className="skill-kmeans-term-field"><dt>代表語</dt><dd><SkillClusteringRepresentativeTerms terms={activeGroup >= 0 ? result.representativeTerms[activeGroup] : []} /></dd></dl>
                <label><span>スキル</span><select aria-label="グループ内のスキル" value={selected.doc.id} onChange={event => setSelectedId(event.target.value)}>{members.map(({ doc }) => <option key={doc.id} value={doc.id}>{documentLabel(doc)}</option>)}</select></label>
                <SkillClusteringDocumentSource document={selected.doc} recordMap={recordMap} onOpenOperatorDetail={onOpenOperatorDetail} />
              </div></section>}
            </div>
            <div className="skill-kmeans-actions">{recordAction}<button type="button" className="button secondary" onClick={() => changeTab('settings')}>条件を変更</button></div>
          </>}
        </div>
      </AnalysisTabPanel>
      <AnalysisTabPanel idPrefix={id} tab="compare" activeTab={tab} title="比較・診断">
        <div className="analysis-panel-body">
          {!result ? <EmptyResults busy={busy} status={runStatus} onSettings={() => changeTab('settings')} /> : <>
            <section className="skill-kmeans-section skill-kmeans-memberships">
              <div className="skill-kmeans-result-toolbar"><h3>実行結果の比較</h3>{runStatus}</div>
              {comparison ? <>
                <div className="skill-hdbscan-compare-fields"><dl className="skill-kmeans-term-field"><dt>今回</dt><dd>{configLabel(result.config)}</dd></dl>
                  <label><span>比較対象</span><select aria-label="比較する実験" value={comparison.id} onChange={event => setCompareRecordId(Number(event.target.value))}>
                    {history.map(entry => <option key={entry.id} value={entry.id}>記録{entry.id} · {configLabel(entry.result.config)}</option>)}
                  </select></label>
                </div>
                <table className="skill-kmeans-table skill-kmeans-comparison-table" aria-label="学習条件と結果の比較"><ComparisonHead recordId={comparison.id} /><tbody>
                  <ComparisonRow label="最小グループ件数" values={[result.config.minClusterSize, comparison.result.config.minClusterSize].map(value => `${value}件`)} />
                  <ComparisonRow label="密度判定の近傍数" values={[result.config.minSamples, comparison.result.config.minSamples]} />
                  <ComparisonRow label="グループの選び方" values={[result.config, comparison.result.config].map(value => methodLabel(value.clusterSelectionMethod))} />
                  <ComparisonRow label="グループ数" values={[result.counts.length, comparison.result.counts.length]} />
                  <ComparisonRow label="利用データ" values={[result, comparison.result].map(value => `${usableCount(value)}件`)} />
                  <ComparisonRow label="除外" values={[result.excludedCount, comparison.result.excludedCount].map(value => `${value}件`)} />
                  <ComparisonRow label="語彙" values={[run.termsCount, comparison.termsCount].map(value => `${value}語`)} />
                  <ComparisonRow label="未分類" values={[result, comparison.result].map(noiseLabel)} />
                </tbody></table>
              </> : <div className="skill-kmeans-empty"><p>記録なし</p>{recordAction}</div>}
            </section>
            {comparison && <section className="skill-kmeans-section skill-kmeans-memberships">
              <div className="skill-kmeans-section-heading"><h3>所属の比較</h3><span>共通スキル {commonDocuments.length}件</span></div>
              {compared ? <>
                <label><span>スキル{compared.doc.description !== comparison.submission.documents[compared.previousIndex].description && <span role="status"> · 原文変更あり</span>}</span><select aria-label="所属を比較するスキル" value={compared.doc.id} onChange={event => setCompareId(event.target.value)}>{commonDocuments.map(({ doc }) => <option key={doc.id} value={doc.id}>{documentLabel(doc)}</option>)}</select></label>
                <table className="skill-kmeans-table skill-kmeans-comparison-table" aria-label="スキルの所属比較"><ComparisonHead recordId={comparison.id} /><tbody>
                  <ComparisonRow label="所属" values={[groupLabel(result.assignments[compared.index]), groupLabel(comparison.result.assignments[compared.previousIndex])]} />
                  <ComparisonRow label="件数" values={[`${groupCount(result, result.assignments[compared.index])}件`, `${groupCount(comparison.result, comparison.result.assignments[compared.previousIndex])}件`]} />
                  <ComparisonRow label="代表語" values={[<SkillClusteringRepresentativeTerms terms={membershipTerms(result, compared.index)} />,
                    <SkillClusteringRepresentativeTerms terms={membershipTerms(comparison.result, compared.previousIndex)} />]} />
                </tbody></table>
                <div className="skill-hdbscan-compare-sources"><section><h3>今回</h3><SkillClusteringDocumentSource document={compared.doc} recordMap={recordMap} onOpenOperatorDetail={onOpenOperatorDetail} /></section>
                  <section><h3>記録{comparison.id}</h3><SkillClusteringDocumentSource document={comparison.submission.documents[compared.previousIndex]} recordMap={previousRecordMap} onOpenOperatorDetail={onOpenOperatorDetail} /></section>
                </div>
              </> : <div className="skill-kmeans-empty"><p>共通スキルなし</p></div>}
            </section>}
          </>}
          <details className="skill-kmeans-history"><summary>実験の記録 <span>{history.length}件</span></summary>
            <div className="skill-kmeans-actions">{recordAction}</div>
            {history.length > 0 && <table className="skill-kmeans-table skill-kmeans-history-table" aria-label="記録した実験"><thead><tr><th scope="col">記録</th><th scope="col">学習条件</th><th scope="col">結果</th></tr></thead><tbody>
              {history.map(entry => <tr key={entry.id}><th scope="row"><button type="button" className="button secondary" onClick={() => { setCompareRecordId(entry.id); changeTab('compare') }}>記録{entry.id}</button></th><td>{configLabel(entry.result.config)}</td><td>{entry.result.counts.length}グループ<br />未分類 {noiseLabel(entry.result)}</td></tr>)}
            </tbody></table>}
          </details>
        </div>
      </AnalysisTabPanel>
    </div>
  </section>
}

function ComparisonHead({ recordId }: { recordId: number }) {
  return <thead><tr><th scope="col">項目</th><th scope="col">今回</th><th scope="col">記録{recordId}</th></tr></thead>
}

function ComparisonRow({ label, values }: { label: string; values: ReactNode[] }) {
  return <tr><th scope="row">{label}</th>{values.map((value, index) => <td key={index}>{value}</td>)}</tr>
}

function EmptyResults({ busy, status, onSettings }: { busy: boolean; status: ReactNode; onSettings: () => void }) {
  return <div className="skill-kmeans-empty">{status}{!busy && <button type="button" className="button secondary" onClick={onSettings}>条件設定へ</button>}</div>
}
