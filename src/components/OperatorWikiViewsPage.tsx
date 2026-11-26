import { useId, useMemo, useRef, useState, type RefObject } from 'react'
import { STANDARD_PAGE_TITLES } from '../lib/navigation'
import { EMPTY_OPERATOR_DATABASE_FILTERS, type OperatorDatabaseFilters, type OperatorDatabaseRecord } from '../lib/operatorDatabase'
import { getProfessionLabel, PROFESSION_ORDER } from '../lib/operatorFilters'
import {
  calculateOperatorWikiAnalysis, getWikiAnalysisThroughDate, loadOperatorWikiAnalysisHistory, type WikiAnalysisPeriod,
} from '../lib/operatorWikiAnalysis'
import {
  getWikiCommentCount, getWikiCommentRange, loadOperatorWikiCommentSnapshot, WIKI_COMMENT_PERIODS,
  type OperatorWikiCommentSnapshot,
} from '../lib/operatorWikiComments'
import {
  buildOperatorWikiDisplayRoster, filterOperatorWikiDisplayRoster, matchOperatorWikiDisplayEntries,
  type OperatorWikiDisplayEntry,
} from '../lib/operatorWikiDisplay'
import { loadOperatorWikiRoster, type OperatorWikiRosterEntry } from '../lib/operatorWikiRoster'
import { loadOperatorWikiViewSnapshot, rankOperatorWikiTotals, type OperatorWikiViewSnapshot } from '../lib/operatorWikiViews'
import { AnalysisTabPanel } from './AnalysisTabs'
import { ComparisonTableImageDialog, type ComparisonTableImageSnapshot } from './ComparisonTableImageDialog'
import { Filters, FilterResetButton } from './Filters'
import {
  canSaveWikiAnalysisImage, OperatorWikiAnalysisPanel, WIKI_ANALYSIS_VIEWS, type WikiAnalysisView,
} from './OperatorWikiAnalysisPanel'
import { OutputImageSaveButton } from './OutputImageSaveButton'
import { PageLayout, PageOutputHeader, PageOutputTabs } from './PageLayout'
import { viewLabel } from './PageViewSwitch'
import {
  formatWikiObservedTime, getWikiViewColumns, ObservedTime, useWikiSnapshot, WikiDateRange, WikiPeriodButtons, WikiStatsTable,
  type SnapshotState, type WikiStatsPeriod,
} from './WikiStatsTable'
import './DamageCalculator.css'
import './OperatorWikiViewsPage.css'

interface Props {
  operators: readonly OperatorDatabaseRecord[]
  loading: boolean
}

interface PanelProps<Snapshot> {
  operators: readonly OperatorWikiDisplayEntry[]
  allOperators: readonly OperatorWikiDisplayEntry[]
  loading: boolean
  page: number
  setPage: (page: number) => void
  state: SnapshotState<Snapshot>
  imageRef: RefObject<(() => ComparisonTableImageSnapshot) | null>
  filterConditions: readonly string[]
}

const TABS = [['views', '閲覧数'], ['comments', 'コメント'], ['analysis', '統計分析']] as const
type Tab = typeof TABS[number][0]
const PROFESSION_OPTIONS = PROFESSION_ORDER.map(value => ({ value, label: getProfessionLabel(value) }))

const COMMENT_COLUMNS = [{ key: 'comments', label: 'コメント件数' }] as const
const EMPTY_WIKI_ROSTER: readonly OperatorWikiRosterEntry[] = []

export function OperatorWikiViewsPage({ operators, loading }: Props) {
  const id = useId()
  const rosterState = useWikiSnapshot(loadOperatorWikiRoster)
  const wikiRoster = rosterState.status === 'ready' ? rosterState.snapshot.entries : EMPTY_WIKI_ROSTER
  const allOperators = useMemo(() => buildOperatorWikiDisplayRoster(operators, wikiRoster), [operators, wikiRoster])
  const waitingForOperators = allOperators.length === 0 && (rosterState.status === 'loading' || loading)
  const [tab, setTab] = useState<Tab>('views')
  const [commentsOpened, setCommentsOpened] = useState(false)
  const [analysisOpened, setAnalysisOpened] = useState(false)
  const [analysisView, setAnalysisView] = useState<WikiAnalysisView>('summary')
  const [analysisPeriod, setAnalysisPeriod] = useState<WikiAnalysisPeriod>(7)
  const viewState = useWikiSnapshot(loadOperatorWikiViewSnapshot)
  const commentState = useWikiSnapshot(loadOperatorWikiCommentSnapshot, commentsOpened || analysisOpened)
  const [filters, setFilters] = useState(EMPTY_OPERATOR_DATABASE_FILTERS)
  const [viewPage, setViewPage] = useState(0)
  const [commentPage, setCommentPage] = useState(0)
  const filteredOperators = useMemo(() => filterOperatorWikiDisplayRoster(allOperators, filters), [allOperators, filters])
  const throughDate = viewState.status === 'ready' && commentState.status === 'ready'
    ? getWikiAnalysisThroughDate(viewState.snapshot, commentState.snapshot) : null
  const loadHistory = useMemo(() => analysisOpened && throughDate
    ? (signal?: AbortSignal) => loadOperatorWikiAnalysisHistory(throughDate, signal) : null, [analysisOpened, throughDate])
  const historyState = useWikiSnapshot(loadHistory)
  const analysis = useMemo(() => {
    if (tab !== 'analysis' || loading || rosterState.status !== 'ready' || viewState.status !== 'ready'
      || commentState.status !== 'ready' || historyState.status !== 'ready') return null
    return calculateOperatorWikiAnalysis(filteredOperators, viewState.snapshot, commentState.snapshot, historyState.snapshot, analysisPeriod)
  }, [tab, loading, rosterState.status, viewState, commentState, historyState, filteredOperators, analysisPeriod])
  const analysisError = [rosterState, viewState, commentState, historyState].some(state => state.status === 'error')
  const filterConditions = [
    filters.profession === 'ALL' ? '全職業' : getProfessionLabel(filters.profession),
    filters.rarity === 'ALL' ? '全レアリティ' : `★${filters.rarity}`,
    ...(filters.query.trim() ? [`名前「${filters.query.trim()}」`] : []),
  ]
  const viewImage = useRef<(() => ComparisonTableImageSnapshot) | null>(null)
  const commentImage = useRef<(() => ComparisonTableImageSnapshot) | null>(null)
  const analysisImage = useRef<(() => void) | null>(null)
  const [image, setImage] = useState<ComparisonTableImageSnapshot | null>(null)
  const activeImage = tab === 'views' ? viewImage : commentImage
  const activeState = tab === 'views' ? viewState : commentState
  const canExport = tab === 'analysis' ? canSaveWikiAnalysisImage(analysis, analysisView)
    : activeState.status === 'ready' && activeState.snapshot.entries.length > 0
    && rosterState.status === 'ready' && !loading && filteredOperators.length > 0

  function changeFilters(next: OperatorDatabaseFilters) {
    setFilters(next)
    setViewPage(0)
    setCommentPage(0)
  }

  return <PageLayout page="operator-wiki-views" className="wiki-stats-page operator-wiki-views-page" settings={
    <section className="operator-wiki-views-filters" aria-label="オペレーターの絞り込み">
      <PageOutputHeader segments={['絞り込み']} actions={
        <FilterResetButton value={filters} onReset={() => changeFilters(EMPTY_OPERATOR_DATABASE_FILTERS)} />
      }><h2>絞り込み</h2></PageOutputHeader>
      <Filters value={filters} professionOptions={PROFESSION_OPTIONS} onChange={changeFilters}
        showNameInitial={false} searchFirst searchLabel="オペレーター名" searchPlaceholder="オペレーター名で検索" />
    </section>
  }>
    <PageOutputTabs tabs={TABS} activeTab={tab} onChange={next => {
      setTab(next)
      if (next === 'comments') setCommentsOpened(true)
      if (next === 'analysis') setAnalysisOpened(true)
    }} idPrefix={id} label="Wiki 集計の表示" format={tab === 'analysis' ? viewLabel(WIKI_ANALYSIS_VIEWS, analysisView) : null} actions={canExport &&
      <OutputImageSaveButton onClick={() => {
        if (tab === 'analysis') analysisImage.current?.()
        else setImage(activeImage.current?.() ?? null)
      }} />
    } />
    {rosterState.status === 'error' && <p className="error-box" role="alert">Wiki オペレーター一覧を読み込めませんでした。</p>}
    <AnalysisTabPanel idPrefix={id} activeTab={tab} tab="views">
      <WikiViewPanel operators={filteredOperators} allOperators={allOperators}
        state={viewState} imageRef={viewImage} filterConditions={filterConditions}
        loading={waitingForOperators} page={viewPage} setPage={setViewPage} />
    </AnalysisTabPanel>
    <AnalysisTabPanel idPrefix={id} activeTab={tab} tab="comments">
      {commentsOpened && <WikiCommentPanel operators={filteredOperators} allOperators={allOperators}
        state={commentState} imageRef={commentImage} filterConditions={filterConditions}
        loading={waitingForOperators} page={commentPage} setPage={setCommentPage} />}
    </AnalysisTabPanel>
    <AnalysisTabPanel idPrefix={id} activeTab={tab} tab="analysis">
      {tab === 'analysis' && <OperatorWikiAnalysisPanel analysis={analysis} view={analysisView} onViewChange={setAnalysisView}
        period={analysisPeriod} onPeriodChange={setAnalysisPeriod} loading={!analysis && !analysisError} error={analysisError}
        imageRef={analysisImage} filterConditions={filterConditions} />}
    </AnalysisTabPanel>
    <footer className="operator-wiki-views-source">出典{' '}
      <a href="https://arknights.wikiru.jp/" target="_blank" rel="noopener noreferrer">アークナイツ攻略 Wiki</a>
    </footer>
    {image && <ComparisonTableImageDialog snapshot={image} onClose={() => setImage(null)} helpMode="none"
      parentLocation={[STANDARD_PAGE_TITLES['operator-wiki-views'], viewLabel(TABS, tab)]} />}
  </PageLayout>
}

function WikiViewPanel({ operators, allOperators, loading, page, setPage, state, imageRef, filterConditions }: PanelProps<OperatorWikiViewSnapshot>) {
  const snapshot = state.status === 'ready' ? state.snapshot : null
  const byId = useMemo(() => matchOperatorWikiDisplayEntries(allOperators, snapshot?.entries ?? []), [allOperators, snapshot])
  const ranks = useMemo(() => rankOperatorWikiTotals(allOperators, allOperators.map(({ operatorId }) => ({
    operatorId, total: byId.get(operatorId)?.total ?? null,
  }))), [allOperators, byId])
  const rows = useMemo(() => operators.map(({ operatorId, name, wikiUrl }) => {
    const entry = byId.get(operatorId)
    return {
      operatorId, name, wikiUrl: entry?.wikiUrl ?? wikiUrl,
      yesterday: entry?.yesterday ?? null, today: entry?.today ?? null, total: entry?.total ?? null,
    }
  }), [operators, byId])
  const columns = getWikiViewColumns(snapshot)

  if (loading || state.status === 'loading') return <p className="calculator-loading" role="status">読み込み中…</p>

  return <>
    <div className="wiki-stats-meta">
      <span>閲覧数（回）</span>
      {snapshot && <ObservedTime observedAt={snapshot.observedAt} />}
    </div>
    {state.status === 'error' && <p className="error-box" role="alert">Wiki 閲覧数を読み込めませんでした。</p>}
    <WikiStatsTable columns={columns} rows={rows} ranks={ranks} defaultSort="yesterday"
      page={page} onPageChange={setPage} label="Wiki 閲覧数一覧" tableLabel="オペレーター別のページ閲覧数（回）"
      imageRef={imageRef} imageTitle="オペレーター別 Wiki 閲覧数（回）" imageConditions={snapshot ? [
        `前日 ${snapshot.yesterdayDate}`, `当日 ${snapshot.todayDate}`,
        `取得 ${formatWikiObservedTime(snapshot.observedAt)}`, ...filterConditions,
      ] : []}
      metricLabel="閲覧数" linkLabel="Wiki ページ" nameColumnClass="wiki-stats-name-column" />
  </>
}

function WikiCommentPanel({ operators, allOperators, loading, page, setPage, state, imageRef, filterConditions }: PanelProps<OperatorWikiCommentSnapshot>) {
  const [period, setPeriod] = useState<WikiStatsPeriod>(30)
  const snapshot = state.status === 'ready' ? state.snapshot : null
  const byId = useMemo(() => matchOperatorWikiDisplayEntries(allOperators, snapshot?.entries ?? []), [allOperators, snapshot])
  const ranks = useMemo(() => rankOperatorWikiTotals(allOperators, allOperators.map(({ operatorId }) => ({
    operatorId, total: byId.get(operatorId)?.total ?? null,
  }))), [allOperators, byId])
  const range = useMemo(() => snapshot && period !== 'total'
    ? getWikiCommentRange(snapshot.throughDate, period)
    : null, [snapshot, period])
  const rows = useMemo(() => {
    return operators.map(({ operatorId, name }) => {
      const entry = byId.get(operatorId)
      const comments = period === 'total' ? entry?.total ?? null : range && getWikiCommentCount(entry, range)
      return {
        operatorId,
        name,
        wikiUrl: entry?.wikiUrl ?? null,
        comments,
      }
    })
  }, [operators, byId, period, range])

  if (loading || state.status === 'loading') return <p className="calculator-loading" role="status">読み込み中…</p>

  const periodLabel = WIKI_COMMENT_PERIODS.find(({ days }) => days === period)?.label ?? '累計'
  return <>
    <WikiPeriodButtons period={period} onChange={next => {
      setPeriod(next)
      setPage(0)
    }} />
    <div className="wiki-stats-meta">
      <span>{range ? <WikiDateRange {...range} /> : periodLabel}（件）</span>
      {snapshot && <ObservedTime observedAt={snapshot.observedAt} />}
    </div>
    {state.status === 'error' && <p className="error-box" role="alert">Wiki コメント件数を読み込めませんでした。</p>}
    <WikiStatsTable columns={COMMENT_COLUMNS} rows={rows} ranks={ranks} defaultSort="comments"
      page={page} onPageChange={setPage} label="Wiki コメント件数一覧" tableLabel="オペレーター別のコメント件数（件）"
      imageRef={imageRef} imageTitle="オペレーター別 Wiki コメント件数（件）" imageConditions={snapshot ? [
        periodLabel, range ? (range.start === range.end ? range.end : `${range.start}〜${range.end}`) : `${snapshot.throughDate}まで`,
        `取得 ${formatWikiObservedTime(snapshot.observedAt)}`, ...filterConditions,
      ] : []}
      metricLabel="コメント件数" linkLabel="Wiki コメントページ" nameColumnClass="wiki-stats-comments-name-column" />
  </>
}
