import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getChartImageSavePicker, selectChartVideoDestination, withChartVideoExtension } from '../lib/chartImageDestination'
import { createChartImageFilename, withChartImageAspect } from '../lib/chartImageFilename'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { CHART_IMAGE_MAX_SIDE } from '../lib/chartImageRasterSize'
import { downloadChartVideo, getChartVideoFormat } from '../lib/chartVideoRecorder'
import {
  createEnemyHistogramVideoTimingDraft, ENEMY_HISTOGRAM_VIDEO_DEFINITION, parseEnemyHistogramVideoTiming,
  setEnemyHistogramVideoValueMode, type EnemyHistogramVideoPhase, type EnemyHistogramVideoTiming,
  type EnemyHistogramVideoTimingDraft,
} from '../lib/enemyHistogramVideoTiming'
import type { EnemyRatingVideoValueMode } from '../lib/enemyRatingVideoTiming'
import { CHART_VIDEO_ASPECT_PRESETS, ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { ChartVideoPreview } from './ChartVideoPreview'
import { ChartVideoTimingEditor, type ChartVideoDurationError } from './EnemyRatingVideoTimingEditor'
import { prepareEnemyHistogramVideo, renderEnemyHistogramVideo } from './renderEnemyHistogramVideo'

const OUTPUT_WIDTH = 1920
const DEFAULT_ASPECT = { preset: '16:9', width: '16', height: '9' }
const BAR_FILENAMES = { grow: '棒伸びる', stagger: '棒順に表示', staggerGrow: '棒順に伸びる' } as const

export function EnemyHistogramVideoSaveDialog({ renderChart, initialFilename, hasCumulative, onClose }: {
  renderChart: (aspectRatio?: number, onLayout?: (size: { width: number; height: number }) => void) => ReactNode
  initialFilename: string
  hasCumulative: boolean
  onClose: () => void
}) {
  const [aspect, setAspect] = useState<ChartImageAspectSettings>(DEFAULT_ASPECT)
  const [draft, setDraft] = useState(createEnemyHistogramVideoTimingDraft)
  const timing = useMemo(() => parseEnemyHistogramVideoTiming(draft), [draft])
  const [inputError, setInputError] = useState<ChartVideoDurationError<EnemyHistogramVideoPhase> | null>(null)
  const [activePhase, setActivePhase] = useState<EnemyHistogramVideoPhase | null>(null)
  const activePhaseRef = useRef<EnemyHistogramVideoPhase | null>(null)
  const [saving, setSaving] = useState(false)
  const [canCancel, setCanCancel] = useState(false)
  const [error, setError] = useState(false)
  const saveInProgress = useRef(false)
  const recording = useRef<AbortController | null>(null)
  useEffect(() => () => recording.current?.abort(), [])

  const onProgress = useCallback((seconds: number, settings: EnemyHistogramVideoTiming | null) => {
    const phase = (settings && ENEMY_HISTOGRAM_VIDEO_DEFINITION.phases.find(phase => {
      const { start, duration } = settings[phase]
      return seconds >= start && seconds < start + duration
    })) ?? null
    if (activePhaseRef.current !== phase) {
      activePhaseRef.current = phase
      setActivePhase(phase)
    }
  }, [])
  const videoFormat = getChartVideoFormat()
  const extension = videoFormat?.extension ?? 'mp4'
  const picker = getChartImageSavePicker()
  const validAspect = aspect.preset === 'auto' || [aspect.width, aspect.height]
    .every(value => /^\d+$/.test(value.trim()) && Number(value) >= 1 && Number(value) <= 100)
  const ratio = aspect.preset === 'auto' || !validAspect ? undefined : Number(aspect.width) / Number(aspect.height)
  const height = ratio === undefined ? undefined : Math.max(2, Math.round(OUTPUT_WIDTH / ratio / 2) * 2)
  const outputRatio = height === undefined ? undefined : OUTPUT_WIDTH / height
  const aspectError = height !== undefined && height > CHART_IMAGE_MAX_SIDE
    ? 'この比率では動画の高さが保存可能な範囲を超えます。' : undefined
  const output = useMemo(() => ({ width: OUTPUT_WIDTH, aspectRatio: outputRatio }), [outputRatio])
  const captureChart = useMemo(() => renderChart(outputRatio), [renderChart, outputRatio])
  const filenameParts = initialFilename.replace(/\.(?:png|mp4|webm)$/i, '')
    .replace(/_比率(?:自動|[\d.e+-]+x[\d.e+-]+)$/i, '').split('_').filter(Boolean)
  const metricEnd = filenameParts.includes('ヒストグラム') ? filenameParts.indexOf('ヒストグラム') + 1 : Math.min(3, filenameParts.length)
  const baseFilename = createChartImageFilename(filenameParts.slice(0, metricEnd).join('_'), [
    timing.duration !== null && `${Number(timing.duration.toPrecision(12))}秒`,
    hasCumulative && (draft.valueMode === 'linked' ? '累積線連動' : '累積線あと'),
    BAR_FILENAMES[draft.barMode], `幅${OUTPUT_WIDTH}px`, ...filenameParts.slice(metricEnd),
  ])

  function getDefaultFilename(aspectRatio?: number) {
    const filename = withChartImageAspect(baseFilename, aspectRatio)
    return withChartVideoExtension(filename.replace(/\.png$/i, ''), extension)
  }

  function updateDraft(next: EnemyHistogramVideoTimingDraft) {
    setDraft({ ...next, order: [...ENEMY_HISTOGRAM_VIDEO_DEFINITION.phases],
      valueMode: hasCumulative ? next.valueMode : 'linked' })
  }

  function changeValueMode(valueMode: EnemyRatingVideoValueMode) {
    setDraft(current => setEnemyHistogramVideoValueMode(current, valueMode))
    setInputError(null)
    onProgress(0, null)
  }

  async function saveVideo(filename: string, chooseLocation: boolean) {
    if (saveInProgress.current || !videoFormat || !validAspect || aspectError || !timing.timing || inputError) return
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
      const blob = await renderEnemyHistogramVideo(captureChart, videoFormat, timing.timing, output, controller.signal)
      controller.signal.throwIfAborted()
      recording.current = null
      setCanCancel(false)
      if (destination.type === 'file') await destination.write(blob)
      else downloadChartVideo(blob, withChartVideoExtension(filename, videoFormat.extension))
      onClose()
    } catch (cause) {
      if (!controller.signal.aborted) {
        console.error('ヒストグラムの動画を保存できませんでした。', cause)
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
    aspect={aspect} aspectPresets={CHART_VIDEO_ASPECT_PRESETS} aspectError={aspectError}
    onAspectChange={next => { setAspect(next); setError(false); onProgress(0, null) }}
    canChooseLocation={Boolean(picker)} saving={saving}
    saveDisabled={!videoFormat || !validAspect || Boolean(aspectError) || !timing.timing || Boolean(inputError)}
    videoExtension={extension} cancelWhileSaving={canCancel} helpMode="popover"
    error={!videoFormat ? 'このブラウザーは動画の出力に対応していません。' : error}
    onClose={() => {
      if (saveInProgress.current && !recording.current) return
      recording.current?.abort()
      onClose()
    }}
    onSave={filename => { void saveVideo(filename, true) }}
    additionalSaveAction={picker ? { label: 'ダウンロード', onSave: filename => { void saveVideo(filename, false) } } : undefined}
    preview={<div className="enemy-rating-video-preview">
      {hasCumulative && <div className="enemy-rating-video-animation">
        <span>累積線</span>
        <div className="enemy-rating-video-animation-options" role="group" aria-label="累積線">
          <button type="button" className="button secondary" aria-pressed={draft.valueMode === 'linked'} disabled={saving}
            onClick={() => changeValueMode('linked')}>棒と連動</button>
          <button type="button" className="button secondary" aria-pressed={draft.valueMode === 'fixed'} disabled={saving}
            onClick={() => changeValueMode('fixed')}>棒のあと</button>
        </div>
      </div>}
      {validAspect && !aspectError && <ChartVideoPreview key={outputRatio ?? 'auto'} captureChart={captureChart}
        renderChart={onLayout => renderChart(outputRatio, onLayout)}
        initialSize={getChartImageLayout({ naturalChartHeight: 334, aspectRatio: outputRatio })} output={output}
        video={{ timing: timing.timing, duration: timing.duration,
          formatLabel: videoFormat && (extension === 'mp4' ? 'MP4' : 'WebM'),
          saving, prepare: prepareEnemyHistogramVideo, onProgress }} />}
      <ChartVideoTimingEditor key={draft.valueMode} draft={draft} onChange={updateDraft} parsed={timing}
        inputError={inputError} onInputError={setInputError} activePhase={activePhase}
        definition={ENEMY_HISTOGRAM_VIDEO_DEFINITION}
        phaseLabels={{ bars: '棒・割合', values: hasCumulative ? '累積線・累積割合' : '割合' }}
        guideLabel="縦線の出し方" dataEffect="bars" disabled={saving}
        showTextEffect={false} showGuideEffect={false} showPhaseOrder={false}
        createDefaultDraft={createEnemyHistogramVideoTimingDraft} />
    </div>} />
}
