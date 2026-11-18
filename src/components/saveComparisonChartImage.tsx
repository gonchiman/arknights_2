import type { ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { getChartImageRasterSize, type ChartImageRasterOutput } from '../lib/chartImageRasterSize'
import './saveComparisonChartImage.css'

const SVG_IMAGE_STYLES = [
  'fill', 'fill-opacity', 'stroke', 'stroke-opacity', 'stroke-width',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin',
  'font-family', 'font-size', 'font-weight', 'letter-spacing', 'text-anchor',
  'dominant-baseline', 'vector-effect', 'opacity',
] as const

async function waitForLayout(host: HTMLElement, surface: HTMLElement): Promise<void> {
  let previousSize = ''
  let stableFrames = 0
  // Responsive charts can need several renders to fit their caption and dense table rows.
  for (let frame = 0; frame < 30; frame += 1) {
    // Hidden tabs can suspend animation frames during export preparation.
    await new Promise<void>((resolve) => {
      const finish = () => {
        window.cancelAnimationFrame(animationFrame)
        window.clearTimeout(timer)
        resolve()
      }
      const animationFrame = window.requestAnimationFrame(finish)
      const timer = window.setTimeout(finish, 100)
    })
    if (surface.scrollWidth > surface.clientWidth) host.style.width = `${surface.scrollWidth}px`
    const bounds = surface.getBoundingClientRect()
    const size = `${bounds.width}:${bounds.height}:${surface.scrollWidth}:${surface.scrollHeight}`
    stableFrames = size === previousSize ? stableFrames + 1 : 0
    if (stableFrames >= 3) return
    previousSize = size
  }
  throw new Error('グラフのサイズ調整が完了しませんでした。')
}

interface ComparisonChartImageSource {
  chart: ReactNode
  width?: number
  output?: ChartImageRasterOutput
}

export async function withComparisonChartImageSurface<T>({
  chart,
  width = 1120,
  output,
}: ComparisonChartImageSource, capture: (surface: HTMLElement, size: {
  width: number
  height: number
  canvasWidth: number
  canvasHeight: number
}) => Promise<T>): Promise<T> {
  const host = document.createElement('div')
  host.className = 'comparison-chart-image-host'
  host.inert = true
  host.setAttribute('aria-hidden', 'true')
  host.style.width = `${Number.isFinite(width) ? Math.max(320, Math.ceil(width)) : 1120}px`
  document.body.appendChild(host)
  let root: Root | null = null
  try {
    root = createRoot(host)
    const exportRoot = root
    flushSync(() => exportRoot.render(
      <div className="comparison-chart-image-surface">{chart}</div>,
    ))

    await document.fonts.ready
    const surface = host.querySelector<HTMLElement>('.comparison-chart-image-surface')
    if (!surface) throw new Error('保存するグラフを表示できませんでした。')

    await waitForLayout(host, surface)
    const bounds = surface.getBoundingClientRect()
    const imageWidth = Math.ceil(Math.max(bounds.width, surface.scrollWidth))
    const imageHeight = Math.ceil(Math.max(bounds.height, surface.scrollHeight))
    if (imageWidth <= 0 || imageHeight <= 0) throw new Error('保存するグラフの大きさを取得できませんでした。')

    const raster = getChartImageRasterSize({ width: imageWidth, height: imageHeight }, output)
    // html-to-image deep-clones SVG without copying its children's stylesheet rules.
    // Inline their appearance only on this temporary export, preserving the on-page chart.
    for (const element of surface.querySelectorAll<SVGElement>('svg *')) {
      const appearance = getComputedStyle(element)
      for (const property of SVG_IMAGE_STYLES) {
        element.style.setProperty(property, appearance.getPropertyValue(property))
      }
    }
    return await capture(surface, {
      width: imageWidth,
      height: imageHeight,
      canvasWidth: raster.width,
      canvasHeight: raster.height,
    })
  } finally {
    try {
      root?.unmount()
    } finally {
      host.remove()
    }
  }
}

export async function saveComparisonChartImage({
  filename,
  writeBlob,
  validateLayout,
  ...source
}: ComparisonChartImageSource & {
  filename: string
  writeBlob?: (blob: Blob) => Promise<void>
  validateLayout?: (size: { width: number; height: number }) => void
}): Promise<void> {
  const blob = await withComparisonChartImageSurface(source, async (surface, size) => {
    validateLayout?.(size)
    const { toBlob } = await import('html-to-image')
    return toBlob(surface, { ...size, pixelRatio: 1, backgroundColor: '#fff', skipFonts: true })
  })
  if (!blob) throw new Error('グラフのPNG画像を作成できませんでした。')

  const imageUrl = URL.createObjectURL(blob)
  let downloadStarted = false
  try {
    const image = new Image()
    image.src = imageUrl
    await image.decode()
    if (image.naturalWidth === 0 || image.naturalHeight === 0) {
      throw new Error('作成したPNG画像を確認できませんでした。')
    }

    if (writeBlob) {
      await writeBlob(blob)
      return
    }

    const anchor = document.createElement('a')
    anchor.href = imageUrl
    anchor.download = /\.png$/i.test(filename) ? filename : `${filename}.png`
    anchor.hidden = true
    document.body.appendChild(anchor)
    try {
      anchor.click()
      downloadStarted = true
    } finally {
      anchor.remove()
    }
  } finally {
    if (downloadStarted) window.setTimeout(() => URL.revokeObjectURL(imageUrl), 60_000)
    else URL.revokeObjectURL(imageUrl)
  }
}
