import { useEffect, useId, useMemo, useState } from 'react'
import {
  EMPTY_OPERATOR_DATABASE_FILTERS, filterOperatorDatabaseRecords,
  type OperatorDatabaseFilters, type OperatorDatabaseRecord,
} from '../lib/operatorDatabase'
import { getProfessionLabel, PROFESSION_ORDER } from '../lib/operatorFilters'
import {
  getWikiCommentCount, getWikiCommentRange, loadOperatorWikiCommentSnapshot, WIKI_COMMENT_PERIODS,
  type OperatorWikiCommentSnapshot, type WikiCommentPeriod,
} from '../lib/operatorWikiComments'
import {
  buildOperatorWikiViewRows, loadOperatorWikiViewSnapshot, rankOperatorWikiTotals, sortOperatorWikiMetricRows,
  type OperatorWikiViewSnapshot,
} from '../lib/operatorWikiViews'
import { AnalysisTabs } from './AnalysisTabs'
import { Filters } from './Filters'
import { TableSortHeader, type TableSort } from './TableSortHeader'
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

const VIEW_COLUMNS = [
  { key: 'yesterday', label: '前日', dateKey: 'yesterdayDate' },
  { key: 'today', label: '当日', dateKey: 'todayDate' },
  { key: 'total', label: '累計', dateKey: null },
] as const
const COMMENT_COLUMNS = [{ key: 'comments', label: 'コメント件数' }] as const
const COMMENT_PERIODS = [...WIKI_COMMENT_PERIODS, { days: 'total', label: '累計' }] as const

type SnapshotState<T> =
  | { status: 'loading' | 'error' }
  | { status: 'ready'; snapshot: T }

type WikiRow<Metric extends string> = {
  operatorId: string
  name: string
  wikiUrl: string | null
} & Record<Metric, number | null>

const PAGE_SIZE = 25
const counts = new Intl.NumberFormat('ja-JP')
const day = new Intl.DateTimeFormat('ja-JP', { timeZone: 'UTC', month: 'numeric', day: 'numeric' })
const rangeDay = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
})
const observedTime = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

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

  return <section className="calculator-page operator-wiki-views-page">
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

function useWikiSnapshot<T>(load: (signal?: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<SnapshotState<T>>({ status: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal).then(
      snapshot => { if (!controller.signal.aborted) setState({ status: 'ready', snapshot }) },
      () => { if (!controller.signal.aborted) setState({ status: 'error' }) },
    )
    return () => controller.abort()
  }, [load])
  return state
}

function WikiViewPanel({ operators, allOperators, loading, page, setPage }: PanelProps) {
  const state = useWikiSnapshot<OperatorWikiViewSnapshot>(loadOperatorWikiViewSnapshot)
  const snapshot = state.status === 'ready' ? state.snapshot : null
  const ranks = useMemo(() => rankOperatorWikiTotals(allOperators, snapshot?.entries ?? []), [allOperators, snapshot])
  const rows = useMemo(() => buildOperatorWikiViewRows(operators, snapshot), [operators, snapshot])
  const columns = VIEW_COLUMNS.map(({ key, label, dateKey }) => ({
    key,
    label: snapshot && dateKey ? `${label} ${day.format(new Date(snapshot[dateKey]))}` : label,
    className: key === 'total' ? 'operator-wiki-views-total-column' : undefined,
  }))

  if (loading || state.status === 'loading') return <p className="calculator-loading" role="status">読み込み中…</p>

  return <div className="calculator-panel">
    <div className="operator-wiki-views-meta">
      <a href="https://arknights.wikiru.jp/" target="_blank" rel="noopener noreferrer">アークナイツ攻略 Wiki</a>
      {snapshot && <ObservedTime observedAt={snapshot.observedAt} />}
    </div>
    {state.status === 'error' && <p className="error-box" role="alert">Wiki 閲覧数を読み込めませんでした。</p>}
    <WikiStatsTable columns={columns} rows={rows} ranks={ranks} defaultSort="yesterday"
      page={page} onPageChange={setPage} label="Wiki 閲覧数一覧" tableLabel="オペレーター別のページ閲覧数（回）"
      metricLabel="閲覧数" linkLabel="Wiki ページ" nameColumnClass="operator-wiki-views-name-column" />
  </div>
}

function WikiCommentPanel({ operators, allOperators, loading, page, setPage }: PanelProps) {
  const state = useWikiSnapshot<OperatorWikiCommentSnapshot>(loadOperatorWikiCommentSnapshot)
  const [period, setPeriod] = useState<WikiCommentPeriod | 'total'>(30)
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
    <div className="operator-wiki-views-meta">
      <div className="operator-wiki-comments-period" role="group" aria-label="集計期間">
        {COMMENT_PERIODS.map(({ days, label }) => <button type="button" key={days} className="button secondary"
          aria-pressed={period === days} onClick={() => {
            if (period === days) return
            setPeriod(days)
            setPage(0)
          }}>{label}</button>)}
      </div>
      {snapshot && <div className="operator-wiki-comments-dates">
        {range && <span aria-live="polite" aria-atomic="true">
          <time dateTime={range.start}>{rangeDay.format(new Date(range.start))}</time>
          {range.start !== range.end && <>〜<time dateTime={range.end}>{rangeDay.format(new Date(range.end))}</time></>}
        </span>}
        <ObservedTime observedAt={snapshot.observedAt} />
      </div>}
    </div>
    {state.status === 'error' && <p className="error-box" role="alert">Wiki コメント件数を読み込めませんでした。</p>}
    <WikiStatsTable columns={COMMENT_COLUMNS} rows={rows} ranks={ranks} defaultSort="comments"
      page={page} onPageChange={setPage} label="Wiki コメント件数一覧" tableLabel="オペレーター別のコメント件数（件）"
      metricLabel="コメント件数" linkLabel="Wiki コメントページ" nameColumnClass="operator-wiki-comments-name-column" />
  </div>
}

function ObservedTime({ observedAt }: { observedAt: string }) {
  return <span>取得 <time dateTime={observedAt}>{observedTime.format(new Date(observedAt))} JST</time></span>
}

function WikiStatsTable<Metric extends string>({
  columns, rows, ranks, defaultSort, page, onPageChange, label, tableLabel, metricLabel, linkLabel, nameColumnClass,
}: {
  columns: readonly { key: Metric; label: string; className?: string }[]
  rows: WikiRow<Metric>[]
  ranks: ReadonlyMap<string, number>
  defaultSort: Metric
  page: number
  onPageChange: (page: number) => void
  label: string
  tableLabel: string
  metricLabel: string
  linkLabel: string
  nameColumnClass: string
}) {
  const [sort, setSort] = useState<TableSort<'name' | Metric>>({ key: defaultSort, direction: 'desc' })
  const ordered = useMemo(() => sortOperatorWikiMetricRows<Metric, WikiRow<Metric>>(rows, sort), [rows, sort])
  const pages = Math.ceil(ordered.length / PAGE_SIZE)
  const activePage = Math.max(0, Math.min(page, pages - 1))
  const start = activePage * PAGE_SIZE
  const visible = ordered.slice(start, start + PAGE_SIZE)

  function changeSort(key: 'name' | Metric) {
    setSort(previous => ({
      key,
      direction: key === previous.key
        ? (previous.direction === 'asc' ? 'desc' : 'asc')
        : (key === 'name' ? 'asc' : 'desc'),
    }))
    onPageChange(0)
  }

  return <>
    <div className="operator-wiki-views-scroll" role="region" aria-label={label} tabIndex={0}>
      <table aria-label={tableLabel}>
        <colgroup><col className="operator-wiki-views-rank-column" /><col className={nameColumnClass} />
          {columns.map(column => <col key={column.key} className={column.className} />)}
        </colgroup>
        <thead><tr>
          <th scope="col" className="operator-wiki-views-rank">累計順位</th>
          <TableSortHeader label="オペレーター" ariaLabel="オペレーター名で並べ替え" sortKey="name"
            sort={sort} onSort={changeSort} />
          {columns.map(column => <TableSortHeader key={column.key} label={column.label}
            ariaLabel={`${column.label === metricLabel ? metricLabel : `${column.label}の${metricLabel}`}で並べ替え`}
            sortKey={column.key} sort={sort} onSort={changeSort} />)}
        </tr></thead>
        <tbody>
          {visible.map(row => <tr key={row.operatorId}>
            <td className="operator-wiki-views-rank">{ranks.get(row.operatorId) ?? '—'}</td>
            <th scope="row" className={sort.key === 'name' ? 'operator-wiki-views-sorted' : undefined}>
              {row.wikiUrl
                ? <a href={row.wikiUrl} target="_blank" rel="noopener noreferrer" aria-label={`${row.name}の ${linkLabel}を開く`}>{row.name}</a>
                : row.name}
            </th>
            {columns.map(({ key }) => {
              const count = row[key]
              return <td key={key} className={sort.key === key ? 'operator-wiki-views-sorted' : undefined}>
                {count === null ? <span className="operator-wiki-views-missing">未取得</span> : counts.format(count)}
              </td>
            })}
          </tr>)}
          {visible.length === 0 && <tr>
            <td colSpan={columns.length + 2} className="operator-wiki-views-empty">
              <span role="status">該当するオペレーターがいません。</span>
            </td>
          </tr>}
        </tbody>
      </table>
    </div>
    {ordered.length > 0 && <div className="operator-wiki-views-pagination">
      <span aria-live="polite">{start + 1}〜{start + visible.length} / {ordered.length}名</span>
      <div>
        <button type="button" className="button secondary" aria-label="前のオペレーター一覧"
          disabled={activePage === 0} onClick={() => onPageChange(activePage - 1)}>前へ</button>
        <button type="button" className="button secondary" aria-label="次のオペレーター一覧"
          disabled={activePage + 1 >= pages} onClick={() => onPageChange(activePage + 1)}>次へ</button>
      </div>
    </div>}
  </>
}
