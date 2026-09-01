import { useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  ACTIVATION_TRIGGER_COLORS,
  ACTIVATION_TRIGGER_LABELS,
  ACTIVATION_TRIGGER_OPTIONS,
  EFFECT_WINDOW_COLORS,
  EFFECT_WINDOW_LABELS,
  EFFECT_WINDOW_OPTIONS,
} from '../lib/classifier'
import {
  DEFAULT_SKILL_DIRECTORY_SORT,
  EMPTY_SKILL_DIRECTORY_FILTERS,
  filterAndSortSkillDirectoryRows,
  hasActiveSkillDirectoryFilters,
  type SkillDirectoryFilters,
  type SkillDirectorySort,
  type SkillDirectorySortKey,
} from '../lib/skillDirectory'
import { PROFESSION_ORDER } from '../lib/operatorFilters'
import type {
  ActivationTriggerType,
  EffectWindowType,
  SkillRecord,
} from '../types/skill'
import { SkillEffectModal } from './SkillEffectModal'
import './SkillDirectory.css'

interface Props {
  rows: SkillRecord[]
  loading: boolean
}

const RARITIES = [6, 5, 4, 3, 2, 1] as const

const SP_TYPE_LABELS: Record<string, string> = {
  INCREASE_WITH_TIME: '自然回復',
  INCREASE_WHEN_ATTACK: '攻撃回復',
  INCREASE_WHEN_TAKEN_DAMAGE: '被撃回復',
  NO_SP: 'SPなし',
  UNKNOWN: '要確認',
}

export function SkillDirectory({ rows, loading }: Props) {
  const [filters, setFilters] = useState<SkillDirectoryFilters>({
    ...EMPTY_SKILL_DIRECTORY_FILTERS,
  })
  const [sort, setSort] = useState<SkillDirectorySort>({
    ...DEFAULT_SKILL_DIRECTORY_SORT,
  })
  const [detailSkill, setDetailSkill] = useState<SkillRecord | null>(null)
  const skillDetailTriggerRef = useRef<HTMLTableRowElement | null>(null)

  const professionOptions = useMemo(() => {
    const options = new Map<string, string>()
    rows.forEach((row) => options.set(row.profession, row.professionLabel))
    const order = new Map<string, number>(
      PROFESSION_ORDER.map((profession, index) => [profession, index]),
    )

    return [...options]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => (
        (order.get(a.value) ?? PROFESSION_ORDER.length)
        - (order.get(b.value) ?? PROFESSION_ORDER.length)
        || a.label.localeCompare(b.label, 'ja')
      ))
  }, [rows])

  const visibleRows = useMemo(
    () => filterAndSortSkillDirectoryRows(rows, filters, sort),
    [rows, filters, sort],
  )

  const updateSort = (key: SkillDirectorySortKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key
        ? (current.direction === 'asc' ? 'desc' : 'asc')
        : getDefaultSortDirection(key),
    }))
  }

  const resetFilters = () => setFilters({ ...EMPTY_SKILL_DIRECTORY_FILTERS })

  const openSkillEffect = (skill: SkillRecord, trigger: HTMLTableRowElement) => {
    skillDetailTriggerRef.current = trigger
    setDetailSkill(skill)
  }

  const closeSkillEffect = () => {
    setDetailSkill(null)
    window.requestAnimationFrame(() => {
      const trigger = skillDetailTriggerRef.current
      if (trigger?.isConnected) trigger.focus()
    })
  }

  return (
    <section className="skill-directory-page">
      <h1 className="visually-hidden">スキル一覧</h1>

      <section className="skill-directory-panel" aria-label="全スキル一覧">
        <div className="skill-directory-filters">
          <div className="filters-heading">
            <span>絞り込み</span>
            <button
              type="button"
              className="filter-reset-button"
              disabled={!hasActiveSkillDirectoryFilters(filters)}
              onClick={resetFilters}
            >
              条件をリセット
            </button>
          </div>

          <div className="skill-directory-filter-grid">
            <label className="skill-directory-search">
              <span>文字検索</span>
              <input
                type="search"
                value={filters.query}
                onChange={(event) => setFilters({ ...filters, query: event.target.value })}
                placeholder="オペレーター名・スキル名・説明文で検索"
              />
            </label>

            <FilterSelect
              label="職業"
              value={filters.profession}
              onChange={(value) => setFilters({ ...filters, profession: value })}
              options={professionOptions}
            />

            <label>
              <span>レアリティ</span>
              <select
                value={filters.rarity}
                onChange={(event) => setFilters({
                  ...filters,
                  rarity: event.target.value === 'ALL' ? 'ALL' : Number(event.target.value),
                })}
              >
                <option value="ALL">すべて</option>
                {RARITIES.map((rarity) => (
                  <option value={rarity} key={rarity}>★{rarity}</option>
                ))}
              </select>
            </label>

            <FilterSelect
              label="終了条件"
              value={filters.effectWindow}
              onChange={(value) => setFilters({
                ...filters,
                effectWindow: value as EffectWindowType | 'ALL',
              })}
              options={EFFECT_WINDOW_OPTIONS.map(([value, label]) => ({ value, label }))}
            />

            <FilterSelect
              label="発動契機"
              value={filters.activationTrigger}
              onChange={(value) => setFilters({
                ...filters,
                activationTrigger: value as ActivationTriggerType | 'ALL',
              })}
              options={ACTIVATION_TRIGGER_OPTIONS.map(([value, label]) => ({ value, label }))}
            />
          </div>
        </div>

        <div className="result-meta" role="status" aria-live="polite">
          <span>{loading ? '読み込み中...' : `${visibleRows.length} / ${rows.length} スキル表示`}</span>
          <span>列見出しを選択すると並び順を変更できます</span>
        </div>

        {!loading && visibleRows.length === 0 ? (
          <div className="operator-empty-state" role="status">
            <strong>条件に一致するスキルがありません</strong>
            <span>検索文字や絞り込み条件を変更してください。</span>
            <button type="button" className="button secondary" onClick={resetFilters}>
              条件をリセット
            </button>
          </div>
        ) : (
          <div className="table-wrap skill-directory-table-wrap">
            <table className="skill-directory-table">
              <caption className="visually-hidden">全スキルの検索結果</caption>
              <thead>
                <tr>
                  <SortableHeader label="オペレーター" sortKey="operator" sort={sort} onSort={updateSort} />
                  <SortableHeader label="スキル" sortKey="skill" sort={sort} onSort={updateSort} />
                  <SortableHeader label="レアリティ" sortKey="rarity" sort={sort} onSort={updateSort} />
                  <SortableHeader label="職業 / 職分" sortKey="profession" sort={sort} onSort={updateSort} />
                  <SortableHeader label="発動契機" sortKey="activationTrigger" sort={sort} onSort={updateSort} />
                  <SortableHeader label="終了条件" sortKey="effectWindow" sort={sort} onSort={updateSort} />
                  <SortableHeader label="必要SP" sortKey="spCost" sort={sort} onSort={updateSort} />
                  <th aria-label="詳細画面" />
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr
                    key={row.id}
                    data-skill-id={row.id}
                    tabIndex={0}
                    aria-haspopup="dialog"
                    aria-label={`${row.operatorName}、S${row.skillIndex} ${row.skillName}のスキル効果詳細を開く`}
                    onClick={(event) => openSkillEffect(row, event.currentTarget)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      openSkillEffect(row, event.currentTarget)
                    }}
                  >
                    <td>
                      <span className="skill-directory-operator">{row.operatorName}</span>
                    </td>
                    <td>
                      <span className="skill-directory-skill-name">{row.skillName}</span>
                      <small>S{row.skillIndex} · {row.skillId}</small>
                    </td>
                    <td>★{row.rarity}</td>
                    <td>
                      <span>{row.professionLabel}</span>
                      <small>{row.subProfessionName}</small>
                    </td>
                    <td>
                      <ClassificationTag
                        color={ACTIVATION_TRIGGER_COLORS[row.classification.activationTrigger.value]}
                        label={ACTIVATION_TRIGGER_LABELS[row.classification.activationTrigger.value]}
                      />
                    </td>
                    <td>
                      <ClassificationTag
                        color={EFFECT_WINDOW_COLORS[row.classification.effectWindow.value]}
                        label={EFFECT_WINDOW_LABELS[row.classification.effectWindow.value]}
                      />
                    </td>
                    <td>
                      <span>{row.spCost ?? '—'}</span>
                      <small>初期 {row.initSp ?? '—'} · {SP_TYPE_LABELS[row.spType] ?? row.spType}</small>
                    </td>
                    <td className="detail-link-cell">詳細を見る →</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {detailSkill && <SkillEffectModal skill={detailSkill} onClose={closeSkillEffect} />}
    </section>
  )
}

interface FilterSelectProps {
  label: string
  value: string
  options: Array<{ value: string, label: string }>
  onChange: (value: string | 'ALL') => void
}

function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="ALL">すべて</option>
        {options.map((option) => (
          <option value={option.value} key={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

interface SortableHeaderProps {
  label: string
  sortKey: SkillDirectorySortKey
  sort: SkillDirectorySort
  onSort: (key: SkillDirectorySortKey) => void
}

function SortableHeader({ label, sortKey, sort, onSort }: SortableHeaderProps) {
  const active = sort.key === sortKey
  const ariaSort = active
    ? (sort.direction === 'asc' ? 'ascending' : 'descending')
    : 'none'

  return (
    <th aria-sort={ariaSort}>
      <button type="button" className="skill-sort-button" onClick={() => onSort(sortKey)}>
        <span>{label}</span>
        <span className="skill-sort-indicator" aria-hidden="true">
          {active ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  )
}

function ClassificationTag({ color, label }: { color: string, label: string }) {
  return (
    <span
      className="skill-directory-classification-tag"
      style={{ '--skill-directory-tag-color': color } as CSSProperties}
    >
      {label}
    </span>
  )
}

function getDefaultSortDirection(key: SkillDirectorySortKey): SkillDirectorySort['direction'] {
  return key === 'rarity' ? 'desc' : 'asc'
}
