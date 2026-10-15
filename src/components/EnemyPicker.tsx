import { useId, useMemo, useState } from 'react'
import {
  EMPTY_ENEMY_PICKER_RANGES, ENEMY_PICKER_BATCH_SIZE, ENEMY_PICKER_DAMAGE_TYPES,
  filterEnemyPickerRows, getEnemyPickerCombatStats, getEnemyPickerDamageTypeLabel,
  getEnemyPickerRangeError, sortEnemyPickerRows,
  type EnemyPickerDamageType, type EnemyPickerRangeKey, type EnemyPickerSort,
  type EnemyPickerSortKey, type EnemyPickerVariant,
} from '../lib/enemyPicker'
import type { EnemyLevelType, EnemyRecord } from '../types/enemy'
import './EnemyPicker.css'

const BATCH_SIZE = ENEMY_PICKER_BATCH_SIZE
const format = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })
const LEVEL_LABELS: Record<EnemyLevelType, string> = { NORMAL: '通常', ELITE: 'エリート', BOSS: 'ボス', UNKNOWN: '未分類' }
const LEVEL_OPTIONS = [
  { value: 'ALL', label: 'すべて' },
  { value: 'NORMAL', label: '通常' },
  { value: 'ELITE', label: 'エリート' },
  { value: 'BOSS', label: 'ボス' },
] as const
type RangeKey = EnemyPickerRangeKey
type PickerSortKey = EnemyPickerSortKey
const EMPTY_RANGES = EMPTY_ENEMY_PICKER_RANGES
const EMPTY_BAD_INPUTS: Record<RangeKey, boolean> = {
  hpMin: false, hpMax: false, resistanceMin: false, resistanceMax: false,
  attackMin: false, attackMax: false, intervalMin: false, intervalMax: false,
}

export interface EnemyPickerProps {
  enemies: readonly EnemyRecord[]
  loading: boolean
  error: string | null
  onRetry: () => void
  selectedEnemyId?: string
  onSelect: (enemy: EnemyRecord) => void
  variant?: EnemyPickerVariant
  getSelectDisabledReason?: (enemy: EnemyRecord) => string | null
}

export function EnemyPicker({ enemies, loading, error, onRetry, selectedEnemyId, onSelect,
  variant = 'stats', getSelectDisabledReason }: EnemyPickerProps) {
  const errorId = useId()
  const [levelType, setLevelType] = useState<EnemyLevelType | 'ALL'>('ALL')
  const [ranges, setRanges] = useState({ ...EMPTY_RANGES })
  const [badInputs, setBadInputs] = useState({ ...EMPTY_BAD_INPUTS })
  const [inputRevision, setInputRevision] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<EnemyPickerSort>({ key: 'stages', direction: 'desc' })
  const [damageType, setDamageType] = useState<EnemyPickerDamageType | 'ALL'>('ALL')
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE)
  const combat = variant === 'combat'
  const firstRange = combat ? { label: '攻撃力', min: 'attackMin', max: 'attackMax' } as const : { label: 'HP', min: 'hpMin', max: 'hpMax' } as const
  const secondRange = combat ? { label: '攻撃間隔（秒）', min: 'intervalMin', max: 'intervalMax' } as const : { label: '術耐性', min: 'resistanceMin', max: 'resistanceMax' } as const
  const firstError = getEnemyPickerRangeError(ranges[firstRange.min], ranges[firstRange.max], badInputs[firstRange.min] || badInputs[firstRange.max], firstRange.label)
  const secondError = getEnemyPickerRangeError(ranges[secondRange.min], ranges[secondRange.max], badInputs[secondRange.min] || badInputs[secondRange.max], secondRange.label)
  const rangeErrors = [firstError, secondError].filter((value): value is string => value !== null)
  const invalidRanges = rangeErrors.length > 0
  const activeRangeKeys = [firstRange.min, firstRange.max, secondRange.min, secondRange.max]
  const hasFilters = levelType !== 'ALL' || activeRangeKeys.some(key => ranges[key] !== '' || badInputs[key])
    || query !== '' || combat && damageType !== 'ALL'
  const allowedSortKeys: readonly EnemyPickerSortKey[] = combat ? ['attack', 'interval', 'stages'] : ['hp', 'resistance', 'stages']
  const activeSort: EnemyPickerSort = allowedSortKeys.includes(sort.key) ? sort : { key: 'stages', direction: 'desc' }
  const filtered = useMemo(() => {
    if (invalidRanges) return []
    return sortEnemyPickerRows(filterEnemyPickerRows(enemies, {
      variant, levelType, ranges, damageType, query, searchOpen,
    }), activeSort, variant)
  }, [enemies, invalidRanges, levelType, query, ranges, searchOpen, activeSort.key, activeSort.direction, variant, damageType])
  const visible = filtered.slice(0, visibleCount)

  const resetFilters = () => {
    setLevelType('ALL')
    setRanges({ ...EMPTY_RANGES })
    setBadInputs({ ...EMPTY_BAD_INPUTS })
    // Remount to clear incomplete native number text (for example "1e") whose value is already empty.
    setInputRevision((revision) => revision + 1)
    setQuery('')
    setDamageType('ALL')
    setVisibleCount(BATCH_SIZE)
  }
  const changeSort = (key: PickerSortKey) => {
    setSort((current) => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }))
    setVisibleCount(BATCH_SIZE)
  }
  const renderRange = (label: string, minKey: RangeKey, maxKey: RangeKey, invalid: boolean) => (
    <fieldset className="gg-enemy-picker-range">
      <legend>{label}</legend>
      {([['下限', minKey], ['上限', maxKey]] as const).map(([boundLabel, key]) => <label key={key}>
        <span>{boundLabel}</span>
        <input key={inputRevision} type="number" inputMode="decimal" step="any" min={0} value={ranges[key]} placeholder="指定なし"
          aria-label={`${label}の${boundLabel}`} aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined}
          onInput={(event) => {
            const badInput = event.currentTarget.validity.badInput
            setBadInputs((current) => ({ ...current, [key]: badInput }))
            setVisibleCount(BATCH_SIZE)
          }}
          onChange={(event) => {
            const value = event.target.value
            setRanges((current) => ({ ...current, [key]: value }))
            setVisibleCount(BATCH_SIZE)
          }} />
      </label>)}
    </fieldset>
  )
  const sortHeading = (key: PickerSortKey, label: string) => <th scope="col" className="gg-enemy-picker-number"
    aria-sort={activeSort.key === key ? activeSort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}>
    <button type="button" className="gg-enemy-picker-sort" onClick={() => changeSort(key)}
      aria-label={`${label}を${activeSort.key === key && activeSort.direction === 'asc' ? '降順' : '昇順'}に並べ替え`}>
      {label}<span aria-hidden="true">{activeSort.key === key ? activeSort.direction === 'asc' ? '↑' : '↓' : '↕'}</span>
    </button>
  </th>

  return <div className={`gg-enemy-picker${combat ? ' gg-enemy-picker-combat' : ''}`}>
    <div className="gg-enemy-picker-toolbar">
      <div className="gg-enemy-picker-levels" role="group" aria-label="敵の区分">
        {LEVEL_OPTIONS.map(({ value, label }) => <button key={value} type="button" aria-pressed={levelType === value}
          onClick={() => { setLevelType(value); setVisibleCount(BATCH_SIZE) }}>{label}</button>)}
      </div>
      <button type="button" className="gg-enemy-picker-reset" disabled={!hasFilters} onClick={resetFilters}>条件をリセット</button>
    </div>
    <div className="gg-enemy-picker-ranges">
      {renderRange(firstRange.label, firstRange.min, firstRange.max, firstError !== null)}
      {renderRange(secondRange.label, secondRange.min, secondRange.max, secondError !== null)}
    </div>
    {combat && <label className="gg-enemy-picker-damage-filter"><span>攻撃種別</span><select value={damageType}
      onChange={event => { setDamageType(event.target.value as EnemyPickerDamageType | 'ALL'); setVisibleCount(BATCH_SIZE) }}>
      {ENEMY_PICKER_DAMAGE_TYPES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select></label>}
    {invalidRanges && <p id={errorId} className="gg-enemy-picker-error" role="alert">{rangeErrors.join(' ')}</p>}
    <details className="gg-enemy-picker-search" open={searchOpen} onToggle={(event) => {
      const open = event.currentTarget.open
      setSearchOpen(open)
      if (!open) setQuery('')
      setVisibleCount(BATCH_SIZE)
    }}>
      <summary>敵名・IDで検索</summary>
      <label><span className="visually-hidden">敵名・図鑑番号・内部ID</span><input type="search" value={query}
        placeholder="敵名・図鑑番号・内部ID" onChange={(event) => { setQuery(event.target.value); setVisibleCount(BATCH_SIZE) }} /></label>
    </details>
    <p className="gg-enemy-picker-count" role="status" aria-live="polite">
      {loading ? '敵データを読み込み中…' : error ? '敵データを取得できませんでした' : invalidRanges ? '範囲を確認してください' : `${format.format(visible.length)} / ${format.format(filtered.length)}体`}
    </p>
    <div className="gg-enemy-picker-scroll" tabIndex={0} role="region" aria-label="敵の選択一覧">
      <table className="gg-enemy-picker-table">
        <caption className="visually-hidden">敵の{combat ? '通常攻撃' : '基礎ステータス'}・登場ステージ数と選択</caption>
        <colgroup><col className="gg-enemy-picker-name-column" /><col className="gg-enemy-picker-level-column" /><col /><col />{combat && <col />}<col className="gg-enemy-picker-stages-column" /></colgroup>
        <thead><tr><th scope="col">敵名</th><th scope="col">区分</th>{combat ? <>{sortHeading('attack', '攻撃力')}<th scope="col">攻撃種別</th>{sortHeading('interval', '攻撃間隔（秒）')}</> : <>{sortHeading('hp', 'HP')}{sortHeading('resistance', '術耐性')}</>}{sortHeading('stages', '登場ステージ数')}</tr></thead>
        <tbody>{loading ? <tr><td className="gg-enemy-picker-state" colSpan={combat ? 6 : 5}>読み込み中…</td></tr>
          : error ? <tr><td className="gg-enemy-picker-state" colSpan={combat ? 6 : 5}><p role="alert">{error}</p><button type="button" className="button secondary" onClick={onRetry}>再読み込み</button></td></tr>
          : visible.length === 0 ? <tr><td className="gg-enemy-picker-state" colSpan={combat ? 6 : 5}>{invalidRanges ? '—' : '条件に一致する敵がいません'}</td></tr>
          : visible.map((enemy) => {
            const disabledReason = getSelectDisabledReason?.(enemy) ?? null
            const stats = combat ? getEnemyPickerCombatStats(enemy) : null
            return <tr key={enemy.id} data-enemy-id={enemy.id} aria-current={enemy.id === selectedEnemyId ? 'true' : undefined}
            aria-disabled={disabledReason !== null || undefined}
            className={enemy.id === selectedEnemyId ? 'is-selected' : undefined} onClick={(event) => {
              if (disabledReason !== null) return
              if (event.target instanceof Element && event.target.closest('button')) return
              event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
              onSelect(enemy)
            }}>
            <td><button className="gg-enemy-picker-select" type="button" disabled={disabledReason !== null} onClick={() => { if (disabledReason === null) onSelect(enemy) }}
              aria-label={`${enemy.name}${enemy.index ? `（${enemy.index}）` : ''}を選択`}>
              <span>{enemy.name}</span>{enemy.id === selectedEnemyId && <small>選択中</small>}
            </button>{disabledReason !== null && <small className="gg-enemy-picker-disabled-reason">{disabledReason}</small>}</td>
            <td>{LEVEL_LABELS[enemy.levelType]}</td>
            {stats ? <><td className="gg-enemy-picker-number">{formatStat(stats.attack)}</td><td>{getEnemyPickerDamageTypeLabel(stats.damageType)}</td><td className="gg-enemy-picker-number">{formatStat(stats.interval)}</td></> : <><td className="gg-enemy-picker-number">{formatStat(enemy.stats.maxHp)}</td><td className="gg-enemy-picker-number">{formatStat(enemy.stats.magicResistance)}</td></>}
            <td className="gg-enemy-picker-number">{formatStat(enemy.stageAppearanceCount)}</td>
          </tr>})}</tbody>
      </table>
    </div>
    {!loading && !error && visible.length < filtered.length && <button type="button" className="button secondary gg-enemy-picker-more"
      onClick={() => setVisibleCount((count) => count + BATCH_SIZE)}>さらに{Math.min(BATCH_SIZE, filtered.length - visible.length)}体を表示</button>}
  </div>
}

function formatStat(value: number | null): string {
  return value !== null && Number.isFinite(value) ? format.format(value) : '—'
}
