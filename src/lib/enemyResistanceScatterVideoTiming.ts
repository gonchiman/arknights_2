import type { ChartVideoTimingDefinition } from './enemyRatingVideoTiming.ts'

export type EnemyResistanceScatterVideoPhase = 'title' | 'frame' | 'axes' | 'points' | 'notes'

const WEIGHTS: ChartVideoTimingDefinition<EnemyResistanceScatterVideoPhase>['weights'] = {
  title: .38,
  frame: .34,
  axes: .34,
  points: 2.46,
  notes: .125,
}

const WITHOUT_NOTES: ChartVideoTimingDefinition<EnemyResistanceScatterVideoPhase> = {
  phases: ['title', 'frame', 'axes', 'points'],
  weights: WEIGHTS,
}

const WITH_NOTES: ChartVideoTimingDefinition<EnemyResistanceScatterVideoPhase> = {
  phases: [...WITHOUT_NOTES.phases, 'notes'],
  weights: WEIGHTS,
}

export function getEnemyResistanceScatterVideoDefinition(hasMissing: boolean) {
  return hasMissing ? WITH_NOTES : WITHOUT_NOTES
}
