import { useEffect, useId, useRef, useState } from 'react'
import type { SkillKMeansConfig, SkillKMeansDocument } from '../lib/skillKMeans'
import type { SkillKMeansSearchCandidate, SkillKMeansSearchConfig } from '../lib/skillKMeansSearch'
import { EMPTY_SKILL_KMEANS_SEARCH_RUN, SkillKMeansSearchRunner } from '../lib/skillKMeansSearchRunner'
import { SkillKMeansSearchChart } from './SkillKMeansSearchChart'
import './SkillKMeansSearchPanel.css'

interface Props {
  documents: readonly SkillKMeansDocument[]
  usableDocumentCount?: number
  initialMaxK?: number
  loading: boolean
  learningBusy: boolean
  onBusyChange: (busy: boolean) => void
  onLearn: (config: SkillKMeansConfig, documents: readonly SkillKMeansDocument[]) => void
}
interface Draft { minK: string; maxK: string; seed: string; restarts: string }
interface Submission { documents: readonly SkillKMeansDocument[]; config: SkillKMeansSearchConfig }
const INITIAL_DRAFT: Draft = { minK: '2', maxK: '60', seed: '2', restarts: '10' }
const format = (value: number | null) => value === null ? '—' : value.toLocaleString('ja-JP', { maximumFractionDigits: 4 })
const phaseLabels = { preparing: '距離の計算', fitting: '学習', evaluating: '評価' } as const

function readConfig(draft: Draft, limit: number): SkillKMeansSearchConfig | null {
  if (Object.values(draft).some(value => value.trim() === '' || !Number.isInteger(Number(value)))) return null
  const minK = Number(draft.minK), maxK = Number(draft.maxK), seed = Number(draft.seed), restarts = Number(draft.restarts)
  if (minK < 2 || maxK > limit || minK >= maxK || seed < 0 || seed > 99999 || ![1, 3, 5, 10].includes(restarts)) return null
  return { minK, maxK, seed, restarts, maxIterations: 30 }
}

function candidateStatus(candidate: SkillKMeansSearchCandidate): string {
  if (candidate.actualK !== candidate.k) return `実クラスタ数 ${candidate.actualK}`
  if (candidate.stopReason === 'max-iterations') return `反復上限 ${candidate.iterations}回`
  return candidate.eligible ? '収束' : '評価不可'
}

export function SkillKMeansSearchPanel({ documents, usableDocumentCount = documents.length, initialMaxK = 60, loading, learningBusy, onBusyChange, onLearn }: Props) {
  const [draft, setDraft] = useState<Draft>(() => ({ ...INITIAL_DRAFT, maxK: String(initialMaxK) }))
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [run, setRun] = useState(EMPTY_SKILL_KMEANS_SEARCH_RUN)
  const [selectedK, setSelectedK] = useState<number | null>(null)
  const runner = useRef<SkillKMeansSearchRunner | null>(null)
  const progressId = useId()
  const limit = Math.min(80, usableDocumentCount - 1)
  const config = readConfig(draft, limit)
  const busy = run.status === 'preparing' || run.status === 'running'
  const dirty = submission !== null && (submission.documents !== documents || JSON.stringify(config) !== JSON.stringify(submission.config))
  const result = submission?.documents === documents && run.status === 'complete' ? run.result : null
  const candidate = result?.candidates.find(item => item.k === selectedK)
    ?? result?.candidates.find(item => item.k === result.silhouetteK)
    ?? result?.candidates.find(item => item.k === result.elbowK)
    ?? result?.candidates[0]
  const status = loading ? '読み込み中' : busy ? run.progress ? phaseLabels[run.progress.phase] : '準備中'
    : run.status === 'error' ? '探索エラー' : run.status === 'stopped' ? '探索停止'
      : dirty ? '条件変更・未探索' : run.status === 'complete' ? '探索完了' : '未探索'

  useEffect(() => {
    const instance = new SkillKMeansSearchRunner(setRun)
    runner.current = instance
    setRun(EMPTY_SKILL_KMEANS_SEARCH_RUN)
    setSubmission(null)
    setSelectedK(null)
    return () => { instance.dispose(); if (runner.current === instance) runner.current = null }
  }, [documents])
  useEffect(() => { onBusyChange(busy) }, [busy, onBusyChange])
  useEffect(() => () => onBusyChange(false), [onBusyChange])

  function start() {
    if (!config || loading || learningBusy || busy || !runner.current) return
    setSubmission({ documents, config })
    setSelectedK(null)
    runner.current.start([...documents], config)
  }
  function learn() {
    if (!candidate || !result || !submission || dirty || loading || learningBusy || busy) return
    onLearn({ k: candidate.k, seed: candidate.seed, maxIterations: result.config.maxIterations }, submission.documents)
  }

  return <div className="analysis-panel-body skill-kmeans-search-panel">
    <form className="skill-kmeans-search-form" onSubmit={event => { event.preventDefault(); start() }}>
      <fieldset className="skill-kmeans-search-config" disabled={busy || loading}>
        <div className="skill-kmeans-search-fields">
          <label><span>Kの下限</span><input type="number" min="2" max={Math.max(2, limit)} step="1" value={draft.minK} onChange={event => setDraft(current => ({ ...current, minK: event.target.value }))} /></label>
          <label><span>Kの上限</span><input type="number" min="3" max={Math.max(3, limit)} step="1" value={draft.maxK} onChange={event => setDraft(current => ({ ...current, maxK: event.target.value }))} /></label>
          <button type="submit" className="button" disabled={!config || learningBusy}>探索する</button>
        </div>
        <details className="skill-kmeans-search-settings">
          <summary>探索設定</summary>
          <div className="skill-kmeans-search-fields">
            <label><span>開始 seed</span><input type="number" min="0" max="99999" step="1" value={draft.seed} onChange={event => setDraft(current => ({ ...current, seed: event.target.value }))} /></label>
            <label><span>試行回数 / K</span><select value={draft.restarts} onChange={event => setDraft(current => ({ ...current, restarts: event.target.value }))}>{[1, 3, 5, 10].map(count => <option key={count} value={count}>{count}回</option>)}</select></label>
          </div>
        </details>
      </fieldset>
      {!loading && !config && <p className="skill-kmeans-error" role="alert">{limit < 3 ? '探索データ不足（4件以上）' : `整数のみ · 2 ≤ Kの下限 ＜ Kの上限 ≤ ${limit} / seed：0〜99999`}</p>}
    </form>
    <div className="skill-kmeans-search-state">
      <div className="skill-kmeans-status"><span role="status" aria-live="polite">{status}{busy && run.progress ? ` ${run.progress.completed.toLocaleString('ja-JP')} / ${run.progress.total.toLocaleString('ja-JP')}` : ''}</span>
        {busy && <button type="button" className="button secondary" onClick={() => runner.current?.stop()}>探索を停止</button>}
        {!busy && learningBusy && <span>学習中</span>}
      </div>
      <span>{(result?.documentCount ?? usableDocumentCount).toLocaleString('ja-JP')}件 · 反復上限 30</span>
    </div>
    {busy && run.progress && <progress id={progressId} aria-label={`${phaseLabels[run.progress.phase]}の進捗`} value={run.progress.completed} max={Math.max(1, run.progress.total)} />}
    {run.error && <p className="skill-kmeans-error" role="alert">{run.error}</p>}
    {result && candidate && <>
      {dirty && <dl className="skill-kmeans-data"><dt>表示中の探索条件</dt><dd>K {result.config.minK}〜{result.config.maxK} · seed {result.config.seed}〜 · {result.config.restarts}回 / K</dd></dl>}
      {result.excludedCount > 0 && <dl className="skill-kmeans-data"><dt>学習データ</dt><dd>利用 {result.documentCount}件 · 除外 {result.excludedCount}件</dd></dl>}
      <div className="skill-kmeans-search-charts">
        <SkillKMeansSearchChart candidates={result.candidates} metric="silhouette" selectedK={candidate.k} candidateK={result.silhouetteK} onSelect={setSelectedK} />
        <SkillKMeansSearchChart candidates={result.candidates} metric="meanSquaredDistance" selectedK={candidate.k} candidateK={result.elbowK} onSelect={setSelectedK} />
      </div>
      <section className="skill-kmeans-search-selection" aria-label="学習する条件">
        <div className="skill-kmeans-search-readout">
          <label><span>選択中の K</span><select value={candidate.k} onChange={event => setSelectedK(Number(event.target.value))}>{result.candidates.map(item => <option key={item.k} value={item.k}>K = {item.k}</option>)}</select></label>
          <dl><dt>seed</dt><dd>{candidate.seed}</dd></dl>
          <dl><dt>シルエット</dt><dd>{format(candidate.silhouette)}</dd></dl>
          <dl><dt>平均二乗距離</dt><dd>{format(candidate.meanSquaredDistance)}</dd></dl>
        </div>
        <div className="skill-kmeans-section-heading"><span className="skill-kmeans-stop-state">{candidateStatus(candidate)} · {candidate.iterations}反復</span></div>
        <div className="skill-kmeans-actions">
          <button type="button" className="button" disabled={dirty || loading || learningBusy || busy} onClick={learn}>このKで学習</button>
        </div>
      </section>
    </>}
  </div>
}
