import { useEffect, useId, useMemo, useRef } from 'react'
import { isMapEnemyCondition } from '../lib/mapEnemyFilters'
import type { MapEnemyCondition } from '../lib/mapEnemyFilters'
import { MAP_ENEMY_CONDITION_FIELDS, getMapEnemyConditionField } from '../lib/mapEnemyConditionFields'
import { ENEMY_NUMERIC_FILTER_OPERATORS } from '../lib/enemyNumericFilters'
import type { MapIndex } from '../types/map'

const compactOperatorLabels: Record<string, string> = { eq: '一致', gt: '超', lt: '未満' }

export function MapEnemyConditionFilters({ conditions, index: mapIndex, onChange }: {
  conditions: MapEnemyCondition[]
  index: MapIndex
  onChange: (conditions: MapEnemyCondition[]) => void
}) {
  const headingId = useId()
  const sequence = useRef(0)
  const rowsRef = useRef<HTMLDivElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const pendingFocus = useRef<string | 'add' | null>(null)
  const groups = useMemo(() => [...new Set(MAP_ENEMY_CONDITION_FIELDS.map((field) => field.group))], [])
  const entranceOptions = useMemo(() => [...new Set(mapIndex.maps.flatMap((map) =>
    map.enemyRoutes?.flatMap((route) => route.entrance ? [route.entrance] : []) ?? []))]
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
    .map((value) => ({ value, label: value })), [mapIndex])
  const hasInvalid = conditions.some((condition) => !isMapEnemyCondition(condition))
  const update = (id: string, patch: Partial<MapEnemyCondition>) =>
    onChange(conditions.map((condition) => condition.id === id ? { ...condition, ...patch } : condition))

  useEffect(() => {
    const target = pendingFocus.current
    if (!target) return
    if (target === 'add') addRef.current?.focus()
    else Array.from(rowsRef.current?.querySelectorAll<HTMLElement>('[data-condition-id]') ?? [])
      .find((row) => row.dataset.conditionId === target)?.querySelector<HTMLElement>('input, select')?.focus()
    pendingFocus.current = null
  }, [conditions])

  const remove = (id: string) => {
    const position = conditions.findIndex((condition) => condition.id === id)
    const remaining = conditions.filter((condition) => condition.id !== id)
    pendingFocus.current = remaining[Math.min(position, remaining.length - 1)]?.id ?? 'add'
    onChange(remaining)
  }

  return <section className="map-enemy-conditions" aria-labelledby={headingId}>
    <div className="map-enemy-condition-heading">
      <h3 id={headingId}>登場する敵</h3>
      {conditions.length > 0 && <span>すべての条件に一致</span>}
      <button type="button" className="map-feature-clear" disabled={conditions.length === 0}
        onClick={() => { pendingFocus.current = 'add'; onChange([]) }} aria-label="敵の条件をすべて解除">解除</button>
    </div>
    {conditions.length > 0 && <div className="map-enemy-condition-rows" ref={rowsRef}>
      {conditions.map((condition, index) => {
        const field = getMapEnemyConditionField(condition.property)
        const numeric = field?.kind === 'number'
        const options = condition.property === 'entrance' ? entranceOptions : field?.options ?? []
        return <div className="map-enemy-condition-row" key={condition.id} data-condition-id={condition.id}>
        <select value={condition.property} aria-label={`条件${index + 1}の項目`}
          onChange={(event) => {
            const next = getMapEnemyConditionField(event.target.value)
            if (next) update(condition.id, { property: next.key, value: null,
              operator: next.kind === 'number' ? numeric ? condition.operator : 'gte'
                : next.operator ?? 'eq' })
          }}>
          {groups.map((group) => <optgroup key={group} label={group}>
            {MAP_ENEMY_CONDITION_FIELDS.filter((entry) => entry.group === group)
              .map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
          </optgroup>)}
        </select>
        <select value={condition.operator} aria-label={`条件${index + 1}の比較`}
          disabled={!numeric}
          onChange={(event) => update(condition.id, { operator: event.target.value as MapEnemyCondition['operator'] })}>
          {numeric ? ENEMY_NUMERIC_FILTER_OPERATORS.map((entry) => <option key={entry.key} value={entry.key}>
            {compactOperatorLabels[entry.key] ?? entry.label}
          </option>) : <option value={field?.operator ?? 'eq'}>{field?.operator === 'contains' ? '含む' : '一致'}</option>}
        </select>
        <label className="map-enemy-condition-value">
          {field?.kind === 'select' ? <select value={condition.value ?? ''} aria-label={`条件${index + 1}の値`}
            onChange={(event) => update(condition.id, { value: event.target.value || null })}>
            <option value="">指定なし</option>
            {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select> : numeric ? <input type="number" min={condition.property === 'weight' ? undefined : 0} step="any" placeholder="指定なし"
            value={typeof condition.value === 'number' && Number.isFinite(condition.value) ? condition.value : ''}
            aria-label={`条件${index + 1}の値`}
            aria-invalid={!isMapEnemyCondition(condition)}
            onChange={(event) => update(condition.id, {
              value: event.target.validity.badInput ? NaN : event.target.value === '' ? null : event.target.valueAsNumber,
            })} /> : <input type="text" placeholder={condition.property === 'enemyId' ? '敵ID' : '敵名・ID'}
            value={typeof condition.value === 'string' ? condition.value : ''} aria-label={`条件${index + 1}の値`}
            onChange={(event) => update(condition.id, { value: event.target.value })} />}
          {field?.unit && <span>{field.unit}</span>}
        </label>
        <button type="button" className="map-enemy-condition-remove" aria-label={`条件${index + 1}を削除`}
          onClick={() => remove(condition.id)}>×</button>
      </div>})}
    </div>}
    <button type="button" className="button secondary map-enemy-condition-add" ref={addRef} onClick={() => {
      sequence.current += 1
      const id = `${headingId}-${sequence.current}`
      pendingFocus.current = id
      onChange([...conditions, { id, property: 'wait', operator: 'gte', value: 20 }])
    }}>＋ 条件を追加</button>
    {hasInvalid && <p className="map-enemy-condition-error" role="alert">条件の値を確認してください。重量以外の数値は0以上で指定できます。</p>}
    <details className="map-enemy-condition-help">
      <summary>条件の判定</summary>
      <p>同じ敵・同じ移動経路が、入力したすべての条件を満たすマップを表示します。空欄は指定なしとして扱います。</p>
      <p>1回の待機時間は、経路の同じ固定待機が上下限を満たすか判定します。待機回数・合計は経路全体の固定待機から算出します。ブロック・スタンによる停止や、ウェーブの進行状況で決まる待機は含めません。</p>
      <p>通常の出現スケジュールにある設定が対象です。条件付きの出現も含みます。召喚・分岐経路は対象外で、確認できない値は条件に一致しません。</p>
      <p>能力値は敵の基礎値です。マップ固有の補正や、能力による途中の変化は反映していません。状態異常耐性の未確認を「なし」とは扱いません。</p>
      <p>設定体数は同じ敵の全経路を合計し、経路の設定体数は表示中の経路・出現条件ごとに合計します。条件付き出現を含む設定数で、実際の出現数を保証しません。出現間隔は同じ連続出現の設定内で判定します。</p>
      <p>出現口はマップ上のA・Bなどと対応します。出現口数は同じ敵が使用する入口の種類数です。別マップの同じ文字が同じ場所を表すわけではありません。</p>
    </details>
  </section>
}
