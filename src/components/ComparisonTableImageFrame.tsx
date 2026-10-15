import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { getTableImageDimensions, parseTableImageAspect, type TableImageAspect } from '../lib/tableImageAspect'
import {
  COMPARISON_TABLE_IMAGE_NUMBER_BASE_SIZE, getComparisonTableNumberFontSize,
  normalizeComparisonTableTypography, type ComparisonTableImageTypography, type ComparisonTableNumberCell,
} from '../lib/tableImageTypography'
import './ComparisonTableImageFrame.css'

export interface ComparisonTableImageFrameProps {
  initialWidth: number
  aspectRatio?: number
  exporting?: boolean
  onLayout?: (size: { width: number; height: number }) => void
  onLayoutError?: (cause: unknown) => void
  title?: ReactNode
  footer?: ReactNode
  typography?: Partial<ComparisonTableImageTypography>
  children: ReactNode
  layoutKey?: string
  className?: string
  ariaLabel?: string
}

function tableAspect(value?: number): TableImageAspect | null {
  if (value === undefined) return null
  if (!Number.isFinite(value) || value < 0.1 || value > 10) throw new Error('表の縦横比は1:10〜10:1の範囲で指定してください。')
  for (let height = 1; height <= 100; height += 1) {
    const width = Math.round(value * height)
    if (width >= 1 && width <= 100 && width / height === value) {
      const parsed = parseTableImageAspect(String(width), String(height))
      if (parsed) return parsed
    }
  }
  throw new Error('画像の縦横比が正しくありません。')
}

/** One sizing and typography pipeline for numeric and winning-module tables. */
export function ComparisonTableImageFrame({ initialWidth, aspectRatio, exporting = false, onLayout, onLayoutError,
  title, footer, typography: requestedTypography, children, layoutKey, className = '', ariaLabel }: ComparisonTableImageFrameProps) {
  const imageRef = useRef<HTMLElement>(null)
  const typography = normalizeComparisonTableTypography(requestedTypography)
  const typographyKey = JSON.stringify(typography)
  useLayoutEffect(() => {
    const image = imageRef.current
    if (!image) return
    const tables = Array.from(image.querySelectorAll<HTMLTableElement>('table'))
    const rows = tables.flatMap(table => Array.from(table.tBodies).flatMap(body => Array.from(body.rows)))
    const columns = Array.from(image.querySelectorAll<HTMLElement>('col, colgroup:not(:has(col))'))
    const changed = [...tables, ...rows, ...columns]
    const originalStyles = changed.map(element => element.getAttribute('style'))
    let cancelled = false
    const reset = () => {
      changed.forEach((element, index) => {
        if (originalStyles[index] === null) element.removeAttribute('style')
        else element.setAttribute('style', originalStyles[index]!)
      })
      image.style.height = 'auto'
      image.style.setProperty('--comparison-table-number-font-size', `${COMPARISON_TABLE_IMAGE_NUMBER_BASE_SIZE}px`)
      image.style.setProperty('--surtr-comparison-number-font-size', `${COMPARISON_TABLE_IMAGE_NUMBER_BASE_SIZE}px`)
    }
    const measure = () => {
      if (cancelled) return
      image.style.display = ''
      reset()
      try {
        if (!tables.length || !rows.length) throw new Error('保存する表を取得できませんでした。')
        // Auto-layout tables may be wider than their suggested starting width.
        // Start from their complete natural width before applying a ratio.
        image.style.width = `${initialWidth}px`
        const naturalWidth = Math.max(initialWidth, image.scrollWidth, ...tables.map(table => table.scrollWidth))
        const size = getTableImageDimensions({ initialWidth: naturalWidth, aspect: tableAspect(aspectRatio),
          measureHeight: width => {
            image.style.width = `${width}px`
            image.style.height = 'auto'
            // A compact winning label is kept on one line at its original size.
            if (image.scrollWidth > width || tables.some(table => table.scrollWidth > table.clientWidth + 1)) return 8001
            return image.offsetHeight
          } })
        if (size.width > 8000 || size.height > 8000 || size.width * size.height > 8_000_000) {
          throw new Error('表全体を画像に収められません。項目数を減らすか、配置を変更してください。')
        }
        image.style.width = `${size.width}px`
        image.style.height = 'auto'
        const scale = image.getBoundingClientRect().width / image.offsetWidth || 1
        const naturalHeights = rows.map(row => row.getBoundingClientRect().height / scale)
        const extraHeight = Math.max(0, size.height - image.getBoundingClientRect().height / scale)
        if (extraHeight > 0) rows.forEach((row, index) => {
          row.style.height = `${naturalHeights[index] + extraHeight / rows.length}px`
        })
        // Freeze the column widths before enlarging values; typography must
        // never redistribute columns or change the selected image dimensions.
        const columnWidths = columns.map(column => getComputedStyle(column).width)
        columns.forEach((column, index) => { column.style.width = columnWidths[index] })
        tables.forEach(table => { table.style.tableLayout = 'fixed' })
        const fontSize = getComparisonTableNumberFontSize(typography.numberSize, measureNumberCells(image))
        image.style.setProperty('--comparison-table-number-font-size', `${fontSize}px`)
        image.style.setProperty('--surtr-comparison-number-font-size', `${fontSize}px`)
        image.style.height = `${size.height}px`
        if (image.offsetWidth !== size.width || image.offsetHeight !== size.height
          || image.scrollWidth > size.width || image.scrollHeight > size.height
          || tables.some(table => table.scrollWidth > table.clientWidth + 1)) {
          throw new Error('指定した縦横比に表を調整できませんでした。縦横比または配置を変更してください。')
        }
        if (exporting && image.parentElement) image.parentElement.style.width = `${size.width}px`
        onLayout?.(size)
      } catch (cause) {
        image.style.display = 'none'
        onLayoutError?.(cause)
      }
    }
    measure()
    void document.fonts.ready.then(measure)
    document.fonts.addEventListener('loadingdone', measure)
    return () => {
      cancelled = true
      document.fonts.removeEventListener('loadingdone', measure)
      reset()
    }
  }, [initialWidth, aspectRatio, exporting, typographyKey, layoutKey, children, title, footer, onLayout, onLayoutError])

  const style = { width: initialWidth, '--comparison-table-title-size': `${typography.titleSize}px`,
    '--comparison-table-detail-size': `${typography.detailSize}px`,
  } as CSSProperties
  return <figure ref={imageRef} className={`comparison-table-image-frame ${className}`} style={style}
    data-table-image-frame="true" aria-label={ariaLabel}>
    {title !== undefined && <div className="comparison-table-image-title">{title}</div>}
    <div className="comparison-table-image-content">{children}</div>
    {footer !== undefined && <div className="comparison-table-image-footer">{footer}</div>}
  </figure>
}

/** Measure text outside the preview transform at the base 14px typography. */
function measureNumberCells(image: HTMLElement): ComparisonTableNumberCell[] {
  const marked = Array.from(image.querySelectorAll<HTMLElement>('[data-table-image-number]'))
  const cells = marked.length ? marked : Array.from(image.querySelectorAll<HTMLElement>('tbody td'))
  const probe = document.createElement('span')
  Object.assign(probe.style, { position: 'fixed', left: '0', top: '0', visibility: 'hidden', whiteSpace: 'pre',
    width: 'max-content', maxWidth: 'none', margin: '0', padding: '0', border: '0' })
  probe.setAttribute('aria-hidden', 'true')
  document.body.appendChild(probe)
  const range = document.createRange()
  try {
    return cells.flatMap(cell => {
      if (!cell.textContent?.trim()) return []
      const cellStyle = getComputedStyle(cell)
      const textElement = cell.querySelector<HTMLElement>('[data-table-image-number-text], .module-winner-label') ?? cell
      const style = getComputedStyle(textElement)
      Object.assign(probe.style, { fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight,
        fontStyle: style.fontStyle, fontStretch: style.fontStretch, fontVariantNumeric: style.fontVariantNumeric,
        fontFeatureSettings: style.fontFeatureSettings, fontKerning: style.fontKerning,
        letterSpacing: style.letterSpacing, lineHeight: style.lineHeight })
      probe.textContent = cell.textContent
      range.selectNodeContents(probe)
      const text = range.getBoundingClientRect()
      return [{ availableWidth: cell.clientWidth - parseFloat(cellStyle.paddingLeft) - parseFloat(cellStyle.paddingRight),
        availableHeight: cell.clientHeight - parseFloat(cellStyle.paddingTop) - parseFloat(cellStyle.paddingBottom),
        textWidth: Math.max(text.width, probe.getBoundingClientRect().width),
        textHeight: Math.max(text.height, probe.getBoundingClientRect().height) }]
    })
  } finally { range.detach(); probe.remove() }
}

export type ComparisonTableImagePreviewProps = Omit<ComparisonTableImageFrameProps, 'onLayout' | 'exporting'> & {
  onLayoutReady?: () => void
}

export function ComparisonTableImagePreview({ onLayoutReady, onLayoutError, ...props }: ComparisonTableImagePreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(600)
  const [size, setSize] = useState({ width: props.initialWidth, height: 420 })
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
  const updateLayout = useCallback((value: { width: number; height: number }) => {
    setError('')
    setSize(previous => previous.width === value.width && previous.height === value.height ? previous : value)
    onLayoutReady?.()
  }, [onLayoutReady])
  const reportError = useCallback((cause: unknown) => {
    setError(cause instanceof Error ? cause.message : '表のプレビューを表示できませんでした。')
    onLayoutError?.(cause)
  }, [onLayoutError])
  const scale = Math.min(availableWidth / size.width, 380 / size.height, 1)
  return <div className="comparison-table-image-preview">
    <div className="comparison-table-image-preview-heading"><span>プレビュー</span><span>PNG</span></div>
    <div ref={previewRef} className="comparison-table-image-preview-frame" style={{ height: Math.ceil(size.height * scale) }}>
      <div className="comparison-table-image-preview-position" style={{ width: size.width, height: size.height,
        left: (availableWidth - size.width * scale) / 2, transform: `scale(${scale})` }}>
        <ComparisonTableImageFrame {...props} onLayout={updateLayout} onLayoutError={reportError} />
      </div>
    </div>
    {error ? <p className="comparison-table-image-error" role="alert">{error}</p>
      : <span className="comparison-table-image-preview-size" aria-live="polite">{(size.width * 2).toLocaleString('ja-JP')} × {(size.height * 2).toLocaleString('ja-JP')} px</span>}
  </div>
}
