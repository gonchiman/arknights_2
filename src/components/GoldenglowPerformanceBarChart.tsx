import { useId, type CSSProperties } from 'react'
import type { GoldenglowPerformanceChartColumn } from './goldenglowPerformanceChartTypes'
import './GoldenglowPerformanceBarChart.css'

export type GoldenglowBarVariant = 'axis' | 'label' | 'detail'
export type GoldenglowBarOrientation = 'horizontal' | 'vertical'

const DAMAGE_PARTS = [
  { key: 'expectedBodyDamage', label: '本体', color: '#596b8d' },
  { key: 'expectedDroneNormalDamage', label: '浮遊ユニット', color: '#3e7c88' },
  { key: 'expectedExplosionDamage', label: '爆発', color: '#b77945' },
] as const

export function GoldenglowPerformanceBarChart({
  columns,
  metricLabel,
  resistance,
  stacked,
  variant = 'axis',
  orientation = 'vertical',
  conditionLabel,
  formatValue,
  minHeight,
  difference = false,
  integerTicks = false,
}: {
  columns: readonly GoldenglowPerformanceChartColumn[]
  metricLabel: string
  resistance: number
  stacked: boolean
  variant?: GoldenglowBarVariant
  orientation?: GoldenglowBarOrientation
  conditionLabel?: string
  formatValue: (value: number) => string
  minHeight?: number
  difference?: boolean
  integerTicks?: boolean
}) {
  const titleId = useId()
  const vertical = orientation === 'vertical'
  const isDamageValue = (value: number | null | undefined): value is number => (
    typeof value === 'number' && Number.isFinite(value) && (difference || value >= 0)
  )
  const rows = columns.map((column) => ({
    ...column,
    value: column.values.find((value) => value.resistance === resistance),
  }))
  const extentValues = rows.flatMap((row) => {
    const total = row.value?.expectedTotalDamage
    if (!isDamageValue(total)) return []
    const parts = DAMAGE_PARTS.map((part) => row.value?.[part.key])
    if (!difference || !stacked || !parts.every(isDamageValue)) return [total]
    // Opposite changes cancel in the total, but both sides of the stack must fit.
    return [
      total,
      parts.reduce((sum, value) => sum + Math.min(0, value), 0),
      parts.reduce((sum, value) => sum + Math.max(0, value), 0),
    ]
  })
  const minimum = Math.min(0, ...extentValues)
  const maximum = Math.max(0, ...extentValues)
  // Round the axis up without rounding the values used to draw either bar type.
  const magnitude = maximum > 0 ? 10 ** Math.floor(Math.log10(maximum)) : 1
  const scale = maximum > 0 ? Math.max(integerTicks ? 1 : 0, Math.ceil(maximum / magnitude) * magnitude) : 1
  const hasExtent = minimum < 0 || maximum > 0
  const step = (difference ? (hasExtent ? maximum - minimum : 2) : scale) / 4
  const stepMagnitude = 10 ** Math.floor(Math.log10(step))
  const tickStep = Math.max(integerTicks ? 1 : 0,
    [1, 2, 5, 10].find((value) => value * stepMagnitude >= step)! * stepMagnitude)
  const firstTick = difference ? (hasExtent ? Math.floor(minimum / tickStep) : -1 / tickStep) : 0
  const lastTick = difference ? (hasExtent ? Math.ceil(maximum / tickStep) : 1 / tickStep) : scale / tickStep
  const axisMinimum = firstTick * tickStep
  const axisMaximum = lastTick * tickStep
  const axisSpan = axisMaximum - axisMinimum
  const ticks = difference
    ? (hasExtent ? Array.from({ length: lastTick - firstTick + 1 }, (_, index) => (firstTick + index) * tickStep) : [0])
    : (maximum > 0
      ? [...Array.from({ length: Math.ceil(scale / tickStep) }, (_, index) => index * tickStep), scale]
      : [0])
  const endTicks = hasExtent ? [...new Set([axisMinimum, 0, axisMaximum])] : [0]
  const compactTicks = difference ? endTicks : maximum > 0
    ? [...new Set([0, integerTicks ? Math.round(scale / 2) : scale / 2, scale])]
    : [0]
  const displayValue = (value: number | null | undefined) => isDamageValue(value) ? formatValue(value) : '—'
  const position = (value: number) => (value - axisMinimum) / axisSpan * 100
  const tickStyle = (tick: number) => ({ '--gg-bar-tick-position': `${position(tick)}%` }) as CSSProperties
  const segmentStyle = (start: number, end: number, color: string): CSSProperties => ({
    ...(vertical ? {
      bottom: `${position(Math.min(start, end))}%`,
      height: `${Math.abs(end - start) / axisSpan * 100}%`,
    } : {
      left: `${position(Math.min(start, end))}%`,
      width: `${Math.abs(end - start) / axisSpan * 100}%`,
    }),
    backgroundColor: color,
  })
  const renderTicks = (values: number[], compact: boolean) => <div
    className={`gg-performance-bar-ticks${compact ? ' gg-performance-bar-ticks-compact' : ''}`}>
    {values.map((tick) => <span key={tick} style={tickStyle(tick)}
      className={`${tick === axisMinimum ? 'gg-performance-bar-tick-start' : tick === axisMaximum ? 'gg-performance-bar-tick-end' : ''}${tick === 0 ? ' gg-performance-bar-tick-zero' : ''}`}
    >{formatValue(tick)}</span>)}
  </div>

  return (
    <figure className={`gg-performance-bar-chart gg-performance-bar-variant-${variant}${vertical ? ' gg-performance-bar-vertical' : ''}${difference ? ' gg-performance-bar-difference' : ''}`} aria-labelledby={titleId} style={{ minHeight }}>
      <figcaption className="gg-performance-bar-caption">
        <div className="gg-performance-bar-heading">
          <strong id={titleId}>{metricLabel}{stacked ? 'の内訳' : '比較'}</strong>
          <span>{conditionLabel && `${conditionLabel} / `}敵の術耐性 {resistance}</span>
          {difference && stacked && <span>内訳ごとの増減を{vertical ? '上下' : '左右'}に表示。合計は差し引き後の値。</span>}
        </div>
        {stacked && <ul className="gg-performance-bar-legend" aria-label="ダメージ内訳の凡例">
          {DAMAGE_PARTS.map((part) => <li key={part.key}>
            <i style={{ backgroundColor: part.color }} aria-hidden="true" />
            <span>{part.label}</span>
          </li>)}
        </ul>}
      </figcaption>
      <div className={vertical ? 'gg-performance-vertical-plot' : 'gg-performance-bar-plot'}>
        <div className={vertical ? 'gg-performance-vertical-grid' : 'gg-performance-bar-rows'}
          style={vertical ? {
            gridTemplateColumns: `max-content repeat(${Math.max(1, rows.length)}, minmax(0, 1fr))`,
            gridTemplateRows: `auto minmax(160px, 1fr) auto${variant === 'detail' && stacked ? ' auto' : ''}`,
          } : undefined}>
          {vertical && <>
            <div className="gg-performance-vertical-scale" aria-hidden="true">
              {ticks.map((tick) => <span key={tick} style={tickStyle(tick)}>{formatValue(tick)}</span>)}
            </div>
            <div className="gg-performance-vertical-guides" aria-hidden="true">
              {(variant === 'axis' ? ticks : [0]).map((tick) => <i key={tick} style={tickStyle(tick)}
                className={tick === 0 ? 'gg-performance-vertical-guide-zero' : undefined} />)}
            </div>
          </>}
          {!vertical && variant === 'axis' && rows.length > 0 && <div className="gg-performance-bar-guides" aria-hidden="true"
            style={{ gridRow: `1 / span ${rows.length}` }}>
            {ticks.map((tick) => <i key={tick} style={tickStyle(tick)}
              className={difference && tick === 0 ? 'gg-performance-bar-guide-zero' : undefined} />)}
          </div>}
          {rows.map((row, index) => {
            const total = row.value?.expectedTotalDamage
            const parts = DAMAGE_PARTS.map((part) => ({ ...part, value: row.value?.[part.key] }))
            const hasTotal = isDamageValue(total)
            const hasParts = parts.every((part) => isDamageValue(part.value))
            const description = `${row.label}・術耐性 ${resistance}・${metricLabel} ${displayValue(total)}`
              + (stacked ? `・${parts.map((part) => `${part.label} ${displayValue(part.value)}`).join('・')}` : '')
            let positiveEnd = 0
            let negativeEnd = 0

            return (
              <div className={vertical ? 'gg-performance-vertical-column' : 'gg-performance-bar-row'} key={row.id}
                style={vertical ? { gridColumn: index + 2 } : { gridRow: index + 1 }}>
                <span className={vertical ? 'gg-performance-vertical-label' : 'gg-performance-bar-label'}>{row.label}</span>
                <div className={vertical ? 'gg-performance-vertical-track' : 'gg-performance-bar-track'} role="img" aria-label={description} title={description}>
                  {hasTotal && (stacked
                    ? hasParts && parts.map((part) => {
                      const value = part.value ?? 0
                      const start = value >= 0 ? positiveEnd : negativeEnd
                      const end = start + value
                      if (value >= 0) positiveEnd = end
                      else negativeEnd = end
                      return <span
                        key={part.key}
                        className={vertical ? 'gg-performance-vertical-segment' : 'gg-performance-bar-segment'}
                        style={difference || vertical ? segmentStyle(start, end, part.color)
                          : { width: `${value / scale * 100}%`, backgroundColor: part.color }}
                        title={`${row.label}・${part.label} ${displayValue(part.value)}`}
                      />
                    })
                    : <span className={vertical ? 'gg-performance-vertical-segment' : 'gg-performance-bar-segment'}
                      style={difference || vertical ? segmentStyle(0, total, row.color)
                        : { width: `${total / scale * 100}%`, backgroundColor: row.color }} />)}
                  {difference && <i className={vertical ? 'gg-performance-vertical-zero' : 'gg-performance-bar-zero'} style={tickStyle(0)} aria-hidden="true" />}
                </div>
                <strong className={vertical ? 'gg-performance-vertical-total' : 'gg-performance-bar-total'}>{displayValue(total)}</strong>
                {variant === 'detail' && stacked && <dl className="gg-performance-bar-parts" aria-label={`${row.label}のダメージ内訳`}>
                  {parts.map((part) => <div key={part.key}>
                    <dt><i style={{ backgroundColor: part.color }} aria-hidden="true" />{part.label}</dt>
                    <dd>{displayValue(part.value)}</dd>
                  </div>)}
                </dl>}
              </div>
            )
          })}
          {!vertical && <div className="gg-performance-bar-scale" aria-hidden="true">
            {variant === 'axis' ? <>{renderTicks(ticks, false)}{renderTicks(compactTicks, true)}</>
              : renderTicks(endTicks, false)}
          </div>}
        </div>
      </div>
    </figure>
  )
}
