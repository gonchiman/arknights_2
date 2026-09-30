import { useLayoutEffect, useRef, useState, type ComponentProps } from 'react'
import type { EnemyHistogramSnapshot } from '../lib/enemyHistogramSnapshot'
import { getChartImageStackLayout } from '../lib/chartImageStackLayout'
import { ChartImageStackFrame } from './ChartImageStackFrame'
import { EnemyHistogramSnapshotPlot } from './EnemyStatisticsPanel'
import { SurtrDpsSnapshotPlot, SurtrDpsImageLegend } from './SurtrDpsChart'

type Props = Omit<ComponentProps<typeof SurtrDpsSnapshotPlot>, 'width' | 'height' | 'reservedOverflow' | 'onOverflow'> & {
  title: string
  conditions: string
  histogram: EnemyHistogramSnapshot
  aspectRatio?: number
  onLayout?: (size: { width: number; height: number }) => void
}

export const getSurtrCombinedImageLayout = (aspectRatio?: number) => getChartImageStackLayout({
  panels: [{ naturalChartHeight: 334 }, { naturalChartHeight: 334 }], aspectRatio,
})

/** Both panels render the same frozen input in the preview and the saved PNG. */
export function SurtrCombinedChartImage({ histogram, aspectRatio, onLayout, ...dps }: Props) {
  return <ChartImageStackFrame aspectRatio={aspectRatio} onLayout={onLayout} panels={[
    {
      id: 'dps', title: dps.title, conditions: dps.conditions, axisTitle: '敵の術耐性',
      naturalChartHeight: 334, informationPlacement: 'top-right-box',
      legend: <SurtrDpsImageLegend series={dps.series} kind={dps.kind ?? 'bar'} />,
      render: size => <SurtrDpsSnapshotPlot {...dps} {...size} />,
    },
    {
      id: 'distribution', title: histogram.title, conditions: histogram.conditions, axisTitle: histogram.axisTitle,
      naturalChartHeight: 334, informationPlacement: 'top-right-box', className: 'enemy-chart-image',
      render: ({ width, height, reservedOverflow, onOverflow }) => <EnemyHistogramSnapshotPlot snapshot={histogram}
        width={width} height={height} reservedLabelHeight={reservedOverflow} onLabelOverflow={onOverflow} />,
    },
  ]} />
}

export function SurtrCombinedChartImagePreview(props: Omit<Props, 'onLayout'>) {
  const previewRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(600)
  const [size, setSize] = useState<{ width: number; height: number }>(() => getSurtrCombinedImageLayout(props.aspectRatio))
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
