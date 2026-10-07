import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { getChartImageLayout } from '../lib/chartImageLayout'
import type { SurtrRemnantAttackAssumptions } from '../lib/surtrRemnantAttacks'
import { getSurtrRemnantAttackChartHeight, type SurtrRemnantChartKind, type SurtrRemnantChartSeries } from '../lib/surtrRemnantChart'
import { ChartImageFrame } from './ChartImageFrame'
import { SurtrRemnantAttackChart } from './SurtrRemnantAttackChart'
import './SurtrDurationChart.css'

export interface SurtrRemnantAttackChartImageProps {
  id: string
  series: readonly SurtrRemnantChartSeries[]
  assumptions: SurtrRemnantAttackAssumptions
  samples: readonly number[]
  ctLimit: number
  kind: SurtrRemnantChartKind
  showValues: boolean
  showBoundaries: boolean
  potential: number
  blocking: boolean
  step: number
  filename?: string
  aspectRatio?: number
  onLayout?: (size: { width: number; height: number }) => void
}

function ImageLegend({ series, kind }: Pick<SurtrRemnantAttackChartImageProps, 'series' | 'kind'>) {
  return <ul className="chart-image-frame-legend-list" aria-label="装備">
    {series.map(item => {
      return <li className="chart-image-frame-legend-item" key={item.id}>
        <svg className="chart-image-frame-legend-swatch" width="18" height="12" aria-hidden="true">
          {kind === 'step'
            ? <line x1="0" x2="18" y1="6" y2="6" stroke={item.color}
              strokeWidth="2.5" />
            : <rect x="0" y="2" width="18" height="8" fill={item.color} />}
        </svg>
        <span>{item.label}</span>
      </li>
    })}
  </ul>
}

export function SurtrRemnantAttackChartImage({ id, series, assumptions, samples, ctLimit, kind, showValues,
  showBoundaries, potential, blocking, step, aspectRatio, onLayout }: SurtrRemnantAttackChartImageProps) {
  const snapshotKey = JSON.stringify([id, series, assumptions, samples, ctLimit, kind, showValues, showBoundaries,
    potential, blocking, step, aspectRatio])
  return <ChartImageFrame key={snapshotKey} className="surtr-duration-chart-image" title="余燼中の命中回数"
    conditions={`潜在${potential}・${blocking ? 'ブロック中' : '非ブロック'}・仮定の試算`}
    legend={kind === 'step' ? undefined : <ImageLegend series={series} kind={kind} />} axisTitle="発動直前の残りCT（s）"
    naturalChartHeight={getSurtrRemnantAttackChartHeight(kind, series.length)} aspectRatio={aspectRatio} onLayout={onLayout}>
    {({ width, height }) => <SurtrRemnantAttackChart series={series} assumptions={assumptions}
      samples={samples} ctLimit={ctLimit} kind={kind} showValues={showValues} showBoundaries={showBoundaries}
      width={width} height={height} image />}
  </ChartImageFrame>
}

function ImagePreview(props: Omit<SurtrRemnantAttackChartImageProps, 'onLayout'>) {
  const previewRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(600)
  const [size, setSize] = useState(() => getChartImageLayout({
    naturalChartHeight: getSurtrRemnantAttackChartHeight(props.kind, props.series.length), aspectRatio: props.aspectRatio,
  }))
  useLayoutEffect(() => {
    const element = previewRef.current
    if (!element) return
    const measure = () => setAvailableWidth(Math.max(1, element.clientWidth))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const updateLayout = useCallback((layout: { width: number; height: number }) => setSize(current =>
    current.width === layout.width && current.height === layout.height ? current : { ...current, ...layout }), [])
  const scale = Math.min(availableWidth / size.width, 380 / size.height, 1)
  const pixelRatio = Math.min(2, 16_000 / size.width, 16_000 / size.height,
    Math.sqrt(32_000_000 / size.width / size.height))
  return <div className="surtr-duration-chart-preview">
    <div className="surtr-duration-chart-preview-heading"><span>プレビュー</span><span>PNG</span></div>
    <div ref={previewRef} className="surtr-duration-chart-preview-frame" style={{ height: Math.ceil(size.height * scale) }}>
      <div className="surtr-duration-chart-preview-position" style={{ width: size.width, height: size.height,
        left: (availableWidth - size.width * scale) / 2, transform: `scale(${scale})` }}>
        <SurtrRemnantAttackChartImage {...props} onLayout={updateLayout} />
      </div>
    </div>
    <span className="surtr-duration-chart-preview-size" aria-live="polite">
      {Math.floor(size.width * pixelRatio).toLocaleString('ja-JP')} × {Math.floor(size.height * pixelRatio).toLocaleString('ja-JP')} px
    </span>
  </div>
}

export function SurtrRemnantAttackChartImagePreview(props: Omit<SurtrRemnantAttackChartImageProps, 'onLayout'>) {
  return <ImagePreview key={JSON.stringify(props)} {...props} />
}
