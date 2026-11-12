import { useCallback, useRef, useState, type ReactNode } from 'react'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { createChartImageFilename, withChartImageAspect } from '../lib/chartImageFilename'
import { parseTableImageAspect } from '../lib/tableImageAspect'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { ComparisonTableImageFrame, ComparisonTableImagePreview } from './ComparisonTableImageFrame'
import { saveComparisonChartImage } from './saveComparisonChartImage'

export interface ComparisonTableImageSnapshot {
  title: string
  conditions: readonly string[]
  filenameConditions?: readonly string[]
  table: ReactNode
}

const IMAGE_WIDTH = 720
const IMAGE_ASPECT_PRESETS = ['16:9', '4:3', '1:1', '2:1', '9:16'] as const

export function ComparisonTableImageDialog({ snapshot, onClose }: {
  snapshot: ComparisonTableImageSnapshot
  onClose: () => void
}) {
  const [aspect, setAspect] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
  const [readyRatio, setReadyRatio] = useState<number | 'auto' | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<boolean | string>(false)
  const saveInProgress = useRef(false)
  const parsedAspect = aspect.preset === 'auto' ? null : parseTableImageAspect(aspect.width, aspect.height)
  const invalidAspect = aspect.preset !== 'auto' && !parsedAspect
  const aspectRatio = parsedAspect ? parsedAspect.width / parsedAspect.height : undefined
  const ratioKey = aspectRatio ?? 'auto'
  const layoutReady = !invalidAspect && readyRatio === ratioKey
  const onLayoutReady = useCallback(() => setReadyRatio(ratioKey), [ratioKey])
  const onLayoutError = useCallback(() => setReadyRatio(null), [])
  const picker = getChartImageSavePicker()
  const filename = createChartImageFilename(snapshot.title, snapshot.filenameConditions ?? snapshot.conditions)
  const frameProps = {
    initialWidth: IMAGE_WIDTH,
    ariaLabel: snapshot.title,
    title: snapshot.title,
    footer: snapshot.conditions.join(' · '),
    aspectRatio,
    children: snapshot.table,
  }

  async function saveImage(selectedFilename: string, chooseLocation: boolean) {
    if (!layoutReady || saveInProgress.current) return
    saveInProgress.current = true
    setSaving(true)
    setSaveError(false)
    let exportLayoutError: unknown
    try {
      const destination = await selectChartImageDestination(selectedFilename, chooseLocation ? picker : undefined)
      if (destination.type === 'cancelled') return
      await document.fonts.ready
      await saveComparisonChartImage({
        chart: <ComparisonTableImageFrame {...frameProps} exporting onLayoutError={cause => { exportLayoutError = cause }} />,
        filename: selectedFilename,
        width: IMAGE_WIDTH,
        writeBlob: destination.type === 'file' ? destination.write : undefined,
      })
      onClose()
    } catch {
      setSaveError(exportLayoutError instanceof Error ? exportLayoutError.message : true)
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
    saveDisabled={!layoutReady}
    error={saveError === true}
    options={typeof saveError === 'string' ? <p className="chart-image-save-error" role="alert">{saveError}</p> : undefined}
    helpMode="popover"
    onClose={onClose}
    onSave={selectedFilename => { void saveImage(selectedFilename, true) }}
    additionalSaveAction={picker ? {
      label: 'ダウンロード',
      onSave: selectedFilename => { void saveImage(selectedFilename, false) },
    } : undefined}
    preview={!invalidAspect && <ComparisonTableImagePreview {...frameProps}
      onLayoutReady={onLayoutReady} onLayoutError={onLayoutError} />}
  />
}
