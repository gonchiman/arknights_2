import { useLayoutEffect, useRef, useState, type ComponentProps } from 'react'
import type { EnemyHistogramSnapshot } from '../lib/enemyHistogramSnapshot'
import { CHART_IMAGE_STACK_HEADER_HEIGHT, getChartImageStackLayout } from '../lib/chartImageStackLayout'
import { getHpChartValueAxis, isValidHpChartYAxisRange } from '../lib/goldenglowTargetSwitchHpAxis'
import { getSurtrDpsResistanceSamples, normalizeSurtrDpsResistanceRange } from '../lib/surtrDpsResistance'
import { ChartImageStackFrame, type ChartImageStackPanel } from './ChartImageStackFrame'
import { EnemyHistogramSnapshotPlot } from './EnemyStatisticsPanel'
import { SurtrDpsSnapshotPlot, SurtrDpsImageLegend, type SurtrDpsChartSeries, type SurtrDpsChartYAxis } from './SurtrDpsChart'

interface SurtrDpsBlockComparison {
  blocking: boolean
  series: SurtrDpsChartSeries[]
  conditions: string
}

type Props = Omit<ComponentProps<typeof SurtrDpsSnapshotPlot>, 'width' | 'height' | 'reservedOverflow' | 'onOverflow'> & {
  title: string
  conditions: string
  histogram?: EnemyHistogramSnapshot | null
  blockComparisons?: readonly SurtrDpsBlockComparison[]
  blockComparisonConditions?: string
  aspectRatio?: number
  onLayout?: (size: { width: number; height: number }) => void
}

export const getSurtrCombinedImageLayout = (aspectRatio?: number, dpsPanelCount = 1, includeHistogram = true) => getChartImageStackLayout({
  panels: Array.from({ length: Math.max(1, Math.trunc(dpsPanelCount)) + Number(includeHistogram) }, () => ({ naturalChartHeight: 334 })), aspectRatio,
  headerHeight: dpsPanelCount > 1 ? CHART_IMAGE_STACK_HEADER_HEIGHT : 0,
})

function getSharedYAxis(comparisons: readonly SurtrDpsBlockComparison[], dps: Omit<Props, 'histogram' | 'blockComparisons' | 'aspectRatio' | 'onLayout'>): SurtrDpsChartYAxis {
  const range = normalizeSurtrDpsResistanceRange(dps.resistanceRange)
  const kind = dps.kind ?? 'line'
  const samples = new Set(getSurtrDpsResistanceSamples(dps.barStep ?? 20, range))
  // Fit the same points the snapshot renderer keeps, including a selected extra bar.
  const values = comparisons.flatMap(({ series }) => series.flatMap(item => item.points.flatMap(point => (
    Number.isFinite(point.x) && point.x >= range.min && point.x <= range.max
    && (kind !== 'bar' || samples.has(point.x) || point.x === dps.selectedResistance)
    && point.value !== null && Number.isFinite(point.value) ? [point.value] : []
  ))))
  const manualRange = { min: dps.yAxis?.min ?? Number.NaN, max: dps.yAxis?.max ?? Number.NaN }
  const mode = dps.yAxis?.mode === 'manual' && !isValidHpChartYAxisRange(manualRange) ? 'zero' : dps.yAxis?.mode ?? 'zero'
  const axis = getHpChartValueAxis(kind === 'bar' && mode === 'auto' ? [...values, 0] : values,
    { mode, nonNegative: (dps.metric ?? 'total') === 'total', manualRange })
  return { mode: 'manual', min: axis.lowerLimit, max: axis.upperLimit }
}

/** Every panel renders the same frozen input in the preview and the saved PNG. */
export function SurtrCombinedChartImage({ histogram, blockComparisons, blockComparisonConditions, aspectRatio, onLayout, ...dps }: Props) {
  const comparisons = blockComparisons?.length ? blockComparisons : undefined
  const sharedYAxis = comparisons ? getSharedYAxis(comparisons, dps) : undefined
  const panels: ChartImageStackPanel[] = comparisons ? comparisons.map(comparison => {
    const title = comparison.blocking ? '対象を自身でブロック' : '未ブロック'
    return {
      id: `dps-${comparison.blocking ? 'blocking' : 'nonblocking'}`, title,
      axisTitle: '敵の術耐性', naturalChartHeight: 334,
      render: size => <SurtrDpsSnapshotPlot {...dps} series={comparison.series} title={`${dps.title}・${title}`} yAxis={sharedYAxis} {...size} />,
    }
  }) : [{
      id: 'dps', title: dps.title, conditions: dps.conditions, axisTitle: '敵の術耐性',
      naturalChartHeight: 334, informationPlacement: 'top-right-box',
      legend: <SurtrDpsImageLegend series={dps.series} kind={dps.kind ?? 'bar'} />,
      render: size => <SurtrDpsSnapshotPlot {...dps} {...size} />,
    }]
  if (histogram) panels.push({
      id: 'distribution', title: histogram.title, conditions: histogram.conditions, axisTitle: histogram.axisTitle,
      naturalChartHeight: 334, informationPlacement: 'top-right-box', className: 'enemy-chart-image',
      render: ({ width, height, reservedOverflow, onOverflow }) => <EnemyHistogramSnapshotPlot snapshot={histogram}
        width={width} height={height} reservedLabelHeight={reservedOverflow} onLabelOverflow={onOverflow} />,
    })
  const sharedHeader = comparisons ? {
    title: dps.title,
    legend: <SurtrDpsImageLegend series={comparisons[0].series} kind={dps.kind ?? 'line'} />,
    conditions: blockComparisonConditions ?? 'ブロック状態比較',
  } : undefined
  const snapshotKey = JSON.stringify([dps, comparisons, blockComparisonConditions, histogram, aspectRatio])
  return <ChartImageStackFrame key={snapshotKey} aspectRatio={aspectRatio} onLayout={onLayout} panels={panels} sharedHeader={sharedHeader} />
}

export function SurtrCombinedChartImagePreview(props: Omit<Props, 'onLayout'>) {
  const previewRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(600)
  const [size, setSize] = useState<{ width: number; height: number }>(() => getSurtrCombinedImageLayout(
    props.aspectRatio, props.blockComparisons?.length || 1, !!props.histogram,
  ))
  useLayoutEffect(() => {
    const element = previewRef.current
    if (!element) return
    const measure = () => setAvailableWidth(Math.max(1, element.clientWidth))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const scale = Math.min(availableWidth / size.width, 460 / size.height, 1)
  const pixelRatio = Math.min(2, 16_000 / size.width, 16_000 / size.height, Math.sqrt(32_000_000 / size.width / size.height))
  return <div className="surtr-dps-chart-preview">
    <div className="surtr-dps-chart-preview-heading"><span>プレビュー</span><span>PNG</span></div>
    <div ref={previewRef} className="surtr-dps-chart-preview-frame" style={{ height: Math.ceil(size.height * scale) }}>
      <div className="surtr-dps-chart-preview-position" style={{ width: size.width, height: size.height,
        left: (availableWidth - size.width * scale) / 2, transform: `scale(${scale})` }}>
        <SurtrCombinedChartImage {...props} onLayout={setSize} />
      </div>
    </div>
    <span className="surtr-dps-chart-preview-size" aria-live="polite">
      {Math.floor(size.width * pixelRatio).toLocaleString('ja-JP')} × {Math.floor(size.height * pixelRatio).toLocaleString('ja-JP')} px
    </span>
  </div>
}
