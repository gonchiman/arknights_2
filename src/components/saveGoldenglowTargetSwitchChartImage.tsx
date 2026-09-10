import { saveComparisonChartImage } from './saveComparisonChartImage'
import './saveGoldenglowTargetSwitchChartImage.css'

const SVG_APPEARANCE = [
  'fill', 'fill-opacity', 'stroke', 'stroke-opacity', 'stroke-width',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin',
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant-numeric',
  'letter-spacing', 'text-anchor', 'dominant-baseline', 'vector-effect', 'opacity',
] as const

interface ChartImageOptions {
  svg: SVGSVGElement
  chartType: 'bar' | 'line'
  series: readonly { resistance: number; color: string; dash?: string }[]
  filename: string
}

export async function saveGoldenglowTargetSwitchChartImage({
  svg, chartType, series, filename,
}: ChartImageOptions): Promise<void> {
  const { width, height } = svg.viewBox.baseVal
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('保存するグラフの大きさを取得できませんでした。')
  }

  // Capture the current plot before any asynchronous export work or further UI changes.
  // Its viewBox includes bars outside the horizontal scroll viewport.
  const snapshot = svg.cloneNode(true) as SVGSVGElement
  const sources = [svg, ...svg.querySelectorAll<SVGElement>('*')]
  const copies = [snapshot, ...snapshot.querySelectorAll<SVGElement>('*')]
  sources.forEach((source, index) => {
    const copy = copies[index]
    const appearance = getComputedStyle(source)
    for (const property of SVG_APPEARANCE) {
      copy.style.setProperty(property, appearance.getPropertyValue(property))
    }
    copy.classList.remove('selected')
    copy.removeAttribute('tabindex')
    copy.removeAttribute('aria-describedby')
    copy.removeAttribute('aria-labelledby')
    if (copy.getAttribute('role') === 'button') copy.removeAttribute('role')
    for (const attribute of [...copy.attributes]) {
      if (/^on/i.test(attribute.name)) copy.removeAttribute(attribute.name)
    }
  })
  snapshot.querySelectorAll('.ggs-chart-point-target, .ggs-chart-bar-target').forEach((target) => target.remove())
  snapshot.querySelectorAll<SVGCircleElement>('.ggs-chart-point-dot').forEach((point) => {
    point.setAttribute('r', '3')
    point.setAttribute('fill', '#fff')
    point.style.fill = '#fff'
  })
  snapshot.setAttribute('width', String(width))
  snapshot.setAttribute('height', String(height))
  snapshot.setAttribute('role', 'img')
  snapshot.setAttribute('aria-label', 'スキル総ダメージ期待値')
  snapshot.style.display = 'block'
  snapshot.style.width = '100%'
  snapshot.style.maxWidth = 'none'
  snapshot.style.height = 'auto'
  snapshot.style.overflow = 'visible'
  const markup = snapshot.outerHTML

  await saveComparisonChartImage({
    filename,
    width: Math.max(320, width + 48),
    chart: <section className="ggs-chart-image">
      <header className="ggs-chart-image-heading">
        <h1>スキル総ダメージ期待値</h1>
      </header>
      <div className="ggs-chart-image-legend">
        <strong>術耐性</strong>
        <ul>
          {series.map(({ resistance, color, dash }) => <li key={resistance}>
            <svg viewBox={`0 0 ${chartType === 'bar' ? 18 : 28} 12`} width={chartType === 'bar' ? 18 : 28} height="12" aria-hidden="true">
              {chartType === 'bar'
                ? <rect x="0" y="1" width="18" height="10" fill={color} />
                : <line x1="0" x2="28" y1="6" y2="6" stroke={color} strokeWidth="2.5" strokeDasharray={dash} />}
            </svg>
            <span>{resistance}</span>
          </li>)}
        </ul>
      </div>
      {/* Only the application's own SVG is serialized; user-provided text is rendered by React. */}
      <div className="ggs-chart-image-plot" dangerouslySetInnerHTML={{ __html: markup }} />
    </section>,
  })
}
