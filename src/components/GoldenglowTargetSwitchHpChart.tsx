import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import type { HpComparisonDisplaySeries } from '../lib/goldenglowTargetSwitchHpComparison'
import { getHpChartValueAxis, type HpChartYAxisMode, type HpChartYAxisRange } from '../lib/goldenglowTargetSwitchHpAxis'
import {
  getHpDamageBreakdownComponents,
  getHpDamageBreakdownSegments,
  type HpComparisonBarMode,
  type HpDamageBreakdownSegment,
} from '../lib/goldenglowTargetSwitchHpBreakdown'
import { getModuleComparisonColors, getModuleColorKey } from '../lib/moduleColors'
import { GoldenglowDamagePatternDefs, GoldenglowDamagePatternSwatch, getGoldenglowDamagePatternFill } from './GoldenglowDamagePattern'
import './GoldenglowTargetSwitchHpChart.css'

export type HpChartGridStyle = 'none' | 'dashed' | 'solid'

interface GoldenglowTargetSwitchHpChartProps {
  series: readonly HpComparisonDisplaySeries[]
  minHp: number
  maxHp: number
  selectedHp: number | null
  onSelectHp: (hp: number) => void
  stale?: boolean
  digits?: number
  metric: 'total' | 'difference' | 'percent'
  baselineId: string
  imageOutput?: boolean
  chartKind?: 'line' | 'bar'
  barMode?: HpComparisonBarMode
  gridStyle?: HpChartGridStyle
  yAxisMode?: HpChartYAxisMode
  manualYAxisRange?: HpChartYAxisRange
  barHps?: readonly number[]
  hideBaseline?: boolean
  onPlotWidthChange?: (width: number) => void
}

interface GoldenglowTargetSwitchHpChartSvgProps {
  series: readonly HpComparisonDisplaySeries[]
  minHp: number
  maxHp: number
  metric: GoldenglowTargetSwitchHpChartProps['metric']
  digits?: number
  width: number
  height: number
  chartKind?: 'line' | 'bar'
  barMode?: HpComparisonBarMode
  gridStyle?: HpChartGridStyle
  yAxisMode?: HpChartYAxisMode
  manualYAxisRange?: HpChartYAxisRange
  barHps?: readonly number[]
  hideBaseline?: boolean
  baselineId?: string
}

interface HpChartContentProps extends GoldenglowTargetSwitchHpChartProps {
  plotDimensions?: { width: number; height: number }
}

const integerFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })
export function getHpComparisonSeriesStyles(series: readonly Pick<HpComparisonDisplaySeries, 'moduleType' | 'potential'>[]) {
  const colors = getModuleComparisonColors(series)
  return series.map(({ moduleType }, index) => {
    const key = getModuleColorKey(moduleType)
    return {
      color: colors[index],
      dashArray: key === 'none' ? '3 4' : key === 'X' ? undefined : key === 'Y' ? '8 4' : '8 3 2 3',
    }
  })
}

export function GoldenglowTargetSwitchHpChart(props: GoldenglowTargetSwitchHpChartProps) {
  return <HpChartContent {...props} />
}

export function GoldenglowTargetSwitchHpChartSvg({
  width, height, baselineId = '', ...props
}: GoldenglowTargetSwitchHpChartSvgProps) {
  return (
    <HpChartContent
      {...props}
      selectedHp={null}
      onSelectHp={() => undefined}
      baselineId={baselineId}
      imageOutput
      plotDimensions={{ width, height }}
    />
  )
}

function HpChartContent({
  series, minHp, maxHp, selectedHp, onSelectHp, stale = false, digits = 2, metric, baselineId, imageOutput = false,
  plotDimensions, chartKind = 'line', barMode = 'total', yAxisMode = 'zero', manualYAxisRange, barHps, hideBaseline = false, onPlotWidthChange,
  gridStyle = 'solid',
}: HpChartContentProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [measuredWidth, setWidth] = useState(640)
  const width = plotDimensions?.width ?? measuredWidth
  const titleId = useId()
  const descriptionId = useId()
  const selectionId = useId()
  const patternId = `gg-damage-chart-${useId()}`
  const plotClipId = `gg-hp-plot-${useId()}`
  const valueFormat = useMemo(() => new Intl.NumberFormat('ja-JP', {
    maximumFractionDigits: digits,
    signDisplay: metric === 'total' ? 'auto' : 'exceptZero',
  }), [digits, metric])
  const formatValue = (value: number | null | undefined) => (
    value == null || !Number.isFinite(value) ? '—' : `${valueFormat.format(value)}${metric === 'percent' ? '%' : ''}`
  )
  const metricLabel = metric === 'total' ? '総ダメージ' : metric === 'difference' ? 'ダメージ差' : '増加率 (%)'
  const activeBarMode = chartKind === 'bar' && metric === 'total' ? barMode : 'total'
  const isBreakdown = activeBarMode !== 'total'
  const isComposition = activeBarMode === 'composition'
  const axisLabel = isComposition ? '構成比 (%)' : metricLabel
  const percentageFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: digits })
  const formatComponent = (segment: HpDamageBreakdownSegment) => (
    `${formatValue(segment.damage)}${isComposition ? ` (${percentageFormat.format(segment.percentage)}%)` : ''}`
  )

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const measure = () => {
      const nextWidth = Math.round(frame.getBoundingClientRect().width)
      if (nextWidth > 0) setWidth(nextWidth)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  const hpLimit = Number.isFinite(maxHp) && maxHp > 0 ? maxHp : 1
  const hpStart = Number.isFinite(minHp) && minHp >= 0 && minHp <= hpLimit ? minHp : 0
  const hpSpan = hpLimit - hpStart
  const chartSeries = useMemo(() => {
    const styles = getHpComparisonSeriesStyles(series)
    return series.map((item, index) => ({
      ...item,
      style: styles[index],
      points: item.points.filter((point) => (
        Number.isFinite(point.enemyHp) && point.enemyHp > 0 && point.enemyHp >= hpStart && point.enemyHp <= hpLimit
      )).map((point) => ({
        ...point,
        value: point.value != null && Number.isFinite(point.value) && (metric !== 'total' || point.value >= 0)
          ? point.value : null,
        segments: activeBarMode === 'total' ? null : getHpDamageBreakdownSegments(point.damageBreakdown, activeBarMode),
      })).sort((left, right) => left.enemyHp - right.enemyHp),
    })).filter((item) => !hideBaseline || item.id !== baselineId)
  }, [series, hpStart, hpLimit, metric, hideBaseline, baselineId, activeBarMode])
  const components = getHpDamageBreakdownComponents(chartSeries)
  const visibleComponentKeys = new Set(components.map(({ key }) => key))
  const availableHps = [...new Set(chartSeries.flatMap((item) => (
    item.points.filter((point) => point.value !== null).map((point) => point.enemyHp)
  )))].sort((left, right) => left - right)
  const hpValues = [...new Set(chartSeries.flatMap((item) => item.points.map((point) => point.enemyHp)))].sort((left, right) => left - right)
  const categoryHps = [...new Set(barHps ?? hpValues)]
    .filter((hp) => Number.isFinite(hp) && hp > 0 && hp >= hpStart && hp <= hpLimit)
    .sort((left, right) => left - right)
  const plottedHps = chartKind === 'bar' ? categoryHps : hpValues
  const plottedHpSet = new Set(plottedHps)
  const selectableHps = chartKind === 'bar' ? availableHps.filter((hp) => plottedHpSet.has(hp)) : availableHps
  const selection = !imageOutput && selectedHp !== null && hpValues.includes(selectedHp) ? selectedHp : null
  const values = chartSeries.flatMap((item) => item.points.flatMap((point) => {
    if (point.value === null) return []
    if (isBreakdown) return point.segments ? [point.segments.at(-1)!.end] : []
    return [point.value]
  }))
  const { lowerLimit, upperLimit, valueStep, yTicks } = getHpChartValueAxis(values, {
    mode: chartKind === 'line' ? yAxisMode : 'zero',
    manualRange: manualYAxisRange,
    nonNegative: metric === 'total',
    composition: isComposition,
  })
  const tickPrecision = (chartKind === 'line' && yAxisMode === 'manual' ? [valueStep, lowerLimit, upperLimit] : [valueStep])
    .reduce((precision, value) => {
      const [coefficient, exponent = '0'] = String(value).split('e')
      return Math.max(precision, (coefficient.split('.')[1]?.length ?? 0) - Number(exponent))
    }, 0)
  const tickFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: Math.min(20, tickPrecision) })
  const formatYTick = (value: number) => `${tickFormat.format(value)}${isComposition ? '%' : ''}`
  const height = plotDimensions?.height ?? (imageOutput ? 480 : 340)
  const characterWidth = plotDimensions ? 6.8 : imageOutput ? 7.5 : 6.8
  const labelWidth = Math.max(...yTicks.map((tick) => formatYTick(tick).length)) * characterWidth
  const margin = {
    left: Math.max(plotDimensions ? 62 : imageOutput ? 56 : 48, Math.ceil(labelWidth + 12)),
    right: 15,
    top: plotDimensions ? 32 : 34,
    bottom: plotDimensions ? 28 : 50,
  }
  const plotRight = Math.max(margin.left + 1, width - margin.right)
  const plotBottom = height - margin.bottom
  const plotWidth = plotRight - margin.left
  useEffect(() => { onPlotWidthChange?.(plotWidth) }, [plotWidth, onPlotWidthChange])
  const plotHeight = plotBottom - margin.top
  const categoryWidth = plotWidth / Math.max(1, categoryHps.length)
  const x = (hp: number) => chartKind === 'bar'
    ? margin.left + (categoryHps.indexOf(hp) + 0.5) * categoryWidth
    : margin.left + (hpSpan > 0 ? (hp - hpStart) / hpSpan : 0.5) * plotWidth
  const y = (value: number) => plotBottom - (value - lowerLimit) / (upperLimit - lowerLimit) * plotHeight
  // The last label is right-aligned, so reserve its full width plus half
  // of the preceding centered label, including for billion-HP ranges.
  const xLabelWidth = integerFormat.format(hpLimit).length * characterWidth
  const xTickSpacing = Math.max(80, xLabelWidth * 1.5 + 12)
  const xTickCount = Math.max(2, Math.min(6, Math.floor(plotWidth / xTickSpacing) + 1))
  const compactHpFormat = new Intl.NumberFormat('ja-JP', { notation: 'compact', maximumFractionDigits: 1 })
  const categoryLabelWidth = Math.max(1, plotWidth / 2 - 12)
  const formatHpTick = (hp: number) => {
    const fullLabel = integerFormat.format(hp)
    return chartKind === 'bar' && fullLabel.length * characterWidth > categoryLabelWidth
      ? compactHpFormat.format(hp) : fullLabel
  }
  const barTicks: number[] = []
  if (chartKind === 'bar' && categoryHps.length) {
    const last = categoryHps.at(-1)!
    const lastLeft = x(last) - formatHpTick(last).length * characterWidth
    let previousRight = -Infinity
    // Reserve the final label, then retain only labels that fit at their actual positions.
    for (const [index, tick] of categoryHps.slice(0, -1).entries()) {
      const labelWidth = formatHpTick(tick).length * characterWidth
      const left = x(tick) - (index === 0 ? 0 : labelWidth / 2)
      const right = left + labelWidth
      if (left >= previousRight + 8 && right + 8 <= lastLeft) {
        barTicks.push(tick)
        previousRight = right
      }
    }
    barTicks.push(last)
  }
  const xTicks = chartKind === 'bar' ? barTicks : [...new Set(Array.from({ length: xTickCount }, (_, index) => (
    index === xTickCount - 1 ? hpLimit : Math.round(hpStart + index * hpSpan / (xTickCount - 1))
  )))].sort((left, right) => left - right)
  const barGap = Math.min(6, categoryWidth * 0.035)
  const groupWidth = Math.min(categoryWidth * 0.72, chartSeries.length * 36 + Math.max(0, chartSeries.length - 1) * barGap)
  const barWidth = Math.max(0, (groupWidth - Math.max(0, chartSeries.length - 1) * barGap) / Math.max(1, chartSeries.length))

  const selectFromChart = (event: MouseEvent<SVGSVGElement>) => {
    if (!selectableHps.length) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return
    const pointerX = (event.clientX - bounds.left) / bounds.width * width
    const pointerY = (event.clientY - bounds.top) / bounds.height * height
    if (pointerX < margin.left || pointerX > plotRight || pointerY < margin.top || pointerY > plotBottom) return
    const nearest = selectableHps.reduce((best, hp) => Math.abs(x(hp) - pointerX) < Math.abs(x(best) - pointerX) ? hp : best)
    onSelectHp(nearest)
  }

  const plot = (
    <svg
      className={`ggs-hp-chart-svg${plotDimensions ? ' ggs-hp-chart-svg--export' : ''}`}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      style={plotDimensions ? { height } : undefined}
      role="img"
      data-bar-mode={activeBarMode}
      data-grid-style={gridStyle}
      aria-labelledby={`${titleId} ${descriptionId}`}
      onClick={imageOutput ? undefined : selectFromChart}
    >
      <title id={titleId}>{`敵HPと${isComposition ? 'ダメージ構成比' : isBreakdown ? 'ダメージ内訳' : metricLabel}のMOD比較${chartKind === 'bar' ? '（棒グラフ）' : ''}`}</title>
      <desc id={descriptionId}>
        横軸は敵HP、縦軸は{axisLabel}。{chartSeries.length}種類のMODを比較しています。
        {chartKind === 'bar' && `${categoryHps.length}点のHPを表示しています。`}
        {isBreakdown && `各HPの棒は左から${chartSeries.map((item) => item.label).join('、')}。色はMODの種類と潜在、無地は通常攻撃、斜線は爆発${visibleComponentKeys.has('bodyDamage') ? '、点模様は本体攻撃' : ''}を表します。`}
        {isComposition && '各MODの同じHPでの合計を100%としています。合計がゼロの場合は0%です。'}
        {!imageOutput && '各値は下の敵HP選択欄で確認できます。'}
      </desc>
      <defs><clipPath id={plotClipId}>
        <rect x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} />
      </clipPath></defs>
      {isBreakdown && chartSeries.map((item, index) => (
        <GoldenglowDamagePatternDefs key={item.id} idPrefix={`${patternId}-${index}`} color={item.style.color} />
      ))}
      <text className="ggs-hp-chart-axis-title" x={margin.left} y={18}>{axisLabel}</text>
      {yTicks.map((tick, index) => (
        <g key={index}>
          {gridStyle !== 'none' && <line className={`ggs-hp-chart-grid${gridStyle === 'dashed' ? ' ggs-hp-chart-grid--dashed' : ''}${metric !== 'total' && Math.abs(tick) < valueStep / 2 ? ' ggs-hp-chart-zero' : ''}`} x1={margin.left} x2={plotRight} y1={y(tick)} y2={y(tick)} />}
          <text className="ggs-hp-chart-tick" x={margin.left - 8} y={y(tick) + 4} textAnchor="end">{formatYTick(tick)}</text>
        </g>
      ))}
      <path className="ggs-hp-chart-axis" d={`M${margin.left},${margin.top}V${plotBottom}H${plotRight}`} />
      {xTicks.map((tick, index) => (
        <g key={tick}>
          <line className="ggs-hp-chart-axis" x1={x(tick)} x2={x(tick)} y1={plotBottom} y2={plotBottom + 5} />
          <text className="ggs-hp-chart-tick" x={x(tick)} y={plotBottom + 21}
            textAnchor={chartKind === 'bar'
              ? categoryHps.length === 1 ? 'middle' : tick === categoryHps[0] ? 'start' : tick === categoryHps.at(-1) ? 'end' : 'middle'
              : xTicks.length === 1 ? 'middle' : index === 0 ? 'start' : index === xTicks.length - 1 ? 'end' : 'middle'}
          >
            {formatHpTick(tick)}
            {chartKind === 'bar' && <title>{`敵HP ${integerFormat.format(tick)}`}</title>}
          </text>
        </g>
      ))}
      {!plotDimensions && <text className="ggs-hp-chart-axis-title" x={(margin.left + plotRight) / 2} y={height - 6} textAnchor="middle">敵HP</text>}
      {selection !== null && plottedHpSet.has(selection) && (chartKind === 'bar'
        ? <rect className="ggs-hp-chart-selected-group" x={x(selection) - categoryWidth / 2 + 2} y={margin.top} width={Math.max(0, categoryWidth - 4)} height={plotHeight} />
        : <line className="ggs-hp-chart-guide" x1={x(selection)} x2={x(selection)} y1={margin.top} y2={plotBottom} />
      )}
      {chartSeries.map((item, seriesIndex) => {
        if (chartKind === 'bar') return (
          <g key={item.id} style={{ color: item.style.color }}>
            {item.points.map((point) => {
              if (point.value === null || !plottedHpSet.has(point.enemyHp)) return null
              const barX = x(point.enemyHp) - groupWidth / 2 + seriesIndex * (barWidth + barGap)
              if (isBreakdown) {
                if (!point.segments) return null
                const detail = `${item.label}・敵HP ${integerFormat.format(point.enemyHp)}・総ダメージ ${formatValue(point.value)}・${point.segments.filter(({ key }) => visibleComponentKeys.has(key)).map((segment) => `${segment.label} ${formatComponent(segment)}`).join('・')}`
                return (
                  <g key={point.enemyHp} data-series-id={item.id} data-enemy-hp={point.enemyHp}>
                    {point.segments.filter(({ key }) => visibleComponentKeys.has(key)).map((segment) => (
                      <rect
                        key={segment.key}
                        className="ggs-hp-chart-bar"
                        data-component={segment.key}
                        style={{ fill: getGoldenglowDamagePatternFill(segment.key, `${patternId}-${seriesIndex}`, item.style.color) }}
                        x={barX}
                        y={y(segment.end)}
                        width={barWidth}
                        height={Math.max(0, y(segment.start) - y(segment.end))}
                      >
                        <title>{detail}</title>
                      </rect>
                    ))}
                  </g>
                )
              }
              return (
                <rect
                  key={point.enemyHp}
                  className="ggs-hp-chart-bar"
                  x={barX}
                  y={Math.min(y(0), y(point.value))}
                  width={barWidth}
                  height={Math.abs(y(point.value) - y(0))}
                >
                  <title>{`${item.label}・敵HP ${integerFormat.format(point.enemyHp)}・${metricLabel} ${formatValue(point.value)}`}</title>
                </rect>
              )
            })}
          </g>
        )
        let connected = false
        const path = item.points.map((point) => {
          if (point.value === null) { connected = false; return '' }
          const command = `${connected ? 'L' : 'M'}${x(point.enemyHp)},${y(point.value)}`
          connected = true
          return command
        }).join(' ')
        return (
          <g key={item.id} style={{ color: item.style.color }} clipPath={yAxisMode === 'manual' ? `url(#${plotClipId})` : undefined}>
            {path.trim() && <path className="ggs-hp-chart-line" d={path} strokeDasharray={item.style.dashArray} />}
            {item.points.map((point) => point.value === null ? null : (
              <circle
                key={point.enemyHp}
                className={`ggs-hp-chart-point${point.enemyHp === selection ? ' ggs-hp-chart-point--selected' : ''}`}
                cx={x(point.enemyHp)} cy={y(point.value)} r={point.enemyHp === selection ? 4.5 : 2.5}
              >
                <title>{`${item.label}・敵HP ${integerFormat.format(point.enemyHp)}・${metricLabel} ${formatValue(point.value)}`}</title>
              </circle>
            ))}
          </g>
        )
      })}
    </svg>
  )

  if (plotDimensions) return plot

  return (
    <figure className={`ggs-hp-chart${stale && !imageOutput ? ' ggs-hp-chart--stale' : ''}${imageOutput ? ' ggs-hp-chart--image' : ''}`}>
      {isBreakdown && <ul className="ggs-hp-chart-legend ggs-hp-chart-component-legend" aria-label="ダメージ内訳">
        {components.map((component) => <li key={component.key}>
          <GoldenglowDamagePatternSwatch componentKey={component.key} />
          <span>{component.label}</span>
        </li>)}
      </ul>}
      <ul className="ggs-hp-chart-legend" aria-label="比較するMOD">
        {chartSeries.map((item) => (
          <li key={item.id}>
            <svg width="24" height="12" aria-hidden="true" style={{ color: item.style.color }}>
              {chartKind === 'bar'
                ? <rect x="7" y="1" width="10" height="10" fill="currentColor" />
                : <line x1="0" x2="24" y1="6" y2="6" stroke="currentColor" strokeWidth="2" strokeDasharray={item.style.dashArray} />
              }
            </svg>
            <span>{item.label}{metric !== 'total' && item.id === baselineId ? '（基準）' : ''}</span>
          </li>
        ))}
      </ul>
      <div ref={frameRef} className="ggs-hp-chart-frame">
        {plot}
      </div>
      {!imageOutput && <figcaption className="ggs-hp-chart-readout">
        <label htmlFor={selectionId}>
          <span>敵HP</span>
          <select id={selectionId} value={selection ?? ''} disabled={!availableHps.length} onChange={(event) => onSelectHp(Number(event.target.value))}>
            <option value="" disabled>選択</option>
            {hpValues.map((hp) => <option key={hp} value={hp}>{integerFormat.format(hp)}</option>)}
          </select>
        </label>
        <div className="ggs-hp-chart-values" aria-live="polite" aria-atomic="true">
          {chartSeries.map((item) => {
            const point = item.points.find((point) => point.enemyHp === selection)
            return (
              <span className="ggs-hp-chart-damage" key={item.id}>
                <span>{item.label}</span>
                <strong style={{ color: item.style.color }}>{isBreakdown && '総ダメージ '}{formatValue(point?.value)}</strong>
                {isBreakdown && <span className="ggs-hp-chart-component-values">
                  {components.map((component) => {
                    const segment = point?.value != null ? point.segments?.find(({ key }) => key === component.key) : undefined
                    return <span key={component.key}>
                      <GoldenglowDamagePatternSwatch className="ggs-hp-chart-component-swatch" componentKey={component.key} color={item.style.color} width={14} height={12} />
                      <span>{component.label}</span>
                      <b>{segment ? formatComponent(segment) : '—'}</b>
                    </span>
                  })}
                </span>}
              </span>
            )
          })}
        </div>
      </figcaption>}
    </figure>
  )
}
