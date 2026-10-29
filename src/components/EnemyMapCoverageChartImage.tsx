import { useLayoutEffect, useRef, useState } from 'react'
import { getChartImageLayout } from '../lib/chartImageLayout'
import {
  getMapCoverageSegmentCount, MAP_COVERAGE_COLORS, MAP_COVERAGE_MODE_LABELS, MAP_COVERAGE_STATUS_KEYS, MAP_COVERAGE_STATUS_LABELS,
} from '../lib/enemyMapCoverageChartImage'
import type { EnemyMapCoverageChartSnapshot } from '../lib/enemyMapCoverageChartImage'
import { ChartImageFrame } from './ChartImageFrame'
import './EnemyChartImage.css'

const NATURAL_CHART_HEIGHT = 300
const formatCount = (count: number) => count.toLocaleString('ja-JP')

interface ImageProps {
  snapshot: EnemyMapCoverageChartSnapshot
  aspectRatio?: number
  onLayout?: (size: { width: number; height: number }) => void
}

export function getEnemyMapCoverageChartImageLayout(aspectRatio?: number) {
  return getChartImageLayout({ naturalChartHeight: NATURAL_CHART_HEIGHT, aspectRatio })
}

function CoveragePlot({ snapshot, width, height }: {
  snapshot: EnemyMapCoverageChartSnapshot; width: number; height: number
}) {
  const left = 136
  const right = width - 180
  const barWidth = right - left
  const top = 34
  const bottom = height - 30
  const rowHeight = (bottom - top) / snapshot.categories.length
  const barHeight = 16
  return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
    aria-label="分類ごとの集計対象割合とマップ数" style={{ fontVariantNumeric: 'tabular-nums' }}>
    <g fontSize="11" fill="#666">
      <text x="0" y="20">分類</text>
      <text x={left} y="20">収録マップの内訳</text>
      <text x={width} y="20" textAnchor="end">集計対象 / 収録数</text>
    </g>
    {snapshot.categories.map((category, index) => {
      const center = top + rowHeight * (index + 0.5)
      let offset = left
      return <g key={category.key}>
        <title>{`${category.label}、${MAP_COVERAGE_STATUS_KEYS.map((status) => `${MAP_COVERAGE_STATUS_LABELS[status]} ${formatCount(getMapCoverageSegmentCount(category, status))}`).join('、')} マップ`}</title>
        <text x="0" y={center} dy="0.35em" fontSize="12" fill="#444">{category.label}</text>
        <rect x={left} y={center - barHeight / 2} width={barWidth} height={barHeight} fill="#f5f5f5" />
        {MAP_COVERAGE_STATUS_KEYS.map((status) => {
          const segmentWidth = category.total > 0 ? barWidth * getMapCoverageSegmentCount(category, status) / category.total : 0
          const x = offset
          offset += segmentWidth
          return <rect key={status} x={x} y={center - barHeight / 2} width={segmentWidth}
            height={barHeight} fill={MAP_COVERAGE_COLORS[status]} />
        })}
        <text x={width} y={center} dy="0.35em" textAnchor="end" fontSize="12" fill="#555">
          {formatCount(category.included)} / {formatCount(category.total)} マップ
        </text>
      </g>
    })}
    <line x1={left} x2={right} y1={bottom} y2={bottom} stroke="#b8b8b8" />
    {[0, 25, 50, 75, 100].map((percent) => {
      const x = left + barWidth * percent / 100
      return <g key={percent}>
        <line x1={x} x2={x} y1={bottom} y2={bottom + 5} stroke="#b8b8b8" />
        <text x={x} y={bottom + 20} textAnchor="middle" fontSize="11" fill="#555">{percent}%</text>
      </g>
    })}
  </svg>
}

export function EnemyMapCoverageChartImage({ snapshot, aspectRatio, onLayout }: ImageProps) {
  return <ChartImageFrame key={`${JSON.stringify(snapshot)}:${aspectRatio ?? 'auto'}`}
    title="集計マップ" conditions={[MAP_COVERAGE_MODE_LABELS[snapshot.mode], snapshot.aggregationVersion?.label].filter(Boolean).join(' · ')}
    axisTitle="収録マップに占める割合" naturalChartHeight={NATURAL_CHART_HEIGHT}
    aspectRatio={aspectRatio} onLayout={onLayout}
    legend={<ul className="chart-image-frame-legend-list" aria-label="集計対象の内訳">
      {MAP_COVERAGE_STATUS_KEYS.map((status) => <li key={status} className="chart-image-frame-legend-item">
        <svg className="chart-image-frame-legend-swatch" width="18" height="12" aria-hidden="true">
          <rect x="0" y="1" width="10" height="10" fill={MAP_COVERAGE_COLORS[status]} />
        </svg>
        <span>{MAP_COVERAGE_STATUS_LABELS[status]} {formatCount(getMapCoverageSegmentCount(snapshot.totals, status))}</span>
      </li>)}
    </ul>}>
    {({ width, height }) => <CoveragePlot snapshot={snapshot} width={width} height={height} />}
  </ChartImageFrame>
}

function ImagePreview({ snapshot, aspectRatio }: Omit<ImageProps, 'onLayout'>) {
  const previewRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(600)
  const [size, setSize] = useState<{ width: number; height: number }>(() => getEnemyMapCoverageChartImageLayout(aspectRatio))
  useLayoutEffect(() => {
    const element = previewRef.current
    if (!element) return
    const measure = () => setAvailableWidth(Math.max(1, element.clientWidth))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const scale = Math.min(availableWidth / size.width, 380 / size.height, 1)
  const pixelRatio = Math.min(2, 16_000 / size.width, 16_000 / size.height,
    Math.sqrt(32_000_000 / size.width / size.height))
  return <div className="enemy-chart-image-preview">
    <div className="enemy-chart-image-preview-heading"><span>プレビュー</span><span>PNG</span></div>
    <div ref={previewRef} className="enemy-chart-image-preview-frame" style={{ height: Math.ceil(size.height * scale) }}>
      <div className="enemy-chart-image-preview-position" style={{ width: size.width, height: size.height,
        left: (availableWidth - size.width * scale) / 2, transform: `scale(${scale})` }}>
        <EnemyMapCoverageChartImage snapshot={snapshot} aspectRatio={aspectRatio} onLayout={setSize} />
      </div>
    </div>
    <span className="enemy-chart-image-preview-size" aria-live="polite">
      {Math.floor(size.width * pixelRatio).toLocaleString('ja-JP')} × {Math.floor(size.height * pixelRatio).toLocaleString('ja-JP')} px
    </span>
  </div>
}

export function EnemyMapCoverageChartImagePreview(props: Omit<ImageProps, 'onLayout'>) {
  return <ImagePreview key={`${JSON.stringify(props.snapshot)}:${props.aspectRatio ?? 'auto'}`} {...props} />
}
