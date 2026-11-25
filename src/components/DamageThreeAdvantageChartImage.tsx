import { ADVANTAGE_LEGEND, ADVANTAGE_OUTCOMES, getAdvantageChartBar } from '../lib/damageThreeAdvantageChart'
import type { AdvantageUnit, SkillRankStatistics } from '../lib/damageThreeSkillRankStatistics'
import { DamageThreeStatisticsImageLegend } from './DamageThreeStatisticsImageLegend'
import './DamageThreeSkillRankStatisticsChart.css'

export { getAdvantageChartAxisTitle } from '../lib/damageThreeAdvantageChart'

const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })

export function DamageThreeAdvantageImageLegend() {
  return <>
    <strong>{ADVANTAGE_LEGEND}</strong>
    <DamageThreeStatisticsImageLegend items={ADVANTAGE_OUTCOMES} label={ADVANTAGE_LEGEND} />
  </>
}

export function DamageThreeAdvantageChartImage({ rows, advantageUnit, width, height }: {
  rows: readonly SkillRankStatistics[]
  advantageUnit: AdvantageUnit
  width: number
  height: number
}) {
  const resistanceX = 46
  const defenseX = 122
  const countX = 208
  const plotLeft = countX + 18
  const plotRight = width - 18
  const plotWidth = plotRight - plotLeft
  const plotTop = 32
  const plotBottom = height - 4
  const rowHeight = (plotBottom - plotTop) / Math.max(1, rows.length)
  const barHeight = rowHeight * 0.56

  return <svg className="dc3-stat-image-series" width={width} height={height}
    viewBox={`0 0 ${width} ${height}`} role="img" aria-label="術耐性別の属性別の優勢率"
    fontSize="11" fill="#555" style={{ fontVariantNumeric: 'tabular-nums' }}>
    <g textAnchor="end" fontWeight="700">
      <text x={resistanceX} y="21">術耐性</text>
      <text x={defenseX} y="21">対応防御力</text>
      <text x={countX} y="21">{advantageUnit === 'skill' ? '有効スキル数' : '有効段階数'}</text>
    </g>
    {[0, 50, 100].map(tick => {
      const x = plotLeft + plotWidth * tick / 100
      return <g key={tick}>
        <text x={x} y="21" textAnchor="middle">{tick}%</text>
        <line x1={x} y1={plotTop} x2={x} y2={plotBottom} stroke="#ddd" />
      </g>
    })}
    <line x1="0" y1={plotTop} x2={plotRight} y2={plotTop} stroke="#ddd" />
    {rows.map((row, index) => {
      const bar = getAdvantageChartBar(row, advantageUnit)
      const centerY = plotTop + (index + 0.5) * rowHeight
      const bottom = plotTop + (index + 1) * rowHeight
      return <g key={row.resistance} data-resistance={row.resistance}>
        <g textAnchor="end" dominantBaseline="central">
          <text x={resistanceX} y={centerY}>{row.resistance}</text>
          <text x={defenseX} y={centerY}>{row.defense === null ? '—' : NUMBER.format(row.defense)}</text>
          <text x={countX} y={centerY}>{NUMBER.format(bar?.count ?? 0)}</text>
        </g>
        {bar ? bar.segments.map(({ series, start, fraction }) => fraction > 0 && <rect key={series} data-series={series}
          x={plotLeft + start * plotWidth} y={centerY - barHeight / 2}
          width={fraction * plotWidth} height={barHeight} fill="currentColor" />)
          : <text x={plotLeft + 6} y={centerY} dominantBaseline="central">対象なし</text>}
        <line x1="0" y1={bottom} x2={plotRight} y2={bottom} stroke="#e8e8e8" />
      </g>
    })}
  </svg>
}
