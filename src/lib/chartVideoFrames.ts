export function getChartVideoFrameTiming(duration: number, frameRate: number) {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(frameRate) || frameRate <= 0 || frameRate > 240) {
    throw new RangeError('動画の再生時間またはフレームレートが無効です。')
  }

  const expectedFrames = duration * frameRate
  // Decimal durations can place an exact frame boundary a few floating-point units above its integer.
  const tolerance = Number.EPSILON * 8 * Math.max(1, expectedFrames)
  const frameCount = Math.max(1, Math.ceil(expectedFrames - tolerance))
  const lastTimestamp = (frameCount - 1) / frameRate
  if (!Number.isSafeInteger(frameCount) || !Number.isSafeInteger(Math.round(duration * 1_000_000))
    || Math.round((duration - lastTimestamp) * 1_000_000) < 1) {
    throw new RangeError('動画のフレーム時刻をマイクロ秒単位で表せません。')
  }

  return {
    frameCount,
    frameRate,
    duration,
    frame(index: number) {
      if (!Number.isSafeInteger(index) || index < 0 || index >= frameCount) {
        throw new RangeError('動画のフレーム番号が範囲外です。')
      }
      const timestamp = index / frameRate
      const last = index === frameCount - 1
      return {
        timestamp,
        duration: last ? duration - timestamp : 1 / frameRate,
        drawSeconds: last ? duration : timestamp,
      }
    },
  }
}
