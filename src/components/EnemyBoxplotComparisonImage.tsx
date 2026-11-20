import { useRef, useState } from 'react'
import {
  createEnemyBoxplotComparisonImageSnapshot, ENEMY_BOXPLOT_IMAGE_TITLE,
  getEnemyBoxplotComparisonImageConditions, getEnemyBoxplotComparisonImageFilename,
  type EnemyBoxplotComparisonImageSnapshot,
} from '../lib/enemyBoxplotImage'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { withChartImageAspect } from '../lib/chartImageFilename'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { ENEMY_HISTOGRAM_COUNT_MODES } from '../lib/enemyHistogramCounts'
import { parseTableImageAspect, type TableImageAspect } from '../lib/tableImageAspect'
import { ChartImageFrame, type ChartImageFrameProps } from './ChartImageFrame'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { ChartFrameImagePreview } from './DamageCalculatorThreeAttributeChartImageDialog'
import { EnemyBoxplotComparisonLegend, EnemyBoxplotComparisonPlot, getEnemyBoxplotComparisonPlotHeight } from './EnemyBoxplotComparisonPlot'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import './EnemyChartImage.css'

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
      scale={snapshot.scale} range={snapshot.range} width={width} height={height} unit={unit} imageMode />,
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
  const [aspect, setAspect] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const saveInProgress = useRef(false)
  const parsedAspect = aspect.preset === 'auto' ? null : parseTableImageAspect(aspect.width, aspect.height)
  const invalidAspect = aspect.preset !== 'auto' && !parsedAspect
  const aspectRatio = parsedAspect ? parsedAspect.width / parsedAspect.height : undefined
  const picker = getChartImageSavePicker()
  const filename = getEnemyBoxplotComparisonImageFilename(outputSnapshot)
  const frameProps = getEnemyBoxplotComparisonImageFrameProps(outputSnapshot, aspectRatio, parsedAspect ?? undefined)

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
    preview={!invalidAspect && <ChartFrameImagePreview key={`${filename}:${aspectRatio ?? 'auto'}`} {...frameProps} />}
  />
}
