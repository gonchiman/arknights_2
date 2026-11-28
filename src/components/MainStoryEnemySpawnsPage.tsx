import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent, type Ref } from 'react'
import {
  findMainStorySpawnJump, getMainStorySpawnChapterRows, getMainStorySpawnRankMetric, getMainStorySpawnRows, loadMainStorySpawnLists, loadMainStorySpawnStages,
  MAIN_STORY_SPAWN_AGGREGATION_VERSION,
  type MainStorySpawnChapterSort, type MainStorySpawnList, type MainStorySpawnRow, type MainStorySpawnSort,
  type MainStorySpawnSortKey, type MainStorySpawnStage,
} from '../lib/mainStoryEnemySpawns'
import { MAIN_STORY_SPAWN_IMAGE_ROW_MIN_HEIGHT } from '../lib/mainStorySpawnImageRange'
import {
  formatMainStorySpawnImageHighlightRows, type MainStorySpawnImageColumnKey, type MainStorySpawnImageHighlights,
} from '../lib/mainStorySpawnImageHighlights'
import { EnemyDataContent } from './EnemyPageShared'
import { MainStorySpawnImageDialog, type MainStorySpawnImageSelection } from './MainStorySpawnImageDialog'
import { PageBreadcrumbs } from './PageBreadcrumbs'
import { STANDARD_PAGE_TITLES } from '../lib/navigation'
import { AnalysisTabPanel } from './AnalysisTabs'
import { PageLayout, PageOutputTabs } from './PageLayout'
import { OutputImageSaveButton } from './OutputImageSaveButton'
import { ComparisonTableImageDialog, type ComparisonTableImageSnapshot } from './ComparisonTableImageDialog'
import { createMainStoryChapterSpawnImage } from './mainStoryChapterSpawnImage'
import { MainStoryChapterSpawnTable, chapterSortLabels } from './MainStoryChapterSpawnTable'
import './DamageCalculator.css'
import './EnemyAnalysis.css'
import './MainStoryEnemySpawnsPage.css'

const TITLE = STANDARD_PAGE_TITLES['main-enemy-spawns']
const TABS = [['list', '出現一覧'], ['chapters', '章別の出現回数']] as const
const DATA_CONDITIONS = [`集計版 ${MAIN_STORY_SPAWN_AGGREGATION_VERSION}`, '通常環境', '基礎ステータス']
const PAGE_SIZE = 25
const NUMBER_FORMAT = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 6 })
const VIEWS = [{ value: 'units', label: '1体ずつ' }, { value: 'counts', label: '体数をまとめる' }] as const
const STATS = [['hp', 'HP'], ['attack', '攻撃力'], ['defense', '防御力'], ['resistance', '術耐性']] as const
const COMMON_COLUMNS = [['enemyName', '敵名'], ...STATS, ['stage', 'ステージ']] as const
const UNIT_COLUMNS = [...COMMON_COLUMNS, ['wave', 'ウェーブ／区間'], ['time', '区間内時刻（秒）'],
  ['entrance', '出現口']] as const
const COUNT_COLUMNS = [...COMMON_COLUMNS, ['count', '出現体数']] as const
const DEFAULT_SORT: MainStorySpawnSort = { key: 'stage', direction: 'asc' }
const STAGE_STATUS = { unconfirmed: '出現未確定', unavailable: '出現データ未取得' } as const
const NO_STAGES: MainStorySpawnStage[] = []
const NO_LISTS: MainStorySpawnList[] = []

type View = typeof VIEWS[number]['value']
type JumpKind = 'row' | 'rank' | 'stat'
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

function textColumnClass(column: MainStorySpawnSortKey) {
  return column === 'enemyName' || column === 'stage' ? 'main-story-spawns-text-cell' : undefined
}

function getStatusRowsInRange(statuses: readonly MainStorySpawnList[], offset: number, limit: number, rowCount: number) {
  return statuses.slice(Math.max(0, offset - rowCount), Math.max(0, offset + limit - rowCount))
}

export function MainStoryEnemySpawnsPage() {
  const [tab, setTab] = useState<typeof TABS[number][0]>('list')
  const [chapterSort, setChapterSort] = useState<MainStorySpawnChapterSort>({ key: 'chapter', direction: 'asc' })
  const [chapterImage, setChapterImage] = useState<ComparisonTableImageSnapshot | null>(null)
  const tabProps = { idPrefix: 'main-story-spawns', activeTab: tab }
  const [stageAttempt, setStageAttempt] = useState(0)
  const [stageLoad, setStageLoad] = useState<LoadResult<MainStorySpawnStage[]> | null>(null)
  const [listAttempt, setListAttempt] = useState(0)
  const [listLoad, setListLoad] = useState<(LoadResult<MainStorySpawnList[]> & {
    stages: readonly MainStorySpawnStage[]
  }) | null>(null)
  const [chapter, setChapter] = useState('')
  const [stageId, setStageId] = useState('')
  const [query, setQuery] = useState('')
  const [view, setView] = useState<View>('units')
  const [sort, setSort] = useState(DEFAULT_SORT)
  const [page, setPage] = useState(0)
  const [imageSelection, setImageSelection] = useState<MainStorySpawnImageSelection | null>(null)
  const [jumpKind, setJumpKind] = useState<JumpKind>('row')
  const [jumpValue, setJumpValue] = useState('')
  const [jumpTarget, setJumpTarget] = useState<{ rowNumber: number } | null>(null)
  const [jumpFeedback, setJumpFeedback] = useState<{ message: string; invalid?: boolean } | null>(null)
  const jumpInput = useRef<HTMLInputElement>(null)
  const jumpRow = useRef<HTMLTableRowElement>(null)
  const jumpInputId = useId()
  const jumpFeedbackId = useId()

  useEffect(() => {
    const row = jumpRow.current
    if (!jumpTarget || !row) return
    row.focus({ preventScroll: true })
    row.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [jumpTarget])

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
  const detailScope = useMemo(() => stageId === '' ? chapterStages : chapterStages.filter(item => item.id === stageId),
    [chapterStages, stageId])
  const scope = tab === 'chapters' ? stages : detailScope

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
  const loadedLists = currentListLoad?.data ?? NO_LISTS
  const lists = tab === 'list' ? loadedLists : NO_LISTS
  const chapterRows = useMemo(() => tab === 'chapters' ? getMainStorySpawnChapterRows(loadedLists, query, chapterSort) : [],
    [tab, loadedLists, query, chapterSort])
  const chapterCount = chapterRows.reduce((sum, row) => sum + row.count, 0)
  const offset = page * PAGE_SIZE
  const { rows, rowCount, confirmedCount, rankedRowCount } = useMemo(
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
  const rankMetric = getMainStorySpawnRankMetric(sort)
  const rankLabel = STATS.find(([key]) => key === rankMetric)?.[1]
  const canJumpByStat = rankLabel !== undefined && rankedRowCount > 0
  const activeJumpKind = canJumpByStat ? jumpKind : 'row'
  const jumpLabel = activeJumpKind === 'row' ? '行番号' : activeJumpKind === 'rank' ? '順位' : rankLabel
  const maxJumpValue = activeJumpKind === 'row' ? tableRowCount : activeJumpKind === 'rank' ? rankedRowCount : undefined
  const loading = scope.length > 0 && currentListLoad === null

  function clearJump() {
    setJumpTarget(null)
    setJumpFeedback(null)
  }

  function changePage(value: number) {
    setPage(value)
    clearJump()
  }

  function changeChapter(value: string) {
    setChapter(value)
    if (value !== '' && !stages.some(item => item.id === stageId && item.chapter === Number(value))) setStageId('')
    changePage(0)
  }

  function changeView(value: View) {
    const availableColumns = value === 'units' ? UNIT_COLUMNS : COUNT_COLUMNS
    setSort(current => availableColumns.some(([key]) => key === current.key) ? current : DEFAULT_SORT)
    setView(value)
    changePage(0)
  }

  function changeSort(key: MainStorySpawnSortKey) {
    if (sort.key !== key) setJumpValue('')
    setSort(current => ({ key, direction: nextSortDirection(key, current) }))
    changePage(0)
  }

  function changeJumpKind(value: JumpKind) {
    if (value === activeJumpKind) return
    setJumpKind(value)
    setJumpValue('')
    clearJump()
    jumpInput.current?.focus({ preventScroll: true })
  }

  function moveToRow(rowNumber: number) {
    setPage(Math.floor((rowNumber - 1) / PAGE_SIZE))
    setJumpTarget({ rowNumber })
  }

  function jumpToRow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = Number(jumpValue)
    const invalidPosition = maxJumpValue !== undefined && (!Number.isSafeInteger(value) || value < 1 || value > maxJumpValue)
    if (!jumpValue.trim() || !Number.isFinite(value) || value < 0 || invalidPosition) {
      setJumpTarget(null)
      setJumpFeedback({
        message: maxJumpValue === undefined ? '0以上の値を入力'
          : `1〜${formatNumber(maxJumpValue)}${activeJumpKind === 'rank' ? '位' : '行目'}を入力`,
        invalid: true,
      })
      jumpInput.current?.focus({ preventScroll: true })
      return
    }

    if (activeJumpKind === 'row') {
      moveToRow(value)
      setJumpFeedback(null)
      return
    }

    const target = findMainStorySpawnJump(lists, query, view, sort, { kind: activeJumpKind, value })
    if (!target) {
      setJumpTarget(null)
      setJumpFeedback({ message: '該当する行がありません' })
      return
    }
    moveToRow(target.offset + 1)
    const jumpByRank = activeJumpKind === 'rank'
    const match = jumpByRank ? target.rank : target.value
    setJumpFeedback(match === value ? null : {
      message: jumpByRank ? `${formatNumber(value)}位 → 同順位の${formatNumber(match)}位`
        : `${formatNumber(value)} → ${formatNumber(match)}`,
    })
  }

  function openImage() {
    if (!currentListLoad?.data || tableRowCount === 0) return
    const selectedStage = stageId === '' ? undefined : scope[0]
    const chapterLabel = chapter === '' ? '全章' : `${chapter}章`
    const scopeLabel = selectedStage ? `${selectedStage.code} ${selectedStage.name}` : `${chapterLabel}・全ステージ`
    const displayMode = view === 'units' ? VIEWS[0].label : VIEWS[1].label
    const sortLabel = columns.find(([key]) => key === sort.key)?.[1] ?? 'ステージ'
    const conditions = [
      ...DATA_CONDITIONS, scopeLabel, displayMode, `${sortLabel} ${sort.direction === 'asc' ? '昇順' : '降順'}`,
      ...(query.trim() ? [`敵名「${query.trim()}」`] : []),
    ]
    const imageColumns: readonly (readonly [MainStorySpawnImageColumnKey, string])[] = [
      ['rowNumber', '行番号'], ...(rankLabel ? [['rank', `${rankLabel}順位`] as const] : []), ...columns,
    ]
    setImageSelection({
      currentPageRange: { start: offset + 1, end: Math.min(offset + PAGE_SIZE, tableRowCount) },
      totalRows: tableRowCount,
      columns: imageColumns,
      createSnapshot: ({ start, end }, highlights) => {
        const startOffset = start - 1
        const limit = end - start + 1
        const result = getMainStorySpawnRows(lists, query, view, startOffset, limit, sort)
        const stageStatuses = getStatusRowsInRange(statuses, startOffset, limit, result.rowCount)
        const rangeLabel = start === end ? formatNumber(start) : `${formatNumber(start)}〜${formatNumber(end)}`
        const highlightedColumns = imageColumns.filter(([key]) => highlights.columns.includes(key)).map(([, label]) => label)
        const highlightConditions = [
          ...(highlights.rows.length ? [`強調行 ${formatMainStorySpawnImageHighlightRows(highlights.rows)}`] : []),
          ...(highlightedColumns.length ? [`強調列 ${highlightedColumns.join('・')}`] : []),
        ]
        const outputConditions = [...conditions, `${rangeLabel}行目`, ...highlightConditions]
        return {
          title: TITLE,
          conditions: outputConditions,
          filenameConditions: highlightConditions.length ? [...highlightConditions, ...conditions, `${rangeLabel}行目`] : undefined,
          table: <MainStorySpawnTable view={view} rows={result.rows} statusRows={stageStatuses}
            startRowNumber={start} rankLabel={rankLabel} highlights={highlights} forImage />,
        }
      },
    })
  }

  function openChapterImage() {
    if (!chapterRows.length) return
    setChapterImage(createMainStoryChapterSpawnImage({
      table: <MainStoryChapterSpawnTable rows={chapterRows} />, query, scopeLabel: '全章',
      sortLabel: `${chapterSortLabels[chapterSort.key]} ${chapterSort.direction === 'asc' ? '昇順' : '降順'}`,
      confirmedCount: chapterCount, stageCount: stages.length,
      partialStageCount: chapterRows.reduce((sum, row) => sum + row.partialStageCount, 0),
    }))
  }

  const enemySearch = <label><span>敵名</span><input type="search" placeholder="敵名を検索" value={query} onChange={event => {
    setQuery(event.target.value)
    changePage(0)
  }} /></label>

  return <PageLayout page="main-enemy-spawns" className="enemy-analysis-route main-story-spawns-page">
    <PageBreadcrumbs parents={[{ label: '敵データベース', href: '#/enemies' }]} current={TITLE} />
    <div className="main-story-spawns-intro">{DATA_CONDITIONS.join('・')}</div>
    <PageOutputTabs {...tabProps} tabs={TABS} onChange={setTab} label="出現敵の集計"
      actions={tab === 'chapters'
        ? chapterRows.length > 0 && <OutputImageSaveButton onClick={openChapterImage} />
        : tableRowCount > 0 && <OutputImageSaveButton onClick={openImage} />} />
    <EnemyDataContent loading={currentStageLoad === null} error={currentStageLoad?.error ?? null}
      onRetry={() => setStageAttempt(previous => previous + 1)}>
      {tab === 'chapters' ? <AnalysisTabPanel {...tabProps} tab="chapters">
        <div className="main-story-chapter-controls">
          <div className="main-story-spawns-filters">{enemySearch}</div>
          {currentListLoad?.data && <output className="main-story-spawns-total" aria-live="polite">
            確認済み {formatNumber(chapterCount)}回
          </output>}
        </div>
        <EnemyDataContent loading={loading} error={currentListLoad?.error ?? null}
          onRetry={() => setListAttempt(previous => previous + 1)}>
          <div className="table-wrap main-story-spawns-table-wrap" role="region" tabIndex={0} aria-label="章別の出現回数の表">
            <MainStoryChapterSpawnTable rows={chapterRows} sorting={{ sort: chapterSort, onSort: key => {
              setChapterSort(previous => ({
                key, direction: previous.key === key ? (previous.direction === 'asc' ? 'desc' : 'asc')
                  : key === 'chapter' ? 'asc' : 'desc',
              }))
            } }} />
          </div>
          {chapterRows.some(row => row.partialStageCount > 0) &&
            <p className="main-story-chapter-note">一部集計のステージを含む章では、出現回数は確認できた下限です。</p>}
        </EnemyDataContent>
      </AnalysisTabPanel> : <AnalysisTabPanel {...tabProps} tab="list">
      <section className="main-story-spawns-panel" aria-label="出現敵一覧">
        <div className="main-story-spawns-filters">
          <label><span>章</span><select value={chapter} onChange={event => changeChapter(event.target.value)}>
            <option value="">全章</option>
            {chapters.map(value => <option key={value} value={value}>{value}章</option>)}
          </select></label>
          <label><span>ステージ</span><select value={stageId} onChange={event => {
            setStageId(event.target.value)
            changePage(0)
          }}>
            <option value="">全ステージ</option>
            {chapterStages.map(item => <option key={item.id} value={item.id}>{item.code} {item.name}</option>)}
          </select></label>
          {enemySearch}
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
          </div>
        </div>
        <div aria-busy={loading}>
          <EnemyDataContent loading={loading} error={currentListLoad?.error ?? null}
            onRetry={() => { changePage(0); setListAttempt(previous => previous + 1) }}>
            {tableRowCount > 0 && <form className="main-story-spawns-jump" noValidate
              aria-label="行へ移動" onSubmit={jumpToRow}>
              {canJumpByStat ? <div className="main-story-spawns-jump-options" role="group" aria-label="移動先">
                <button type="button" className="button secondary" aria-pressed={activeJumpKind === 'row'}
                  onClick={() => changeJumpKind('row')}>行番号</button>
                <button type="button" className="button secondary" aria-pressed={activeJumpKind === 'rank'}
                  onClick={() => changeJumpKind('rank')}>順位</button>
                <button type="button" className="button secondary" aria-pressed={activeJumpKind === 'stat'}
                  onClick={() => changeJumpKind('stat')}>{rankLabel}</button>
              </div> : <label htmlFor={jumpInputId}>行番号</label>}
              <input id={jumpInputId} ref={jumpInput} type="number" value={jumpValue} autoComplete="off"
                min={maxJumpValue === undefined ? 0 : 1} max={maxJumpValue} step={maxJumpValue === undefined ? 'any' : 1}
                inputMode={maxJumpValue === undefined ? 'decimal' : 'numeric'} aria-label={`指定する${jumpLabel}`}
                aria-invalid={jumpFeedback?.invalid} aria-describedby={jumpFeedback ? jumpFeedbackId : undefined}
                onChange={event => {
                  setJumpKind(activeJumpKind)
                  setJumpValue(event.target.value)
                  setJumpFeedback(null)
                }} />
              <button type="submit" className="button">移動</button>
              <output id={jumpFeedbackId} aria-live="polite" data-invalid={jumpFeedback?.invalid}>
                {jumpFeedback?.message}
              </output>
            </form>}
            <div className="table-wrap main-story-spawns-table-wrap" role="region" tabIndex={0} aria-label="出現敵一覧の表">
              <MainStorySpawnTable view={view} rows={rows} statusRows={statusRows}
                startRowNumber={offset + 1} rankLabel={rankLabel}
                sorting={{ sort, onSort: changeSort }} selectedRowNumber={jumpTarget?.rowNumber} selectedRowRef={jumpRow} />
            </div>
            {pageCount > 1 && <nav className="enemy-pagination main-story-spawns-pagination" aria-label="出現敵一覧のページ切り替え">
              <span>{formatNumber(offset + 1)}–{formatNumber(Math.min(offset + PAGE_SIZE, tableRowCount))} / {formatNumber(tableRowCount)}行</span>
              <div>
                <button type="button" disabled={page === 0} onClick={() => changePage(page - 1)}>前へ</button>
                <span aria-live="polite">{page + 1} / {pageCount}</span>
                <button type="button" disabled={page + 1 >= pageCount} onClick={() => changePage(page + 1)}>次へ</button>
              </div>
            </nav>}
          </EnemyDataContent>
        </div>
      </section>
      </AnalysisTabPanel>}
    </EnemyDataContent>
    {chapterImage && <ComparisonTableImageDialog snapshot={chapterImage} parentLocation={[TITLE, TABS[1][1]]}
      onClose={() => setChapterImage(null)} />}
    {imageSelection && <MainStorySpawnImageDialog selection={imageSelection} onClose={() => setImageSelection(null)} />}
  </PageLayout>
}

function MainStorySpawnTable({ view, rows, statusRows, startRowNumber, rankLabel, sorting,
  selectedRowNumber, selectedRowRef, highlights, forImage = false }: {
  view: View
  rows: readonly MainStorySpawnRow[]
  statusRows: readonly MainStorySpawnList[]
  startRowNumber: number
  rankLabel?: string
  sorting?: { sort: MainStorySpawnSort; onSort: (key: MainStorySpawnSortKey) => void }
  selectedRowNumber?: number
  selectedRowRef?: Ref<HTMLTableRowElement>
  highlights?: MainStorySpawnImageHighlights
  forImage?: boolean
}) {
  const showUnits = view === 'units'
  const columns = showUnits ? UNIT_COLUMNS : COUNT_COLUMNS
  const showRank = rankLabel !== undefined
  const imageNumber = forImage ? true : undefined
  const style = forImage ? { '--main-story-spawns-image-row-height': `${MAIN_STORY_SPAWN_IMAGE_ROW_MIN_HEIGHT}px` } as CSSProperties : undefined
  return <table className={forImage ? 'main-story-spawns-table main-story-spawns-image-table' : 'main-story-spawns-table'}
    data-view={view} aria-label="出現敵一覧" style={style}>
    {forImage && <colgroup><col />{showRank && <col />}{columns.map(([key]) => <col key={key} />)}</colgroup>}
    <thead><tr>
      <th scope="col" className="main-story-spawns-static-heading"
        data-image-highlight-column={highlights?.columns.includes('rowNumber') || undefined}>行番号</th>
      {showRank && <th scope="col" className="main-story-spawns-static-heading"
        data-image-highlight-column={highlights?.columns.includes('rank') || undefined}>{rankLabel}順位</th>}
      {columns.map(([key, label]) => sorting
        ? <MainStorySpawnSortableHeader key={key} column={key} label={label} {...sorting} />
        : <th key={key} scope="col" className={textColumnClass(key)}
          data-image-highlight-column={highlights?.columns.includes(key) || undefined}>{label}</th>)}
    </tr></thead>
    <tbody>
      {rows.map((row, index) => <MainStorySpawnTableRow key={row.key} row={row} rowNumber={startRowNumber + index}
        showUnits={showUnits} showRank={showRank}
        forImage={forImage} highlights={highlights}
        selected={startRowNumber + index === selectedRowNumber} selectedRef={selectedRowRef} />)}
      {statusRows.map(({ stage, status }, index) => {
        if (status === 'confirmed') return null
        const rowNumber = startRowNumber + rows.length + index
        const selected = rowNumber === selectedRowNumber
        return <tr key={stage.id} className="main-story-spawns-status-row" aria-current={selected || undefined}
          data-image-highlight-row={highlights?.rows.includes(rowNumber) || undefined}
          tabIndex={selected ? -1 : undefined} ref={selected ? selectedRowRef : undefined}>
          <td data-table-image-number={imageNumber}
            data-image-highlight-column={highlights?.columns.includes('rowNumber') || undefined}>{formatNumber(rowNumber)}</td>
          {showRank && <td data-image-highlight-column={highlights?.columns.includes('rank') || undefined}>—</td>}
          {forImage && highlights?.columns.length ? columns.map(([key]) => key === 'enemyName'
            ? <th key={key} scope="row" className="main-story-spawns-text-cell"
              data-image-highlight-column={highlights?.columns.includes(key) || undefined}>{STAGE_STATUS[status]}</th>
            : <td key={key} className={textColumnClass(key)}
              data-image-highlight-column={highlights?.columns.includes(key) || undefined}>{key === 'stage' ? stage.code : '—'}</td>)
            : <>
              <th scope="row" colSpan={STATS.length + 1} className="main-story-spawns-text-cell">{STAGE_STATUS[status]}</th>
              <td className="main-story-spawns-text-cell">{stage.code}</td>
              <td colSpan={columns.length - COMMON_COLUMNS.length}>—</td>
            </>}
        </tr>
      })}
      {rows.length === 0 && statusRows.length === 0 && <tr>
        <td className="main-story-spawns-empty" colSpan={1 + columns.length + Number(showRank)}>該当する敵はいません</td>
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
  return <th scope="col" className={textColumnClass(column) ?? 'numeric-heading'}
    aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}>
    <button type="button" className="enemy-sort-button" aria-label={`${label}を${directionLabel}に並べ替え`}
      onClick={() => onSort(column)}>
      <span>{label}</span>
      <span className="enemy-sort-indicator" aria-hidden="true">{active ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}</span>
    </button>
  </th>
}

function MainStorySpawnTableRow({ row, rowNumber, showUnits, showRank, forImage, highlights, selected, selectedRef }: {
  row: MainStorySpawnRow
  rowNumber: number
  showUnits: boolean
  showRank: boolean
  forImage: boolean
  highlights?: MainStorySpawnImageHighlights
  selected: boolean
  selectedRef?: Ref<HTMLTableRowElement>
}) {
  const waveFragment = row.wave === null && row.fragment === null
    ? row.fromBranch ? '分岐' : '—'
    : `${formatNumber(row.wave)}／${formatNumber(row.fragment)}`
  const imageNumber = forImage ? true : undefined
  return <tr aria-current={selected || undefined} tabIndex={selected ? -1 : undefined} ref={selected ? selectedRef : undefined}
    data-image-highlight-row={highlights?.rows.includes(rowNumber) || undefined}>
    <td data-table-image-number={imageNumber}
      data-image-highlight-column={highlights?.columns.includes('rowNumber') || undefined}>{formatNumber(rowNumber)}</td>
    {showRank && <td data-table-image-number={imageNumber} data-image-highlight-column={highlights?.columns.includes('rank') || undefined}>
      {row.rank == null ? '—' : `${formatNumber(row.rank)}位`}
    </td>}
    <th scope="row" className="main-story-spawns-text-cell"
      data-image-highlight-column={highlights?.columns.includes('enemyName') || undefined}>{row.enemyName}</th>
    {STATS.map(([key]) => <td key={key} data-table-image-number={imageNumber}
      data-image-highlight-column={highlights?.columns.includes(key) || undefined}>{formatNumber(row.stats[key])}</td>)}
    <td className="main-story-spawns-text-cell" data-image-highlight-column={highlights?.columns.includes('stage') || undefined}>{row.stage.code}</td>
    {showUnits ? <>
      <td data-image-highlight-column={highlights?.columns.includes('wave') || undefined}>{waveFragment}</td>
      <td data-table-image-number={imageNumber}
        data-image-highlight-column={highlights?.columns.includes('time') || undefined}>{formatNumber(row.time)}</td>
      <td data-image-highlight-column={highlights?.columns.includes('entrance') || undefined}>{row.entrance ?? '—'}</td>
    </> : <td data-table-image-number={imageNumber}
      data-image-highlight-column={highlights?.columns.includes('count') || undefined}>{formatNumber(row.count)}</td>}
  </tr>
}
