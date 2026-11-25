import { Fragment } from 'react'
import { createZeroBasedValueAxis } from '../lib/chartValueAxis'
import './SkillDpsRegressionCoefficientChart.css'

const COEFFICIENT = new Intl.NumberFormat('ja-JP', { signDisplay: 'exceptZero', maximumFractionDigits: 3 })
const EXPONENTIAL = new Intl.NumberFormat('ja-JP', {
  signDisplay: 'exceptZero', maximumFractionDigits: 3, notation: 'scientific',
})

function formatCoefficient(value: number) {
  const magnitude = Math.abs(value)
  const formatter = magnitude >= 10000 || (magnitude > 0 && magnitude < 0.001) ? EXPONENTIAL : COEFFICIENT
  return formatter.format(value).replace('-', '−')
}

export function SkillDpsRegressionCoefficientChart({ rows }: {
  rows: readonly { label: string; value: number }[]
}) {
  const maximum = createZeroBasedValueAxis(Math.max(1, ...rows.map(({ value }) => Math.abs(value))), 0.5).maximum
  const ticks = [-maximum, -maximum / 2, 0, maximum / 2, maximum]
  const description = rows.map(({ label, value }) => `${label} ${formatCoefficient(value)}`).join('、')

  return <figure className="skill-dps-coefficient-chart" role="img" aria-label={`標準化係数の横棒グラフ。${description}`}>
    <figcaption>標準化係数</figcaption>
    {rows.map(({ label, value }) => {
      const width = Math.abs(value) / maximum * 50

      return <Fragment key={label}>
        <span className="skill-dps-coefficient-label">{label}</span>
        <div className="skill-dps-coefficient-lane" aria-hidden="true">
          <div className="skill-dps-coefficient-bar" style={{ left: `${value < 0 ? 50 - width : 50}%`, width: `${width}%` }} />
        </div>
        <span className="skill-dps-coefficient-value">{formatCoefficient(value)}</span>
      </Fragment>
    })}
    <div className="skill-dps-coefficient-ticks" aria-hidden="true">
      {ticks.map((tick, index) => <span key={tick} style={{ left: `${index * 25}%` }}>{formatCoefficient(tick)}</span>)}
    </div>
  </figure>
}
