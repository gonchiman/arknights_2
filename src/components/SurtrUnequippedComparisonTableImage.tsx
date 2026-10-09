import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { getTableImageDimensions, parseTableImageAspect, type TableImageAspect } from '../lib/tableImageAspect'
import { getSurtrUnequippedTableImageFilename, getSurtrUnequippedTableImagePotentials, type SurtrUnequippedTableImageMetadata } from '../lib/surtrUnequippedTableImageFilename'
import { getSurtrComparisonTargets, getSurtrComparisonBaseLabel, getSurtrUnequippedBaselines } from '../lib/surtrUnequippedComparison'
import { getSurtrComparisonImageColorScaleMaximum, getSurtrComparisonImageStageLevels, getSurtrComparisonImageStageSnapshot,
  type SurtrComparisonImageLayout } from '../lib/surtrComparisonImageLayout'
import { getSurtrComparisonImageNumberFontSize, SURTR_COMPARISON_IMAGE_NUMBER_BASE_SIZE,
  type SurtrComparisonImageNumberCell, type SurtrComparisonImageNumberSize } from '../lib/surtrComparisonImageNumberSize'
import { getUnequippedMetricLabel, SurtrUnequippedComparisonTableContent, type SurtrUnequippedComparisonTableData } from './SurtrUnequippedComparisonTableContent'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import './SurtrS3Page.css'
import './SurtrDurationChart.css'
import './SurtrUnequippedComparisonTableImage.css'

export interface SurtrUnequippedComparisonTableImageSnapshot extends SurtrUnequippedComparisonTableData {
  metadata: SurtrUnequippedTableImageMetadata
  title?: string
  imageLayout?: SurtrComparisonImageLayout
  moduleLevel?: number
  numberSize?: SurtrComparisonImageNumberSize
}

export const SURTR_S3_COMPARISON_TABLE_IMAGE_TITLE = 'スルト S3 DPS比較'

interface ImageProps extends SurtrUnequippedComparisonTableImageSnapshot {
  aspectRatio?: number
  exporting?: boolean
  onLayout?: (size: { width: number; height: number }) => void
  onLayoutError?: (error: unknown) => void
}

const initialWidthFor = (source: SurtrUnequippedComparisonTableImageSnapshot) => {
  const snapshot = stageSnapshot(source)
  const targets = getSurtrComparisonTargets(snapshot.series, snapshot.comparisonBase).length
  const baselines = snapshot.comparisonBase === undefined || snapshot.comparisonBase === 'unequipped'
    ? getSurtrUnequippedBaselines(snapshot.series, snapshot.baseline, snapshot.referenceSeries).length : 0
  if (snapshot.imageLayout === 'transpose') {
    return Math.max(640, (snapshot.blockingComparison === undefined ? 220 : 380)
      + snapshot.resistances.length * (snapshot.layout === 'combined' ? 200 : 128))
  }
  const conditions = snapshot.blockingComparison === undefined || snapshot.imageLayout === 'stacked' ? 1 : 2
  const columns = (snapshot.layout === 'combined' ? 1 + baselines + targets * 2 * conditions : 1 + targets * conditions)
    + (snapshot.rankMode === 'merged' ? 1 : 0)
  return Math.max(640, columns * 150)
}

function stageSnapshot(snapshot: SurtrUnequippedComparisonTableImageSnapshot): SurtrUnequippedComparisonTableImageSnapshot {
  if (snapshot.imageLayout !== 'split') return snapshot
  const level = snapshot.moduleLevel ?? getSurtrComparisonImageStageLevels(snapshot)[0]
  return level === undefined ? snapshot : getSurtrComparisonImageStageSnapshot(snapshot, level)
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

export function SurtrUnequippedComparisonTableImage({ aspectRatio, exporting = false, onLayout, onLayoutError, ...source }: ImageProps) {
  const { metadata, title, imageLayout = 'current', moduleLevel, numberSize, ...data } = stageSnapshot(source)
  const imageRef = useRef<HTMLElement>(null)
  const initialWidth = initialWidthFor(source)
  const snapshotKey = JSON.stringify([data.series, data.baseline, data.blockingComparison, data.resistances, data.layout, data.metric, data.precision, data.rankMode, data.columnOrder, data.colorScale, data.colorScaleMode, data.colorScaleMaximum, data.comparisonBase, data.referenceSeries, data.quantity, metadata, title, imageLayout, moduleLevel, numberSize])
  useLayoutEffect(() => {
    const image = imageRef.current
    const tables = image ? Array.from(image.querySelectorAll('table')) : []
    if (!image || !tables.length) return
    const columns = Array.from(image.querySelectorAll<HTMLElement>('col, colgroup:not(:has(col))'))
    const originalColumnWidths = columns.map(column => column.style.width)
    const originalTableLayouts = tables.map(table => table.style.tableLayout)
    let cancelled = false
    const measure = () => {
      if (cancelled) return
      image.style.display = ''
      // Every font-load or setting change starts from the original 14px geometry.
      image.style.setProperty('--surtr-comparison-number-font-size', `${SURTR_COMPARISON_IMAGE_NUMBER_BASE_SIZE}px`)
      columns.forEach((column, index) => { column.style.width = originalColumnWidths[index] })
      tables.forEach((table, index) => { table.style.tableLayout = originalTableLayouts[index] })
      try {
        const size = getTableImageDimensions({ initialWidth, aspect: tableAspect(aspectRatio), measureHeight: width => {
          image.style.width = `${width}px`
          image.style.height = 'auto'
          tables.forEach(table => { table.style.height = 'auto' })
          return image.offsetHeight
        } })
        image.style.width = `${size.width}px`
        image.style.height = 'auto'
        tables.forEach(table => { table.style.height = 'auto' })
        if (tables.length === 1) {
          const table = tables[0]
          const chromeHeight = image.offsetHeight - table.offsetHeight
          table.style.height = `${Math.max(table.offsetHeight, size.height - chromeHeight)}px`
        } else {
          // Collapsed borders and line heights can be fractional. Rounding every
          // table independently would let their total exceed the image by 1px.
          const scale = image.getBoundingClientRect().width / image.offsetWidth || 1
          const naturalHeights = tables.map(table => table.getBoundingClientRect().height / scale)
          const extraHeight = Math.max(0, size.height - image.getBoundingClientRect().height / scale)
          if (extraHeight > 0) tables.forEach((table, index) => {
            table.style.height = `${naturalHeights[index] + extraHeight / tables.length}px`
          })
        }
        image.style.height = `${size.height}px`
        if (numberSize !== undefined && numberSize !== '100') {
          const metrics = measureNumberCells(image)
          const fontSize = getSurtrComparisonImageNumberFontSize(numberSize, metrics)
          if (fontSize > SURTR_COMPARISON_IMAGE_NUMBER_BASE_SIZE) {
            // Larger text must not redistribute auto-layout table columns.
            const widths = columns.map(column => getComputedStyle(column).width)
            columns.forEach((column, index) => { column.style.width = widths[index] })
            tables.forEach(table => { table.style.tableLayout = 'fixed' })
            image.style.setProperty('--surtr-comparison-number-font-size', `${fontSize}px`)
          }
        }
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
    return () => {
      cancelled = true
      document.fonts.removeEventListener('loadingdone', measure)
      image.style.removeProperty('--surtr-comparison-number-font-size')
      columns.forEach((column, index) => { column.style.width = originalColumnWidths[index] })
      tables.forEach((table, index) => { table.style.tableLayout = originalTableLayouts[index] })
    }
  }, [snapshotKey, initialWidth, aspectRatio, exporting, onLayout, onLayoutError])

  const imageTitle = (title?.trim() || (data.quantity === 'expected-damage' ? undefined : SURTR_S3_COMPARISON_TABLE_IMAGE_TITLE))
  const stageTitle = imageLayout === 'split' && moduleLevel !== undefined ? `${imageTitle ?? '比較表'}・MOD Lv.${moduleLevel}` : imageTitle
  const footer = <div className="surtr-unequipped-table-image-conditions">
      <span>{data.quantity === 'expected-damage' ? '総ダメージ期待値・' : ''}{getUnequippedMetricLabel(data.metric, data.comparisonBase, data.quantity)}・基準：{data.comparisonBase === 'previous' ? '1つ前の段階（Lv.1は未装備）' : getSurtrComparisonBaseLabel(data.comparisonBase ?? 'unequipped')}{data.comparisonBase?.startsWith('potential-') && '（同じMOD・段階）'}</span>
      <span>S3 {metadata.skillLabel}・昇進2 Lv.{metadata.level}・信頼度{metadata.trust}・潜在{getSurtrUnequippedTableImagePotentials(metadata).join('・')}・{data.blockingComparison !== undefined ? '未ブロック／対象を自身でブロック' : metadata.blocking ? '対象を自身でブロック' : '未ブロック'}{data.quantity !== 'expected-damage' && `・${metadata.remnantActive ? '余燼中' : '余燼なし'}`}</span>
      {data.quantity === 'expected-damage' && metadata.remnantAssumptions && <span>残りCT一様・命中まで{metadata.remnantAssumptions.windup}s・CT{metadata.remnantAssumptions.ctCarry === 'time' ? '時間' : '割合'}維持・退場同時の命中{metadata.remnantAssumptions.includeRetreatHit ? 'を含む' : 'を除外'}</span>}
    </div>
  const stacked = imageLayout === 'stacked' && data.blockingComparison !== undefined
  const sharedMaximum = getSurtrComparisonImageColorScaleMaximum(data)
  return <figure ref={imageRef} className={`surtr-unequipped-table-image surtr-unequipped-table-image-${imageLayout}`} style={{ width: initialWidth }} aria-label={`スルト ${data.quantity === 'expected-damage' ? '余燼の総ダメージ期待値' : 'S3'} ${getSurtrComparisonBaseLabel(data.comparisonBase ?? 'unequipped')}との比較表`}>
    {stacked ? <>
      {stageTitle && <div className="surtr-unequipped-table-image-title">{stageTitle}</div>}
      {[false, true].map(blocking => {
        const group = data.blockingComparison?.find(condition => condition.blocking === blocking)
        return <SurtrUnequippedComparisonTableContent key={String(blocking)} {...data}
          series={data.series.map(item => group?.series.find(candidate => candidate.id === item.id) ?? { ...item, points: [] })}
          baseline={group?.baseline ?? { ...data.baseline, points: [] }} referenceSeries={group?.referenceSeries ?? []}
          blockingComparison={undefined} colorScaleMaximum={sharedMaximum}
          title={blocking ? '対象を自身でブロック' : '未ブロック'} />
      })}
      <div className="surtr-unequipped-table-image-footer">{footer}</div>
    </> : <SurtrUnequippedComparisonTableContent {...data} transpose={imageLayout === 'transpose'} title={stageTitle} footer={footer} />}
  </figure>
}

/** Measure matching tabular-number typography outside the scaled preview. */
function measureNumberCells(image: HTMLElement): SurtrComparisonImageNumberCell[] {
  const probe = document.createElement('span')
  Object.assign(probe.style, { position: 'fixed', left: '0', top: '0', visibility: 'hidden', whiteSpace: 'pre' })
  probe.setAttribute('aria-hidden', 'true')
  document.body.appendChild(probe)
  const range = document.createRange()
  try {
    return Array.from(image.querySelectorAll<HTMLTableCellElement>('tbody td')).flatMap(cell => {
      if (!cell.textContent?.trim()) return []
      const style = getComputedStyle(cell)
      Object.assign(probe.style, { fontFamily: style.fontFamily, fontSize: style.fontSize,
        fontWeight: style.fontWeight, fontStyle: style.fontStyle, fontStretch: style.fontStretch,
        fontVariantNumeric: style.fontVariantNumeric, fontFeatureSettings: style.fontFeatureSettings,
        fontKerning: style.fontKerning, letterSpacing: style.letterSpacing, lineHeight: style.lineHeight })
      probe.textContent = cell.textContent
      range.selectNodeContents(probe)
      const text = range.getBoundingClientRect()
      return [{ availableWidth: cell.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        availableHeight: cell.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
        textWidth: Math.max(text.width, probe.getBoundingClientRect().width),
        textHeight: Math.max(text.height, probe.getBoundingClientRect().height) }]
    })
  } finally { range.detach(); probe.remove() }
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
  const preparedSnapshot = stageSnapshot(snapshot)
  if (getSurtrComparisonTargets(preparedSnapshot.series, preparedSnapshot.comparisonBase).length === 0 || snapshot.resistances.length === 0) {
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
