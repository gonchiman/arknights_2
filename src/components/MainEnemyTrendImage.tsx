import { useLayoutEffect, useRef, useState } from 'react'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { ChartImageFrame } from './ChartImageFrame'
import { MainEnemyTrendLegend, MainEnemyTrendPlot, MAIN_ENEMY_TREND_NATURAL_HEIGHT, hasMainEnemyTrendPartialCoverage,
  MAIN_ENEMY_TREND_METRIC_LABELS, type MainEnemyTrendPoint } from './MainEnemyTrendChart'
import './EnemyChartImage.css'

export interface MainEnemyTrendImageSnapshot {
  id: string
  points: MainEnemyTrendPoint[]
  metric: 'hp' | 'atk' | 'def' | 'res'
  kind: 'line' | 'bar'
  showMean: boolean
  showMedian: boolean
  conditions: string
  filename: string
}

export function MainEnemyTrendImage({ snapshot, aspectRatio, onLayout }: {
  snapshot: MainEnemyTrendImageSnapshot
  aspectRatio?: number
  onLayout?: (size: { width: number; height: number }) => void
}) {
  const partial = snapshot.points.some(hasMainEnemyTrendPartialCoverage)
  return <ChartImageFrame key={`${snapshot.id}:${snapshot.kind}:${aspectRatio ?? 'auto'}`}
    title={`メイン敵${MAIN_ENEMY_TREND_METRIC_LABELS[snapshot.metric]}の推移`}
    conditions={snapshot.conditions} axisTitle="章" naturalChartHeight={MAIN_ENEMY_TREND_NATURAL_HEIGHT}
    aspectRatio={aspectRatio} onLayout={onLayout}
    legend={<MainEnemyTrendLegend kind={snapshot.kind} showMean={snapshot.showMean} showMedian={snapshot.showMedian} showPartialCoverage={partial} />}>
    {({ width, height }) => <MainEnemyTrendPlot {...snapshot} width={width} height={height} showAxisTitle={false} />}
  </ChartImageFrame>
}

export function MainEnemyTrendImagePreview({ snapshot, aspectRatio }: {
  snapshot: MainEnemyTrendImageSnapshot
  aspectRatio?: number
}) {
  const previewRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(600)
  const [size, setSize] = useState(() => getChartImageLayout({ naturalChartHeight: MAIN_ENEMY_TREND_NATURAL_HEIGHT, aspectRatio }))
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
  return <div className="enemy-chart-image-preview">
    <div className="enemy-chart-image-preview-heading"><span>プレビュー</span><span>PNG</span></div>
    <div ref={previewRef} className="enemy-chart-image-preview-frame" style={{ height: Math.ceil(size.height * scale) }}>
      <div className="enemy-chart-image-preview-position" style={{ width: size.width, height: size.height,
        left: (availableWidth - size.width * scale) / 2, transform: `scale(${scale})` }}>
        <MainEnemyTrendImage snapshot={snapshot} aspectRatio={aspectRatio} onLayout={(next) => setSize((current) =>
          next.width === current.width && next.height === current.height ? current : { ...current, ...next })} />
      </div>
    </div>
    <span className="enemy-chart-image-preview-size" aria-live="polite">
      {Math.floor(size.width * pixelRatio).toLocaleString('ja-JP')} × {Math.floor(size.height * pixelRatio).toLocaleString('ja-JP')} px
    </span>
  </div>
}
