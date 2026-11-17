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
const FRAMES_PER_SECOND = 30

export function getChartVideoFormat(): ChartVideoFormat | undefined {
  if (typeof HTMLCanvasElement === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function'
    || typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return undefined

  const format = VIDEO_FORMATS.find(({ mimeType }) => MediaRecorder.isTypeSupported(mimeType))
  return format && { ...format }
}

export async function recordChartVideo({ format, width, height, duration, drawFrame, signal }: {
  format: ChartVideoFormat
  width: number
  height: number
  duration: number
  drawFrame: (context: CanvasRenderingContext2D, seconds: number) => void
  signal?: AbortSignal
}): Promise<Blob> {
  signal?.throwIfAborted()
  if (![width, height].every(value => Number.isSafeInteger(value) && value > 0)
    || !Number.isFinite(duration) || duration <= 0) throw new RangeError('動画の寸法または再生時間が無効です。')

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('動画用の描画領域を作成できませんでした。')

  const stream = canvas.captureStream(FRAMES_PER_SECOND)
  let recorder: MediaRecorder | undefined
  let frameTimer: number | undefined
  let abortRecording: (() => void) | undefined
  try {
    const video = new MediaRecorder(stream, { mimeType: format.mimeType, videoBitsPerSecond: 8_000_000 })
    recorder = video

    return await new Promise<Blob>((resolve, reject) => {
      const chunks: Blob[] = []
      let reachedEnd = false
      video.ondataavailable = ({ data }) => {
        if (data.size > 0) chunks.push(data)
      }
      video.onerror = () => reject(new Error('グラフ動画の録画に失敗しました。'))
      video.onstop = () => {
        const type = chunks.find(chunk => chunk.type)?.type || video.mimeType || format.mimeType
        const blob = new Blob(chunks, { type })
        if (!reachedEnd || !blob.size) {
          reject(new Error('グラフ動画を最後まで録画できませんでした。'))
          return
        }
        if (blob.type.split(';', 1)[0] !== `video/${format.extension}`) {
          reject(new Error('グラフ動画を指定の形式で録画できませんでした。'))
          return
        }
        resolve(blob)
      }

      abortRecording = () => reject(signal?.reason ?? new DOMException('録画を中止しました。', 'AbortError'))
      signal?.addEventListener('abort', abortRecording, { once: true })
      signal?.throwIfAborted()

      const start = performance.now()
      video.start()
      drawFrame(context, 0)
      frameTimer = window.setInterval(() => {
        try {
          if (reachedEnd) {
            window.clearInterval(frameTimer)
            video.stop()
            return
          }
          const seconds = Math.min((performance.now() - start) / 1_000, duration)
          drawFrame(context, seconds)
          // Stop on the next tick so canvas capture can consume the final draw.
          reachedEnd = seconds === duration
        } catch (error) {
          reject(error)
        }
      }, 1_000 / FRAMES_PER_SECOND)
    })
  } finally {
    window.clearInterval(frameTimer)
    if (abortRecording) signal?.removeEventListener('abort', abortRecording)
    try {
      if (recorder) {
        recorder.ondataavailable = null
        recorder.onerror = null
        recorder.onstop = null
        if (recorder.state !== 'inactive') recorder.stop()
      }
    } finally {
      for (const track of stream.getTracks()) track.stop()
    }
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
