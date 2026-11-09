import { useMemo, useState, type FormEvent } from 'react'
import { evaluateAttackAttributeTables } from '../lib/damageCalculatorThreeAttributeTables'
import {
  DamageCalculatorThreeAttributeChartImageDialog, type DamageCalculatorThreeAttributeChartImageSnapshot,
} from './DamageCalculatorThreeAttributeChartImageDialog'
import {
  DamageCalculatorThreeAttributeImageDialog, type DamageCalculatorThreeAttributeImageSnapshot,
} from './DamageCalculatorThreeAttributeImageDialog'
import { AttributeButtons, DamageCalculatorThreeAttributeTable } from './DamageCalculatorThreeAttributePage'
import {
  PhysicalArtsComparisonChart, PhysicalArtsComparisonImageLegend, type PhysicalArtsChartRanges,
} from './PhysicalArtsComparisonChart'
import './PhysicalArtsComparisonPage.css'

const INITIAL_ATTACK = 1000
const NUMBER = new Intl.NumberFormat('ja-JP')
const VIEWS = [['table', '表'], ['chart', 'グラフ']] as const
const INITIAL_RANGES: PhysicalArtsChartRanges = {
  defense: { min: 0, max: 3000 },
  resistance: { min: 0, max: 100 },
}
const RANGE_FIELDS = [
  { key: 'defense', label: '防御力', limit: 1_000_000 },
  { key: 'resistance', label: '術耐性', limit: 100 },
] as const
const BOUNDS = [['min', '下限'], ['max', '上限']] as const
type ResultImage =
  | { view: 'table'; snapshot: DamageCalculatorThreeAttributeImageSnapshot }
  | { view: 'chart'; snapshot: DamageCalculatorThreeAttributeChartImageSnapshot }

export default function PhysicalArtsComparisonPage() {
  const [{ attack, ranges }, setResult] = useState({ attack: INITIAL_ATTACK, ranges: INITIAL_RANGES })
  const [view, setView] = useState<typeof VIEWS[number][0]>('table')
  const [rangeError, setRangeError] = useState<typeof RANGE_FIELDS[number] | null>(null)
  const [image, setImage] = useState<ResultImage | null>(null)
  const { physical, arts } = useMemo(() => evaluateAttackAttributeTables(attack), [attack])
  const showChart = view === 'chart'

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const nextAttack = Number(data.get('attack'))
    const nextRanges = { ...ranges }
    if (showChart) {
      for (const field of RANGE_FIELDS) {
        const min = Number(data.get(`${field.key}-min`))
        const max = Number(data.get(`${field.key}-max`))
        if (min >= max) {
          setRangeError(field)
          return
        }
        nextRanges[field.key] = { min, max }
      }
      setRangeError(null)
    }
    setResult({ attack: nextAttack, ranges: nextRanges })
  }

  function openImage() {
    const conditions = [`攻撃力 ${NUMBER.format(attack)}`, '1体あたり']
    if (view === 'table') {
      const rows = structuredClone({ physical, arts })
      setImage({ view, snapshot: {
        title: '物理・術ダメージ比較表（1回の攻撃ダメージ）',
        conditions,
        table: <DamageCalculatorThreeAttributeTable {...rows} metric="perAttack" forImage />,
      } })
      return
    }
    const chartInput = structuredClone({ attack, ranges })
    setImage({ view, snapshot: {
      title: '物理・術ダメージ比較（1回の攻撃ダメージ）',
      axisTitle: '防御力',
      conditions,
      filenameParts: [
        `攻撃力${chartInput.attack}`,
        ...RANGE_FIELDS.map(({ key, label }) => `${label}${chartInput.ranges[key].min}-${chartInput.ranges[key].max}`),
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
        <div className="physical-arts-comparison-ranges" hidden={!showChart}>
          {RANGE_FIELDS.map(({ key, label, limit }) => (
            <fieldset key={key} disabled={!showChart}>
              <legend>{label}</legend>
              {BOUNDS.map(([bound, boundLabel]) => <label className="calculator-field" key={bound}>
                <span>{boundLabel}</span>
                <input name={`${key}-${bound}`} type="number" inputMode="numeric" min={0} max={limit} step={1}
                  defaultValue={INITIAL_RANGES[key][bound]} required aria-label={`${label}の${boundLabel}`}
                  aria-invalid={rangeError?.key === key || undefined}
                  aria-describedby={rangeError?.key === key ? 'physical-arts-range-error' : undefined}
                  onInput={() => { if (rangeError?.key === key) setRangeError(null) }} />
              </label>)}
            </fieldset>
          ))}
        </div>
        <button className="button" type="submit">出力</button>
        {showChart && rangeError && <p className="physical-arts-comparison-error" id="physical-arts-range-error" role="alert">
          {rangeError.label}の上限は下限より大きい値を入力してください。
        </p>}
      </form>
      <div className="damage-three-attribute-context">
        <h2 id="physical-arts-result-heading" className="physical-arts-comparison-heading">1回の攻撃ダメージ</h2>
        <span role="status">攻撃力 {NUMBER.format(attack)} · 1体あたり</span>
      </div>
      <div className="damage-three-attribute-toolbar">
        <AttributeButtons label="表示形式" options={VIEWS} value={view} onChange={setView} />
        <button type="button" className="button secondary damage-three-attribute-image-button"
          aria-label={`物理・術ダメージ比較${showChart ? 'グラフ' : '表'}をPNG画像で保存`}
          aria-haspopup="dialog" onClick={openImage}>画像を保存</button>
      </div>
      {showChart ? <PhysicalArtsComparisonChart attack={attack} ranges={ranges} />
        : <DamageCalculatorThreeAttributeTable physical={physical} arts={arts} metric="perAttack" />}
    </section>
    {image?.view === 'table' && <DamageCalculatorThreeAttributeImageDialog snapshot={image.snapshot} onClose={() => setImage(null)} />}
    {image?.view === 'chart' && <DamageCalculatorThreeAttributeChartImageDialog snapshot={image.snapshot} onClose={() => setImage(null)} />}
  </section>
}
