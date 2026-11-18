import { useRef, useState } from 'react'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { getChartImageLayout } from '../lib/chartImageLayout'
import {
  ENEMY_FORMULA_CHART_IMAGE_TITLE,
  getEnemyFormulaChartImageConditions,
  getEnemyFormulaChartImageFilename,
  type EnemyFormulaChartImageSnapshot,
} from '../lib/enemyFormulaChartImage'
import { parseTableImageAspect } from '../lib/tableImageAspect'
import { ChartImageFrame, type ChartImageFrameProps } from './ChartImageFrame'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { ChartFrameImagePreview } from './DamageCalculatorThreeAttributeChartImageDialog'
import { EnemyDefenseResistanceFormulaChart } from './EnemyDefenseResistanceFormulaChart'
import { saveComparisonChartImage } from './saveComparisonChartImage'

export function EnemyDefenseResistanceFormulaImageDialog({ snapshot, onClose }: {
  snapshot: EnemyFormulaChartImageSnapshot
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
  const filename = getEnemyFormulaChartImageFilename(snapshot)
  const legendItems = [
    { label: '累積割合による対応', color: 'var(--text-muted)' },
    { label: snapshot.methodLabel, color: 'var(--link)' },
  ]
  const frame: ChartImageFrameProps = {
    title: ENEMY_FORMULA_CHART_IMAGE_TITLE,
    legend: <ul className="chart-image-frame-legend-list" aria-label="比較する系列">
      {legendItems.map(({ label, color }, index) => <li key={index} className="chart-image-frame-legend-item">
        <svg className="chart-image-frame-legend-swatch" width="18" height="12" aria-hidden="true">
          <line x1={0} x2={18} y1={6} y2={6} stroke={color} strokeWidth={index === 0 ? 1.8 : 2.5} />
        </svg>
        <span>{label}</span>
      </li>)}
    </ul>,
    conditions: getEnemyFormulaChartImageConditions(snapshot),
    axisTitle: '術耐性 X',
    naturalChartHeight: 334,
    aspectRatio,
    exactAspect: parsedAspect ?? undefined,
    children: size => <EnemyDefenseResistanceFormulaChart points={snapshot.points} model={snapshot.model}
      probe={snapshot.probe} imageSize={size} />,
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
        chart: <ChartImageFrame {...frame} />,
        filename: selectedFilename,
        width: getChartImageLayout(frame).width,
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
    getDefaultFilename={ratio => getEnemyFormulaChartImageFilename(snapshot, ratio)}
    aspect={aspect}
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
    preview={!invalidAspect && <ChartFrameImagePreview key={`${filename}:${aspectRatio ?? 'auto'}`} {...frame} />}
  />
}
