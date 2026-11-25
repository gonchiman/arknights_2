import { useMemo } from 'react'
import { getHpChartValueAxis } from '../lib/goldenglowTargetSwitchHpAxis'
import type { SkillDpsCombinationModel } from '../lib/skillDpsMultipleRegression'
import { NumericScatterChart, type NumericScatterPoint } from './NumericScatterChart'
import './SkillDpsCombinationChart.css'

interface Props {
  models: readonly SkillDpsCombinationModel[]
  visibleModels: readonly SkillDpsCombinationModel[]
  bestAdjustedRSquared: number
  differenceLimit: number | null
}

interface Highlight {
  bestFit: boolean
  lowestVif: boolean
}

const COUNT = new Intl.NumberFormat('ja-JP')
const X_LABEL = '首位との差（pt）'
const Y_LABEL = '最大VIF'

function equalWithinRounding(first: number, second: number) {
  return Math.abs(first - second) <= Number.EPSILON * 8 * Math.max(1, Math.abs(first), Math.abs(second))
}

function HighlightMark({ x, y, bestFit, lowestVif }: Highlight & { x: number; y: number }) {
  const squareRadius = bestFit ? 3 : 4.5
  return <>
    {bestFit && <path className="skill-dps-combination-chart-best"
      d={`M ${x} ${y - 7} L ${x + 7} ${y} L ${x} ${y + 7} L ${x - 7} ${y} Z`} />}
    {lowestVif && <rect className="skill-dps-combination-chart-lowest"
      x={x - squareRadius} y={y - squareRadius} width={squareRadius * 2} height={squareRadius * 2} />}
  </>
}

export function SkillDpsCombinationChart({ models, visibleModels, bestAdjustedRSquared, differenceLimit }: Props) {
  const axes = useMemo(() => {
    const x = differenceLimit === null
      ? getHpChartValueAxis([0.05, ...models.map(model => (bestAdjustedRSquared - model.adjustedRSquared) * 100)])
      : getHpChartValueAxis([], { mode: 'manual', manualRange: { min: 0, max: differenceLimit } })
    const y = getHpChartValueAxis([2, ...models.map(model => model.maxVif)])
    return { x, y: { ...y, lowerLimit: 1, yTicks: [1, ...y.yTicks.filter(tick => tick > 1)] } }
  }, [models, bestAdjustedRSquared, differenceLimit])

  const { points, highlights, hasBestFit } = useMemo(() => {
    const minimumVisibleVif = Math.min(...visibleModels.map(model => model.maxVif))
    const ordinaryPoints: NumericScatterPoint[] = []
    const highlightedPoints: NumericScatterPoint[] = []
    const highlights = new Map<string, Highlight>()
    for (const model of visibleModels) {
      const id = model.predictors.join(',')
      const point = { id, x: (bestAdjustedRSquared - model.adjustedRSquared) * 100, y: model.maxVif }
      const bestFit = equalWithinRounding(bestAdjustedRSquared, model.adjustedRSquared)
      const lowestVif = equalWithinRounding(minimumVisibleVif, model.maxVif)
      if (bestFit || lowestVif) {
        highlights.set(id, { bestFit, lowestVif })
        highlightedPoints.push(point)
      } else {
        ordinaryPoints.push(point)
      }
    }
    return {
      points: [...ordinaryPoints, ...highlightedPoints], highlights,
      hasBestFit: [...highlights.values()].some(highlight => highlight.bestFit),
    }
  }, [visibleModels, bestAdjustedRSquared])

  if (!points.length) return <p className="numeric-scatter-chart-empty" role="status">
    {models.length ? '条件に合う組み合わせなし' : '計算可能な組み合わせなし'}
  </p>

  return <div className="skill-dps-combination-chart">
    <div className="skill-dps-toolbar skill-dps-combination-chart-header">
      <span role="status">{COUNT.format(points.length)}通り</span>
      <ul className="skill-dps-combination-chart-legend" aria-label="凡例">
        {hasBestFit && <li><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <HighlightMark x={8} y={8} bestFit lowestVif={false} />
        </svg>調整済みR²首位</li>}
        <li><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <HighlightMark x={8} y={8} bestFit={false} lowestVif />
        </svg>表示内で最大VIFが最小</li>
      </ul>
    </div>
    <NumericScatterChart
      points={points} xLabel={X_LABEL} yLabel={Y_LABEL} pointMode="overplot" axes={axes} showLegend={false}
      description={`横軸は${X_LABEL}、縦軸は${Y_LABEL}。表示中の${COUNT.format(points.length)}通りを点で表示します。${hasBestFit ? 'ひし形は調整済みR²首位です。' : ''}四角は表示内で最大VIFが最小の組み合わせです。`}
      renderPoint={(point, x, y) => {
        const highlight = highlights.get(point.id)
        return highlight ? <HighlightMark x={x} y={y} {...highlight} /> : null
      }}
    />
  </div>
}
