import { useLayoutEffect, useId, useMemo, useRef, useState } from 'react'
import { placeChartEndLabelsInside } from '../lib/comparisonChartEndLabels'
import { placeChartLegend } from '../lib/chartLegendPlacement'
import { ComparisonChartImageLegend, useImageChartLegend } from './ComparisonChartImageLegend'
import { useChartImageHeading } from './useChartImageHeading'
import './ComparisonChart.css'

export interface ComparisonChartPoint {
  x: number
  value: number | null
}

export interface ComparisonChartSeries {
  id: string
  label: string
  color: string
  shortLabel?: string
  detailLabel?: string
  points: ComparisonChartPoint[]
}

export interface ComparisonChartProps {
  axisLabel: string
  metricLabel: string
  currentX?: number
  showPoints?: boolean
  showEndLabels?: boolean
  lineStyle?: 'solid' | 'dashed'
  imageOutput?: boolean
  minHeight?: number
  formatValue?: (value: number) => string
  formatAxisValue?: (value: number) => string
  captionDetail?: string
  valueDescription?: string
  emphasizeZero?: boolean
  integerYTicks?: boolean
  fitYAxisLabels?: boolean
  series: ComparisonChartSeries[]
}

interface NormalizedSeries extends ComparisonChartSeries {
  points: ComparisonChartPoint[]
  hasValues: boolean
}

interface NumericScale {
  minimum: number
  maximum: number
  ticks: number[]
}

const SERIES_DASH_PATTERNS = [
  undefined,
  '7 4',
  '2 3',
  '10 3 2 3',
  '4 3 1 3',
  '12 3 4 3',
] as const
const DESIGN_DASH_PATTERNS = [undefined, '12 6', '3 5', '12 4 2 4', '6 3 2 3', '16 4 6 4'] as const
const END_LABEL_SWATCH_WIDTH = 42
const END_LABEL_SWATCH_SPACE = END_LABEL_SWATCH_WIDTH + 8
const NUMBER_FORMATTER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })

export function ComparisonChart({
  axisLabel,
  metricLabel,
  currentX = Number.NaN,
  showPoints = true,
  showEndLabels = false,
  lineStyle,
  imageOutput = false,
  minHeight,
  formatValue = formatNumber,
  formatAxisValue = formatValue,
  captionDetail,
  valueDescription,
  emphasizeZero = false,
  integerYTicks = false,
  fitYAxisLabels = false,
  series,
}: ComparisonChartProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const captionRef = useRef<HTMLElement>(null)
  const [chartWidth, setChartWidth] = useState(720)
  const [captionHeight, setCaptionHeight] = useState(0)
  const [endLabelMetrics, setEndLabelMetrics] = useState<Record<string, { width: number; titleWidth: number }>>({})
  const titleId = useId()
  const descriptionId = useId()

  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return

    const updateWidth = () => {
      const nextWidth = Math.round((frame.querySelector('svg') ?? frame).getBoundingClientRect().width)
      if (nextWidth > 0) setChartWidth(Math.max(240, nextWidth))
      setCaptionHeight(captionRef.current?.getBoundingClientRect().height ?? 0)
    }

    updateWidth()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth)
      return () => window.removeEventListener('resize', updateWidth)
    }

    const observer = new ResizeObserver(updateWidth)
    observer.observe(frame)
    if (captionRef.current) observer.observe(captionRef.current)
    return () => observer.disconnect()
  }, [])

  const normalizedSeries = useMemo<NormalizedSeries[]>(() => series.map((item) => {
    const points = item.points
      .filter((point) => Number.isFinite(point.x))
      .map((point) => ({
        x: point.x,
        value: point.value !== null && Number.isFinite(point.value) ? point.value : null,
      }))
      .sort((a, b) => a.x - b.x)

    return {
      ...item,
      points,
      hasValues: points.some((point) => point.value !== null),
    }
  }), [series])

  const xValues = normalizedSeries.flatMap((item) => item.points.map((point) => point.x))
  if (Number.isFinite(currentX)) xValues.push(currentX)
  const xScale = createXScale(xValues)
  const yScale = createYScale(normalizedSeries.flatMap((item) => item.points.flatMap((point) => (
    point.value === null ? [] : [point.value]
  ))), integerYTicks)
  const hasValues = normalizedSeries.some((item) => item.hasValues)
  const availableSeries = normalizedSeries.filter((item) => item.hasValues)
  const { headingRef, titleRef: headingTitleRef, conditionInLegend } = useChartImageHeading(
    imageOutput && hasValues, metricLabel, captionDetail,
  )
  const dashPatterns = lineStyle === 'dashed' ? DESIGN_DASH_PATTERNS : SERIES_DASH_PATTERNS
  const lineWidth = lineStyle ? 2.5 : 2
  const imageLegendItems = useMemo(() => normalizedSeries.map((item, index) => ({
    id: item.id,
    label: `${item.label}${item.hasValues ? '' : '（データなし）'}`,
    color: item.color,
    dashPattern: lineStyle === 'solid' ? undefined : dashPatterns[index % dashPatterns.length],
    lineWidth,
    hasValues: item.hasValues,
  })), [normalizedSeries, lineStyle, dashPatterns, lineWidth])
  const missingLegendItems = useMemo(() => imageLegendItems.filter((item) => !item.hasValues), [imageLegendItems])
  const fullImageLegend = useImageChartLegend((imageOutput || showEndLabels) && hasValues,
    imageLegendItems, chartWidth - 16, frameRef, conditionInLegend ? captionDetail : undefined, imageOutput ? 15 : 10)
  const conditionImageLegend = useImageChartLegend(imageOutput && showEndLabels && hasValues
    && (conditionInLegend || missingLegendItems.length > 0), missingLegendItems, chartWidth - 16, frameRef,
    conditionInLegend ? captionDetail : undefined)
  const labelFontSize = imageOutput ? 15 : 11
  const labelDetailSize = imageOutput ? 13 : 10
  const labelLineGap = imageOutput ? 18 : 14
  useLayoutEffect(() => {
    if (!showEndLabels) return
    let cancelled = false
    const measure = () => {
      if (cancelled || !frameRef.current) return
      const context = document.createElement('canvas').getContext('2d')
      if (!context) return
      const family = getComputedStyle(frameRef.current).fontFamily
      const metrics: Record<string, { width: number; titleWidth: number }> = {}
      for (const item of normalizedSeries) {
        context.font = `700 ${labelFontSize}px ${family}`
        const titleWidth = context.measureText(item.shortLabel ?? item.label).width
        context.font = `${labelDetailSize}px ${family}`
        metrics[item.id] = { titleWidth,
          width: Math.ceil(Math.max(titleWidth + END_LABEL_SWATCH_SPACE, context.measureText(item.detailLabel ?? '').width)) + 8,
        }
      }
      setEndLabelMetrics((current) => JSON.stringify(current) === JSON.stringify(metrics) ? current : metrics)
    }
    measure()
    void document.fonts.ready.then(measure)
    document.fonts.addEventListener('loadingdone', measure)
    return () => {
      cancelled = true
      document.fonts.removeEventListener('loadingdone', measure)
    }
  }, [showEndLabels, normalizedSeries, labelFontSize, labelDetailSize])

  const compact = chartWidth < 520
  const requestedHeight = minHeight === undefined
    ? imageOutput ? compact ? 310 : 360 : compact ? 260 : 300
    : Math.max(160, minHeight - captionHeight - (imageOutput ? 48 : 5))
  const margin = imageOutput
    ? { top: 20, right: 16, bottom: 56, left: 78 }
    : compact
    ? { top: 34, right: 14, bottom: 50, left: 58 }
    : { top: 36, right: 20, bottom: 52, left: 68 }
  if (emphasizeZero || fitYAxisLabels) {
    margin.left = Math.max(margin.left, ...yScale.ticks.map((tick) => formatValue(tick).length * (imageOutput ? 6.5 : 5.5) + 30))
  }
  // The axis title must fit even when a requested export is very short.
  const minimumChartHeight = Math.max(
    160,
    imageOutput ? margin.top + margin.bottom + estimateLabelWidth(metricLabel, 12) + 16 : 0,
  )
  const baseChartHeight = Math.max(requestedHeight, minimumChartHeight)
  const plotLeft = margin.left
  const plotRight = chartWidth - margin.right
  const plotTop = margin.top
  const plotWidth = Math.max(1, plotRight - plotLeft)
  const getX = (value: number) => plotLeft
    + ((value - xScale.minimum) / (xScale.maximum - xScale.minimum)) * plotWidth
  const basePlotBottom = baseChartHeight - margin.bottom
  const getBaseY = (value: number) => basePlotBottom
    - ((value - yScale.minimum) / (yScale.maximum - yScale.minimum)) * Math.max(1, basePlotBottom - plotTop)
  const plotLines = [
    ...normalizedSeries.map((item) => item.points.map((point) => point.value === null ? null : { x: getX(point.x), y: getBaseY(point.value) })),
    ...(Number.isFinite(currentX) ? [[{ x: getX(currentX), y: plotTop }, { x: getX(currentX), y: basePlotBottom }]] : []),
    ...(emphasizeZero ? [[{ x: plotLeft, y: getBaseY(0) }, { x: plotRight, y: getBaseY(0) }]] : []),
  ]
  const endpoints = showEndLabels ? availableSeries.flatMap((item) => {
    const point = item.points.slice().reverse().find((point) => point.value !== null)
    return point && point.value !== null ? [{ item, point, x: getX(point.x), y: getBaseY(point.value) }] : []
  }) : []
  let endLabelPlacement = showEndLabels ? placeChartEndLabelsInside({
    plot: { x: plotLeft, y: plotTop, width: plotWidth, height: basePlotBottom - plotTop },
    labels: endpoints.map(({ item, x, y }) => ({ id: item.id, x, y,
      width: endLabelMetrics[item.id]?.width ?? Math.max(estimateLabelWidth(item.shortLabel ?? item.label, labelFontSize) + END_LABEL_SWATCH_SPACE,
        estimateLabelWidth(item.detailLabel ?? '', labelDetailSize)) + 8,
      height: labelFontSize + 8 + (item.detailLabel ? labelLineGap : 0),
    })),
    lines: plotLines,
    inset: 24,
    clearance: 6,
    gap: 5,
    maxDisplacement: imageOutput ? 180 : 140,
  }) : null
  const leaders = endLabelPlacement?.map((label) => {
    const endpoint = endpoints.find(({ item }) => item.id === label.id)!
    return [{ x: endpoint.x, y: endpoint.y }, { x: label.x + label.width + 3, y: label.y + label.height / 2 }]
  }) ?? []
  // The leader for a short/missing-ended series must not pass through another name.
  if (endLabelPlacement?.some((label, index) => !placeChartLegend({
    plot: label, legend: label, inset: 0, clearance: 2,
    lines: leaders.filter((_, leaderIndex) => leaderIndex !== index),
  }))) endLabelPlacement = null
  let useEndLabels = endLabelPlacement !== null && endpoints.length > 0
  let imageLegend = useEndLabels ? conditionImageLegend : fullImageLegend
  // Test the full plot before reserving any outside-legend space. This keeps fallback stable.
  const placeLegend = (legend: typeof fullImageLegend, includeEndLabels: boolean) => legend ? placeChartLegend({
    plot: { x: plotLeft, y: plotTop, width: plotWidth, height: basePlotBottom - plotTop },
    legend,
    lines: includeEndLabels ? [...plotLines, ...leaders] : plotLines,
    obstacles: includeEndLabels ? endLabelPlacement ?? [] : [],
  }) : null
  let imageLegendPlacement = placeLegend(imageLegend, useEndLabels)
  if (useEndLabels && imageLegend && !imageLegendPlacement) {
    // Put all names and conditions together when the condition box needs outside space.
    // Reserving that space before drawing prevents stale endpoint coordinates and
    // repeated size expansion when the chart frame enforces an aspect ratio.
    useEndLabels = false
    endLabelPlacement = null
    imageLegend = fullImageLegend
    imageLegendPlacement = placeLegend(imageLegend, false)
  }
  const labelPositions = new Map((endLabelPlacement ?? []).map((label) => [label.id, label]))
  const autoImageLegend = hasValues && (imageOutput || (showEndLabels && !useEndLabels))
  const outsideLegendHeight = imageLegend && !imageLegendPlacement ? imageLegend.height + 12 : 0
  const chartHeight = Math.max(baseChartHeight, minimumChartHeight + outsideLegendHeight)
  const plotBottom = chartHeight - margin.bottom - outsideLegendHeight
  const plotHeight = Math.max(1, plotBottom - plotTop)
  const getY = (value: number) => plotBottom
    - ((value - yScale.minimum) / (yScale.maximum - yScale.minimum)) * plotHeight
  const currentPosition = Number.isFinite(currentX)
    ? clamp(getX(currentX), plotLeft, plotRight)
    : null
  const currentText = Number.isFinite(currentX) ? `現在 ${formatAxisValue(currentX)}` : ''
  const currentLabelWidth = Math.max(60, currentText.length * 8 + 14)
  const currentLabelX = currentPosition === null
    ? 0
    : clamp(currentPosition - currentLabelWidth / 2, plotLeft, plotRight - currentLabelWidth)
  const description = hasValues
    ? `${axisLabel}を変えたときの${metricLabel}を、${normalizedSeries.filter((item) => item.hasValues).map((item) => item.label).join('、')}について示します。${valueDescription ?? '正確な値は数値表で確認できます。'}`
    : `${axisLabel}別の${metricLabel}を表示できる系列データがありません。`

  return (
    <figure className={`build-comparison-chart${showEndLabels ? ' build-comparison-chart--end-labels' : ''}${lineStyle ? ' build-comparison-chart--styled' : ''}`} style={{ minHeight }}
      data-end-label-placement={showEndLabels ? useEndLabels ? 'inside' : 'legend' : undefined}>
      <figcaption className="build-comparison-chart-caption" ref={captionRef}>
        <div className={`build-comparison-chart-heading${imageOutput && hasValues ? ' build-comparison-chart-heading-inline' : ''}`} ref={headingRef}>
          <strong><span ref={headingTitleRef}>{metricLabel}{imageOutput ? '' : '推移'}</span></strong>
          {captionDetail && !conditionInLegend && <p className="build-comparison-chart-caption-detail">{captionDetail}</p>}
        </div>
        {!autoImageLegend && (!showEndLabels || normalizedSeries.some((item) => !item.hasValues)) && <ul className="build-comparison-chart-legend" aria-label="比較系列の凡例">
          {normalizedSeries.map((item, index) => {
            if (showEndLabels && item.hasValues) return null
            const dashPattern = lineStyle === 'solid' ? undefined : dashPatterns[index % dashPatterns.length]
            return (
              <li className="build-comparison-chart-legend-item" key={`${item.id}-${index}`}>
                <svg
                  className="build-comparison-chart-legend-swatch"
                  viewBox={lineStyle ? '0 0 44 6' : '0 0 24 6'}
                  style={lineStyle ? { width: 44, flexBasis: 44 } : undefined}
                  aria-hidden="true"
                >
                  <line
                    x1="1"
                    x2={lineStyle ? 43 : 23}
                    y1="3"
                    y2="3"
                    stroke={item.color}
                    strokeDasharray={dashPattern}
                    strokeWidth={lineWidth}
                    strokeLinecap={lineStyle ? 'round' : undefined}
                    vectorEffect={lineStyle ? 'non-scaling-stroke' : undefined}
                  />
                </svg>
                <span>{item.label}{item.hasValues ? '' : '（データなし）'}</span>
              </li>
            )
          })}
        </ul>}
      </figcaption>

      <div className="build-comparison-chart-frame" ref={frameRef}>
        <svg
          className="build-comparison-chart-svg"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          width="100%"
          height={chartHeight}
          role="img"
          aria-labelledby={`${titleId} ${descriptionId}`}
        >
          <title id={titleId}>{axisLabel}別の{metricLabel}比較</title>
          <desc id={descriptionId}>{description}</desc>

          {yScale.ticks.map((tick) => {
            const y = getY(tick)
            return (
              <g key={`y-${tick}`}>
                <line
                  className={`build-comparison-chart-grid${emphasizeZero && tick === 0 ? ' build-comparison-chart-zero' : ''}`}
                  x1={plotLeft}
                  x2={plotRight}
                  y1={y}
                  y2={y}
                />
                <text
                  className="build-comparison-chart-tick"
                  x={plotLeft - 8}
                  y={y + 3}
                  textAnchor="end"
                >
                  {formatValue(tick)}
                </text>
              </g>
            )
          })}

          {lineStyle ? <path className="build-comparison-chart-axis"
            d={`M ${plotLeft} ${plotTop} V ${plotBottom} H ${plotRight}`} /> : <rect
            className="build-comparison-chart-axis"
            x={plotLeft}
            y={plotTop}
            width={plotWidth}
            height={plotHeight}
          />}

          {currentPosition !== null && (
            <g className="build-comparison-chart-current">
              <line
                className="build-comparison-chart-current-line"
                x1={currentPosition}
                x2={currentPosition}
                y1={plotTop}
                y2={plotBottom}
              />
              <rect
                className="build-comparison-chart-current-label-bg"
                x={currentLabelX}
                y={6}
                width={currentLabelWidth}
                height={20}
              />
              <text
                className="build-comparison-chart-current-label"
                x={currentLabelX + currentLabelWidth / 2}
                y={20}
                textAnchor="middle"
              >
                {currentText}
              </text>
            </g>
          )}

          {normalizedSeries.map((item, seriesIndex) => {
            const dashPattern = lineStyle === 'solid' ? undefined : dashPatterns[seriesIndex % dashPatterns.length]
            const pathSegments = buildPathSegments(item.points, getX, getY)
            const visiblePoints = item.points.filter((point): point is { x: number; value: number } => (
              point.value !== null
            ))

            return (
              <g
                className="build-comparison-chart-series"
                aria-label={`${item.label}の系列`}
                key={`${item.id}-${seriesIndex}`}
              >
                {pathSegments.map((path, pathIndex) => (
                  <path
                    className="build-comparison-chart-line"
                    d={path}
                    fill="none"
                    stroke={item.color}
                    strokeDasharray={dashPattern}
                    style={lineStyle ? { strokeWidth: lineWidth } : undefined}
                    key={`${item.id}-path-${pathIndex}`}
                  />
                ))}
                {showPoints && visiblePoints.map((point, pointIndex) => {
                  const current = isSameNumber(point.x, currentX)
                  return (
                    <circle
                      className="build-comparison-chart-point"
                      cx={getX(point.x)}
                      cy={getY(point.value)}
                      r={current ? 4 : 3}
                      fill={current ? item.color : '#fff'}
                      stroke={item.color}
                      key={`${item.id}-point-${point.x}-${pointIndex}`}
                    >
                      <title>{`${item.label}・${axisLabel} ${formatAxisValue(point.x)}・${metricLabel} ${formatValue(point.value)}`}</title>
                    </circle>
                  )
                })}
              </g>
            )
          })}

          {useEndLabels && endpoints.map(({ item, point, x, y }) => {
            const placement = labelPositions.get(item.id)!
            const labelX = placement.x + placement.width - 4
            const labelY = placement.y + 4 + labelFontSize
            const titleWidth = endLabelMetrics[item.id]?.titleWidth ?? estimateLabelWidth(item.shortLabel ?? item.label, labelFontSize)
            const swatchRight = labelX - titleWidth - 8
            const swatchY = labelY - labelFontSize / 2 + 1
            const dashPattern = imageLegendItems.find((entry) => entry.id === item.id)?.dashPattern
            return <g className="build-comparison-chart-end-label" key={`label-${item.id}`} style={{ color: item.color }}>
              <title>{`${item.label}・${axisLabel} ${formatAxisValue(point.x)}・${metricLabel} ${formatValue(point.value!)}`}</title>
              <path d={`M ${x} ${y} L ${placement.x + placement.width + 3} ${placement.y + placement.height / 2}`}
                className="build-comparison-chart-end-leader" fill="none" />
              <circle cx={x} cy={y} r={2.5} fill={item.color} />
              <line className="build-comparison-chart-end-swatch"
                x1={swatchRight - END_LABEL_SWATCH_WIDTH} x2={swatchRight} y1={swatchY} y2={swatchY}
                stroke={item.color} strokeWidth={lineWidth} strokeDasharray={dashPattern} strokeLinecap="round" />
              <text className="build-comparison-chart-end-name" x={labelX} y={labelY} textAnchor="end">{item.shortLabel ?? item.label}</text>
              {item.detailLabel && <text className="build-comparison-chart-end-detail" x={labelX} y={labelY + labelLineGap} textAnchor="end">{item.detailLabel}</text>}
            </g>
          })}

          {xScale.ticks.map((tick, index, ticks) => {
            const x = getX(tick)
            const anchor = index === 0 ? 'start' : index === ticks.length - 1 ? 'end' : 'middle'
            return (
              <g key={`x-${tick}`}>
                <line
                  className="build-comparison-chart-axis-mark"
                  x1={x}
                  x2={x}
                  y1={plotBottom}
                  y2={plotBottom + 4}
                />
                <text
                  className="build-comparison-chart-tick"
                  x={x}
                  y={plotBottom + 18}
                  textAnchor={anchor}
                >
                  {formatAxisValue(tick)}
                </text>
              </g>
            )
          })}

          <text
            className="build-comparison-chart-axis-title"
            x={(plotLeft + plotRight) / 2}
            y={chartHeight - outsideLegendHeight - 6}
            textAnchor="middle"
          >
            {axisLabel}
          </text>
          <text
            className="build-comparison-chart-axis-title"
            transform={`translate(15 ${(plotTop + plotBottom) / 2}) rotate(-90)`}
            textAnchor="middle"
          >
            {metricLabel}
          </text>
          {imageLegend && <ComparisonChartImageLegend layout={imageLegend}
            x={imageLegendPlacement?.x ?? (chartWidth - imageLegend.width) / 2}
            y={imageLegendPlacement?.y ?? chartHeight - outsideLegendHeight + 12}
            placement={imageLegendPlacement?.corner ?? 'outside'} />}
        </svg>

        {!hasValues && (
          <p className="build-comparison-chart-empty" role="status">
            表示できる計算結果がありません。
          </p>
        )}
      </div>
    </figure>
  )
}

function createXScale(values: number[]): NumericScale {
  if (values.length === 0) return { minimum: 0, maximum: 1, ticks: [0, 0.25, 0.5, 0.75, 1] }

  const rawMinimum = Math.min(...values)
  const rawMaximum = Math.max(...values)
  if (rawMinimum === rawMaximum) {
    const minimum = rawMinimum >= 0 ? 0 : rawMinimum - 1
    const maximum = rawMaximum > 0 ? rawMaximum : Math.max(1, rawMaximum + 1)
    return {
      minimum,
      maximum: maximum === minimum ? minimum + 1 : maximum,
      ticks: createLinearTicks(minimum, maximum === minimum ? minimum + 1 : maximum, 5),
    }
  }

  return {
    minimum: rawMinimum,
    maximum: rawMaximum,
    ticks: createLinearTicks(rawMinimum, rawMaximum, 5),
  }
}

function createYScale(values: number[], integerTicks: boolean): NumericScale {
  const zeroScale = { minimum: 0, maximum: 1, ticks: integerTicks ? [0, 1] : [0, 0.25, 0.5, 0.75, 1] }
  if (values.length === 0) return zeroScale

  const rawMinimum = Math.min(0, ...values)
  const rawMaximum = Math.max(0, ...values)
  if (rawMinimum === rawMaximum) {
    return zeroScale
  }

  const step = Math.max(integerTicks ? 1 : 0, niceStep((rawMaximum - rawMinimum) / 4))
  const minimum = Math.floor(rawMinimum / step) * step
  const maximum = Math.ceil(rawMaximum / step) * step
  const ticks: number[] = []
  for (let tick = minimum; tick <= maximum + step / 2; tick += step) {
    ticks.push(roundToPrecision(tick, step))
  }

  return { minimum, maximum, ticks }
}

function createLinearTicks(minimum: number, maximum: number, count: number): number[] {
  const interval = (maximum - minimum) / Math.max(1, count - 1)
  return Array.from({ length: count }, (_, index) => (
    roundToPrecision(minimum + interval * index, interval)
  ))
}

function niceStep(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1
  const exponent = Math.floor(Math.log10(value))
  const fraction = value / (10 ** exponent)
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return niceFraction * (10 ** exponent)
}

function roundToPrecision(value: number, reference: number): number {
  const digits = Math.max(0, Math.min(8, -Math.floor(Math.log10(Math.abs(reference) || 1)) + 2))
  return Number(value.toFixed(digits))
}

function buildPathSegments(
  points: ComparisonChartPoint[],
  getX: (value: number) => number,
  getY: (value: number) => number,
): string[] {
  const segments: string[] = []
  let current: string[] = []

  for (const point of points) {
    if (point.value === null) {
      if (current.length > 0) segments.push(current.join(' '))
      current = []
      continue
    }

    current.push(`${current.length === 0 ? 'M' : 'L'} ${getX(point.x)} ${getY(point.value)}`)
  }

  if (current.length > 0) segments.push(current.join(' '))
  return segments
}

function isSameNumber(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)) * 16
  return Math.abs(a - b) <= tolerance
}

function formatNumber(value: number): string {
  return NUMBER_FORMATTER.format(value)
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function estimateLabelWidth(text: string, fontSize: number): number {
  return Array.from(text).reduce((width, char) => width + fontSize * (/[^\x00-\x7f]/.test(char) ? 1 : 0.62), 0)
}
