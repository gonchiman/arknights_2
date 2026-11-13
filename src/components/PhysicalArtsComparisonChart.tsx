import { useId } from 'react'
import { createZeroBasedValueAxis } from '../lib/chartValueAxis'
import { calculateDamage, calculateDamageBreakdown } from '../lib/damageCalculator'
import { toDamageReductionPercent, type PhysicalArtsMetric } from '../lib/physicalArtsDefenseSweep'
import { getStatRankBands, type StatRankBand } from '../lib/statRankBands'
import './PhysicalArtsComparisonChart.css'

const ATTRIBUTES = [
  { key: 'physical', label: '物理', stat: '防御力', rangeKey: 'defense', ratingStat: 'defense' },
  { key: 'arts', label: '術', stat: '術耐性', rangeKey: 'resistance', ratingStat: 'magicResistance' },
] as const
const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })
const TICK_PERCENTAGES = [0, 25, 50, 75, 100]
const RATING_BAND_HEIGHT = 18
const RATING_ENDPOINT_HEIGHT = 14
const AXIS_GAP = 3
export const PHYSICAL_ARTS_RATING_EXTRA_HEIGHT = 2 * (RATING_BAND_HEIGHT + RATING_ENDPOINT_HEIGHT + AXIS_GAP)

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

function AxisRatingStrip({ bands }: { bands: readonly StatRankBand[] }) {
  const points = bands.filter(band => band.pointValue !== undefined)
  return <div className="physical-arts-chart-ratings">
    <div className="physical-arts-chart-rating-track" style={{ height: RATING_BAND_HEIGHT }}>
      {bands.filter(band => band.pointValue === undefined).map(band => (
        <div key={band.rating} className="physical-arts-chart-rating-band" data-rating={band.rating}
          style={{ left: `${band.start * 100}%`, width: `${(band.end - band.start) * 100}%` }}>
          <span>{band.rating}</span>
        </div>
      ))}
      {points.map(band => <i key={band.rating} className={band.start === 0 ? 'at-start' : 'at-end'} />)}
    </div>
    {points.length > 0 && <div className="physical-arts-chart-rating-points" style={{ height: RATING_ENDPOINT_HEIGHT }}>
      {points.map(band => <span key={band.rating} className={band.start === 0 ? 'at-start' : 'at-end'}
        data-rating={band.rating} data-rating-point={band.pointValue}>{band.rating}</span>)}
    </div>}
  </div>
}

export function PhysicalArtsComparisonChart({ attack, ranges, metric = 'damage', showRatings = false, imageHeight }: {
  attack: number; ranges: PhysicalArtsChartRanges; metric?: PhysicalArtsMetric; showRatings?: boolean; imageHeight?: number
}) {
  const descriptionId = useId()
  const forImage = imageHeight !== undefined
  const reduction = metric === 'reduction'
  const metricLabel = reduction ? '軽減率' : 'ダメージ'
  const formatValue = (value: number) => `${NUMBER.format(value)}${reduction ? '%' : ''}`
  const axis = reduction ? { maximum: 100, ticks: TICK_PERCENTAGES } : createZeroBasedValueAxis(attack, 0)
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
    if (min < max) points.push({ stat: max, damage: damage(max) })
    const bands = showRatings && min < max
      ? getStatRankBands({ stat: attribute.ratingStat, chartKind: 'line', min, max, barValues: [], includeEndpointRanks: true })
      : []
    return { ...attribute, min, max, bands, points: points.map(point => ({
      stat: point.stat, value: reduction ? toDamageReductionPercent(attack, point.damage) : point.damage,
    })) }
  })

  return <figure className={`physical-arts-chart${forImage ? ' is-image' : ''}`}
    style={forImage ? { height: imageHeight } : undefined}
    aria-label={reduction ? '物理・術のダメージ軽減率' : '物理・術の一撃ダメージ'} aria-describedby={descriptionId}>
    {!forImage && <figcaption className="physical-arts-chart-legend">
      {curves.map(({ key, label }) => <span className={`is-${key}`} key={key}><i aria-hidden="true" />{label}</span>)}
    </figcaption>}
    <div className="physical-arts-chart-layout" aria-hidden="true">
      {[...curves].reverse().map(({ key, stat, min, max, bands }) => (
        <div className={`physical-arts-chart-x is-${key}${max >= 100000 ? ' has-large-values' : ''}`} key={key}
          style={{ gap: AXIS_GAP }}>
          {(!forImage || key === 'arts') && <span>{stat}</span>}
          <div className="physical-arts-chart-x-ticks">
            {min === max ? <span style={{ left: '50%', transform: 'translateX(-50%)' }}>{NUMBER.format(min)}</span>
              : TICK_PERCENTAGES.map(tick => <span key={tick} style={{ left: `${tick}%` }}>
                {NUMBER.format(min + tick / 100 * (max - min))}
              </span>)}
          </div>
          {bands.length > 0 && <AxisRatingStrip bands={bands} />}
        </div>
      ))}
      <div className="physical-arts-chart-y-ticks">
        {axis.ticks.map(tick => <span key={tick} style={{ top: `${y(tick)}%` }}>{formatValue(tick)}</span>)}
      </div>
      <svg className="physical-arts-chart-plot" viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
        {axis.ticks.map(tick => <line key={tick} x1="0" x2="100" y1={y(tick)} y2={y(tick)} vectorEffect="non-scaling-stroke" />)}
        {curves.map(({ key, min, max, points }) => min === max
          ? <g className={`is-${key}`} key={key}>
            <path d={`M50 ${y(points[0].value)} h0`} stroke="currentColor" strokeWidth="6"
              strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </g>
          : <polyline className={`is-${key}`} key={key}
            points={points.map(point => `${(point.stat - min) / (max - min) * 100},${y(point.value)}`).join(' ')}
            vectorEffect="non-scaling-stroke" />)}
      </svg>
    </div>
    <p className="visually-hidden" id={descriptionId}>
      {curves.map(({ label, stat, points }) => `${label}、${points.map(point =>
        `${stat} ${NUMBER.format(point.stat)}で${metricLabel} ${formatValue(point.value)}`).join('、')}`).join('。')}
      {showRatings && curves.filter(({ bands }) => bands.length > 0).map(({ stat, bands }) => (
        `。${stat}の評価、${bands.map(band =>
          `${band.rating} ${band.pointValue === undefined ? band.label : NUMBER.format(band.pointValue)}`).join('、')}`
      )).join('')}
    </p>
  </figure>
}
