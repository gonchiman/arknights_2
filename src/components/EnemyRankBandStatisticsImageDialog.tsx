import { useMemo, useState } from 'react'
import { ENEMY_RANK_BAND_METRIC_LABELS } from '../lib/enemyRankBandStatisticsDisplay'
import {
  createEnemyRankBandStatisticsChartSnapshot, buildEnemyRankBandImageVariants,
  ENEMY_RANK_BAND_IMAGE_METRIC_OPTIONS, ENEMY_RANK_BAND_IMAGE_STEP_OPTIONS,
  getEnemyRankBandVariantFilename, getEnemyRankBandArchiveFilename,
  type EnemyRankBandStatisticsChartSnapshot, type EnemyRankBandImageSelection,
} from '../lib/enemyRankBandStatisticsImage'
import { createChartImageFilename, withChartImageAspect } from '../lib/chartImageFilename'
import { parseTableImageAspect, type TableImageAspect } from '../lib/tableImageAspect'
import type { ChartImageFrameProps } from './ChartImageFrame'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { ChartImageBatchOptions, ChartImageBatchPreviewChoices } from './ChartImageBatchOptions'
import { ChartFrameImagePreview } from './DamageCalculatorThreeAttributeChartImageDialog'
import { EnemyRankBandStatisticsPlot, getEnemyRankBandStatisticsPlotHeight } from './EnemyRankBandStatisticsPlot'
import { useChartImageBatchSave } from './useChartImageBatchSave'

export type { EnemyRankBandStatisticsChartSnapshot } from '../lib/enemyRankBandStatisticsImage'

const IMAGE_ASPECT_PRESETS = ['16:9', '4:3', '1:1', '2:1', '9:16'] as const

export function getEnemyRankBandStatisticsChartFrameProps(snapshot: EnemyRankBandStatisticsChartSnapshot,
  aspectRatio?: number, exactAspect?: TableImageAspect): ChartImageFrameProps {
  return {
    title: `防御力・術耐性の順位帯別${ENEMY_RANK_BAND_METRIC_LABELS[snapshot.metric]}`,
    conditions: [...snapshot.conditions, `順位帯 ${snapshot.step}ポイント`].join('・'),
    naturalChartHeight: getEnemyRankBandStatisticsPlotHeight(snapshot.bands.length),
    aspectRatio,
    exactAspect,
    children: ({ width, height }) => <EnemyRankBandStatisticsPlot bands={snapshot.bands} metric={snapshot.metric}
      width={width} height={height} imageMode />,
  }
}

export function EnemyRankBandStatisticsImageDialog({ snapshot, onClose }: {
  snapshot: EnemyRankBandStatisticsChartSnapshot
  onClose: () => void
}) {
  const [outputSnapshot] = useState(() => createEnemyRankBandStatisticsChartSnapshot(snapshot))
  const [outputMode, setOutputMode] = useState<'current' | 'multiple'>('current')
  const [saveMethod, setSaveMethod] = useState<'file' | 'directory'>('file')
  const availableSteps = ENEMY_RANK_BAND_IMAGE_STEP_OPTIONS.filter(({ key }) => key === outputSnapshot.step
    || outputSnapshot.stepBands?.some(entry => entry.step === key))
  const [selection, setSelection] = useState<EnemyRankBandImageSelection>(() => ({
    metrics: ENEMY_RANK_BAND_IMAGE_METRIC_OPTIONS.map(({ key }) => key),
    steps: availableSteps.map(({ key }) => key),
  }))
  const [previewKey, setPreviewKey] = useState('current')
  const [aspect, setAspect] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
  const parsedAspect = aspect.preset === 'auto' ? null : parseTableImageAspect(aspect.width, aspect.height)
  const invalidAspect = aspect.preset !== 'auto' && !parsedAspect
  const aspectRatio = parsedAspect ? parsedAspect.width / parsedAspect.height : undefined
  const variants = useMemo(() => outputMode === 'multiple'
    ? buildEnemyRankBandImageVariants(outputSnapshot, selection)
    : [{ key: 'current', label: '現在の条件', snapshot: outputSnapshot }], [outputMode, outputSnapshot, selection])
  const folderExport = outputMode === 'multiple' && saveMethod === 'directory'
  const archive = variants.length > 1 && !folderExport
  const selectedPreview = variants.find(({ key }) => key === previewKey) ?? variants[0]
  const frameProps = selectedPreview && getEnemyRankBandStatisticsChartFrameProps(selectedPreview.snapshot,
    aspectRatio, parsedAspect ?? undefined)
  const currentFilename = createChartImageFilename(`防御力・術耐性の順位帯別${ENEMY_RANK_BAND_METRIC_LABELS[outputSnapshot.metric]}`, [...new Set([
    ...outputSnapshot.filenameConditions, `順位帯${outputSnapshot.step}ポイント`,
  ])])
  const getDefaultFilename = (ratio?: number) => archive
    ? getEnemyRankBandArchiveFilename(outputSnapshot, variants, ratio)
    : outputMode === 'multiple' && variants[0] ? getEnemyRankBandVariantFilename(variants[0].snapshot, ratio)
    : withChartImageAspect(currentFilename, ratio)
  const batch = useChartImageBatchSave({
    outputs: variants.map(variant => ({ key: variant.key,
      filename: getEnemyRankBandVariantFilename(variant.snapshot, aspectRatio),
      frame: getEnemyRankBandStatisticsChartFrameProps(variant.snapshot, aspectRatio, parsedAspect ?? undefined),
    })),
    archive, folderExport, invalid: invalidAspect || !outputSnapshot.bands.length, onClose,
  })
  const folderUnavailable = folderExport && !batch.directoryPicker
  function changeSelection(next: EnemyRankBandImageSelection) {
    batch.reset()
    setSelection(next)
  }

  return <ChartImageSaveDialog initialFilename={getDefaultFilename()}
    getDefaultFilename={getDefaultFilename}
    archive={archive} showFilename={!folderExport}
    saveLabel={folderExport ? batch.folderProgress && batch.folderProgress.completed > 0
      ? `残り${batch.folderProgress.total - batch.folderProgress.completed}枚を保存` : `フォルダに${variants.length}枚保存`
      : archive ? `${variants.length}枚をZIP保存` : undefined}
    progress={batch.progress}
    aspect={aspect} aspectPresets={IMAGE_ASPECT_PRESETS}
    aspectError={invalidAspect ? '幅と高さは1〜100の整数、縦横比は1:10〜10:1で指定してください。' : undefined}
    onAspectChange={next => { batch.reset(); setAspect(next) }}
    canChooseLocation={folderExport ? Boolean(batch.directoryPicker) : Boolean(batch.picker)}
    saving={batch.saving} saveDisabled={!outputSnapshot.bands.length || variants.length === 0 || folderUnavailable}
    error={batch.error} helpMode="none" onClose={onClose}
    onSave={selectedFilename => { void batch.save(selectedFilename, true) }}
    additionalSaveAction={folderExport ? batch.folderProgress ? {
      label: 'フォルダを選び直す', onSave: selectedFilename => { void batch.save(selectedFilename, true, true) },
    } : undefined : batch.picker ? {
      label: archive ? 'ZIPをダウンロード' : 'ダウンロード',
      onSave: selectedFilename => { void batch.save(selectedFilename, false) },
    } : undefined}
    options={<ChartImageBatchOptions mode={outputMode} method={saveMethod}
      onModeChange={mode => { batch.reset(); setOutputMode(mode) }}
      onMethodChange={method => { batch.reset(); setSaveMethod(method) }}
      directoryAvailable={Boolean(batch.directoryPicker)} saving={batch.saving} count={variants.length}>
      <fieldset disabled={batch.saving}><legend>統計量</legend><div className="chart-image-batch-choice-row">
        {ENEMY_RANK_BAND_IMAGE_METRIC_OPTIONS.map(({ key, label }) => <label key={key}>
          <input type="checkbox" checked={selection.metrics.includes(key)} onChange={event => changeSelection({
            ...selection, metrics: toggleChoice(selection.metrics, key, event.target.checked),
          })} />{label}</label>)}
      </div></fieldset>
      <fieldset disabled={batch.saving}><legend>順位帯幅</legend><div className="chart-image-batch-choice-row">
        {availableSteps.map(({ key, label }) => <label key={key}>
          <input type="checkbox" checked={selection.steps.includes(key)} onChange={event => changeSelection({
            ...selection, steps: toggleChoice(selection.steps, key, event.target.checked),
          })} />{label}</label>)}
      </div></fieldset>
      {variants.length === 0 && <p className="chart-image-save-error" role="alert">統計量・順位帯幅をそれぞれ1つ以上選択してください。</p>}
    </ChartImageBatchOptions>}
    preview={frameProps && !invalidAspect && <div className="chart-image-batch-previews">
      {outputMode === 'multiple' && <ChartImageBatchPreviewChoices variants={variants} selectedKey={selectedPreview.key}
        onSelect={setPreviewKey} saving={batch.saving} />}
      <ChartFrameImagePreview key={`${selectedPreview.key}:${aspectRatio ?? 'auto'}`} {...frameProps} />
    </div>}
  />
}

function toggleChoice<T>(values: readonly T[], value: T, checked: boolean): T[] {
  return checked ? [...new Set([...values, value])] : values.filter(item => item !== value)
}
