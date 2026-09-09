import { useId } from 'react'
import type { GoldenglowPerformanceChartColumn } from './goldenglowPerformanceChartTypes'
import './GoldenglowPerformanceBarChart.css'

const DAMAGE_PARTS = [
  { key: 'expectedBodyDamage', label: '本体', color: '#596b8d' },
  { key: 'expectedDroneNormalDamage', label: '浮遊ユニット', color: '#3e7c88' },
  { key: 'expectedExplosionDamage', label: '爆発', color: '#b77945' },
] as const

const isDamageValue = (value: number | null | undefined): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0
)

export function GoldenglowPerformanceBarChart({
  columns,
  metricLabel,
  resistance,
  stacked,
  formatValue,
}: {
  columns: readonly GoldenglowPerformanceChartColumn[]
  metricLabel: string
  resistance: number
  stacked: boolean
  formatValue: (value: number) => string
}) {
  const titleId = useId()
  const rows = columns.map((column) => ({
    ...column,
    value: column.values.find((value) => value.resistance === resistance),
  }))
  const maximum = Math.max(0, ...rows.flatMap((row) => (
    isDamageValue(row.value?.expectedTotalDamage) ? [row.value.expectedTotalDamage] : []
  )))
  const scale = maximum || 1
  const displayValue = (value: number | null | undefined) => isDamageValue(value) ? formatValue(value) : '—'

  return (
    <figure className="gg-performance-bar-chart" aria-labelledby={titleId}>
      <figcaption className="gg-performance-bar-caption">
        <strong id={titleId}>{metricLabel}{stacked ? 'の内訳' : '比較'}</strong>
        {stacked && <ul className="gg-performance-bar-legend" aria-label="ダメージ内訳の凡例">
          {DAMAGE_PARTS.map((part) => <li key={part.key}>
            <i style={{ backgroundColor: part.color }} aria-hidden="true" />
            <span>{part.label}</span>
          </li>)}
        </ul>}
      </figcaption>
      <div className="gg-performance-bar-rows">
        {rows.map((row) => {
          const total = row.value?.expectedTotalDamage
          const parts = DAMAGE_PARTS.map((part) => ({ ...part, value: row.value?.[part.key] }))
          const hasTotal = isDamageValue(total)
          const hasParts = parts.every((part) => isDamageValue(part.value))
          const description = `${row.label}・術耐性 ${formatValue(resistance)}・${metricLabel} ${displayValue(total)}`
            + (stacked ? `・${parts.map((part) => `${part.label} ${displayValue(part.value)}`).join('・')}` : '')

          return (
            <div className="gg-performance-bar-row" key={row.id}>
              <span className="gg-performance-bar-label">{row.label}</span>
              <div className="gg-performance-bar-track" role="img" aria-label={description} title={description}>
                {hasTotal && (stacked
                  ? hasParts && parts.map((part) => <span
                    key={part.key}
                    className="gg-performance-bar-segment"
                    style={{ width: `${((part.value ?? 0) / scale) * 100}%`, backgroundColor: part.color }}
                    title={`${row.label}・${part.label} ${displayValue(part.value)}`}
                  />)
                  : <span className="gg-performance-bar-segment"
                    style={{ width: `${(total / scale) * 100}%`, backgroundColor: row.color }} />)}
              </div>
              <strong className="gg-performance-bar-total">{displayValue(total)}</strong>
            </div>
          )
        })}
        <div className="gg-performance-bar-scale" aria-hidden="true">
          <span>0</span>
          {maximum > 0 && <span>{formatValue(maximum)}</span>}
        </div>
      </div>
    </figure>
  )
}
