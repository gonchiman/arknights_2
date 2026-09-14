import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_OPERATOR_DATABASE_SORT,
  EMPTY_OPERATOR_DATABASE_FILTERS,
  buildOperatorDatabaseRecords,
  filterAndSortOperatorDatabaseRecords,
  type OperatorDatabaseFilters,
  type OperatorDatabaseRecord,
  type OperatorDatabaseSort,
  type OperatorDatabaseSortKey,
} from '../lib/operatorDatabase'
import { OPERATOR_INITIAL_LABELS, PROFESSION_ORDER } from '../lib/operatorFilters'
import { buildSubProfessionOptions } from '../lib/operatorSearchFilters'
import type { SkillRecord } from '../types/skill'
import type { FilterOption } from './Filters'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { OperatorDetailLink, type OpenOperatorDetail } from './OperatorDetailLink'
import { OperatorFilterPanel } from './OperatorFilterPanel'
import { OperatorStatisticsPanel, OperatorStatisticsSettings, useOperatorStatisticsControls } from './OperatorStatisticsPanel'
import './DamageCalculator.css'
import './OperatorDatabase.css'

interface Props {
  rows: SkillRecord[]
  loading: boolean
  onOpenOperatorDetail?: OpenOperatorDetail
}

const NUMBER_FORMATTER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })

export function OperatorDatabase({
  rows,
  loading,
  onOpenOperatorDetail,
}: Props) {
  const statisticsControls = useOperatorStatisticsControls()
  const [filters, setFilters] = useState({ ...EMPTY_OPERATOR_DATABASE_FILTERS })
  const [tableFilters, setTableFilters] = useState({ ...EMPTY_OPERATOR_DATABASE_FILTERS })
  const [sort, setSort] = useState<OperatorDatabaseSort>({ ...DEFAULT_OPERATOR_DATABASE_SORT })
  const tableScrollRef = useRef<HTMLDivElement | null>(null)

  const records = useMemo(() => buildOperatorDatabaseRecords(rows), [rows])
  const professionOptions = useMemo(() => buildProfessionOptions(records), [records])
  const statisticsFilters = useMemo(() => ({ ...filters, nameInitial: 'ALL' as const, query: '' }), [filters])
  const statisticsSubProfessionOptions = useMemo(
    () => buildSubProfessionOptions(rows, statisticsFilters.profession),
    [rows, statisticsFilters.profession],
  )
  const visibleRecords = useMemo(() => filterAndSortOperatorDatabaseRecords(
    records,
    statisticsFilters,
    DEFAULT_OPERATOR_DATABASE_SORT,
  ), [records, statisticsFilters])
  const scopeLabel = getOperatorScopeLabel(statisticsFilters, professionOptions, statisticsSubProfessionOptions)
  const tableRecords = useMemo(() => filterAndSortOperatorDatabaseRecords(
    records,
    tableFilters,
    sort,
  ), [records, tableFilters, sort])
  const tableScopeLabel = getOperatorScopeLabel(tableFilters, professionOptions)

  useEffect(() => {
    if (tableScrollRef.current) tableScrollRef.current.scrollTop = 0
  }, [tableFilters, sort])

  const updateSort = (key: OperatorDatabaseSortKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key
        ? (current.direction === 'asc' ? 'desc' : 'asc')
        : getDefaultSortDirection(key),
    }))
  }

  const resetFilters = () => setFilters({ ...EMPTY_OPERATOR_DATABASE_FILTERS })
  const resetTableFilters = () => setTableFilters({ ...EMPTY_OPERATOR_DATABASE_FILTERS })

  return (
    <section className="calculator-page operator-database-page">
      <header className="page-intro">
        <div>
          <span className="page-kicker">OPERATOR DATABASE</span>
          <h1>オペレーターデータベース</h1>
        </div>
      </header>

      <section className="operator-directory" aria-label="オペレーターデータベース">
        {loading ? (
          <div className="operator-directory-state" role="status">オペレーターデータを読み込んでいます…</div>
        ) : (
          <>
            <OperatorStatisticsPanel
              rows={visibleRecords}
              scopeLabel={scopeLabel}
              controls={statisticsControls}
              filterSettings={(
                <>
                  <OperatorFilterPanel
                    inline
                    label="統計の対象の絞り込み"
                    value={statisticsFilters}
                    professionOptions={professionOptions}
                    subProfessionOptions={statisticsSubProfessionOptions}
                    showNameInitial={false}
                    showSearch={false}
                    headingLabel="絞り込み条件"
                    onChange={setFilters}
                    onReset={resetFilters}
                    sharedSettings={<OperatorStatisticsSettings controls={statisticsControls} />}
                  />
                </>
              )}
            />
            <CollapsibleCalculatorPanel
              id="operator-reference"
              number="02"
              title="対象のオペレーター一覧"
              summary={`${tableScopeLabel} · ${tableRecords.length}名`}
              collapsedLabel="一覧を表示"
              className="operator-reference-panel"
            >
              <h3 className="enemy-table-title">オペレーターの絞り込み</h3>
              <OperatorFilterPanel
                inline
                value={tableFilters}
                professionOptions={professionOptions}
                onChange={setTableFilters}
                onReset={resetTableFilters}
              />
              <div className="operator-table-toolbar">
                <span role="status" aria-live="polite">{tableRecords.length} / {records.length} 名表示</span>
                <span>ステータスは最終昇進・最大Lv・信頼度100（潜在能力／モジュール補正なし）</span>
              </div>
              <h3 className="enemy-table-title" id="operator-table-heading">オペレーターの基礎ステータス</h3>
              <div
                ref={tableScrollRef}
                className="table-wrap operator-database-table-wrap"
                role="region"
                tabIndex={0}
                aria-label="オペレーターの基礎ステータス一覧・スクロール領域"
              >
                <table className="operator-database-table" aria-labelledby="operator-table-heading">
                  <caption className="visually-hidden">オペレーター情報の検索結果</caption>
                  <thead>
                    <tr>
                      <SortableHeader label="オペレーター" sortKey="operator" sort={sort} onSort={updateSort} />
                      <SortableHeader label="レアリティ" sortKey="rarity" sort={sort} onSort={updateSort} />
                      <SortableHeader label="職業" sortKey="profession" sort={sort} onSort={updateSort} />
                      <th scope="col">職分</th>
                      <SortableHeader label="HP" sortKey="maxHp" sort={sort} onSort={updateSort} />
                      <SortableHeader label="攻撃" sortKey="attack" sort={sort} onSort={updateSort} />
                      <SortableHeader label="防御" sortKey="defense" sort={sort} onSort={updateSort} />
                      <SortableHeader label="術耐性" sortKey="magicResistance" sort={sort} onSort={updateSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {tableRecords.length === 0 && (
                      <tr>
                        <td colSpan={8}>
                          条件に一致するオペレーターがいません。一覧の絞り込み条件を変更してください。
                        </td>
                      </tr>
                    )}
                    {tableRecords.map((operator) => (
                      <tr key={operator.operatorId}>
                        <td>
                          <OperatorDetailLink
                            operatorId={operator.operatorId}
                            onOpenOperatorDetail={onOpenOperatorDetail}
                            className="operator-database-name-button"
                            data-operator-id={operator.operatorId}
                            aria-label={`${operator.name}の詳細を開く`}
                          >
                            {operator.name}
                          </OperatorDetailLink>
                        </td>
                        <td>★{operator.rarity}</td>
                        <td>{operator.professionLabel}</td>
                        <td>{operator.subProfessionName}</td>
                        <StatCell value={operator.stats.maxHp} />
                        <StatCell value={operator.stats.attack} />
                        <StatCell value={operator.stats.defense} />
                        <StatCell value={operator.stats.magicResistance} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CollapsibleCalculatorPanel>
          </>
        )}
      </section>

    </section>
  )
}

interface SortableHeaderProps {
  label: string
  sortKey: OperatorDatabaseSortKey
  sort: OperatorDatabaseSort
  onSort: (key: OperatorDatabaseSortKey) => void
}

function SortableHeader({ label, sortKey, sort, onSort }: SortableHeaderProps) {
  const active = sort.key === sortKey
  const ariaSort = active
    ? (sort.direction === 'asc' ? 'ascending' : 'descending')
    : 'none'

  return (
    <th scope="col" aria-sort={ariaSort}>
      <button type="button" className="operator-database-sort-button" onClick={() => onSort(sortKey)}>
        <span>{label}</span>
        <span className="operator-database-sort-indicator" aria-hidden="true">
          {active ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  )
}

function StatCell({ value }: { value: number | null }) {
  return <td className="operator-database-stat-cell">{formatInteger(value)}</td>
}

function buildProfessionOptions(records: OperatorDatabaseRecord[]): FilterOption[] {
  const order = new Map<string, number>(
    PROFESSION_ORDER.map((profession, index) => [profession, index]),
  )

  return [...new Map(records.map((record) => [
    record.profession,
    { value: record.profession, label: record.professionLabel },
  ])).values()].sort((a, b) => (
    (order.get(a.value) ?? PROFESSION_ORDER.length)
    - (order.get(b.value) ?? PROFESSION_ORDER.length)
    || a.label.localeCompare(b.label, 'ja')
  ))
}

function getOperatorScopeLabel(
  filters: OperatorDatabaseFilters,
  professionOptions: FilterOption[],
  subProfessionOptions: FilterOption[] = [],
): string {
  const parts: string[] = []
  if (filters.nameInitial !== 'ALL') parts.push(OPERATOR_INITIAL_LABELS[filters.nameInitial])
  if (filters.profession !== 'ALL') {
    parts.push(professionOptions.find(({ value }) => value === filters.profession)?.label ?? filters.profession)
  }
  if (filters.subProfession !== 'ALL') {
    parts.push(subProfessionOptions.find(({ value }) => value === filters.subProfession)?.label ?? filters.subProfession)
  }
  if (filters.rarity !== 'ALL') parts.push(`★${filters.rarity}`)
  if (filters.query.trim()) parts.push(`検索「${filters.query.trim()}」`)
  return parts.length > 0 ? parts.join(' / ') : '全オペレーター'
}

function getDefaultSortDirection(key: OperatorDatabaseSortKey): OperatorDatabaseSort['direction'] {
  return key === 'operator' || key === 'profession' ? 'asc' : 'desc'
}

function formatInteger(value: number | null): string {
  return value === null ? '—' : NUMBER_FORMATTER.format(value)
}
