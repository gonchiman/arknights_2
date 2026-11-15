import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  getMainStorySpawnRows, loadMainStorySpawnLists, loadMainStorySpawnStages,
  type MainStorySpawnList, type MainStorySpawnRow, type MainStorySpawnSort,
  type MainStorySpawnSortKey, type MainStorySpawnStage,
} from '../lib/mainStoryEnemySpawns'
import { MAIN_STORY_SPAWN_IMAGE_ROW_MIN_HEIGHT } from '../lib/mainStorySpawnImageRange'
import { EnemyDataContent } from './EnemyPageShared'
import { MainStorySpawnImageDialog, type MainStorySpawnImageSelection } from './MainStorySpawnImageDialog'
import { PageBreadcrumbs } from './PageBreadcrumbs'
import './DamageCalculator.css'
import './EnemyAnalysis.css'
import './MainStoryEnemySpawnsPage.css'

const TITLE = 'メインストーリーの出現敵一覧'
const PAGE_SIZE = 25
const NUMBER_FORMAT = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 6 })
const VIEWS = [{ value: 'units', label: '1体ずつ' }, { value: 'counts', label: '体数をまとめる' }] as const
const STATS = [['hp', 'HP'], ['attack', '攻撃力'], ['defense', '防御力'], ['resistance', '術耐性']] as const
const IDENTITY_COLUMNS = [['stage', 'ステージ'], ['enemyName', '敵名']] as const
const UNIT_COLUMNS = [...IDENTITY_COLUMNS, ['wave', 'ウェーブ／区間'], ['time', '区間内時刻（秒）'],
  ['entrance', '出現口'], ...STATS] as const
const COUNT_COLUMNS = [...IDENTITY_COLUMNS, ['count', '出現体数'], ...STATS] as const
const DEFAULT_SORT: MainStorySpawnSort = { key: 'stage', direction: 'asc' }
const STAGE_STATUS = { unconfirmed: '出現未確定', unavailable: '出現データ未取得' } as const
const NO_STAGES: MainStorySpawnStage[] = []
const NO_LISTS: MainStorySpawnList[] = []

type View = typeof VIEWS[number]['value']
type LoadResult<T> = { attempt: number } & ({ data: T; error?: never } | { data?: never; error: string })

function formatNumber(value: number | null) {
  return value === null ? '—' : NUMBER_FORMAT.format(value)
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : '出現データを読み込めませんでした。'
}

function nextSortDirection(key: MainStorySpawnSortKey, sort: MainStorySpawnSort): MainStorySpawnSort['direction'] {
  if (key === sort.key) return sort.direction === 'asc' ? 'desc' : 'asc'
  return key === 'stage' || key === 'enemyName' || key === 'entrance' ? 'asc' : 'desc'
}

function getStatusRowsInRange(statuses: readonly MainStorySpawnList[], offset: number, limit: number, rowCount: number) {
  return statuses.slice(Math.max(0, offset - rowCount), Math.max(0, offset + limit - rowCount))
}

export function MainStoryEnemySpawnsPage() {
  const [stageAttempt, setStageAttempt] = useState(0)
  const [stageLoad, setStageLoad] = useState<LoadResult<MainStorySpawnStage[]> | null>(null)
  const [listAttempt, setListAttempt] = useState(0)
  const [listLoad, setListLoad] = useState<(LoadResult<MainStorySpawnList[]> & {
    stages: readonly MainStorySpawnStage[]
  }) | null>(null)
  const [chapter, setChapter] = useState('')
  const [stage, setStage] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [view, setView] = useState<View>('units')
  const [sort, setSort] = useState(DEFAULT_SORT)
  const [page, setPage] = useState(0)
  const [imageSelection, setImageSelection] = useState<MainStorySpawnImageSelection | null>(null)

  useEffect(() => {
    let active = true
    void loadMainStorySpawnStages().then(data => {
      if (active) setStageLoad({ attempt: stageAttempt, data })
    }).catch(cause => {
      if (active) setStageLoad({ attempt: stageAttempt, error: errorMessage(cause) })
    })
    return () => { active = false }
  }, [stageAttempt])

  const currentStageLoad = stageLoad?.attempt === stageAttempt ? stageLoad : null
  const stages = currentStageLoad?.data ?? NO_STAGES
  const chapters = useMemo(() => [...new Set(stages.map(item => item.chapter))], [stages])
  const chapterStages = useMemo(() => chapter === '' ? stages : stages.filter(item => item.chapter === Number(chapter)),
    [chapter, stages])
  const stageId = stage ?? stages[0]?.id ?? ''
  const scope = useMemo(() => stageId === '' ? chapterStages : chapterStages.filter(item => item.id === stageId),
    [chapterStages, stageId])

  useEffect(() => {
    if (scope.length === 0) return
    let active = true
    void loadMainStorySpawnLists(scope).then(data => {
      if (active) setListLoad({ attempt: listAttempt, stages: scope, data })
    }).catch(cause => {
      if (active) setListLoad({ attempt: listAttempt, stages: scope, error: errorMessage(cause) })
    })
    return () => { active = false }
  }, [scope, listAttempt])

  const currentListLoad = listLoad?.stages === scope && listLoad.attempt === listAttempt ? listLoad : null
  const lists = currentListLoad?.data ?? NO_LISTS
  const offset = page * PAGE_SIZE
  const { rows, rowCount, confirmedCount } = useMemo(
    () => getMainStorySpawnRows(lists, query, view, offset, PAGE_SIZE, sort), [lists, query, view, offset, sort],
  )
  const statuses = lists.filter(item => item.status !== 'confirmed')
  if (sort.key === 'stage' && sort.direction === 'desc') statuses.reverse()
  const unconfirmed = statuses.filter(item => item.status === 'unconfirmed').length
  const unavailable = statuses.length - unconfirmed
  const statusRows = getStatusRowsInRange(statuses, offset, PAGE_SIZE, rowCount)
  const tableRowCount = rowCount + statuses.length
  const pageCount = Math.max(1, Math.ceil(tableRowCount / PAGE_SIZE))
  const columns = view === 'units' ? UNIT_COLUMNS : COUNT_COLUMNS
  const loading = scope.length > 0 && currentListLoad === null

  function changeChapter(value: string) {
    setChapter(value)
    if (value !== '' && !stages.some(item => item.id === stageId && item.chapter === Number(value))) setStage('')
    setPage(0)
  }

  function changeView(value: View) {
    const availableColumns = value === 'units' ? UNIT_COLUMNS : COUNT_COLUMNS
    setSort(current => availableColumns.some(([key]) => key === current.key) ? current : DEFAULT_SORT)
    setView(value)
    setPage(0)
  }

  function changeSort(key: MainStorySpawnSortKey) {
    setSort(current => ({ key, direction: nextSortDirection(key, current) }))
    setPage(0)
  }

  function openImage() {
    if (!currentListLoad?.data || tableRowCount === 0) return
    const selectedStage = stageId === '' ? undefined : scope[0]
    const chapterLabel = chapter === '' ? '全章' : `${chapter}章`
    const scopeLabel = selectedStage ? `${selectedStage.code} ${selectedStage.name}` : `${chapterLabel}・全ステージ`
    const displayMode = view === 'units' ? VIEWS[0].label : VIEWS[1].label
    const sortLabel = columns.find(([key]) => key === sort.key)?.[1] ?? 'ステージ'
    const conditions = [
      '通常環境', scopeLabel, displayMode, `${sortLabel} ${sort.direction === 'asc' ? '昇順' : '降順'}`,
      ...(query.trim() ? [`敵名「${query.trim()}」`] : []),
    ]
    setImageSelection({
      currentPageRange: { start: offset + 1, end: Math.min(offset + PAGE_SIZE, tableRowCount) },
      totalRows: tableRowCount,
      createSnapshot: ({ start, end }) => {
        const startOffset = start - 1
        const limit = end - start + 1
        const result = getMainStorySpawnRows(lists, query, view, startOffset, limit, sort)
        const stageStatuses = getStatusRowsInRange(statuses, startOffset, limit, result.rowCount)
        const rangeLabel = start === end ? formatNumber(start) : `${formatNumber(start)}〜${formatNumber(end)}`
        return {
          title: TITLE,
          conditions: [...conditions, `${rangeLabel}行目`],
          table: <MainStorySpawnTable view={view} rows={result.rows} statusRows={stageStatuses} forImage />,
        }
      },
    })
  }

  return <section className="calculator-page enemy-analysis-route main-story-spawns-page">
    <PageBreadcrumbs parents={[{ label: '敵データベース', href: '#/enemies' }]} current={TITLE} />
    <header className="page-intro main-story-spawns-intro">
      <h1>{TITLE}</h1>
      <span>通常環境</span>
    </header>
    <EnemyDataContent loading={currentStageLoad === null} error={currentStageLoad?.error ?? null}
      onRetry={() => setStageAttempt(previous => previous + 1)}>
      <section className="main-story-spawns-panel" aria-label="出現敵一覧">
        <div className="main-story-spawns-filters">
          <label><span>章</span><select value={chapter} onChange={event => changeChapter(event.target.value)}>
            <option value="">全章</option>
            {chapters.map(value => <option key={value} value={value}>{value}章</option>)}
          </select></label>
          <label><span>ステージ</span><select value={stageId} onChange={event => {
            setStage(event.target.value)
            setPage(0)
          }}>
            <option value="">全ステージ</option>
            {chapterStages.map(item => <option key={item.id} value={item.id}>{item.code} {item.name}</option>)}
          </select></label>
          <label><span>敵名</span><input type="search" placeholder="敵名を検索" value={query} onChange={event => {
            setQuery(event.target.value)
            setPage(0)
          }} /></label>
        </div>
        <div className="main-story-spawns-toolbar">
          <div className="main-story-spawns-views" role="group" aria-label="一覧の表示">
            {VIEWS.map(({ value, label }) => <button key={value} type="button" className={value === view ? 'button' : 'button secondary'}
              aria-pressed={value === view} onClick={() => changeView(value)}>{label}</button>)}
          </div>
          <div className="main-story-spawns-actions">
            {currentListLoad?.data && <output className="main-story-spawns-total" aria-live="polite">
              <span>{statuses.length > 0 ? '確認済み ' : ''}{formatNumber(confirmedCount)}体</span>
              {unconfirmed > 0 && <span>{STAGE_STATUS.unconfirmed} {formatNumber(unconfirmed)}ステージ</span>}
              {unavailable > 0 && <span>{STAGE_STATUS.unavailable} {formatNumber(unavailable)}ステージ</span>}
            </output>}
            <button type="button" className="button secondary" aria-haspopup="dialog"
              disabled={!currentListLoad?.data || tableRowCount === 0} onClick={openImage}>画像を保存</button>
          </div>
        </div>
        <div aria-busy={loading}>
          <EnemyDataContent loading={loading} error={currentListLoad?.error ?? null}
            onRetry={() => { setPage(0); setListAttempt(previous => previous + 1) }}>
            <div className="table-wrap main-story-spawns-table-wrap" role="region" tabIndex={0} aria-label="出現敵一覧の表">
              <MainStorySpawnTable view={view} rows={rows} statusRows={statusRows} sorting={{ sort, onSort: changeSort }} />
            </div>
            {pageCount > 1 && <nav className="enemy-pagination main-story-spawns-pagination" aria-label="出現敵一覧のページ切り替え">
              <span>{formatNumber(offset + 1)}–{formatNumber(Math.min(offset + PAGE_SIZE, tableRowCount))} / {formatNumber(tableRowCount)}行</span>
              <div>
                <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>前へ</button>
                <span aria-live="polite">{page + 1} / {pageCount}</span>
                <button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}>次へ</button>
              </div>
            </nav>}
          </EnemyDataContent>
        </div>
      </section>
    </EnemyDataContent>
    {imageSelection && <MainStorySpawnImageDialog selection={imageSelection} onClose={() => setImageSelection(null)} />}
  </section>
}

function MainStorySpawnTable({ view, rows, statusRows, sorting, forImage = false }: {
  view: View
  rows: readonly MainStorySpawnRow[]
  statusRows: readonly MainStorySpawnList[]
  sorting?: { sort: MainStorySpawnSort; onSort: (key: MainStorySpawnSortKey) => void }
  forImage?: boolean
}) {
  const showUnits = view === 'units'
  const columns = showUnits ? UNIT_COLUMNS : COUNT_COLUMNS
  const style = forImage ? { '--main-story-spawns-image-row-height': `${MAIN_STORY_SPAWN_IMAGE_ROW_MIN_HEIGHT}px` } as CSSProperties : undefined
  return <table className={forImage ? 'main-story-spawns-table main-story-spawns-image-table' : 'main-story-spawns-table'}
    data-view={view} aria-label="出現敵一覧" style={style}>
    {forImage && <colgroup>{columns.map(([key]) => <col key={key} />)}</colgroup>}
    <thead><tr>{columns.map(([key, label]) => sorting
      ? <MainStorySpawnSortableHeader key={key} column={key} label={label} {...sorting} />
      : <th key={key} scope="col">{label}</th>)}</tr></thead>
    <tbody>
      {rows.map(row => <MainStorySpawnTableRow key={row.key} row={row} showUnits={showUnits} forImage={forImage} />)}
      {statusRows.map(({ stage, status }) => status !== 'confirmed' &&
        <tr key={stage.id} className="main-story-spawns-status-row">
          <td>{stage.code}</td>
          <th scope="row" colSpan={columns.length - 1}>{STAGE_STATUS[status]}</th>
        </tr>)}
      {rows.length === 0 && statusRows.length === 0 && <tr>
        <td className="main-story-spawns-empty" colSpan={columns.length}>該当する敵はいません</td>
      </tr>}
    </tbody>
  </table>
}

function MainStorySpawnSortableHeader({ column, label, sort, onSort }: {
  column: MainStorySpawnSortKey
  label: string
  sort: MainStorySpawnSort
  onSort: (key: MainStorySpawnSortKey) => void
}) {
  const active = column === sort.key
  const directionLabel = nextSortDirection(column, sort) === 'asc' ? '昇順' : '降順'
  return <th scope="col" className={column === 'stage' || column === 'enemyName' ? undefined : 'numeric-heading'}
    aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}>
    <button type="button" className="enemy-sort-button" aria-label={`${label}を${directionLabel}に並べ替え`}
      onClick={() => onSort(column)}>
      <span>{label}</span>
      <span className="enemy-sort-indicator" aria-hidden="true">{active ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}</span>
    </button>
  </th>
}

function MainStorySpawnTableRow({ row, showUnits, forImage }: {
  row: MainStorySpawnRow
  showUnits: boolean
  forImage: boolean
}) {
  const waveFragment = row.wave === null && row.fragment === null
    ? row.fromBranch ? '分岐' : '—'
    : `${formatNumber(row.wave)}／${formatNumber(row.fragment)}`
  const imageNumber = forImage ? true : undefined
  return <tr>
    <td>{row.stage.code}</td>
    <th scope="row">{row.enemyName}</th>
    {showUnits ? <>
      <td>{waveFragment}</td>
      <td data-table-image-number={imageNumber}>{formatNumber(row.time)}</td>
      <td>{row.entrance ?? '—'}</td>
    </> : <td data-table-image-number={imageNumber}>{formatNumber(row.count)}</td>}
    {STATS.map(([key]) => <td key={key} data-table-image-number={imageNumber}>{formatNumber(row.stats[key])}</td>)}
  </tr>
}
