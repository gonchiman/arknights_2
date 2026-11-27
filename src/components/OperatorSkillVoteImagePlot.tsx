import { placeChartEndLabels } from '../lib/comparisonChartEndLabels'
import { ADVANTAGE_OUTCOMES, DAMAGE_THREE_STATISTIC_COLORS } from '../lib/damageThreeAdvantageChart'
import type { EnemyOperatorVoteSummary, EnemySkillVoteSummary } from '../lib/damageThreeEnemySpawnAdvantage'
import { wrapText } from '../lib/slideComposer'
import { formatAdvantagePercentage } from './DamageThreeSkillRankStatisticsTable'
import { estimatedBarChartTextWidth, useBarChartTextWidths } from './useBarChartTextWidths'

const FONT_SIZE = 15
const LINE_HEIGHT = 20
const BAR_HEIGHT = 34
const ROW_GAP = 18
const NAME_BAR_GAP = 5
const CALLOUT_HEIGHT = 23
const PADDING = 12
const VERTICAL_PADDING = 6

function skillNameLines(skill: EnemySkillVoteSummary, width: number) {
  const name = `S${skill.skillIndex} ${skill.skillName}`
  return wrapText({ font: '', measureText: text => ({ width: Array.from(text).length * FONT_SIZE }) }, name, width)
}

function skillSegments(skill: EnemySkillVoteSummary) {
  let start = 0
  return ADVANTAGE_OUTCOMES.map(({ key, label, series }) => {
    const fraction = skill.votes.count > 0 ? skill.votes[key] / skill.votes.count : 0
    const text = `${formatAdvantagePercentage(skill.votes[key], skill.votes.count)}%`
    const segment = { series, label, text, callout: `${label} ${text}`, start, fraction }
    start += fraction
    return segment
  })
}

function getVotePlotLayout(operator: EnemyOperatorVoteSummary, width: number, measure: (text: string) => number) {
  const left = PADDING
  const right = width - PADDING
  const barWidth = right - left
  const rows = operator.skills.map(skill => {
    const lines = skillNameLines(skill, barWidth)
    const marks = skillSegments(skill).map(segment => {
      const size = segment.fraction * barWidth
      const x = left + segment.start * barWidth
      return { ...segment, x, size, center: x + size / 2, inside: measure(segment.text) * FONT_SIZE / 11 + 8 <= size }
    })
    const outside = skill.votes.count > 0 ? marks.filter(mark => !mark.inside) : []
    const maxLabelWidth = Math.max(0, ...outside.map(mark => measure(mark.callout) * 12 / 11))
    // Use the same ordered endpoint placement as line charts, along the horizontal axis.
    const callouts = placeChartEndLabels(outside.map(mark => ({ id: mark.series, y: mark.center })),
      left + maxLabelWidth / 2, right - maxLabelWidth / 2, maxLabelWidth + 8)
    const calloutHeight = outside.length ? CALLOUT_HEIGHT : 0
    const rowHeight = lines.length * LINE_HEIGHT + NAME_BAR_GAP + BAR_HEIGHT + calloutHeight
    return { skill, lines, marks, callouts, rowHeight }
  })
  const gapHeight = Math.max(0, rows.length - 1) * ROW_GAP
  const contentHeight = rows.length ? rows.reduce((total, row) => total + row.rowHeight, gapHeight) : BAR_HEIGHT
  return { left, naturalHeight: contentHeight + 2 * VERTICAL_PADDING, rows }
}

export function getOperatorSkillVoteImageHeight(operator: EnemyOperatorVoteSummary) {
  // Reserve room for callouts before fonts load at the narrowest export width.
  return getVotePlotLayout(operator, 928, text => estimatedBarChartTextWidth(text) + 4).naturalHeight
}

export function OperatorSkillVoteImagePlot({ operator, width, height }: { operator: EnemyOperatorVoteSummary; width: number; height?: number }) {
  const labels = operator.skills.flatMap(skill => skillSegments(skill).flatMap(({ text, callout }) => [text, callout]))
  const measure = useBarChartTextWidths(labels)
  const { left, naturalHeight, rows } = getVotePlotLayout(operator, width, measure)
  const plotHeight = Math.max(height ?? naturalHeight, naturalHeight)
  const extraPerRow = (plotHeight - naturalHeight) / Math.max(1, rows.length)
  let top = VERTICAL_PADDING + extraPerRow / 2
  return <svg width={width} height={plotHeight} viewBox={`0 0 ${width} ${plotHeight}`}
    role="img" aria-label={`${operator.operatorName}のスキル別得票率`} fill="#333" fontSize={FONT_SIZE}
    fontWeight="600" style={{ fontVariantNumeric: 'tabular-nums' }}>
    <desc>{rows.map(({ skill, marks }) => `S${skill.skillIndex} ${skill.skillName}、${skill.votes.count > 0
      ? marks.map(mark => mark.callout).join('、') : '対象なし'}`).join('。')}</desc>
    {rows.length === 0 && <text x={left} y={plotHeight / 2} dominantBaseline="central">対象なし</text>}
    {rows.map(({ skill, lines, marks, callouts, rowHeight }) => {
      const firstNameY = top + LINE_HEIGHT / 2
      const barTop = top + lines.length * LINE_HEIGHT + NAME_BAR_GAP
      const centerY = barTop + BAR_HEIGHT / 2
      const barBottom = barTop + BAR_HEIGHT
      top += rowHeight + ROW_GAP + extraPerRow
      return <g key={skill.key} data-skill={skill.key} aria-hidden="true">
        <text dominantBaseline="central">{lines.map((line, index) =>
          <tspan key={index} x={left} y={firstNameY + index * LINE_HEIGHT}>{line}</tspan>)}</text>
        {skill.votes.count > 0 ? marks.map(mark => {
          const callout = callouts.find(item => item.id === mark.series)
          return <g key={mark.series} textAnchor="middle">
            <rect data-series={mark.series} x={mark.x} y={barTop} width={mark.size} height={BAR_HEIGHT}
              fill={DAMAGE_THREE_STATISTIC_COLORS[mark.series]} />
            {callout ? <>
              <line x1={mark.center} y1={barBottom} x2={callout.y} y2={barBottom + 7} stroke="#777" />
              <text x={callout.y} y={barBottom + 20} fontSize={12}>{mark.callout}</text>
            </> : <text x={mark.center} y={centerY} dominantBaseline="central"
              fill={mark.series === 'tie' ? '#222' : '#fff'}>{mark.text}</text>}
          </g>
        }) : <text x={left} y={centerY} dominantBaseline="central">対象なし</text>}
      </g>
    })}
  </svg>
}
