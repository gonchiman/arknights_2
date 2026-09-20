import { useId, useMemo, useState } from 'react'
import { parseEnemyNumericFilterValue } from '../lib/enemyNumericFilters'
import { sortEnemyRows, type EnemyTableSort } from '../lib/enemyTableSort'
import type { EnemyLevelType, EnemyRecord } from '../types/enemy'
import './GoldenglowEnemyPicker.css'

const BATCH_SIZE = 20
const format = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })
const LEVEL_LABELS: Record<EnemyLevelType, string> = { NORMAL: '通常', ELITE: 'エリート', BOSS: 'ボス', UNKNOWN: '未分類' }
const LEVEL_OPTIONS = [
  { value: 'ALL', label: 'すべて' },
  { value: 'NORMAL', label: '通常' },
  { value: 'ELITE', label: 'エリート' },
  { value: 'BOSS', label: 'ボス' },
] as const
type RangeKey = 'hpMin' | 'hpMax' | 'resistanceMin' | 'resistanceMax'
type PickerSortKey = 'hp' | 'resistance' | 'stages'
const EMPTY_RANGES: Record<RangeKey, string> = { hpMin: '', hpMax: '', resistanceMin: '', resistanceMax: '' }
const EMPTY_BAD_INPUTS: Record<RangeKey, boolean> = { hpMin: false, hpMax: false, resistanceMin: false, resistanceMax: false }

export function GoldenglowEnemyPicker({ enemies, loading, error, onRetry, selectedEnemyId, onSelect }: {
  enemies: readonly EnemyRecord[]
  loading: boolean
  error: string | null
  onRetry: () => void
  selectedEnemyId?: string
  onSelect: (enemy: EnemyRecord) => void
}) {
  const errorId = useId()
  const [levelType, setLevelType] = useState<EnemyLevelType | 'ALL'>('ALL')
  const [ranges, setRanges] = useState({ ...EMPTY_RANGES })
  const [badInputs, setBadInputs] = useState({ ...EMPTY_BAD_INPUTS })
  const [inputRevision, setInputRevision] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<EnemyTableSort>({ key: 'stages', direction: 'desc' })
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE)
  const hpError = rangeError(ranges.hpMin, ranges.hpMax, badInputs.hpMin || badInputs.hpMax, 'HP')
  const resistanceError = rangeError(ranges.resistanceMin, ranges.resistanceMax, badInputs.resistanceMin || badInputs.resistanceMax, '術耐性')
  const rangeErrors = [hpError, resistanceError].filter((value): value is string => value !== null)
  const invalidRanges = rangeErrors.length > 0
  const hasFilters = levelType !== 'ALL' || Object.values(ranges).some((value) => value !== '')
    || Object.values(badInputs).some(Boolean) || query !== ''
  const filtered = useMemo(() => {
    if (invalidRanges) return []
    const normalizedQuery = (searchOpen ? query : '').normalize('NFKC').trim().toLocaleLowerCase('ja')
    return sortEnemyRows(enemies.filter((enemy) => (
      (levelType === 'ALL' || enemy.levelType === levelType)
      && (!normalizedQuery || [enemy.name, enemy.index, enemy.id].some((value) => value.normalize('NFKC').toLocaleLowerCase('ja').includes(normalizedQuery)))
      && matchesRange(enemy.stats.maxHp, ranges.hpMin, ranges.hpMax)
      && matchesRange(enemy.stats.magicResistance, ranges.resistanceMin, ranges.resistanceMax)
    )), sort)
  }, [enemies, invalidRanges, levelType, query, ranges, searchOpen, sort])
  const visible = filtered.slice(0, visibleCount)

  const resetFilters = () => {
    setLevelType('ALL')
    setRanges({ ...EMPTY_RANGES })
    setBadInputs({ ...EMPTY_BAD_INPUTS })
    // Remount to clear incomplete native number text (for example "1e") whose value is already empty.
    setInputRevision((revision) => revision + 1)
    setQuery('')
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
    aria-sort={sort.key === key ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}>
    <button type="button" className="gg-enemy-picker-sort" onClick={() => changeSort(key)}
      aria-label={`${label}を${sort.key === key && sort.direction === 'asc' ? '降順' : '昇順'}に並べ替え`}>
      {label}<span aria-hidden="true">{sort.key === key ? sort.direction === 'asc' ? '↑' : '↓' : '↕'}</span>
    </button>
  </th>

  return <div className="gg-enemy-picker">
    <div className="gg-enemy-picker-toolbar">
      <div className="gg-enemy-picker-levels" role="group" aria-label="敵の区分">
        {LEVEL_OPTIONS.map(({ value, label }) => <button key={value} type="button" aria-pressed={levelType === value}
          onClick={() => { setLevelType(value); setVisibleCount(BATCH_SIZE) }}>{label}</button>)}
      </div>
      <button type="button" className="gg-enemy-picker-reset" disabled={!hasFilters} onClick={resetFilters}>条件をリセット</button>
    </div>
    <div className="gg-enemy-picker-ranges">
      {renderRange('HP', 'hpMin', 'hpMax', hpError !== null)}
      {renderRange('術耐性', 'resistanceMin', 'resistanceMax', resistanceError !== null)}
    </div>
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
        <caption className="visually-hidden">敵の基礎ステータス・登場ステージ数と選択</caption>
        <colgroup><col className="gg-enemy-picker-name-column" /><col className="gg-enemy-picker-level-column" /><col /><col /><col className="gg-enemy-picker-stages-column" /></colgroup>
        <thead><tr><th scope="col">敵名</th><th scope="col">区分</th>{sortHeading('hp', 'HP')}{sortHeading('resistance', '術耐性')}{sortHeading('stages', '登場ステージ数')}</tr></thead>
        <tbody>{loading ? <tr><td className="gg-enemy-picker-state" colSpan={5}>読み込み中…</td></tr>
          : error ? <tr><td className="gg-enemy-picker-state" colSpan={5}><p role="alert">{error}</p><button type="button" className="button secondary" onClick={onRetry}>再読み込み</button></td></tr>
          : visible.length === 0 ? <tr><td className="gg-enemy-picker-state" colSpan={5}>{invalidRanges ? '—' : '条件に一致する敵がいません'}</td></tr>
          : visible.map((enemy) => <tr key={enemy.id} data-enemy-id={enemy.id} aria-current={enemy.id === selectedEnemyId ? 'true' : undefined}
            className={enemy.id === selectedEnemyId ? 'is-selected' : undefined} onClick={(event) => {
              if (event.target instanceof Element && event.target.closest('button')) return
              event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
              onSelect(enemy)
            }}>
            <td><button className="gg-enemy-picker-select" type="button" onClick={() => onSelect(enemy)}
              aria-label={`${enemy.name}${enemy.index ? `（${enemy.index}）` : ''}を選択`}>
              <span>{enemy.name}</span>{enemy.id === selectedEnemyId && <small>選択中</small>}
            </button></td>
            <td>{LEVEL_LABELS[enemy.levelType]}</td>
            <td className="gg-enemy-picker-number">{formatStat(enemy.stats.maxHp)}</td>
            <td className="gg-enemy-picker-number">{formatStat(enemy.stats.magicResistance)}</td>
            <td className="gg-enemy-picker-number">{formatStat(enemy.stageAppearanceCount)}</td>
          </tr>)}</tbody>
      </table>
    </div>
    {!loading && !error && visible.length < filtered.length && <button type="button" className="button secondary gg-enemy-picker-more"
      onClick={() => setVisibleCount((count) => count + BATCH_SIZE)}>さらに{Math.min(BATCH_SIZE, filtered.length - visible.length)}体を表示</button>}
  </div>
}

function rangeError(min: string, max: string, badInput: boolean, label: string): string | null {
  const minimum = parseEnemyNumericFilterValue(min)
  const maximum = parseEnemyNumericFilterValue(max)
  if (badInput || min.trim() !== '' && (minimum === null || minimum < 0) || max.trim() !== '' && (maximum === null || maximum < 0)) {
    return `${label}は0以上の数値で入力してください。`
  }
  return minimum !== null && maximum !== null && minimum > maximum ? `${label}の下限は上限以下にしてください。` : null
}

function matchesRange(value: number | null, min: string, max: string): boolean {
  const minimum = parseEnemyNumericFilterValue(min)
  const maximum = parseEnemyNumericFilterValue(max)
  if (minimum === null && maximum === null) return true
  return value !== null && Number.isFinite(value)
    && (minimum === null || value >= minimum) && (maximum === null || value <= maximum)
}

function formatStat(value: number | null): string {
  return value !== null && Number.isFinite(value) ? format.format(value) : '—'
}
