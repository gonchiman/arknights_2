import { useId } from 'react'
import { createZeroBasedValueAxis } from '../lib/chartValueAxis'
import type { PhysicalArtsAttackSweepPoint } from '../lib/physicalArtsAttackSweep'
import './PhysicalArtsComparisonChart.css'
import './PhysicalArtsAttackSweepChart.css'

const ATTRIBUTES = [
  { key: 'physical', label: '物理' },
  { key: 'arts', label: '術' },
] as const
const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })
const ATTACK_TICK_POSITIONS = [0, 25, 50, 75, 100]

export function PhysicalArtsAttackSweepChart({ points, imageHeight }: {
  points: readonly PhysicalArtsAttackSweepPoint[]
  imageHeight?: number
}) {
  const descriptionId = useId()
  const forImage = imageHeight !== undefined
  const min = points[0]?.attack
  const max = points.at(-1)?.attack
  if (min === undefined || max === undefined || min >= max) return null

  const maximumDamage = points.reduce((maximum, point) => Math.max(maximum, point.physical, point.arts), 0)
  const axis = createZeroBasedValueAxis(maximumDamage, 0)
  const x = (attack: number) => (attack - min) / (max - min) * 100
  const y = (damage: number) => (1 - damage / axis.maximum) * 100

  return <figure className={`physical-arts-chart is-attack-sweep${forImage ? ' is-image' : ''}`}
    style={forImage ? { height: imageHeight } : undefined}
    aria-label="攻撃力別の物理・術ダメージ" aria-describedby={descriptionId}>
    {!forImage && <figcaption className="physical-arts-chart-legend">
      {ATTRIBUTES.map(({ key, label }) => <span className={`is-${key}`} key={key}><i aria-hidden="true" />{label}</span>)}
    </figcaption>}
    <div className="physical-arts-chart-layout" aria-hidden="true">
      <div className="physical-arts-chart-y-ticks">
        {axis.ticks.map(tick => <span key={tick} style={{ top: `${y(tick)}%` }}>{NUMBER.format(tick)}</span>)}
      </div>
      <svg className="physical-arts-chart-plot" viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
        {axis.ticks.map(tick => <line key={tick} x1="0" x2="100" y1={y(tick)} y2={y(tick)} vectorEffect="non-scaling-stroke" />)}
        {ATTRIBUTES.map(({ key }) => <polyline key={key} className={`is-${key}`}
          points={points.map(point => `${x(point.attack)},${y(point[key])}`).join(' ')}
          vectorEffect="non-scaling-stroke" />)}
      </svg>
      <div className={`physical-arts-chart-x is-attack${max >= 100000 ? ' has-large-values' : ''}`}>
        <div className="physical-arts-chart-x-ticks">
          {ATTACK_TICK_POSITIONS.map(position => <span key={position} style={{ left: `${position}%` }}>
            {NUMBER.format(min + position / 100 * (max - min))}
          </span>)}
        </div>
        {!forImage && <span>攻撃力</span>}
      </div>
    </div>
    <p className="visually-hidden" id={descriptionId}>
      {points.map(point =>
        `攻撃力 ${NUMBER.format(point.attack)}、物理 ${NUMBER.format(point.physical)}、術 ${NUMBER.format(point.arts)}`
      ).join('。')}
    </p>
  </figure>
}
