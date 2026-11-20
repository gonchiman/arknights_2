import { useId, useMemo, useRef, useState } from 'react'
import {
  createEnemyBoxplotComparisonImageSnapshot, ENEMY_BOXPLOT_IMAGE_TITLE,
  getEnemyBoxplotComparisonImageConditions, getEnemyBoxplotComparisonImageFilename,
  type EnemyBoxplotComparisonImageSnapshot,
} from '../lib/enemyBoxplotImage'
import { downloadChartFile, getChartImageSavePicker, selectChartArchiveDestination, selectChartImageDestination } from '../lib/chartImageDestination'
import {
  buildEnemyBoxplotImageVariants, ENEMY_BOXPLOT_IMAGE_SCALE_OPTIONS, ENEMY_BOXPLOT_IMAGE_RANGE_OPTIONS,
  ENEMY_BOXPLOT_IMAGE_OUTLIER_OPTIONS, getEnemyBoxplotArchiveFilename, getEnemyBoxplotVariantFilename,
  type EnemyBoxplotImageSelection,
} from '../lib/enemyBoxplotImageBatch'
import { withChartImageAspect } from '../lib/chartImageFilename'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { ENEMY_HISTOGRAM_COUNT_MODES } from '../lib/enemyHistogramCounts'
import { parseTableImageAspect, type TableImageAspect } from '../lib/tableImageAspect'
import { createStoredZipArchive } from '../lib/pngZipArchive'
import { ChartImageFrame, type ChartImageFrameProps } from './ChartImageFrame'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { ChartFrameImagePreview } from './DamageCalculatorThreeAttributeChartImageDialog'
import { EnemyBoxplotComparisonLegend, EnemyBoxplotComparisonPlot, getEnemyBoxplotComparisonPlotHeight } from './EnemyBoxplotComparisonPlot'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import './EnemyChartImage.css'
import './EnemyBoxplotComparisonImage.css'

export type { EnemyBoxplotComparisonImageSnapshot } from '../lib/enemyBoxplotImage'

const IMAGE_ASPECT_PRESETS = ['16:9', '4:3', '1:1', '2:1', '9:16'] as const

/** Screen, preview and PNG share the same statistics and plot renderer. */
export function getEnemyBoxplotComparisonImageFrameProps(
  snapshot: EnemyBoxplotComparisonImageSnapshot,
  aspectRatio?: number,
  exactAspect?: TableImageAspect,
): ChartImageFrameProps {
  const unit = ENEMY_HISTOGRAM_COUNT_MODES.find(({ key }) => key === snapshot.countMode)!.unit
  return {
    className: 'enemy-chart-image',
    title: ENEMY_BOXPLOT_IMAGE_TITLE,
    legend: <EnemyBoxplotComparisonLegend imageMode />,
    conditions: getEnemyBoxplotComparisonImageConditions(snapshot),
    naturalChartHeight: getEnemyBoxplotComparisonPlotHeight(snapshot.scale),
    aspectRatio,
    exactAspect,
    children: ({ width, height }) => <EnemyBoxplotComparisonPlot data={snapshot.data}
      scale={snapshot.scale} range={snapshot.range} showOutlierInfo={snapshot.showOutlierInfo ?? true}
      width={width} height={height} unit={unit} imageMode />,
  }
}

export function EnemyBoxplotComparisonImage({ snapshot, aspectRatio, exactAspect, onLayout }: {
  snapshot: EnemyBoxplotComparisonImageSnapshot
  aspectRatio?: number
  exactAspect?: TableImageAspect
  onLayout?: ChartImageFrameProps['onLayout']
}) {
  return <ChartImageFrame {...getEnemyBoxplotComparisonImageFrameProps(snapshot, aspectRatio, exactAspect)} onLayout={onLayout} />
}

export function EnemyBoxplotComparisonSaveDialog({ snapshot, onClose }: {
  snapshot: EnemyBoxplotComparisonImageSnapshot
  onClose: () => void
}) {
  const [outputSnapshot] = useState(() => createEnemyBoxplotComparisonImageSnapshot(snapshot))
  const [outputMode, setOutputMode] = useState<'current' | 'multiple'>('current')
  const [selection, setSelection] = useState<EnemyBoxplotImageSelection>(() => ({
    scales: ['RAW', 'MEDIAN'], ranges: ['ALL', 'WHISKERS'], outlierInfo: [outputSnapshot.showOutlierInfo !== false],
  }))
  const [previewKey, setPreviewKey] = useState('current')
  const modeId = useId()
  const [aspect, setAspect] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [saveProgress, setSaveProgress] = useState('')
  const saveInProgress = useRef(false)
  const parsedAspect = aspect.preset === 'auto' ? null : parseTableImageAspect(aspect.width, aspect.height)
  const invalidAspect = aspect.preset !== 'auto' && !parsedAspect
  const aspectRatio = parsedAspect ? parsedAspect.width / parsedAspect.height : undefined
  const picker = getChartImageSavePicker()
  const variants = useMemo(() => outputMode === 'multiple'
    ? buildEnemyBoxplotImageVariants(outputSnapshot, selection)
    : [{ key: 'current', label: '現在の条件', snapshot: outputSnapshot }], [outputMode, outputSnapshot, selection])
  const archive = variants.length > 1
  const selectedPreview = variants.find(({ key }) => key === previewKey) ?? variants[0]
  const frameProps = selectedPreview
    ? getEnemyBoxplotComparisonImageFrameProps(selectedPreview.snapshot, aspectRatio, parsedAspect ?? undefined) : null
  const getDefaultFilename = (ratio?: number) => archive
    ? getEnemyBoxplotArchiveFilename(outputSnapshot, variants, ratio)
    : outputMode === 'multiple' && variants[0] ? getEnemyBoxplotVariantFilename(variants[0].snapshot, ratio)
    : withChartImageAspect(getEnemyBoxplotComparisonImageFilename(outputSnapshot), ratio)
  const filename = getDefaultFilename()

  function changeSelection(next: EnemyBoxplotImageSelection) {
    setSelection(next)
    setSaveError(false)
  }

  async function saveImage(selectedFilename: string, chooseLocation: boolean) {
    if (invalidAspect || variants.length === 0 || saveInProgress.current) return
    saveInProgress.current = true
    setSaving(true)
    setSaveError(false)
    setSaveProgress('')
    try {
      const selectDestination = archive ? selectChartArchiveDestination : selectChartImageDestination
      const destination = await selectDestination(selectedFilename, chooseLocation ? picker : undefined)
      if (destination.type === 'cancelled') return
      if (archive) {
        const files: { name: string; blob: Blob }[] = []
        for (const [index, variant] of variants.entries()) {
          setSaveProgress(`PNG ${index + 1}/${variants.length}を作成中…`)
          const frame = getEnemyBoxplotComparisonImageFrameProps(variant.snapshot, aspectRatio, parsedAspect ?? undefined)
          const name = getEnemyBoxplotVariantFilename(variant.snapshot, aspectRatio)
          await saveComparisonChartImage({
            chart: <ChartImageFrame {...frame} />, filename: name, width: getChartImageLayout(frame).width,
            writeBlob: async blob => { files.push({ name, blob }) },
          })
        }
        setSaveProgress('ZIPを作成中…')
        const blob = await createStoredZipArchive(files)
        if (destination.type === 'file') await destination.write(blob)
        else downloadChartFile(blob, /\.zip$/i.test(selectedFilename) ? selectedFilename : `${selectedFilename}.zip`)
      } else {
        const frame = getEnemyBoxplotComparisonImageFrameProps(variants[0].snapshot, aspectRatio, parsedAspect ?? undefined)
        await saveComparisonChartImage({
          chart: <ChartImageFrame {...frame} />, filename: selectedFilename, width: getChartImageLayout(frame).width,
          writeBlob: destination.type === 'file' ? destination.write : undefined,
        })
      }
      onClose()
    } catch {
      setSaveError(true)
    } finally {
      saveInProgress.current = false
      setSaving(false)
      setSaveProgress('')
    }
  }

  return <ChartImageSaveDialog
    initialFilename={filename}
    getDefaultFilename={getDefaultFilename}
    archive={archive}
    saveLabel={archive ? `${variants.length}枚をZIP保存` : undefined}
    progress={saveProgress}
    aspect={aspect}
    aspectPresets={IMAGE_ASPECT_PRESETS}
    aspectError={invalidAspect ? '幅と高さは1〜100の整数、縦横比は1:10〜10:1で指定してください。' : undefined}
    onAspectChange={next => { setAspect(next); setSaveError(false) }}
    canChooseLocation={Boolean(picker)}
    saving={saving}
    saveDisabled={variants.length === 0}
    error={saveError}
    helpMode="none"
    onClose={onClose}
    onSave={selectedFilename => { void saveImage(selectedFilename, true) }}
    additionalSaveAction={picker ? {
      label: archive ? 'ZIPをダウンロード' : 'ダウンロード',
      onSave: selectedFilename => { void saveImage(selectedFilename, false) },
    } : undefined}
    options={<div className="enemy-boxplot-image-options">
      <fieldset disabled={saving}>
        <legend>出力対象</legend>
        <div className="enemy-boxplot-image-choice-row">
          {([{ key: 'current', label: '現在の条件' }, { key: 'multiple', label: '複数条件' }] as const).map(({ key, label }) =>
            <label key={key}><input type="radio" name={modeId} checked={outputMode === key}
              onChange={() => { setOutputMode(key); setSaveError(false) }} />{label}</label>)}
        </div>
      </fieldset>
      {outputMode === 'multiple' && <>
        <fieldset disabled={saving}><legend>値</legend><div className="enemy-boxplot-image-choice-row">
          {ENEMY_BOXPLOT_IMAGE_SCALE_OPTIONS.map(({ key, label }) => <label key={key}>
            <input type="checkbox" checked={selection.scales.includes(key)} onChange={event => changeSelection({
              ...selection, scales: toggleChoice(selection.scales, key, event.target.checked),
            })} />{label}</label>)}
        </div></fieldset>
        <fieldset disabled={saving}><legend>範囲</legend><div className="enemy-boxplot-image-choice-row">
          {ENEMY_BOXPLOT_IMAGE_RANGE_OPTIONS.map(({ key, label }) => <label key={key}>
            <input type="checkbox" checked={selection.ranges.includes(key)} onChange={event => changeSelection({
              ...selection, ranges: toggleChoice(selection.ranges, key, event.target.checked),
            })} />{label}</label>)}
        </div></fieldset>
        <fieldset disabled={saving}><legend>外れ値情報</legend><div className="enemy-boxplot-image-choice-row">
          {ENEMY_BOXPLOT_IMAGE_OUTLIER_OPTIONS.map(({ key, label }) => <label key={String(key)}>
            <input type="checkbox" checked={selection.outlierInfo.includes(key)} onChange={event => changeSelection({
              ...selection, outlierInfo: toggleChoice(selection.outlierInfo, key, event.target.checked),
            })} />{label}</label>)}
        </div></fieldset>
        <div className="enemy-boxplot-image-output-count" role="status">{variants.length}枚{archive ? ' · ZIP' : variants.length ? ' · PNG' : ''}</div>
        {variants.length === 0 && <p className="chart-image-save-error" role="alert">値・範囲・外れ値情報をそれぞれ1つ以上選択してください。</p>}
      </>}
    </div>}
    preview={frameProps && !invalidAspect && <div className="enemy-boxplot-image-previews">
      {outputMode === 'multiple' && <fieldset className="enemy-boxplot-image-options" disabled={saving}>
        <legend>プレビュー</legend><div className="enemy-boxplot-image-preview-choices">
          {variants.map(variant => <button type="button" className="button secondary" key={variant.key}
            aria-pressed={variant.key === selectedPreview.key} onClick={() => setPreviewKey(variant.key)}>{variant.label}</button>)}
        </div>
      </fieldset>}
      <ChartFrameImagePreview key={`${selectedPreview.key}:${aspectRatio ?? 'auto'}`} {...frameProps} />
    </div>}
  />
}

function toggleChoice<T>(values: readonly T[], value: T, checked: boolean): T[] {
  return checked ? [...new Set([...values, value])] : values.filter(item => item !== value)
}
