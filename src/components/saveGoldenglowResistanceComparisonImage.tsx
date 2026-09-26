import { useLayoutEffect, useRef, useState } from 'react'
import type { ResistanceComparisonDisplaySeries } from '../lib/goldenglowResistanceComparison'
import type { HpComparisonMetric } from '../lib/goldenglowTargetSwitchHpComparison'
import type { HpChartGridStyle } from './GoldenglowTargetSwitchHpChart'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { ChartImageFrame } from './ChartImageFrame'
import { GoldenglowResistanceComparisonChartSvg, getResistanceChartSeries } from './GoldenglowResistanceComparisonChart'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import './saveGoldenglowTargetSwitchHpChartImage.css'

export interface ResistanceChartImageSnapshot {
  series: readonly ResistanceComparisonDisplaySeries[]
  enemyHps: readonly number[]
  enemyResistances: readonly number[]
  metric: HpComparisonMetric
  baselineId: string
  hideBaseline?: boolean
  digits: number
  title: string
  conditions: string
  notice?: string
  showHpRanks?: boolean
  gridStyle?: HpChartGridStyle
}

const naturalChartHeight = 334
interface ResistanceChartImageProps {
  snapshot: ResistanceChartImageSnapshot
  aspectRatio?: number
  onLayout?: (size: { width: number; height: number }) => void
}

export function GoldenglowResistanceComparisonImage({ snapshot, aspectRatio, onLayout }: ResistanceChartImageProps) {
  const visibleSeries = getResistanceChartSeries(snapshot.series, snapshot.hideBaseline, snapshot.baselineId)
  return <ChartImageFrame className="gg2-chart-image"
    title={snapshot.notice ? `${snapshot.title}（${snapshot.notice}）` : snapshot.title}
    conditions={snapshot.conditions} axisTitle="敵HP（棒の下の数字：術耐性）"
    naturalChartHeight={naturalChartHeight} aspectRatio={aspectRatio} onLayout={onLayout}
    legend={<ul className="chart-image-frame-legend-list" aria-label="比較するMOD">
      {visibleSeries.map((item) => <li className="chart-image-frame-legend-item" key={item.id}>
        <svg className="chart-image-frame-legend-swatch" width="18" height="12" aria-hidden="true">
          <rect x="4" y="1" width="10" height="10" fill={item.style.color} />
        </svg>
        <span>{item.label}{snapshot.metric !== 'total' && item.id === snapshot.baselineId ? '（基準）' : ''}</span>
      </li>)}
    </ul>}>
    {({ width, height }) => <GoldenglowResistanceComparisonChartSvg
      series={snapshot.series} enemyHps={snapshot.enemyHps} enemyResistances={snapshot.enemyResistances}
      metric={snapshot.metric} baselineId={snapshot.baselineId} hideBaseline={snapshot.hideBaseline}
      digits={snapshot.digits} showHpRanks={snapshot.showHpRanks} gridStyle={snapshot.gridStyle} width={width} height={height} />}
  </ChartImageFrame>
}

/** Scale only the dialog preview; image dimensions remain those of the shared frame. */
export function GoldenglowResistanceComparisonImagePreview({ snapshot, aspectRatio }: Omit<ResistanceChartImageProps, 'onLayout'>) {
  const previewRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(600)
  const [size, setSize] = useState<{ width: number; height: number }>(() => getChartImageLayout({ naturalChartHeight, aspectRatio }))
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
  const pixelRatio = Math.min(2, 16_000 / size.width, 16_000 / size.height, Math.sqrt(32_000_000 / size.width / size.height))
  return <div className="gg2-chart-image-preview">
    <div className="gg2-chart-image-preview-heading"><span>プレビュー</span><span>PNG</span></div>
    <div ref={previewRef} className="gg2-chart-image-preview-frame" style={{ height: Math.ceil(size.height * scale) }}>
      <div className="gg2-chart-image-preview-position" style={{ width: size.width, height: size.height,
        left: (availableWidth - size.width * scale) / 2, transform: `scale(${scale})` }}>
        <GoldenglowResistanceComparisonImage snapshot={snapshot} aspectRatio={aspectRatio} onLayout={setSize} />
      </div>
    </div>
    <span className="gg2-chart-image-preview-size" aria-live="polite">
      {Math.floor(size.width * pixelRatio).toLocaleString('ja-JP')} × {Math.floor(size.height * pixelRatio).toLocaleString('ja-JP')} px
    </span>
  </div>
}

export async function saveGoldenglowResistanceComparisonImage({ filename, snapshot, aspectRatio, writeBlob }: {
  filename: string
  snapshot: ResistanceChartImageSnapshot
  aspectRatio?: number
  writeBlob?: (blob: Blob) => Promise<void>
}): Promise<void> {
  const layout = getChartImageLayout({ naturalChartHeight, aspectRatio })
  await saveComparisonChartImage({ filename, writeBlob, width: layout.width,
    chart: <GoldenglowResistanceComparisonImage snapshot={snapshot} aspectRatio={aspectRatio} /> })
}
