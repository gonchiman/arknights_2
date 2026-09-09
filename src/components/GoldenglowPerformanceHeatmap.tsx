import { useId } from 'react'
import type { GoldenglowPerformanceChartColumn } from './goldenglowPerformanceChartTypes'
import './GoldenglowPerformanceHeatmap.css'

function cellColor(value: number | null, maximum: number): string | undefined {
  if (value === null || value <= 0 || maximum <= 0) return undefined
  const ratio = Math.min(1, value / maximum)
  return `hsl(211 64% ${99 - ratio * 14}%)`
}

export function GoldenglowPerformanceHeatmap({ columns, metricLabel, formatValue }: {
  columns: readonly GoldenglowPerformanceChartColumn[]
  metricLabel: string
  formatValue: (value: number) => string
}) {
  const titleId = useId()
  const legendId = useId()
  const resistances = Array.from(new Set(columns.flatMap((column) => (
    column.values.map((value) => value.resistance).filter(Number.isFinite)
  )))).sort((a, b) => a - b)
  const valuesByResistance = columns.map((column) => new Map(column.values.map((value) => [
    value.resistance,
    value.expectedTotalDamage !== null && Number.isFinite(value.expectedTotalDamage)
      ? value.expectedTotalDamage : null,
  ])))

  return (
    <figure className="gg-performance-heatmap">
      <figcaption className="gg-performance-heatmap-caption">
        <strong id={titleId}>{metricLabel}</strong>
        <span id={legendId}>色は各行の最大値を基準</span>
      </figcaption>
      {columns.length > 0 && resistances.length > 0 ? (
        <div className="gg-performance-heatmap-scroll" tabIndex={0} role="region" aria-labelledby={titleId}>
          <table className="gg-performance-heatmap-table" aria-labelledby={titleId} aria-describedby={legendId}
            style={{ minWidth: 88 + columns.length * 150 }}>
            <colgroup><col style={{ width: 88 }} />{columns.map((column) => <col key={column.id} />)}</colgroup>
            <thead><tr>
              <th scope="col">敵の術耐性</th>
              {columns.map((column) => <th scope="col" key={column.id}>{column.label}</th>)}
            </tr></thead>
            <tbody>{resistances.map((resistance) => {
              const values = valuesByResistance.map((column) => column.get(resistance) ?? null)
              const maximum = Math.max(0, ...values.map((value) => value ?? 0))
              return <tr key={resistance}>
                <th scope="row">{resistance}</th>
                {columns.map((column, index) => {
                  const value = values[index]
                  const highest = maximum > 0 && value === maximum
                  return <td key={column.id}
                    className={highest ? 'is-highest' : value === null ? 'is-unavailable' : undefined}
                    style={{ backgroundColor: cellColor(value, maximum) }}>
                    {value === null ? '—' : formatValue(value)}
                    {highest && <span className="visually-hidden">（行内の最大値）</span>}
                  </td>
                })}
              </tr>
            })}</tbody>
          </table>
        </div>
      ) : <p className="gg-performance-heatmap-empty" role="status">比較データがありません。</p>}
    </figure>
  )
}
