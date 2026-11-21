import { useRef, useState } from 'react'
import { getBarChartFilename, type BarChartDocument, type BarChartDisplaySettings } from '../lib/barChartDocument'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { getChartImageRasterSize } from '../lib/chartImageRasterSize'
import { getBarChartNaturalHeight } from '../lib/barChartLayout'
import { parseTableImageAspect } from '../lib/tableImageAspect'
import { BarChartPlot } from './BarChartPlot'
import { ChartImageFrame, type ChartImageFrameProps } from './ChartImageFrame'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { ChartFrameImagePreview } from './DamageCalculatorThreeAttributeChartImageDialog'
import { saveComparisonChartImage } from './saveComparisonChartImage'

export interface BarChartImageSnapshot {
  readonly document: BarChartDocument
  readonly settings: Readonly<BarChartDisplaySettings>
}

export function createBarChartImageSnapshot(document: BarChartDocument, settings: BarChartDisplaySettings): BarChartImageSnapshot {
  return Object.freeze({ document, settings: Object.freeze({ ...settings,
    ...(settings.selectedRanks ? { selectedRanks: Object.freeze([...settings.selectedRanks]) } : {}),
  }) })
}

export function getBarChartImageFrame(snapshot: BarChartImageSnapshot, aspectRatio?: number,
  onLayout?: ChartImageFrameProps['onLayout']): ChartImageFrameProps {
  return {
    title: snapshot.document.title,
    conditions: snapshot.document.conditions,
    axisTitle: snapshot.document.xAxisTitle,
    naturalChartHeight: getBarChartNaturalHeight(snapshot.document, snapshot.settings),
    aspectRatio,
    onLayout,
    children: size => <BarChartPlot document={snapshot.document} settings={snapshot.settings} {...size} imageMode />,
  }
}

export function BarChartImageDialog({ snapshot, onClose }: { snapshot: BarChartImageSnapshot; onClose: () => void }) {
  const [aspect, setAspect] = useState<ChartImageAspectSettings>({ preset: '16:9', width: '16', height: '9' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const inProgress = useRef(false)
  const parsed = aspect.preset === 'auto' ? null : parseTableImageAspect(aspect.width, aspect.height)
  const aspectRatio = parsed ? parsed.width / parsed.height : undefined
  const frame = getBarChartImageFrame(snapshot, aspectRatio)
  const layout = getChartImageLayout(frame)
  const output = { width: 1920, aspectRatio }
  let aspectError = aspect.preset !== 'auto' && !parsed ? '縦横比は1:10〜10:1、幅と高さは1〜100の整数で指定してください。' : undefined
  try { getChartImageRasterSize(layout, output) }
  catch { aspectError = 'この縦横比では画像の大きさが上限を超えます。' }
  const picker = getChartImageSavePicker()
  const filename = getBarChartFilename(snapshot.document, snapshot.settings, aspectRatio)

  async function save(filename: string, chooseLocation: boolean) {
    if (aspectError || inProgress.current) return
    inProgress.current = true
    setSaving(true)
    setSaveError(false)
    try {
      const destination = await selectChartImageDestination(filename, chooseLocation ? picker : undefined)
      if (destination.type === 'cancelled') return
      await saveComparisonChartImage({ chart: <ChartImageFrame {...frame} />, filename, width: layout.width, output,
        writeBlob: destination.type === 'file' ? destination.write : undefined })
      onClose()
    } catch { setSaveError(true) }
    finally { inProgress.current = false; setSaving(false) }
  }

  return <ChartImageSaveDialog initialFilename={filename}
    getDefaultFilename={ratio => getBarChartFilename(snapshot.document, snapshot.settings, ratio)}
    aspect={aspect} onAspectChange={value => { setAspect(value); setSaveError(false) }} aspectError={aspectError}
    canChooseLocation={Boolean(picker)} saving={saving} error={saveError} helpMode="none" onClose={onClose}
    onSave={name => { void save(name, true) }}
    additionalSaveAction={picker ? { label: 'ダウンロード', onSave: name => { void save(name, false) } } : undefined}
    preview={!aspectError && <ChartFrameImagePreview key={`${snapshot.document.id}:${aspectRatio ?? 'auto'}`} {...frame} output={output} />} />
}
