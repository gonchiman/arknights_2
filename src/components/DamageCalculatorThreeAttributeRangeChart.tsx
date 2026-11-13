import { useState, type CSSProperties } from 'react'
import { createZeroBasedValueAxis } from '../lib/chartValueAxis'
import type { DamageThreeAttributeTableRow } from '../lib/damageCalculatorThreeAttributeTables'
import { getEnemyRatingRanges } from '../lib/enemyStatRatings'
import './DamageCalculatorThreeAttributeRangeChart.css'

type DamageRange = NonNullable<DamageThreeAttributeTableRow['perAttack']>

interface Props {
  physical: readonly DamageThreeAttributeTableRow[]
  arts: readonly DamageThreeAttributeTableRow[]
  invalid?: boolean
  imageHeight?: number
}

const RATINGS = getEnemyRatingRanges('defense').map(({ rating }) => rating)
const ATTRIBUTES = [
  { key: 'physical', label: '物理' },
  { key: 'arts', label: '術' },
] as const
const TICK_NUMBER = new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 4 })
const SHORT_TICK_NUMBER = new Intl.NumberFormat('ja-JP', { notation: 'scientific', maximumSignificantDigits: 3 })
const RANGE_NUMBER = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

function getRange(range: DamageRange | null | undefined): DamageRange | null {
  return range && Number.isFinite(range.min) && Number.isFinite(range.max) && range.min >= 0 && range.max >= range.min
    ? range : null
}

function describeRange(range: DamageRange | null) {
  if (!range) return '—'
  const minimum = RANGE_NUMBER.format(range.min)
  return range.min === range.max ? minimum : `${minimum}〜${RANGE_NUMBER.format(range.max)}`
}

function describeGroup(group: { rating: string; physical: DamageRange | null; arts: DamageRange | null }) {
  return `評価 ${group.rating}　物理 ${describeRange(group.physical)}　術 ${describeRange(group.arts)}`
}

export function DamageCalculatorThreeAttributeRangeLegend({ forImage = false }: { forImage?: boolean }) {
  return <ul className={forImage ? 'chart-image-frame-legend-list damage-three-attribute-range-image-legend'
    : 'damage-three-attribute-range-legend'} aria-label="属性の凡例">
    {ATTRIBUTES.map(({ key, label }) => {
      const point = <i className={`damage-three-attribute-range-point is-${key}`} aria-hidden="true" />
      return <li key={key} className={forImage ? 'chart-image-frame-legend-item' : undefined}>
        {forImage ? <span className="chart-image-frame-legend-swatch">{point}</span> : point}{label}
      </li>
    })}
  </ul>
}

export function DamageCalculatorThreeAttributeRangeChart({ physical, arts, invalid = false, imageHeight }: Props) {
  const [selected, setSelected] = useState(5)
  const forImage = imageHeight !== undefined
  const physicalByRating = new Map(physical.map(row => [row.rating, row.perAttack]))
  const artsByRating = new Map(arts.map(row => [row.rating, row.perAttack]))
  const groups = RATINGS.map(rating => ({
    rating,
    physical: invalid ? null : getRange(physicalByRating.get(rating)),
    arts: invalid ? null : getRange(artsByRating.get(rating)),
  }))
  const maximum = Math.max(0, ...groups.flatMap(group => ATTRIBUTES.map(({ key }) => group[key]?.max ?? 0)))
  const axis = createZeroBasedValueAxis(maximum, 0)
  const percentage = (value: number) => `${value / axis.maximum * 100}%`
  const columns = { '--dc3-range-columns': groups.length } as CSSProperties

  return <figure className={`damage-three-attribute-range-chart${forImage ? ' is-image' : ''}`}
    style={{ height: imageHeight }} aria-label="ゲーム内評価別の物理・術ダメージ">
    {!forImage && <figcaption className="damage-three-attribute-range-caption">
      <DamageCalculatorThreeAttributeRangeLegend />
    </figcaption>}
    <div className="damage-three-attribute-range-layout" style={columns}>
      <div className="damage-three-attribute-range-scale" aria-hidden="true">
        {axis.ticks.map(tick => <span key={tick} style={{ top: percentage(axis.maximum - tick) }}>
          {(tick >= 1_000_000 || (tick > 0 && tick < 0.01) ? SHORT_TICK_NUMBER : TICK_NUMBER).format(tick)}
        </span>)}
      </div>
      <div className="damage-three-attribute-range-plot" aria-hidden="true">
        {axis.ticks.slice(1).map(tick => <i className="damage-three-attribute-range-gridline" key={tick}
          style={{ bottom: percentage(tick) }} />)}
        {groups.map((group, index) => <div key={group.rating}
          className={`damage-three-attribute-range-group${!forImage && index === selected ? ' is-selected' : ''}`}>
          {ATTRIBUTES.map(({ key }) => {
            const range = group[key]
            if (!range) return null
            return <span key={key} className={`damage-three-attribute-range-mark is-${key}`}
              style={{ bottom: percentage(range.min), height: percentage(range.max - range.min) }}>
              <i className={`damage-three-attribute-range-point is-${key}`} />
              {range.min !== range.max && <i className={`damage-three-attribute-range-point is-${key}`} />}
            </span>
          })}
        </div>)}
      </div>
      {!forImage && <span className="damage-three-attribute-range-axis" aria-hidden="true">評価</span>}
      <div className="damage-three-attribute-range-ratings" role="group" aria-label="ゲーム内評価">
        {groups.map((group, index) => forImage ? <span key={group.rating}>{group.rating}</span> : <button key={group.rating} type="button"
          aria-label={describeGroup(group)} aria-pressed={index === selected} onClick={() => setSelected(index)}>
          {group.rating}
        </button>)}
      </div>
    </div>
    {!forImage && <p className="damage-three-attribute-range-detail" aria-live="polite">{describeGroup(groups[selected])}</p>}
  </figure>
}
