import type { MapDetail } from '../types/map.ts'
import type { TdDeployOperator } from './tdDeploymentRoster.ts'

export const TD_DIRECTIONS = {
  up: { arrow: '↑', label: '上' }, right: { arrow: '→', label: '右' },
  down: { arrow: '↓', label: '下' }, left: { arrow: '←', label: '左' },
} as const
export type TdDirection = keyof typeof TD_DIRECTIONS

export interface TdPlacedOperator {
  operator: TdDeployOperator
  /** Indices into the terrain grid, starting at the top left. */
  row: number
  col: number
  direction: TdDirection
}

export function canDeployAt(detail: MapDetail, operator: TdDeployOperator, row: number, col: number) {
  const index = detail.grid[row]?.[col]
  const type = index == null ? undefined : detail.tiles[index]?.buildableType
  if (type === 'ALL') return true
  return (type === 'MELEE' || type === 'RANGED') && (operator.position === 'ALL' || operator.position === type)
}

export function canPlaceTdOperatorAt(detail: MapDetail, placements: readonly TdPlacedOperator[],
  operator: TdDeployOperator, row: number, col: number) {
  return canDeployAt(detail, operator, row, col) && !placements.some(unit => unit.row === row && unit.col === col)
}

export function placeTdOperator(detail: MapDetail, placements: readonly TdPlacedOperator[], next: TdPlacedOperator) {
  if (!canDeployAt(detail, next.operator, next.row, next.col)) return placements
  if (placements.some(p => p.row === next.row && p.col === next.col && p.operator.id !== next.operator.id)) return placements
  if (placements.some(p => p.operator.id === next.operator.id)) {
    return placements.map(p => p.operator.id === next.operator.id ? next : p)
  }
  return [...placements, next]
}
