import { useState } from 'react'
import { createZeroBasedValueAxis } from '../lib/chartValueAxis'
import { formatHistogramPercentage } from '../lib/histogramPercentageLabels'
import {
  DamageCalculatorThreeAttributeChartImageDialog,
  type DamageCalculatorThreeAttributeChartImageSnapshot,
} from './DamageCalculatorThreeAttributeChartImageDialog'
import { OutputImageSaveButton } from './OutputImageSaveButton'
import './EnemySpawnCompositionChart.css'

interface ChartProps {
  title: string
  rows: readonly { label: string; count: number }[]
  totalCount: number
  maxCount: number
}

const number = new Intl.NumberFormat('ja-JP')

export function EnemySpawnCompositionChart({ title, rows, totalCount, maxCount }: ChartProps) {
  const axis = createZeroBasedValueAxis(maxCount)
  return <figure className="spawn-composition-chart" aria-label={title}>
    <div className="spawn-composition-chart-head" aria-hidden="true">
      <span>出現回数</span><span>構成比</span>
    </div>
    <ol aria-label={title}>
      {rows.map(row => <li key={row.label}>
        <span className="spawn-composition-chart-label">{row.label}</span>
        <span className="spawn-composition-chart-lane" aria-hidden="true">
          <span style={{ width: `${row.count / axis.maximum * 100}%` }} />
        </span>
        <span className="spawn-composition-chart-number">{number.format(row.count)}回</span>
        <span className="spawn-composition-chart-number">{formatHistogramPercentage(row.count, totalCount) ?? '—'}</span>
      </li>)}
    </ol>
    <div className="spawn-composition-chart-foot" aria-hidden="true">
      <div className="spawn-composition-chart-ticks">{axis.ticks.map(tick =>
        <span key={tick} style={{ left: `${tick / axis.maximum * 100}%` }}>{number.format(tick)}</span>)}
      </div>
    </div>
  </figure>
}

export function EnemySpawnCompositionImageButton({ conditions, filenameParts, parentLocation, ...chart }: ChartProps & {
  conditions: readonly string[]
  filenameParts: readonly string[]
  parentLocation: readonly string[]
}) {
  const [snapshot, setSnapshot] = useState<DamageCalculatorThreeAttributeChartImageSnapshot | null>(null)
  function openImage() {
    setSnapshot({
      title: chart.title,
      conditions,
      filenameParts,
      defaultAspect: { preset: '16:9', width: '16', height: '9' },
      outputWidth: 1920,
      naturalChartHeight: 60 + 34 * chart.rows.length,
      axisTitle: '出現回数（回）',
      legend: null,
      chart: ({ height }) => <div className="spawn-composition-chart-image" style={{ height }}>
        <EnemySpawnCompositionChart {...chart} />
      </div>,
    })
  }
  return <>
    <OutputImageSaveButton onClick={openImage} />
    {snapshot && <DamageCalculatorThreeAttributeChartImageDialog snapshot={snapshot} parentLocation={parentLocation}
      helpMode="none" onClose={() => setSnapshot(null)} />}
  </>
}
