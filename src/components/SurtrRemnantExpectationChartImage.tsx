import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getChartImageLayout } from '../lib/chartImageLayout'
import type { SurtrRemnantAttackAssumptions } from '../lib/surtrRemnantAttacks'
import { ChartImageFrame } from './ChartImageFrame'
import { SurtrDpsImageLegend, SurtrDpsSnapshotPlot, type SurtrDpsChartSeries } from './SurtrDpsChart'

export interface SurtrRemnantExpectationChartImageProps {
  id: string
  series: SurtrDpsChartSeries[]
  kind: 'bar' | 'line'
  resistanceStep: number
  resistances: readonly number[]
  potential: number
  blocking: boolean
  assumptions: SurtrRemnantAttackAssumptions
  showValues: boolean
  digits: number
  aspectRatio?: number
  onLayout?: (size: { width: number; height: number }) => void
}

const NATURAL_CHART_HEIGHT = 334
const TITLE = '余燼中の総ダメージ期待値'

export function SurtrRemnantExpectationChartImage({ id, series, kind, resistanceStep, resistances,
  potential, blocking, assumptions, showValues, digits, aspectRatio, onLayout }: SurtrRemnantExpectationChartImageProps) {
  const range = useMemo(() => {
    const values = resistances.filter(Number.isFinite)
    return values.length ? { min: Math.min(...values), max: Math.max(...values) } : { min: 0, max: 100 }
  }, [resistances])
  const request = JSON.stringify([id, series, kind, resistanceStep, resistances, potential, blocking,
    assumptions, showValues, digits, aspectRatio])
  const [expansion, setExpansion] = useState({ request, overflow: 0 })
  const overflow = expansion.request === request ? expansion.overflow : 0
  const reserveOverflow = useCallback((required: number) => {
    setExpansion(current => current.request === request && current.overflow >= required
      ? current : { request, overflow: Math.max(current.request === request ? current.overflow : 0, required) })
  }, [request])
  return <ChartImageFrame key={request} className="surtr-dps-chart-image" title={TITLE}
    conditions={`潜在${potential}・${blocking ? 'ブロック中' : '非ブロック'}・CT一様`}
    legend={<SurtrDpsImageLegend series={series} kind={kind} />} axisTitle="敵の術耐性"
    naturalChartHeight={NATURAL_CHART_HEIGHT + overflow} aspectRatio={aspectRatio} onLayout={onLayout}>
    {({ width, height }) => <SurtrDpsSnapshotPlot series={series} kind={kind} barStep={resistanceStep}
      resistanceRange={range} gridStyle="dashed" precision={digits} metric="total" title={TITLE}
      valueAxisLabel="総ダメージ期待値" yAxis={{ mode: 'zero' }} showValues={showValues}
      showResistanceRanks={false} width={width} height={height} reservedOverflow={overflow}
      onOverflow={reserveOverflow} />}
  </ChartImageFrame>
}

function ImagePreview(props: Omit<SurtrRemnantExpectationChartImageProps, 'onLayout'>) {
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
  return <div className="surtr-dps-chart-preview">
    <div className="surtr-dps-chart-preview-heading"><span>プレビュー</span><span>PNG</span></div>
    <div ref={previewRef} className="surtr-dps-chart-preview-frame" style={{ height: Math.ceil(size.height * scale) }}>
      <div className="surtr-dps-chart-preview-position" style={{ width: size.width, height: size.height,
        left: (availableWidth - size.width * scale) / 2, transform: `scale(${scale})` }}>
        <SurtrRemnantExpectationChartImage {...props} onLayout={updateLayout} />
      </div>
    </div>
    <span className="surtr-dps-chart-preview-size" aria-live="polite">
      {Math.floor(size.width * pixelRatio).toLocaleString('ja-JP')} × {Math.floor(size.height * pixelRatio).toLocaleString('ja-JP')} px
    </span>
  </div>
}

export function SurtrRemnantExpectationChartImagePreview(props: Omit<SurtrRemnantExpectationChartImageProps, 'onLayout'>) {
  return <ImagePreview key={JSON.stringify(props)} {...props} />
}
