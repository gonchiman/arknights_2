export const SLIDE_WIDTH = 1920
export const SLIDE_HEIGHT = 1080
export const SLIDE_FONT = '"Yu Gothic", "Hiragino Kaku Gothic ProN", sans-serif'
export const PORTRAIT_SCALE_MIN = 50
export const PORTRAIT_SCALE_MAX = 200
export const PORTRAIT_SCALE_DEFAULT = 100

export type SlideImage = {
  image: HTMLImageElement
  width: number
  height: number
  name: string
}

export type SlideTheme = 'light' | 'dark'

export type SlideContent = {
  main: SlideImage | null
  portrait: SlideImage | null
  title: string
  caption: string
  theme: SlideTheme
  showPortrait: boolean
  portraitScale?: number
  portraitPositionX?: number
  portraitPositionY?: number
  portraitBehindCaption?: boolean
}

export type SlideRect = { x: number; y: number; width: number; height: number }
type TextContext = { font: string; measureText(text: string): { width: number } }

const themes = {
  light: {
    background: '#f4f6f9', panel: '#ffffff', text: '#172331',
    muted: '#526273', rule: '#c5d0dc', caption: '#182735',
  },
  dark: {
    background: '#111923', panel: '#1b2633', text: '#f0f4fa',
    muted: '#b1becd', rule: '#425267', caption: '#07111b',
  },
} satisfies Record<SlideTheme, Record<string, string>>

export function containRect(
  width: number,
  height: number,
  box: SlideRect,
  align: 'center' | 'bottom' = 'center',
): SlideRect {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('画像のサイズを確認できませんでした。')
  }
  const scale = Math.min(box.width / width, box.height / height)
  const scaledWidth = width * scale
  const scaledHeight = height * scale
  return {
    width: scaledWidth,
    height: scaledHeight,
    x: box.x + (box.width - scaledWidth) / 2,
    y: align === 'bottom' ? box.y + box.height - scaledHeight : box.y + (box.height - scaledHeight) / 2,
  }
}

export function slideLayout(showPortrait = true) {
  const inner = { x: 76.8, y: 176.4, width: 1766.4, height: 651.6 }
  const gap = inner.width * 0.03
  const portrait = {
    x: inner.x + inner.width * 0.76,
    y: inner.y,
    width: inner.width * 0.24,
    height: inner.height,
  }
  const main = { ...inner, width: showPortrait ? inner.width - portrait.width - gap : inner.width }
  return {
    main: containRect(16, 9, main),
    portrait,
    header: { x: 76.8, y: 0, width: 1766.4, height: 118.8 },
    caption: { x: 96, y: 885.6, width: 1728, height: 194.4 },
  }
}

export function portraitScaleLimit(width: number, height: number, box: SlideRect): number {
  const fitted = containRect(width, height, box, 'bottom')
  return Math.min(PORTRAIT_SCALE_MAX, Math.floor(Math.min(
    SLIDE_WIDTH / fitted.width,
    SLIDE_HEIGHT / fitted.height,
  ) * PORTRAIT_SCALE_DEFAULT))
}

// Retained only to resolve placements saved before positions used slide pixels.
export function legacyPortraitImageRect(
  width: number,
  height: number,
  box: SlideRect,
  scalePercent = PORTRAIT_SCALE_DEFAULT,
  positionX?: number,
  positionY?: number,
): SlideRect {
  const fitted = containRect(width, height, box, 'bottom')
  const safePercent = Math.min(
    portraitScaleLimit(width, height, box),
    Math.max(PORTRAIT_SCALE_MIN, Number.isFinite(scalePercent) ? scalePercent : PORTRAIT_SCALE_DEFAULT),
  )
  const scale = safePercent / PORTRAIT_SCALE_DEFAULT
  const scaledWidth = fitted.width * scale
  const scaledHeight = fitted.height * scale
  const position = (percent: number | undefined, span: number, fallback: number) => {
    const desired = typeof percent === 'number' && Number.isFinite(percent)
      ? span * Math.min(100, Math.max(0, percent)) / 100
      : fallback
    return Math.min(span, Math.max(0, desired))
  }
  return {
    x: position(positionX, SLIDE_WIDTH - scaledWidth, fitted.x + (fitted.width - scaledWidth) / 2),
    y: position(positionY, SLIDE_HEIGHT - scaledHeight, fitted.y + fitted.height - scaledHeight),
    width: scaledWidth,
    height: scaledHeight,
  }
}

export function portraitImageRect(
  width: number,
  height: number,
  box: SlideRect,
  scalePercent = PORTRAIT_SCALE_DEFAULT,
  positionX?: number,
  positionY?: number,
): SlideRect {
  const fitted = containRect(width, height, box, 'bottom')
  const scale = Number.isFinite(scalePercent) && scalePercent > 0
    ? scalePercent / PORTRAIT_SCALE_DEFAULT
    : 1
  const scaledWidth = fitted.width * scale
  const scaledHeight = fitted.height * scale
  return {
    x: typeof positionX === 'number' && Number.isFinite(positionX)
      ? positionX
      : fitted.x + (fitted.width - scaledWidth) / 2,
    y: typeof positionY === 'number' && Number.isFinite(positionY)
      ? positionY
      : fitted.y + fitted.height - scaledHeight,
    width: scaledWidth,
    height: scaledHeight,
  }
}

export function transformPortraitRect(
  base: SlideRect,
  scalePercent = PORTRAIT_SCALE_DEFAULT,
  offsetX = 0,
  offsetY = 0,
): SlideRect {
  const scale = Number.isFinite(scalePercent) && scalePercent > 0
    ? scalePercent / PORTRAIT_SCALE_DEFAULT
    : 1
  const width = base.width * scale
  return {
    x: base.x + (base.width - width) / 2 + (Number.isFinite(offsetX) ? offsetX : 0),
    y: base.y + (Number.isFinite(offsetY) ? offsetY : 0),
    width,
    height: base.height * scale,
  }
}

export function wrapText(ctx: TextContext, text: string, width: number): string[] {
  if (!text) return []
  const lines: string[] = []
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    let line = ''
    for (const char of Array.from(paragraph)) {
      if (line && ctx.measureText(line + char).width > width) {
        lines.push(line)
        line = char
      } else {
        line += char
      }
    }
    lines.push(line)
  }
  return lines
}

export function fitText(
  ctx: TextContext,
  text: string,
  width: number,
  maxLines: number,
  maxSize: number,
  minSize: number,
): { lines: string[]; size: number; fits: boolean } {
  for (let size = maxSize; size >= minSize; size--) {
    ctx.font = `500 ${size}px ${SLIDE_FONT}`
    const lines = wrapText(ctx, text, width)
    if (lines.length <= maxLines && lines.every((line) => ctx.measureText(line).width <= width)) {
      return { lines, size, fits: true }
    }
  }
  ctx.font = `500 ${minSize}px ${SLIDE_FONT}`
  return { lines: wrapText(ctx, text, width), size: minSize, fits: false }
}

export function imageFileError(file: Pick<File, 'name' | 'type' | 'size'>): string {
  if (file.size > 25 * 1024 * 1024) return '25 MB以下の画像を選択してください。'
  if (file.size <= 0) return '画像ファイルが空です。別の画像を選択してください。'
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) &&
    !(file.type === '' && /\.(png|jpe?g|webp)$/i.test(file.name))
  ) return 'PNG・JPEG・WebPの画像を選択してください。'
  return ''
}

export function imageDimensionError(width: number, height: number): string {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return '画像のサイズを確認できませんでした。別の画像を選択してください。'
  }
  if (width * height > 40_000_000 || width > 16384 || height > 16384) {
    return '画像が大きすぎます。4000万画素以下・一辺16384px以下に縮小してください。'
  }
  return ''
}

export async function loadSlideImage(file: File): Promise<SlideImage> {
  const fileError = imageFileError(file)
  if (fileError) throw new Error(fileError)
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('画像を読み込めませんでした。別のPNG・JPEG・WebPを選択してください。'))
      image.src = url
    })
    const dimensionError = imageDimensionError(image.naturalWidth, image.naturalHeight)
    if (dimensionError) throw new Error(dimensionError)
    return { image, width: image.naturalWidth, height: image.naturalHeight, name: file.name }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function slideFilename(title: string): string {
  const name = title.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 60).replace(/[. ]+$/g, '')
  return `${name || 'arknights-slide'}.png`
}

export function renderSlide(
  ctx: CanvasRenderingContext2D,
  content: SlideContent,
): { titleFits: boolean; captionFits: boolean } {
  const theme = themes[content.theme]
  const boxes = slideLayout(content.showPortrait)
  ctx.save()
  ctx.clearRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const fillBox = (box: SlideRect, color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(box.x, box.y, box.width, box.height)
  }
  const drawImage = (asset: SlideImage, box: SlideRect, align: 'center' | 'bottom' = 'center') => {
    const dest = containRect(asset.width, asset.height, box, align)
    ctx.drawImage(asset.image, dest.x, dest.y, dest.width, dest.height)
  }
  const placeholder = (box: SlideRect, text: string) => {
    ctx.save()
    ctx.strokeStyle = theme.rule
    ctx.lineWidth = 2
    ctx.setLineDash([10, 8])
    ctx.strokeRect(box.x, box.y, box.width, box.height)
    ctx.setLineDash([])
    ctx.fillStyle = theme.muted
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `400 32px ${SLIDE_FONT}`
    ctx.fillText(text, box.x + box.width / 2, box.y + box.height / 2)
    ctx.restore()
  }
  const drawPortrait = () => {
    if (!content.showPortrait) return
    if (content.portrait) {
      const dest = portraitImageRect(
        content.portrait.width, content.portrait.height, boxes.portrait,
        content.portraitScale, content.portraitPositionX, content.portraitPositionY,
      )
      ctx.drawImage(content.portrait.image, dest.x, dest.y, dest.width, dest.height)
    }
    else if (!content.main) placeholder(boxes.portrait, '立ち絵')
  }

  fillBox({ x: 0, y: 0, width: SLIDE_WIDTH, height: SLIDE_HEIGHT }, theme.background)
  fillBox({ x: 0, y: 118, width: SLIDE_WIDTH, height: 2 }, theme.rule)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'right'
  ctx.font = `500 26px ${SLIDE_FONT}`
  ctx.fillStyle = theme.muted
  ctx.fillText('ARKNIGHTS', 1843.2, 59.4)

  const title = fitText(ctx, content.title, 1500, 1, 44, 22)
  ctx.textAlign = 'left'
  ctx.fillStyle = theme.text
  ctx.font = `500 ${title.size}px ${SLIDE_FONT}`
  ctx.fillText(title.lines[0] || '', 76.8, 59.4)

  fillBox(boxes.main, theme.panel)
  if (content.main) drawImage(content.main, boxes.main)
  else placeholder(boxes.main, '画像を選択すると、ここに自動配置されます')
  if (content.portraitBehindCaption) drawPortrait()
  fillBox({ x: 0, y: boxes.caption.y, width: SLIDE_WIDTH, height: boxes.caption.height }, theme.caption)
  const caption = fitText(ctx, content.caption, boxes.caption.width, 2, 52, 28)
  ctx.fillStyle = '#f7fafc'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `500 ${caption.size}px ${SLIDE_FONT}`
  const lines = caption.lines.slice(0, 2)
  const lineHeight = caption.size * 1.5
  const captionCenter = boxes.caption.y + boxes.caption.height / 2
  lines.forEach((line, index) => ctx.fillText(line, SLIDE_WIDTH / 2, captionCenter + (index - (lines.length - 1) / 2) * lineHeight))

  if (!content.portraitBehindCaption) drawPortrait()
  ctx.restore()
  return { titleFits: title.fits, captionFits: caption.fits }
}
