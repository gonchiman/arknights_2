import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { getChartImageLayout } from '../lib/chartImageLayout'
import type { SurtrRemnantAttackAssumptions } from '../lib/surtrRemnantAttacks'
import { ChartImageFrame } from './ChartImageFrame'
import { getGroupedResistanceChartSeries, GroupedResistanceComparisonChartSvg,
  type GroupedResistanceComparisonSeries } from './GroupedResistanceComparisonChart'
import './SurtrDurationChart.css'

export interface SurtrRemnantDamageChartImageProps {
  id: string
  series: readonly GroupedResistanceComparisonSeries[]
  cts: readonly number[]
  resistances: readonly number[]
  potential: number
  blocking: boolean
  assumptions: SurtrRemnantAttackAssumptions
  filename?: string
  aspectRatio?: number
  onLayout?: (size: { width: number; height: number }) => void
}

const NATURAL_CHART_HEIGHT = 334
const CT_AXIS = { label: '残りCT', formatValue: (value: number) => `${value.toFixed(2)} s`, minimum: 0 }

function ImageLegend({ series }: Pick<SurtrRemnantDamageChartImageProps, 'series'>) {
  return <ul className="chart-image-frame-legend-list" aria-label="装備">
    {getGroupedResistanceChartSeries(series).map(item => <li className="chart-image-frame-legend-item" key={item.id}>
      <svg className="chart-image-frame-legend-swatch" width="18" height="12" aria-hidden="true">
        <rect x="0" y="2" width="18" height="8" fill={item.color} />
      </svg>
      <span>{item.label}</span>
    </li>)}
  </ul>
}

export function SurtrRemnantDamageChartImage({ id, series, cts, resistances, potential, blocking,
  assumptions, aspectRatio, onLayout }: SurtrRemnantDamageChartImageProps) {
  const snapshotKey = JSON.stringify([id, series, cts, resistances, potential, blocking, assumptions, aspectRatio])
  return <ChartImageFrame key={snapshotKey} className="surtr-duration-chart-image" title="余燼中の総ダメージ"
    conditions={`潜在${potential}・${blocking ? 'ブロック中' : '非ブロック'}・単体`}
    legend={<ImageLegend series={series} />} axisTitle="残りCT（棒の下の数字：術耐性）"
    naturalChartHeight={NATURAL_CHART_HEIGHT} aspectRatio={aspectRatio} onLayout={onLayout}>
    {({ width, height }) => <GroupedResistanceComparisonChartSvg series={series} groupValues={cts}
      resistanceValues={resistances} groupAxis={CT_AXIS} metric="total" baselineId=""
      digits={0} gridStyle="dashed" showMissingValues missingValueLabel="—（範囲外）"
      width={width} height={height} />}
  </ChartImageFrame>
}

function ImagePreview(props: Omit<SurtrRemnantDamageChartImageProps, 'onLayout'>) {
  const previewRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(600)
  const [size, setSize] = useState(() => getChartImageLayout({
    naturalChartHeight: NATURAL_CHART_HEIGHT, aspectRatio: props.aspectRatio,
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
        <SurtrRemnantDamageChartImage {...props} onLayout={updateLayout} />
      </div>
    </div>
    <span className="surtr-duration-chart-preview-size" aria-live="polite">
      {Math.floor(size.width * pixelRatio).toLocaleString('ja-JP')} × {Math.floor(size.height * pixelRatio).toLocaleString('ja-JP')} px
    </span>
  </div>
}

export function SurtrRemnantDamageChartImagePreview(props: Omit<SurtrRemnantDamageChartImageProps, 'onLayout'>) {
  return <ImagePreview key={JSON.stringify(props)} {...props} />
}
