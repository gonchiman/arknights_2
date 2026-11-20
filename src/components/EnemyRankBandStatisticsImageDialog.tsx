import { useRef, useState } from 'react'
import type { EnemyRankBandMetric, EnemyRankBandStatistics } from '../lib/enemyRankBandStatistics'
import { ENEMY_RANK_BAND_METRIC_LABELS } from '../lib/enemyRankBandStatisticsDisplay'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { createChartImageFilename, withChartImageAspect } from '../lib/chartImageFilename'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { parseTableImageAspect, type TableImageAspect } from '../lib/tableImageAspect'
import { ChartImageFrame, type ChartImageFrameProps } from './ChartImageFrame'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { ChartFrameImagePreview } from './DamageCalculatorThreeAttributeChartImageDialog'
import { EnemyRankBandStatisticsPlot, getEnemyRankBandStatisticsPlotHeight } from './EnemyRankBandStatisticsPlot'
import { saveComparisonChartImage } from './saveComparisonChartImage'

export interface EnemyRankBandStatisticsChartSnapshot {
  bands: readonly EnemyRankBandStatistics[]
  metric: EnemyRankBandMetric
  step: number
  conditions: readonly string[]
  filenameConditions: readonly string[]
}

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
  const [outputSnapshot] = useState<EnemyRankBandStatisticsChartSnapshot>(() => ({
    ...snapshot,
    bands: snapshot.bands.map(band => ({ ...band, defense: { ...band.defense }, resistance: { ...band.resistance } })),
    conditions: [...snapshot.conditions],
    filenameConditions: [...snapshot.filenameConditions],
  }))
  const [aspect, setAspect] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const saveInProgress = useRef(false)
  const parsedAspect = aspect.preset === 'auto' ? null : parseTableImageAspect(aspect.width, aspect.height)
  const invalidAspect = aspect.preset !== 'auto' && !parsedAspect
  const aspectRatio = parsedAspect ? parsedAspect.width / parsedAspect.height : undefined
  const picker = getChartImageSavePicker()
  const frameProps = getEnemyRankBandStatisticsChartFrameProps(outputSnapshot, aspectRatio, parsedAspect ?? undefined)
  const filename = createChartImageFilename(frameProps.title, [...new Set([
    ...outputSnapshot.filenameConditions, `順位帯${outputSnapshot.step}ポイント`,
  ])])

  async function saveImage(selectedFilename: string, chooseLocation: boolean) {
    if (invalidAspect || saveInProgress.current || !outputSnapshot.bands.length) return
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

  return <ChartImageSaveDialog initialFilename={filename}
    getDefaultFilename={ratio => withChartImageAspect(filename, ratio)}
    aspect={aspect} aspectPresets={IMAGE_ASPECT_PRESETS}
    aspectError={invalidAspect ? '幅と高さは1〜100の整数、縦横比は1:10〜10:1で指定してください。' : undefined}
    onAspectChange={next => { setAspect(next); setSaveError(false) }}
    canChooseLocation={Boolean(picker)} saving={saving} saveDisabled={!outputSnapshot.bands.length}
    error={saveError} helpMode="none" onClose={onClose}
    onSave={selectedFilename => { void saveImage(selectedFilename, true) }}
    additionalSaveAction={picker ? { label: 'ダウンロード', onSave: selectedFilename => { void saveImage(selectedFilename, false) } } : undefined}
    preview={!invalidAspect && <ChartFrameImagePreview key={`${filename}:${aspectRatio ?? 'auto'}`} {...frameProps} />}
  />
}
