import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { getChartImageRasterSize, type ChartImageRasterOutput } from '../lib/chartImageRasterSize'
import './EnemyChartImage.css'

interface PreviewSize {
  width: number
  height: number
}

interface ChartVideoAnimation<Timing> extends PreviewSize {
  duration: number
  drawFrame: (context: CanvasRenderingContext2D, seconds: number) => void
  withTiming: (timing: Timing) => ChartVideoAnimation<Timing>
}

interface ChartVideoPreviewOptions<Timing> {
  timing: Timing | null
  duration: number | null
  formatLabel?: string
  saving: boolean
  prepare: (chart: ReactNode, timing: Timing, output: ChartImageRasterOutput, signal: AbortSignal) => Promise<ChartVideoAnimation<Timing>>
  onProgress?: (seconds: number, timing: Timing | null) => void
}

interface VideoPreviewRun<Timing> {
  timing: Timing | null
  duration: number | null
  seconds: number
  pausedBeforeInvalid?: number
  frame: number
  playWhenReady: boolean
  scene?: VideoPreviewScene<Timing>
}

interface VideoPreviewScene<Timing> {
  animation: ChartVideoAnimation<Timing>
  context: CanvasRenderingContext2D
}

interface VideoPreviewCapture<Timing> {
  preparation?: AbortController
  scene?: VideoPreviewScene<Timing>
}

function formatVideoClock(seconds: number, duration: number | null) {
  return duration === null ? '— / — 秒' : `${seconds.toFixed(2)} / ${duration.toFixed(2)} 秒`
}

export function ChartVideoPreview<Timing>({ captureChart, renderChart, initialSize, output, video }: {
  captureChart: ReactNode
  renderChart: (onLayout: (size: PreviewSize) => void) => ReactNode
  initialSize: PreviewSize
  output?: ChartImageRasterOutput
  video?: ChartVideoPreviewOptions<Timing>
}) {
  const isVideo = Boolean(video)
  const duration = video?.duration ?? null
  const timing = video?.timing ?? null
  const saving = video?.saving ?? false
  const prepare = video?.prepare
  const onProgress = video?.onProgress
  const previewRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const seekRef = useRef<HTMLInputElement>(null)
  const clockRef = useRef<HTMLOutputElement>(null)
  const previewCapture = useRef<VideoPreviewCapture<Timing>>({})
  const playbackRun = useRef<VideoPreviewRun<Timing>>({
    timing, duration, seconds: duration ?? 0, frame: 0, playWhenReady: false,
  })
  const [playback, setPlayback] = useState<'ready' | 'preparing' | 'playing' | 'paused' | 'start' | 'error'>('ready')
  const [availableWidth, setAvailableWidth] = useState(600)
  const [size, setSize] = useState(initialSize)
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
    const capture: VideoPreviewCapture<Timing> = {}
    previewCapture.current = capture
    return () => capture.preparation?.abort()
  }, [isVideo, captureChart, prepare, output?.width, output?.aspectRatio])

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
    const run: VideoPreviewRun<Timing> = {
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
  }, [isVideo, captureChart, prepare, output?.width, output?.aspectRatio, timing, duration, saving, onProgress])

  function updatePlayhead(seconds: number, total: number | null) {
    const text = formatVideoClock(seconds, total)
    const seek = seekRef.current
    if (seek) {
      seek.value = String(seconds)
      if (seek.getAttribute('aria-valuetext') !== text) seek.setAttribute('aria-valuetext', text)
    }
    if (clockRef.current && clockRef.current.textContent !== text) clockRef.current.textContent = text
    onProgress?.(seconds, timing)
  }

  function showPreparedFrame(run: VideoPreviewRun<Timing>) {
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

  function showCapturedFrame(run: VideoPreviewRun<Timing>, scene: VideoPreviewScene<Timing>) {
    if (run.timing === null || run.duration === null || run.seconds >= run.duration) return
    run.scene ??= { animation: scene.animation.withTiming(run.timing), context: scene.context }
    showPreparedFrame(run)
  }

  async function showVideoFrame(seconds: number, playWhenReady: boolean) {
    const canvas = canvasRef.current
    const run = playbackRun.current
    if (!canvas || !output || !prepare || saving || timing === null || duration === null) return
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
      const animation = await prepare(captureChart, timing, output, preparation.signal)
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
        {renderChart(setSize)}
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
