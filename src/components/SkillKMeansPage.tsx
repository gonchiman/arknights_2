import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import type { SkillRecord } from '../types/skill'
import { buildSkillKMeansCorpus, type SkillKMeansConfig, type SkillKMeansDocument, type SkillKMeansResult } from '../lib/skillKMeans'
import { EMPTY_SKILL_KMEANS_RUN, SkillKMeansRunner } from '../lib/skillKMeansRunner'
import { AnalysisTabs, AnalysisTabPanel } from './AnalysisTabs'
import type { OpenOperatorDetail } from './OperatorDetailLink'
import { SkillKMeansGroupTable } from './SkillKMeansGroupTable'
import { SkillKMeansLearningChart } from './SkillKMeansLearningChart'
import { SkillKMeansSearchPanel } from './SkillKMeansSearchPanel'
import './DamageCalculator.css'
import './SkillKMeansPage.css'

interface Props { rows: SkillRecord[]; loading: boolean; onOpenOperatorDetail: OpenOperatorDetail }
const TABS = [['search', 'K探索'], ['learning', '学習'], ['groups', 'グループ']] as const
type Tab = typeof TABS[number][0]
const GROUP_PAGE_SIZE = 8
interface Submission { documents: SkillKMeansDocument[]; config: SkillKMeansConfig; sourceRows: readonly SkillRecord[] }
const configLabel = (config: SkillKMeansConfig) => `K=${config.k} · seed=${config.seed} · 反復上限 ${config.maxIterations}`

export function SkillKMeansPage({ rows, loading, onOpenOperatorDetail }: Props) {
  const corpus = useMemo(() => buildSkillKMeansCorpus(rows), [rows])
  const [tab, setTab] = useState<Tab>('search')
  const [selectedId, setSelectedId] = useState('')
  const [groupPage, setGroupPage] = useState(0)
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [run, setRun] = useState(EMPTY_SKILL_KMEANS_RUN)
  const [searchBusy, setSearchBusy] = useState(false)
  const runner = useRef<SkillKMeansRunner | null>(null)
  const id = useId()

  useEffect(() => {
    const instance = new SkillKMeansRunner(setRun)
    runner.current = instance
    setRun(EMPTY_SKILL_KMEANS_RUN)
    setSubmission(null)
    setSelectedId('')
    setGroupPage(0)
    return () => { instance.dispose(); if (runner.current === instance) runner.current = null }
  }, [rows])

  const current = submission?.sourceRows === rows
  const busy = current && ['preparing', 'running', 'pausing'].includes(run.status)
  const result = current ? run.result : null
  const complete = result !== null && run.status === 'complete'
  const documents = current ? submission.documents : []
  const recordMap = useMemo(() => new Map(rows.map(row => [row.id, row])), [rows])
  const selectedIndex = result ? findDocumentIndex(documents, result, selectedId) : -1
  const selectedGroup = result && selectedIndex >= 0 ? result.assignments[selectedIndex] : -1
  const members = result ? documents.map((doc, index) => ({ doc, index }))
    .filter(({ index }) => result.assignments[index] === selectedGroup && selectedGroup >= 0) : []
  const usableCount = result?.counts.reduce((sum, count) => sum + count, 0) ?? 0
  const groups = result?.counts.map((count, group) => ({ count, group })).filter(({ count }) => count > 0) ?? []
  const groupPages = Math.ceil(groups.length / GROUP_PAGE_SIZE)
  const activeGroupPage = Math.max(0, Math.min(groupPage, groupPages - 1))
  const status = loading ? '読み込み中' : !current ? '未学習' : run.status === 'preparing' ? '準備中'
    : run.status === 'pausing' ? '停止中' : run.status === 'running' ? '学習中'
      : run.status === 'error' ? '学習エラー' : run.status === 'paused' ? '一時停止'
        : complete ? result.stopReason === 'max-iterations' ? '反復上限' : '収束' : '未学習'
  const runStatus = <span role="status" aria-live="polite">{status}</span>

  function focusTab(next: Tab) {
    setTab(next)
    window.requestAnimationFrame(() => document.getElementById(`${id}-tab-${next}`)?.focus())
  }
  function start(config: SkillKMeansConfig, sourceDocuments: readonly SkillKMeansDocument[], stepOnly = false) {
    if (busy || searchBusy || loading || !runner.current) return
    const next: Submission = { documents: [...sourceDocuments], config: { ...config }, sourceRows: rows }
    setSubmission(next)
    setSelectedId('')
    setGroupPage(0)
    runner.current.start(next.documents, next.config, stepOnly)
    focusTab('learning')
  }
  function learnCandidate(config: SkillKMeansConfig, sourceDocuments: readonly SkillKMeansDocument[]) {
    // A refreshed corpus must never use a candidate calculated from the previous documents.
    if (sourceDocuments !== corpus.documents) return
    start(config, sourceDocuments)
  }
  function restart(stepOnly: boolean) {
    if (current) start(submission.config, submission.documents, stepOnly)
  }
  function chooseGroup(group: number) {
    if (!result) return
    const index = result.representativeIndices[group]
    if (index >= 0 && documents[index]) setSelectedId(documents[index].id)
  }
  function changeGroupPage(page: number) {
    setGroupPage(page)
    const first = groups[page * GROUP_PAGE_SIZE]
    if (first) chooseGroup(first.group)
  }

  return <section className="calculator-page skill-kmeans-page">
    <header className="page-intro"><h1>K-means 学習ラボ</h1><div className="skill-kmeans-actions"><a className="button secondary" href="#/analysis/skills/hierarchical">階層クラスタリングへ</a><a className="button secondary" href="#/skill-classification">スキル大分類へ</a></div></header>
    <div className="skill-kmeans-content">
      <AnalysisTabs tabs={TABS} activeTab={tab} onChange={setTab} idPrefix={id} label="K-means学習の表示" />
      <AnalysisTabPanel idPrefix={id} tab="search" activeTab={tab} title="K探索">
        <SkillKMeansSearchPanel documents={corpus.documents} loading={loading} learningBusy={busy} onBusyChange={setSearchBusy} onLearn={learnCandidate} />
      </AnalysisTabPanel>
      <AnalysisTabPanel idPrefix={id} tab="learning" activeTab={tab} title="学習">
        <div className="analysis-panel-body">
          <div className="skill-kmeans-result-toolbar">
            {current && <span className="skill-kmeans-result-state">{configLabel(submission.config)}</span>}
            <div className="skill-kmeans-status">{runStatus}</div>
          </div>
          {current && run.error && <p className="skill-kmeans-error" role="alert">{run.error}</p>}
          {current && <div className="skill-kmeans-actions">
            {busy && <button type="button" className="button secondary" disabled={run.status === 'pausing'} onClick={() => runner.current?.pause()}>一時停止</button>}
            {run.status === 'paused' && <>
              <button type="button" className="button secondary" disabled={searchBusy || loading} onClick={() => runner.current?.step()}>次の1反復</button>
              <button type="button" className="button secondary" disabled={searchBusy || loading} onClick={() => runner.current?.resume()}>続けて学習</button>
            </>}
            {(complete || run.status === 'error') && <button type="button" className="button secondary" disabled={searchBusy || loading} onClick={() => restart(true)}>1反復から確認</button>}
            {run.status === 'error' && <button type="button" className="button secondary" disabled={searchBusy || loading} onClick={() => restart(false)}>再実行</button>}
          </div>}
          {result && <SkillKMeansLearningChart key={run.requestId} result={result} status={null} />}
          {result && documents.length > usableCount && <dl className="skill-kmeans-data"><dt>学習データ</dt><dd>利用 {usableCount}件 · 除外 {documents.length - usableCount}件</dd></dl>}
          <div className="skill-kmeans-navigation">
            <button type="button" className="button secondary" onClick={() => focusTab('search')}>{current ? 'Kを選び直す' : 'K探索へ'}</button>
            {result && <button type="button" className="button" disabled={!complete || loading} onClick={() => focusTab('groups')}>グループを見る</button>}
          </div>
        </div>
      </AnalysisTabPanel>
      <AnalysisTabPanel idPrefix={id} tab="groups" activeTab={tab} title="グループ">
        <div className="analysis-panel-body">
          {!complete ? <EmptyGroups status={runStatus} hasRun={current} onNavigate={() => focusTab(current ? 'learning' : 'search')} /> : <>
            <div className="skill-kmeans-result-state">{configLabel(result.config)}</div>
            <div className="skill-kmeans-result-content skill-kmeans-group-table-layout">
              <section className="skill-kmeans-section"><h3>{groups.length}グループ</h3>
                <div className="skill-kmeans-groups skill-kmeans-document-groups" aria-label="確認するグループ">
                  {groups.slice(activeGroupPage * GROUP_PAGE_SIZE, (activeGroupPage + 1) * GROUP_PAGE_SIZE).map(({ count, group }) => {
                    return <button type="button" key={group} aria-pressed={selectedGroup === group}
                      aria-label={`G${group + 1}、${count}説明文を確認`} onClick={() => chooseGroup(group)}>
                      <span>G{group + 1}</span><span className="skill-kmeans-track"><i style={{ width: `${usableCount ? count / usableCount * 100 : 0}%` }} /></span><span>{count}説明文</span>
                    </button>
                  })}
                </div>
                {groupPages > 1 && <div className="skill-kmeans-pagination">
                  <button type="button" className="button secondary" aria-label="前のグループ一覧" disabled={activeGroupPage === 0} onClick={() => changeGroupPage(activeGroupPage - 1)}>前へ</button>
                  <span>{activeGroupPage + 1} / {groupPages}</span>
                  <button type="button" className="button secondary" aria-label="次のグループ一覧" disabled={activeGroupPage + 1 === groupPages} onClick={() => changeGroupPage(activeGroupPage + 1)}>次へ</button>
                </div>}
              </section>
              {selectedGroup >= 0 && <SkillKMeansGroupTable key={`${run.requestId}:${selectedGroup}`} group={selectedGroup}
                documents={members.map(({ doc }) => doc)} recordMap={recordMap} terms={result.representativeTerms[selectedGroup]} onOpenOperatorDetail={onOpenOperatorDetail} />}
            </div>
            <div className="skill-kmeans-navigation">
              <button type="button" className="button secondary" onClick={() => focusTab('search')}>Kを選び直す</button>
              <button type="button" className="button secondary" onClick={() => focusTab('learning')}>学習過程を見る</button>
            </div>
          </>}
        </div>
      </AnalysisTabPanel>
    </div>
  </section>
}

function findDocumentIndex(documents: readonly SkillKMeansDocument[], result: SkillKMeansResult, id: string) {
  const index = documents.findIndex(doc => doc.id === id)
  return index >= 0 && result.assignments[index] >= 0 ? index : result.representativeIndices.find(value => value >= 0) ?? -1
}

function EmptyGroups({ status, hasRun, onNavigate }: { status: ReactNode; hasRun: boolean; onNavigate: () => void }) {
  return <div className="skill-kmeans-empty">{status}
    <button type="button" className="button secondary" onClick={onNavigate}>{hasRun ? '学習へ' : 'K探索へ'}</button>
  </div>
}
