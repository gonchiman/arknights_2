import { getChartVideoFrameTiming } from './chartVideoFrames'

export interface ChartVideoFormat {
  mimeType: string
  extension: 'mp4' | 'webm'
}

const VIDEO_FORMATS: readonly ChartVideoFormat[] = [
  { mimeType: 'video/mp4;codecs=avc1', extension: 'mp4' },
  { mimeType: 'video/webm;codecs=vp8', extension: 'webm' },
  { mimeType: 'video/webm;codecs=vp9', extension: 'webm' },
  { mimeType: 'video/webm', extension: 'webm' },
]
export const CHART_VIDEO_FRAME_RATE = 30

export function getChartVideoFormat(): ChartVideoFormat | undefined {
  if (typeof HTMLCanvasElement === 'undefined' || typeof VideoEncoder === 'undefined'
    || typeof VideoFrame === 'undefined') return undefined

  const format = typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function'
    ? VIDEO_FORMATS.find(({ mimeType }) => MediaRecorder.isTypeSupported(mimeType))
    : VIDEO_FORMATS[0]
  return format && { ...format }
}

export async function recordChartVideo({ format, width, height, duration, drawFrame, signal, frameRate = CHART_VIDEO_FRAME_RATE }: {
  format: ChartVideoFormat
  width: number
  height: number
  duration: number
  drawFrame: (context: CanvasRenderingContext2D, seconds: number) => void
  signal?: AbortSignal
  frameRate?: number
}): Promise<Blob> {
  signal?.throwIfAborted()
  if (![width, height].every(value => Number.isSafeInteger(value) && value > 0)
    || !Number.isFinite(duration) || duration <= 0) throw new RangeError('動画の寸法または再生時間が無効です。')
  const timeline = getChartVideoFrameTiming(duration, frameRate)
  const { BufferTarget, CanvasSource, Output, Mp4OutputFormat, WebMOutputFormat, canEncodeVideo, Quality } = await import('mediabunny')
  signal?.throwIfAborted()
  const codec = format.extension === 'mp4' ? 'avc' : format.mimeType.includes('vp9') ? 'vp9' : 'vp8'
  const encoding = { codec, quality: new Quality({ bitrate: 8_000_000 }), latencyMode: 'quality' } as const
  if (!await canEncodeVideo(codec, { ...encoding, width, height, frameRate })) {
    throw new Error('このブラウザーでは指定された寸法の動画を出力できません。')
  }
  signal?.throwIfAborted()

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('動画用の描画領域を作成できませんでした。')

  const target = new BufferTarget()
  const output = new Output({
    format: format.extension === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target,
  })
  const source = new CanvasSource(canvas, encoding)
  // A partial final frame preserves an arbitrary requested duration. Whole-frame
  // durations use the muxer's frame-rate timebase for exact, constant intervals.
  const fullFrames = Math.abs(duration * frameRate - timeline.frameCount) < 1e-8
  output.addVideoTrack(source, fullFrames ? { frameRate } : undefined)
  const abort = () => { void output.cancel().catch(() => {}) }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    signal?.throwIfAborted()
    await output.start()
    for (let index = 0; index < timeline.frameCount; index++) {
      signal?.throwIfAborted()
      const frame = timeline.frame(index)
      drawFrame(context, frame.drawSeconds)
      // Encoding backpressure can delay export, but never advances the media clock.
      await source.add(frame.timestamp, frame.duration)
    }
    signal?.throwIfAborted()
    source.close()
    await output.finalize()
    signal?.throwIfAborted()
    if (!target.buffer?.byteLength) throw new Error('グラフ動画を作成できませんでした。')
    return new Blob([target.buffer], { type: `video/${format.extension}` })
  } finally {
    signal?.removeEventListener('abort', abort)
    if (output.state !== 'finalized') await output.cancel()
  }
}

export function downloadChartVideo(blob: Blob, filename: string) {
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
