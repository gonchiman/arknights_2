import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { getTableImageDimensions, parseTableImageAspect, type TableImageAspect } from '../lib/tableImageAspect'
import { getSurtrUnequippedTableImageFilename, type SurtrUnequippedTableImageMetadata } from '../lib/surtrUnequippedTableImageFilename'
import { getUnequippedMetricLabel, SurtrUnequippedComparisonTableContent, type SurtrUnequippedComparisonTableData } from './SurtrUnequippedComparisonTableContent'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import './SurtrS3Page.css'
import './SurtrDurationChart.css'
import './SurtrUnequippedComparisonTableImage.css'

export interface SurtrUnequippedComparisonTableImageSnapshot extends SurtrUnequippedComparisonTableData {
  metadata: SurtrUnequippedTableImageMetadata
}

interface ImageProps extends SurtrUnequippedComparisonTableImageSnapshot {
  aspectRatio?: number
  exporting?: boolean
  onLayout?: (size: { width: number; height: number }) => void
  onLayoutError?: (error: unknown) => void
}

const initialWidthFor = (snapshot: SurtrUnequippedComparisonTableData) => {
  const targets = snapshot.series.filter(item => item.id !== 'none').length
  const conditions = snapshot.blockingComparison === undefined ? 1 : 2
  const columns = (snapshot.layout === 'combined' ? 2 + targets * 2 * conditions : 1 + targets * conditions)
    + (snapshot.rankMode === 'merged' ? 1 : 0)
  return Math.max(640, columns * 150)
}

function tableAspect(aspectRatio?: number): TableImageAspect | null {
  if (aspectRatio === undefined) return null
  if (!Number.isFinite(aspectRatio) || aspectRatio < 0.1 || aspectRatio > 10) {
    throw new Error('表の縦横比は1:10〜10:1の範囲で指定してください。')
  }
  for (let height = 1; height <= 100; height += 1) {
    const width = Math.round(aspectRatio * height)
    if (width >= 1 && width <= 100 && width / height === aspectRatio) {
      const aspect = parseTableImageAspect(String(width), String(height))
      if (aspect) return aspect
    }
  }
  throw new Error('画像の縦横比が正しくありません。')
}

export function SurtrUnequippedComparisonTableImage({ metadata, aspectRatio, exporting = false, onLayout, onLayoutError, ...data }: ImageProps) {
  const imageRef = useRef<HTMLElement>(null)
  const initialWidth = initialWidthFor(data)
  const snapshotKey = JSON.stringify([data.series, data.baseline, data.blockingComparison, data.resistances, data.layout, data.metric, data.precision, data.rankMode, data.columnOrder, data.colorScale, metadata])
  useLayoutEffect(() => {
    const image = imageRef.current
    const table = image?.querySelector('table')
    if (!image || !table) return
    let cancelled = false
    const measure = () => {
      if (cancelled) return
      image.style.display = ''
      try {
        const size = getTableImageDimensions({ initialWidth, aspect: tableAspect(aspectRatio), measureHeight: width => {
          image.style.width = `${width}px`
          image.style.height = 'auto'
          table.style.height = 'auto'
          return image.offsetHeight
        } })
        image.style.width = `${size.width}px`
        image.style.height = 'auto'
        table.style.height = 'auto'
        const chromeHeight = image.offsetHeight - table.offsetHeight
        table.style.height = `${Math.max(table.offsetHeight, size.height - chromeHeight)}px`
        image.style.height = `${size.height}px`
        if (image.offsetWidth !== size.width || image.offsetHeight !== size.height || image.scrollWidth > size.width
          || image.scrollHeight > size.height) throw new Error('指定した縦横比に表を調整できませんでした。')
        if (exporting && image.parentElement) image.parentElement.style.width = `${size.width}px`
        onLayout?.(size)
      } catch (error) {
        image.style.display = 'none'
        onLayoutError?.(error)
      }
    }
    measure()
    void document.fonts.ready.then(measure)
    document.fonts.addEventListener('loadingdone', measure)
    return () => { cancelled = true; document.fonts.removeEventListener('loadingdone', measure) }
  }, [snapshotKey, initialWidth, aspectRatio, exporting, onLayout, onLayoutError])

  return <figure ref={imageRef} className="surtr-unequipped-table-image" style={{ width: initialWidth }} aria-label="スルト S3 未装備との比較表">
    <SurtrUnequippedComparisonTableContent {...data} footer={<div className="surtr-unequipped-table-image-conditions">
      <span>{getUnequippedMetricLabel(data.metric)}・基準：未装備</span>
      <span>S3 {metadata.skillLabel}・昇進2 Lv.{metadata.level}・信頼度{metadata.trust}・潜在{metadata.potential}・{data.blockingComparison !== undefined ? '未ブロック／対象を自身でブロック' : metadata.blocking ? '対象を自身でブロック' : '未ブロック'}</span>
    </div>} />
  </figure>
}

export function SurtrUnequippedComparisonTableImagePreview({ onLayoutReady, ...props }: Omit<ImageProps, 'onLayout' | 'exporting'> & {
  onLayoutReady?: () => void
}) {
  const previewRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(600)
  const [size, setSize] = useState({ width: initialWidthFor(props), height: 420 })
  const [error, setError] = useState('')
  useLayoutEffect(() => {
    const element = previewRef.current
    if (!element) return
    const measure = () => setAvailableWidth(Math.max(1, element.clientWidth))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const updateLayout = useCallback((layout: { width: number; height: number }) => {
    setError('')
    setSize(current => current.width === layout.width && current.height === layout.height ? current : layout)
    onLayoutReady?.()
  }, [onLayoutReady])
  const reportError = useCallback((cause: unknown) => {
    setError(cause instanceof Error ? cause.message : '表のプレビューを表示できませんでした。')
    props.onLayoutError?.(cause)
  }, [props.onLayoutError])
  const scale = Math.min(availableWidth / size.width, 380 / size.height, 1)
  const pixelRatio = Math.min(2, 16_000 / size.width, 16_000 / size.height, Math.sqrt(32_000_000 / size.width / size.height))
  return <div className="surtr-duration-chart-preview">
    <div className="surtr-duration-chart-preview-heading"><span>プレビュー</span><span>PNG</span></div>
    <div ref={previewRef} className="surtr-duration-chart-preview-frame" style={{ height: Math.ceil(size.height * scale) }}>
      <div className="surtr-duration-chart-preview-position" style={{ width: size.width, height: size.height,
        left: (availableWidth - size.width * scale) / 2, transform: `scale(${scale})` }}>
        <SurtrUnequippedComparisonTableImage {...props} onLayout={updateLayout} onLayoutError={reportError} />
      </div>
    </div>
    {error ? <p className="surtr-unequipped-table-image-error" role="alert">{error}</p> : <span className="surtr-duration-chart-preview-size" aria-live="polite">
      {Math.floor(size.width * pixelRatio).toLocaleString('ja-JP')} × {Math.floor(size.height * pixelRatio).toLocaleString('ja-JP')} px
    </span>}
  </div>
}

export async function saveSurtrUnequippedComparisonTableImage({ snapshot, filename, aspectRatio, writeBlob }: {
  snapshot: SurtrUnequippedComparisonTableImageSnapshot
  filename?: string
  aspectRatio?: number
  writeBlob?: (blob: Blob) => Promise<void>
}): Promise<void> {
  tableAspect(aspectRatio)
  if (!snapshot.series.some(item => item.id !== 'none') || snapshot.resistances.length === 0) {
    throw new Error('保存する比較表がありません。')
  }
  let layoutError: unknown = null
  await document.fonts.ready
  try {
    await saveComparisonChartImage({
      chart: <SurtrUnequippedComparisonTableImage {...snapshot} aspectRatio={aspectRatio} exporting onLayoutError={error => { layoutError = error }} />,
      filename: filename ?? getSurtrUnequippedTableImageFilename(snapshot, aspectRatio),
      width: initialWidthFor(snapshot), writeBlob,
    })
  } catch (error) { throw layoutError ?? error }
}
