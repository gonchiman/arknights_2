import { useLayoutEffect, useRef, useState, type ComponentProps } from 'react'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { GoldenglowPerformanceGroupedBarChart } from './GoldenglowPerformanceGroupedBarChart'
import './GoldenglowGroupedBarImagePreview.css'

/** Scale the same completed chart used by PNG export, retaining its output dimensions. */
export function GoldenglowGroupedBarImagePreview({ chartProps, aspectRatio }: {
  chartProps: ComponentProps<typeof GoldenglowPerformanceGroupedBarChart>
  aspectRatio?: number
}) {
  const previewRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(600)
  const [size, setSize] = useState<{ width: number; height: number }>(() =>
    getChartImageLayout({ naturalChartHeight: 334, aspectRatio }))
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
  return <div className="gg-grouped-image-preview">
    <div className="gg-grouped-image-preview-heading"><span>プレビュー</span><span>PNG</span></div>
    <div ref={previewRef} className="gg-grouped-image-preview-frame" style={{ height: Math.ceil(size.height * scale) }}>
      <div className="gg-grouped-image-preview-position" style={{ width: size.width, height: size.height,
        left: (availableWidth - size.width * scale) / 2, transform: `scale(${scale})` }}>
        <GoldenglowPerformanceGroupedBarChart {...chartProps} imageOutput aspectRatio={aspectRatio} onLayout={setSize} />
      </div>
    </div>
    <span className="gg-grouped-image-preview-size" aria-live="polite">
      {Math.floor(size.width * pixelRatio).toLocaleString('ja-JP')} × {Math.floor(size.height * pixelRatio).toLocaleString('ja-JP')} px
    </span>
  </div>
}
