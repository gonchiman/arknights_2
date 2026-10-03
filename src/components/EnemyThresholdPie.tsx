import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { EnemyThresholdDistribution } from '../lib/enemyThresholdDistribution'
import { ENEMY_HISTOGRAM_COUNT_MODES, type EnemyHistogramCountMode } from '../lib/enemyHistogramCounts'
import { getEnemyThresholdPieGeometry, wrapEnemyThresholdPieLabel, type EnemyThresholdPieLabelLayout } from '../lib/enemyThresholdPieLayout'
import { ENEMY_THRESHOLD_BUCKET_COLORS as BUCKET_COLORS } from '../lib/enemyThresholdColors'
import './EnemyThresholdPie.css'

type ThresholdBucket = EnemyThresholdDistribution['buckets'][number]
interface ThresholdPieProps {
  distribution: EnemyThresholdDistribution
  countMode: EnemyHistogramCountMode
  labelLayout?: EnemyThresholdPieLabelLayout
}

const formatCount = (value: number) => value.toLocaleString('ja-JP')
const formatPercent = (proportion: number) => `${(proportion * 100).toFixed(1)}%`
const countUnit = (mode: EnemyHistogramCountMode) => ENEMY_HISTOGRAM_COUNT_MODES.find(({ key }) => key === mode)!.unit
const totalLabel = (distribution: EnemyThresholdDistribution, unit: string) => `合計 ${formatCount(distribution.count)}${unit}`
const missingLabel = (distribution: EnemyThresholdDistribution, unit: string) => `術耐性不明 ${formatCount(distribution.missingCount)}${unit}を除外`
const bucketLabel = (bucket: ThresholdBucket, unit: string) => `${bucket.label}：${formatPercent(bucket.proportion)}、${formatCount(bucket.count)}${unit}`

function PieSectors({ distribution, cx, cy, radius }: {
  distribution: EnemyThresholdDistribution
  cx: number
  cy: number
  radius: number
}) {
  let cumulative = 0
  return <>
    {distribution.count === 0 && <circle className="enemy-threshold-empty-circle" cx={cx} cy={cy} r={radius} />}
    {distribution.buckets.map((bucket) => {
      if (bucket.count === 0 || distribution.count === 0) return null
      const start = cumulative
      cumulative += bucket.count / distribution.count
      const fill = BUCKET_COLORS[bucket.key]
      if (bucket.count === distribution.count) return <circle key={bucket.key} data-chart-image-ink="" cx={cx} cy={cy} r={radius} fill={fill} />
      const startAngle = start * Math.PI * 2 - Math.PI / 2
      const endAngle = Math.min(1, cumulative) * Math.PI * 2 - Math.PI / 2
      const x1 = cx + Math.cos(startAngle) * radius
      const y1 = cy + Math.sin(startAngle) * radius
      const x2 = cx + Math.cos(endAngle) * radius
      const y2 = cy + Math.sin(endAngle) * radius
      const largeArc = endAngle - startAngle > Math.PI ? 1 : 0
      return <path key={bucket.key} fill={fill} data-chart-image-ink=""
        d={`M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`} />
    })}
  </>
}

/** The chart body for ChartImageFrame; the frame supplies the visible title. */
export function EnemyThresholdPieSvg({ distribution, countMode, labelLayout = 'BELOW', width, height = 334, image = false, includeFooter = true, reserveMissingFooter = false }: ThresholdPieProps & {
  width: number
  height?: number
  image?: boolean
  includeFooter?: boolean
  reserveMissingFooter?: boolean
}) {
  const titleId = useId()
  const descriptionId = useId()
  const unit = countUnit(countMode)
  const hasMissing = distribution.missingCount > 0
  const narrow = width < 480
  const footerHeight = includeFooter ? (hasMissing || reserveMissingFooter) && narrow ? 42 : 24 : 0
  const summaryWidth = Math.max(0, Math.min(width - 32, 672))
  const summaryLeft = (width - summaryWidth) / 2
  const columnWidth = summaryWidth / 3
  const summaryLabelSize = narrow ? 11 : 12
  const summaryLabelLines = distribution.buckets.map((bucket) => wrapEnemyThresholdPieLabel(bucket.label, summaryLabelSize, Math.max(1, columnWidth - 24)))
  const extraSummaryHeight = (Math.max(1, ...summaryLabelLines.map((lines) => lines.length)) - 1) * 14
  const summaryTop = height - footerHeight - 72 - extraSummaryHeight
  const radius = Math.max(0, Math.min((width - 32) / 2, (summaryTop - 24) / 2, 150))
  const centerY = 8 + radius
  const footer = `${totalLabel(distribution, unit)}${hasMissing && !narrow ? `・${missingLabel(distribution, unit)}` : ''}`
  const layout = labelLayout === 'BELOW' ? null : getEnemyThresholdPieGeometry({
    buckets: distribution.buckets, width, height: height - footerHeight, labelLayout, unit,
  })

  return (
    <svg className={`enemy-threshold-svg${image ? ' enemy-threshold-svg-image' : ''}`}
      data-pie-label-layout={labelLayout} width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
      <title id={titleId}>術耐性の構成比</title>
      <desc id={descriptionId}>{distribution.buckets.map((bucket) => bucketLabel(bucket, unit)).join('。')}。{totalLabel(distribution, unit)}{hasMissing && `。${missingLabel(distribution, unit)}`}</desc>
      <rect className="enemy-threshold-background" width={width} height={height} />
      <PieSectors distribution={distribution} cx={layout?.cx ?? width / 2} cy={layout?.cy ?? centerY} radius={layout?.radius ?? radius} />
      {distribution.count === 0 && <text className="enemy-threshold-svg-empty" x={layout?.cx ?? width / 2} y={layout?.cy ?? centerY}
        textAnchor="middle" dominantBaseline="central">集計できる敵がありません</text>}
      {layout ? <>
        {layout.labels.map((label) => label.leader.length > 0 && <polyline key={label.key}
          className="enemy-threshold-svg-leader" data-pie-leader-key={label.key} aria-hidden="true"
          points={label.leader.map(({ x, y }) => `${x},${y}`).join(' ')} />)}
        {layout.labels.map((label) => {
          const bucket = distribution.buckets.find(({ key }) => key === label.key)!
          const titleOffset = label.swatch ? label.anchor === 'start' ? 16 : label.anchor === 'end' ? 0 : 8 : 0
          const swatchX = label.anchor === 'start' ? label.x : label.anchor === 'end' ? label.bounds.x : label.bounds.x + 2
          return <g key={label.key} className={`enemy-threshold-svg-label-group${label.placement === 'inside' ? ' enemy-threshold-svg-inside' : ''}`}
            data-pie-label-key={label.key} data-pie-label-placement={label.placement} data-chart-image-ink="">
            {label.swatch && <rect x={swatchX} y={label.y - 9} width={9} height={9} fill={BUCKET_COLORS[bucket.key]} />}
            <text className="enemy-threshold-svg-label" data-pie-label-part="label" x={label.x + titleOffset} y={label.y}
              textAnchor={label.anchor} fontSize={label.labelSize}>{label.labelLines.map((line, index) => <tspan key={index}
                x={label.x + titleOffset} dy={index === 0 ? 0 : label.labelLineHeight}>{line}</tspan>)}</text>
            <text className="enemy-threshold-svg-percent" data-pie-label-part="percentage" x={label.x} y={label.y + label.percentageOffset}
              textAnchor={label.anchor} fontSize={label.percentageSize}>{formatPercent(bucket.proportion)}</text>
            <text className="enemy-threshold-svg-count" data-pie-label-part="count" x={label.x} y={label.y + label.countOffset}
              textAnchor={label.anchor} fontSize={label.countSize}>{formatCount(bucket.count)}{unit}</text>
          </g>
        })}
      </> : distribution.buckets.map((bucket, index) => {
        const x = summaryLeft + (index + 0.5) * columnWidth
        const labelSize = summaryLabelSize
        const labelLines = summaryLabelLines[index]
        const labelWidth = [...labelLines[0]].reduce((sum, character) => sum + (/\d|[.,-]/.test(character) ? 0.6 : 1), 0) * labelSize
        return <g key={bucket.key} data-pie-label-key={bucket.key} data-pie-label-placement="below">
          <rect x={x - (labelWidth + 16) / 2} y={summaryTop - 9} width={9} height={9} fill={BUCKET_COLORS[bucket.key]} />
          <text className="enemy-threshold-svg-label" data-pie-label-part="label" x={x + 8} y={summaryTop} textAnchor="middle" fontSize={labelSize}>{labelLines.map((line, lineIndex) => <tspan key={lineIndex}
            x={x + 8} dy={lineIndex === 0 ? 0 : 14}>{line}</tspan>)}</text>
          <text className="enemy-threshold-svg-percent" data-pie-label-part="percentage" x={x} y={summaryTop + extraSummaryHeight + 29} textAnchor="middle" fontSize={narrow ? 22 : 25}>{formatPercent(bucket.proportion)}</text>
          <text className="enemy-threshold-svg-count" data-pie-label-part="count" x={x} y={summaryTop + extraSummaryHeight + 49} textAnchor="middle">{formatCount(bucket.count)}{unit}</text>
        </g>
      })}
      {includeFooter && <text className="enemy-threshold-svg-total" x={width / 2} y={height - footerHeight + 11} textAnchor="middle">{footer}</text>}
      {includeFooter && hasMissing && narrow && <text className="enemy-threshold-svg-total" x={width / 2} y={height - 11}
        textAnchor="middle">{missingLabel(distribution, unit)}</text>}
    </svg>
  )
}

export function EnemyThresholdPie({ distribution, countMode, labelLayout = 'BELOW', showHeading = true }: ThresholdPieProps & { showHeading?: boolean }) {
  const titleId = useId()
  const chartTitleId = useId()
  const descriptionId = useId()
  const unit = countUnit(countMode)
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const measure = () => setWidth(Math.max(1, Math.floor(container.clientWidth)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [labelLayout])
  return (
    <figure className="enemy-analysis-figure enemy-threshold-figure" aria-labelledby={showHeading ? titleId : labelLayout === 'BELOW' ? chartTitleId : undefined}
      aria-label={!showHeading && labelLayout !== 'BELOW' ? '術耐性の構成比' : undefined}>
      {showHeading && <figcaption><div><strong id={titleId}>術耐性の構成比</strong></div></figcaption>}
      {labelLayout === 'BELOW' ? <>
        <svg className="enemy-threshold-svg enemy-threshold-screen-pie" viewBox="0 0 256 256"
          data-pie-label-layout={labelLayout} role="img" aria-labelledby={`${chartTitleId} ${descriptionId}`}>
          <title id={chartTitleId}>術耐性 {formatCount(distribution.threshold)}を基準にした構成比</title>
          <desc id={descriptionId}>{distribution.buckets.map((bucket) => bucketLabel(bucket, unit)).join('。')}</desc>
          <PieSectors distribution={distribution} cx={128} cy={128} radius={120} />
          {distribution.count === 0 && <text className="enemy-threshold-svg-empty" x={128} y={128}
            textAnchor="middle" dominantBaseline="central">集計できる敵がありません</text>}
        </svg>
        <dl className="enemy-threshold-summary">
          {distribution.buckets.map((bucket) => <div key={bucket.key} data-pie-label-key={bucket.key} data-pie-label-placement="below">
            <dt><i style={{ backgroundColor: BUCKET_COLORS[bucket.key] }} aria-hidden="true" /><span data-pie-label-part="label">{bucket.label}</span></dt>
            <dd>
              <span className="enemy-threshold-percent" data-pie-label-part="percentage">{formatPercent(bucket.proportion)}</span>
              <span className="enemy-threshold-count" data-pie-label-part="count">{formatCount(bucket.count)}{unit}</span>
            </dd>
          </div>)}
        </dl>
      </> : <div ref={containerRef} className="enemy-threshold-responsive-pie">
        <EnemyThresholdPieSvg distribution={distribution} countMode={countMode} labelLayout={labelLayout}
          width={width} height={418} includeFooter={false} />
      </div>}
      <p className="enemy-threshold-caption">
        <span>{totalLabel(distribution, unit)}</span>
        {distribution.missingCount > 0 && <span>{missingLabel(distribution, unit)}</span>}
      </p>
    </figure>
  )
}
