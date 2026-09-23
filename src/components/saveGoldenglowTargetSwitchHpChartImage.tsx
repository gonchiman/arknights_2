import { useLayoutEffect, useRef, useState } from 'react'
import type { HpComparisonDisplaySeries, HpComparisonMetric } from '../lib/goldenglowTargetSwitchHpComparison'
import type { HpChartYAxisMode, HpChartYAxisRange } from '../lib/goldenglowTargetSwitchHpAxis'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { getHpDamageBreakdownComponents, type HpComparisonBarMode } from '../lib/goldenglowTargetSwitchHpBreakdown'
import { ChartImageFrame } from './ChartImageFrame'
import { GoldenglowDamagePatternSwatch } from './GoldenglowDamagePattern'
import { GoldenglowTargetSwitchHpChartSvg, getHpComparisonSeriesStyles, type HpChartGridStyle } from './GoldenglowTargetSwitchHpChart'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import './saveGoldenglowTargetSwitchHpChartImage.css'

export interface HpChartImageSnapshot {
  series: readonly HpComparisonDisplaySeries[]
  minHp: number
  maxHp: number
  metric: HpComparisonMetric
  baselineId: string
  digits: number
  title: string
  conditions: string
  notice?: string
  chartKind?: 'line' | 'bar'
  barMode?: HpComparisonBarMode
  showHpRanks?: boolean
  gridStyle?: HpChartGridStyle
  yAxisMode?: HpChartYAxisMode
  manualYAxisRange?: HpChartYAxisRange
  barHps?: readonly number[]
  hideBaseline?: boolean
}

const naturalChartHeight = 334

interface HpChartImageProps {
  snapshot: HpChartImageSnapshot
  aspectRatio?: number
  onLayout?: (size: { width: number; height: number }) => void
}

export function GoldenglowTargetSwitchHpChartImage({ snapshot, aspectRatio, onLayout }: HpChartImageProps) {
  const title = snapshot.notice ? `${snapshot.title}（${snapshot.notice}）` : snapshot.title
  const styles = getHpComparisonSeriesStyles(snapshot.series)
  const isBreakdown = snapshot.chartKind === 'bar' && snapshot.metric === 'total'
    && (snapshot.barMode === 'breakdown' || snapshot.barMode === 'composition')
  const visibleSeries = snapshot.series.filter((item) => !snapshot.hideBaseline || item.id !== snapshot.baselineId)
  const components = isBreakdown ? getHpDamageBreakdownComponents(visibleSeries) : []
  return <ChartImageFrame className="gg2-chart-image" title={title}
    conditions={snapshot.conditions} axisTitle="敵HP" naturalChartHeight={naturalChartHeight}
    aspectRatio={aspectRatio} onLayout={onLayout}
    legend={<ul className="chart-image-frame-legend-list" aria-label={isBreakdown ? '攻撃の種類とMODの配色' : '比較するMOD'}>
      {components.map((component) => <li className="chart-image-frame-legend-item" key={component.key}>
        <GoldenglowDamagePatternSwatch componentKey={component.key}
          className="chart-image-frame-legend-swatch" width={18} height={12} />
        <span>{component.label}</span>
      </li>)}
      {snapshot.series.map((item, index) => {
        if (snapshot.hideBaseline && item.id === snapshot.baselineId) return null
        const style = styles[index]
        return <li className="chart-image-frame-legend-item" key={item.id}>
          <svg className="chart-image-frame-legend-swatch" width="18" height="12" aria-hidden="true" style={{ color: style.color }}>
            {snapshot.chartKind === 'bar'
              ? <rect x="4" y="1" width="10" height="10" fill="currentColor" />
              : <line x1="0" x2="18" y1="6" y2="6" stroke="currentColor" strokeWidth="2" strokeDasharray={style.dashArray} />}
          </svg>
          <span>{item.label}{snapshot.metric !== 'total' && item.id === snapshot.baselineId ? '（基準）' : ''}</span>
        </li>
      })}
    </ul>}>
    {({ width, height }) => <GoldenglowTargetSwitchHpChartSvg series={snapshot.series}
      minHp={snapshot.minHp} maxHp={snapshot.maxHp} metric={snapshot.metric} digits={snapshot.digits} width={width} height={height}
      chartKind={snapshot.chartKind} barMode={snapshot.barMode} showHpRanks={snapshot.showHpRanks} gridStyle={snapshot.gridStyle}
      yAxisMode={snapshot.yAxisMode} manualYAxisRange={snapshot.manualYAxisRange}
      barHps={snapshot.barHps} hideBaseline={snapshot.hideBaseline} baselineId={snapshot.baselineId} />}
  </ChartImageFrame>
}

/** Scale the completed image for the dialog without changing its output dimensions. */
export function GoldenglowTargetSwitchHpChartImagePreview({ snapshot, aspectRatio }: Omit<HpChartImageProps, 'onLayout'>) {
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
        <GoldenglowTargetSwitchHpChartImage snapshot={snapshot} aspectRatio={aspectRatio} onLayout={setSize} />
      </div>
    </div>
    <span className="gg2-chart-image-preview-size" aria-live="polite">
      {Math.floor(size.width * pixelRatio).toLocaleString('ja-JP')} × {Math.floor(size.height * pixelRatio).toLocaleString('ja-JP')} px
    </span>
  </div>
}

export async function saveGoldenglowTargetSwitchHpChartImage(
  snapshot: HpChartImageSnapshot,
  filename: string,
  writeBlob?: (blob: Blob) => Promise<void>,
  aspectRatio?: number,
): Promise<void> {
  const layout = getChartImageLayout({ naturalChartHeight, aspectRatio })
  await saveComparisonChartImage({
    filename,
    writeBlob,
    width: layout.width,
    chart: <GoldenglowTargetSwitchHpChartImage snapshot={snapshot} aspectRatio={aspectRatio} />,
  })
}
