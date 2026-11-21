import { useMemo, useState } from 'react'
import {
  createEnemyBoxplotComparisonImageSnapshot, ENEMY_BOXPLOT_IMAGE_TITLE,
  getEnemyBoxplotComparisonImageConditions, getEnemyBoxplotComparisonImageFilename,
  type EnemyBoxplotComparisonImageSnapshot,
} from '../lib/enemyBoxplotImage'
import {
  buildEnemyBoxplotImageVariants, ENEMY_BOXPLOT_IMAGE_SCALE_OPTIONS, ENEMY_BOXPLOT_IMAGE_RANGE_OPTIONS,
  ENEMY_BOXPLOT_IMAGE_OUTLIER_OPTIONS, getEnemyBoxplotArchiveFilename, getEnemyBoxplotVariantFilename,
  type EnemyBoxplotImageSelection,
} from '../lib/enemyBoxplotImageBatch'
import { withChartImageAspect } from '../lib/chartImageFilename'
import { ENEMY_HISTOGRAM_COUNT_MODES } from '../lib/enemyHistogramCounts'
import { parseTableImageAspect, type TableImageAspect } from '../lib/tableImageAspect'
import { ChartImageFrame, type ChartImageFrameProps } from './ChartImageFrame'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { ChartImageBatchOptions, ChartImageBatchPreviewChoices } from './ChartImageBatchOptions'
import { ChartFrameImagePreview } from './DamageCalculatorThreeAttributeChartImageDialog'
import { EnemyBoxplotComparisonLegend, EnemyBoxplotComparisonPlot, getEnemyBoxplotComparisonPlotHeight } from './EnemyBoxplotComparisonPlot'
import { useChartImageBatchSave } from './useChartImageBatchSave'
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
  const [saveMethod, setSaveMethod] = useState<'file' | 'directory'>('file')
  const [selection, setSelection] = useState<EnemyBoxplotImageSelection>(() => ({
    scales: ['RAW', 'MEDIAN'], ranges: ['ALL', 'WHISKERS'], outlierInfo: [outputSnapshot.showOutlierInfo !== false],
  }))
  const [previewKey, setPreviewKey] = useState('current')
  const [aspect, setAspect] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
  const parsedAspect = aspect.preset === 'auto' ? null : parseTableImageAspect(aspect.width, aspect.height)
  const invalidAspect = aspect.preset !== 'auto' && !parsedAspect
  const aspectRatio = parsedAspect ? parsedAspect.width / parsedAspect.height : undefined
  const variants = useMemo(() => outputMode === 'multiple'
    ? buildEnemyBoxplotImageVariants(outputSnapshot, selection)
    : [{ key: 'current', label: '現在の条件', snapshot: outputSnapshot }], [outputMode, outputSnapshot, selection])
  const folderExport = outputMode === 'multiple' && saveMethod === 'directory'
  const archive = variants.length > 1 && !folderExport
  const { saving, error, progress, folderProgress, reset, save, picker, directoryPicker } = useChartImageBatchSave({
    outputs: variants.map(variant => ({ key: variant.key,
      filename: getEnemyBoxplotVariantFilename(variant.snapshot, aspectRatio),
      frame: getEnemyBoxplotComparisonImageFrameProps(variant.snapshot, aspectRatio, parsedAspect ?? undefined),
    })), archive, folderExport, invalid: Boolean(invalidAspect), onClose,
  })
  const folderUnavailable = folderExport && !directoryPicker
  const selectedPreview = variants.find(({ key }) => key === previewKey) ?? variants[0]
  const frameProps = selectedPreview
    ? getEnemyBoxplotComparisonImageFrameProps(selectedPreview.snapshot, aspectRatio, parsedAspect ?? undefined) : null
  const getDefaultFilename = (ratio?: number) => archive
    ? getEnemyBoxplotArchiveFilename(outputSnapshot, variants, ratio)
    : outputMode === 'multiple' && variants[0] ? getEnemyBoxplotVariantFilename(variants[0].snapshot, ratio)
    : withChartImageAspect(getEnemyBoxplotComparisonImageFilename(outputSnapshot), ratio)
  const filename = getDefaultFilename()

  function changeSelection(next: EnemyBoxplotImageSelection) {
    reset()
    setSelection(next)
  }

  return <ChartImageSaveDialog
    initialFilename={filename}
    getDefaultFilename={getDefaultFilename}
    archive={archive}
    showFilename={!folderExport}
    saveLabel={folderExport ? folderProgress && folderProgress.completed > 0
      ? `残り${folderProgress.total - folderProgress.completed}枚を保存` : `フォルダに${variants.length}枚保存`
      : archive ? `${variants.length}枚をZIP保存` : undefined}
    progress={progress}
    aspect={aspect}
    aspectPresets={IMAGE_ASPECT_PRESETS}
    aspectError={invalidAspect ? '幅と高さは1〜100の整数、縦横比は1:10〜10:1で指定してください。' : undefined}
    onAspectChange={next => { reset(); setAspect(next) }}
    canChooseLocation={folderExport ? Boolean(directoryPicker) : Boolean(picker)}
    saving={saving}
    saveDisabled={variants.length === 0 || folderUnavailable}
    error={error}
    helpMode="none"
    onClose={onClose}
    onSave={selectedFilename => { void save(selectedFilename, true) }}
    additionalSaveAction={folderExport ? folderProgress ? {
      label: 'フォルダを選び直す',
      onSave: selectedFilename => { void save(selectedFilename, true, true) },
    } : undefined : picker ? {
      label: archive ? 'ZIPをダウンロード' : 'ダウンロード',
      onSave: selectedFilename => { void save(selectedFilename, false) },
    } : undefined}
    options={<ChartImageBatchOptions mode={outputMode} onModeChange={next => { reset(); setOutputMode(next) }}
      method={saveMethod} onMethodChange={next => { reset(); setSaveMethod(next) }}
      directoryAvailable={Boolean(directoryPicker)} saving={saving} count={variants.length}>
        <fieldset disabled={saving}><legend>値</legend><div className="chart-image-batch-choice-row">
          {ENEMY_BOXPLOT_IMAGE_SCALE_OPTIONS.map(({ key, label }) => <label key={key}>
            <input type="checkbox" checked={selection.scales.includes(key)} onChange={event => changeSelection({
              ...selection, scales: toggleChoice(selection.scales, key, event.target.checked),
            })} />{label}</label>)}
        </div></fieldset>
        <fieldset disabled={saving}><legend>範囲</legend><div className="chart-image-batch-choice-row">
          {ENEMY_BOXPLOT_IMAGE_RANGE_OPTIONS.map(({ key, label }) => <label key={key}>
            <input type="checkbox" checked={selection.ranges.includes(key)} onChange={event => changeSelection({
              ...selection, ranges: toggleChoice(selection.ranges, key, event.target.checked),
            })} />{label}</label>)}
        </div></fieldset>
        <fieldset disabled={saving}><legend>外れ値情報</legend><div className="chart-image-batch-choice-row">
          {ENEMY_BOXPLOT_IMAGE_OUTLIER_OPTIONS.map(({ key, label }) => <label key={String(key)}>
            <input type="checkbox" checked={selection.outlierInfo.includes(key)} onChange={event => changeSelection({
              ...selection, outlierInfo: toggleChoice(selection.outlierInfo, key, event.target.checked),
            })} />{label}</label>)}
        </div></fieldset>
        {variants.length === 0 && <p className="chart-image-save-error" role="alert">値・範囲・外れ値情報をそれぞれ1つ以上選択してください。</p>}
    </ChartImageBatchOptions>}
    preview={frameProps && !invalidAspect && <div className="chart-image-batch-previews">
      {outputMode === 'multiple' && <ChartImageBatchPreviewChoices variants={variants}
        selectedKey={selectedPreview.key} onSelect={setPreviewKey} saving={saving} />}
      <ChartFrameImagePreview key={`${selectedPreview.key}:${aspectRatio ?? 'auto'}`} {...frameProps} />
    </div>}
  />
}

function toggleChoice<T>(values: readonly T[], value: T, checked: boolean): T[] {
  return checked ? [...new Set([...values, value])] : values.filter(item => item !== value)
}
