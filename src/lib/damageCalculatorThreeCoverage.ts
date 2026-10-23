import type { SkillRecord } from '../types/skill.ts'
import { getDamageCalculatorThreeStructures } from './damageCalculatorThree.ts'
import { getGuardPassiveCalculationConstraints } from './guardCombatPassives.ts'
import type { GuardSkillRecipe, GuardStage } from './guardCombatTypes.ts'
import type { SkillStructure, SkillStructureSelection, SkillStructureStage } from './skillStructure.ts'
import { getSkillStructureDeferredCases } from './skillStructureDeferredCases.ts'

export type DamageCalculatorThreeCoverageStatus = 'SUPPORTED' | 'CONDITIONAL' | 'PENDING' | 'UNSUPPORTED'

export const COVERAGE_STATUS_LABELS: Readonly<Record<DamageCalculatorThreeCoverageStatus, string>> = {
  SUPPORTED: '対応', CONDITIONAL: '条件付き', PENDING: '保留', UNSUPPORTED: '未対応',
}

export const COVERAGE_STATUS_OPTIONS: readonly { value: DamageCalculatorThreeCoverageStatus; label: string }[] =
  (['SUPPORTED', 'CONDITIONAL', 'PENDING', 'UNSUPPORTED'] as const)
    .map(value => ({ value, label: COVERAGE_STATUS_LABELS[value] }))

export interface DamageCalculatorThreeCoverageRow {
  readonly skill: SkillRecord
  readonly status: DamageCalculatorThreeCoverageStatus
  readonly selection?: SkillStructureSelection
  readonly calculationScope: readonly string[]
  readonly supportedConditions: readonly string[]
  readonly deferredReasons: readonly string[]
  readonly scopeNotes: readonly string[]
}

const unique = (values: readonly string[]): string[] => [...new Set(values)]
const identity = (skill: Pick<SkillRecord, 'operatorId' | 'skillId' | 'skillIndex'>): string =>
  JSON.stringify([skill.operatorId, skill.skillId, skill.skillIndex])

/** One row per catalog skill. Registration, not a default-input calculation or the
 * historical source `supported` flag, determines coverage. A missing live profile
 * still belongs to its registered scope; calculator validation reports that error.
 */
export function buildDamageCalculatorThreeCoverage(rows: readonly SkillRecord[]): DamageCalculatorThreeCoverageRow[] {
  const skills = new Map<string, SkillRecord>()
  for (const skill of rows) {
    const key = identity(skill)
    const previous = skills.get(key)
    if (!previous || skill.skillLevels.length > previous.skillLevels.length) skills.set(key, skill)
  }
  const structures = new Map<string, SkillStructure>()
  for (const structure of getDamageCalculatorThreeStructures()) {
    const key = identity(structure.basicInfo)
    const previous = structures.get(key)
    if (!previous || structure.basicInfo.levelIndex > previous.basicInfo.levelIndex) structures.set(key, structure)
  }
  return [...skills.values()].map(skill => {
    const structure = structures.get(identity(skill))
    if (!structure) return { skill, status: 'UNSUPPORTED', calculationScope: [], supportedConditions: [],
      deferredReasons: [], scopeNotes: [] }
    const { operatorId, skillId, skillIndex, levelIndex } = structure.basicInfo
    const selection = { operatorId, skillId, skillIndex, levelIndex }
    const deferred = getSkillStructureDeferredCases(selection)
    if (!structure.guardRecipe) return {
      skill, selection, status: 'SUPPORTED',
      calculationScope: unique(structure.effectStructure.stages.map(legacyStageScope)),
      supportedConditions: [],
      deferredReasons: deferred.map(entry => `${entry.title}：${entry.unresolved}`),
      scopeNotes: unique([...structure.notes, ...deferred.map(entry => entry.currentTreatment)]),
    }
    const recipe = structure.guardRecipe
    const stages = recipe.stages.map(stage => {
      const constraints = getGuardPassiveCalculationConstraints(recipe.operatorId,
        { kind: stage.kind, skillIndex: recipe.skillIndex, stageId: stage.id })
      return {
        stage,
        blocked: Boolean(stage.unresolved?.length) || constraints.some(constraint => !constraint.supportedCondition),
        conditions: constraints.flatMap(constraint => constraint.supportedCondition ? [constraint.supportedCondition] : []),
        reasons: [...(stage.unresolved ?? []), ...constraints.map(constraint => constraint.reason)],
      }
    })
    const available = stages.filter(stage => !stage.blocked)
    const partialStages = available.length > 0 && available.length < stages.length
    const conditional = partialStages || available.some(stage => stage.conditions.length > 0)
    const status: DamageCalculatorThreeCoverageStatus = !available.length ? 'PENDING' : conditional ? 'CONDITIONAL' : 'SUPPORTED'
    return {
      skill, selection, status,
      calculationScope: unique(available.map(({ stage }) => guardStageScope(stage))),
      supportedConditions: unique([
        ...(partialStages ? [`計算する段階：${available.map(({ stage }) => stageLabel(recipe, stage)).join('、')}`] : []),
        ...available.flatMap(stage => stage.conditions),
      ]),
      deferredReasons: unique(stages.flatMap(({ stage, reasons }) => reasons.map(reason =>
        stages.length > 1 ? `${stageLabel(recipe, stage)}：${reason}` : reason))),
      scopeNotes: unique([...(recipe.notes ?? []), ...recipe.stages.flatMap(stage => stage.notes ?? [])]),
    }
  })
}

function stageLabel(recipe: GuardSkillRecipe, stage: GuardStage): string {
  if (!stage.when) return stage.label
  const input = recipe.inputs.find(input => input.key === stage.when!.input)
  return input?.options?.find(option => option.value === stage.when!.value)?.label ?? stage.label
}

function guardStageScope(stage: GuardStage): string {
  const scope = stage.kind === 'NEXT_ATTACK' ? '強化攻撃1回'
    : stage.kind === 'SKILL_ACTION' ? '発動・命中1回' : '1攻撃・攻撃中DPS'
  return `${stage.label}：${scope}`
}

function legacyStageScope(stage: SkillStructureStage): string {
  const scope = stage.effects.some(effect => effect.item === 'TRIGGERED_ATTACK') ? '反撃1回'
    : stage.duration.type === 'SINGLE_ATTACK' ? '強化攻撃1回'
      : stage.duration.type === 'SKILL_ACTION' ? 'スキル発動1回' : '1攻撃・攻撃中DPS'
  return `${stage.label}：${scope}`
}
