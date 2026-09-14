export interface TableImageAspect {
  width: number
  height: number
}

export function parseTableImageAspect(width: string, height: string): TableImageAspect | null {
  const values = [width.trim(), height.trim()]
  if (values.some((value) => !/^\d+$/.test(value))) return null
  const [w, h] = values.map(Number)
  if (![w, h].every((value) => Number.isInteger(value) && value >= 1 && value <= 100)) return null
  if (w / h < 0.1 || w / h > 10) return null
  let a = w
  let b = h
  while (b !== 0) [a, b] = [b, a % b]
  return { width: w / a, height: h / a }
}

/** Fit complete table content without resizing text or cropping it. */
export function getTableImageDimensions({
  initialWidth,
  aspect,
  measureHeight,
}: {
  initialWidth: number
  aspect: TableImageAspect | null
  measureHeight: (width: number) => number
}): { width: number; height: number } {
  if (!Number.isFinite(initialWidth) || initialWidth <= 0) throw new Error('保存する表の幅を取得できませんでした。')
  const heights = new Map<number, number>()
  const naturalHeight = (width: number) => {
    const previous = heights.get(width)
    if (previous !== undefined) return previous
    const measured = measureHeight(width)
    if (!Number.isFinite(measured) || measured <= 0) throw new Error('保存する表の高さを取得できませんでした。')
    const height = Math.ceil(measured)
    heights.set(width, height)
    return height
  }
  if (aspect === null) {
    const width = Math.ceil(initialWidth)
    return { width, height: naturalHeight(width) }
  }
  const ratio = parseTableImageAspect(String(aspect.width), String(aspect.height))
  if (!ratio) throw new Error('画像の縦横比が正しくありません。')

  // Keep the shared exporter's 2x rasterization within its 16,000px / 32MP
  // limits, so neither downsampling nor pixel rounding alters the chosen ratio.
  const maxScale = Math.floor(Math.min(
    8000 / ratio.width,
    8000 / ratio.height,
    Math.sqrt(8_000_000 / ratio.width / ratio.height),
  ))
  const fits = (scale: number) => naturalHeight(scale * ratio.width) <= scale * ratio.height
  const dimensions = (scale: number) => ({ width: scale * ratio.width, height: scale * ratio.height })
  // An extreme portrait ratio may need a narrower starting table to stay
  // within the image limit; cell text remains the same size and wraps normally.
  const initialScale = Math.min(Math.ceil(initialWidth / ratio.width), maxScale)
  if (fits(initialScale)) return dimensions(initialScale)

  let lower = initialScale
  let upper = lower
  while (upper < maxScale) {
    upper = Math.min(maxScale, Math.max(upper + 1, upper * 2))
    if (fits(upper)) break
    lower = upper
  }
  if (!fits(upper)) throw new Error('この縦横比では表全体を画像に収められません。縦横比を変更してください。')
  while (upper - lower > 1) {
    const middle = Math.floor((lower + upper) / 2)
    if (fits(middle)) upper = middle
    else lower = middle
  }
  return dimensions(upper)
}
