import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
import { ChartImageFrame } from './ChartImageFrame'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { EnemyRatingComparisonPlot, EnemyRatingComparisonSwatch } from './EnemyRatingComparisonPlot'
import {
  ENEMY_RATING_VIDEO_ASPECT, ENEMY_RATING_VIDEO_DURATION, ENEMY_RATING_VIDEO_WIDTH,
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
    if (savingRef.current || !videoFormat) return
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
  return <ChartImageSaveDialog initialFilename={getDefaultFilename()} getDefaultFilename={getDefaultFilename}
    aspect={video ? undefined : aspect} onAspectChange={video ? undefined : setAspect}
    canChooseLocation={Boolean(picker)} saving={saving} helpMode="popover"
    videoExtension={video ? videoExtension : undefined} cancelWhileSaving={canCancelVideo}
    saveDisabled={video && !videoFormat}
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
    preview={(video || validAspect) && <EnemyRatingComparisonImagePreview key={previewRatio ?? 'auto'}
      snapshot={outputSnapshot} aspectRatio={previewRatio} output={output}
      video={video} formatLabel={formatLabel} saving={saving} />} />
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

function EnemyRatingComparisonImagePreview({ snapshot, aspectRatio, output, video, formatLabel, saving }: {
  snapshot: EnemyRatingComparisonImageSnapshot
  aspectRatio?: number
  output?: ChartImageRasterOutput
  video: boolean
  formatLabel?: string
  saving: boolean
}) {
  const previewRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const playbackRun = useRef<{ controller: AbortController; frame: number } | null>(null)
  const [playback, setPlayback] = useState<'ready' | 'preparing' | 'playing' | 'ended' | 'error'>('ready')
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
  useLayoutEffect(() => {
    if (!video) return
    setPlayback('ready')
    return () => {
      const run = playbackRun.current
      if (!run) return
      playbackRun.current = null
      run.controller.abort()
      window.cancelAnimationFrame(run.frame)
    }
  }, [video, snapshot.selectedRanks, saving])

  async function playVideoPreview() {
    const canvas = canvasRef.current
    if (!canvas || saving || playbackRun.current) return
    const run = { controller: new AbortController(), frame: 0 }
    playbackRun.current = run
    setPlayback('preparing')

    const fail = () => {
      if (playbackRun.current !== run) return
      playbackRun.current = null
      setPlayback('error')
    }

    try {
      const animation = await prepareEnemyRatingComparisonVideo(
        <EnemyRatingComparisonImage snapshot={snapshot} aspectRatio={ENEMY_RATING_VIDEO_ASPECT} />,
        run.controller.signal,
      )
      if (run.controller.signal.aborted) return
      canvas.width = animation.width
      canvas.height = animation.height
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) throw new Error('動画プレビューの描画領域を作成できませんでした。')
      animation.drawFrame(context, 0)
      setPlayback('playing')
      const startedAt = performance.now()

      const animate = (now: number) => {
        if (playbackRun.current !== run) return
        const seconds = Math.min((now - startedAt) / 1000, animation.duration)
        try {
          animation.drawFrame(context, seconds)
        } catch {
          fail()
          return
        }
        if (seconds < animation.duration) run.frame = window.requestAnimationFrame(animate)
        else {
          playbackRun.current = null
          setPlayback('ended')
        }
      }

      run.frame = window.requestAnimationFrame(animate)
    } catch {
      fail()
    }
  }

  const scale = Math.min(availableWidth / size.width, 380 / size.height, 1)
  const rasterSize = getChartImageRasterSize(size, output)
  const playbackLabels = {
    ready: '再生', preparing: '準備中…', playing: '再生中…', ended: 'もう一度再生', error: '再生',
  }
  return <div className="enemy-chart-image-preview">
    <div className={`enemy-chart-image-preview-heading${video ? ' is-video' : ''}`}>
      <span>{video && playback !== 'playing' ? '完成図' : 'プレビュー'}</span>
      {video ? <div className="enemy-chart-video-preview-controls">
        <span>{formatLabel}</span>
        <button className="button secondary" type="button"
          disabled={saving || playback === 'preparing' || playback === 'playing'}
          onClick={() => void playVideoPreview()}>{playbackLabels[playback]}</button>
      </div> : <span>PNG</span>}
    </div>
    <div ref={previewRef} className="enemy-chart-image-preview-frame" style={{ height: Math.ceil(size.height * scale) }}>
      <div className="enemy-chart-image-preview-position" style={{ width: size.width, height: size.height,
        left: (availableWidth - size.width * scale) / 2, transform: `scale(${scale})` }}>
        <EnemyRatingComparisonImage snapshot={snapshot} aspectRatio={aspectRatio} onLayout={setSize} />
        {video && <canvas ref={canvasRef} className="enemy-chart-video-preview-canvas"
          hidden={playback !== 'playing'} aria-hidden="true" />}
      </div>
    </div>
    <span className="enemy-chart-image-preview-size" aria-live="polite">
      {rasterSize.width.toLocaleString('ja-JP')} × {rasterSize.height.toLocaleString('ja-JP')} px
      {video && ` · ${ENEMY_RATING_VIDEO_DURATION}秒`}
    </span>
    {playback === 'error' && <p className="chart-image-save-error" role="alert">
      動画を再生できませんでした。
    </p>}
  </div>
}
