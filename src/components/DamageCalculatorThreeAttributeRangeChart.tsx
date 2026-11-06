import { useId, type CSSProperties } from 'react'
import { createZeroBasedValueAxis } from '../lib/chartValueAxis'
import type { DamageThreeAttributeTableRow } from '../lib/damageCalculatorThreeAttributeTables'
import { getEnemyRatingRanges } from '../lib/enemyStatRatings'
import './DamageCalculatorThreeAttributeRangeChart.css'

type Metric = 'dps' | 'perAttack'
type DamageRange = NonNullable<DamageThreeAttributeTableRow[Metric]>

interface Props {
  physical: readonly DamageThreeAttributeTableRow[]
  arts: readonly DamageThreeAttributeTableRow[]
  metric: Metric
  invalid?: boolean
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
  if (!range) return '計算結果なし'
  const minimum = RANGE_NUMBER.format(range.min)
  return range.min === range.max ? minimum : `${minimum}〜${RANGE_NUMBER.format(range.max)}`
}

/** Draw the same calculated endpoints as the comparison table on one shared scale. */
export function DamageCalculatorThreeAttributeRangeChart({ physical, arts, metric, invalid = false }: Props) {
  const captionId = useId()
  const descriptionId = useId()
  const physicalByRating = new Map(physical.map((row) => [row.rating, row[metric]]))
  const artsByRating = new Map(arts.map((row) => [row.rating, row[metric]]))
  const groups = RATINGS.map(rating => ({
    rating,
    physical: invalid ? null : getRange(physicalByRating.get(rating)),
    arts: invalid ? null : getRange(artsByRating.get(rating)),
  }))
  const maximum = Math.max(0, ...groups.flatMap(group => ATTRIBUTES.map(({ key }) => group[key]?.max ?? 0)))
  const axis = createZeroBasedValueAxis(maximum, 0)
  const percentage = (value: number) => `${value / axis.maximum * 100}%`
  const metricLabel = metric === 'dps' ? 'DPS' : '1回の攻撃ダメージ'
  const columns = { '--dc3-range-columns': RATINGS.length } as CSSProperties

  return <figure className="damage-three-attribute-range-chart" aria-labelledby={captionId} aria-describedby={descriptionId}>
    <figcaption className="damage-three-attribute-range-caption">
      <strong id={captionId}>{metricLabel}の最小〜最大</strong>
      <ul className="damage-three-attribute-range-legend" aria-label="属性の凡例">
        {ATTRIBUTES.map(({ key, label }) => <li key={key}>
          <i className={`damage-three-attribute-range-point is-${key}`} aria-hidden="true" />{label}
        </li>)}
      </ul>
    </figcaption>
    <div className="damage-three-attribute-range-layout" style={columns} aria-hidden="true">
      <div className="damage-three-attribute-range-scale">
        {axis.ticks.map(tick => <span key={tick} style={{ top: percentage(axis.maximum - tick) }}>
          {(tick >= 1_000_000 || (tick > 0 && tick < 0.01) ? SHORT_TICK_NUMBER : TICK_NUMBER).format(tick)}
        </span>)}
      </div>
      <div className="damage-three-attribute-range-plot">
        {axis.ticks.slice(1).map(tick => <i className="damage-three-attribute-range-gridline" key={tick}
          style={{ bottom: percentage(tick) }} />)}
        {groups.map(group => <div className="damage-three-attribute-range-group" key={group.rating}>
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
      <div className="damage-three-attribute-range-ratings">
        {groups.map(({ rating }) => <span key={rating}>{rating}</span>)}
      </div>
      <div className="damage-three-attribute-range-axis">ゲーム内評価</div>
    </div>
    <p className="visually-hidden" id={descriptionId}>
      {groups.map(group => `${group.rating}、物理 ${describeRange(group.physical)}、術 ${describeRange(group.arts)}`).join('。')}
    </p>
  </figure>
}
