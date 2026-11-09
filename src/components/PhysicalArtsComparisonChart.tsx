import { useId } from 'react'
import { createZeroBasedValueAxis } from '../lib/chartValueAxis'
import { calculateDamage, calculateDamageBreakdown } from '../lib/damageCalculator'
import './PhysicalArtsComparisonChart.css'

const ATTRIBUTES = [
  { key: 'physical', label: '物理', stat: '防御力', rangeKey: 'defense' },
  { key: 'arts', label: '術', stat: '術耐性', rangeKey: 'resistance' },
] as const
const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })

export type PhysicalArtsChartRanges = {
  defense: { min: number; max: number }
  resistance: { min: number; max: number }
}

export function PhysicalArtsComparisonImageLegend() {
  return <ul className="chart-image-frame-legend-list physical-arts-chart-image-legend" aria-label="属性の凡例">
    {ATTRIBUTES.map(({ key, label }) => <li className="chart-image-frame-legend-item" key={key}>
      <svg className="chart-image-frame-legend-swatch" width="18" height="12" aria-hidden="true">
        <line className={`is-${key}`} x1="0" x2="18" y1="6" y2="6" stroke="currentColor" strokeWidth="2" />
      </svg>
      <span>{label}</span>
    </li>)}
  </ul>
}

export function PhysicalArtsComparisonChart({ attack, ranges, imageHeight }: {
  attack: number; ranges: PhysicalArtsChartRanges; imageHeight?: number
}) {
  const descriptionId = useId()
  const forImage = imageHeight !== undefined
  const axis = createZeroBasedValueAxis(attack, 0)
  const y = (value: number) => (1 - value / axis.maximum) * 100
  const floor = calculateDamageBreakdown(attack, 'PHYSICAL', 0, 0).minimumDamage ?? 0
  const curves = ATTRIBUTES.map(attribute => {
    const { min, max } = ranges[attribute.rangeKey]
    const physical = attribute.key === 'physical'
    const breakpoint = physical ? attack - floor : (1 - floor / attack) * 100
    const damage = (stat: number) => physical
      ? calculateDamage(attack, 'PHYSICAL', stat, 0)
      : calculateDamage(attack, 'ARTS', 0, stat)
    const points = [{ stat: min, damage: damage(min) }]
    if (min < breakpoint && breakpoint < max) points.push({ stat: breakpoint, damage: floor })
    points.push({ stat: max, damage: damage(max) })
    return { ...attribute, min, max, points }
  })

  return <figure className={`physical-arts-chart${forImage ? ' is-image' : ''}`}
    style={forImage ? { height: imageHeight } : undefined} aria-label="物理・術の一撃ダメージ" aria-describedby={descriptionId}>
    {!forImage && <figcaption className="physical-arts-chart-legend">
      {curves.map(({ key, label }) => <span className={`is-${key}`} key={key}><i aria-hidden="true" />{label}</span>)}
    </figcaption>}
    <div className="physical-arts-chart-layout" aria-hidden="true">
      {[...curves].reverse().map(({ key, stat, min, max }) => (
        <div className={`physical-arts-chart-x is-${key}${max >= 100000 ? ' has-large-values' : ''}`} key={key}>
          {(!forImage || key === 'arts') && <span>{stat}</span>}
          <div className="physical-arts-chart-x-ticks">
            {[0, 25, 50, 75, 100].map(tick => <span key={tick} style={{ left: `${tick}%` }}>
              {NUMBER.format(min + tick / 100 * (max - min))}
            </span>)}
          </div>
        </div>
      ))}
      <div className="physical-arts-chart-y-ticks">
        {axis.ticks.map(tick => <span key={tick} style={{ top: `${y(tick)}%` }}>{NUMBER.format(tick)}</span>)}
      </div>
      <svg className="physical-arts-chart-plot" viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
        {axis.ticks.map(tick => <line key={tick} x1="0" x2="100" y1={y(tick)} y2={y(tick)} vectorEffect="non-scaling-stroke" />)}
        {curves.map(({ key, min, max, points }) => <polyline className={`is-${key}`} key={key}
          points={points.map(point => `${(point.stat - min) / (max - min) * 100},${y(point.damage)}`).join(' ')}
          vectorEffect="non-scaling-stroke" />)}
      </svg>
    </div>
    <p className="visually-hidden" id={descriptionId}>
      {curves.map(({ label, stat, points }) => `${label}、${points.map(point =>
        `${stat} ${NUMBER.format(point.stat)}でダメージ ${NUMBER.format(point.damage)}`).join('、')}`).join('。')}
    </p>
  </figure>
}
