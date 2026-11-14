import type { RawOperatorModule, SkillRecord } from '../types/skill.ts'
import { COVERAGE_STATUS_LABELS, type DamageCalculatorThreeCoverageRow, type DamageCalculatorThreeCoverageStatus } from './damageCalculatorThreeCoverage.ts'
import { getDamageCalculatorThreeSurtrModuleLevels } from './damageCalculatorThreeSurtrModule.ts'
import { getOperatorModuleId, getOperatorModuleLevels, getOperatorModules } from './operatorModules.ts'

export const MODULE_COVERAGE_LEVELS = [1, 2, 3] as const
export const MODULE_COVERAGE_STATUSES = ['SUPPORTED', 'CONDITIONAL', 'PARTIAL', 'PENDING', 'UNSTARTED', 'NOT_APPLICABLE'] as const

export type DamageCalculatorThreeModuleLevel = typeof MODULE_COVERAGE_LEVELS[number]
export type DamageCalculatorThreeModuleCoverageStatus = typeof MODULE_COVERAGE_STATUSES[number]
type ModuleCoverageSkillStatus = Exclude<DamageCalculatorThreeModuleCoverageStatus, 'PARTIAL'>

export const MODULE_COVERAGE_STATUS_LABELS = {
  SUPPORTED: COVERAGE_STATUS_LABELS.SUPPORTED,
  CONDITIONAL: COVERAGE_STATUS_LABELS.CONDITIONAL,
  PARTIAL: '一部対応',
  PENDING: COVERAGE_STATUS_LABELS.PENDING,
  UNSTARTED: '未着手',
  NOT_APPLICABLE: COVERAGE_STATUS_LABELS.NOT_APPLICABLE,
} satisfies Record<DamageCalculatorThreeModuleCoverageStatus, string>

type ModuleCoverageRowId = `${string}:s${number}:${string}`
type ModuleCoverageStageId = `${ModuleCoverageRowId}:lv${DamageCalculatorThreeModuleLevel}`
type ModuleCoverageOverrides = Readonly<Partial<Record<ModuleCoverageStageId, ModuleCoverageSkillStatus>>>

// Record verified DC3 results here as <operatorId>:s<skillIndex>:<uniEquipId>:lv<level>.
// A skill's unmodified coverage never marks a module stage as covered.
const MODULE_COVERAGE_OVERRIDES: ModuleCoverageOverrides = {}

export interface DamageCalculatorThreeModuleCoverageStage<
  Status extends DamageCalculatorThreeModuleCoverageStatus = DamageCalculatorThreeModuleCoverageStatus,
> {
  level: DamageCalculatorThreeModuleLevel
  status: Status
}

export interface DamageCalculatorThreeModuleCoverageRow {
  id: ModuleCoverageRowId
  skill: SkillRecord
  module: RawOperatorModule
  moduleId: string
  moduleType: string
  moduleName: string
  baselineStatus: DamageCalculatorThreeCoverageStatus
  stages: DamageCalculatorThreeModuleCoverageStage<ModuleCoverageSkillStatus>[]
}

export interface DamageCalculatorThreeGroupedModuleCoverageRow {
  id: string
  operator: Pick<SkillRecord, 'operatorId' | 'operatorName' | 'operatorProfile'>
  module: RawOperatorModule
  moduleId: string
  moduleType: string
  moduleName: string
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
    const supportedLevels = status === 'SUPPORTED'
      ? getDamageCalculatorThreeSurtrModuleLevels(skill, 2, skill.operatorProfile.phases[2]?.maxLevel ?? 0, moduleId)
      : []
    const stages = levels.map(level => ({
      level, status: overrides[`${id}:lv${level}`] ?? (supportedLevels.includes(level) ? 'SUPPORTED' : 'UNSTARTED'),
    }))
    return {
      id, skill, module, moduleId, stages, baselineStatus: status,
      moduleType: module.typeName2?.normalize('NFKC').trim().toUpperCase() || 'その他',
      moduleName: module.uniEquipName ?? moduleId,
    }
  }))
}

function getGroupedStageStatus(statuses: readonly ModuleCoverageSkillStatus[]): DamageCalculatorThreeModuleCoverageStatus {
  const conditional = statuses.includes('CONDITIONAL')
  const pending = statuses.includes('PENDING')
  const unstarted = statuses.includes('UNSTARTED')
  if (conditional || statuses.includes('SUPPORTED')) {
    if (pending || unstarted) return 'PARTIAL'
    return conditional ? 'CONDITIONAL' : 'SUPPORTED'
  }
  if (pending) return 'PENDING'
  return unstarted ? 'UNSTARTED' : 'NOT_APPLICABLE'
}

export function buildDamageCalculatorThreeGroupedModuleCoverage(
  rows: readonly DamageCalculatorThreeModuleCoverageRow[],
): DamageCalculatorThreeGroupedModuleCoverageRow[] {
  const modules = new Map<string, DamageCalculatorThreeModuleCoverageRow[]>()
  for (const row of rows) {
    const id = `${row.skill.operatorId}:${row.moduleId}`
    const existing = modules.get(id)
    if (existing) existing.push(row)
    else modules.set(id, [row])
  }

  return Array.from(modules, ([id, moduleRows]) => {
    const { skill: { operatorId, operatorName, operatorProfile }, module, moduleId, moduleType, moduleName } = moduleRows[0]
    const stages = MODULE_COVERAGE_LEVELS.flatMap(level => {
      const statuses = moduleRows.flatMap(row => row.stages.filter(stage => stage.level === level).map(stage => stage.status))
      return statuses.length ? [{ level, status: getGroupedStageStatus(statuses) }] : []
    })
    return { id, operator: { operatorId, operatorName, operatorProfile }, module, moduleId, moduleType, moduleName, stages }
  })
}

export interface DamageCalculatorThreeModuleCoverageFilters {
  query: string
  moduleType: string
  status: DamageCalculatorThreeModuleCoverageStatus | 'ALL'
}

const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase('ja-JP')

export function filterDamageCalculatorThreeModuleCoverage(
  rows: readonly DamageCalculatorThreeGroupedModuleCoverageRow[],
  { query, moduleType, status }: DamageCalculatorThreeModuleCoverageFilters,
): DamageCalculatorThreeGroupedModuleCoverageRow[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  return rows.filter(row => {
    if (moduleType !== 'ALL' && row.moduleType !== moduleType) return false
    if (status !== 'ALL' && !row.stages.some(stage => stage.status === status)) return false
    const names = normalize(`${row.operator.operatorName} ${row.moduleName} ${row.moduleType}`)
    return terms.every(term => names.includes(term))
  })
}

export function summarizeDamageCalculatorThreeModuleCoverage(rows: readonly DamageCalculatorThreeGroupedModuleCoverageRow[]) {
  const levels = MODULE_COVERAGE_LEVELS.map(level => ({
    level, total: 0,
    counts: { SUPPORTED: 0, CONDITIONAL: 0, PARTIAL: 0, PENDING: 0, UNSTARTED: 0, NOT_APPLICABLE: 0 },
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
