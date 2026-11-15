import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  getChartImageSavePicker, selectChartImageDestination, selectChartVideoDestination, withChartVideoExtension,
} from '../lib/chartImageDestination'
import { createChartImageFilename, withChartImageAspect } from '../lib/chartImageFilename'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { CHART_IMAGE_MAX_SIDE, getChartImageRasterSize, type ChartImageRasterOutput } from '../lib/chartImageRasterSize'
import { getChartVideoFormat } from '../lib/chartVideoRecorder'
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
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { EnemyRatingComparisonPlot, EnemyRatingComparisonSwatch } from './EnemyRatingComparisonPlot'
import { EnemyRatingVideoTimingEditor, type EnemyRatingVideoDurationError } from './EnemyRatingVideoTimingEditor'
import {
  ENEMY_RATING_VIDEO_ASPECT, ENEMY_RATING_VIDEO_WIDTH,
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
const VIDEO_OUTPUT = { width: ENEMY_RATING_VIDEO_WIDTH, aspectRatio: ENEMY_RATING_VIDEO_ASPECT }
const RATING_ORDER = getEnemyRatingRanges('defense').map(({ rating }) => rating)
const PLOT_HEIGHT: Record<EnemyRatingComparisonLayout, number> = {
  GROUPED: 334, CUMULATIVE: 304, MIRRORED: 352,
}
const formatCount = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })

export function getEnemyRatingComparisonImageFilename({
  layout, scopeLabel, countLabel, aggregationVersion, selectedRanks, sideValue, outputWidth,
}: Omit<EnemyRatingComparisonImageSnapshot, 'data' | 'coverage'> & { outputWidth?: number }): string {
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
  const [aspect, setAspect] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
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
  const video = media === 'video'
  const videoFormat = video ? getChartVideoFormat() : undefined
  const videoExtension = videoFormat?.extension ?? 'mp4'
  const hasSelectedRanks = snapshot.data.rows.some(({ rank }) => snapshot.selectedRanks?.includes(rank))
  const outputSnapshot = showRankHighlight ? snapshot : { ...snapshot, selectedRanks: undefined }
  const validAspect = aspect.preset === 'auto' || [aspect.width, aspect.height]
    .every((value) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100)
  const aspectRatio = aspect.preset === 'auto' || !validAspect ? undefined : Number(aspect.width) / Number(aspect.height)
  const canFixOutputWidth = validAspect
    && (aspectRatio === undefined || Math.round(FIXED_OUTPUT_WIDTH / aspectRatio) <= CHART_IMAGE_MAX_SIDE)
  const output = video ? VIDEO_OUTPUT
    : fixOutputWidth && canFixOutputWidth ? { width: FIXED_OUTPUT_WIDTH, aspectRatio } : undefined
  const filename = getEnemyRatingComparisonImageFilename({ ...outputSnapshot, outputWidth: output?.width })
  const picker = getChartImageSavePicker()

  function getDefaultFilename(ratio?: number) {
    const imageName = withChartImageAspect(filename, video ? ENEMY_RATING_VIDEO_ASPECT : ratio)
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
    if (savingRef.current || !videoFormat || !timing.timing || timingInputError) return
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
        <EnemyRatingComparisonImage snapshot={outputSnapshot} aspectRatio={ENEMY_RATING_VIDEO_ASPECT} />,
        videoFormat,
        timing.timing,
        controller.signal,
      )
      controller.signal.throwIfAborted()
      videoAbort.current = null
      setCanCancelVideo(false)
      if (destination.type === 'file') await destination.write(blob)
      else downloadVideo(blob, withChartVideoExtension(selectedFilename, videoFormat.extension))
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

  const previewRatio = video ? ENEMY_RATING_VIDEO_ASPECT : aspectRatio
  const formatLabel = videoFormat?.extension === 'mp4' ? 'MP4' : videoFormat ? 'WebM' : undefined
  const preview = <EnemyRatingComparisonImagePreview key={previewRatio ?? 'auto'}
    snapshot={outputSnapshot} aspectRatio={previewRatio} output={output}
    video={video ? { timing: timing.timing, duration: timing.duration, formatLabel, saving, onActivePhase: setActiveVideoPhase }
      : undefined} />
  return <ChartImageSaveDialog initialFilename={getDefaultFilename()} getDefaultFilename={getDefaultFilename}
    aspect={video ? undefined : aspect} onAspectChange={video ? undefined : setAspect}
    canChooseLocation={Boolean(picker)} saving={saving} helpMode="popover"
    videoExtension={video ? videoExtension : undefined} cancelWhileSaving={canCancelVideo}
    saveDisabled={video && (!videoFormat || !timing.timing || Boolean(timingInputError))}
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
      {preview}
      <EnemyRatingVideoTimingEditor draft={timingDraft} onChange={setTimingDraft} parsed={timing}
        inputError={timingInputError} onInputError={setTimingInputError} activePhase={activeVideoPhase}
        sideValue={snapshot.sideValue} disabled={saving} />
    </div> : validAspect && preview} />
}

function downloadVideo(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.hidden = true
  document.body.append(link)
  try {
    link.click()
  } finally {
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}

interface RatingVideoPreview {
  timing: EnemyRatingVideoTiming | null
  duration: number | null
  formatLabel?: string
  saving: boolean
  onActivePhase: (phase: EnemyRatingVideoPhase | null) => void
}

interface VideoPreviewRun {
  timing: EnemyRatingVideoTiming | null
  duration: number | null
  seconds: number
  pausedBeforeInvalid?: number
  frame: number
  playWhenReady: boolean
  scene?: VideoPreviewScene
}

interface VideoPreviewScene {
  animation: Awaited<ReturnType<typeof prepareEnemyRatingComparisonVideo>>
  context: CanvasRenderingContext2D
}

interface VideoPreviewCapture {
  preparation?: AbortController
  scene?: VideoPreviewScene
}

function formatVideoClock(seconds: number, duration: number | null) {
  return duration === null ? '— / — 秒' : `${seconds.toFixed(2)} / ${duration.toFixed(2)} 秒`
}

function EnemyRatingComparisonImagePreview({ snapshot, aspectRatio, output, video }: {
  snapshot: EnemyRatingComparisonImageSnapshot
  aspectRatio?: number
  output?: ChartImageRasterOutput
  video?: RatingVideoPreview
}) {
  const isVideo = Boolean(video)
  const duration = video?.duration ?? null
  const timing = video?.timing ?? null
  const saving = video?.saving ?? false
  const previewRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const seekRef = useRef<HTMLInputElement>(null)
  const clockRef = useRef<HTMLOutputElement>(null)
  const activePhaseRef = useRef<EnemyRatingVideoPhase | null>(null)
  const previewCapture = useRef<VideoPreviewCapture>({})
  const playbackRun = useRef<VideoPreviewRun>({
    timing, duration, seconds: duration ?? 0, frame: 0, playWhenReady: false,
  })
  const [playback, setPlayback] = useState<'ready' | 'preparing' | 'playing' | 'paused' | 'start' | 'error'>('ready')
  const [availableWidth, setAvailableWidth] = useState(600)
  const [size, setSize] = useState<{ width: number; height: number }>(() =>
    getChartImageLayout({ naturalChartHeight: PLOT_HEIGHT[snapshot.layout], aspectRatio }))
  const captureChart = useMemo(() => <EnemyRatingComparisonImage snapshot={snapshot}
    aspectRatio={ENEMY_RATING_VIDEO_ASPECT} />, [
    snapshot.data, snapshot.layout, snapshot.selectedRanks, snapshot.sideValue, snapshot.scopeLabel,
    snapshot.countMode, snapshot.countLabel, snapshot.aggregationVersion, snapshot.coverage,
  ])
  useLayoutEffect(() => {
    const element = previewRef.current
    if (!element) return
    const measure = () => setAvailableWidth(Math.max(1, element.clientWidth))
    const observer = new ResizeObserver(measure)
    measure()
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useLayoutEffect(() => {
    if (!isVideo) return
    const capture: VideoPreviewCapture = {}
    previewCapture.current = capture
    return () => capture.preparation?.abort()
  }, [isVideo, captureChart])

  useLayoutEffect(() => {
    if (!isVideo) return
    const capture = previewCapture.current
    if (saving && capture.preparation) {
      capture.preparation.abort()
      capture.preparation = undefined
    }
    const previous = playbackRun.current
    const previousPosition = previous.duration === null ? previous.pausedBeforeInvalid
      : previous.seconds < previous.duration ? previous.seconds : undefined
    const pausedPosition = saving ? undefined : previousPosition
    const seconds = duration === null ? 0 : Math.min(pausedPosition ?? duration, duration)
    const run: VideoPreviewRun = {
      timing, duration, seconds, pausedBeforeInvalid: duration === null ? pausedPosition : undefined,
      frame: 0, playWhenReady: false,
    }
    playbackRun.current = run
    updatePlayhead(seconds, duration)
    if (duration !== null && seconds < duration) {
      setPlayback(capture.scene ? (seconds > 0 ? 'paused' : 'start') : 'preparing')
      // Redraw the current preview frame after its timing changes.
      run.frame = window.requestAnimationFrame(() => void showVideoFrame(seconds, false))
    } else {
      setPlayback('ready')
    }
    return () => window.cancelAnimationFrame(run.frame)
  }, [isVideo, captureChart, timing, duration, saving])

  function updatePlayhead(seconds: number, total: number | null) {
    const text = formatVideoClock(seconds, total)
    const seek = seekRef.current
    if (seek) {
      seek.value = String(seconds)
      if (seek.getAttribute('aria-valuetext') !== text) seek.setAttribute('aria-valuetext', text)
    }
    if (clockRef.current && clockRef.current.textContent !== text) clockRef.current.textContent = text
    const activePhase = (timing && ENEMY_RATING_VIDEO_PHASES.find(phase => {
      const { start, duration } = timing[phase]
      return seconds >= start && seconds < start + duration
    })) ?? null
    if (activePhase !== activePhaseRef.current) {
      activePhaseRef.current = activePhase
      video?.onActivePhase(activePhase)
    }
  }

  function showPreparedFrame(run: VideoPreviewRun) {
    const { scene, duration: length } = run
    if (!scene || length === null) return
    const { animation, context } = scene
    const drawFrame = (seconds: number) => {
      try {
        animation.drawFrame(context, seconds)
        run.seconds = seconds
        updatePlayhead(seconds, length)
        return true
      } catch {
        setPlayback('error')
        return false
      }
    }
    if (run.seconds >= length) {
      setPlayback('ready')
      return
    }
    if (!drawFrame(run.seconds)) return
    if (!run.playWhenReady) {
      setPlayback(run.seconds > 0 ? 'paused' : 'start')
      return
    }
    setPlayback('playing')
    const startedAt = performance.now() - run.seconds * 1000
    const animate = (now: number) => {
      if (playbackRun.current !== run) return
      const seconds = Math.min(Math.max(0, (now - startedAt) / 1000), length)
      if (!drawFrame(seconds)) return
      if (seconds < length) run.frame = window.requestAnimationFrame(animate)
      else setPlayback('ready')
    }
    run.frame = window.requestAnimationFrame(animate)
  }

  function showCapturedFrame(run: VideoPreviewRun, scene: VideoPreviewScene) {
    if (!run.timing || run.duration === null || run.seconds >= run.duration) return
    run.scene ??= { animation: scene.animation.withTiming(run.timing), context: scene.context }
    showPreparedFrame(run)
  }

  async function showVideoFrame(seconds: number, playWhenReady: boolean) {
    const canvas = canvasRef.current
    const run = playbackRun.current
    if (!canvas || saving || !timing || duration === null) return
    const capture = previewCapture.current
    window.cancelAnimationFrame(run.frame)
    run.seconds = Math.min(duration, Math.max(0, seconds))
    run.playWhenReady = playWhenReady
    updatePlayhead(run.seconds, duration)
    if (run.seconds >= duration) {
      setPlayback('ready')
      return
    }
    if (capture.scene) {
      showCapturedFrame(run, capture.scene)
      return
    }
    if (capture.preparation) {
      setPlayback('preparing')
      return
    }
    const preparation = new AbortController()
    capture.preparation = preparation
    setPlayback('preparing')

    try {
      const animation = await prepareEnemyRatingComparisonVideo(captureChart, timing, preparation.signal)
      if (preparation.signal.aborted || previewCapture.current !== capture) return
      canvas.width = animation.width
      canvas.height = animation.height
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) throw new Error('動画プレビューの描画領域を作成できませんでした。')
      capture.scene = { animation, context }
      const activeRun = playbackRun.current
      window.cancelAnimationFrame(activeRun.frame)
      showCapturedFrame(activeRun, capture.scene)
    } catch {
      const activeRun = playbackRun.current
      if (!preparation.signal.aborted && activeRun.duration !== null && activeRun.seconds < activeRun.duration) {
        setPlayback('error')
      }
    } finally {
      if (capture.preparation === preparation) capture.preparation = undefined
    }
  }

  function togglePlayback() {
    if (duration === null) return
    const run = playbackRun.current
    if (playback === 'playing') {
      window.cancelAnimationFrame(run.frame)
      setPlayback(run.seconds > 0 ? 'paused' : 'start')
      return
    }
    void showVideoFrame(run.seconds >= duration ? 0 : run.seconds, true)
  }

  const scale = Math.min(availableWidth / size.width, 380 / size.height, 1)
  const rasterSize = getChartImageRasterSize(size, output)
  const showCanvas = playback === 'playing' || playback === 'paused' || playback === 'start'
  const playbackLabels = {
    ready: '再生', preparing: '準備中…', playing: '一時停止', paused: '再開', start: '再生', error: '再生',
  }
  return <div className="enemy-chart-image-preview">
    <div className={`enemy-chart-image-preview-heading${video ? ' is-video' : ''}`}>
      <span>{video && !showCanvas ? '完成図' : 'プレビュー'}</span>
      <span>{video ? video.formatLabel : 'PNG'}</span>
    </div>
    <div ref={previewRef} className="enemy-chart-image-preview-frame" style={{ height: Math.ceil(size.height * scale) }}>
      <div className="enemy-chart-image-preview-position" style={{ width: size.width, height: size.height,
        left: (availableWidth - size.width * scale) / 2, transform: `scale(${scale})` }}>
        <EnemyRatingComparisonImage snapshot={snapshot} aspectRatio={aspectRatio} onLayout={setSize} />
        {video && <canvas ref={canvasRef} className="enemy-chart-video-preview-canvas"
          hidden={!showCanvas} aria-hidden="true" />}
      </div>
    </div>
    {video && <div className="enemy-chart-video-preview-controls">
      <button className="button secondary" type="button"
        disabled={saving || duration === null || playback === 'preparing'}
        onClick={togglePlayback}>{playbackLabels[playback]}</button>
      <input ref={seekRef} type="range" min="0" max={duration ?? 1} step="any" defaultValue={duration ?? 0}
        aria-label="再生位置" aria-valuetext={formatVideoClock(duration ?? 0, duration)}
        disabled={saving || duration === null}
        onChange={event => void showVideoFrame(event.currentTarget.valueAsNumber, false)} />
      <output ref={clockRef} aria-live="off">{formatVideoClock(duration ?? 0, duration)}</output>
    </div>}
    <span className="enemy-chart-image-preview-size" aria-live="polite">
      {rasterSize.width.toLocaleString('ja-JP')} × {rasterSize.height.toLocaleString('ja-JP')} px
    </span>
    {playback === 'error' && <p className="chart-image-save-error" role="alert">
      動画を再生できませんでした。
    </p>}
  </div>
}
