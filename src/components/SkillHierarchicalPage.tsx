import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { SkillRecord } from '../types/skill'
import { buildSkillClusteringCorpus, type SkillClusteringDocument } from '../lib/skillClusteringData'
import { cutSkillHierarchy, type HierarchicalLinkage } from '../lib/skillHierarchical'
import { getSkillHierarchyFrontier } from '../lib/skillHierarchyView'
import { EMPTY_SKILL_HIERARCHICAL_RUN, SkillHierarchicalRunner } from '../lib/skillHierarchicalRunner'
import { AnalysisTabs, AnalysisTabPanel } from './AnalysisTabs'
import { SkillClusteringSource, SkillClusteringTerms } from './SkillClusteringSource'
import { SkillHierarchyDendrogram } from './SkillHierarchyDendrogram'
import type { OpenOperatorDetail } from './OperatorDetailLink'
import './DamageCalculator.css'
import './SkillHierarchicalPage.css'

interface Props { rows: SkillRecord[]; loading: boolean; onOpenOperatorDetail: OpenOperatorDetail }
interface Submission { documents: SkillClusteringDocument[]; sourceRows: readonly SkillRecord[]; linkage: HierarchicalLinkage }
const TABS = [['settings', '条件設定'], ['results', '学習結果'], ['groups', 'グループ']] as const
type Tab = typeof TABS[number][0]
const MEMBER_PAGE_SIZE = 12
const GROUP_PAGE_SIZE = 10
const numberFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 4 })
const phaseLabels = { features: '説明文の数値化', distances: '距離の計算', merging: '階層の作成', evaluating: '区切りの評価' } as const
const linkageLabel = (value: HierarchicalLinkage) => value === 'average' ? '平均連結' : '完全連結'

export function SkillHierarchicalPage({ rows, loading, onOpenOperatorDetail }: Props) {
  const corpus = useMemo(() => buildSkillClusteringCorpus(rows), [rows])
  const [tab, setTab] = useState<Tab>('settings')
  const [linkage, setLinkage] = useState<HierarchicalLinkage>('average')
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [run, setRun] = useState(EMPTY_SKILL_HIERARCHICAL_RUN)
  const [mode, setMode] = useState<'auto' | 'manual'>('auto')
  const [manualThreshold, setManualThreshold] = useState(0.5)
  const [focusId, setFocusId] = useState<number | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const [selectedDocumentId, setSelectedDocumentId] = useState('')
  const [groupPage, setGroupPage] = useState(0)
  const [memberPage, setMemberPage] = useState(0)
  const id = useId()
  const runner = useRef<SkillHierarchicalRunner | null>(null)
  useEffect(() => {
    const instance = new SkillHierarchicalRunner(setRun)
    runner.current = instance
    return () => { instance.dispose(); if (runner.current === instance) runner.current = null }
  }, [])
  const tree = run.tree
  const documents = submission?.documents ?? []
  const busy = run.status === 'preparing' || run.status === 'running'
  const dirty = submission !== null && (submission.linkage !== linkage || submission.sourceRows !== rows)
  const threshold = tree ? mode === 'auto' ? tree.recommendedThreshold : manualThreshold : 0.5
  const groupIds = useMemo(() => tree ? cutSkillHierarchy(tree, threshold) : [], [tree, threshold])
  const groupIndex = useMemo(() => new Map(groupIds.map((nodeId, index) => [nodeId, index])), [groupIds])
  const groupForDocument = useMemo(() => {
    const mapping = new Map<number, number>()
    if (tree) groupIds.forEach(nodeId => tree.nodes[nodeId].documentIndices.forEach(index => mapping.set(index, nodeId)))
    return mapping
  }, [tree, groupIds])
  const defaultSelectedId = useMemo(() => tree
    ? getSkillHierarchyFrontier(tree, focusId ?? tree.rootId, threshold, null, expanded)[0] : undefined,
  [tree, focusId, threshold, expanded])
  const selected = tree?.nodes[selectedId ?? -1] ?? tree?.nodes[defaultSelectedId ?? -1]
  const selectedContainingGroup = selected && selected.documentIndices.length > 0
    ? groupForDocument.get(selected.documentIndices[0]) : undefined
  const activeGroupId = selectedGroupId !== null && tree?.nodes[selectedGroupId] ? selectedGroupId : groupIds[0]
  const activeGroup = tree?.nodes[activeGroupId]
  const memberIndices = activeGroup?.documentIndices ?? []
  const selectedDocument = memberIndices.map(index => documents[index]).find(doc => doc?.id === selectedDocumentId)
    ?? documents[memberIndices[0]]
  const recordMap = useMemo(() => new Map((submission?.sourceRows ?? rows).map(row => [row.id, row])), [submission, rows])
  const groupPages = Math.max(1, Math.ceil(groupIds.length / GROUP_PAGE_SIZE))
  const activeGroupPage = Math.min(groupPage, groupPages - 1)
  const memberPages = Math.max(1, Math.ceil(memberIndices.length / MEMBER_PAGE_SIZE))
  const activeMemberPage = Math.min(memberPage, memberPages - 1)
  const partitionCurrent = !!run.partition && Math.abs(run.partition.threshold - threshold) < 1e-12
  const score = partitionCurrent ? run.partition!.silhouette : null
  const status = loading ? '読み込み中' : busy ? '学習中' : run.status === 'error' ? '学習エラー'
    : run.status === 'cancelled' ? '学習中止' : dirty ? '条件変更・未実行' : run.status === 'complete' ? '学習完了' : '未学習'

  useEffect(() => {
    if (!tree) return
    setFocusId(tree.rootId)
    setExpanded(false)
    setSelectedId(null)
    setSelectedGroupId(null)
    setSelectedDocumentId('')
    setManualThreshold(tree.recommendedThreshold)
    setMode('auto')
    setGroupPage(0)
    setMemberPage(0)
  }, [tree])
  // Cut evaluation stays in the worker; dragging only recuts the already computed tree.
  useEffect(() => {
    if (!tree || run.status !== 'complete' || partitionCurrent) return
    const timeout = window.setTimeout(() => runner.current?.setThreshold(threshold), 120)
    return () => window.clearTimeout(timeout)
  }, [tree, threshold, run.status, partitionCurrent])
  const goTo = (next: Tab) => {
    setTab(next)
    requestAnimationFrame(() => document.getElementById(`${id}-tab-${next}`)?.focus({ preventScroll: true }))
  }
  const start = () => {
    if (busy || loading || !corpus.documents.length || !runner.current) return
    const next = { documents: [...corpus.documents], sourceRows: rows, linkage }
    setSubmission(next)
    setMode('auto')
    setSelectedId(null)
    runner.current.start(next.documents, linkage)
    goTo('results')
  }
  const changeThreshold = (value: number) => {
    if (!Number.isFinite(value)) return
    setManualThreshold(Math.max(0, Math.min(1, value)))
    setSelectedId(null)
    setSelectedGroupId(null)
    setSelectedDocumentId('')
    setMemberPage(0)
    setGroupPage(0)
  }
  const changeMode = (value: 'auto' | 'manual') => {
    if (value === 'manual') setManualThreshold(threshold)
    setMode(value)
    setSelectedId(null)
    setSelectedGroupId(null)
    setSelectedDocumentId('')
    setMemberPage(0)
    setGroupPage(0)
    setFocusId(tree?.rootId ?? null)
    setExpanded(false)
  }
  const chooseGroup = (nodeId: number) => {
    setSelectedGroupId(nodeId)
    setSelectedId(nodeId)
    setSelectedDocumentId('')
    setMemberPage(0)
  }
  const nodeLabel = (nodeId: number) => groupIndex.has(nodeId) ? `G${groupIndex.get(nodeId)! + 1}` : `枝 ${nodeId + 1}`
  const runState = <div className="skill-hierarchy-run-state"><span role="status" aria-live="polite">{status}</span>
    {busy && <button type="button" className="button secondary" onClick={() => runner.current?.cancel()}>学習を中止</button>}</div>
  const empty = (panel: Tab) => <div className="skill-hierarchy-empty">{runState}
    {busy && run.progress && <div className="skill-hierarchy-progress"><label htmlFor={`${id}-${panel}-progress`}>{phaseLabels[run.progress.phase]} <span>{run.progress.completed} / {run.progress.total}</span></label>
      <progress id={`${id}-${panel}-progress`} value={run.progress.completed} max={Math.max(1, run.progress.total)} /></div>}
    {!busy && <button type="button" className="button secondary" onClick={() => goTo('settings')}>条件設定へ</button>}</div>

  return <section className="calculator-page skill-hierarchy-page">
    <header className="page-intro"><h1>階層クラスタリング 学習ラボ</h1><div className="skill-hierarchy-actions"><a className="button secondary" href="#/analysis/skills/kmeans">K-meansへ</a><a className="button secondary" href="#/skill-classification">スキル大分類へ</a></div></header>
    <div className="skill-hierarchy-content">
      {run.error && <p className="skill-hierarchy-error" role="alert">{run.error}</p>}
      <AnalysisTabs tabs={TABS} activeTab={tab} onChange={setTab} idPrefix={id} label="階層クラスタリングの表示" />
      <AnalysisTabPanel idPrefix={id} tab="settings" activeTab={tab} title="学習条件">
        <form className="analysis-panel-body" onSubmit={event => { event.preventDefault(); start() }}>
          <dl className="skill-hierarchy-data"><dt>学習データ</dt><dd>最高レベルのスキル説明文 · {loading ? '読み込み中' : `${corpus.documents.length.toLocaleString('ja-JP')}件`}</dd></dl>
          <div className="skill-hierarchy-fields">
            <dl><dt>特徴量</dt><dd>TF-IDF · 語句</dd></dl>
            <dl><dt>距離</dt><dd>コサイン距離</dd></dl>
            <label><span>結合法</span><select value={linkage} disabled={busy || loading} onChange={event => setLinkage(event.target.value as HierarchicalLinkage)}><option value="average">平均連結</option><option value="complete">完全連結</option></select></label>
            <dl><dt>自動選択の評価</dt><dd>シルエット係数 · 2〜30分類</dd></dl>
          </div>
          <div className="skill-hierarchy-actions"><button type="submit" className="button" disabled={busy || loading || corpus.documents.length === 0}>学習する</button>{runState}</div>
        </form>
      </AnalysisTabPanel>
      <AnalysisTabPanel idPrefix={id} tab="results" activeTab={tab} title="階層と分類">
        <div className="analysis-panel-body">
          {!tree ? empty('results') : <>
            <div className="skill-hierarchy-cut-controls">
              <label><span>分類の区切り</span><select value={mode} onChange={event => changeMode(event.target.value as 'auto' | 'manual')}><option value="auto">自動</option><option value="manual">距離を指定</option></select></label>
              <label className="skill-hierarchy-distance"><span>区切り距離 <output>{numberFormat.format(threshold)}</output></span>
                <input aria-label="区切り距離" type="range" min="0" max="1" step="0.0001" disabled={mode === 'auto'} value={threshold} onChange={event => changeThreshold(Number(event.target.value))} /></label>
            </div>
            <dl className="skill-hierarchy-metrics" aria-live="polite">
              <div><dt>分類数</dt><dd>{groupIds.length}</dd></div><div><dt>対象</dt><dd>{tree.documentIndices.length}件</dd></div>
              <div><dt>シルエット係数</dt><dd>{run.status === 'error' ? '計算エラー' : !partitionCurrent || run.cutPending ? '計算中' : score === null ? '—' : numberFormat.format(score)}</dd></div>
            </dl>
            <div className="skill-hierarchy-result-state"><span>{linkageLabel(tree.linkage)} · {mode === 'auto' ? tree.autoCandidates.length ? '自動選択' : '自動候補なし' : '距離指定'}</span>
              {tree.excludedIndices.length > 0 && <span>特徴量なし {tree.excludedIndices.length}件</span>}{runState}</div>
            {tree.rootId < 0 ? <div className="skill-hierarchy-empty">分類できる語句がありません。</div> : <>
              <SkillHierarchyDendrogram tree={tree} documents={documents} threshold={threshold} groupNodeIds={groupIds}
                selectedId={selected?.id ?? null} focusId={focusId ?? tree.rootId} expanded={expanded}
                onSelect={setSelectedId} onFocus={(nodeId, open) => { setFocusId(nodeId); setExpanded(open) }} />
              {selected && <section className="skill-hierarchy-selected"><div className="skill-hierarchy-selected-heading"><h3>{nodeLabel(selected.id)} · {selected.count}件</h3><span>結合距離 {numberFormat.format(selected.distance)}</span></div>
                <div className="skill-hierarchy-selected-body"><dl className="skill-hierarchy-terms"><dt>代表語</dt><dd><SkillClusteringTerms terms={selected.representativeTerms} /></dd></dl>
                  <div className="skill-hierarchy-actions"><button type="button" className="button secondary" disabled={selected.left === null} onClick={() => { setFocusId(selected.id); setExpanded(true) }}>枝を開く</button>
                    <button type="button" className="button secondary" onClick={() => { chooseGroup(selected.id); setGroupPage(Math.floor((groupIndex.get(selectedContainingGroup ?? -1) ?? 0) / GROUP_PAGE_SIZE)); goTo('groups') }}>スキルを見る</button></div>
                </div></section>}
            </>}
          </>}
        </div>
      </AnalysisTabPanel>
      <AnalysisTabPanel idPrefix={id} tab="groups" activeTab={tab} title="グループの確認">
        <div className="analysis-panel-body">
          {!tree ? empty('groups') : !activeGroup ? <div className="skill-hierarchy-empty">分類できる語句がありません。</div> : <div className="skill-hierarchy-group-layout">
            <section><h3>グループ · {groupIds.length}分類</h3><div className="skill-hierarchy-groups" aria-label="確認するグループ">
              {groupIds.slice(activeGroupPage * GROUP_PAGE_SIZE, (activeGroupPage + 1) * GROUP_PAGE_SIZE).map(nodeId => <button type="button" key={nodeId} aria-pressed={nodeId === activeGroupId} onClick={() => chooseGroup(nodeId)}
                aria-label={`G${groupIndex.get(nodeId)! + 1}、${tree.nodes[nodeId].count}件`}><span>G{groupIndex.get(nodeId)! + 1}</span><span className="skill-hierarchy-track"><i style={{ width: `${100 * tree.nodes[nodeId].count / tree.documentIndices.length}%` }} /></span><span>{tree.nodes[nodeId].count}件</span></button>)}
            </div>
              {groupPages > 1 && <div className="skill-hierarchy-pagination"><button type="button" className="button secondary" disabled={activeGroupPage === 0} aria-label="前のグループ一覧" onClick={() => setGroupPage(activeGroupPage - 1)}>前へ</button><span>{activeGroupPage + 1} / {groupPages}</span><button type="button" className="button secondary" disabled={activeGroupPage === groupPages - 1} aria-label="次のグループ一覧" onClick={() => setGroupPage(activeGroupPage + 1)}>次へ</button></div>}
            </section>
            <section className="skill-hierarchy-group-content"><div className="skill-hierarchy-group-heading"><h3>{nodeLabel(activeGroupId)} · {activeGroup.count}件</h3><button type="button" className="button secondary" onClick={() => { setSelectedId(activeGroupId); setFocusId(activeGroupId); setExpanded(false); goTo('results') }}>樹形図で見る</button></div>
              <dl className="skill-hierarchy-terms"><dt>代表語</dt><dd><SkillClusteringTerms terms={activeGroup.representativeTerms} /></dd></dl>
              <table className="skill-hierarchy-table" aria-label="グループ内のスキル"><thead><tr><th scope="col">オペレーター</th><th scope="col">スキル</th></tr></thead><tbody>
                {memberIndices.slice(activeMemberPage * MEMBER_PAGE_SIZE, (activeMemberPage + 1) * MEMBER_PAGE_SIZE).map(index => {
                  const doc = documents[index]
                  return <tr key={doc.id} className={doc.id === selectedDocument?.id ? 'selected' : ''}><td>{doc.operatorName}</td><td><button type="button" className="skill-hierarchy-skill-link" aria-pressed={doc.id === selectedDocument?.id} onClick={() => setSelectedDocumentId(doc.id)}>S{doc.skillIndex} · {doc.skillName}</button></td></tr>
                })}
              </tbody></table>
              {memberPages > 1 && <div className="skill-hierarchy-pagination"><span>{activeMemberPage * MEMBER_PAGE_SIZE + 1}〜{Math.min(memberIndices.length, (activeMemberPage + 1) * MEMBER_PAGE_SIZE)} / {memberIndices.length}件</span>
                <button type="button" className="button secondary" disabled={activeMemberPage === 0} aria-label="前のスキル一覧" onClick={() => { setMemberPage(activeMemberPage - 1); setSelectedDocumentId(documents[memberIndices[(activeMemberPage - 1) * MEMBER_PAGE_SIZE]].id) }}>前へ</button>
                <button type="button" className="button secondary" disabled={activeMemberPage === memberPages - 1} aria-label="次のスキル一覧" onClick={() => { setMemberPage(activeMemberPage + 1); setSelectedDocumentId(documents[memberIndices[(activeMemberPage + 1) * MEMBER_PAGE_SIZE]].id) }}>次へ</button></div>}
              {selectedDocument && <SkillClusteringSource document={selectedDocument} recordMap={recordMap} onOpenOperatorDetail={onOpenOperatorDetail} />}
            </section>
          </div>}
        </div>
      </AnalysisTabPanel>
    </div>
  </section>
}
