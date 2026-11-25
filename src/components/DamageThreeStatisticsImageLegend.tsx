export function DamageThreeStatisticsImageLegend({ items, label = '凡例' }: {
  items: readonly { series: string; label: string }[]
  label?: string
}) {
  return <ul className="chart-image-frame-legend-list dc3-stat-image-series" aria-label={label}>
    {items.map(({ series, label }) => <li key={series} className="chart-image-frame-legend-item">
      <svg className="chart-image-frame-legend-swatch" width="18" height="12" aria-hidden="true">
        <rect data-series={series} x="4" y="1" width="10" height="10" fill="currentColor" />
      </svg>
      {label}
    </li>)}
  </ul>
}
