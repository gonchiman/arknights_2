import type { ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import './saveComparisonChartImage.css'

const MAX_IMAGE_PIXELS = 32_000_000
const MAX_IMAGE_SIDE = 16_000
const SVG_IMAGE_STYLES = [
  'fill', 'fill-opacity', 'stroke', 'stroke-opacity', 'stroke-width',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin',
  'font-family', 'font-size', 'font-weight', 'letter-spacing', 'text-anchor',
  'dominant-baseline', 'vector-effect', 'opacity',
] as const

const waitForLayout = () => new Promise<void>((resolve) => {
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()))
})

export async function saveComparisonChartImage({
  chart,
  filename,
  width = 1120,
}: {
  chart: ReactNode
  filename: string
  width?: number
}): Promise<void> {
  const host = document.createElement('div')
  host.className = 'comparison-chart-image-host'
  host.inert = true
  host.setAttribute('aria-hidden', 'true')
  host.style.width = `${Number.isFinite(width) ? Math.max(320, Math.ceil(width)) : 1120}px`
  document.body.appendChild(host)
  let root: Root | null = null
  let imageUrl: string | null = null
  let downloadStarted = false

  try {
    root = createRoot(host)
    const exportRoot = root
    flushSync(() => exportRoot.render(
      <div className="comparison-chart-image-surface">{chart}</div>,
    ))

    await document.fonts.ready
    await waitForLayout()
    const surface = host.querySelector<HTMLElement>('.comparison-chart-image-surface')
    if (!surface) throw new Error('保存するグラフを表示できませんでした。')

    // Let wide tables determine the full export size instead of capturing a scroll viewport.
    if (surface.scrollWidth > surface.clientWidth) {
      host.style.width = `${surface.scrollWidth}px`
      await waitForLayout()
    }
    const bounds = surface.getBoundingClientRect()
    const imageWidth = Math.ceil(Math.max(bounds.width, surface.scrollWidth))
    const imageHeight = Math.ceil(Math.max(bounds.height, surface.scrollHeight))
    if (imageWidth <= 0 || imageHeight <= 0) throw new Error('保存するグラフの大きさを取得できませんでした。')

    const pixelRatio = Math.min(
      2,
      MAX_IMAGE_SIDE / imageWidth,
      MAX_IMAGE_SIDE / imageHeight,
      Math.sqrt(MAX_IMAGE_PIXELS / imageWidth / imageHeight),
    )
    // html-to-image deep-clones SVG without copying its children's stylesheet rules.
    // Inline their appearance only on this temporary export, preserving the on-page chart.
    for (const element of surface.querySelectorAll<SVGElement>('svg *')) {
      const appearance = getComputedStyle(element)
      for (const property of SVG_IMAGE_STYLES) {
        element.style.setProperty(property, appearance.getPropertyValue(property))
      }
    }
    const { toBlob } = await import('html-to-image')
    const blob = await toBlob(surface, {
      width: imageWidth,
      height: imageHeight,
      pixelRatio,
      backgroundColor: '#fff',
      skipFonts: true,
    })
    if (!blob) throw new Error('グラフのPNG画像を作成できませんでした。')

    imageUrl = URL.createObjectURL(blob)
    const image = new Image()
    image.src = imageUrl
    await image.decode()
    if (image.naturalWidth === 0 || image.naturalHeight === 0) {
      throw new Error('作成したPNG画像を確認できませんでした。')
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
    try {
      root?.unmount()
    } finally {
      host.remove()
      if (imageUrl) {
        const url = imageUrl
        if (downloadStarted) window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
        else URL.revokeObjectURL(url)
      }
    }
  }
}
