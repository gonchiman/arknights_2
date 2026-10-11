import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { getGgTableTargets, getGgTableTitle, type GgTableData } from '../lib/goldenglowTargetSwitchTable'
import { createChartImageFilename, formatChartFilenameValues, withChartImageAspect } from '../lib/chartImageFilename'
import { getTableImageDimensions, parseTableImageAspect, type TableImageAspect } from '../lib/tableImageAspect'
import { getGoldenglowTargetSwitchTableComparisonLabel, GoldenglowTargetSwitchTableContent } from './GoldenglowTargetSwitchTable'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import './GoldenglowTargetSwitchTableImage.css'

export interface GoldenglowTargetSwitchTableImageSnapshot {
  data: GgTableData
  conditions: string
  title?: string
}

interface ImageProps extends GoldenglowTargetSwitchTableImageSnapshot {
  aspectRatio?: number
  exporting?: boolean
  onLayout?: (size: { width: number; height: number }) => void
  onLayoutError?: (cause: unknown) => void
}

function initialWidthFor({ data }: GoldenglowTargetSwitchTableImageSnapshot): number {
  const targets = getGgTableTargets(data)
  const hpColumns = targets.reduce((count, build) => count + (data.layout === 'combined' && build.id !== 'none' ? 2 : 1), 0)
  return Math.max(640, (data.showRanks ? 126 : 76) + data.hps.length * hpColumns * 128)
}

function tableAspect(ratio?: number): TableImageAspect | null {
  if (ratio === undefined) return null
  if (!Number.isFinite(ratio) || ratio < 0.1 || ratio > 10) throw new Error('表の縦横比は1:10〜10:1の範囲で指定してください。')
  for (let height = 1; height <= 100; height += 1) {
    const width = Math.round(ratio * height)
    if (width >= 1 && width <= 100 && width / height === ratio) {
      const aspect = parseTableImageAspect(String(width), String(height))
      if (aspect) return aspect
    }
  }
  throw new Error('画像の縦横比が正しくありません。')
}

export function getGoldenglowTargetSwitchTableImageFilename(snapshot: GoldenglowTargetSwitchTableImageSnapshot, aspectRatio?: number): string {
  const { data } = snapshot
  return withChartImageAspect(createChartImageFilename('ゴールデングロー_ターゲット切替3', [
    data.layout === 'total' ? '総ダメージ' : data.layout === 'combined' ? '総ダメージと比較値' : '比較値',
    data.metric === 'difference' ? '差' : data.metric === 'ratio' ? '基準比' : '増加率',
    data.baseline.kind === 'previous' ? '前段階基準' : data.baseline.kind === 'selected'
      ? `${data.builds.find(build => build.id === data.baseline.id)?.label ?? data.series.find(series => series.id === data.baseline.id)?.label ?? '指定MOD'}基準` : '未装備基準',
    data.builds.map(build => build.label).join('-'),
    `HP${formatChartFilenameValues(data.hps)}`, `術耐性${formatChartFilenameValues(data.resistances)}`,
    `小数${data.precision}桁`, snapshot.conditions,
  ]), aspectRatio)
}

export function GoldenglowTargetSwitchTableImage({ aspectRatio, exporting = false, onLayout, onLayoutError, ...snapshot }: ImageProps) {
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
        if (image.scrollWidth > size.width || image.scrollHeight > size.height) throw new Error('指定した縦横比に表を調整できませんでした。')
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
    return () => { cancelled = true; document.fonts.removeEventListener('loadingdone', measure) }
  }, [snapshotKey, initialWidth, aspectRatio, exporting, onLayout, onLayoutError])
  return <figure ref={imageRef} className="gg-switch-table-image" style={{ width: initialWidth }} aria-label="ゴールデングロー ターゲット切替3の比較表">
    <GoldenglowTargetSwitchTableContent data={snapshot.data} title={snapshot.title ?? getGgTableTitle(snapshot.data)}
      footer={<div className="gg-switch-table-image-conditions"><span>{getGoldenglowTargetSwitchTableComparisonLabel(snapshot.data)}</span><span>{snapshot.conditions}</span></div>} />
  </figure>
}

export function GoldenglowTargetSwitchTableImagePreview({ onLayoutReady, ...props }: Omit<ImageProps, 'exporting' | 'onLayout'> & { onLayoutReady?: () => void }) {
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
  const pixelRatio = Math.min(2, 16000 / size.width, 16000 / size.height, Math.sqrt(32000000 / size.width / size.height))
  return <div className="gg-switch-table-image-preview">
    <div className="gg-switch-table-image-preview-heading"><span>プレビュー</span><span>PNG</span></div>
    <div ref={previewRef} className="gg-switch-table-image-preview-frame" style={{ height: Math.ceil(size.height * scale) }}>
      <div className="gg-switch-table-image-preview-position" style={{ width: size.width, height: size.height, left: (availableWidth - size.width * scale) / 2, transform: `scale(${scale})` }}>
        <GoldenglowTargetSwitchTableImage {...props} onLayout={updateLayout} onLayoutError={reportError} />
      </div>
    </div>
    {error ? <p className="gg-switch-table-image-error" role="alert">{error}</p> : <span className="gg-switch-table-image-preview-size" aria-live="polite">
      {Math.floor(size.width * pixelRatio).toLocaleString('ja-JP')} × {Math.floor(size.height * pixelRatio).toLocaleString('ja-JP')} px
    </span>}
  </div>
}

export async function saveGoldenglowTargetSwitchTableImage({ snapshot, filename, aspectRatio, writeBlob }: {
  snapshot: GoldenglowTargetSwitchTableImageSnapshot
  filename?: string
  aspectRatio?: number
  writeBlob?: (blob: Blob) => Promise<void>
}): Promise<void> {
  tableAspect(aspectRatio)
  if (!getGgTableTargets(snapshot.data).length || !snapshot.data.hps.length || !snapshot.data.resistances.length) throw new Error('保存する比較表がありません。')
  let layoutError: unknown = null
  await document.fonts.ready
  try {
    await saveComparisonChartImage({ chart: <GoldenglowTargetSwitchTableImage {...snapshot} aspectRatio={aspectRatio} exporting onLayoutError={cause => { layoutError = cause }} />,
      filename: filename ?? getGoldenglowTargetSwitchTableImageFilename(snapshot, aspectRatio), width: initialWidthFor(snapshot), writeBlob })
  } catch (cause) { throw layoutError ?? cause }
}
