import { useId, type CSSProperties } from 'react'
import type { GoldenglowPerformanceChartColumn } from './goldenglowPerformanceChartTypes'
import { GoldenglowPerformanceBarLegend } from './GoldenglowPerformanceBarLegend'
import { useChartImageHeading } from './useChartImageHeading'
import './GoldenglowPerformanceBarChart.css'
import './GoldenglowPerformanceGroupedBarChart.css'

/** Compares the same builds side by side at every selected resistance. */
export function GoldenglowPerformanceGroupedBarChart({
  columns,
  resistances,
  metricLabel,
  conditionLabel,
  difference = false,
  integerTicks = false,
  imageOutput = false,
  formatValue,
  minHeight,
}: {
  columns: readonly GoldenglowPerformanceChartColumn[]
  resistances: readonly number[]
  metricLabel: string
  conditionLabel?: string
  difference?: boolean
  integerTicks?: boolean
  imageOutput?: boolean
  formatValue: (value: number) => string
  minHeight?: number
}) {
  const titleId = useId()
  const { headingRef, titleRef, conditionInLegend } = useChartImageHeading(imageOutput, metricLabel, conditionLabel)
  const isDamageValue = (value: number | null | undefined): value is number => (
    typeof value === 'number' && Number.isFinite(value) && (difference || value >= 0)
  )
  const groups = resistances.map((resistance) => ({
    resistance,
    bars: columns.map((column) => ({
      id: column.id,
      label: column.label,
      color: column.color,
      value: column.values.find((value) => value.resistance === resistance)?.expectedTotalDamage,
    })),
  }))
  const values = groups.flatMap((group) => group.bars.map((bar) => bar.value).filter(isDamageValue))
  const minimum = Math.min(0, ...values)
  const maximum = Math.max(0, ...values)
  const hasExtent = maximum > minimum
  const requestedStep = (hasExtent ? maximum - minimum : 1) / 4
  const magnitude = 10 ** Math.floor(Math.log10(requestedStep))
  const tickStep = Math.max(integerTicks ? 1 : 0,
    [1, 2, 5, 10].find((multiple) => multiple * magnitude >= requestedStep)! * magnitude)
  const firstTick = Math.floor(minimum / tickStep)
  const lastTick = hasExtent ? Math.ceil(maximum / tickStep) : 1
  const axisMinimum = firstTick * tickStep
  const axisMaximum = lastTick * tickStep
  const axisSpan = axisMaximum - axisMinimum
  const ticks = hasExtent
    ? Array.from({ length: lastTick - firstTick + 1 }, (_, index) => (firstTick + index) * tickStep)
    : [0]
  const tickLabels = ticks.map(formatValue)
  const widestTick = tickLabels.reduce((widest, label) => label.length > widest.length ? label : widest, '')
  const position = (value: number) => (value - axisMinimum) / axisSpan * 100
  const tickStyle = (value: number): CSSProperties => ({ bottom: `${position(value)}%` })
  const groupStyle: CSSProperties = { gridTemplateColumns: `repeat(${Math.max(1, groups.length)}, minmax(0, 1fr))` }

  return <figure className="gg-performance-bar-chart gg-performance-grouped-chart" aria-labelledby={titleId}
    style={{ minHeight: minHeight ?? 420 }}>
    <figcaption className="gg-performance-bar-caption">
      <div className={`gg-performance-bar-heading${imageOutput ? ' gg-performance-bar-heading-inline' : ''}`} ref={headingRef}>
        <strong id={titleId}><span ref={titleRef}>{metricLabel}{imageOutput ? '' : '比較'}</span></strong>
        {!conditionInLegend && conditionLabel && <span className="gg-performance-bar-condition">{conditionLabel}</span>}
      </div>
      {!imageOutput && <ul className="gg-performance-bar-legend" aria-label="比較条件の凡例">
        {columns.map((column) => <li key={column.id}>
          <i style={{ backgroundColor: column.color }} aria-hidden="true" />
          <span>{column.label}</span>
        </li>)}
      </ul>}
    </figcaption>
    <div className={`gg-performance-grouped-plot${imageOutput ? ' gg-performance-bar-auto-legend-plot' : ''}`}>
      <div className="gg-performance-grouped-y-title">{difference ? '総ダメージの差分' : '総ダメージ'}</div>
      <div className="gg-performance-grouped-grid">
        <div className="gg-performance-grouped-scale" aria-hidden="true">
          <span className="gg-performance-grouped-scale-width">{widestTick}</span>
          {ticks.map((tick, index) => <span className="gg-performance-grouped-tick" key={tick} style={tickStyle(tick)}>
            {tickLabels[index]}
          </span>)}
        </div>
        <div className="gg-performance-grouped-guides" aria-hidden="true">
          {ticks.map((tick) => <i key={tick} style={tickStyle(tick)}
            className={tick === 0 ? 'gg-performance-grouped-guide-zero' : undefined} />)}
        </div>
        <div className="gg-performance-grouped-clusters" style={groupStyle}>
          {groups.map((group) => <div className="gg-performance-grouped-cluster" key={group.resistance}
            role="group" aria-label={`術耐性 ${group.resistance}`}
            style={{ gridTemplateColumns: `repeat(${Math.max(1, columns.length)}, minmax(0, 1fr))` }}>
            {group.bars.map((bar) => {
              const value = bar.value
              const valid = isDamageValue(value)
              const label = `${bar.label}・術耐性 ${group.resistance}・${metricLabel} ${valid ? formatValue(value) : '—'}`
              return <div className="gg-performance-grouped-track" key={bar.id} role="img" aria-label={label}
                title={imageOutput ? label : undefined}>
                {valid ? value === 0
                  ? <span className="gg-performance-grouped-zero" style={{ ...tickStyle(0), backgroundColor: bar.color }} />
                  : <span className="gg-performance-grouped-segment" style={{
                    bottom: `${position(Math.min(0, value))}%`,
                    height: `${Math.abs(value) / axisSpan * 100}%`,
                    backgroundColor: bar.color,
                  }} />
                  : <span className="gg-performance-grouped-missing" style={tickStyle(0)}>—</span>}
              </div>
            })}
          </div>)}
        </div>
        <div className="gg-performance-grouped-resistances" style={groupStyle} aria-hidden="true">
          {resistances.map((resistance) => <span key={resistance}>{resistance}</span>)}
        </div>
        <div className="gg-performance-grouped-x-title">敵の術耐性</div>
      </div>
      {imageOutput && <GoldenglowPerformanceBarLegend vertical neutralLabels
        parts={columns.map((column) => ({ key: column.id, label: column.label, color: column.color }))}
        condition={conditionInLegend ? conditionLabel : undefined}
        ariaLabel="比較条件の凡例とグラフの条件" />}
    </div>
  </figure>
}
