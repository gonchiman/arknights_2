import { useRef, useState } from 'react'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { SKILL_DPS_ANALYSIS_X_LABELS } from '../lib/skillDpsAnalysis'
import { buildSkillDpsTargetGroups } from '../lib/skillDpsTargetGroups'
import {
  getSkillDpsChartImageConditions, getSkillDpsChartImageFilename, getSkillDpsChartImageTitle,
  type SkillDpsChartImageSnapshot,
} from '../lib/skillDpsChartImage'
import { parseTableImageAspect } from '../lib/tableImageAspect'
import { ChartImageFrame, type ChartImageFrameProps } from './ChartImageFrame'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { ChartFrameImagePreview } from './DamageCalculatorThreeAttributeChartImageDialog'
import { SkillDpsAnalysisChart } from './SkillDpsAnalysisChart'
import { SkillDpsTargetBoxplot, SkillDpsTargetBoxplotLegend, SKILL_DPS_TARGET_BOXPLOT_HEIGHT } from './SkillDpsTargetBoxplot'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import './SkillDpsAnalysisImageDialog.css'

const X_LABELS = SKILL_DPS_ANALYSIS_X_LABELS
const METRIC_LABELS = { direct: '直接DPS', combined: '合計DPS' }
const ESTIMATE = new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 4 })
const SUMMARY_HEIGHT = 34
const formatEstimate = (value: number | null) => value !== null && Number.isFinite(value) ? ESTIMATE.format(value) : '—'

/** The preview and PNG share one applied result, including its regression and conditions. */
export function getSkillDpsChartImageFrame(snapshot: SkillDpsChartImageSnapshot): ChartImageFrameProps {
  const xLabel = X_LABELS[snapshot.axis]
  const yLabel = METRIC_LABELS[snapshot.metric]
  const hasLine = snapshot.showFit && snapshot.fit !== null
  if (snapshot.axis === 'maxTargets') {
    const groups = buildSkillDpsTargetGroups(snapshot.points.map(({ id, x, y }) => ({ id, targetCount: x, y })))
    return {
      title: getSkillDpsChartImageTitle(snapshot),
      conditions: getSkillDpsChartImageConditions(snapshot),
      axisTitle: xLabel,
      naturalChartHeight: SKILL_DPS_TARGET_BOXPLOT_HEIGHT,
      legend: <SkillDpsTargetBoxplotLegend imageMode />,
      children: size => <SkillDpsTargetBoxplot groups={groups} yLabel={yLabel} imageSize={size} />,
    }
  }
  const numericPoints = snapshot.points.flatMap(({ id, x, y }) => typeof x === 'number' ? [{ id, x, y }] : [])
  return {
    title: getSkillDpsChartImageTitle(snapshot),
    conditions: getSkillDpsChartImageConditions(snapshot),
    axisTitle: xLabel,
    naturalChartHeight: 310 + SUMMARY_HEIGHT,
    legend: <ul className="chart-image-frame-legend-list" aria-label="比較する系列">
      <li className="chart-image-frame-legend-item">
        <svg className="chart-image-frame-legend-swatch" width="18" height="12" aria-hidden="true">
          <circle cx="9" cy="6" r="4" fill="var(--link)" opacity="0.7" />
        </svg><span>スキル</span>
      </li>
      {hasLine && <li className="chart-image-frame-legend-item">
        <svg className="chart-image-frame-legend-swatch" width="18" height="12" aria-hidden="true">
          <line x1="0" x2="18" y1="6" y2="6" stroke="var(--text-soft)" strokeWidth="2" />
        </svg><span>単回帰</span>
      </li>}
    </ul>,
    children: size => <div className="skill-dps-image-content" style={size}>
      <SkillDpsAnalysisChart points={numericPoints} xLabel={xLabel} yLabel={yLabel}
        fit={snapshot.fit} showFit={snapshot.showFit} imageSize={{ width: size.width, height: size.height - SUMMARY_HEIGHT }} />
      <div className="skill-dps-image-statistics">
        <span>Pearson r = {formatEstimate(snapshot.correlation)}</span>
        <span>R² = {formatEstimate(snapshot.rSquared)}</span>
        {snapshot.fit && <span>{yLabel} = {formatEstimate(snapshot.fit.slope)} × {xLabel} {snapshot.fit.intercept < 0 ? '−' : '+'} {formatEstimate(Math.abs(snapshot.fit.intercept))}</span>}
      </div>
    </div>,
  }
}

export function SkillDpsAnalysisImageDialog({ snapshot, onClose }: {
  snapshot: SkillDpsChartImageSnapshot
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
  const filename = getSkillDpsChartImageFilename(snapshot)
  const frame: ChartImageFrameProps = {
    ...getSkillDpsChartImageFrame(snapshot), aspectRatio, exactAspect: parsedAspect ?? undefined,
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
    getDefaultFilename={ratio => getSkillDpsChartImageFilename(snapshot, ratio)}
    aspect={aspect}
    aspectError={invalidAspect ? '幅と高さは1〜100の整数、縦横比は1:10〜10:1で指定してください。' : undefined}
    onAspectChange={next => { setAspect(next); setSaveError(false) }}
    canChooseLocation={Boolean(picker)}
    saving={saving}
    error={saveError}
    helpMode="none"
    onClose={onClose}
    onSave={name => { void saveImage(name, true) }}
    additionalSaveAction={picker ? { label: 'ダウンロード', onSave: name => { void saveImage(name, false) } } : undefined}
    preview={!invalidAspect && <ChartFrameImagePreview key={`${filename}:${aspectRatio ?? 'auto'}`} {...frame} />}
  />
}
