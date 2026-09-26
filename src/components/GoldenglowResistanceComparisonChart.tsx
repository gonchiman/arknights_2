import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ResistanceComparisonDisplaySeries } from '../lib/goldenglowResistanceComparison'
import type { HpComparisonMetric } from '../lib/goldenglowTargetSwitchHpComparison'
import { getHpChartValueAxis } from '../lib/goldenglowTargetSwitchHpAxis'
import { getHpRankBands } from '../lib/hpRankBands'
import { getModuleColorKey } from '../lib/moduleColors'
import { getHpComparisonSeriesStyles, type HpChartGridStyle } from './GoldenglowTargetSwitchHpChart'
import './GoldenglowResistanceComparisonChart.css'

export interface ResistanceComparisonChartProps {
  series: readonly ResistanceComparisonDisplaySeries[]
  enemyHps: readonly number[]
  enemyResistances: readonly number[]
  metric: HpComparisonMetric
  baselineId: string
  hideBaseline?: boolean
  digits?: number
  selectedHp: number | null
  selectedResistance: number | null
  onSelectPoint: (hp: number, resistance: number) => void
  stale?: boolean
  showHpRanks?: boolean
  gridStyle?: HpChartGridStyle
}

type SvgProps = Omit<ResistanceComparisonChartProps, 'selectedHp' | 'selectedResistance' | 'onSelectPoint' | 'stale'> & {
  width: number
  height: number
}

const integerFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })
const pointKey = (hp: number, resistance: number) => `${hp}:${resistance}`
const uniqueSorted = (values: readonly number[], minimum: number, maximum = Infinity) => (
  [...new Set(values)].filter((value) => Number.isFinite(value) && value >= minimum && value <= maximum).sort((a, b) => a - b)
)

/** Keep bar depth and legend order stable, including when the requested baseline is hidden. */
export function getResistanceChartSeries(series: readonly ResistanceComparisonDisplaySeries[], hideBaseline = false, baselineId = '') {
  const styles = getHpComparisonSeriesStyles(series)
  const order = ['none', 'X', 'Y', 'D', 'A', 'B', 'unknown']
  return series.map((item, index) => ({ ...item, style: styles[index], originalIndex: index }))
    .filter((item) => !hideBaseline || item.id !== baselineId)
    .sort((a, b) => order.indexOf(getModuleColorKey(a.moduleType)) - order.indexOf(getModuleColorKey(b.moduleType))
      || a.originalIndex - b.originalIndex)
}

export function GoldenglowResistanceComparisonChart(props: ResistanceComparisonChartProps) {
  return <ResistanceChartContent {...props} />
}

export function GoldenglowResistanceComparisonChartSvg({ width, height, ...props }: SvgProps) {
  return <ResistanceChartContent {...props} selectedHp={null} selectedResistance={null}
    onSelectPoint={() => undefined} dimensions={{ width, height }} />
}

function ResistanceChartContent({ series, enemyHps, enemyResistances, metric, baselineId,
  hideBaseline = false, digits = 0, selectedHp, selectedResistance, onSelectPoint, stale = false,
  showHpRanks = true, gridStyle = 'none', dimensions,
}: ResistanceComparisonChartProps & { dimensions?: { width: number; height: number } }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [measuredWidth, setMeasuredWidth] = useState(900)
  const [hovered, setHovered] = useState<{ hp: number; resistance: number } | null>(null)
  const titleId = useId()
  const hpSelectionId = useId()
  const resistanceSelectionId = useId()
  const hps = useMemo(() => uniqueSorted(enemyHps, Number.MIN_VALUE), [enemyHps])
  const resistances = useMemo(() => uniqueSorted(enemyResistances, 0, 100), [enemyResistances])
  const chartSeries = useMemo(() => getResistanceChartSeries(series, hideBaseline, baselineId).map((item) => ({
    ...item,
    pointsByKey: new Map(item.points.map((point) => [pointKey(point.enemyHp, point.enemyResistance), point])),
  })), [series, hideBaseline, baselineId])
  const valueFormat = useMemo(() => new Intl.NumberFormat('ja-JP', {
    maximumFractionDigits: digits,
    signDisplay: metric === 'total' ? 'auto' : 'exceptZero',
  }), [digits, metric])
  const formatValue = (value: number | null | undefined) => value == null || !Number.isFinite(value)
    ? '—' : `${valueFormat.format(value)}${metric === 'percent' ? '%' : ''}`
  const metricLabel = metric === 'total' ? '総ダメージ' : metric === 'difference' ? 'ダメージ差' : '増加率 (%)'
  const validValue = (value: number | null | undefined): value is number => (
    value != null && Number.isFinite(value) && (metric !== 'total' || value >= 0)
  )
  const values = chartSeries.flatMap((item) => hps.flatMap((hp) => resistances.flatMap((resistance) => {
    const value = item.pointsByKey.get(pointKey(hp, resistance))?.value
    return validValue(value) ? [value] : []
  })))
  const axis = getHpChartValueAxis(values, { mode: 'zero', nonNegative: metric === 'total' })
  const tickPrecision = Math.max(0, -Math.floor(Math.log10(axis.valueStep)))
  const tickFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: Math.min(20, tickPrecision) })
  const width = dimensions?.width ?? Math.max(measuredWidth, 620, hps.length * (resistances.length * 22 + 18) + 84)
  const height = dimensions?.height ?? 380
  const rankBands = showHpRanks && hps.length ? getHpRankBands({
    chartKind: 'bar', minHp: hps[0], maxHp: hps.at(-1)!, barHps: hps,
  }) : []
  const tickWidth = Math.max(1, ...axis.yTicks.map((tick) => tickFormat.format(tick).length)) * 6.5
  const margin = { left: Math.max(60, tickWidth + 12), right: 12, top: rankBands.length ? 61 : 32, bottom: dimensions ? 48 : 70 }
  const plotWidth = Math.max(1, width - margin.left - margin.right)
  const groupWidth = plotWidth / Math.max(1, hps.length)
  const groupInnerWidth = groupWidth * 0.87
  const cellWidth = groupInnerWidth / Math.max(1, resistances.length)
  const rotateResLabels = cellWidth < 19
  if (rotateResLabels) margin.bottom += 12
  const plotBottom = height - margin.bottom
  const plotHeight = Math.max(1, plotBottom - margin.top)
  const plotRight = width - margin.right
  const x = (hpIndex: number, resIndex: number) => margin.left + hpIndex * groupWidth
    + (groupWidth - groupInnerWidth) / 2 + (resIndex + 0.5) * cellWidth
  const y = (value: number) => plotBottom - (value - axis.lowerLimit) / (axis.upperLimit - axis.lowerLimit) * plotHeight
  const zeroY = y(0)
  const barWidth = Math.min(22, cellWidth * 0.8 / (1 + Math.max(0, chartSeries.length - 1) * 0.42))
  const offset = barWidth * 0.42
  const barGroupWidth = barWidth + offset * Math.max(0, chartSeries.length - 1)
  const selected = !dimensions && selectedHp !== null && selectedResistance !== null
    && hps.includes(selectedHp) && resistances.includes(selectedResistance)
    ? { hp: selectedHp, resistance: selectedResistance } : null
  const active = !dimensions && hovered && hps.includes(hovered.hp) && resistances.includes(hovered.resistance) ? hovered : selected
  const cellDetail = (hp: number, resistance: number) => `敵HP ${integerFormat.format(hp)}・術耐性 ${resistance}・${chartSeries.map((item) => (
    `${item.label} ${formatValue(item.pointsByKey.get(pointKey(hp, resistance))?.value)}`
  )).join('・')}`
  const hpLabelStride = Math.max(1, Math.ceil(Math.max(1, ...hps.map((hp) => integerFormat.format(hp).length)) * 7.3 / groupWidth))
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
    <title id={titleId}>敵HP・術耐性別の{metricLabel}。同じ術耐性の棒はMODごとにずらして重ねています。</title>
    <text className="ggs-hp-chart-axis-title" x={margin.left} y={18}>{metricLabel}</text>
    {rankBands.length > 0 && <text className="gg-resistance-chart-rank-title" x={plotRight}
      y={margin.top - 36} textAnchor="end">HPランク</text>}
    {rankBands.map((band, index) => {
      const left = margin.left + band.start * plotWidth
      const bandWidth = (band.end - band.start) * plotWidth
      return <g key={`${band.rating}-${band.start}`} data-rank={band.rating}>
        <title>{`HPランク ${band.rating}：${band.label}`}</title>
        <rect className="ggs-hp-rank-fill" x={left + (index ? 1.5 : 0)} y={margin.top - 28}
          width={Math.max(0, bandWidth - (index ? 1.5 : 0) - (index < rankBands.length - 1 ? 1.5 : 0))}
          height={24} fillOpacity={0.06} />
        {bandWidth > band.rating.length * 7 + 6 && <text className="ggs-hp-rank-label" x={left + bandWidth / 2}
          y={margin.top - 12} textAnchor="middle">{band.rating}</text>}
      </g>
    })}
    {axis.yTicks.map((tick) => <g key={tick}>
      {gridStyle !== 'none' && <line className={`ggs-hp-chart-grid${gridStyle === 'dashed' ? ' ggs-hp-chart-grid--dashed' : ''}`}
        x1={margin.left} x2={plotRight} y1={y(tick)} y2={y(tick)} />}
      <text className="ggs-hp-chart-tick" x={margin.left - 8} y={y(tick) + 4} textAnchor="end">{tickFormat.format(tick)}</text>
    </g>)}
    {hps.slice(1).map((hp, index) => <line key={hp} className="gg-resistance-chart-divider"
      x1={margin.left + (index + 1) * groupWidth} x2={margin.left + (index + 1) * groupWidth}
      y1={margin.top} y2={plotBottom} />)}
    <path className="ggs-hp-chart-axis" d={`M${margin.left},${margin.top}V${plotBottom}H${plotRight}`} />
    {axis.lowerLimit < 0 && <line className="ggs-hp-chart-axis" x1={margin.left} x2={plotRight} y1={zeroY} y2={zeroY} />}
    {active && <rect className="ggs-hp-chart-selected-group"
      x={x(hps.indexOf(active.hp), resistances.indexOf(active.resistance)) - cellWidth / 2}
      y={margin.top} width={cellWidth} height={plotHeight} />}
    {hps.map((hp, hpIndex) => <g key={hp} data-enemy-hp={hp}>
      {resistances.map((resistance, resIndex) => <g key={resistance} data-enemy-resistance={resistance}>
        {chartSeries.map((item, seriesIndex) => {
          const value = item.pointsByKey.get(pointKey(hp, resistance))?.value
          if (!validValue(value)) return null
          return <rect key={item.id} className="gg-resistance-chart-bar" data-series-id={item.id}
            data-value={value} fill={item.style.color} x={x(hpIndex, resIndex) - barGroupWidth / 2 + seriesIndex * offset}
            y={Math.min(zeroY, y(value))} width={barWidth} height={Math.abs(y(value) - zeroY)} />
        })}
        {resIndex % resLabelStride === 0 && <text className="ggs-hp-chart-tick" x={x(hpIndex, resIndex)}
          y={plotBottom + 17} textAnchor={rotateResLabels ? 'end' : 'middle'}
          transform={rotateResLabels ? `rotate(-90 ${x(hpIndex, resIndex)} ${plotBottom + 10})` : undefined}>
          {resistance}
        </text>}
        {!dimensions && <rect className="gg-resistance-chart-hit" role="button" tabIndex={0}
          aria-label={cellDetail(hp, resistance)} aria-pressed={selected?.hp === hp && selected.resistance === resistance}
          x={x(hpIndex, resIndex) - cellWidth / 2} y={margin.top} width={cellWidth} height={plotHeight + 24}
          onPointerEnter={() => setHovered({ hp, resistance })} onPointerLeave={() => setHovered(null)}
          onFocus={() => setHovered({ hp, resistance })} onBlur={() => setHovered(null)}
          onClick={() => onSelectPoint(hp, resistance)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectPoint(hp, resistance) }
          }}><title>{cellDetail(hp, resistance)}</title></rect>}
      </g>)}
      {hpIndex % hpLabelStride === 0 && <text className="gg-resistance-chart-hp" x={margin.left + (hpIndex + 0.5) * groupWidth}
        y={plotBottom + (rotateResLabels ? 44 : 38)} textAnchor="middle">{integerFormat.format(hp)}</text>}
    </g>)}
    {!dimensions && <text className="ggs-hp-chart-axis-title" x={margin.left + plotWidth / 2} y={height - 6}
      textAnchor="middle">敵HP（棒の下の数字：術耐性）</text>}
  </svg>

  if (dimensions) return plot
  return <figure className={`gg-resistance-chart${stale ? ' gg-resistance-chart--stale' : ''}`}>
    <ul className="ggs-hp-chart-legend" aria-label="比較するMOD">
      {chartSeries.map((item) => <li key={item.id}>
        <svg width="24" height="12" aria-hidden="true"><rect x="7" y="1" width="10" height="10" fill={item.style.color} /></svg>
        <span>{item.label}{metric !== 'total' && item.id === baselineId ? '（基準）' : ''}</span>
      </li>)}
    </ul>
    <div ref={frameRef} className="gg-resistance-chart-scroll" role="region" aria-label="HP・術耐性比較グラフ" tabIndex={0}>{plot}</div>
    <figcaption className="ggs-hp-chart-readout">
      <label htmlFor={hpSelectionId}><span>敵HP</span>
        <select id={hpSelectionId} value={active?.hp ?? ''} disabled={!hps.length || !resistances.length}
          onChange={(event) => { setHovered(null); onSelectPoint(Number(event.target.value), active?.resistance ?? resistances[0]) }}>
          <option value="" disabled>選択</option>
          {hps.map((hp) => <option key={hp} value={hp}>{integerFormat.format(hp)}</option>)}
        </select>
      </label>
      <label htmlFor={resistanceSelectionId}><span>術耐性</span>
        <select id={resistanceSelectionId} value={active?.resistance ?? ''} disabled={!hps.length || !resistances.length}
          onChange={(event) => { setHovered(null); onSelectPoint(active?.hp ?? hps[0], Number(event.target.value)) }}>
          <option value="" disabled>選択</option>
          {resistances.map((resistance) => <option key={resistance} value={resistance}>{resistance}</option>)}
        </select>
      </label>
      <div className="ggs-hp-chart-values" aria-live="polite" aria-atomic="true">
        {chartSeries.map((item) => <span className="ggs-hp-chart-damage" key={item.id}>
          <span>{item.label}</span>
          <strong style={{ color: item.style.color }}>{formatValue(active ? item.pointsByKey.get(pointKey(active.hp, active.resistance))?.value : null)}</strong>
        </span>)}
      </div>
    </figcaption>
  </figure>
}
