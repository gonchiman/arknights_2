import { useLayoutEffect, useRef, useState } from 'react'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { createChartImageFilename, withChartImageAspect } from '../lib/chartImageFilename'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { CHART_IMAGE_MAX_SIDE, getChartImageRasterSize, type ChartImageRasterOutput } from '../lib/chartImageRasterSize'
import {
  ENEMY_HISTOGRAM_COUNT_MODES, getEnemySpawnCoverageLabel,
  type EnemyHistogramCountMode, type EnemyHistogramCounts,
} from '../lib/enemyHistogramCounts'
import type { EnemyHistogramAggregationVersion } from '../lib/enemyHistogramSnapshot'
import {
  ENEMY_RATING_COMPARISON_LAYOUTS, ENEMY_RATING_COMPARISON_METRICS,
  type EnemyRatingComparison, type EnemyRatingComparisonLayout, type EnemyRatingComparisonSideValue,
} from '../lib/enemyRatingComparison'
import { ChartImageFrame } from './ChartImageFrame'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { EnemyRatingComparisonPlot, EnemyRatingComparisonSwatch } from './EnemyRatingComparisonPlot'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import './EnemyChartImage.css'

export interface EnemyRatingComparisonImageSnapshot {
  data: EnemyRatingComparison
  layout: EnemyRatingComparisonLayout
  selectedRank?: string
  sideValue?: EnemyRatingComparisonSideValue
  scopeLabel: string
  countMode: EnemyHistogramCountMode
  countLabel: string
  aggregationVersion?: EnemyHistogramAggregationVersion
  coverage?: EnemyHistogramCounts['summary'] | null
}

const IMAGE_TITLE = '防御力・術耐性の評価別分布'
const FIXED_OUTPUT_WIDTH = 1920
const PLOT_HEIGHT: Record<EnemyRatingComparisonLayout, number> = {
  GROUPED: 334, CUMULATIVE: 304, MIRRORED: 352,
}
const formatCount = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })

export function getEnemyRatingComparisonImageFilename({
  layout, scopeLabel, countLabel, aggregationVersion, selectedRank, sideValue, outputWidth,
}: Omit<EnemyRatingComparisonImageSnapshot, 'data' | 'coverage'> & { outputWidth?: number }): string {
  return createChartImageFilename('敵', [
    aggregationVersion && `集計${aggregationVersion.id}`,
    IMAGE_TITLE,
    countLabel,
    selectedRank && `評価${selectedRank}強調`,
    layout === 'MIRRORED' && sideValue === 'rank' && '階級割合',
    outputWidth && `幅${outputWidth}px`,
    scopeLabel,
    ENEMY_RATING_COMPARISON_LAYOUTS.find((option) => option.key === layout)?.label,
  ])
}

function getImageConditions(snapshot: EnemyRatingComparisonImageSnapshot): string {
  const { data, countMode, countLabel, scopeLabel, aggregationVersion, coverage } = snapshot
  const unit = ENEMY_HISTOGRAM_COUNT_MODES.find(({ key }) => key === countMode)!.unit
  const defense = data.totals.defense
  const resistance = data.totals.magicResistance
  const sameTotals = defense.valid === resistance.valid && defense.missing === resistance.missing
  const formatTotals = ({ valid, missing }: typeof defense) => `${formatCount.format(valid)}${unit}${
    missing > 0 ? `（値なし ${formatCount.format(missing)}${unit}）` : ''}`
  const totals = sameTotals ? formatTotals(defense)
    : ENEMY_RATING_COMPARISON_METRICS.map(({ key, label }) => `${label} ${formatTotals(data.totals[key])}`).join(' / ')
  const coverageLabel = !coverage || countMode === 'TYPES' ? null
    : countMode === 'SPAWNS' ? getEnemySpawnCoverageLabel(coverage)
    : `収録 ${formatCount.format(coverage.mapCount)}マップ`
  return [aggregationVersion?.label, scopeLabel, countLabel, totals, coverageLabel].filter(Boolean).join(' · ')
}

export function EnemyRatingComparisonImage({ snapshot, aspectRatio, onLayout }: {
  snapshot: EnemyRatingComparisonImageSnapshot
  aspectRatio?: number
  onLayout?: (size: { width: number; height: number }) => void
}) {
  const { data, layout, selectedRank, sideValue } = snapshot
  return <ChartImageFrame className="enemy-chart-image" title={IMAGE_TITLE} conditions={getImageConditions(snapshot)}
    axisTitle={layout === 'MIRRORED' ? '評価別割合（%）' : 'ゲーム内評価'} naturalChartHeight={PLOT_HEIGHT[layout]}
    aspectRatio={aspectRatio} onLayout={onLayout}
    legend={layout === 'CUMULATIVE' ? <ul className="chart-image-frame-legend-list" aria-label="比較する系列">
      {ENEMY_RATING_COMPARISON_METRICS.map(({ key, label }) => <li className="chart-image-frame-legend-item" key={key}>
        <EnemyRatingComparisonSwatch metric={key} layout={layout} imageMode />
        <span>{label}</span>
      </li>)}
    </ul> : undefined}>
    {({ width, height }) => <EnemyRatingComparisonPlot data={data} layout={layout} selectedRank={selectedRank}
      sideValue={sideValue} width={width} height={height} imageMode />}
  </ChartImageFrame>
}

export function EnemyRatingComparisonSaveDialog({ onClose, ...snapshot }: EnemyRatingComparisonImageSnapshot & {
  onClose: () => void
}) {
  const [aspect, setAspect] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
  const [showRankHighlight, setShowRankHighlight] = useState(true)
  const [fixOutputWidth, setFixOutputWidth] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const savingRef = useRef(false)
  const outputSnapshot = showRankHighlight ? snapshot : { ...snapshot, selectedRank: undefined }
  const validAspect = aspect.preset === 'auto' || [aspect.width, aspect.height]
    .every((value) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100)
  const aspectRatio = aspect.preset === 'auto' || !validAspect ? undefined : Number(aspect.width) / Number(aspect.height)
  const canFixOutputWidth = validAspect
    && (aspectRatio === undefined || Math.round(FIXED_OUTPUT_WIDTH / aspectRatio) <= CHART_IMAGE_MAX_SIDE)
  const output = fixOutputWidth && canFixOutputWidth ? { width: FIXED_OUTPUT_WIDTH, aspectRatio } : undefined
  const filename = getEnemyRatingComparisonImageFilename({ ...outputSnapshot, outputWidth: output?.width })
  const picker = getChartImageSavePicker()

  async function saveImage(selectedFilename: string, ratio?: number) {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError(false)
    try {
      const destination = await selectChartImageDestination(selectedFilename, picker)
      if (destination.type === 'cancelled') return
      const { width } = getChartImageLayout({ naturalChartHeight: PLOT_HEIGHT[snapshot.layout], aspectRatio: ratio })
      await saveComparisonChartImage({
        chart: <EnemyRatingComparisonImage snapshot={outputSnapshot} aspectRatio={ratio} />,
        filename: selectedFilename,
        width,
        output,
        writeBlob: destination.type === 'file' ? destination.write : undefined,
      })
      onClose()
    } catch {
      setError(true)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return <ChartImageSaveDialog initialFilename={withChartImageAspect(filename)}
    getDefaultFilename={(ratio) => withChartImageAspect(filename, ratio)} aspect={aspect} onAspectChange={setAspect}
    canChooseLocation={Boolean(picker)} saving={saving} error={error} helpMode="popover"
    onClose={() => { if (!savingRef.current) onClose() }} onSave={(name, ratio) => void saveImage(name, ratio)}
    options={<div className="enemy-histogram-display-controls">
      <label className="enemy-histogram-display-toggle">
        <input type="checkbox" checked={Boolean(output)} disabled={saving || !canFixOutputWidth}
          onChange={event => setFixOutputWidth(event.target.checked)} />
        出力幅を1,920 pxに固定
      </label>
      <label className="enemy-histogram-display-toggle">
        <input type="checkbox" checked={showRankHighlight} disabled={saving}
          onChange={event => setShowRankHighlight(event.target.checked)} />
        選択ランクを強調
      </label>
    </div>}
    preview={validAspect && <EnemyRatingComparisonImagePreview key={aspectRatio ?? 'auto'}
      snapshot={outputSnapshot} aspectRatio={aspectRatio} output={output} />} />
}

function EnemyRatingComparisonImagePreview({ snapshot, aspectRatio, output }: {
  snapshot: EnemyRatingComparisonImageSnapshot
  aspectRatio?: number
  output?: ChartImageRasterOutput
}) {
  const previewRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(600)
  const [size, setSize] = useState<{ width: number; height: number }>(() =>
    getChartImageLayout({ naturalChartHeight: PLOT_HEIGHT[snapshot.layout], aspectRatio }))
  useLayoutEffect(() => {
    const element = previewRef.current
    if (!element) return
    const measure = () => setAvailableWidth(Math.max(1, element.clientWidth))
    const observer = new ResizeObserver(measure)
    measure()
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const scale = Math.min(availableWidth / size.width, 380 / size.height, 1)
  const rasterSize = getChartImageRasterSize(size, output)
  return <div className="enemy-chart-image-preview">
    <div className="enemy-chart-image-preview-heading"><span>プレビュー</span><span>PNG</span></div>
    <div ref={previewRef} className="enemy-chart-image-preview-frame" style={{ height: Math.ceil(size.height * scale) }}>
      <div className="enemy-chart-image-preview-position" style={{ width: size.width, height: size.height,
        left: (availableWidth - size.width * scale) / 2, transform: `scale(${scale})` }}>
        <EnemyRatingComparisonImage snapshot={snapshot} aspectRatio={aspectRatio} onLayout={setSize} />
      </div>
    </div>
    <span className="enemy-chart-image-preview-size" aria-live="polite">
      {rasterSize.width.toLocaleString('ja-JP')} × {rasterSize.height.toLocaleString('ja-JP')} px
    </span>
  </div>
}
