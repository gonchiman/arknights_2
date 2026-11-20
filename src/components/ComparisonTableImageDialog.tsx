import { useCallback, useRef, useState, type ReactNode } from 'react'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { createChartImageFilename, withChartImageAspect } from '../lib/chartImageFilename'
import { getChartImageRasterSize } from '../lib/chartImageRasterSize'
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

export function ComparisonTableImageDialog({ snapshot, onClose, options, selectionError, fixedOutputWidth, helpMode = 'popover' }: {
  snapshot: ComparisonTableImageSnapshot
  onClose: () => void
  options?: (saving: boolean) => ReactNode
  selectionError?: string
  fixedOutputWidth?: number
  helpMode?: 'inline' | 'popover' | 'none'
}) {
  const [aspect, setAspect] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
  const [fixOutputWidth, setFixOutputWidth] = useState(false)
  const [readyLayout, setReadyLayout] = useState<{
    snapshot: ComparisonTableImageSnapshot; key: string
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveFailure, setSaveFailure] = useState<{
    snapshot: ComparisonTableImageSnapshot; message: true | string
  } | null>(null)
  const saveInProgress = useRef(false)
  const parsedAspect = aspect.preset === 'auto' ? null : parseTableImageAspect(aspect.width, aspect.height)
  const invalidAspect = aspect.preset !== 'auto' && !parsedAspect
  const aspectRatio = parsedAspect ? parsedAspect.width / parsedAspect.height : undefined
  const outputWidth = fixOutputWidth ? fixedOutputWidth : undefined
  const initialWidth = outputWidth === undefined ? IMAGE_WIDTH : outputWidth / 2
  const output = outputWidth === undefined ? undefined : { width: outputWidth, aspectRatio }
  let outputError: string | undefined
  if (output) {
    try {
      getChartImageRasterSize({ width: initialWidth, height: 1 }, output)
    } catch (cause) {
      outputError = cause instanceof Error ? cause.message : '指定した画像の大きさで保存できません。'
    }
  }
  const layoutKey = `${outputWidth ?? 'auto'}:${aspectRatio ?? 'auto'}`
  const showPreview = !invalidAspect && !selectionError && !outputError
  const layoutReady = showPreview && readyLayout?.snapshot === snapshot && readyLayout.key === layoutKey
  const onLayoutReady = useCallback(() => {
    setReadyLayout(previous => previous?.snapshot === snapshot && previous.key === layoutKey
      ? previous : { snapshot, key: layoutKey })
  }, [snapshot, layoutKey])
  const onLayoutError = useCallback(() => setReadyLayout(null), [])
  const saveError = saveFailure?.snapshot === snapshot ? saveFailure.message : false
  const picker = getChartImageSavePicker()
  const filename = createChartImageFilename(snapshot.title, [
    ...(snapshot.filenameConditions ?? snapshot.conditions), ...(outputWidth === undefined ? [] : [`幅${outputWidth}px`]),
  ])
  const frameProps = {
    initialWidth,
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
    setSaveFailure(null)
    let exportSize: { width: number; height: number } | null = null
    let exportLayoutError: unknown
    try {
      const destination = await selectChartImageDestination(selectedFilename, chooseLocation ? picker : undefined)
      if (destination.type === 'cancelled') return
      await document.fonts.ready
      await saveComparisonChartImage({
        chart: <ComparisonTableImageFrame {...frameProps} exporting onLayout={size => {
          exportSize = size
          exportLayoutError = undefined
        }} onLayoutError={cause => {
          exportSize = null
          exportLayoutError = cause
        }} />,
        filename: selectedFilename,
        width: initialWidth,
        output,
        writeBlob: destination.type === 'file' ? destination.write : undefined,
        validateLayout: size => {
          if (exportSize?.width === size.width && exportSize.height === size.height) return
          exportLayoutError ??= new Error('保存する表の大きさを確認できませんでした。')
          throw exportLayoutError
        },
      })
      onClose()
    } catch {
      setSaveFailure({ snapshot, message: exportLayoutError instanceof Error ? exportLayoutError.message : true })
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
    aspectError={invalidAspect ? '幅と高さは1〜100の整数、縦横比は1:10〜10:1で指定してください。' : outputError}
    onAspectChange={next => { setAspect(next); setSaveFailure(null) }}
    canChooseLocation={Boolean(picker)}
    saving={saving}
    saveDisabled={!layoutReady}
    error={selectionError ?? (saveError === true)}
    options={<>
      {fixedOutputWidth !== undefined && <label>
        <input type="checkbox" checked={fixOutputWidth} disabled={saving} onChange={event => {
          setFixOutputWidth(event.target.checked)
          setSaveFailure(null)
        }} />
        出力幅を{fixedOutputWidth.toLocaleString('ja-JP')} pxに固定
      </label>}
      {options?.(saving)}
      {!selectionError && typeof saveError === 'string' && <p className="chart-image-save-error" role="alert">{saveError}</p>}
    </>}
    helpMode={helpMode}
    onClose={onClose}
    onSave={selectedFilename => { void saveImage(selectedFilename, true) }}
    additionalSaveAction={picker ? {
      label: 'ダウンロード',
      onSave: selectedFilename => { void saveImage(selectedFilename, false) },
    } : undefined}
    preview={showPreview && <ComparisonTableImagePreview key={layoutKey} {...frameProps} output={output}
      onLayoutReady={onLayoutReady} onLayoutError={onLayoutError} />}
  />
}
