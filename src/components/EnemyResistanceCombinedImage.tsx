import { useCallback, type ReactNode } from 'react'
import type { EnemyResistanceThreshold } from '../lib/enemyDefenseResistance'
import { ComparisonTableImageFrame } from './ComparisonTableImageFrame'
import { EnemyResistanceThresholdScatter } from './EnemyResistanceThresholdScatter'
import './EnemyResistanceCombinedImage.css'

export const ENEMY_RESISTANCE_COMBINED_CHART_HEIGHT = 400
const PANEL_GAP = 20

export function EnemyResistanceCombinedImage({ width, height, rows, table, onLayout, onLayoutError }: {
  width: number
  height: number
  rows: readonly EnemyResistanceThreshold[]
  table: ReactNode
  onLayout?: (size: { width: number; height: number }) => void
  onLayoutError?: (cause: unknown) => void
}) {
  const tableWidth = Math.floor((width - PANEL_GAP) * 0.4)
  const verifyTableLayout = useCallback((size: { width: number; height: number }) => {
    if (size.width !== tableWidth || size.height !== height) {
      onLayoutError?.(new Error('散布図の右側に表全体を収められませんでした。'))
      return
    }
    onLayout?.(size)
  }, [height, onLayout, onLayoutError, tableWidth])

  return <div className="enemy-resistance-combined-image" style={{
    columnGap: PANEL_GAP, gridTemplateColumns: `minmax(0, 1fr) ${tableWidth}px`,
  }}>
    <EnemyResistanceThresholdScatter rows={rows} imageHeight={height} showXAxisTitle showMissingCaption={false} />
    <ComparisonTableImageFrame initialWidth={tableWidth} minimumHeight={height}
      onLayout={verifyTableLayout} onLayoutError={onLayoutError} ariaLabel="術耐性別の防御力対応表">
      {table}
    </ComparisonTableImageFrame>
  </div>
}
