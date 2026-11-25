import { DAMAGE_SERIES, damageBinLabel, describeDamageBin, type DamageThreeDistributionHistogram } from '../lib/damageThreeDistributionChart'
import { DamageThreeStatisticsImageLegend } from './DamageThreeStatisticsImageLegend'
import './DamageThreeSkillRankStatisticsChart.css'

const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })

export function DamageThreeDistributionImageLegend() {
  return <DamageThreeStatisticsImageLegend items={DAMAGE_SERIES} />
}

export function DamageThreeDistributionChartImage({ histogram, width, height }: {
  histogram: DamageThreeDistributionHistogram
  width: number
  height: number
}) {
  const { row, axis } = histogram
  const left = Math.max(36, NUMBER.format(axis.maximum).length * 7 + 12)
  const right = width - 8
  const top = 26
  const bottom = height - 25
  const plotHeight = bottom - top
  const slot = (right - left) / row.histogram.length
  const barWidth = slot * 0.38
  const groupWidth = 2 * barWidth + 2
  return <svg className="dc3-stat-image-series" width={width} height={height}
    viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`術耐性 ${row.resistance}のヒストグラム`}
    fontSize="11" fill="#555" style={{ fontVariantNumeric: 'tabular-nums' }}>
    <text x="0" y="12" fontWeight="700" fontSize="12" fill="#444">段階数</text>
    {axis.ticks.map(tick => {
      const y = bottom - tick / axis.maximum * plotHeight
      return <g key={tick}>
        <line x1={left} y1={y} x2={right} y2={y} stroke="#ddd" />
        <text x={left - 6} y={y} textAnchor="end" dominantBaseline="central">{NUMBER.format(tick)}</text>
      </g>
    })}
    {row.histogram.map((bin, index) => {
      const center = left + slot * (index + 0.5)
      return <g key={bin.lower} data-lower={bin.lower} role="img" aria-label={describeDamageBin(bin)}>
        {DAMAGE_SERIES.map(({ series }, seriesIndex) => {
          const barHeight = bin[series] / axis.maximum * plotHeight
          return <rect key={series} data-series={series} x={center - groupWidth / 2 + seriesIndex * (barWidth + 2)}
            y={bottom - barHeight} width={barWidth} height={barHeight} fill="currentColor" />
        })}
        <text x={center} y={bottom + 17} textAnchor="middle">{damageBinLabel(bin)}</text>
      </g>
    })}
  </svg>
}
