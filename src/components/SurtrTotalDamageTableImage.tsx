import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { getTableImageDimensions, parseTableImageAspect, type TableImageAspect } from '../lib/tableImageAspect'
import type { SurtrTotalDamageTable, SurtrTotalDamageTableDisplayMode, SurtrTotalDamageTableLayout,
  SurtrTotalDamageWinnerColor } from '../lib/surtrTotalDamageTable'
import { SurtrTotalDamageTableContent } from './SurtrTotalDamageTableContent'
import { applySurtrTotalDamageWinnerLayout, clearSurtrTotalDamageWinnerLayout } from './surtrTotalDamageWinnerLayout'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import './SurtrDurationChart.css'
import './SurtrTotalDamageTableImage.css'

export interface SurtrTotalDamageTableImageSnapshot {
  matrix: SurtrTotalDamageTable
  layout: SurtrTotalDamageTableLayout
  precision: number
  colorScale: 'none' | 'LINEAR' | 'SQRT'
  displayMode?: SurtrTotalDamageTableDisplayMode
  winnerColor?: SurtrTotalDamageWinnerColor
  title: string
  conditions: string[]
}

interface ImageProps extends SurtrTotalDamageTableImageSnapshot {
  aspectRatio?: number
  exporting?: boolean
  onLayout?: (size: { width: number; height: number }) => void
  onLayoutError?: (error: unknown) => void
}

const MAXIMUM_CSS_SIDE = 8000
const MAXIMUM_CSS_PIXELS = 8_000_000

const initialWidthFor = (snapshot: SurtrTotalDamageTableImageSnapshot) => Math.max(640,
  snapshot.displayMode === 'winner'
    ? snapshot.layout === 'time'
      ? 132 + snapshot.matrix.resistances.length * 112
      : 82 + snapshot.matrix.times.length * 112
    : snapshot.layout === 'resistance'
    ? 80 + snapshot.matrix.times.length * snapshot.matrix.series.length * 128
    : 300 + snapshot.matrix.resistances.length * 128,
)

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

/** Render the same complete table as the page, without controls or detail panels. */
export function SurtrTotalDamageTableImage({ aspectRatio, exporting = false, onLayout, onLayoutError, ...snapshot }: ImageProps) {
  const imageRef = useRef<HTMLElement>(null)
  const initialWidth = initialWidthFor(snapshot)
  const snapshotKey = JSON.stringify(snapshot)
  useLayoutEffect(() => {
    const image = imageRef.current
    const table = image?.querySelector('table')
    if (!image || !table) return
    let cancelled = false
    const measure = () => {
      if (cancelled) return
      image.style.display = ''
      try {
        const isWinner = snapshot.displayMode === 'winner'
        const wrapperStyle = getComputedStyle(table.parentElement!)
        const wrapperWidth = ['borderLeftWidth', 'borderRightWidth', 'paddingLeft', 'paddingRight']
          .reduce((sum, property) => sum + (parseFloat(wrapperStyle[property as keyof CSSStyleDeclaration] as string) || 0), 0)
        const minimumWidth = isWinner
          ? applySurtrTotalDamageWinnerLayout(table).minimumWidth + Math.ceil(wrapperWidth) : initialWidth
        const size = getTableImageDimensions({
          initialWidth: Math.max(initialWidth, minimumWidth),
          aspect: tableAspect(aspectRatio),
          measureHeight: width => {
            image.style.width = `${width}px`
            image.style.height = 'auto'
            table.style.height = 'auto'
            if (isWinner) {
              applySurtrTotalDamageWinnerLayout(table)
              // A compact one-line cell must fit horizontally at its original font size.
              if (width < minimumWidth) return MAXIMUM_CSS_SIDE + 1
            }
            return image.offsetHeight
          },
        })
        // Retain 2x rasterization and readable cell typography. Export every
        // row/column or fail visibly rather than crop or silently downsample it.
        if (size.width > MAXIMUM_CSS_SIDE || size.height > MAXIMUM_CSS_SIDE
          || size.width * size.height > MAXIMUM_CSS_PIXELS) {
          throw new Error('表全体を画像に収められません。時刻・術耐性・MODの数を減らすか、配置を変更してください。')
        }
        image.style.width = `${size.width}px`
        image.style.height = 'auto'
        table.style.height = 'auto'
        if (isWinner) {
          applySurtrTotalDamageWinnerLayout(table)
          const bodyHeight = table.tBodies[0]?.offsetHeight ?? 0
          const extraHeight = Math.max(0, size.height - image.offsetHeight)
          applySurtrTotalDamageWinnerLayout(table, { bodyHeight: bodyHeight + extraHeight })
        } else {
          const chromeHeight = image.offsetHeight - table.offsetHeight
          table.style.height = `${Math.max(table.offsetHeight, size.height - chromeHeight)}px`
        }
        image.style.height = `${size.height}px`
        if (image.offsetWidth !== size.width || image.offsetHeight !== size.height
          || image.scrollWidth > size.width || image.scrollHeight > size.height
          || table.scrollWidth > table.clientWidth) {
          throw new Error('指定した縦横比に表を調整できませんでした。縦横比または配置を変更してください。')
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
      if (snapshot.displayMode === 'winner') clearSurtrTotalDamageWinnerLayout(table)
    }
  }, [snapshotKey, initialWidth, aspectRatio, exporting, onLayout, onLayoutError])

  return <figure ref={imageRef} className="surtr-total-damage-table-image" style={{ width: initialWidth }} aria-label={snapshot.title}>
    <div className="surtr-total-damage-table-image-title">{snapshot.title}</div>
    <SurtrTotalDamageTableContent matrix={snapshot.matrix} layout={snapshot.layout} precision={snapshot.precision}
      colorScale={snapshot.colorScale} displayMode={snapshot.displayMode} winnerColor={snapshot.winnerColor} forImage />
    <div className="surtr-total-damage-table-image-footer">
      {snapshot.conditions.map((condition, index) => <span key={index}>{condition}</span>)}
    </div>
  </figure>
}

export function SurtrTotalDamageTableImagePreview({ onLayoutReady, ...props }: Omit<ImageProps, 'onLayout' | 'exporting'> & {
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
        <SurtrTotalDamageTableImage {...props} onLayout={updateLayout} onLayoutError={reportError} />
      </div>
    </div>
    {error ? <p className="surtr-total-damage-table-image-error" role="alert">{error}</p>
      : <span className="surtr-duration-chart-preview-size" aria-live="polite">
        {(size.width * 2).toLocaleString('ja-JP')} × {(size.height * 2).toLocaleString('ja-JP')} px
      </span>}
  </div>
}

export async function saveSurtrTotalDamageTableImage({ snapshot, filename, aspectRatio, writeBlob }: {
  snapshot: SurtrTotalDamageTableImageSnapshot
  filename: string
  aspectRatio?: number
  writeBlob?: (blob: Blob) => Promise<void>
}): Promise<void> {
  tableAspect(aspectRatio)
  if (!snapshot.matrix.times.length || !snapshot.matrix.resistances.length || !snapshot.matrix.series.length) {
    throw new Error('保存する総ダメージ表がありません。')
  }
  let layoutError: unknown = null
  await document.fonts.ready
  try {
    await saveComparisonChartImage({
      chart: <SurtrTotalDamageTableImage {...snapshot} aspectRatio={aspectRatio} exporting onLayoutError={error => { layoutError = error }} />,
      filename,
      width: initialWidthFor(snapshot),
      writeBlob,
    })
  } catch (error) {
    throw layoutError ?? error
  }
}
