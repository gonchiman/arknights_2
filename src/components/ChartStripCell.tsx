import './ChartStripCell.css'

export const CHART_STRIP_CELL_HEIGHT = 24

export interface ChartStripCellProps {
  left: number
  width: number
  top: number
  label: string
  leftInset?: number
  rightInset?: number
  height?: number
  showLabel?: boolean
  labelY?: number
  labelRotation?: 0 | -90
  fillClassName?: string
  labelClassName?: string
}

/** The shared cell used by rank and histogram annotation strips. */
export function ChartStripCell({ left, width, top, label, leftInset = 0, rightInset = 0,
  height = CHART_STRIP_CELL_HEIGHT, showLabel = true, labelY = top + 16, labelRotation = 0,
  fillClassName = 'chart-strip-fill', labelClassName = 'chart-strip-label' }: ChartStripCellProps) {
  const center = left + width / 2
  return <>
    <rect className={fillClassName} data-chart-image-ink="true" x={left + leftInset} y={top}
      width={Math.max(0, width - leftInset - rightInset)} height={height} fillOpacity={0.06} />
    <rect x={left} y={top} width={width} height={height} fill="transparent" />
    {showLabel && <text className={labelClassName} data-chart-image-ink="true"
      x={center} y={labelY} textAnchor="middle"
      dominantBaseline={labelRotation ? 'central' : undefined}
      transform={labelRotation ? `rotate(${labelRotation} ${center} ${labelY})` : undefined}>{label}</text>}
  </>
}