import { useEffect, useId, useRef, useState } from 'react'
import {
  ENEMY_NUMERIC_FILTER_FIELDS,
  ENEMY_NUMERIC_FILTER_OPERATORS,
  parseEnemyNumericFilterValue,
  type EnemyNumericCondition,
} from '../lib/enemyNumericFilters'
import './EnemyNumericFilter.css'

export function EnemyNumericFilter({ conditions, onChange }: {
  conditions: readonly EnemyNumericCondition[]
  onChange: (conditions: readonly EnemyNumericCondition[]) => void
}) {
  const nextId = useRef(1)
  const pendingFocus = useRef<{ id: number; control: 'input' | 'select' } | 'add' | null>(null)
  const rowsRef = useRef<HTMLDivElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const target = pendingFocus.current
    if (!target) return
    if (target === 'add') addRef.current?.focus()
    else rowsRef.current?.querySelector<HTMLElement>(`[data-condition-id="${target.id}"] ${target.control}`)?.focus()
    pendingFocus.current = null
  }, [conditions])

  const addCondition = () => {
    const id = Math.max(nextId.current, ...conditions.map((condition) => condition.id + 1))
    nextId.current = id + 1
    pendingFocus.current = { id, control: 'input' }
    onChange([...conditions, {
      id,
      field: conditions.length === 0 ? 'magicResistance' : 'defense',
      operator: conditions.length === 0 ? 'eq' : 'gte',
      value: '',
    }])
  }

  const removeCondition = (id: number) => {
    const index = conditions.findIndex((condition) => condition.id === id)
    const remaining = conditions.filter((condition) => condition.id !== id)
    const next = remaining[Math.min(index, remaining.length - 1)]
    pendingFocus.current = next ? { id: next.id, control: 'select' } : 'add'
    onChange(remaining)
  }

  return <fieldset className="enemy-numeric-filter">
    <legend>一覧の数値条件 <span>実数値・すべて満たす</span></legend>
    <div className="enemy-numeric-conditions" ref={rowsRef}>
      {conditions.map((condition, index) => (
        <EnemyNumericConditionRow
          key={condition.id}
          condition={condition}
          index={index}
          onChange={(updated) => onChange(conditions.map((current) => current.id === updated.id ? updated : current))}
          onRemove={() => removeCondition(condition.id)}
        />
      ))}
    </div>
    <div className="enemy-numeric-actions">
      <button type="button" className="enemy-numeric-add" ref={addRef} onClick={addCondition}>＋ 条件を追加</button>
      <button type="button" disabled={conditions.length === 0} onClick={() => {
        pendingFocus.current = 'add'
        onChange([])
      }}>数値条件を解除</button>
    </div>
  </fieldset>
}

function EnemyNumericConditionRow({ condition, index, onChange, onRemove }: {
  condition: EnemyNumericCondition
  index: number
  onChange: (condition: EnemyNumericCondition) => void
  onRemove: () => void
}) {
  const errorId = useId()
  const [badInput, setBadInput] = useState(false)
  const field = ENEMY_NUMERIC_FILTER_FIELDS.find((option) => option.key === condition.field)!
  const invalid = badInput || (condition.value.trim() !== '' && parseEnemyNumericFilterValue(condition.value) === null)

  return <div className="enemy-numeric-condition" data-condition-id={condition.id}>
    <label>
      <span>項目</span>
      <select
        aria-label={`条件${index + 1}の項目`}
        value={condition.field}
        onChange={(event) => {
          const selected = ENEMY_NUMERIC_FILTER_FIELDS.find((option) => option.key === event.target.value)
          if (selected) onChange({ ...condition, field: selected.key })
        }}
      >
        {ENEMY_NUMERIC_FILTER_FIELDS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
      </select>
    </label>
    <label>
      <span>比較</span>
      <select
        aria-label={`条件${index + 1}の比較`}
        value={condition.operator}
        onChange={(event) => {
          const selected = ENEMY_NUMERIC_FILTER_OPERATORS.find((option) => option.key === event.target.value)
          if (selected) onChange({ ...condition, operator: selected.key })
        }}
      >
        {ENEMY_NUMERIC_FILTER_OPERATORS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
      </select>
    </label>
    <label>
      <span>{field.unit ? `数値（${field.unit}）` : '数値'}</span>
      <input
        type="number"
        step="any"
        aria-label={`条件${index + 1}の数値${field.unit ? `（${field.unit}）` : ''}`}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        placeholder="未指定"
        value={condition.value}
        onInput={(event) => setBadInput(event.currentTarget.validity.badInput)}
        onChange={(event) => onChange({ ...condition, value: event.target.value })}
      />
    </label>
    <button type="button" aria-label={`条件${index + 1}を削除`} onClick={onRemove}>削除</button>
    {invalid && <span className="enemy-numeric-error" id={errorId} role="alert">有効な数値を入力してください</span>}
  </div>
}
