import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getChartImageSavePicker, selectChartVideoDestination, withChartVideoExtension } from '../lib/chartImageDestination'
import { createChartImageFilename, withChartImageAspect } from '../lib/chartImageFilename'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { CHART_IMAGE_MAX_SIDE } from '../lib/chartImageRasterSize'
import { downloadChartVideo, getChartVideoFormat, recordChartVideo } from '../lib/chartVideoRecorder'
import { createChartVideoTimingDraft, parseChartVideoTiming, type ChartVideoTiming } from '../lib/enemyRatingVideoTiming'
import { getEnemyResistanceScatterVideoDefinition, type EnemyResistanceScatterVideoPhase } from '../lib/enemyResistanceScatterVideoTiming'
import { parseTableImageAspect } from '../lib/tableImageAspect'
import { ChartImageFrame } from './ChartImageFrame'
import { CHART_VIDEO_ASPECT_PRESETS, ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { ChartVideoPreview } from './ChartVideoPreview'
import { ChartVideoTimingEditor, type ChartVideoDurationError } from './EnemyRatingVideoTimingEditor'
import {
  ENEMY_RESISTANCE_ASPECT_PRESETS, ENEMY_RESISTANCE_SCATTER_TITLE, getEnemyResistanceScatterFrame,
  type EnemyResistanceScatterSnapshot,
} from './EnemyResistanceImageDialog'
import { prepareEnemyResistanceScatterVideo } from './renderEnemyResistanceScatterVideo'

const OUTPUT_WIDTH = 1920
const DEFAULT_ASPECT = { preset: '16:9', width: '16', height: '9' }
const VIDEO_ASPECT_PRESETS = [...new Set([...CHART_VIDEO_ASPECT_PRESETS, ...ENEMY_RESISTANCE_ASPECT_PRESETS])]
const PHASE_LABELS = {
  title: 'タイトル・条件',
  frame: 'グラフの枠',
  axes: '軸・目盛り',
  points: '点と数値',
  notes: '該当なしの注記',
} satisfies Record<EnemyResistanceScatterVideoPhase, string>

export function EnemyResistanceScatterVideoDialog({ snapshot, onClose }: {
  snapshot: EnemyResistanceScatterSnapshot
  onClose: () => void
}) {
  const [aspect, setAspect] = useState<ChartImageAspectSettings>(DEFAULT_ASPECT)
  const definition = getEnemyResistanceScatterVideoDefinition(snapshot.rows.some(row => row.defense === null))
  const [timingDraft, setTimingDraft] = useState(() => createChartVideoTimingDraft(definition))
  const timing = useMemo(() => parseChartVideoTiming(timingDraft, definition), [timingDraft, definition])
  const [timingInputError, setTimingInputError] = useState<ChartVideoDurationError<EnemyResistanceScatterVideoPhase> | null>(null)
  const [activePhase, setActivePhase] = useState<EnemyResistanceScatterVideoPhase | null>(null)
  const activePhaseRef = useRef<EnemyResistanceScatterVideoPhase | null>(null)
  const [saving, setSaving] = useState(false)
  const [canCancel, setCanCancel] = useState(false)
  const [error, setError] = useState(false)
  const saveInProgress = useRef(false)
  const recording = useRef<AbortController | null>(null)
  useEffect(() => () => recording.current?.abort(), [])

  const onProgress = useCallback((seconds: number, settings: ChartVideoTiming<EnemyResistanceScatterVideoPhase> | null) => {
    const phase = (settings && definition.phases.find(phase => {
      const { start, duration } = settings[phase]
      return seconds >= start && seconds < start + duration
    })) ?? null
    if (activePhaseRef.current !== phase) {
      activePhaseRef.current = phase
      setActivePhase(phase)
    }
  }, [definition])
  const videoFormat = getChartVideoFormat()
  const extension = videoFormat?.extension ?? 'mp4'
  const picker = getChartImageSavePicker()
  const exactAspect = aspect.preset === 'auto' ? null : parseTableImageAspect(aspect.width, aspect.height)
  const ratio = exactAspect ? exactAspect.width / exactAspect.height : undefined
  const height = ratio === undefined ? undefined : Math.max(2, Math.round(OUTPUT_WIDTH / ratio / 2) * 2)
  const outputRatio = height === undefined ? undefined : OUTPUT_WIDTH / height
  const aspectError = aspect.preset !== 'auto' && !exactAspect
    ? '幅と高さは1〜100の整数、縦横比は1:10〜10:1で指定してください。'
    : height !== undefined && height > CHART_IMAGE_MAX_SIDE
      ? 'この比率では動画の高さが保存可能な範囲を超えます。' : undefined
  const output = useMemo(() => ({ width: OUTPUT_WIDTH, aspectRatio: outputRatio }), [outputRatio])
  const frame = useMemo(() => getEnemyResistanceScatterFrame(snapshot, outputRatio), [snapshot, outputRatio])
  const initialSize = getChartImageLayout(frame)
  const captureChart = useMemo(() => <ChartImageFrame {...frame} />, [frame])
  const baseFilename = createChartImageFilename(ENEMY_RESISTANCE_SCATTER_TITLE, [
    ...snapshot.chartFilenameParts, `幅${OUTPUT_WIDTH}px`,
    timing.duration !== null && `${Number(timing.duration.toPrecision(12))}秒`,
  ])

  function getDefaultFilename(aspectRatio?: number) {
    const filename = withChartImageAspect(baseFilename, aspectRatio)
    return withChartVideoExtension(filename.replace(/\.png$/i, ''), extension)
  }

  async function saveVideo(filename: string, chooseLocation: boolean) {
    if (saveInProgress.current || !videoFormat || aspectError || !timing.timing || timingInputError) return
    const controller = new AbortController()
    recording.current = controller
    saveInProgress.current = true
    setSaving(true)
    setCanCancel(true)
    setError(false)
    try {
      const destination = await selectChartVideoDestination(filename, chooseLocation ? picker : undefined, videoFormat.extension)
      if (destination.type === 'cancelled') return
      controller.signal.throwIfAborted()
      const animation = await prepareEnemyResistanceScatterVideo(captureChart, timing.timing, output, controller.signal)
      const blob = await recordChartVideo({
        width: animation.width, height: animation.height, duration: animation.duration, drawFrame: animation.drawFrame,
        format: videoFormat, signal: controller.signal,
      })
      controller.signal.throwIfAborted()
      recording.current = null
      setCanCancel(false)
      if (destination.type === 'file') await destination.write(blob)
      else downloadChartVideo(blob, withChartVideoExtension(filename, videoFormat.extension))
      onClose()
    } catch (cause) {
      if (!controller.signal.aborted) {
        console.error('散布図の動画を保存できませんでした。', cause)
        setError(true)
      }
    } finally {
      saveInProgress.current = false
      recording.current = null
      if (!controller.signal.aborted) {
        setCanCancel(false)
        setSaving(false)
      }
    }
  }

  return <ChartImageSaveDialog initialFilename={getDefaultFilename(ratio)} getDefaultFilename={getDefaultFilename}
    aspect={aspect} aspectPresets={VIDEO_ASPECT_PRESETS} aspectError={aspectError}
    onAspectChange={next => { setAspect(next); setError(false); onProgress(0, null) }}
    canChooseLocation={Boolean(picker)} saving={saving}
    saveDisabled={!videoFormat || !timing.timing || Boolean(timingInputError)}
    videoExtension={extension} cancelWhileSaving={canCancel} helpMode="popover"
    error={!videoFormat ? 'このブラウザーは動画の出力に対応していません。' : error}
    onClose={() => {
      if (saveInProgress.current && !recording.current) return
      recording.current?.abort()
      onClose()
    }}
    onSave={filename => { void saveVideo(filename, true) }}
    additionalSaveAction={picker ? {
      label: 'ダウンロード',
      onSave: filename => { void saveVideo(filename, false) },
    } : undefined}
    preview={<div className="enemy-rating-video-preview">
      {!aspectError && <ChartVideoPreview key={outputRatio ?? 'auto'} captureChart={captureChart}
        renderChart={onLayout => <ChartImageFrame {...frame} onLayout={onLayout} />}
        initialSize={initialSize} output={output} video={{
          timing: timing.timing, duration: timing.duration, formatLabel: videoFormat && (extension === 'mp4' ? 'MP4' : 'WebM'),
          saving, prepare: prepareEnemyResistanceScatterVideo, onProgress,
        }} />}
      <ChartVideoTimingEditor draft={timingDraft} onChange={setTimingDraft} parsed={timing}
        inputError={timingInputError} onInputError={setTimingInputError} activePhase={activePhase}
        definition={definition} phaseLabels={PHASE_LABELS} guideLabel="枠・目盛り線の出し方"
        dataEffect="points" disabled={saving} />
    </div>}
  />
}
