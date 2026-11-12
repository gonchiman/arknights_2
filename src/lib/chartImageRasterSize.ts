export const CHART_IMAGE_MAX_SIDE = 16_000
const CHART_IMAGE_MAX_PIXELS = 32_000_000

interface ImageSize {
  width: number
  height: number
}

export interface ChartImageRasterOutput {
  width: number
  aspectRatio?: number
}

export function getChartImageRasterSize(size: ImageSize, output?: ChartImageRasterOutput): ImageSize {
  if (output) {
    const aspectRatio = output.aspectRatio ?? size.width / size.height
    if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
      throw new RangeError('画像の縦横比を取得できませんでした。')
    }
    const width = output.width
    const height = Math.max(1, Math.round(width / aspectRatio))
    if (!Number.isSafeInteger(width) || width < 1 || width > CHART_IMAGE_MAX_SIDE ||
      height > CHART_IMAGE_MAX_SIDE || width * height > CHART_IMAGE_MAX_PIXELS) {
      throw new RangeError('指定した画像の大きさが保存可能な範囲を超えています。')
    }
    return { width, height }
  }

  const pixelRatio = Math.min(
    2,
    CHART_IMAGE_MAX_SIDE / size.width,
    CHART_IMAGE_MAX_SIDE / size.height,
    Math.sqrt(CHART_IMAGE_MAX_PIXELS / size.width / size.height),
  )
  return { width: Math.floor(size.width * pixelRatio), height: Math.floor(size.height * pixelRatio) }
}
