import type { BarChartBin, BarChartHighlightTarget } from '../lib/barChartDocument'

interface BarChartHighlightTargetsProps {
  bins: readonly BarChartBin[]
  onToggle: (id: string, target?: BarChartHighlightTarget) => void
  target?: BarChartHighlightTarget
  describeButton?: (index: number) => { label: string; pressed: boolean }
  bounds: (index: number) => { x: number; y: number; width: number; height: number }
}

/** Full slots remain clickable when a bar has zero height or a missing value. */
export function BarChartHighlightTargets({ bins, onToggle, target, bounds, describeButton }: BarChartHighlightTargetsProps) {
  return <g aria-hidden={describeButton ? undefined : true}>
    {bins.map((bin, index) => {
      const button = describeButton?.(index)
      const toggle = () => onToggle(bin.id, target)
      return <rect key={bin.id} className="bar-chart-highlight-target" {...bounds(index)}
        role={button ? 'button' : undefined} tabIndex={button ? 0 : undefined} aria-label={button?.label}
        aria-pressed={button?.pressed} onKeyDown={button ? event => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          if (!event.repeat) toggle()
        } : undefined}
        data-bar-chart-hit={bin.id} data-bar-chart-hit-side={target} onClick={toggle} />
    })}
  </g>
}
