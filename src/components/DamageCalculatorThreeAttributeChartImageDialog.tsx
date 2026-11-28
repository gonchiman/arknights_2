import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { createChartImageFilename, withChartImageAspect } from '../lib/chartImageFilename'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { getChartImageRasterSize, type ChartImageRasterOutput } from '../lib/chartImageRasterSize'
import { parseTableImageAspect } from '../lib/tableImageAspect'
import { ChartImageFrame, type ChartImageFrameProps } from './ChartImageFrame'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import './DamageCalculatorThreeAttributeChartImageDialog.css'

export interface DamageCalculatorThreeAttributeChartImageSnapshot {
  title: string
  defaultAspect?: ChartImageAspectSettings
  outputWidth?: number
  axisTitle?: string
  footerNote?: string
  className?: string
  naturalChartHeight?: number
  additionalChartHeight?: number
  conditions: readonly string[]
  filenameParts: readonly string[]
  legend: ReactNode
  chart: ChartImageFrameProps['children']
}

export interface ChartImageAlternateLayout {
  label: string
  defaultAspect: ChartImageAspectSettings
  snapshot: DamageCalculatorThreeAttributeChartImageSnapshot
}

const NATURAL_CHART_HEIGHT = 334
const IMAGE_ASPECT_PRESETS = ['16:9', '4:3', '1:1', '2:1', '9:16'] as const
const AUTO_ASPECT: ChartImageAspectSettings = { preset: 'auto', width: '16', height: '9' }

export function DamageCalculatorThreeAttributeChartImageDialog({ snapshot, alternateLayout, onClose, parentLocation, helpMode = 'popover' }: {
  snapshot: DamageCalculatorThreeAttributeChartImageSnapshot
  alternateLayout?: ChartImageAlternateLayout
  onClose: () => void
  parentLocation?: readonly string[]
  helpMode?: 'popover' | 'none'
}) {
  const [chosenAspect, setAspect] = useState<ChartImageAspectSettings | null>(null)
  const [useAlternateLayout, setUseAlternateLayout] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const saveInProgress = useRef(false)
  const layout = useAlternateLayout ? alternateLayout : undefined
  const aspect = chosenAspect ?? layout?.defaultAspect ?? snapshot.defaultAspect ?? AUTO_ASPECT
  const parsedAspect = aspect.preset === 'auto' ? null : parseTableImageAspect(aspect.width, aspect.height)
  let aspectError = aspect.preset !== 'auto' && !parsedAspect
    ? '幅と高さは1〜100の整数、縦横比は1:10〜10:1で指定してください。' : undefined
  const aspectRatio = parsedAspect ? parsedAspect.width / parsedAspect.height : undefined
  const picker = getChartImageSavePicker()
  const image = layout?.snapshot ?? snapshot
  const output = image.outputWidth && aspectRatio ? { width: image.outputWidth, aspectRatio } : undefined
  const filename = createChartImageFilename(image.title, image.filenameParts)
  const frameProps: ChartImageFrameProps = {
    title: image.title,
    legend: image.legend,
    conditions: image.conditions.join('・'),
    axisTitle: image.axisTitle ?? 'ゲーム内評価',
    footerNote: image.footerNote,
    className: image.className,
    naturalChartHeight: image.naturalChartHeight ?? (NATURAL_CHART_HEIGHT + (image.additionalChartHeight ?? 0)),
    aspectRatio,
    exactAspect: parsedAspect ?? undefined,
    children: image.chart,
  }
  const initialSize = getChartImageLayout(frameProps)
  if (output) {
    try { getChartImageRasterSize(initialSize, output) }
    catch { aspectError = 'この縦横比では画像の大きさが上限を超えます。' }
  }

  async function saveImage(selectedFilename: string, chooseLocation: boolean) {
    if (aspectError || saveInProgress.current) return
    saveInProgress.current = true
    setSaving(true)
    setSaveError(false)
    try {
      const destination = await selectChartImageDestination(selectedFilename, chooseLocation ? picker : undefined)
      if (destination.type === 'cancelled') return
      await saveComparisonChartImage({
        chart: <ChartImageFrame {...frameProps} />,
        filename: selectedFilename,
        width: initialSize.width,
        output,
        writeBlob: destination.type === 'file' ? destination.write : undefined,
      })
      onClose()
    } catch {
      setSaveError(true)
    } finally {
      saveInProgress.current = false
      setSaving(false)
    }
  }

  return <ChartImageSaveDialog
    parentLocation={parentLocation}
    initialFilename={filename}
    getDefaultFilename={ratio => withChartImageAspect(filename, ratio)}
    aspect={aspect}
    aspectPresets={IMAGE_ASPECT_PRESETS}
    aspectError={aspectError}
    onAspectChange={next => { setAspect(next); setSaveError(false) }}
    canChooseLocation={Boolean(picker)}
    saving={saving}
    error={saveError}
    helpMode={helpMode}
    onClose={onClose}
    onSave={selectedFilename => { void saveImage(selectedFilename, true) }}
    additionalSaveAction={picker ? {
      label: 'ダウンロード',
      onSave: selectedFilename => { void saveImage(selectedFilename, false) },
    } : undefined}
    options={alternateLayout && <label className="chart-image-save-field">
      <span>出力レイアウト</span>
      <select value={useAlternateLayout ? 'alternate' : 'standard'} disabled={saving}
        onChange={event => { setUseAlternateLayout(event.target.value === 'alternate'); setSaveError(false) }}>
        <option value="standard">標準</option>
        <option value="alternate">{alternateLayout.label}</option>
      </select>
    </label>}
    preview={!aspectError && <ChartFrameImagePreview
      key={`${filename}:${aspectRatio ?? 'auto'}`} {...frameProps} output={output} />}
  />
}

export function ChartFrameImagePreview({ output, ...props }: ChartImageFrameProps & { output?: ChartImageRasterOutput }) {
  const previewRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(600)
  const [size, setSize] = useState<{ width: number; height: number }>(() => getChartImageLayout(props))

  useLayoutEffect(() => {
    const element = previewRef.current
    if (!element) return
    const measure = () => setAvailableWidth(Math.max(1, element.clientWidth))
    measure()
    let frame = 0
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(measure)
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frame)
    }
  }, [])

  const scale = Math.min(availableWidth / size.width, 380 / size.height, 1)
  const rasterSize = getChartImageRasterSize(size, output)
  return <div className="dc3-attribute-chart-image-preview">
    <div className="dc3-attribute-chart-image-preview-heading"><span>プレビュー</span><span>PNG</span></div>
    <div ref={previewRef} className="dc3-attribute-chart-image-preview-frame" style={{ height: Math.ceil(size.height * scale) }}>
      <div className="dc3-attribute-chart-image-preview-position" style={{
        left: (availableWidth - size.width * scale) / 2, transform: `scale(${scale})`,
      }}>
        <ChartImageFrame {...props} onLayout={setSize} />
      </div>
    </div>
    <span className="dc3-attribute-chart-image-preview-size" aria-live="polite">
      {rasterSize.width.toLocaleString('ja-JP')} × {rasterSize.height.toLocaleString('ja-JP')} px
    </span>
  </div>
}
