import { NumericScatterChart, type NumericScatterPoint } from './NumericScatterChart'
import './SkillDpsAnalysisChart.css'

export type SkillDpsChartPoint = NumericScatterPoint

interface Props {
  points: readonly SkillDpsChartPoint[]
  xLabel: string
  yLabel: string
  fit: { slope: number; intercept: number } | null
  showFit: boolean
  imageSize?: { width: number; height: number }
}

/** Preserve the DPS chart's existing axes, marks, legend and export presentation. */
export function SkillDpsAnalysisChart(props: Props) {
  return <NumericScatterChart {...props} pointMode="overplot" appearance="skill-dps" />
}
