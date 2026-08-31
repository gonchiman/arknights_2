import { useMemo, useRef, useState } from 'react'
import {
  DEFAULT_OPERATOR_DATABASE_SORT,
  EMPTY_OPERATOR_DATABASE_FILTERS,
  buildOperatorDatabaseRecords,
  filterAndSortOperatorDatabaseRecords,
  hasActiveOperatorDatabaseFilters,
  type OperatorDatabaseRecord,
  type OperatorDatabaseSort,
  type OperatorDatabaseSortKey,
} from '../lib/operatorDatabase'
import { PROFESSION_ORDER } from '../lib/operatorFilters'
import type { SkillRecord } from '../types/skill'
import { Filters, type FilterOption } from './Filters'
import { OperatorDetailModal } from './OperatorDetailModal'
import './OperatorDatabase.css'

interface Props {
  rows: SkillRecord[]
  loading: boolean
}

const NUMBER_FORMATTER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })

export function OperatorDatabase({ rows, loading }: Props) {
  const [filters, setFilters] = useState({ ...EMPTY_OPERATOR_DATABASE_FILTERS })
  const [sort, setSort] = useState<OperatorDatabaseSort>({ ...DEFAULT_OPERATOR_DATABASE_SORT })
  const [detailOperator, setDetailOperator] = useState<OperatorDatabaseRecord | null>(null)
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null)

  const records = useMemo(() => buildOperatorDatabaseRecords(rows), [rows])
  const professionOptions = useMemo(() => buildProfessionOptions(records), [records])
  const visibleRecords = useMemo(() => filterAndSortOperatorDatabaseRecords(
    records,
    filters,
    sort,
  ), [records, filters, sort])

  const updateSort = (key: OperatorDatabaseSortKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key
        ? (current.direction === 'asc' ? 'desc' : 'asc')
        : getDefaultSortDirection(key),
    }))
  }

  const resetFilters = () => setFilters({ ...EMPTY_OPERATOR_DATABASE_FILTERS })

  const openDetail = (operator: OperatorDatabaseRecord, trigger: HTMLButtonElement) => {
    detailTriggerRef.current = trigger
    setDetailOperator(operator)
  }

  const closeDetail = () => {
    setDetailOperator(null)
    window.requestAnimationFrame(() => {
      const trigger = detailTriggerRef.current
      if (trigger?.isConnected) trigger.focus()
    })
  }

  return (
    <section className="operator-database-page">
      <header className="page-intro">
        <div>
          <span className="page-kicker">OPERATOR DATABASE</span>
          <h1>オペレーターデータベース</h1>
        </div>
        <p>オペレーターを絞り込み、基本ステータス・潜在能力・素質・スキル・モジュールを横断して確認します。</p>
      </header>

      <section className="operator-database-panel" aria-label="オペレーターデータベース">
        <Filters
          value={filters}
          professionOptions={professionOptions}
          onChange={setFilters}
          onReset={resetFilters}
          searchPlaceholder="名前・職分・潜在能力・素質・スキル・モジュールで検索"
        />

        <div className="result-meta" role="status" aria-live="polite">
          <span>{loading ? '読み込み中...' : `${visibleRecords.length} / ${records.length} 名表示`}</span>
          <span>ステータスは最終昇進・最大Lv・信頼度100（潜在能力／モジュール補正なし）</span>
        </div>

        {!loading && visibleRecords.length === 0 ? (
          <div className="operator-empty-state" role="status">
            <strong>条件に一致するオペレーターがいません</strong>
            <span>検索文字や絞り込み条件を変更してください。</span>
            <button
              type="button"
              className="button secondary"
              disabled={!hasActiveOperatorDatabaseFilters(filters)}
              onClick={resetFilters}
            >
              条件をリセット
            </button>
          </div>
        ) : (
          <div
            className="table-wrap operator-database-table-wrap"
            role="region"
            tabIndex={0}
            aria-label="オペレーター一覧。横方向にスクロールできます"
          >
            <table className="operator-database-table">
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
                {visibleRecords.map((operator) => (
                  <tr key={operator.operatorId}>
                    <td>
                      <button
                        type="button"
                        className="operator-database-name-button"
                        aria-haspopup="dialog"
                        aria-label={`${operator.name}の詳細を開く`}
                        onClick={(event) => openDetail(operator, event.currentTarget)}
                      >
                        {operator.name}
                      </button>
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
        )}
      </section>

      {detailOperator && <OperatorDetailModal operator={detailOperator} onClose={closeDetail} />}
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

function getDefaultSortDirection(key: OperatorDatabaseSortKey): OperatorDatabaseSort['direction'] {
  return key === 'operator' || key === 'profession' ? 'asc' : 'desc'
}

function formatInteger(value: number | null): string {
  return value === null ? '—' : NUMBER_FORMATTER.format(value)
}
