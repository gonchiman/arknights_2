import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { EnemyNumericFilterField } from '../lib/enemyNumericFilters'
import type { HistogramBin, HistogramScale } from '../lib/enemyStatistics'
import type { EnemyComparisonDistribution, EnemyComparisonSeries, EnemyComparisonYAxis } from '../lib/enemyDistributionComparison'
import { buildEnemyComparisonCurvePath } from '../lib/enemyComparisonCurve'
import { ChartImageFrame } from './ChartImageFrame'
import { getEnemyChartImageLayout } from '../lib/enemyChartImage'

export interface EnemyComparisonMetric {
  key: EnemyNumericFilterField
  label: string
  axisLabel: string
  suffix: string
  summaryDigits: number
  logBinCount: number
  minimumLinearBinWidth: number
}

export interface EnemyComparisonSnapshot {
  distribution: EnemyComparisonDistribution
  metric: EnemyComparisonMetric
  scale: HistogramScale
  yAxis: EnemyComparisonYAxis
}

export const comparisonColor = (index: number) => `var(--enemy-comparison-series-${index + 1})`
const format = (value: number) => new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 8 }).format(value)
const amount = (count: number, total: number, yAxis: EnemyComparisonYAxis) => yAxis === 'COUNT' ? count : total > 0 ? count / total * 100 : 0

export function EnemyComparisonSwatch({ colorIndex }: { colorIndex: number }) {
  return <svg className="enemy-comparison-swatch" width="18" height="12" aria-hidden="true">
    <line x1="0" x2="18" y1="6" y2="6" stroke={comparisonColor(colorIndex)} strokeWidth="2" />
  </svg>
}

export function EnemyComparisonFigure({ data, onToggle }: { data: EnemyComparisonSnapshot; onToggle: (id: number) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const measure = () => { if (container.clientWidth > 0) setWidth(container.clientWidth) }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])
  return <figure className="enemy-analysis-figure enemy-comparison-figure">
    <figcaption>
      <strong>{data.metric.label}の分布比較</strong>
      <div className="enemy-comparison-legend" role="group" aria-label="比較系列の表示">
        {data.distribution.series.map((series) => <button type="button" key={series.condition.id}
          aria-pressed={series.condition.visible} onClick={() => onToggle(series.condition.id)}>
          <EnemyComparisonSwatch colorIndex={series.condition.colorIndex} />{series.label}
        </button>)}
      </div>
    </figcaption>
    <div className="enemy-comparison-chart-container" ref={containerRef}>
      <EnemyComparisonSvg data={data} width={width} height={310} />
    </div>
    <EnemyComparisonOverflow data={data} />
  </figure>
}

function binLabel(bin: HistogramBin, suffix: string) {
  if (bin.start === bin.end) return `${format(bin.start)}${suffix}`
  return `${format(bin.start)}〜${format(bin.end)}${suffix}${bin.includesMaximum ? '（上端を含む）' : '未満'}`
}

function EnemyComparisonSvg({ data, width, height, image = false }: {
  data: EnemyComparisonSnapshot; width: number; height: number; image?: boolean
}) {
  const titleId = useId(), descriptionId = useId()
  const [selection, setSelection] = useState<{ data: EnemyComparisonSnapshot; index: number } | null>(null)
  const pinned = useRef(false)
  useEffect(() => { pinned.current = false }, [data])
  const { distribution, metric, yAxis, scale } = data
  const bins = distribution.bins.filter((bin) => !bin.isOverflow)
  const allSeries = distribution.series.map((series) => ({ ...series, bins: series.bins.filter((bin) => !bin.isOverflow) }))
  const visible = allSeries.filter((series) => series.condition.visible && series.count > 0)
  const left = 60, right = Math.max(left + 1, width - 16), top = 20, bottom = height - (image ? 28 : 52)
  const minimum = distribution.minimum, maximum = distribution.maximum
  const log = scale === 'LOG' && minimum >= 0
  const transform = (value: number) => log ? Math.log1p(value) : value
  const span = transform(maximum) - transform(minimum)
  const x = (value: number) => span === 0 ? (left + right) / 2 : left + (transform(value) - transform(minimum)) / span * (right - left)
  const center = (bin: HistogramBin) => log
    ? Math.expm1((Math.log1p(bin.start) + Math.log1p(bin.end)) / 2)
    : bin.start + (bin.end - bin.start) / 2
  const showPoints = bins.length === 1 || bins.slice(1).every((bin, index) => x(center(bin)) - x(center(bins[index])) >= 8)
  // Legend visibility changes neither the shared bins nor the vertical scale.
  const maximumY = Math.max(0, ...allSeries.flatMap((series) => series.bins.map((bin) => amount(bin.count, series.count, yAxis))))
  const step = niceStep(maximumY / 4, yAxis === 'COUNT' ? 1 : 0)
  const ceiling = Math.max(step, Math.ceil(maximumY / step) * step)
  const y = (value: number) => bottom - (value / ceiling) * (bottom - top - 4)
  const ticksY = Array.from({ length: Math.round(ceiling / step) + 1 }, (_, i) => i * step)
  const divisions = width < 440 ? 2 : 4
  const ticksX = minimum === maximum ? [minimum] : Array.from({ length: divisions + 1 }, (_, i) => {
    const value = transform(minimum) + span * i / divisions
    return log ? Math.expm1(value) : value
  })
  const activeIndex = selection?.data === data && selection.index < bins.length ? selection.index : null
  const active = activeIndex === null ? null : bins[activeIndex]
  const selectedX = active ? x(center(active)) : left
  const readout = active ? `${binLabel(active, metric.suffix)}：${visible.map((series) =>
    `${series.label} ${format(series.bins[activeIndex!].count)}体（${format(amount(series.bins[activeIndex!].count, series.count, 'PERCENT'))}%）`).join('、')}` : ''
  const chooseAt = (clientX: number, element: SVGSVGElement) => {
    if (!bins.length) return
    const bounds = element.getBoundingClientRect()
    const cursor = (clientX - bounds.left) * width / bounds.width
    let nearest = 0
    bins.forEach((bin, index) => { if (Math.abs(x(center(bin)) - cursor) < Math.abs(x(center(bins[nearest])) - cursor)) nearest = index })
    setSelection({ data, index: nearest })
  }
  return <>
    <svg className="enemy-stat-chart enemy-comparison-chart" width="100%" height={height} viewBox={`0 0 ${width} ${height}`}
      role="img" aria-labelledby={`${titleId} ${descriptionId}`} tabIndex={image ? undefined : 0}
      onKeyDown={image ? undefined : (event) => {
        if (event.key === 'Escape') { setSelection(null); pinned.current = false }
        if (!bins.length || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? bins.length - 1
          : activeIndex === null ? 0 : activeIndex + (event.key === 'ArrowRight' ? 1 : -1)
        setSelection({ data, index: Math.max(0, Math.min(bins.length - 1, next)) }); pinned.current = true
      }} onPointerMove={image ? undefined : (event) => { if (!pinned.current) chooseAt(event.clientX, event.currentTarget) }}
      onPointerLeave={image ? undefined : () => { if (!pinned.current) setSelection(null) }}
      onPointerDown={image ? undefined : (event) => { pinned.current = !pinned.current; chooseAt(event.clientX, event.currentTarget) }}>
      <title id={titleId}>{metric.label}の分布比較</title>
      <desc id={descriptionId}>{allSeries.map((series) => `${series.label}：有効データ${series.count}体`).join('。')}。
        縦軸は{yAxis === 'PERCENT' ? '各条件の有効データ数に対する割合' : '敵数'}。各階級の中央の点を曲線でつないでいます。{!image && '左右矢印キーで階級ごとの値を確認できます。'}</desc>
      {ticksY.map((tick) => <g key={tick}>
        <line className="enemy-chart-gridline" x1={left} x2={right} y1={y(tick)} y2={y(tick)} />
        <text className="enemy-chart-tick" x={left - 8} y={y(tick) + 4} textAnchor="end">{format(tick)}{yAxis === 'PERCENT' ? '%' : ''}</text>
      </g>)}
      <rect className="enemy-chart-frame" x={left} y={top} width={right - left} height={bottom - top} />
      {visible.map((series) => <g key={series.condition.id} data-comparison-series={series.condition.id}>
        <path className="enemy-comparison-line" stroke={comparisonColor(series.condition.colorIndex)}
          d={buildEnemyComparisonCurvePath(series.bins.map((bin) => ({ x: x(center(bin)), y: y(amount(bin.count, series.count, yAxis)) })))} />
        {showPoints && series.bins.map((bin, index) => <circle key={index} className="enemy-comparison-point"
          cx={x(center(bin))} cy={y(amount(bin.count, series.count, yAxis))} r={series.bins.length === 1 ? 3 : 2.2}
          stroke={comparisonColor(series.condition.colorIndex)} />)}
      </g>)}
      {active && !image && <g className="enemy-comparison-hover">
        <line x1={selectedX} x2={selectedX} y1={top} y2={bottom} stroke="var(--text-muted)" strokeDasharray="3 3" />
        {visible.map((series) => <circle key={series.condition.id} cx={selectedX} cy={y(amount(series.bins[activeIndex!].count, series.count, yAxis))} r="3.5" fill={comparisonColor(series.condition.colorIndex)} />)}
      </g>}
      {ticksX.map((tick, i) => <text className="enemy-chart-tick" x={x(tick)} y={bottom + 19} key={i}
        textAnchor={i === 0 ? 'start' : i === ticksX.length - 1 ? 'end' : 'middle'}>{compactNumber(tick)}</text>)}
      {!visible.length && <text className="enemy-comparison-empty" x={(left + right) / 2} y={(top + bottom) / 2} textAnchor="middle">
        {allSeries.some((series) => series.count > 0) ? '表示する系列を選択' : '数値データがありません'}</text>}
      <text className="enemy-chart-axis-title" x="14" y={(top + bottom) / 2} textAnchor="middle" transform={`rotate(-90 14 ${(top + bottom) / 2})`}>{yAxis === 'PERCENT' ? '各条件内の割合（%）' : '敵数（体）'}</text>
      {!image && <text className="enemy-chart-axis-title" x={(left + right) / 2} y={height - 8} textAnchor="middle">{metric.axisLabel}（{log ? '対数' : '線形'}目盛）</text>}
    </svg>
    {!image && <div className="enemy-comparison-readout" role="status">{readout || '\u00a0'}</div>}
  </>
}

function niceStep(raw: number, minimum: number) {
  if (raw <= 0 || !Number.isFinite(raw)) return minimum || 1
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const normalized = raw / magnitude
  return Math.max(minimum, (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude)
}
function compactNumber(value: number) {
  return new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 3, notation: Math.abs(value) >= 10000 ? 'compact' : 'standard' }).format(value)
}

function overflowDescription(series: EnemyComparisonSeries, yAxis: EnemyComparisonYAxis) {
  return `${format(series.overflowCount)}体${yAxis === 'PERCENT' ? `（${new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 }).format(amount(series.overflowCount, series.count, yAxis))}%）` : ''}`
}

function EnemyComparisonOverflow({ data, onHeight }: { data: EnemyComparisonSnapshot; onHeight?: (height: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node || !onHeight) return
    const measure = () => onHeight(node.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure); observer.observe(node)
    return () => observer.disconnect()
  }, [onHeight])
  const overflow = data.distribution.bins.find((bin) => bin.isOverflow)
  return <div className="enemy-comparison-overflow" ref={ref}>
    {overflow && <><strong>{format(overflow.start)}{data.metric.suffix}超</strong>
      {data.distribution.series.filter((series) => series.condition.visible).map((series) => <span key={series.condition.id}>
        <EnemyComparisonSwatch colorIndex={series.condition.colorIndex} />{series.label}：{overflowDescription(series, data.yAxis)}
      </span>)}
    </>}
  </div>
}

export function EnemyComparisonImage({ data, aspectRatio, onLayout }: {
  data: EnemyComparisonSnapshot; aspectRatio?: number; onLayout?: (size: { width: number; height: number }) => void
}) {
  const [footerHeight, setFooterHeight] = useState(0)
  // Retain the space measured before widening, just like the shared frame's header.
  // Shrinking after wrapping changes would leave the export host at its earlier width.
  const measureFooter = useCallback((height: number) => setFooterHeight((current) => Math.max(current, height)), [])
  const metadata = data.distribution.histogram
  const conditions = [data.yAxis === 'PERCENT' ? '各条件内の割合' : '敵数',
    metadata?.binWidth != null ? `階級幅 ${format(metadata.binWidth)}` : `${data.distribution.bins.length}階級`,
    metadata ? `上限 ${format(metadata.normalRangeEnd)}${data.metric.suffix}` : null].filter(Boolean).join(' · ')
  return <ChartImageFrame className="enemy-chart-image enemy-comparison-image" title={`${data.metric.label}の分布比較`}
    conditions={conditions} naturalChartHeight={334 + footerHeight} aspectRatio={aspectRatio} onLayout={onLayout}
    axisTitle={`${data.metric.axisLabel}（${data.scale === 'LOG' && data.distribution.minimum >= 0 ? '対数' : '線形'}目盛）`}
    legend={<ul className="chart-image-frame-legend-list" aria-label="比較する条件">
      {data.distribution.series.filter((series) => series.condition.visible).map((series) => <li className="chart-image-frame-legend-item" key={series.condition.id}>
        <EnemyComparisonSwatch colorIndex={series.condition.colorIndex} /><span>{series.label}（{series.count}体{series.missingCount ? `・値なし${series.missingCount}体` : ''}）</span>
      </li>)}
    </ul>}>
    {({ width, height }) => <><EnemyComparisonSvg data={data} width={width} height={height - footerHeight} image /><EnemyComparisonOverflow data={data} onHeight={measureFooter} /></>}
  </ChartImageFrame>
}

export function EnemyComparisonImagePreview({ data, aspectRatio }: { data: EnemyComparisonSnapshot; aspectRatio?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(600)
  const [size, setSize] = useState(() => getEnemyChartImageLayout({ kind: 'COMPARISON', aspectRatio }))
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const measure = () => setAvailableWidth(Math.max(1, node.clientWidth))
    measure(); const observer = new ResizeObserver(measure); observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const scale = Math.min(1, availableWidth / size.width, 380 / size.height)
  const pixelRatio = Math.min(2, 16000 / size.width, 16000 / size.height, Math.sqrt(32000000 / size.width / size.height))
  return <div className="enemy-chart-image-preview">
    <div className="enemy-chart-image-preview-heading"><span>プレビュー</span><span>PNG</span></div>
    <div className="enemy-chart-image-preview-frame" ref={ref} style={{ height: Math.ceil(size.height * scale) }}>
      <div className="enemy-chart-image-preview-position" style={{ width: size.width, height: size.height, left: (availableWidth - size.width * scale) / 2, transform: `scale(${scale})` }}>
        <EnemyComparisonImage data={data} aspectRatio={aspectRatio} onLayout={(next) => setSize((current) => current.width === next.width && current.height === next.height ? current : { ...current, ...next })} />
      </div>
    </div>
    <span className="enemy-chart-image-preview-size">{Math.floor(size.width * pixelRatio)} × {Math.floor(size.height * pixelRatio)} px</span>
  </div>
}
