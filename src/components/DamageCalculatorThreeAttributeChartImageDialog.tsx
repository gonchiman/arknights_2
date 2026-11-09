import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { createChartImageFilename, withChartImageAspect } from '../lib/chartImageFilename'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { parseTableImageAspect } from '../lib/tableImageAspect'
import { ChartImageFrame, type ChartImageFrameProps } from './ChartImageFrame'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import './DamageCalculatorThreeAttributeChartImageDialog.css'

export interface DamageCalculatorThreeAttributeChartImageSnapshot {
  title: string
  axisTitle?: string
  conditions: readonly string[]
  filenameParts: readonly string[]
  legend: ReactNode
  chart: ChartImageFrameProps['children']
}

const NATURAL_CHART_HEIGHT = 334
const IMAGE_ASPECT_PRESETS = ['16:9', '4:3', '1:1', '2:1', '9:16'] as const

export function DamageCalculatorThreeAttributeChartImageDialog({ snapshot, onClose }: {
  snapshot: DamageCalculatorThreeAttributeChartImageSnapshot
  onClose: () => void
}) {
  const [aspect, setAspect] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const saveInProgress = useRef(false)
  const parsedAspect = aspect.preset === 'auto' ? null : parseTableImageAspect(aspect.width, aspect.height)
  const invalidAspect = aspect.preset !== 'auto' && !parsedAspect
  const aspectRatio = parsedAspect ? parsedAspect.width / parsedAspect.height : undefined
  const picker = getChartImageSavePicker()
  const filename = createChartImageFilename(snapshot.title, snapshot.filenameParts)
  const frameProps: ChartImageFrameProps = {
    title: snapshot.title,
    legend: snapshot.legend,
    conditions: snapshot.conditions.join('・'),
    axisTitle: snapshot.axisTitle ?? 'ゲーム内評価',
    naturalChartHeight: NATURAL_CHART_HEIGHT,
    aspectRatio,
    children: snapshot.chart,
  }

  async function saveImage(selectedFilename: string, chooseLocation: boolean) {
    if (invalidAspect || saveInProgress.current) return
    saveInProgress.current = true
    setSaving(true)
    setSaveError(false)
    try {
      const destination = await selectChartImageDestination(selectedFilename, chooseLocation ? picker : undefined)
      if (destination.type === 'cancelled') return
      await saveComparisonChartImage({
        chart: <ChartImageFrame {...frameProps} />,
        filename: selectedFilename,
        width: getChartImageLayout(frameProps).width,
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
    initialFilename={filename}
    getDefaultFilename={ratio => withChartImageAspect(filename, ratio)}
    aspect={aspect}
    aspectPresets={IMAGE_ASPECT_PRESETS}
    aspectError={invalidAspect ? '幅と高さは1〜100の整数、縦横比は1:10〜10:1で指定してください。' : undefined}
    onAspectChange={next => { setAspect(next); setSaveError(false) }}
    canChooseLocation={Boolean(picker)}
    saving={saving}
    error={saveError}
    helpMode="popover"
    onClose={onClose}
    onSave={selectedFilename => { void saveImage(selectedFilename, true) }}
    additionalSaveAction={picker ? {
      label: 'ダウンロード',
      onSave: selectedFilename => { void saveImage(selectedFilename, false) },
    } : undefined}
    preview={!invalidAspect && <AttributeChartImagePreview
      key={`${filename}:${aspectRatio ?? 'auto'}`} {...frameProps} />}
  />
}

function AttributeChartImagePreview(props: ChartImageFrameProps) {
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
  const pixelRatio = Math.min(2, 16_000 / size.width, 16_000 / size.height, Math.sqrt(32_000_000 / size.width / size.height))
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
      {Math.floor(size.width * pixelRatio).toLocaleString('ja-JP')} × {Math.floor(size.height * pixelRatio).toLocaleString('ja-JP')} px
    </span>
  </div>
}
