import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getChartImageSavePicker, selectChartImageDestination, selectChartVideoDestination, withChartVideoExtension,
} from '../lib/chartImageDestination'
import { createChartImageFilename, withChartImageAspect } from '../lib/chartImageFilename'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { CHART_IMAGE_MAX_SIDE, type ChartImageRasterOutput } from '../lib/chartImageRasterSize'
import { downloadChartVideo, getChartVideoFormat } from '../lib/chartVideoRecorder'
import {
  ENEMY_HISTOGRAM_COUNT_MODES, getEnemySpawnCoverageLabel,
  type EnemyHistogramCountMode, type EnemyHistogramCounts,
} from '../lib/enemyHistogramCounts'
import type { EnemyHistogramAggregationVersion } from '../lib/enemyHistogramSnapshot'
import { getEnemyRatingRanges } from '../lib/enemyStatRatings'
import {
  ENEMY_RATING_COMPARISON_LAYOUTS, ENEMY_RATING_COMPARISON_METRICS,
  type EnemyRatingComparison, type EnemyRatingComparisonLayout, type EnemyRatingComparisonSideValue,
} from '../lib/enemyRatingComparison'
import {
  createEnemyRatingVideoTimingDraft, ENEMY_RATING_VIDEO_PHASES, parseEnemyRatingVideoTiming,
  type EnemyRatingVideoPhase, type EnemyRatingVideoTiming,
} from '../lib/enemyRatingVideoTiming'
import { ChartImageFrame } from './ChartImageFrame'
import { CHART_VIDEO_ASPECT_PRESETS, ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { ChartVideoPreview } from './ChartVideoPreview'
import { EnemyRatingComparisonPlot, EnemyRatingComparisonSwatch } from './EnemyRatingComparisonPlot'
import { EnemyRatingVideoTimingEditor, type EnemyRatingVideoDurationError } from './EnemyRatingVideoTimingEditor'
import {
  ENEMY_RATING_VIDEO_WIDTH,
  prepareEnemyRatingComparisonVideo, renderEnemyRatingComparisonVideo,
} from './renderEnemyRatingComparisonVideo'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import './EnemyChartImage.css'

export interface EnemyRatingComparisonImageSnapshot {
  data: EnemyRatingComparison
  layout: EnemyRatingComparisonLayout
  selectedRanks?: readonly string[]
  sideValue?: EnemyRatingComparisonSideValue
  scopeLabel: string
  countMode: EnemyHistogramCountMode
  countLabel: string
  aggregationVersion?: EnemyHistogramAggregationVersion
  coverage?: EnemyHistogramCounts['summary'] | null
}

const IMAGE_TITLE = '防御力・術耐性の評価別分布'
const FIXED_OUTPUT_WIDTH = 1920
const RATING_ORDER = getEnemyRatingRanges('defense').map(({ rating }) => rating)
const PLOT_HEIGHT: Record<EnemyRatingComparisonLayout, number> = {
  GROUPED: 334, CUMULATIVE: 304, MIRRORED: 352,
}
const formatCount = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })

export function getEnemyRatingComparisonImageFilename({
  layout, scopeLabel, countLabel, aggregationVersion, selectedRanks, sideValue, outputWidth, videoDuration,
}: Omit<EnemyRatingComparisonImageSnapshot, 'data' | 'coverage'> & { outputWidth?: number; videoDuration?: number }): string {
  const rankLabel = RATING_ORDER.filter(rank => selectedRanks?.includes(rank)).join('-')
  return createChartImageFilename('敵', [
    aggregationVersion && `集計${aggregationVersion.id}`,
    IMAGE_TITLE,
    countLabel,
    rankLabel && `評価${rankLabel}強調`,
    layout === 'MIRRORED' && sideValue === 'rank' && '階級割合',
    outputWidth && `幅${outputWidth}px`,
    scopeLabel,
    ENEMY_RATING_COMPARISON_LAYOUTS.find((option) => option.key === layout)?.label,
    videoDuration !== undefined && `${Number(videoDuration.toPrecision(12))}秒`,
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
  const { data, layout, selectedRanks, sideValue } = snapshot
  return <ChartImageFrame className="enemy-chart-image" title={IMAGE_TITLE} conditions={getImageConditions(snapshot)}
    axisTitle={layout === 'MIRRORED' ? '評価別割合（%）' : 'ゲーム内評価'} naturalChartHeight={PLOT_HEIGHT[layout]}
    aspectRatio={aspectRatio} onLayout={onLayout}
    legend={layout === 'CUMULATIVE' ? <ul className="chart-image-frame-legend-list" aria-label="比較する系列">
      {ENEMY_RATING_COMPARISON_METRICS.map(({ key, label }) => <li className="chart-image-frame-legend-item" key={key}>
        <EnemyRatingComparisonSwatch metric={key} layout={layout} imageMode />
        <span>{label}</span>
      </li>)}
    </ul> : undefined}>
    {({ width, height }) => <EnemyRatingComparisonPlot data={data} layout={layout} selectedRanks={selectedRanks}
      sideValue={sideValue} width={width} height={height} imageMode />}
  </ChartImageFrame>
}

export function EnemyRatingComparisonSaveDialog({ onClose, media = 'image', ...snapshot }: EnemyRatingComparisonImageSnapshot & {
  onClose: () => void
  media?: 'image' | 'video'
}) {
  const video = media === 'video'
  const [aspect, setAspect] = useState<ChartImageAspectSettings>(() => video
    ? { preset: '16:7', width: '16', height: '7' } : { preset: 'auto', width: '16', height: '9' })
  const [showRankHighlight, setShowRankHighlight] = useState(true)
  const [fixOutputWidth, setFixOutputWidth] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const [canCancelVideo, setCanCancelVideo] = useState(false)
  const [timingDraft, setTimingDraft] = useState(createEnemyRatingVideoTimingDraft)
  const timing = useMemo(() => parseEnemyRatingVideoTiming(timingDraft), [timingDraft])
  const [timingInputError, setTimingInputError] = useState<EnemyRatingVideoDurationError | null>(null)
  const [activeVideoPhase, setActiveVideoPhase] = useState<EnemyRatingVideoPhase | null>(null)
  const savingRef = useRef(false)
  const videoAbort = useRef<AbortController | null>(null)
  useEffect(() => () => videoAbort.current?.abort(), [])
  const videoFormat = video ? getChartVideoFormat() : undefined
  const videoExtension = videoFormat?.extension ?? 'mp4'
  const hasSelectedRanks = snapshot.data.rows.some(({ rank }) => snapshot.selectedRanks?.includes(rank))
  const outputSnapshot = showRankHighlight ? snapshot : { ...snapshot, selectedRanks: undefined }
  const validAspect = aspect.preset === 'auto' || [aspect.width, aspect.height]
    .every((value) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100)
  const aspectRatio = aspect.preset === 'auto' || !validAspect ? undefined : Number(aspect.width) / Number(aspect.height)
  const canFixOutputWidth = validAspect
    && (aspectRatio === undefined || Math.round(FIXED_OUTPUT_WIDTH / aspectRatio) <= CHART_IMAGE_MAX_SIDE)
  // Use even video dimensions for the encoder. Auto layout already renders at twice its 960px base width.
  const videoHeight = video && aspectRatio !== undefined
    ? Math.max(2, Math.round(ENEMY_RATING_VIDEO_WIDTH / aspectRatio / 2) * 2) : undefined
  const aspectError = videoHeight !== undefined && videoHeight > CHART_IMAGE_MAX_SIDE
    ? 'この比率では動画の高さが保存可能な範囲を超えます。' : undefined
  const videoOutput = video && validAspect && !aspectError
    ? { width: ENEMY_RATING_VIDEO_WIDTH, aspectRatio: videoHeight === undefined ? undefined : ENEMY_RATING_VIDEO_WIDTH / videoHeight }
    : undefined
  const output = video ? videoOutput
    : fixOutputWidth && canFixOutputWidth ? { width: FIXED_OUTPUT_WIDTH, aspectRatio } : undefined
  const filename = getEnemyRatingComparisonImageFilename({
    ...outputSnapshot, outputWidth: output?.width,
    videoDuration: video ? timing.duration ?? undefined : undefined,
  })
  const picker = getChartImageSavePicker()

  function getDefaultFilename(ratio?: number) {
    const imageName = withChartImageAspect(filename, ratio)
    return video ? withChartVideoExtension(imageName.replace(/\.png$/i, ''), videoExtension) : imageName
  }

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

  async function saveVideo(selectedFilename: string) {
    if (savingRef.current || !videoFormat || !videoOutput || !timing.timing || timingInputError) return
    const controller = new AbortController()
    videoAbort.current = controller
    savingRef.current = true
    setSaving(true)
    setCanCancelVideo(true)
    setError(false)
    try {
      const destination = await selectChartVideoDestination(selectedFilename, picker, videoFormat.extension)
      if (destination.type === 'cancelled') return
      controller.signal.throwIfAborted()
      const blob = await renderEnemyRatingComparisonVideo(
        <EnemyRatingComparisonImage snapshot={outputSnapshot} aspectRatio={videoOutput.aspectRatio} />,
        videoFormat,
        timing.timing,
        videoOutput,
        controller.signal,
      )
      controller.signal.throwIfAborted()
      videoAbort.current = null
      setCanCancelVideo(false)
      if (destination.type === 'file') await destination.write(blob)
      else downloadChartVideo(blob, withChartVideoExtension(selectedFilename, videoFormat.extension))
      onClose()
    } catch (cause) {
      if (!controller.signal.aborted) {
        console.error('グラフ動画の保存に失敗しました。', cause)
        setError(true)
      }
    } finally {
      videoAbort.current = null
      savingRef.current = false
      if (!controller.signal.aborted) {
        setCanCancelVideo(false)
        setSaving(false)
      }
    }
  }

  function closeDialog() {
    if (savingRef.current && !videoAbort.current) return
    videoAbort.current?.abort()
    onClose()
  }

  const previewRatio = video ? videoOutput?.aspectRatio : aspectRatio
  const formatLabel = videoFormat?.extension === 'mp4' ? 'MP4' : videoFormat ? 'WebM' : undefined
  const preview = <EnemyRatingComparisonImagePreview key={video ? `${aspect.preset}:${aspect.width}:${aspect.height}` : previewRatio ?? 'auto'}
    snapshot={outputSnapshot} aspectRatio={previewRatio} output={output}
    video={video ? { timing: timing.timing, duration: timing.duration, formatLabel, saving, onActivePhase: setActiveVideoPhase }
      : undefined} />
  return <ChartImageSaveDialog initialFilename={getDefaultFilename(aspectRatio)} getDefaultFilename={getDefaultFilename}
    aspect={aspect} aspectPresets={video ? CHART_VIDEO_ASPECT_PRESETS : undefined} aspectError={aspectError}
    onAspectChange={next => {
      if (video && (next.preset !== aspect.preset || next.width !== aspect.width || next.height !== aspect.height)) setActiveVideoPhase(null)
      setAspect(next)
    }}
    canChooseLocation={Boolean(picker)} saving={saving} helpMode="popover"
    videoExtension={video ? videoExtension : undefined} cancelWhileSaving={canCancelVideo}
    saveDisabled={video && (!videoFormat || !videoOutput || !timing.timing || Boolean(timingInputError))}
    error={video && !videoFormat ? 'このブラウザーは動画の出力に対応していません。' : error}
    onClose={closeDialog} onSave={(name, ratio) => { void (video ? saveVideo(name) : saveImage(name, ratio)) }}
    options={<div className="enemy-histogram-display-controls">
      {!video && <label className="enemy-histogram-display-toggle">
        <input type="checkbox" checked={Boolean(output)} disabled={saving || !canFixOutputWidth}
          onChange={event => setFixOutputWidth(event.target.checked)} />
        出力幅を1,920 pxに固定
      </label>}
      <label className="enemy-histogram-display-toggle">
        <input type="checkbox" checked={hasSelectedRanks && showRankHighlight} disabled={saving || !hasSelectedRanks}
          onChange={event => setShowRankHighlight(event.target.checked)} />
        選択ランクを強調
      </label>
    </div>}
    preview={video ? <div className="enemy-rating-video-preview">
      {videoOutput && preview}
      <EnemyRatingVideoTimingEditor draft={timingDraft} onChange={setTimingDraft} parsed={timing}
        inputError={timingInputError} onInputError={setTimingInputError} activePhase={activeVideoPhase}
        sideValue={snapshot.sideValue} disabled={saving} />
    </div> : validAspect && preview} />
}

interface RatingVideoPreview {
  timing: EnemyRatingVideoTiming | null
  duration: number | null
  formatLabel?: string
  saving: boolean
  onActivePhase: (phase: EnemyRatingVideoPhase | null) => void
}

function EnemyRatingComparisonImagePreview({ snapshot, aspectRatio, output, video }: {
  snapshot: EnemyRatingComparisonImageSnapshot
  aspectRatio?: number
  output?: ChartImageRasterOutput
  video?: RatingVideoPreview
}) {
  const captureChart = useMemo(() => <EnemyRatingComparisonImage snapshot={snapshot}
    aspectRatio={aspectRatio} />, [
    snapshot.data, snapshot.layout, snapshot.selectedRanks, snapshot.sideValue, snapshot.scopeLabel,
    snapshot.countMode, snapshot.countLabel, snapshot.aggregationVersion, snapshot.coverage, aspectRatio,
  ])
  const activePhaseRef = useRef<EnemyRatingVideoPhase | null>(null)
  const onActivePhase = video?.onActivePhase
  const onProgress = useCallback((seconds: number, timing: EnemyRatingVideoTiming | null) => {
    const activePhase = (timing && ENEMY_RATING_VIDEO_PHASES.find(phase => {
      const { start, duration } = timing[phase]
      return seconds >= start && seconds < start + duration
    })) ?? null
    if (activePhase !== activePhaseRef.current) {
      activePhaseRef.current = activePhase
      onActivePhase?.(activePhase)
    }
  }, [onActivePhase])

  return <ChartVideoPreview captureChart={captureChart}
    renderChart={onLayout => <EnemyRatingComparisonImage snapshot={snapshot} aspectRatio={aspectRatio} onLayout={onLayout} />}
    initialSize={getChartImageLayout({ naturalChartHeight: PLOT_HEIGHT[snapshot.layout], aspectRatio })}
    output={output}
    video={video && {
      timing: video.timing, duration: video.duration, formatLabel: video.formatLabel, saving: video.saving,
      prepare: prepareEnemyRatingComparisonVideo, onProgress,
    }} />
}
