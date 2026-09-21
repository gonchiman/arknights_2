import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { matchesEnemyFilters } from '../lib/enemyData'
import type { EnemyComparisonCondition, EnemyComparisonSeries } from '../lib/enemyDistributionComparison'
import { matchesEnemyNumericConditions, parseEnemyNumericFilterValue } from '../lib/enemyNumericFilters'
import type { EnemyRecord } from '../types/enemy'
import { EnemyAnalysisFilters } from './EnemyAnalysisFilters'
import './EnemyComparisonConditions.css'

const MAX_CONDITIONS = 4

export function EnemyComparisonConditions({ conditions, series, onChange, rows }: {
  conditions: readonly EnemyComparisonCondition[]
  series: readonly EnemyComparisonSeries[]
  onChange: (conditions: EnemyComparisonCondition[]) => void
  rows: readonly EnemyRecord[]
}) {
  const headingId = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const nextId = useRef(1)
  const [newConditionId, setNewConditionId] = useState<number | null>(null)
  const pendingFocus = useRef<number | 'add' | null>(null)

  useEffect(() => {
    const target = pendingFocus.current
    if (target === null) return
    if (target === 'add') addRef.current?.focus()
    else listRef.current?.querySelector<HTMLButtonElement>(`[data-comparison-condition-id="${target}"] .enemy-comparison-edit`)?.focus()
    pendingFocus.current = null
  }, [conditions])

  const addCondition = () => {
    if (conditions.length >= MAX_CONDITIONS) return
    const id = Math.max(nextId.current, ...conditions.map((condition) => condition.id + 1))
    nextId.current = id + 1
    const usedColors = new Set(conditions.map((condition) => condition.colorIndex))
    const colorIndex = Array.from({ length: MAX_CONDITIONS }, (_, index) => index).find((index) => !usedColors.has(index)) ?? 0
    setNewConditionId(id)
    onChange([...conditions, { id, colorIndex, filters: { query: '', levelType: 'ALL' }, numericConditions: [], visible: true }])
  }

  const removeCondition = (id: number) => {
    if (conditions.length <= 1) return
    const index = conditions.findIndex((condition) => condition.id === id)
    const remaining = conditions.filter((condition) => condition.id !== id)
    pendingFocus.current = remaining[Math.min(index, remaining.length - 1)]?.id ?? 'add'
    onChange(remaining)
  }

  return <section className="enemy-comparison-conditions" aria-labelledby={headingId}>
    <div className="enemy-comparison-conditions-heading">
      <h3 id={headingId}>比較する条件 <span>{conditions.length} / {MAX_CONDITIONS}</span></h3>
      <button type="button" className="enemy-comparison-add" ref={addRef} onClick={addCondition} disabled={conditions.length >= MAX_CONDITIONS}>＋ 比較条件を追加</button>
    </div>
    <div className="enemy-comparison-condition-list" ref={listRef}>
      {conditions.map((condition, index) => <ComparisonConditionRow
        key={condition.id}
        condition={condition}
        index={index}
        series={series.find((item) => item.condition.id === condition.id)}
        rows={rows}
        initiallyEditing={condition.id === newConditionId}
        canRemove={conditions.length > 1}
        onApply={(updated) => onChange(conditions.map((current) => current.id === updated.id ? { ...current, filters: updated.filters, numericConditions: updated.numericConditions } : current))}
        onRemove={() => removeCondition(condition.id)}
      />)}
    </div>
  </section>
}

function ComparisonConditionRow({ condition, index, series, rows, initiallyEditing, canRemove, onApply, onRemove }: {
  condition: EnemyComparisonCondition
  index: number
  series: EnemyComparisonSeries | undefined
  rows: readonly EnemyRecord[]
  initiallyEditing: boolean
  canRemove: boolean
  onApply: (condition: EnemyComparisonCondition) => void
  onRemove: () => void
}) {
  const editorId = useId()
  const errorId = useId()
  const [editing, setEditing] = useState(initiallyEditing)
  const [draft, setDraft] = useState(() => copyCondition(condition))
  const [badInput, setBadInput] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const editRef = useRef<HTMLButtonElement>(null)
  const label = series?.label ?? `条件 ${index + 1}`
  const invalid = badInput || draft.numericConditions.some((item) => item.value.trim() !== '' && parseEnemyNumericFilterValue(item.value) === null)
  const matchedCount = useMemo(() => rows.filter((enemy) => matchesEnemyFilters(enemy, draft.filters) && matchesEnemyNumericConditions(enemy, draft.numericConditions)).length, [rows, draft.filters, draft.numericConditions])

  useEffect(() => {
    if (editing) editorRef.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus()
  }, [editing])

  useLayoutEffect(() => {
    setBadInput(Array.from(editorRef.current?.querySelectorAll<HTMLInputElement>('input[type="number"]') ?? []).some((input) => input.validity.badInput))
  }, [draft.numericConditions, editing])

  const closeEditor = () => {
    setEditing(false)
    setBadInput(false)
    editRef.current?.focus()
  }

  return <div className="enemy-comparison-condition" data-comparison-condition-id={condition.id} data-color-index={condition.colorIndex}>
    <div className="enemy-comparison-condition-summary">
      <div className="enemy-comparison-condition-description">
        <svg className="enemy-comparison-condition-swatch" viewBox="0 0 28 12" aria-hidden="true" style={{ color: `var(--enemy-comparison-series-${condition.colorIndex + 1})` }}>
          <line x1="0" x2="28" y1="6" y2="6" stroke="currentColor" strokeWidth="2" />
          <circle cx="14" cy="6" r="2.5" fill="currentColor" />
        </svg>
        <span className="enemy-comparison-condition-name">{label}</span>
        {series && <span className="enemy-comparison-condition-count">有効 {series.count.toLocaleString('ja-JP')}体 · 欠損 {series.missingCount.toLocaleString('ja-JP')}体</span>}
      </div>
      <div className="enemy-comparison-condition-actions">
        <button type="button" className="enemy-comparison-edit" ref={editRef} aria-label={`比較条件${index + 1}を編集`} aria-expanded={editing} aria-controls={editing ? editorId : undefined} onClick={() => {
          if (editing) closeEditor()
          else {
            setDraft(copyCondition(condition))
            setBadInput(false)
            setEditing(true)
          }
        }}>編集</button>
        <button type="button" aria-label={`比較条件${index + 1}を削除`} onClick={onRemove} disabled={!canRemove}>削除</button>
      </div>
    </div>
    {editing && <div className="enemy-comparison-condition-editor" id={editorId} ref={editorRef} role="group" aria-label={`比較条件${index + 1}の編集`} onInputCapture={() => {
      setBadInput(Array.from(editorRef.current?.querySelectorAll<HTMLInputElement>('input[type="number"]') ?? []).some((input) => input.validity.badInput))
    }}>
      <EnemyAnalysisFilters
        filters={draft.filters}
        onFiltersChange={(filters) => setDraft((current) => ({ ...current, filters }))}
        numericConditions={draft.numericConditions}
        onNumericConditionsChange={(numericConditions) => {
          setDraft((current) => ({ ...current, numericConditions }))
        }}
        matchedCount={matchedCount}
        totalCount={rows.length}
        onReset={() => {
          setDraft((current) => ({ ...current, filters: { query: '', levelType: 'ALL' }, numericConditions: [] }))
          setBadInput(false)
        }}
      />
      <div className="enemy-comparison-editor-actions">
        <button type="button" className="enemy-comparison-apply" disabled={invalid} aria-describedby={invalid ? errorId : undefined} onClick={() => {
          if (invalid) return
          onApply(copyCondition(draft))
          closeEditor()
        }}>適用</button>
        <button type="button" onClick={closeEditor}>キャンセル</button>
        {invalid && <span id={errorId} className="enemy-comparison-condition-error" role="alert">数値条件を確認してください</span>}
      </div>
    </div>}
  </div>
}

function copyCondition(condition: EnemyComparisonCondition): EnemyComparisonCondition {
  return { ...condition, filters: { ...condition.filters }, numericConditions: condition.numericConditions.map((item) => ({ ...item })) }
}
