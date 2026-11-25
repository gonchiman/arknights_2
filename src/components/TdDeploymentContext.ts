import { createContext, useContext } from 'react'
import type { TdDirection, TdPlacedOperator } from '../lib/tdDeployment'
import type { TdDeployOperator } from '../lib/tdDeploymentRoster'

interface TdDeploymentBoardState {
  placements: readonly TdPlacedOperator[]
  selectedOperator: TdDeployOperator | null
  targeting: 'place' | 'move' | null
  editing: boolean
  facing: boolean
  actions?: {
    selectOperator: (operator: TdDeployOperator, mode: 'move' | 'edit') => void
    selectDestination: (row: number, col: number) => void
    setDirection: (direction: TdDirection) => void
  }
}

export const TdDeploymentContext = createContext<TdDeploymentBoardState | null>(null)
export const useTdDeployment = () => useContext(TdDeploymentContext)
