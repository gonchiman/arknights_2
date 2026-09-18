import { useEffect, useMemo, useRef, useState } from 'react'
import {
  loadEnemyRecords,
  matchesEnemyFilters,
  type EnemyFilters,
} from '../lib/enemyData'
import type { EnemyLevelType, EnemyRecord } from '../types/enemy'
import { sortEnemyRows, type EnemyTableSort, type EnemyTableSortKey } from '../lib/enemyTableSort'
import { EnemyDetailModal } from './EnemyDetailModal'
import { EnemyFilterPanel } from './EnemyFilterPanel'
import { EnemyNumericFilter } from './EnemyNumericFilter'
import { EnemyRatingReferenceDialog } from './EnemyRatingReferenceDialog'
import { formatEnemyNumericCondition, matchesEnemyNumericConditions, type EnemyNumericCondition } from '../lib/enemyNumericFilters'
import { EnemyStatisticsPanel, EnemyStatisticsSettings, useEnemyStatisticsControls } from './EnemyStatisticsPanel'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { PersistentDetails } from './PersistentDetails'
import './DamageCalculator.css'
import './EnemyAnalysis.css'

const PAGE_SIZE = 100

const DEFAULT_FILTERS: EnemyFilters = {
  query: '',
  levelType: 'ALL',
}

const LEVEL_OPTIONS: Array<{ value: EnemyLevelType | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'すべて' },
  { value: 'NORMAL', label: '通常' },
  { value: 'ELITE', label: 'エリート' },
  { value: 'BOSS', label: 'ボス' },
  { value: 'UNKNOWN', label: '未分類' },
]

const LEVEL_LABELS: Record<EnemyLevelType, string> = {
  NORMAL: '通常',
  ELITE: 'エリート',
  BOSS: 'ボス',
  UNKNOWN: '未分類',
}

const INTEGER_FORMATTER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })
const DECIMAL_FORMATTER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })
type EnemyStatDisplayMode = 'RATING' | 'VALUE'

const TABLE_COLUMNS: Array<{ key: EnemyTableSortKey; label: string }> = [
  { key: 'name', label: '敵' },
  { key: 'level', label: '区分' },
  { key: 'stages', label: '登場ステージ数' },
  { key: 'hp', label: 'HP' },
  { key: 'attack', label: '攻撃力' },
  { key: 'defense', label: '防御力' },
  { key: 'resistance', label: '術耐性' },
  { key: 'speed', label: '移動速度' },
  { key: 'interval', label: '攻撃間隔' },
  { key: 'weight', label: '重量' },
]

export function EnemyAnalysis() {
  const statisticsControls = useEnemyStatisticsControls()
  const [rows, setRows] = useState<EnemyRecord[]>([])
  const [filters, setFilters] = useState<EnemyFilters>({ ...DEFAULT_FILTERS })
  const [numericConditions, setNumericConditions] = useState<readonly EnemyNumericCondition[]>([])
  const [page, setPage] = useState(0)
  const [loadVersion, setLoadVersion] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detailEnemy, setDetailEnemy] = useState<EnemyRecord | null>(null)
  const [ratingReferenceOpen, setRatingReferenceOpen] = useState(false)
  const [statDisplayMode, setStatDisplayMode] = useState<EnemyStatDisplayMode>('RATING')
  const [sort, setSort] = useState<EnemyTableSort | null>(null)
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null)
  const ratingReferenceTriggerRef = useRef<HTMLButtonElement>(null)
  const tableScrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

    void loadEnemyRecords()
      .then((records) => {
        if (!active) return
        setRows(records)
      })
      .catch((cause) => {
        if (!active) return
        setError(cause instanceof Error ? cause.message : '不明なエラーが発生しました。')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [loadVersion])

  const filteredRows = useMemo(
    () => rows.filter((enemy) => matchesEnemyFilters(enemy, filters)),
    [rows, filters],
  )
  const tableRows = useMemo(
    () => filteredRows.filter((enemy) => matchesEnemyNumericConditions(enemy, numericConditions)),
    [filteredRows, numericConditions],
  )
  const sortedRows = useMemo(() => sortEnemyRows(tableRows, sort), [tableRows, sort])
  const pageCount = Math.ceil(tableRows.length / PAGE_SIZE)
  const currentPage = Math.min(page, Math.max(0, pageCount - 1))
  const visibleRows = sortedRows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
  const rangeStart = tableRows.length === 0 ? 0 : currentPage * PAGE_SIZE + 1
  const rangeEnd = Math.min((currentPage + 1) * PAGE_SIZE, tableRows.length)
  const filtersActive = filters.query !== '' || filters.levelType !== 'ALL'
  const scopeLabel = getEnemyScopeLabel(filters)
  const tableScopeLabel = [scopeLabel, ...numericConditions.map(formatEnemyNumericCondition)].filter(Boolean).join(' / ')

  useEffect(() => {
    if (tableScrollRef.current) tableScrollRef.current.scrollTop = 0
  }, [currentPage, sort, filters, numericConditions])

  const updateSort = (key: EnemyTableSortKey) => {
    setSort((current) => ({ key, direction: getNextSortDirection(key, current) }))
    setPage(0)
  }

  const resetSort = () => {
    setSort(null)
    setPage(0)
  }

  const updateFilter = <K extends keyof EnemyFilters,>(key: K, value: EnemyFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }))
    setPage(0)
  }

  const resetFilters = () => {
    setFilters({ ...DEFAULT_FILTERS })
    setPage(0)
  }

  const updateNumericConditions = (conditions: readonly EnemyNumericCondition[]) => {
    setNumericConditions(conditions)
    setPage(0)
  }

  const openEnemyDetail = (enemy: EnemyRecord, trigger: HTMLButtonElement) => {
    detailTriggerRef.current = trigger
    setDetailEnemy(enemy)
  }

  const closeEnemyDetail = () => {
    setDetailEnemy(null)
    window.requestAnimationFrame(() => {
      if (detailTriggerRef.current?.isConnected) detailTriggerRef.current.focus()
    })
  }

  const closeRatingReference = () => {
    setRatingReferenceOpen(false)
    window.requestAnimationFrame(() => {
      if (ratingReferenceTriggerRef.current?.isConnected) ratingReferenceTriggerRef.current.focus()
    })
  }

  return (
    <section className="calculator-page enemy-analysis-route">
      <header className="page-intro">
        <div>
          <span className="page-kicker">ENEMY ANALYSIS</span>
          <h1>敵ステータス分析</h1>
        </div>
      </header>

      <section className="enemy-directory" aria-label="敵ステータス分析">
        <EnemyFilterPanel sharedSettings={<EnemyStatisticsSettings controls={statisticsControls} />}>
          <input
            type="search"
            aria-label="検索"
            value={filters.query}
            placeholder="敵名・図鑑番号・能力・内部ID"
            onChange={(event) => updateFilter('query', event.target.value)}
          />
          <div className="enemy-level-filter-buttons" role="group" aria-label="区分">
            {LEVEL_OPTIONS.map((option) => (
              <button
                type="button"
                className={filters.levelType === option.value ? 'active' : ''}
                aria-pressed={filters.levelType === option.value}
                onClick={() => updateFilter('levelType', option.value)}
                key={option.value}
              >{option.label}</button>
            ))}
          </div>
          <button type="button" className="button secondary" onClick={resetFilters} disabled={!filtersActive} aria-label="検索・区分をリセット">リセット</button>
        </EnemyFilterPanel>

        {loading ? (
          <div className="enemy-load-state" role="status">敵データを読み込んでいます…</div>
        ) : error ? (
          <div className="enemy-load-state" role="alert">
            <strong>敵データを読み込めませんでした</strong>
            <span>{error}</span>
            <button type="button" className="button secondary" onClick={() => setLoadVersion((value) => value + 1)}>
              再読み込み
            </button>
          </div>
        ) : (
          <>
            <EnemyStatisticsPanel rows={filteredRows} scopeLabel={scopeLabel} controls={statisticsControls} />

            <CollapsibleCalculatorPanel
              id="enemy-reference"
              number="03"
              title="対象の敵一覧"
              summary={`${tableScopeLabel} · ${tableRows.length} / ${filteredRows.length}体 · ${statDisplayMode === 'RATING' ? 'ゲーム内評価' : '実数値'}`}
              collapsedLabel="一覧を表示"
              className="enemy-table-section"
            >
              <EnemyNumericFilter conditions={numericConditions} onChange={updateNumericConditions} />
              <div className="enemy-table-toolbar">
                <div className="enemy-stat-mode-switch" role="group" aria-label="一覧のステータス表記">
                  <span>ステータス表記</span>
                  <div className="enemy-stat-mode-actions">
                    <div className="enemy-stat-mode-buttons">
                      <button
                        type="button"
                        className={statDisplayMode === 'RATING' ? 'active' : ''}
                        aria-pressed={statDisplayMode === 'RATING'}
                        onClick={() => setStatDisplayMode('RATING')}
                      >ゲーム内評価</button>
                      <button
                        type="button"
                        className={statDisplayMode === 'VALUE' ? 'active' : ''}
                        aria-pressed={statDisplayMode === 'VALUE'}
                        onClick={() => setStatDisplayMode('VALUE')}
                      >実数値</button>
                    </div>
                    <button
                      ref={ratingReferenceTriggerRef}
                      type="button"
                      className="enemy-rating-reference-trigger"
                      aria-haspopup="dialog"
                      onClick={() => setRatingReferenceOpen(true)}
                    >評価基準</button>
                  </div>
                </div>
                <div className="enemy-sort-controls">
                  <span role="status" aria-live="polite">
                    {sort
                      ? `${getColumnLabel(sort.key, statDisplayMode)}：${sort.direction === 'asc' ? '昇順' : '降順'}`
                      : '図鑑順'}
                  </span>
                  <button type="button" onClick={resetSort} disabled={!sort}>図鑑順に戻す</button>
                </div>
                <div className="enemy-result-summary" role="status" aria-live="polite">
                  <span>{tableRows.length} / {filteredRows.length}体</span>
                </div>
              </div>

              <h3 className="enemy-table-title" id="enemy-table-heading">敵の基礎ステータス</h3>
              {tableRows.length === 0 && (
                <div className="enemy-load-state" role="status">
                  {filteredRows.length === 0 ? '検索・区分に一致する敵がいません' : '一覧の条件に一致する敵がいません'}
                </div>
              )}
              <div ref={tableScrollRef} className="table-wrap enemy-table-wrap" hidden={tableRows.length === 0} tabIndex={0} role="region" aria-label="敵の基礎ステータス一覧・スクロール領域">
                <table className="enemy-table" role="table" aria-labelledby="enemy-table-heading">
                  <caption>検索・区分と一覧の数値条件に一致する敵の基礎ステータス一覧</caption>
                  <thead role="rowgroup">
                    <tr role="row">
                      {TABLE_COLUMNS.map(({ key }) => (
                        <EnemySortableHeader key={key} column={key} label={getColumnLabel(key, statDisplayMode)} sort={sort} onSort={updateSort} />
                      ))}
                    </tr>
                  </thead>
                  <tbody role="rowgroup">
                    {visibleRows.map((enemy) => (
                      <EnemyRow
                        enemy={enemy}
                        statDisplayMode={statDisplayMode}
                        onOpenDetail={openEnemyDetail}
                        key={enemy.id}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {pageCount > 1 && (
                <nav className="enemy-pagination" aria-label="敵一覧のページ切り替え">
                  <span>{rangeStart}–{rangeEnd} / {tableRows.length}</span>
                  <div>
                    <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>前へ</button>
                    <span>{currentPage + 1} / {pageCount}</span>
                    <button type="button" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>次へ</button>
                  </div>
                </nav>
              )}
            </CollapsibleCalculatorPanel>
          </>
        )}
      </section>

      <PersistentDetails persistenceId="enemy-data-notes" className="enemy-data-details">
        <summary>データの範囲と表記<span aria-hidden="true" /></summary>
        <p className="enemy-data-note">
          登場ステージ数は通常ステージ集計（stage_table内の戦闘ステージをlevelId単位で重複除去）です。ローグライク等の別管理ステージは含みません。「—」は集計データ未取得を示します。ステージ固有の補正は基礎ステータスへ反映していません。
        </p>
      </PersistentDetails>
      {detailEnemy && <EnemyDetailModal enemy={detailEnemy} onClose={closeEnemyDetail} />}
      {ratingReferenceOpen && <EnemyRatingReferenceDialog onClose={closeRatingReference} />}
    </section>
  )
}

function getColumnLabel(key: EnemyTableSortKey, mode: EnemyStatDisplayMode): string {
  if (key === 'hp' && mode === 'RATING') return '耐久'
  return TABLE_COLUMNS.find((column) => column.key === key)!.label
}

function getNextSortDirection(key: EnemyTableSortKey, sort: EnemyTableSort | null): EnemyTableSort['direction'] {
  if (sort?.key === key) return sort.direction === 'asc' ? 'desc' : 'asc'
  return key === 'name' || key === 'level' ? 'asc' : 'desc'
}

function EnemySortableHeader({ column, label, sort, onSort }: {
  column: EnemyTableSortKey
  label: string
  sort: EnemyTableSort | null
  onSort: (key: EnemyTableSortKey) => void
}) {
  const active = sort?.key === column
  const numeric = column !== 'name' && column !== 'level'
  const nextDirection = getNextSortDirection(column, sort)
  return (
    <th
      scope="col"
      role="columnheader"
      id={`enemy-column-${column}`}
      className={numeric ? 'numeric-heading' : undefined}
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      <button
        type="button"
        className="enemy-sort-button"
        aria-label={`${label}を${nextDirection === 'asc' ? '昇順' : '降順'}に並べ替え`}
        onClick={() => onSort(column)}
      >
        <span>{label}</span>
        <span className="enemy-sort-indicator" aria-hidden="true">{active ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  )
}

function EnemyRow({
  enemy,
  statDisplayMode,
  onOpenDetail,
}: {
  enemy: EnemyRecord
  statDisplayMode: EnemyStatDisplayMode
  onOpenDetail: (enemy: EnemyRecord, trigger: HTMLButtonElement) => void
}) {
  return (
    <tr role="row">
      <td className="enemy-identity-cell" role="cell" headers="enemy-column-name">
        <span className="enemy-index">{enemy.index || '—'}</span>
        <button
          type="button"
          className="enemy-detail-button"
          aria-haspopup="dialog"
          aria-label={`${enemy.name}の詳細を開く`}
          title={enemy.name}
          onClick={(event) => onOpenDetail(enemy, event.currentTarget)}
        >
          <strong>{enemy.name}</strong>
          <span aria-hidden="true">詳細</span>
        </button>
      </td>
      <td role="cell" headers="enemy-column-level">
        <span className={`enemy-level-badge ${enemy.levelType.toLowerCase()}`}>{LEVEL_LABELS[enemy.levelType]}</span>
      </td>
      <EnemyNumberCell column="stages" value={enemy.stageAppearanceCount} />
      <EnemyPrimaryStatCell column="hp" mode={statDisplayMode} rating={enemy.ratings.endurance} value={enemy.stats.maxHp} />
      <EnemyPrimaryStatCell column="attack" mode={statDisplayMode} rating={enemy.ratings.attack} value={enemy.stats.attack} />
      <EnemyPrimaryStatCell column="defense" mode={statDisplayMode} rating={enemy.ratings.defense} value={enemy.stats.defense} />
      <EnemyPrimaryStatCell column="resistance" mode={statDisplayMode} rating={enemy.ratings.resistance} value={enemy.stats.magicResistance} />
      <EnemyNumberCell column="speed" value={enemy.stats.moveSpeed} decimal />
      <td className="enemy-number-cell" role="cell" headers="enemy-column-interval">
        <strong>{formatDecimal(enemy.stats.baseAttackTime, '秒')}</strong>
      </td>
      <EnemyNumberCell column="weight" value={enemy.stats.massLevel} />
    </tr>
  )
}

function EnemyPrimaryStatCell({
  column,
  mode,
  rating,
  value,
}: {
  column: string
  mode: EnemyStatDisplayMode
  rating: string | null
  value: number | null
}) {
  return (
    <td className={`enemy-number-cell ${mode === 'RATING' ? 'enemy-rating-cell' : ''}`} role="cell" headers={`enemy-column-${column}`}>
      <strong>{mode === 'RATING' ? rating ?? '—' : formatInteger(value)}</strong>
    </td>
  )
}

function EnemyNumberCell({ column, value, decimal = false, suffix = '' }: { column: string; value: number | null; decimal?: boolean; suffix?: string }) {
  return (
    <td className="enemy-number-cell" role="cell" headers={`enemy-column-${column}`}>
      <strong>{decimal ? formatDecimal(value, suffix) : formatInteger(value, suffix)}</strong>
    </td>
  )
}

function getEnemyScopeLabel(filters: EnemyFilters): string {
  const parts: string[] = []
  if (filters.levelType !== 'ALL') parts.push(LEVEL_LABELS[filters.levelType])
  if (filters.query.trim()) parts.push(`検索「${filters.query.trim()}」`)
  return parts.length > 0 ? parts.join(' / ') : '全敵'
}

function formatInteger(value: number | null, suffix = ''): string {
  return value === null ? '—' : `${INTEGER_FORMATTER.format(value)}${suffix}`
}

function formatDecimal(value: number | null, suffix = ''): string {
  return value === null ? '—' : `${DECIMAL_FORMATTER.format(value)}${suffix}`
}
