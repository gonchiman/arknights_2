import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { getHpChartValueAxis } from '../lib/goldenglowTargetSwitchHpAxis'
import { MAIN_ENEMY_TREND_METRIC_LABELS, type MainEnemyTrendKind, type MainEnemyTrendMetric } from '../lib/mainEnemyTrendImageFilename'
import './ChartImageFrame.css'
import './MainEnemyTrendChart.css'

export { MAIN_ENEMY_TREND_METRIC_LABELS }
export type { MainEnemyTrendKind, MainEnemyTrendMetric }

export interface MainEnemyTrendPoint {
  chapter: number
  label: string
  mean: number | null
  median: number | null
  includedMaps: number
  totalMaps: number
  partialMaps?: number
  missingCount?: number
}

export interface MainEnemyTrendPlotProps {
  points: readonly MainEnemyTrendPoint[]
  metric: MainEnemyTrendMetric
  kind: MainEnemyTrendKind
  showMean?: boolean
  showMedian?: boolean
  width: number
  height: number
  showAxisTitle?: boolean
  selectedChapter?: number | null
  onSelectChapter?: (chapter: number) => void
}

export interface MainEnemyTrendChartProps extends Omit<MainEnemyTrendPlotProps, 'width' | 'height'> {
  width?: number
  height?: number
  showLegend?: boolean
}

export const MAIN_ENEMY_TREND_NATURAL_HEIGHT = 334
const SERIES = [
  { key: 'mean', label: '平均', color: '#2878b5' },
  { key: 'median', label: '中央値', color: '#e58e26' },
] as const
const valueFormatter = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 })
const formatValue = (value: number | null) => value === null ? '—' : valueFormatter.format(value)
const finiteValue = (value: number | null) => value !== null && Number.isFinite(value) ? value : null
export const hasMainEnemyTrendPartialCoverage = (point: MainEnemyTrendPoint) => point.includedMaps < point.totalMaps
  || (point.partialMaps ?? 0) > 0 || (point.missingCount ?? 0) > 0

function normalizePoints(points: readonly MainEnemyTrendPoint[]): MainEnemyTrendPoint[] {
  const byChapter = new Map<number, MainEnemyTrendPoint>()
  for (const point of points) {
    if (!Number.isSafeInteger(point.chapter) || point.chapter < 0) continue
    byChapter.set(point.chapter, { ...point, mean: finiteValue(point.mean), median: finiteValue(point.median) })
  }
  return [...byChapter.values()].sort((left, right) => left.chapter - right.chapter)
}

function chapterSummary(point: MainEnemyTrendPoint, showMean: boolean, showMedian: boolean): string {
  const values = [showMean && `平均 ${formatValue(point.mean)}`, showMedian && `中央値 ${formatValue(point.median)}`].filter(Boolean)
  return [`${point.chapter}章 ${point.label}`, ...values, `採用マップ ${point.includedMaps}/${point.totalMaps}`,
    (point.partialMaps ?? 0) > 0 && `一部集計 ${point.partialMaps}マップ`,
    point.includedMaps < point.totalMaps && `未集計 ${point.totalMaps - point.includedMaps}マップ`,
    (point.missingCount ?? 0) > 0 && `ステータス不明 ${point.missingCount}`].filter(Boolean).join('・')
}

function linePath(points: readonly MainEnemyTrendPoint[], key: 'mean' | 'median', x: (chapter: number) => number,
  y: (value: number) => number): string {
  let previousChapter: number | null = null
  return points.map(point => {
    const value = point[key]
    if (value === null) { previousChapter = null; return '' }
    const command = previousChapter !== null && point.chapter === previousChapter + 1 ? 'L' : 'M'
    previousChapter = point.chapter
    return `${command} ${x(point.chapter)} ${y(value)}`
  }).filter(Boolean).join(' ')
}

export function MainEnemyTrendLegend({ showMean = true, showMedian = true, kind = 'line', showPartialCoverage = true }: {
  showMean?: boolean
  showMedian?: boolean
  kind?: MainEnemyTrendKind
  showPartialCoverage?: boolean
}) {
  return <ul className="chart-image-frame-legend-list" aria-label="表示系列">
    {SERIES.filter(item => item.key === 'mean' ? showMean : showMedian).map(item => <li key={item.key} className="chart-image-frame-legend-item">
      <svg className="chart-image-frame-legend-swatch" width="18" height="12" aria-hidden="true">
        {kind === 'bar' ? <rect x="4" y="1" width="10" height="10" fill={item.color} />
          : <><line x1="0" x2="18" y1="6" y2="6" stroke={item.color} strokeWidth="2" />
            <circle cx="9" cy="6" r="2.5" fill={item.color} /></>}
      </svg>
      <span>{item.label}</span>
    </li>)}
    {showPartialCoverage && <li className="chart-image-frame-legend-item">
      <svg className="chart-image-frame-legend-swatch" width="18" height="12" aria-hidden="true">
        {kind === 'bar' ? <rect x="4" y="1" width="10" height="10" fill="#777" fillOpacity="0.4" stroke="#777" />
          : <circle cx="9" cy="6" r="3" fill="#fff" stroke="#777" strokeWidth="1.5" />}
      </svg>
      <span>一部集計・欠測</span>
    </li>}
  </ul>
}

/** Shared SVG: the image frame owns its heading, legend and optional horizontal-axis title. */
export function MainEnemyTrendPlot({ points, metric, kind, showMean = true, showMedian = true,
  width: requestedWidth, height: requestedHeight, showAxisTitle = true, selectedChapter, onSelectChapter }: MainEnemyTrendPlotProps) {
  const width = Number.isFinite(requestedWidth) && requestedWidth > 0 ? requestedWidth : 720
  const height = Number.isFinite(requestedHeight) && requestedHeight > 0 ? requestedHeight : MAIN_ENEMY_TREND_NATURAL_HEIGHT
  const data = normalizePoints(points)
  const series = SERIES.filter(item => item.key === 'mean' ? showMean : showMedian)
  const values = data.flatMap(point => series.flatMap(item => point[item.key] === null ? [] : [point[item.key]!]))
  const axis = getHpChartValueAxis(values, { mode: 'zero', nonNegative: true })
  const tickDigits = Math.max(0, Math.min(10, -Math.floor(Math.log10(axis.valueStep))))
  const tickFormatter = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: tickDigits })
  const left = Math.max(54, ...axis.yTicks.map(tick => tickFormatter.format(tick).length * 7 + 12))
  const right = Math.max(left + 1, width - 18)
  const top = 28
  const bottom = Math.max(top + 1, height - (showAxisTitle ? 48 : 28))
  const first = data[0]?.chapter ?? 0
  const last = data.at(-1)?.chapter ?? first
  const bandWidth = (right - left) / (last - first + 1)
  const x = (chapter: number) => left + (chapter - first + 0.5) * bandWidth
  const y = (value: number) => bottom - (value - axis.lowerLimit) / (axis.upperLimit - axis.lowerLimit) * (bottom - top)
  const barGap = Math.min(3, bandWidth * 0.06)
  const barWidth = Math.min(30, (bandWidth * 0.7 - barGap * Math.max(0, series.length - 1)) / Math.max(1, series.length))
  const groupWidth = series.length * barWidth + Math.max(0, series.length - 1) * barGap
  const [hoveredChapter, setHoveredChapter] = useState<number | null>(null)
  const activeChapter = hoveredChapter ?? selectedChapter
  const activePoint = data.find(point => point.chapter === activeChapter)
  const description = data.map(point => chapterSummary(point, showMean, showMedian)).join('。')
  const interactive = onSelectChapter !== undefined
  const refs = useRef(new Map<number, SVGGElement>())
  const tickStep = Math.max(1, Math.ceil(22 / bandWidth))
  const chapterTicks = data.filter(point => point.chapter === first || point.chapter === last
    || point.chapter === selectedChapter || (point.chapter - first) % tickStep === 0)

  function handleKeyDown(event: KeyboardEvent<SVGGElement>, chapter: number) {
    if (!onSelectChapter) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelectChapter(chapter)
      return
    }
    const index = data.findIndex(point => point.chapter === chapter)
    const next = event.key === 'ArrowLeft' ? Math.max(0, index - 1)
      : event.key === 'ArrowRight' ? Math.min(data.length - 1, index + 1)
      : event.key === 'Home' ? 0 : event.key === 'End' ? data.length - 1 : null
    if (next === null) return
    event.preventDefault()
    refs.current.get(data[next].chapter)?.focus()
  }

  return <svg className="main-enemy-trend-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`}
    role={interactive ? 'group' : 'img'} aria-label={`${MAIN_ENEMY_TREND_METRIC_LABELS[metric]}の章別推移・${kind === 'line' ? '折れ線' : '集合棒'}`}>
    <title>{`${MAIN_ENEMY_TREND_METRIC_LABELS[metric]}の章別推移`}</title>
    <desc>{description || '表示できるデータがありません'}</desc>
    <text className="main-enemy-trend-axis-title" x={left} y="16">{MAIN_ENEMY_TREND_METRIC_LABELS[metric]}</text>
    {axis.yTicks.map(tick => <g key={tick}>
      <line className="main-enemy-trend-grid" x1={left} x2={right} y1={y(tick)} y2={y(tick)} strokeDasharray="4 4" />
      <text className="main-enemy-trend-tick" x={left - 9} y={y(tick) + 4} textAnchor="end">{tickFormatter.format(tick)}</text>
    </g>)}
    {activePoint && <rect className="main-enemy-trend-active-band" x={x(activePoint.chapter) - bandWidth / 2 + 1} y={top}
      width={Math.max(1, bandWidth - 2)} height={bottom - top} />}
    <path className="main-enemy-trend-axis" data-chart-image-plot-area="" d={`M ${left} ${top} V ${bottom} H ${right}`} />
    {chapterTicks.map(point => <g key={point.chapter}>
      <line className="main-enemy-trend-axis" x1={x(point.chapter)} x2={x(point.chapter)} y1={bottom} y2={bottom + 4} />
      <text className="main-enemy-trend-tick" x={x(point.chapter)} y={bottom + 19} textAnchor="middle">{point.chapter}</text>
    </g>)}
    {showAxisTitle && <text className="main-enemy-trend-axis-title" x={(left + right) / 2} y={height - 6} textAnchor="middle">章</text>}
    {kind === 'line' && series.map(item => <path key={item.key} className="main-enemy-trend-line" data-series={item.key}
      data-chart-image-ink="" d={linePath(data, item.key, x, y)} stroke={item.color} />)}
    {data.map(point => <g key={point.chapter}>
      {series.map((item, seriesIndex) => {
        const value = point[item.key]
        if (value === null) return null
        const partial = hasMainEnemyTrendPartialCoverage(point)
        const title = chapterSummary(point, item.key === 'mean', item.key === 'median')
        return kind === 'line'
          ? <circle key={item.key} data-series={item.key} data-chapter={point.chapter} data-partial-coverage={partial || undefined}
            data-chart-image-ink="" cx={x(point.chapter)} cy={y(value)} r={activeChapter === point.chapter ? 4.5 : 3.5}
            fill={partial ? '#fff' : item.color} stroke={item.color} strokeWidth="1.75"><title>{title}</title></circle>
          : <rect key={item.key} data-series={item.key} data-chapter={point.chapter} data-partial-coverage={partial || undefined}
            data-chart-image-ink="" x={x(point.chapter) - groupWidth / 2 + seriesIndex * (barWidth + barGap)}
            y={Math.min(y(value), y(0))} width={barWidth} height={Math.max(1, Math.abs(y(0) - y(value)))}
            fill={item.color} fillOpacity={partial ? 0.4 : 1} stroke={partial ? item.color : undefined} strokeWidth={partial ? 1 : undefined}>
            <title>{title}</title>
          </rect>
      })}
    </g>)}
    {values.length === 0 && <text className="main-enemy-trend-empty" x={(left + right) / 2} y={(top + bottom) / 2} textAnchor="middle">
      {series.length === 0 ? '表示する系列を選択してください' : '表示できるデータがありません'}
    </text>}
    {interactive && data.map(point => <g key={point.chapter} className="main-enemy-trend-chapter-target" data-chapter-target={point.chapter}
      ref={element => { if (element) refs.current.set(point.chapter, element); else refs.current.delete(point.chapter) }}
      role="button" tabIndex={0} aria-label={chapterSummary(point, showMean, showMedian)} aria-pressed={selectedChapter === point.chapter}
      onClick={() => onSelectChapter(point.chapter)} onKeyDown={event => handleKeyDown(event, point.chapter)}
      onPointerEnter={() => setHoveredChapter(point.chapter)} onPointerLeave={() => setHoveredChapter(null)}
      onFocus={() => setHoveredChapter(point.chapter)} onBlur={() => setHoveredChapter(null)}>
      <title>{chapterSummary(point, showMean, showMedian)}</title>
      <rect x={x(point.chapter) - bandWidth / 2} y={top} width={bandWidth} height={bottom - top + 24} fill="transparent" />
    </g>)}
  </svg>
}

/** Responsive screen wrapper; callers use MainEnemyTrendPlot directly inside ChartImageFrame. */
export function MainEnemyTrendChart({ width: suppliedWidth, height = MAIN_ENEMY_TREND_NATURAL_HEIGHT,
  showLegend = true, ...props }: MainEnemyTrendChartProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(720)
  useLayoutEffect(() => {
    if (suppliedWidth !== undefined) return
    const viewport = viewportRef.current
    if (!viewport) return
    const measure = () => setAvailableWidth(Math.max(240, viewport.clientWidth))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [suppliedWidth])
  const chapters = normalizePoints(props.points)
  const minimumWidth = 96 + ((chapters.at(-1)?.chapter ?? 0) - (chapters[0]?.chapter ?? 0) + 1) * 26
  const plotWidth = suppliedWidth ?? Math.max(availableWidth, minimumWidth)
  return <div className="main-enemy-trend-chart" ref={viewportRef}>
    {showLegend && <div className="main-enemy-trend-legend"><MainEnemyTrendLegend showMean={props.showMean} showMedian={props.showMedian}
      kind={props.kind} showPartialCoverage={props.points.some(hasMainEnemyTrendPartialCoverage)} /></div>}
    <div className="main-enemy-trend-scroll"><MainEnemyTrendPlot {...props} width={plotWidth} height={height} /></div>
  </div>
}
