import { useId, useMemo, useState } from 'react'
import {
  EMPTY_OPERATOR_DATABASE_FILTERS, filterOperatorDatabaseRecords,
  type OperatorDatabaseFilters, type OperatorDatabaseRecord,
} from '../lib/operatorDatabase'
import { getProfessionLabel, PROFESSION_ORDER } from '../lib/operatorFilters'
import { getWikiCommentCount, getWikiCommentRange, loadOperatorWikiCommentSnapshot } from '../lib/operatorWikiComments'
import { buildOperatorWikiViewRows, loadOperatorWikiViewSnapshot, rankOperatorWikiTotals } from '../lib/operatorWikiViews'
import { AnalysisTabs } from './AnalysisTabs'
import { Filters } from './Filters'
import {
  getWikiViewColumns, ObservedTime, useWikiSnapshot, WikiDateRange, WikiPeriodButtons, WikiStatsTable,
  type WikiStatsPeriod,
} from './WikiStatsTable'
import './DamageCalculator.css'
import './OperatorWikiViewsPage.css'

interface Props {
  operators: readonly OperatorDatabaseRecord[]
  loading: boolean
}

interface PanelProps extends Props {
  allOperators: Props['operators']
  page: number
  setPage: (page: number) => void
}

const TABS = [['views', '閲覧数'], ['comments', 'コメント']] as const
type Tab = typeof TABS[number][0]
const PROFESSION_OPTIONS = PROFESSION_ORDER.map(value => ({ value, label: getProfessionLabel(value) }))

const COMMENT_COLUMNS = [{ key: 'comments', label: 'コメント件数' }] as const

export function OperatorWikiViewsPage({ operators, loading }: Props) {
  const id = useId()
  const [tab, setTab] = useState<Tab>('views')
  const [commentsOpened, setCommentsOpened] = useState(false)
  const [filters, setFilters] = useState(EMPTY_OPERATOR_DATABASE_FILTERS)
  const [viewPage, setViewPage] = useState(0)
  const [commentPage, setCommentPage] = useState(0)
  const filteredOperators = useMemo(() => filterOperatorDatabaseRecords(operators, filters, 'name'), [operators, filters])

  function changeFilters(next: OperatorDatabaseFilters) {
    setFilters(next)
    setViewPage(0)
    setCommentPage(0)
  }

  return <section className="calculator-page wiki-stats-page operator-wiki-views-page">
    <header className="page-intro">
      <h1>{tab === 'views' ? 'オペレーター別 Wiki 閲覧数' : 'オペレーター別 Wiki コメント件数'}</h1>
    </header>
    <AnalysisTabs tabs={TABS} activeTab={tab} onChange={next => {
      setTab(next)
      if (next === 'comments') setCommentsOpened(true)
    }} idPrefix={id} label="Wiki 集計の表示" />
    <div className="operator-wiki-views-filters" role="region" aria-label="オペレーターの絞り込み">
      <Filters value={filters} professionOptions={PROFESSION_OPTIONS} onChange={changeFilters}
        onReset={() => changeFilters(EMPTY_OPERATOR_DATABASE_FILTERS)} showNameInitial={false}
        searchFirst searchLabel="オペレーター名" searchPlaceholder="オペレーター名で検索" />
    </div>
    <section id={`${id}-panel-views`} role="tabpanel" aria-labelledby={`${id}-tab-views`} hidden={tab !== 'views'}>
      <WikiViewPanel operators={filteredOperators} allOperators={operators}
        loading={loading} page={viewPage} setPage={setViewPage} />
    </section>
    <section id={`${id}-panel-comments`} role="tabpanel" aria-labelledby={`${id}-tab-comments`} hidden={tab !== 'comments'}>
      {commentsOpened && <WikiCommentPanel operators={filteredOperators} allOperators={operators}
        loading={loading} page={commentPage} setPage={setCommentPage} />}
    </section>
  </section>
}

function WikiViewPanel({ operators, allOperators, loading, page, setPage }: PanelProps) {
  const state = useWikiSnapshot(loadOperatorWikiViewSnapshot)
  const snapshot = state.status === 'ready' ? state.snapshot : null
  const ranks = useMemo(() => rankOperatorWikiTotals(allOperators, snapshot?.entries ?? []), [allOperators, snapshot])
  const rows = useMemo(() => buildOperatorWikiViewRows(operators, snapshot), [operators, snapshot])
  const columns = getWikiViewColumns(snapshot)

  if (loading || state.status === 'loading') return <p className="calculator-loading" role="status">読み込み中…</p>

  return <div className="calculator-panel">
    <div className="wiki-stats-meta">
      <a href="https://arknights.wikiru.jp/" target="_blank" rel="noopener noreferrer">アークナイツ攻略 Wiki</a>
      {snapshot && <ObservedTime observedAt={snapshot.observedAt} />}
    </div>
    {state.status === 'error' && <p className="error-box" role="alert">Wiki 閲覧数を読み込めませんでした。</p>}
    <WikiStatsTable columns={columns} rows={rows} ranks={ranks} defaultSort="yesterday"
      page={page} onPageChange={setPage} label="Wiki 閲覧数一覧" tableLabel="オペレーター別のページ閲覧数（回）"
      metricLabel="閲覧数" linkLabel="Wiki ページ" nameColumnClass="wiki-stats-name-column" />
  </div>
}

function WikiCommentPanel({ operators, allOperators, loading, page, setPage }: PanelProps) {
  const state = useWikiSnapshot(loadOperatorWikiCommentSnapshot)
  const [period, setPeriod] = useState<WikiStatsPeriod>(30)
  const snapshot = state.status === 'ready' ? state.snapshot : null
  const ranks = useMemo(() => rankOperatorWikiTotals(allOperators, snapshot?.entries ?? []), [allOperators, snapshot])
  const range = useMemo(() => snapshot && period !== 'total'
    ? getWikiCommentRange(snapshot.throughDate, period)
    : null, [snapshot, period])
  const rows = useMemo(() => {
    const byId = new Map(snapshot?.entries.map(entry => [entry.operatorId, entry]))
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
  }, [operators, snapshot, period, range])

  if (loading || state.status === 'loading') return <p className="calculator-loading" role="status">読み込み中…</p>

  return <div className="calculator-panel">
    <div className="wiki-stats-meta">
      <WikiPeriodButtons period={period} onChange={next => {
        setPeriod(next)
        setPage(0)
      }} />
      {snapshot && <div className="wiki-stats-dates">
        {range && <WikiDateRange {...range} />}
        <ObservedTime observedAt={snapshot.observedAt} />
      </div>}
    </div>
    {state.status === 'error' && <p className="error-box" role="alert">Wiki コメント件数を読み込めませんでした。</p>}
    <WikiStatsTable columns={COMMENT_COLUMNS} rows={rows} ranks={ranks} defaultSort="comments"
      page={page} onPageChange={setPage} label="Wiki コメント件数一覧" tableLabel="オペレーター別のコメント件数（件）"
      metricLabel="コメント件数" linkLabel="Wiki コメントページ" nameColumnClass="wiki-stats-comments-name-column" />
  </div>
}
