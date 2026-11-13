import type { RawOperatorModule, SkillRecord } from '../types/skill.ts'
import { COVERAGE_STATUS_LABELS, type DamageCalculatorThreeCoverageRow, type DamageCalculatorThreeCoverageStatus } from './damageCalculatorThreeCoverage.ts'
import { getOperatorModuleId, getOperatorModuleLevels, getOperatorModules } from './operatorModules.ts'

export const MODULE_COVERAGE_LEVELS = [1, 2, 3] as const
export const MODULE_COVERAGE_STATUSES = ['SUPPORTED', 'CONDITIONAL', 'PENDING', 'UNSTARTED', 'NOT_APPLICABLE'] as const

export type DamageCalculatorThreeModuleLevel = typeof MODULE_COVERAGE_LEVELS[number]
export type DamageCalculatorThreeModuleCoverageStatus = typeof MODULE_COVERAGE_STATUSES[number]

export const MODULE_COVERAGE_STATUS_LABELS = {
  SUPPORTED: COVERAGE_STATUS_LABELS.SUPPORTED,
  CONDITIONAL: COVERAGE_STATUS_LABELS.CONDITIONAL,
  PENDING: COVERAGE_STATUS_LABELS.PENDING,
  UNSTARTED: '未着手',
  NOT_APPLICABLE: COVERAGE_STATUS_LABELS.NOT_APPLICABLE,
} satisfies Record<DamageCalculatorThreeModuleCoverageStatus, string>

type ModuleCoverageRowId = `${string}:s${number}:${string}`
type ModuleCoverageStageId = `${ModuleCoverageRowId}:lv${DamageCalculatorThreeModuleLevel}`
type ModuleCoverageOverrides = Readonly<Partial<Record<ModuleCoverageStageId, DamageCalculatorThreeModuleCoverageStatus>>>

// Record verified DC3 results here as <operatorId>:s<skillIndex>:<uniEquipId>:lv<level>.
// A skill's unmodified coverage never marks a module stage as covered.
const MODULE_COVERAGE_OVERRIDES: ModuleCoverageOverrides = {}

export interface DamageCalculatorThreeModuleCoverageStage {
  level: DamageCalculatorThreeModuleLevel
  status: DamageCalculatorThreeModuleCoverageStatus
}

export interface DamageCalculatorThreeModuleCoverageRow {
  id: ModuleCoverageRowId
  skill: SkillRecord
  module: RawOperatorModule
  moduleId: string
  moduleType: string
  moduleName: string
  baselineStatus: DamageCalculatorThreeCoverageStatus
  stages: DamageCalculatorThreeModuleCoverageStage[]
}

export function buildDamageCalculatorThreeModuleCoverage(
  rows: readonly Pick<DamageCalculatorThreeCoverageRow, 'skill' | 'status'>[],
  overrides: ModuleCoverageOverrides = MODULE_COVERAGE_OVERRIDES,
): DamageCalculatorThreeModuleCoverageRow[] {
  return rows.flatMap(({ skill, status }) => getOperatorModules(skill.operatorProfile).map((module, index) => {
    const moduleId = getOperatorModuleId(module, index)
    const id: ModuleCoverageRowId = `${skill.operatorId}:s${skill.skillIndex}:${moduleId}`
    const availableLevels = getOperatorModuleLevels(module)
    // The optional battle data may be absent even though the catalog lists this MOD.
    const levels = availableLevels.length
      ? MODULE_COVERAGE_LEVELS.filter(level => availableLevels.includes(level))
      : MODULE_COVERAGE_LEVELS
    const stages = levels.map(level => ({
      level, status: overrides[`${id}:lv${level}`] ?? 'UNSTARTED',
    }))
    return {
      id, skill, module, moduleId, stages, baselineStatus: status,
      moduleType: module.typeName2?.normalize('NFKC').trim().toUpperCase() || 'その他',
      moduleName: module.uniEquipName ?? moduleId,
    }
  }))
}

export interface DamageCalculatorThreeModuleCoverageFilters {
  query: string
  moduleType: string
  status: DamageCalculatorThreeModuleCoverageStatus | 'ALL'
}

const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase('ja-JP')

export function filterDamageCalculatorThreeModuleCoverage(
  rows: readonly DamageCalculatorThreeModuleCoverageRow[],
  { query, moduleType, status }: DamageCalculatorThreeModuleCoverageFilters,
): DamageCalculatorThreeModuleCoverageRow[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  return rows.filter(row => {
    if (moduleType !== 'ALL' && row.moduleType !== moduleType) return false
    if (status !== 'ALL' && !row.stages.some(stage => stage.status === status)) return false
    const { operatorName, skillName, skillIndex } = row.skill
    const names = normalize(`${operatorName} ${skillName} ${row.moduleName} ${row.moduleType}`)
    return terms.every(term => /^s\d+$/.test(term) ? term === `s${skillIndex}` : names.includes(term))
  })
}

export function summarizeDamageCalculatorThreeModuleCoverage(rows: readonly DamageCalculatorThreeModuleCoverageRow[]) {
  const levels = MODULE_COVERAGE_LEVELS.map(level => ({
    level, total: 0,
    counts: { SUPPORTED: 0, CONDITIONAL: 0, PENDING: 0, UNSTARTED: 0, NOT_APPLICABLE: 0 },
  }))
  let stageCount = 0
  for (const row of rows) {
    for (const stage of row.stages) {
      const level = levels[stage.level - 1]
      level.total++
      level.counts[stage.status]++
      stageCount++
    }
  }
  return { rowCount: rows.length, stageCount, levels }
}
