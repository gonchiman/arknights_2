import { useMemo, useState, type FormEvent } from 'react'
import { evaluateAttackAttributeTables, type AttackAttributeRanges } from '../lib/damageCalculatorThreeAttributeTables'
import {
  DamageCalculatorThreeAttributeChartImageDialog, type DamageCalculatorThreeAttributeChartImageSnapshot,
} from './DamageCalculatorThreeAttributeChartImageDialog'
import {
  DamageCalculatorThreeAttributeImageDialog, type DamageCalculatorThreeAttributeImageSnapshot,
} from './DamageCalculatorThreeAttributeImageDialog'
import { AttributeButtons, DamageCalculatorThreeAttributeTable } from './DamageCalculatorThreeAttributePage'
import {
  PHYSICAL_ARTS_RATING_EXTRA_HEIGHT, PhysicalArtsComparisonChart, PhysicalArtsComparisonImageLegend,
} from './PhysicalArtsComparisonChart'
import './PhysicalArtsComparisonPage.css'

const INITIAL_ATTACK = 1000
const NUMBER = new Intl.NumberFormat('ja-JP')
const VIEWS = [['table', '表'], ['chart', 'グラフ']] as const
const DEFAULT_DEFENSE_CHART_MAX = 3000
const MAX_DEFENSE = 1_000_000
const MAX_RESISTANCE = 100
const INITIAL_RANGES: AttackAttributeRanges = {
  defense: { min: 0, max: null },
  resistance: { min: 0, max: MAX_RESISTANCE },
}
const RANGE_FIELDS = [
  { key: 'defense', label: '防御力', limit: MAX_DEFENSE },
  { key: 'resistance', label: '術耐性', limit: MAX_RESISTANCE },
] as const
const BOUNDS = [['min', '下限'], ['max', '上限']] as const
type ResultImage =
  | { view: 'table'; snapshot: DamageCalculatorThreeAttributeImageSnapshot }
  | { view: 'chart'; snapshot: DamageCalculatorThreeAttributeChartImageSnapshot }

export default function PhysicalArtsComparisonPage() {
  const [{ attack, ranges }, setResult] = useState({ attack: INITIAL_ATTACK, ranges: INITIAL_RANGES })
  const [view, setView] = useState<typeof VIEWS[number][0]>('table')
  const [showRatings, setShowRatings] = useState(false)
  const [rangeError, setRangeError] = useState<typeof RANGE_FIELDS[number] | null>(null)
  const [image, setImage] = useState<ResultImage | null>(null)
  const { physical, arts } = useMemo(() => evaluateAttackAttributeTables(attack, ranges), [attack, ranges])
  const showChart = view === 'chart'
  const chartRanges = {
    defense: {
      min: ranges.defense.min,
      max: ranges.defense.max ?? (ranges.defense.min < DEFAULT_DEFENSE_CHART_MAX
        ? DEFAULT_DEFENSE_CHART_MAX
        : Math.min(MAX_DEFENSE, ranges.defense.min + DEFAULT_DEFENSE_CHART_MAX)),
    },
    resistance: ranges.resistance,
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const nextAttack = Number(data.get('attack'))
    const defenseMax = data.get('defense-max')
    const nextRanges: AttackAttributeRanges = {
      defense: { min: Number(data.get('defense-min')), max: defenseMax === '' ? null : Number(defenseMax) },
      resistance: { min: Number(data.get('resistance-min')), max: Number(data.get('resistance-max')) },
    }
    for (const field of RANGE_FIELDS) {
      const { min, max } = nextRanges[field.key]
      if (max !== null && min >= max) {
        setRangeError(field)
        return
      }
    }
    setRangeError(null)
    setResult({ attack: nextAttack, ranges: nextRanges })
  }

  function openImage() {
    const conditions = [`攻撃力 ${NUMBER.format(attack)}`, '1体あたり']
    if (view === 'table') {
      for (const { key, label } of RANGE_FIELDS) {
        const { min, max } = ranges[key]
        if (min === INITIAL_RANGES[key].min && max === INITIAL_RANGES[key].max) continue
        conditions.push(`${label} ${NUMBER.format(min)}${max === null ? '以上' : `〜${NUMBER.format(max)}`}`)
      }
      const rows = structuredClone({ physical, arts })
      setImage({ view, snapshot: {
        title: '物理・術ダメージ比較表（1回の攻撃ダメージ）',
        conditions,
        table: <DamageCalculatorThreeAttributeTable {...rows} metric="perAttack" forImage />,
      } })
      return
    }
    const chartInput = structuredClone({ attack, ranges: chartRanges, showRatings })
    setImage({ view, snapshot: {
      title: '物理・術ダメージ比較（1回の攻撃ダメージ）',
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

  return <section className="calculator-page damage-three-attribute-page">
    <header className="page-intro">
      <h1>物理・術ダメージ比較</h1>
    </header>
    <section className="calculator-panel" aria-labelledby="physical-arts-result-heading">
      <form className="physical-arts-comparison-controls" onSubmit={apply}>
        <label className="calculator-field">
          <span>攻撃力</span>
          <input name="attack" type="number" inputMode="numeric" min={1} max={1000000} step={1}
            defaultValue={INITIAL_ATTACK} required />
        </label>
        <div className="physical-arts-comparison-ranges">
          {RANGE_FIELDS.map(({ key, label, limit }) => (
            <fieldset key={key}>
              <legend>{label}</legend>
              {BOUNDS.map(([bound, boundLabel]) => {
                const optional = key === 'defense' && bound === 'max'
                return <label className="calculator-field" key={bound}>
                  <span>{boundLabel}</span>
                  <input name={`${key}-${bound}`} type="number" inputMode="numeric" min={0}
                    max={bound === 'min' ? limit - 1 : limit} step={1}
                    defaultValue={INITIAL_RANGES[key][bound] ?? undefined} required={!optional}
                    placeholder={optional ? (showChart ? String(chartRanges.defense.max) : '上限なし') : undefined}
                    aria-label={`${label}の${boundLabel}`}
                    aria-invalid={rangeError?.key === key || undefined}
                    aria-describedby={rangeError?.key === key ? 'physical-arts-range-error' : undefined}
                    onInput={() => { if (rangeError?.key === key) setRangeError(null) }} />
                </label>
              })}
            </fieldset>
          ))}
        </div>
        <button className="button" type="submit">出力</button>
        {rangeError && <p className="physical-arts-comparison-error" id="physical-arts-range-error" role="alert">
          {rangeError.label}の上限は下限より大きい値を入力してください。
        </p>}
      </form>
      <div className="damage-three-attribute-context">
        <h2 id="physical-arts-result-heading" className="physical-arts-comparison-heading">1回の攻撃ダメージ</h2>
        <span role="status">攻撃力 {NUMBER.format(attack)} · 1体あたり</span>
      </div>
      <div className="damage-three-attribute-toolbar">
        <AttributeButtons label="表示形式" options={VIEWS} value={view} onChange={setView} />
        {showChart && <label className="physical-arts-comparison-rating-toggle">
          <input type="checkbox" checked={showRatings} onChange={event => setShowRatings(event.target.checked)} />
          評価表示
        </label>}
        <button type="button" className="button secondary damage-three-attribute-image-button"
          aria-label={`物理・術ダメージ比較${showChart ? 'グラフ' : '表'}をPNG画像で保存`}
          aria-haspopup="dialog" onClick={openImage}>画像を保存</button>
      </div>
      {showChart ? <PhysicalArtsComparisonChart attack={attack} ranges={chartRanges} showRatings={showRatings} />
        : <DamageCalculatorThreeAttributeTable physical={physical} arts={arts} metric="perAttack" />}
    </section>
    {image?.view === 'table' && <DamageCalculatorThreeAttributeImageDialog snapshot={image.snapshot} onClose={() => setImage(null)} />}
    {image?.view === 'chart' && <DamageCalculatorThreeAttributeChartImageDialog snapshot={image.snapshot} onClose={() => setImage(null)} />}
  </section>
}
