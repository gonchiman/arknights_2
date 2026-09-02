import { useEffect, useId, useMemo, useRef, useState } from 'react'

export interface ComparisonChartPoint {
  x: number
  value: number | null
}

export interface ComparisonChartSeries {
  id: string
  label: string
  color: string
  points: ComparisonChartPoint[]
}

export interface ComparisonChartProps {
  axisLabel: string
  metricLabel: string
  currentX: number
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
const NUMBER_FORMATTER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })

export function ComparisonChart({
  axisLabel,
  metricLabel,
  currentX,
  series,
}: ComparisonChartProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [chartWidth, setChartWidth] = useState(720)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return

    const updateWidth = () => {
      const nextWidth = Math.round(frame.getBoundingClientRect().width)
      if (nextWidth > 0) setChartWidth(Math.max(240, nextWidth))
    }

    updateWidth()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth)
      return () => window.removeEventListener('resize', updateWidth)
    }

    const observer = new ResizeObserver(updateWidth)
    observer.observe(frame)
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
  ))))
  const hasValues = normalizedSeries.some((item) => item.hasValues)

  const compact = chartWidth < 520
  const chartHeight = compact ? 260 : 300
  const margin = compact
    ? { top: 34, right: 14, bottom: 50, left: 58 }
    : { top: 36, right: 20, bottom: 52, left: 68 }
  const plotLeft = margin.left
  const plotRight = chartWidth - margin.right
  const plotTop = margin.top
  const plotBottom = chartHeight - margin.bottom
  const plotWidth = Math.max(1, plotRight - plotLeft)
  const plotHeight = Math.max(1, plotBottom - plotTop)
  const getX = (value: number) => plotLeft
    + ((value - xScale.minimum) / (xScale.maximum - xScale.minimum)) * plotWidth
  const getY = (value: number) => plotBottom
    - ((value - yScale.minimum) / (yScale.maximum - yScale.minimum)) * plotHeight
  const currentPosition = Number.isFinite(currentX)
    ? clamp(getX(currentX), plotLeft, plotRight)
    : null
  const currentText = Number.isFinite(currentX) ? `現在 ${formatNumber(currentX)}` : ''
  const currentLabelWidth = Math.max(60, currentText.length * 8 + 14)
  const currentLabelX = currentPosition === null
    ? 0
    : clamp(currentPosition - currentLabelWidth / 2, plotLeft, plotRight - currentLabelWidth)
  const description = hasValues
    ? `${axisLabel}を変えたときの${metricLabel}を、${normalizedSeries.filter((item) => item.hasValues).map((item) => item.label).join('、')}について示します。正確な値はグラフに続く数値表で確認できます。`
    : `${axisLabel}別の${metricLabel}を表示できる系列データがありません。`

  return (
    <figure className="build-comparison-chart">
      <figcaption className="build-comparison-chart-caption">
        <strong className="build-comparison-chart-heading">{metricLabel}推移</strong>
        <ul className="build-comparison-chart-legend" aria-label="比較系列の凡例">
          {normalizedSeries.map((item, index) => {
            const dashPattern = SERIES_DASH_PATTERNS[index % SERIES_DASH_PATTERNS.length]
            return (
              <li className="build-comparison-chart-legend-item" key={`${item.id}-${index}`}>
                <svg
                  className="build-comparison-chart-legend-swatch"
                  viewBox="0 0 24 6"
                  aria-hidden="true"
                >
                  <line
                    x1="1"
                    x2="23"
                    y1="3"
                    y2="3"
                    stroke={item.color}
                    strokeDasharray={dashPattern}
                    strokeWidth="2"
                  />
                </svg>
                <span>{item.label}{item.hasValues ? '' : '（データなし）'}</span>
              </li>
            )
          })}
        </ul>
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
                  className="build-comparison-chart-grid"
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
                  {formatNumber(tick)}
                </text>
              </g>
            )
          })}

          <rect
            className="build-comparison-chart-axis"
            x={plotLeft}
            y={plotTop}
            width={plotWidth}
            height={plotHeight}
          />

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
            const dashPattern = SERIES_DASH_PATTERNS[seriesIndex % SERIES_DASH_PATTERNS.length]
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
                    key={`${item.id}-path-${pathIndex}`}
                  />
                ))}
                {visiblePoints.map((point, pointIndex) => {
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
                      aria-hidden="true"
                    />
                  )
                })}
              </g>
            )
          })}

          {xScale.ticks.map((tick, index) => {
            const x = getX(tick)
            const anchor = index === 0 ? 'start' : index === xScale.ticks.length - 1 ? 'end' : 'middle'
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
                  {formatNumber(tick)}
                </text>
              </g>
            )
          })}

          <text
            className="build-comparison-chart-axis-title"
            x={(plotLeft + plotRight) / 2}
            y={chartHeight - 6}
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

function createYScale(values: number[]): NumericScale {
  if (values.length === 0) return { minimum: 0, maximum: 1, ticks: [0, 0.25, 0.5, 0.75, 1] }

  const rawMinimum = Math.min(0, ...values)
  const rawMaximum = Math.max(0, ...values)
  if (rawMinimum === rawMaximum) {
    return { minimum: 0, maximum: 1, ticks: [0, 0.25, 0.5, 0.75, 1] }
  }

  const step = niceStep((rawMaximum - rawMinimum) / 4)
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
