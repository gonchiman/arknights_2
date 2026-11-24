import { useId } from 'react'
import { getHpChartValueAxis } from '../lib/goldenglowTargetSwitchHpAxis'
import type { NormalQqPlot } from '../lib/normalQqPlot'
import { createScaleTicks, createValueScale } from '../lib/statisticsChartScale'

interface NormalQqPlotSvgProps {
  plot: NormalQqPlot
  width: number
  metricLabel: string
  unit?: string
}

const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })
const X_LABEL = '標準正規分布の理論分位'
const HEIGHT = 310

export function NormalQqPlotSvg({ plot: { points, reference }, width, metricLabel, unit }: NormalQqPlotSvgProps) {
  const id = useId()
  const first = points[0]
  const last = points.at(-1)
  if (!first || !last) return null

  const left = 56, right = width - 20, top = 30, bottom = HEIGHT - 54
  const xLimit = Math.max(1, Math.ceil(Math.max(-first.theoretical, last.theoretical)))
  const x = createValueScale(-xLimit, xLimit, left, right, 'LINEAR').position
  const xTicks = createScaleTicks(-xLimit, xLimit, 2 * xLimit + 1, 'LINEAR')
    .filter(tick => width >= 430 || xLimit <= 2 || tick % 2 === 0)
  // The shared axis treats an all-zero series as 0..1. Center it like other constant samples.
  const yValues = first.observed === 0 && last.observed === 0 ? [-1, 1] : [first.observed, last.observed]
  const yAxis = getHpChartValueAxis(yValues, { mode: 'auto' })
  const y = createValueScale(yAxis.lowerLimit, yAxis.upperLimit, bottom, top, 'LINEAR').position
  const yLabel = unit ? `${metricLabel}（${unit}）` : metricLabel

  return <svg className="numeric-distribution-svg is-qq" width={width} height={HEIGHT}
    viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-labelledby={`${id}-title`}
    aria-describedby={`${id}-description`} focusable="false">
    <title id={`${id}-title`}>{`${metricLabel}の正規Q–Qプロット`}</title>
    <desc id={`${id}-description`}>横軸は{X_LABEL}、縦軸は{yLabel}。{points.length}件のスキルを実測値の小さい順に表示します。
      {reference ? '破線は第1・第3四分位を通る基準線です。' : '第1・第3四分位が一致するため、基準線は表示しません。'}</desc>
    <defs><clipPath id={`${id}-clip`}><rect x={left} y={top} width={right - left} height={bottom - top} /></clipPath></defs>
    {yAxis.yTicks.map(tick => <g key={tick}>
      <line className="numeric-distribution-grid" x1={left} x2={right} y1={y(tick)} y2={y(tick)} />
      <text className="numeric-distribution-tick" x={left - 9} y={y(tick)} dy=".35em" textAnchor="end">{NUMBER.format(tick)}</text>
    </g>)}
    <line className="numeric-distribution-axis" x1={left} x2={left} y1={top} y2={bottom} />
    <line className="numeric-distribution-axis" x1={left} x2={right} y1={bottom} y2={bottom} />
    {xTicks.map(tick => <g key={tick}>
      <line className="numeric-distribution-axis" x1={x(tick)} x2={x(tick)} y1={bottom} y2={bottom + 5} />
      <text className="numeric-distribution-tick" x={x(tick)} y={bottom + 23} textAnchor="middle">{NUMBER.format(tick)}</text>
    </g>)}
    {reference && <line className="numeric-distribution-qq-reference" clipPath={`url(#${id}-clip)`}
      x1={left} x2={right} y1={y(reference.intercept - reference.slope * xLimit)} y2={y(reference.intercept + reference.slope * xLimit)} />}
    {points.map(point => <circle className="numeric-distribution-qq-point" key={point.theoretical}
      cx={x(point.theoretical)} cy={y(point.observed)} r={2.5} />)}
    <text className="numeric-distribution-label" x={left} y={15}>{yLabel}</text>
    <text className="numeric-distribution-label" x={(left + right) / 2} y={HEIGHT - 7} textAnchor="middle">{X_LABEL}</text>
  </svg>
}
