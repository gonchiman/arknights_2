import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { BoxPlotStatistics, NumericStatistics } from '../lib/enemyStatistics'
import { getHpChartValueAxis } from '../lib/goldenglowTargetSwitchHpAxis'
import { calculateNormalQqPlot } from '../lib/normalQqPlot'
import { createAdaptiveLinearTicks, createScaleTicks, createValueScale } from '../lib/statisticsChartScale'
import { NormalQqPlotSvg } from './NormalQqPlotSvg'
import './NumericDistributionChart.css'

interface DistributionProps {
  statistics: NumericStatistics
  boxPlot: BoxPlotStatistics | null
  metricLabel: string
  unit?: string
}

type SummaryView = 'histogram' | 'boxplot'
export type NumericDistributionChartProps = DistributionProps & (
  | { view: SummaryView; values?: readonly number[] }
  | { view: 'qq'; values: readonly number[] }
)

const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })
const COUNT = new Intl.NumberFormat('ja-JP')
const HISTOGRAM_HEIGHT = 310
const BOX_HEIGHT = 200
const format = (value: number) => NUMBER.format(value)

/** Distribution plots are read-only; the owning page supplies settings and summaries. */
export function NumericDistributionChart(props: NumericDistributionChartProps) {
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const observations = props.view === 'qq' ? props.values : undefined
  const { firstQuartile, thirdQuartile } = props.statistics
  const qqPlot = useMemo(() => observations && calculateNormalQqPlot(observations, firstQuartile, thirdQuartile),
    [observations, firstQuartile, thirdQuartile])
  useLayoutEffect(() => {
    const element = container.current
    if (!element) return
    let frame = 0
    const measure = () => {
      const next = Math.floor(element.clientWidth)
      if (next > 0) setWidth(previous => previous === next ? previous : next)
    }
    measure()
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    })
    observer.observe(element)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [])

  const minimumWidth = props.view === 'histogram'
    ? 76 + props.statistics.bins.length * Math.max(44, COUNT.format(Math.max(0, ...props.statistics.bins.map(bin => bin.count))).length * 8 + 12)
    : 280
  return <div className="numeric-distribution-chart" ref={container}>
    {props.statistics.count === 0 || (props.view === 'boxplot' && !props.boxPlot)
      ? <p className="numeric-distribution-empty" role="status">有効な値は0件です。</p>
      : <>
        <div className="numeric-distribution-scroll" role="region" tabIndex={0} aria-label={`${props.metricLabel}の分布グラフ`}>
          {props.view === 'qq'
            ? qqPlot && <NormalQqPlotSvg plot={qqPlot} width={Math.max(width, minimumWidth)} metricLabel={props.metricLabel} unit={props.unit} />
            : <NumericDistributionSvg {...props} width={Math.max(width, minimumWidth)} />}
        </div>
        {qqPlot && <div className="numeric-distribution-legend" aria-label="凡例">
          <span><i className="numeric-distribution-qq-point-key" aria-hidden="true" />スキル</span>
          {qqPlot.reference
            ? <span><i className="numeric-distribution-qq-reference-key" aria-hidden="true" />基準線（第1・第3四分位）</span>
            : <span>{qqPlot.points.length === 1 ? '基準線なし（有効1件）' : '基準線なし（Q1＝Q3）'}</span>}
        </div>}
        {props.view === 'boxplot' && <div className="numeric-distribution-legend" aria-label="凡例">
          <span><i className="numeric-distribution-box-key" aria-hidden="true" />箱 中央50%</span>
          <span><i className="numeric-distribution-median-key" aria-hidden="true" />中央値</span>
          <span><i className="numeric-distribution-whisker-key" aria-hidden="true" />ひげ 1.5IQR</span>
          <span><i className="numeric-distribution-outlier-key" aria-hidden="true" />ひげ外</span>
        </div>}
      </>}
  </div>
}

/** Fixed-width plotting surface, also used to verify tick and mark geometry. */
export function NumericDistributionSvg({ statistics, boxPlot, metricLabel, unit, view, width }: DistributionProps & { view: SummaryView; width: number }) {
  const id = useId()
  const axisLabel = unit ? `${metricLabel}（${unit}）` : metricLabel
  const height = view === 'histogram' ? HISTOGRAM_HEIGHT : BOX_HEIGHT
  const left = 56
  const right = Math.max(left + 1, width - 20)
  const top = 30
  const bottom = height - 54
  const isBox = view === 'boxplot'
  const histogram = statistics.histogram
  const hasOverflow = !isBox && histogram?.hasOverflow === true && histogram.binWidth !== null
  const minimum = isBox ? boxPlot?.minimum ?? 0 : histogram?.normalRangeStart ?? statistics.minimum ?? 0
  const maximum = isBox ? boxPlot?.maximum ?? minimum
    : hasOverflow ? histogram.normalRangeEnd + histogram.binWidth! : histogram?.normalRangeEnd ?? statistics.maximum ?? minimum
  const scale = createValueScale(minimum, maximum, left, right, 'LINEAR')
  const ticks = isBox
    ? createScaleTicks(minimum, maximum, width < 480 ? 3 : 5, 'LINEAR')
    : minimum === maximum ? [minimum]
      : createAdaptiveLinearTicks(minimum, hasOverflow ? histogram.normalRangeEnd : maximum, width < 480 ? 2 : 5)
  const overflowCenter = hasOverflow ? histogram.normalRangeEnd + histogram.binWidth! / 2 : null
  const visibleTicks = overflowCenter === null ? ticks
    : ticks.filter(value => scale.position(overflowCenter) - scale.position(value) >= 60)
  const boxY = top + (bottom - top) / 2
  const countAxis = getHpChartValueAxis(statistics.bins.map(bin => bin.count), { nonNegative: true })
  const y = (value: number) => bottom - value / countAxis.upperLimit * (bottom - top)
  const gap = Math.min(3, Math.max(1, (right - left) / Math.max(1, statistics.bins.length) * 0.08))
  const description = isBox && boxPlot
    ? `${boxPlot.count}件。箱は第1四分位から第3四分位、線は中央値、ひげは1.5IQR内の観測値です。ひげ外は${boxPlot.outliers.length}件。最小${format(boxPlot.minimum)}、最大${format(boxPlot.maximum)}。`
    : `${statistics.count}件。横軸は${axisLabel}、縦軸は件数。${hasOverflow ? `${format(histogram.normalRangeEnd)}を超える値は最後の階級にまとめています。` : ''}`

  return <svg className={`numeric-distribution-svg is-${view}`} width={width} height={height}
    viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} focusable="false">
    <title id={`${id}-title`}>{`${axisLabel}の${isBox ? '箱ひげ図' : 'ヒストグラム'}`}</title>
    <desc id={`${id}-description`}>{description}</desc>
    {!isBox && <>
      {countAxis.yTicks.filter(Number.isInteger).map(tick => <g key={tick}>
        <line className="numeric-distribution-grid" x1={left} x2={right} y1={y(tick)} y2={y(tick)} />
        <text className="numeric-distribution-tick" x={left - 9} y={y(tick)} dy=".35em" textAnchor="end">{COUNT.format(tick)}</text>
      </g>)}
      <line className="numeric-distribution-axis" x1={left} x2={left} y1={top} y2={bottom} />
      {statistics.bins.map((bin, index) => {
        const start = minimum === maximum ? left : scale.position(bin.start)
        const end = minimum === maximum ? right : scale.position(bin.end)
        const center = (start + end) / 2
        return <g key={`${bin.start}:${index}`}>
          <rect className={`numeric-distribution-bar${bin.isOverflow ? ' is-overflow' : ''}`}
            x={start + gap / 2} y={y(bin.count)} width={Math.max(1, end - start - gap)} height={Math.max(0, bottom - y(bin.count))} />
          <text className="numeric-distribution-value" x={center} y={y(bin.count) - 7} textAnchor="middle">{COUNT.format(bin.count)}</text>
        </g>
      })}
      <text className="numeric-distribution-label" x={left} y={15}>件数</text>
    </>}
    {isBox && boxPlot && <g>
      <line className="numeric-distribution-whisker" x1={scale.position(boxPlot.lowerWhisker)} x2={scale.position(boxPlot.upperWhisker)} y1={boxY} y2={boxY} />
      {[boxPlot.lowerWhisker, boxPlot.upperWhisker].map((value, index) => <line className="numeric-distribution-whisker" key={index}
        x1={scale.position(value)} x2={scale.position(value)} y1={boxY - 12} y2={boxY + 12} />)}
      <rect className="numeric-distribution-box" x={scale.position(boxPlot.firstQuartile)} y={boxY - 22}
        width={Math.max(2, scale.position(boxPlot.thirdQuartile) - scale.position(boxPlot.firstQuartile))} height={44} />
      <line className="numeric-distribution-median" x1={scale.position(boxPlot.median)} x2={scale.position(boxPlot.median)} y1={boxY - 22} y2={boxY + 22} />
      {boxPlot.outliers.map((value, index) => <circle className="numeric-distribution-outlier" key={index} cx={scale.position(value)} cy={boxY} r={3.5} />)}
    </g>}
    <line className="numeric-distribution-axis" x1={left} x2={right} y1={bottom} y2={bottom} />
    {visibleTicks.map(tick => <g key={tick}>
      <line className="numeric-distribution-axis" x1={scale.position(tick)} x2={scale.position(tick)} y1={bottom} y2={bottom + 5} />
      <text className="numeric-distribution-tick" x={scale.position(tick)} y={bottom + 23} textAnchor="middle">{format(tick)}</text>
    </g>)}
    {overflowCenter !== null && <text className="numeric-distribution-tick" x={scale.position(overflowCenter)} y={bottom + 23} textAnchor="middle">{format(histogram!.normalRangeEnd)}超</text>}
    <text className="numeric-distribution-label" x={(left + right) / 2} y={height - 7} textAnchor="middle">{axisLabel}</text>
  </svg>
}
