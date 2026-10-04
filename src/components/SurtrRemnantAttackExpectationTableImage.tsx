import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { createChartImageFilename } from '../lib/chartImageFilename'
import { getTableImageDimensions, parseTableImageAspect, type TableImageAspect } from '../lib/tableImageAspect'
import type { SurtrRemnantAttackAssumptions } from '../lib/surtrRemnantAttacks'
import { SurtrRemnantAttackExpectationTable, type SurtrRemnantAttackExpectationTableLayout,
  type SurtrRemnantExpectationComparisonResult } from './SurtrRemnantAttackExpectationTable'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import './SurtrDurationChart.css'
import './SurtrRemnantAttackExpectationTableImage.css'

export interface SurtrRemnantAttackExpectationTableImageSnapshot {
  comparison: SurtrRemnantExpectationComparisonResult[]
  potential: number
  blocking: boolean
  assumptions: SurtrRemnantAttackAssumptions
  layout?: SurtrRemnantAttackExpectationTableLayout
}

export interface SurtrRemnantAttackExpectationTableImageProps extends SurtrRemnantAttackExpectationTableImageSnapshot {
  aspectRatio?: number
  exporting?: boolean
  onLayout?: (size: { width: number; height: number }) => void
  onLayoutError?: (error: unknown) => void
}

export interface SurtrRemnantAttackExpectationTableImageSaveOptions {
  snapshot: SurtrRemnantAttackExpectationTableImageSnapshot
  filename?: string
  aspectRatio?: number
  writeBlob?: (blob: Blob) => Promise<void>
}

const TITLE = '余燼中の命中回数期待値'
const initialWidthFor = (comparison: readonly SurtrRemnantExpectationComparisonResult[],
  layout: SurtrRemnantAttackExpectationTableLayout = 'horizontal') => layout === 'vertical'
    ? 960 : Math.max(1060, 90 + comparison.length * 280)

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

export function getSurtrRemnantAttackExpectationTableImageFilename(snapshot: SurtrRemnantAttackExpectationTableImageSnapshot): string {
  return createChartImageFilename('スルト_余燼命中回数期待値_比較表', [
    `潜在${snapshot.potential}`,
    snapshot.comparison.map(item => item.label).join('-'),
    snapshot.blocking ? 'ブロック中' : '非ブロック',
    snapshot.layout === 'vertical' ? '縦並び' : '横並び',
    'CT一様',
    `予備動作${snapshot.assumptions.windup}秒`,
    snapshot.assumptions.ctCarry === 'time' ? 'CT秒数維持' : 'CT割合維持',
    snapshot.assumptions.includeRetreatHit ? '退場時含む' : '退場時除外',
  ])
}

export function SurtrRemnantAttackExpectationTableImage({ comparison, potential, blocking, assumptions, layout = 'horizontal',
  aspectRatio, exporting = false, onLayout, onLayoutError }: SurtrRemnantAttackExpectationTableImageProps) {
  const imageRef = useRef<HTMLElement>(null)
  const initialWidth = initialWidthFor(comparison, layout)
  const snapshotKey = JSON.stringify([comparison, potential, blocking, assumptions, layout])
  useLayoutEffect(() => {
    const image = imageRef.current
    const table = image?.querySelector('table')
    if (!image || !table) return
    let cancelled = false
    const measure = () => {
      if (cancelled) return
      image.style.display = ''
      try {
        const aspect = tableAspect(aspectRatio)
        const size = getTableImageDimensions({
          initialWidth,
          aspect,
          measureHeight: width => {
            image.style.width = `${width}px`
            image.style.height = 'auto'
            table.style.height = 'auto'
            // offset sizes keep preview scaling out of the saved dimensions.
            return image.offsetHeight
          },
        })
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
  }, [snapshotKey, initialWidth, layout, aspectRatio, exporting, onLayout, onLayoutError])

  return <figure ref={imageRef} className="surtr-remnant-expectation-table-image" data-table-layout={layout}
    style={{ width: initialWidth }} aria-label={TITLE}>
    <div className="surtr-remnant-expectation-table-image-content">
      <SurtrRemnantAttackExpectationTable comparison={comparison} layout={layout} />
    </div>
  </figure>
}

function ImagePreview(props: Omit<SurtrRemnantAttackExpectationTableImageProps, 'onLayout' | 'exporting'>) {
  const previewRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(600)
  const [size, setSize] = useState({ width: initialWidthFor(props.comparison, props.layout), height: 260 })
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
  }, [])
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
        <SurtrRemnantAttackExpectationTableImage {...props} onLayout={updateLayout} onLayoutError={reportError} />
      </div>
    </div>
    {error ? <p className="surtr-remnant-expectation-table-image-error" role="alert">{error}</p>
      : <span className="surtr-duration-chart-preview-size" aria-live="polite">
        {Math.floor(size.width * pixelRatio).toLocaleString('ja-JP')} × {Math.floor(size.height * pixelRatio).toLocaleString('ja-JP')} px
      </span>}
  </div>
}

export function SurtrRemnantAttackExpectationTableImagePreview(props: Omit<SurtrRemnantAttackExpectationTableImageProps, 'onLayout' | 'exporting'>) {
  return <ImagePreview key={JSON.stringify([props.comparison, props.potential, props.blocking, props.assumptions,
    props.layout ?? 'horizontal', props.aspectRatio])} {...props} />
}

export async function saveSurtrRemnantAttackExpectationTableImage({ snapshot, filename, aspectRatio, writeBlob }: SurtrRemnantAttackExpectationTableImageSaveOptions): Promise<void> {
  tableAspect(aspectRatio)
  if (!snapshot.comparison.length) throw new Error('保存する装備を選択してください。')
  let layoutError: unknown = null
  await document.fonts.ready
  try {
    await saveComparisonChartImage({
      chart: <SurtrRemnantAttackExpectationTableImage {...snapshot} aspectRatio={aspectRatio} exporting
        onLayoutError={error => { layoutError = error }} />,
      filename: filename ?? getSurtrRemnantAttackExpectationTableImageFilename(snapshot),
      width: initialWidthFor(snapshot.comparison, snapshot.layout),
      writeBlob,
    })
  } catch (error) {
    throw layoutError ?? error
  }
}
