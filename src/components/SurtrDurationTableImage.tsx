import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { getTableImageDimensions, parseTableImageAspect, type TableImageAspect } from '../lib/tableImageAspect'
import type { SurtrDurationTableLayout, SurtrDurationTimelineRow } from '../lib/surtrDurationTimeline'
import { SurtrDurationTimelineTableContent } from './SurtrDurationTimelineTable'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import './SurtrS3Page.css'
import './SurtrDurationPage.css'
import './SurtrDurationChart.css'
import './SurtrDurationTableImage.css'

export interface SurtrDurationTableImageSnapshot {
  rows: readonly SurtrDurationTimelineRow[]
  precision: number
  title: string
  conditions: readonly string[]
  layout?: SurtrDurationTableLayout
}

interface ImageProps extends SurtrDurationTableImageSnapshot {
  aspectRatio?: number
  exporting?: boolean
  onLayout?: (size: { width: number; height: number }) => void
  onLayoutError?: (error: unknown) => void
}

const INITIAL_WIDTH = 680
const MAXIMUM_CSS_SIDE = 8000
const MAXIMUM_CSS_PIXELS = 8_000_000
const TABLE_WRAPPER_BORDER = 2
const initialWidthFor = (snapshot: SurtrDurationTableImageSnapshot) => snapshot.layout === 'horizontal'
  ? Math.max(INITIAL_WIDTH, 112 + snapshot.rows.length * 96 + TABLE_WRAPPER_BORDER) : INITIAL_WIDTH

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

/** The page and PNG use the same rows, formatting, and state labels. */
export function SurtrDurationTableImage({ aspectRatio, exporting = false, onLayout, onLayoutError, ...snapshot }: ImageProps) {
  const imageRef = useRef<HTMLElement>(null)
  const snapshotKey = JSON.stringify(snapshot)
  const initialWidth = initialWidthFor(snapshot)
  useLayoutEffect(() => {
    const image = imageRef.current
    const table = image?.querySelector('table')
    if (!image || !table) return
    let cancelled = false
    const measure = () => {
      if (cancelled) return
      image.style.display = ''
      try {
        const size = getTableImageDimensions({
          initialWidth,
          aspect: tableAspect(aspectRatio),
          measureHeight: width => {
            image.style.width = `${width}px`
            image.style.height = 'auto'
            table.style.height = 'auto'
            return image.offsetHeight
          },
        })
        if (size.width > MAXIMUM_CSS_SIDE || size.height > MAXIMUM_CSS_SIDE
          || size.width * size.height > MAXIMUM_CSS_PIXELS) {
          throw new Error('表全体を画像に収められません。表示間隔・配置・縦横比を変更してください。')
        }
        image.style.width = `${size.width}px`
        image.style.height = 'auto'
        table.style.height = 'auto'
        const chromeHeight = image.offsetHeight - table.offsetHeight
        table.style.height = `${Math.max(table.offsetHeight, size.height - chromeHeight)}px`
        image.style.height = `${size.height}px`
        if (image.offsetWidth !== size.width || image.offsetHeight !== size.height
          || image.scrollWidth > size.width || image.scrollHeight > size.height
          || table.scrollWidth > table.clientWidth) {
          throw new Error('指定した縦横比に表を調整できませんでした。縦横比を変更してください。')
        }
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
    return () => {
      cancelled = true
      document.fonts.removeEventListener('loadingdone', measure)
    }
  }, [snapshotKey, initialWidth, aspectRatio, exporting, onLayout, onLayoutError])

  return <figure ref={imageRef} className="surtr-duration-table-image" style={{ width: initialWidth,
    '--surtr-duration-table-image-min-width': `${initialWidth - TABLE_WRAPPER_BORDER}px` } as CSSProperties} aria-label={snapshot.title}>
    <div className="surtr-duration-table-image-title">{snapshot.title}</div>
    <SurtrDurationTimelineTableContent rows={snapshot.rows} precision={snapshot.precision} layout={snapshot.layout} forImage />
    <div className="surtr-duration-table-image-footer">
      {snapshot.conditions.map((condition, index) => <span key={index}>{condition}</span>)}
    </div>
  </figure>
}

export function SurtrDurationTableImagePreview({ onLayoutReady, ...props }: Omit<ImageProps, 'onLayout' | 'exporting'> & {
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
  return <div className="surtr-duration-chart-preview">
    <div className="surtr-duration-chart-preview-heading"><span>プレビュー</span><span>PNG</span></div>
    <div ref={previewRef} className="surtr-duration-chart-preview-frame" style={{ height: error ? 0 : Math.ceil(size.height * scale) }}>
      <div className="surtr-duration-chart-preview-position" style={{ width: size.width, height: size.height,
        left: (availableWidth - size.width * scale) / 2, transform: `scale(${scale})` }}>
        <SurtrDurationTableImage {...props} onLayout={updateLayout} onLayoutError={reportError} />
      </div>
    </div>
    {error ? <p className="surtr-duration-table-image-error" role="alert">{error}</p>
      : <span className="surtr-duration-chart-preview-size" aria-live="polite">
        {(size.width * 2).toLocaleString('ja-JP')} × {(size.height * 2).toLocaleString('ja-JP')} px
      </span>}
  </div>
}

export async function saveSurtrDurationTableImage({ snapshot, filename, aspectRatio, writeBlob }: {
  snapshot: SurtrDurationTableImageSnapshot
  filename: string
  aspectRatio?: number
  writeBlob?: (blob: Blob) => Promise<void>
}): Promise<void> {
  tableAspect(aspectRatio)
  if (!snapshot.rows.length) throw new Error('保存するHP推移表がありません。')
  let layoutError: unknown = null
  await document.fonts.ready
  try {
    await saveComparisonChartImage({
      chart: <SurtrDurationTableImage {...snapshot} aspectRatio={aspectRatio} exporting onLayoutError={error => { layoutError = error }} />,
      filename, width: initialWidthFor(snapshot), writeBlob,
    })
  } catch (error) {
    throw layoutError ?? error
  }
}
