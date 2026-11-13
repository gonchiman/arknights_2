import { useMemo, useState, type FormEvent } from 'react'
import { evaluateAttackAttributeTables, type AttackAttributeRanges } from '../lib/damageCalculatorThreeAttributeTables'
import {
  getPhysicalArtsDefenseRowCount, getPhysicalArtsDefenseRows, MAX_DEFENSE_SWEEP_ROWS, toDamageReductionPercent,
  type PhysicalArtsDefensePoint, type PhysicalArtsDefenseRange, type PhysicalArtsDefenseStat, type PhysicalArtsMetric,
} from '../lib/physicalArtsDefenseSweep'
import {
  DamageCalculatorThreeAttributeChartImageDialog, type DamageCalculatorThreeAttributeChartImageSnapshot,
} from './DamageCalculatorThreeAttributeChartImageDialog'
import {
  ComparisonTableImageDialog, type ComparisonTableImageSnapshot,
} from './ComparisonTableImageDialog'
import { AttributeButtons, DamageCalculatorThreeAttributeTable } from './DamageCalculatorThreeAttributePage'
import { PhysicalArtsAttackSweepPanel } from './PhysicalArtsAttackSweepPanel'
import {
  PHYSICAL_ARTS_RATING_EXTRA_HEIGHT, PhysicalArtsComparisonChart, PhysicalArtsComparisonImageLegend,
} from './PhysicalArtsComparisonChart'
import './PhysicalArtsComparisonPage.css'

const INITIAL_ATTACK = 1000
const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })
const MODES = [['attack', '攻撃力を固定'], ['enemy', '防御力・術耐性を固定']] as const
const VIEWS = [['table', '表'], ['chart', 'グラフ']] as const
const TABLE_BASES = [['rating', 'ゲーム内評価'], ['stats', '防御力・術耐性別']] as const
const METRICS = [['damage', 'ダメージ'], ['reduction', '軽減率']] as const
const METRIC_TITLES = { damage: '1回の攻撃ダメージ', reduction: 'ダメージ軽減率' } as const
const INITIAL_RANGES: Record<PhysicalArtsDefenseStat, PhysicalArtsDefenseRange> = {
  defense: { min: 0, max: 1200, step: 200 },
  resistance: { min: 0, max: 100, step: 20 },
}
const RANGE_FIELDS = [
  { key: 'defense', label: '防御力', limit: 1_000_000 },
  { key: 'resistance', label: '術耐性', limit: 100 },
] as const
const STAT_TABLES = RANGE_FIELDS.map(({ key, label }) => [key, label] as const)
const BOUNDS = [['min', '下限'], ['max', '上限'], ['step', '刻み']] as const
const RATING_RANGES: AttackAttributeRanges = {
  defense: { min: 0, max: null },
  resistance: { min: 0, max: 100 },
}
type ResultImage =
  | { view: 'table'; snapshot: ComparisonTableImageSnapshot }
  | { view: 'chart'; snapshot: DamageCalculatorThreeAttributeChartImageSnapshot }

export default function PhysicalArtsComparisonPage() {
  const [mode, setMode] = useState<typeof MODES[number][0]>('attack')

  return <section className="calculator-page damage-three-attribute-page">
    <header className="page-intro">
      <h1>物理・術ダメージ比較</h1>
    </header>
    <div className="damage-three-attribute-toolbar">
      <AttributeButtons label="比較方法" options={MODES} value={mode} onChange={setMode} />
    </div>
    <div hidden={mode !== 'attack'}><FixedAttackComparison /></div>
    <div hidden={mode !== 'enemy'}><PhysicalArtsAttackSweepPanel /></div>
  </section>
}

function FixedAttackComparison() {
  const [{ attack, ranges, ratingRanges }, setResult] = useState({
    attack: INITIAL_ATTACK, ranges: INITIAL_RANGES, ratingRanges: RATING_RANGES,
  })
  const [view, setView] = useState<typeof VIEWS[number][0]>('table')
  const [tableBasis, setTableBasis] = useState<typeof TABLE_BASES[number][0]>('rating')
  const [selectedStat, setSelectedStat] = useState<PhysicalArtsDefenseStat>('defense')
  const [metric, setMetric] = useState<PhysicalArtsMetric>('reduction')
  const [showRatings, setShowRatings] = useState(false)
  const [rangeError, setRangeError] = useState<typeof RANGE_FIELDS[number] | null>(null)
  const [image, setImage] = useState<ResultImage | null>(null)
  const rows = useMemo(() => ({
    defense: getPhysicalArtsDefenseRows(attack, 'defense', ranges.defense),
    resistance: getPhysicalArtsDefenseRows(attack, 'resistance', ranges.resistance),
  }), [attack, ranges])
  const showChart = view === 'chart'
  const showRatingTable = !showChart && tableBasis === 'rating'
  const showStatTable = !showChart && tableBasis === 'stats'
  const [, selectedLabel] = STAT_TABLES.find(([key]) => key === selectedStat)!
  const ratingRows = useMemo(() => evaluateAttackAttributeTables(attack, ratingRanges), [attack, ratingRanges])
  const metricTitle = METRIC_TITLES[showRatingTable ? 'damage' : metric]
  const tableTooLarge = showStatTable && getPhysicalArtsDefenseRowCount(ranges[selectedStat]) > MAX_DEFENSE_SWEEP_ROWS

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const nextAttack = Number(data.get('attack'))
    if (showRatingTable) {
      const defenseMax = data.get('defense-max')
      const nextRanges: AttackAttributeRanges = {
        defense: { min: Number(data.get('defense-min')), max: defenseMax === '' ? null : Number(defenseMax) },
        resistance: { min: Number(data.get('resistance-min')), max: Number(data.get('resistance-max')) },
      }
      const invalidField = RANGE_FIELDS.find(({ key }) => {
        const { min, max } = nextRanges[key]
        return max !== null && min >= max
      })
      setRangeError(invalidField ?? null)
      if (!invalidField) setResult({ attack: nextAttack, ranges, ratingRanges: nextRanges })
      return
    }
    const readRange = (key: PhysicalArtsDefenseStat) => ({
      min: Number(data.get(`${key}-min`)),
      max: Number(data.get(`${key}-max`)),
      step: Number(data.get(`${key}-step`)),
    })
    const nextRanges = {
      defense: readRange('defense'),
      resistance: readRange('resistance'),
    }
    for (const field of RANGE_FIELDS) {
      const { min, max } = nextRanges[field.key]
      if (min > max) {
        setRangeError(field)
        return
      }
    }
    setRangeError(null)
    setResult({ attack: nextAttack, ranges: nextRanges, ratingRanges })
  }

  function openImage() {
    const conditions = [`攻撃力 ${NUMBER.format(attack)}`, '1体あたり']
    if (view === 'table') {
      if (tableTooLarge) return
      if (showRatingTable) {
        for (const { key, label } of RANGE_FIELDS) {
          const { min, max } = ratingRanges[key]
          if (min === RATING_RANGES[key].min && max === RATING_RANGES[key].max) continue
          conditions.push(`${label} ${NUMBER.format(min)}${max === null ? '以上' : `〜${NUMBER.format(max)}`}`)
        }
        setImage({ view, snapshot: {
          title: `物理・術ダメージ比較表（${metricTitle}）`,
          conditions,
          table: <DamageCalculatorThreeAttributeTable {...ratingRows} metric="perAttack" forImage />,
        } })
        return
      }
      const { min, max, step } = ranges[selectedStat]
      conditions.push(`${selectedLabel} ${NUMBER.format(min)}〜${NUMBER.format(max)}（${NUMBER.format(step)}刻み）`)
      setImage({ view, snapshot: {
        title: `${selectedLabel}別（${metricTitle}）`,
        conditions,
        table: <DefenseSweepTable attack={attack} rows={rows[selectedStat]} metric={metric} label={selectedLabel} forImage />,
      } })
      return
    }
    const chartInput = { attack, ranges, showRatings, metric }
    setImage({ view, snapshot: {
      title: `物理・術ダメージ比較（${metricTitle}）`,
      axisTitle: '防御力',
      additionalChartHeight: chartInput.showRatings ? PHYSICAL_ARTS_RATING_EXTRA_HEIGHT : undefined,
      conditions,
      filenameParts: [
        `攻撃力${chartInput.attack}`,
        ...RANGE_FIELDS.map(({ key, label }) => `${label}${chartInput.ranges[key].min}-${chartInput.ranges[key].max}`),
        ...(chartInput.showRatings ? ['評価表示'] : []),
      ],
      legend: <PhysicalArtsComparisonImageLegend />,
      chart: ({ height }) => <PhysicalArtsComparisonChart {...chartInput} imageHeight={height} />,
    } })
  }

  return <>
    <section className="calculator-panel" aria-labelledby="physical-arts-result-heading">
      <form className="physical-arts-comparison-controls" onSubmit={apply}>
        <label className="calculator-field">
          <span>攻撃力</span>
          <input name="attack" type="number" inputMode="numeric" min={1} max={1000000} step={1}
            defaultValue={INITIAL_ATTACK} required />
        </label>
        {TABLE_BASES.map(([basis]) => {
          const isRating = basis === 'rating'
          const active = isRating === showRatingTable
          return <div key={basis} className="physical-arts-comparison-ranges" hidden={!active}>
            {RANGE_FIELDS.map(({ key, label, limit }) => (
              <fieldset key={key} disabled={!active}>
                <legend>{label}</legend>
                {BOUNDS.map(([bound, boundLabel]) => {
                  if (isRating && bound === 'step') return null
                  const optional = isRating && key === 'defense' && bound === 'max'
                  const initial = isRating && bound !== 'step' ? RATING_RANGES[key][bound] : INITIAL_RANGES[key][bound]
                  const invalid = active && bound !== 'step' && rangeError?.key === key
                  return <label className="calculator-field" key={bound}>
                    <span>{boundLabel}</span>
                    <input name={`${key}-${bound}`} type="number" inputMode="numeric" min={bound === 'step' ? 1 : 0}
                      max={isRating && bound === 'min' ? limit - 1 : limit} step={1}
                      defaultValue={initial ?? undefined} required={!optional} placeholder={optional ? '上限なし' : undefined}
                      aria-label={`${label}の${boundLabel}`}
                      aria-invalid={invalid || undefined}
                      aria-describedby={invalid ? 'physical-arts-range-error' : undefined}
                      onInput={() => { if (invalid) setRangeError(null) }} />
                  </label>
                })}
              </fieldset>
            ))}
          </div>
        })}
        <button className="button" type="submit">出力</button>
        {rangeError && <p className="physical-arts-comparison-error" id="physical-arts-range-error" role="alert">
          {rangeError.label}の上限は{showRatingTable ? '下限より大きい値' : '下限以上'}にしてください。
        </p>}
      </form>
      <div className="damage-three-attribute-context">
        <h2 id="physical-arts-result-heading" className="physical-arts-comparison-heading">{metricTitle}</h2>
        <span role="status">攻撃力 {NUMBER.format(attack)} · 1体あたり</span>
      </div>
      <div className="damage-three-attribute-toolbar">
        <AttributeButtons label="表示形式" options={VIEWS} value={view} onChange={next => { setView(next); setRangeError(null) }} />
        {!showChart && <AttributeButtons label="表の比較基準" options={TABLE_BASES} value={tableBasis}
          onChange={next => { setTableBasis(next); setRangeError(null) }} />}
        {!showRatingTable && <AttributeButtons label="表示指標" options={METRICS} value={metric} onChange={setMetric} />}
        {showChart && <label className="physical-arts-comparison-rating-toggle">
          <input type="checkbox" checked={showRatings} onChange={event => setShowRatings(event.target.checked)} />
          評価表示
        </label>}
        <button type="button" className="button secondary damage-three-attribute-image-button"
          aria-label={`物理・術ダメージ比較${showChart ? 'グラフ' : '表'}をPNG画像で保存`}
          aria-haspopup="dialog" disabled={tableTooLarge} onClick={openImage}>画像を保存</button>
      </div>
      {showStatTable && <div className="physical-arts-stat-switch">
        <AttributeButtons label="表示する表" options={STAT_TABLES} value={selectedStat} onChange={setSelectedStat} />
      </div>}
      {showChart ? <PhysicalArtsComparisonChart attack={attack} ranges={ranges} showRatings={showRatings} metric={metric} />
        : showRatingTable ? <DamageCalculatorThreeAttributeTable {...ratingRows} metric="perAttack" />
        : tableTooLarge ? <p className="physical-arts-comparison-error" role="alert">
          {selectedLabel}の表が{MAX_DEFENSE_SWEEP_ROWS}行以内になるように刻みを大きくしてください。
        </p> : <DefenseSweepTable attack={attack} rows={rows[selectedStat]} metric={metric} label={selectedLabel} />}
    </section>
    {image?.view === 'table' && <ComparisonTableImageDialog snapshot={image.snapshot} onClose={() => setImage(null)} />}
    {image?.view === 'chart' && <DamageCalculatorThreeAttributeChartImageDialog snapshot={image.snapshot} onClose={() => setImage(null)} />}
  </>
}

function DefenseSweepTable({ attack, rows, metric, label, forImage = false }: {
  attack: number
  rows: readonly PhysicalArtsDefensePoint[]
  metric: PhysicalArtsMetric
  label: string
  forImage?: boolean
}) {
  const showReduction = metric === 'reduction'
  const valueLabel = showReduction ? '軽減率' : 'ダメージ'
  return <div className={`physical-arts-defense-tables${forImage ? ' is-image' : ''}`}>
    <div className={forImage ? undefined : 'damage-two-table-wrap'}
      role={forImage ? undefined : 'region'} aria-label={forImage ? undefined : `${label}別の${valueLabel}表`}
      tabIndex={forImage ? undefined : 0}>
      <table aria-label={`${label}別の${valueLabel}`}
        className={`damage-two-table damage-three-attribute-table physical-arts-defense-table${forImage ? ' damage-three-attribute-table-image' : ''}`}>
        <colgroup><col /><col /></colgroup>
        <thead><tr><th scope="col">{label}</th><th scope="col">{valueLabel}</th></tr></thead>
        <tbody>{rows.map(({ stat, damage }) => <tr key={stat}>
          <th scope="row">{NUMBER.format(stat)}</th>
          <td data-table-image-number>{showReduction ? `${NUMBER.format(toDamageReductionPercent(attack, damage))}%` : NUMBER.format(damage)}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>
}
