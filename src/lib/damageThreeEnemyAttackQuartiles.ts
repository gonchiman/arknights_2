import { calculateBoxPlotStatistics } from './enemyStatistics.ts'

export interface EnemyAttackQuartileStage {
  key: string
  finalAttack: number | null
  physicalRate: number
}

export interface EnemyAttackQuartileRow {
  label: string
  minAttack: number | null
  maxAttack: number | null
  stageCount: number
  meanPhysicalRate: number | null
}

export interface EnemyAttackQuartileStatistics {
  includedStageCount: number
  excludedStageCount: number
  rows: EnemyAttackQuartileRow[]
}

export function summarizeEnemyAttackQuartiles(stages: readonly EnemyAttackQuartileStage[]): EnemyAttackQuartileStatistics {
  const rows: EnemyAttackQuartileRow[] = ['下位25%', '25～50%', '50～75%', '上位25%'].map(label =>
    ({ label, minAttack: null, maxAttack: null, stageCount: 0, meanPhysicalRate: null }))
  const attacks = stages.flatMap(({ finalAttack }) => finalAttack === null ? [] : [finalAttack])
  const quartiles = calculateBoxPlotStatistics(attacks)
  if (quartiles) {
    const upperBounds = [quartiles.firstQuartile, quartiles.median, quartiles.thirdQuartile, Infinity]
    const rateSums = [0, 0, 0, 0]
    for (const { finalAttack, physicalRate } of stages) {
      if (finalAttack === null) continue
      const index = upperBounds.findIndex(upper => finalAttack <= upper)
      const row = rows[index]
      row.minAttack = Math.min(row.minAttack ?? finalAttack, finalAttack)
      row.maxAttack = Math.max(row.maxAttack ?? finalAttack, finalAttack)
      row.stageCount++
      rateSums[index] += physicalRate
    }
    rows.forEach((row, index) => {
      if (row.stageCount) row.meanPhysicalRate = rateSums[index] / row.stageCount
    })
  }
  return { includedStageCount: attacks.length, excludedStageCount: stages.length - attacks.length, rows }
}

export function projectEnemyAttackQuartiles(
  savedStages: readonly EnemyAttackQuartileStage[], filteredEntries: readonly { key: string }[],
): EnemyAttackQuartileStatistics {
  const keys = new Set(filteredEntries.map(entry => entry.key))
  return summarizeEnemyAttackQuartiles(savedStages.filter(stage => keys.has(stage.key)))
}
