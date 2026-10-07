import { calculateSurtrRemnantAttacks, type SurtrRemnantAttackAssumptions } from '../lib/surtrRemnantAttacks'
import type { SurtrRemnantChartSeries, SurtrRemnantCountEndpoint, SurtrRemnantCountInterval } from '../lib/surtrRemnantChart'

interface StepSeries {
  item: SurtrRemnantChartSeries
  intervals: readonly SurtrRemnantCountInterval[]
  endpoints: readonly SurtrRemnantCountEndpoint[]
}

interface Props {
  data: readonly StepSeries[]
  assumptions: SurtrRemnantAttackAssumptions
  height: number
  left: number
  right: number
  ctDomain: number
  xTicks: readonly number[]
  hatchId: string
  activeCt: number | null
  showBoundaries: boolean
  axisOverflow?: number
  seriesLines?: Record<string, string[]>
}

const epsilon = 1e-9
const formatCt = (ct: number) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 }).format(ct)
const exactCt = (ct: number) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 12 }).format(ct)
const boundaryCt = (ct: number) => `${Math.abs(ct - Number(ct.toFixed(3))) > Number.EPSILON * Math.max(1, Math.abs(ct)) * 2 ? '≈' : ''}${formatCt(ct)}`

/** C3: separate equipment rows, shared scales and labels beside the actual steps. */
export function SurtrRemnantStepPlot({ data, assumptions, height, left, right, ctDomain, xTicks,
  hatchId, activeCt, showBoundaries, axisOverflow = 0, seriesLines }: Props) {
  const counts = data.flatMap(({ intervals, endpoints }) => [...intervals, ...endpoints].map(value => value.count))
  const minimumY = Math.max(0, Math.min(...counts) - 1)
  const maximumY = Math.max(minimumY + 2, Math.max(...counts) + 1)
  const tickStep = maximumY - minimumY <= 4 ? 1 : Math.max(2, Math.ceil((maximumY - minimumY) / 4))
  const yTicks = Array.from({ length: Math.floor(maximumY / tickStep) + 1 }, (_, index) => index * tickStep)
    .filter(count => count >= minimumY)
  const labelOverflows = data.map(({ item }) => Math.max(0, (seriesLines?.[item.id]?.length ?? 1) - 1) * 14)
  const rowHeight = (height - 56 - axisOverflow - labelOverflows.reduce((sum, extra) => sum + extra, 0)) / data.length
  const x = (ct: number) => left + ct / ctDomain * (right - left)
  return <g className="surtr-remnant-step-rows">
    {data.map(({ item, intervals, endpoints }, index) => {
      const offset = 26 + axisOverflow + index * rowHeight + labelOverflows.slice(0, index).reduce((sum, extra) => sum + extra, 0)
      const nameLines = seriesLines?.[item.id] ?? [item.label]
      const top = offset + 34 + labelOverflows[index]
      const bottom = offset + rowHeight - 42 + labelOverflows[index]
      const y = (count: number) => bottom - 6 - (count - minimumY) / (maximumY - minimumY) * (bottom - top - 12)
      const limit = item.model.attackIntervalBefore
      const shorterDomain = limit < ctDomain - epsilon
      const labelY = bottom + 17
      const path = intervals.map((interval, intervalIndex) => `${intervalIndex ? `V${y(interval.count)}` : `M${x(interval.from)} ${y(interval.count)}`} H${x(interval.to)}`).join(' ')
      const mark = (ct: number, count: number, included: boolean) => <circle
        cx={x(ct)} cy={y(count)} r="3.5" stroke={item.color} strokeWidth="1.5"
        className={included ? 'surtr-remnant-attack-chart-point' : 'surtr-remnant-attack-chart-open-point'}
        fill={included ? item.color : undefined} data-chart-image-ink="true">
        <title>{`${item.label}・CT ${exactCt(ct)} s${included ? 'ちょうど' : 'ではこの回数を含まない'}・${count} 回`}</title>
      </circle>
      const boundaryLabels: { ct: number; x: number }[] = []
      for (const interval of intervals.slice(0, -1)) {
        const position = Math.max(left + 24, Math.min(right - 24, x(interval.to)))
        const previous = boundaryLabels.at(-1)
        if (!previous || position - previous.x >= 60) boundaryLabels.push({ ct: interval.to, x: position })
      }
      const activeCount = activeCt === null ? undefined : calculateSurtrRemnantAttacks(item.model, activeCt, assumptions)?.hitCount
      return <g key={item.id} data-step-series={item.id}>
        <line x1={left} x2={left + 20} y1={offset + 14} y2={offset + 14}
          stroke={item.color} strokeWidth="2.5" />
        <text className="surtr-remnant-step-row-name" x={left + 28} y={offset + 18}>
          {nameLines.length === 1 ? nameLines[0] : nameLines.map((line, lineIndex) =>
            <tspan key={lineIndex} x={left + 28} dy={lineIndex === 0 ? 0 : 14}>{line}</tspan>)}
        </text>
        {shorterDomain && <rect x={x(limit)} y={top} width={right - x(limit)} height={bottom - top}
          fill={`url(#${hatchId})`}><title>{`範囲外：最大残りCT ${exactCt(limit)} s`}</title></rect>}
        <rect className="surtr-remnant-step-frame" x={left} y={top} width={right - left} height={bottom - top} />
        {yTicks.map(count => <g key={count}>
          <line className="surtr-remnant-attack-chart-grid" x1={left} x2={right} y1={y(count)} y2={y(count)} />
          <text className="surtr-remnant-attack-chart-tick" x={left - 10} y={y(count) + 4} textAnchor="end">{count}</text>
        </g>)}
        <path className="surtr-remnant-attack-chart-axis" d={`M${left} ${top} V${bottom} H${right}`} />
        <path className="surtr-remnant-attack-chart-step" d={path} stroke={item.color} strokeWidth="2.5"
          data-chart-image-ink="true" />
        {intervals.map((interval, intervalIndex) => {
          const middle = (x(interval.from) + x(interval.to)) / 2
          const short = x(interval.to) - x(interval.from) < 42
          const labelX = short ? Math.max(left + 20, Math.min(right - 20, middle + (intervalIndex === 0 ? 28 : -28))) : middle
          const countY = y(interval.count) - (short ? 22 : 10)
          return <g key={interval.from}>
            {short && <path className="surtr-remnant-step-leader" d={`M${middle} ${y(interval.count) - 4} L${labelX} ${countY + 4}`} />}
            <text className="surtr-remnant-attack-chart-value" x={labelX} y={countY} textAnchor="middle"
              data-chart-image-ink="true">{interval.count}回</text>
          </g>
        })}
        {intervals.slice(0, -1).map((interval, boundaryIndex) => {
          const ct = interval.to
          const next = intervals[boundaryIndex + 1]
          const label = boundaryLabels.find(candidate => candidate.ct === ct)
          return <g key={ct}>
            {mark(ct, interval.count, interval.includeTo)}{mark(ct, next.count, next.includeFrom)}
            {showBoundaries && label && <>
              <line className="surtr-remnant-step-leader" x1={x(ct)} x2={x(ct)}
                y1={y(Math.min(interval.count, next.count)) + 5} y2={bottom + 3} />
              <text className="surtr-remnant-attack-chart-tick" x={label.x} y={labelY} textAnchor="middle"
                data-chart-image-ink="true">{boundaryCt(ct)}</text>
            </>}
          </g>
        })}
        {endpoints.map(({ ct, count }) => {
          const adjacent = ct === 0 ? intervals[0].count : intervals.at(-1)!.count
          return <g key={ct}>
            {count !== adjacent && <>{mark(ct, adjacent, false)}
              <text className="surtr-remnant-attack-chart-value" x={x(ct) + (ct === 0 ? 9 : -9)} y={y(count) - 12}
                textAnchor={ct === 0 ? 'start' : 'end'} data-chart-image-ink="true">{count}回</text></>}
            {mark(ct, count, true)}
          </g>
        })}
        {shorterDomain && <g data-step-domain-limit={limit}>
          <line className="surtr-remnant-step-leader" x1={x(limit)} x2={x(limit)} y1={bottom + 2} y2={bottom + 23} />
          <text className="surtr-remnant-step-limit" x={Math.max(left + 90, x(limit))} y={bottom + 35}
            textAnchor="end" data-chart-image-ink="true">最大CT {boundaryCt(limit)} s</text>
        </g>}
        {index === data.length - 1 && xTicks.map((ct, tickIndex) => <text key={ct}
          className="surtr-remnant-attack-chart-tick" x={x(ct)} y={height - 5}
          textAnchor={tickIndex === 0 ? 'start' : tickIndex === xTicks.length - 1 ? 'end' : 'middle'}>{formatCt(ct)}</text>)}
        {activeCt !== null && <g aria-hidden="true">
          <line className="surtr-remnant-attack-chart-guide" x1={x(activeCt)} x2={x(activeCt)} y1={top} y2={bottom} />
          {activeCount !== undefined && <circle cx={x(activeCt)} cy={y(activeCount)} r="6"
            fill="none" stroke={item.color} strokeWidth="1.75" />}
        </g>}
      </g>
    })}
  </g>
}
