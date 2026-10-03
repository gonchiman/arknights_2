import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { getHpChartValueAxis } from '../lib/goldenglowTargetSwitchHpAxis'
import { getModuleColorKey } from '../lib/moduleColors'
import type { StatRankBand } from '../lib/statRankBands'
import { StatRankStrip } from './StatRankStrip'
import './GoldenglowTargetSwitchHpChart.css'
import './GoldenglowResistanceComparisonChart.css'
import './GroupedResistanceComparisonChart.css'

export interface GroupedResistanceComparisonPoint {
  groupValue: number
  resistance: number
  value: number | null
}

export interface GroupedResistanceComparisonSeries {
  id: string
  label: string
  color: string
  moduleType?: string | null
  potential?: number
  points: readonly GroupedResistanceComparisonPoint[]
}

export interface GroupedResistanceComparisonAxis {
  label: string
  formatValue: (value: number) => string
  minimum?: number
  rankBands?: readonly StatRankBand[]
  rankTitle?: string
  caption?: string
  regionLabel?: string
  dataAttribute?: 'data-enemy-hp' | 'data-ct'
}

export interface GroupedResistanceComparisonChartProps {
  series: readonly GroupedResistanceComparisonSeries[]
  groupValues: readonly number[]
  resistanceValues: readonly number[]
  groupAxis: GroupedResistanceComparisonAxis
  metric: 'total' | 'difference' | 'percent'
  baselineId: string
  hideBaseline?: boolean
  digits?: number
  selectedGroup: number | null
  selectedResistance: number | null
  onSelectPoint: (groupValue: number, resistance: number) => void
  stale?: boolean
  gridStyle?: 'none' | 'solid' | 'dashed'
  showMissingValues?: boolean
  missingValueLabel?: string
  showLegend?: boolean
  showReadout?: boolean
}

export type GroupedResistanceComparisonChartSvgProps = Omit<GroupedResistanceComparisonChartProps,
  'selectedGroup' | 'selectedResistance' | 'onSelectPoint' | 'stale'> & { width: number; height: number }

const pointKey = (groupValue: number, resistance: number) => `${groupValue}:${resistance}`
const uniqueSorted = (values: readonly number[], minimum: number, maximum = Infinity) => (
  [...new Set(values)].filter((value) => Number.isFinite(value) && value >= minimum && value <= maximum).sort((a, b) => a - b)
)

/** Keep bar depth and legend order stable, including when the requested baseline is hidden. */
export function getGroupedResistanceChartSeries<T extends { id: string; moduleType?: string | null }>(
  series: readonly T[], hideBaseline = false, baselineId = '',
) {
  const order = ['none', 'X', 'Y', 'D', 'A', 'B', 'unknown']
  return series.map((item, originalIndex) => ({ ...item, originalIndex }))
    .filter((item) => !hideBaseline || item.id !== baselineId)
    .sort((a, b) => order.indexOf(getModuleColorKey(a.moduleType)) - order.indexOf(getModuleColorKey(b.moduleType))
      || a.originalIndex - b.originalIndex)
}

export function GroupedResistanceComparisonChart(props: GroupedResistanceComparisonChartProps) {
  return <GroupedResistanceChartContent {...props} />
}

export function GroupedResistanceComparisonChartSvg({ width, height, ...props }: GroupedResistanceComparisonChartSvgProps) {
  return <GroupedResistanceChartContent {...props} selectedGroup={null} selectedResistance={null}
    onSelectPoint={() => undefined} dimensions={{ width, height }} />
}

function GroupedResistanceChartContent({ series, groupValues, resistanceValues, groupAxis, metric, baselineId,
  hideBaseline = false, digits = 0, selectedGroup, selectedResistance, onSelectPoint, stale = false,
  gridStyle = 'none', showMissingValues = false, missingValueLabel = '—', showLegend = true, showReadout = true,
  dimensions,
}: GroupedResistanceComparisonChartProps & { dimensions?: { width: number; height: number } }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [measuredWidth, setMeasuredWidth] = useState(900)
  const [hovered, setHovered] = useState<{ group: number; resistance: number } | null>(null)
  const titleId = useId()
  const groupSelectionId = useId()
  const resistanceSelectionId = useId()
  const groups = useMemo(() => uniqueSorted(groupValues, groupAxis.minimum ?? 0), [groupValues, groupAxis.minimum])
  const resistances = useMemo(() => uniqueSorted(resistanceValues, 0, 100), [resistanceValues])
  const chartSeries = useMemo(() => getGroupedResistanceChartSeries(series, hideBaseline, baselineId).map((item) => ({
    ...item,
    pointsByKey: new Map(item.points.map((point) => [pointKey(point.groupValue, point.resistance), point])),
  })), [series, hideBaseline, baselineId])
  const valueFormat = useMemo(() => new Intl.NumberFormat('ja-JP', {
    maximumFractionDigits: digits,
    signDisplay: metric === 'total' ? 'auto' : 'exceptZero',
  }), [digits, metric])
  const formatValue = (value: number | null | undefined) => value == null || !Number.isFinite(value)
    ? missingValueLabel : `${valueFormat.format(value)}${metric === 'percent' ? '%' : ''}`
  const metricLabel = metric === 'total' ? '総ダメージ' : metric === 'difference' ? 'ダメージ差' : '増加率 (%)'
  const validValue = (value: number | null | undefined): value is number => (
    value != null && Number.isFinite(value) && (metric !== 'total' || value >= 0)
  )
  const values = chartSeries.flatMap((item) => groups.flatMap((group) => resistances.flatMap((resistance) => {
    const value = item.pointsByKey.get(pointKey(group, resistance))?.value
    return validValue(value) ? [value] : []
  })))
  const axis = getHpChartValueAxis(values, { mode: 'zero', nonNegative: metric === 'total' })
  const tickPrecision = Math.max(0, -Math.floor(Math.log10(axis.valueStep)))
  const tickFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: Math.min(20, tickPrecision) })
  const width = dimensions?.width ?? Math.max(measuredWidth, 620, groups.length * (resistances.length * 22 + 18) + 84)
  const height = dimensions?.height ?? 380
  const rankBands = groupAxis.rankBands ?? []
  const tickWidth = Math.max(1, ...axis.yTicks.map((tick) => tickFormat.format(tick).length)) * 6.5
  const margin = { left: Math.max(60, tickWidth + 12), right: 12, top: rankBands.length ? 61 : 32, bottom: dimensions ? 48 : 70 }
  const plotWidth = Math.max(1, width - margin.left - margin.right)
  const groupWidth = plotWidth / Math.max(1, groups.length)
  const groupInnerWidth = groupWidth * 0.87
  const cellWidth = groupInnerWidth / Math.max(1, resistances.length)
  const rotateResLabels = cellWidth < 19
  if (rotateResLabels) margin.bottom += 12
  const plotBottom = height - margin.bottom
  const plotHeight = Math.max(1, plotBottom - margin.top)
  const plotRight = width - margin.right
  const x = (groupIndex: number, resIndex: number) => margin.left + groupIndex * groupWidth
    + (groupWidth - groupInnerWidth) / 2 + (resIndex + 0.5) * cellWidth
  const y = (value: number) => plotBottom - (value - axis.lowerLimit) / (axis.upperLimit - axis.lowerLimit) * plotHeight
  const zeroY = y(0)
  const barWidth = Math.min(22, cellWidth * 0.8 / (1 + Math.max(0, chartSeries.length - 1) * 0.42))
  const offset = barWidth * 0.42
  const barGroupWidth = barWidth + offset * Math.max(0, chartSeries.length - 1)
  const selected = !dimensions && selectedGroup !== null && selectedResistance !== null
    && groups.includes(selectedGroup) && resistances.includes(selectedResistance)
    ? { group: selectedGroup, resistance: selectedResistance } : null
  const active = !dimensions && hovered && groups.includes(hovered.group) && resistances.includes(hovered.resistance) ? hovered : selected
  const cellDetail = (group: number, resistance: number) => `${groupAxis.label} ${groupAxis.formatValue(group)}・術耐性 ${resistance}・${chartSeries.map((item) => (
    `${item.label} ${formatValue(item.pointsByKey.get(pointKey(group, resistance))?.value)}`
  )).join('・')}`
  const groupLabelStride = Math.max(1, Math.ceil(Math.max(1, ...groups.map((group) => groupAxis.formatValue(group).length)) * 7.3 / groupWidth))
  const resLabelStride = Math.max(1, Math.ceil((rotateResLabels ? 11 : 19) / cellWidth))

  useEffect(() => {
    if (dimensions) return
    const frame = frameRef.current
    if (!frame) return
    const measure = () => setMeasuredWidth(Math.max(1, frame.clientWidth))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [dimensions])

  const plot = <svg className="gg-resistance-chart-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`}
    role={dimensions ? 'img' : 'group'} aria-labelledby={titleId}>
    <title id={titleId}>{`${groupAxis.label}・術耐性別の${metricLabel}。同じ術耐性の棒はMODごとにずらして重ねています。`}</title>
    <text className="ggs-hp-chart-axis-title" x={margin.left} y={18}>{metricLabel}</text>
    <StatRankStrip bands={rankBands} left={margin.left} right={plotRight} top={margin.top - 28}
      titleY={margin.top - 36} labelFit="band" title={groupAxis.rankTitle} />
    {axis.yTicks.map((tick) => <g key={tick}>
      {gridStyle !== 'none' && <line className={`ggs-hp-chart-grid${gridStyle === 'dashed' ? ' ggs-hp-chart-grid--dashed' : ''}`}
        x1={margin.left} x2={plotRight} y1={y(tick)} y2={y(tick)} />}
      <text className="ggs-hp-chart-tick" x={margin.left - 8} y={y(tick) + 4} textAnchor="end">{tickFormat.format(tick)}</text>
    </g>)}
    {groups.slice(1).map((group, index) => <line key={group} className="gg-resistance-chart-divider"
      x1={margin.left + (index + 1) * groupWidth} x2={margin.left + (index + 1) * groupWidth}
      y1={margin.top} y2={plotBottom} />)}
    <path className="ggs-hp-chart-axis" d={`M${margin.left},${margin.top}V${plotBottom}H${plotRight}`} />
    {axis.lowerLimit < 0 && <line className="ggs-hp-chart-axis" x1={margin.left} x2={plotRight} y1={zeroY} y2={zeroY} />}
    {active && <rect className="ggs-hp-chart-selected-group"
      x={x(groups.indexOf(active.group), resistances.indexOf(active.resistance)) - cellWidth / 2}
      y={margin.top} width={cellWidth} height={plotHeight} />}
    {groups.map((group, groupIndex) => <g key={group} data-group-value={group}
      {...(groupAxis.dataAttribute ? { [groupAxis.dataAttribute]: group } : {})}>
      {resistances.map((resistance, resIndex) => <g key={resistance} data-enemy-resistance={resistance}>
        {chartSeries.map((item, seriesIndex) => {
          const value = item.pointsByKey.get(pointKey(group, resistance))?.value
          if (!validValue(value)) return null
          return <rect key={item.id} className="gg-resistance-chart-bar" data-series-id={item.id}
            data-value={value} data-chart-image-ink="true" fill={item.color}
            x={x(groupIndex, resIndex) - barGroupWidth / 2 + seriesIndex * offset}
            y={Math.min(zeroY, y(value))} width={barWidth} height={Math.abs(y(value) - zeroY)} />
        })}
        {showMissingValues && chartSeries.map((item, seriesIndex) => {
          const value = item.pointsByKey.get(pointKey(group, resistance))?.value
          if (validValue(value)) return null
          return <text key={item.id} className="grouped-resistance-chart-missing" data-series-id={item.id}
            data-missing="true" data-chart-image-ink="true" textAnchor="middle"
            x={x(groupIndex, resIndex) - barGroupWidth / 2 + seriesIndex * offset + barWidth / 2} y={zeroY - 6}>
            <title>{`${groupAxis.label} ${groupAxis.formatValue(group)}・術耐性 ${resistance}・${item.label} ${missingValueLabel}`}</title>—
          </text>
        })}
        {resIndex % resLabelStride === 0 && <text className="ggs-hp-chart-tick" x={x(groupIndex, resIndex)}
          y={plotBottom + 17} textAnchor={rotateResLabels ? 'end' : 'middle'}
          transform={rotateResLabels ? `rotate(-90 ${x(groupIndex, resIndex)} ${plotBottom + 10})` : undefined}>
          {resistance}
        </text>}
        {!dimensions && <rect className="gg-resistance-chart-hit" role="button" tabIndex={0}
          aria-label={cellDetail(group, resistance)} aria-pressed={selected?.group === group && selected.resistance === resistance}
          x={x(groupIndex, resIndex) - cellWidth / 2} y={margin.top} width={cellWidth} height={plotHeight + 24}
          onPointerEnter={() => setHovered({ group, resistance })} onPointerLeave={() => setHovered(null)}
          onFocus={() => setHovered({ group, resistance })} onBlur={() => setHovered(null)}
          onClick={() => onSelectPoint(group, resistance)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectPoint(group, resistance) }
          }}><title>{cellDetail(group, resistance)}</title></rect>}
      </g>)}
      {groupIndex % groupLabelStride === 0 && <text className="gg-resistance-chart-hp" data-chart-image-ink="true"
        x={margin.left + (groupIndex + 0.5) * groupWidth}
        y={plotBottom + (rotateResLabels ? 44 : 38)} textAnchor="middle">{groupAxis.formatValue(group)}</text>}
    </g>)}
    {!dimensions && <text className="ggs-hp-chart-axis-title" x={margin.left + plotWidth / 2} y={height - 6}
      textAnchor="middle">{groupAxis.caption ?? `${groupAxis.label}（棒の下の数字：術耐性）`}</text>}
  </svg>

  if (dimensions) return plot
  return <figure className={`gg-resistance-chart${stale ? ' gg-resistance-chart--stale' : ''}`}>
    {showLegend && <ul className="ggs-hp-chart-legend" aria-label="比較するMOD">
      {chartSeries.map((item) => <li key={item.id}>
        <svg width="24" height="12" aria-hidden="true"><rect x="7" y="1" width="10" height="10" fill={item.color} /></svg>
        <span>{item.label}{metric !== 'total' && item.id === baselineId ? '（基準）' : ''}</span>
      </li>)}
    </ul>}
    <div ref={frameRef} className="gg-resistance-chart-scroll" role="region"
      aria-label={groupAxis.regionLabel ?? `${groupAxis.label}・術耐性比較グラフ`} tabIndex={0}>{plot}</div>
    {showReadout && <figcaption className="ggs-hp-chart-readout">
      <label htmlFor={groupSelectionId}><span>{groupAxis.label}</span>
        <select id={groupSelectionId} value={active?.group ?? ''} disabled={!groups.length || !resistances.length}
          onChange={(event) => { setHovered(null); onSelectPoint(Number(event.target.value), active?.resistance ?? resistances[0]) }}>
          <option value="" disabled>選択</option>
          {groups.map((group) => <option key={group} value={group}>{groupAxis.formatValue(group)}</option>)}
        </select>
      </label>
      <label htmlFor={resistanceSelectionId}><span>術耐性</span>
        <select id={resistanceSelectionId} value={active?.resistance ?? ''} disabled={!groups.length || !resistances.length}
          onChange={(event) => { setHovered(null); onSelectPoint(active?.group ?? groups[0], Number(event.target.value)) }}>
          <option value="" disabled>選択</option>
          {resistances.map((resistance) => <option key={resistance} value={resistance}>{resistance}</option>)}
        </select>
      </label>
      <div className="ggs-hp-chart-values" aria-live="polite" aria-atomic="true">
        {chartSeries.map((item) => <span className="ggs-hp-chart-damage" key={item.id}>
          <span>{item.label}</span>
          <strong style={{ color: item.color }}>{formatValue(active ? item.pointsByKey.get(pointKey(active.group, active.resistance))?.value : null)}</strong>
        </span>)}
      </div>
    </figcaption>}
  </figure>
}
