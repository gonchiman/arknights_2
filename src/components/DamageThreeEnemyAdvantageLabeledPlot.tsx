import { ADVANTAGE_OUTCOMES, DAMAGE_THREE_STATISTIC_COLORS } from '../lib/damageThreeAdvantageChart'
import type { EnemySpawnAdvantageRow } from '../lib/damageThreeEnemySpawnAdvantage'
import type { AdvantageUnit } from '../lib/damageThreeSkillRankStatistics'
import { formatAdvantagePercentage } from './DamageThreeSkillRankStatisticsTable'

export const ENEMY_ADVANTAGE_LABELED_PLOT_HEIGHT = 190

export function DamageThreeEnemyAdvantageLabeledPlot({ row, unit, width, height }: {
  row: EnemySpawnAdvantageRow
  unit: AdvantageUnit
  width: number
  height: number
}) {
  const votes = row[unit]
  if (!votes.count) {
    return <svg width={width} height={height} role="img" aria-label="対象なし">
      <text x="50%" y="50%" textAnchor="middle">対象なし</text>
    </svg>
  }

  const left = width * 0.055
  const right = width - left
  const barWidth = right - left
  const barHeight = Math.min(96, Math.max(40, height * 0.19))
  const barTop = (height - barHeight) / 2 + 24
  const valueFontSize = Math.min(36, barWidth / 20)
  const labelFontSize = valueFontSize * 0.52
  const valueY = barTop - 16
  const nameY = valueY - valueFontSize - 2
  // Reserve space for the widest value, including at 0% and 100% boundaries.
  const labelSpacing = valueFontSize * 4.3
  let nextLabelX = left + labelSpacing / 2
  let precedingVotes = 0
  const segments = ADVANTAGE_OUTCOMES.map(({ key, series, label }, index) => {
    const start = left + precedingVotes / votes.count * barWidth
    precedingVotes += votes[key]
    const end = left + precedingVotes / votes.count * barWidth
    const center = (start + end) / 2
    const lastLabelX = right - (ADVANTAGE_OUTCOMES.length - index - 0.5) * labelSpacing
    const labelX = Math.min(lastLabelX, Math.max(nextLabelX, center))
    nextLabelX = labelX + labelSpacing
    return { series, label, start, end, center, labelX, value: formatAdvantagePercentage(votes[key], votes.count) }
  })

  return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
    role="img" aria-label="出現回数で重み付けした属性別の優勢率" fill="#333" textAnchor="middle"
    style={{ fontVariantNumeric: 'tabular-nums' }}>
    <desc>{segments.map(segment => `${segment.label} ${segment.value}%`).join('、')}</desc>
    {segments.map(({ series, label, start, end, center, labelX, value }) =>
      <g key={series} aria-hidden="true">
        <rect data-series={series} x={start} y={barTop} width={end - start} height={barHeight}
          fill={DAMAGE_THREE_STATISTIC_COLORS[series]} />
        {Math.abs(labelX - center) > 1 && <line x1={labelX} y1={valueY + 5} x2={center} y2={barTop - 1} stroke="#888" />}
        <text x={labelX} y={nameY} fontSize={labelFontSize}>{label}</text>
        <text x={labelX} y={valueY} fontSize={valueFontSize} fontWeight="600">{value}%</text>
      </g>)}
    <g aria-hidden="true" fontSize="12" fill="#555">
      <text x={left} y={barTop + barHeight + 19} textAnchor="start">0%</text>
      <text x={right} y={barTop + barHeight + 19} textAnchor="end">100%</text>
    </g>
  </svg>
}
