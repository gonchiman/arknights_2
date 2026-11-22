import type { BarChartBin, BarChartHighlightTarget } from '../lib/barChartDocument'

interface BarChartHighlightTargetsProps {
  bins: readonly BarChartBin[]
  onToggle: (id: string, target?: BarChartHighlightTarget) => void
  target?: BarChartHighlightTarget
  bounds: (index: number) => { x: number; y: number; width: number; height: number }
}

/** Full slots remain clickable when a bar has zero height or a missing value. */
export function BarChartHighlightTargets({ bins, onToggle, target, bounds }: BarChartHighlightTargetsProps) {
  return <g aria-hidden="true">
    {bins.map((bin, index) => <rect key={bin.id} className="bar-chart-highlight-target" {...bounds(index)}
      data-bar-chart-hit={bin.id} data-bar-chart-hit-side={target} onClick={() => onToggle(bin.id, target)} />)}
  </g>
}
