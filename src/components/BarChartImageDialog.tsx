import { useMemo, useState } from 'react'
import { getBarChartFilename } from '../lib/barChartDocument'
import { BAR_CHART_PROVIDERS } from '../lib/barChartProviders'
import {
  createBarChartImageSnapshot, buildBarChartImageVariants, getBarChartArchiveFilename,
  type BarChartImageSnapshot, type BarChartImageVariant,
} from '../lib/barChartImage'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { getChartImageRasterSize } from '../lib/chartImageRasterSize'
import { getBarChartNaturalHeight } from '../lib/barChartLayout'
import { parseTableImageAspect } from '../lib/tableImageAspect'
import { BarChartPlot } from './BarChartPlot'
import type { ChartImageFrameProps } from './ChartImageFrame'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { ChartImageBatchOptions, ChartImageBatchPreviewChoices } from './ChartImageBatchOptions'
import { ChartFrameImagePreview } from './DamageCalculatorThreeAttributeChartImageDialog'
import { useChartImageBatchSave } from './useChartImageBatchSave'

export { createBarChartImageSnapshot } from '../lib/barChartImage'
export type { BarChartImageSnapshot } from '../lib/barChartImage'

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
  const [source] = useState(() => createBarChartImageSnapshot(snapshot.document, snapshot.settings, snapshot.variants))
  const provider = BAR_CHART_PROVIDERS.find(provider => provider.id === source.document.source.providerId)
  const choices = source.variants ?? []
  const choiceLabel = provider?.variantLabel ?? '条件'
  const manyChoices = choices.length > 6
  const [outputMode, setOutputMode] = useState<'current' | 'multiple'>('current')
  const [saveMethod, setSaveMethod] = useState<'file' | 'directory'>('file')
  const [selectedKeys, setSelectedKeys] = useState(() => choices.map(variant => variant.key))
  const [previewKey, setPreviewKey] = useState(() => source.variants?.find(variant => variant.document.id === source.document.id)?.key ?? 'current')
  const [aspect, setAspect] = useState<ChartImageAspectSettings>({ preset: '16:9', width: '16', height: '9' })
  const parsed = aspect.preset === 'auto' ? null : parseTableImageAspect(aspect.width, aspect.height)
  const aspectRatio = parsed ? parsed.width / parsed.height : undefined
  const variants = useMemo<readonly BarChartImageVariant[]>(() => outputMode === 'multiple'
    ? buildBarChartImageVariants(source, selectedKeys)
    : [{ key: 'current', label: '現在の条件', snapshot: source }], [source, outputMode, selectedKeys])
  const selectedPreview = variants.find(variant => variant.key === previewKey) ?? variants[0]
  const frame = selectedPreview && getBarChartImageFrame(selectedPreview.snapshot, aspectRatio)
  const output = { width: 1920, aspectRatio }
  let aspectError = aspect.preset !== 'auto' && !parsed ? '縦横比は1:10〜10:1、幅と高さは1〜100の整数で指定してください。' : undefined
  try {
    for (const variant of variants) getChartImageRasterSize(getChartImageLayout(getBarChartImageFrame(variant.snapshot, aspectRatio)), output)
  } catch { aspectError = 'この縦横比では画像の大きさが上限を超えます。' }
  const folderExport = outputMode === 'multiple' && saveMethod === 'directory'
  const archive = variants.length > 1 && !folderExport
  const getDefaultFilename = (ratio?: number) => archive ? getBarChartArchiveFilename(source, variants, ratio)
    : getBarChartFilename((variants[0]?.snapshot ?? source).document, source.settings, ratio)
  const batch = useChartImageBatchSave({
    outputs: variants.map(variant => ({ key: variant.key,
      filename: getBarChartFilename(variant.snapshot.document, variant.snapshot.settings, aspectRatio),
      frame: getBarChartImageFrame(variant.snapshot, aspectRatio), output,
    })),
    archive, folderExport, invalid: Boolean(aspectError) || !variants.length, onClose,
  })
  const folderUnavailable = folderExport && !batch.directoryPicker
  function selectKeys(keys: string[]) {
    batch.reset()
    setSelectedKeys(keys)
  }
  return <ChartImageSaveDialog initialFilename={getDefaultFilename()}
    getDefaultFilename={getDefaultFilename} archive={archive} showFilename={!folderExport}
    aspect={aspect} onAspectChange={value => { batch.reset(); setAspect(value) }} aspectError={aspectError}
    canChooseLocation={folderExport ? Boolean(batch.directoryPicker) : Boolean(batch.picker)}
    saving={batch.saving} saveDisabled={!variants.length || folderUnavailable} error={batch.error} helpMode="none" onClose={onClose}
    progress={batch.progress}
    saveLabel={folderExport ? batch.folderProgress && batch.folderProgress.completed > 0
      ? `残り${batch.folderProgress.total - batch.folderProgress.completed}枚を保存` : `フォルダに${variants.length}枚保存`
      : archive ? `${variants.length}枚をZIP保存` : undefined}
    onSave={name => { void batch.save(name, true) }}
    additionalSaveAction={folderExport ? batch.folderProgress ? {
      label: 'フォルダを選び直す', onSave: name => { void batch.save(name, true, true) },
    } : undefined : batch.picker ? {
      label: archive ? 'ZIPをダウンロード' : 'ダウンロード', onSave: name => { void batch.save(name, false) },
    } : undefined}
    options={choices.length > 1 && <ChartImageBatchOptions mode={outputMode} method={saveMethod}
      onModeChange={mode => { batch.reset(); setOutputMode(mode) }}
      onMethodChange={method => { batch.reset(); setSaveMethod(method) }}
      directoryAvailable={Boolean(batch.directoryPicker)} saving={batch.saving} count={variants.length}>
      <fieldset disabled={batch.saving}><legend>{choiceLabel}</legend>
        {manyChoices && <div className="chart-image-batch-choice-row bar-chart-image-select-all">
          <button type="button" className="button secondary" disabled={selectedKeys.length === choices.length}
            onClick={() => selectKeys(choices.map(variant => variant.key))}>全選択</button>
          <button type="button" className="button secondary" disabled={!selectedKeys.length}
            onClick={() => selectKeys([])}>すべて解除</button>
        </div>}
        <div className="chart-image-batch-choice-row">
          {choices.map(variant => <label key={variant.key}>
            <input type="checkbox" checked={selectedKeys.includes(variant.key)} onChange={event => {
              selectKeys(event.target.checked
                ? [...selectedKeys, variant.key]
                : selectedKeys.filter(key => key !== variant.key))
            }} />{variant.label}</label>)}
        </div>
      </fieldset>
      {!variants.length && <p className="chart-image-save-error" role="alert">{choiceLabel}を1つ以上選択してください。</p>}
    </ChartImageBatchOptions>}
    preview={frame && !aspectError && <div className="chart-image-batch-previews">
      {outputMode === 'multiple' && <ChartImageBatchPreviewChoices variants={variants} selectedKey={selectedPreview.key}
        onSelect={setPreviewKey} saving={batch.saving} presentation={manyChoices ? 'select' : 'buttons'} />}
      <ChartFrameImagePreview key={`${selectedPreview.key}:${aspectRatio ?? 'auto'}`} {...frame} output={output} />
    </div>} />
}
