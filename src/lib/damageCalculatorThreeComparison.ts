import type { SkillRecord } from '../types/skill.ts'
import {
  buildDamageCalculatorThreeOutput, getDamageCalculatorThreeStructures,
  type DamageCalculatorThreeConditions, type DamageCalculatorThreeOutput,
} from './damageCalculatorThree.ts'
import { getExpandedDefinition } from './expandedCombatRegistry.ts'
import { guardConditionMatches } from './guardCombatValues.ts'
import type { SkillStructure } from './skillStructure.ts'

export const DAMAGE_THREE_OUTPUT_KIND_LABELS: Record<DamageCalculatorThreeOutput['attackKind'], string> = {
  NORMAL: '通常攻撃型', NEXT_ATTACK: '次の通常攻撃型', COUNTER: '反撃型', SKILL_ACTION: 'スキル動作型',
}
export interface DamageThreeComparisonEntry {
  key: string
  skill: SkillRecord
  structure: SkillStructure
  stageId: string
  stageLabel: string
  kind: DamageCalculatorThreeOutput['attackKind']
  phaseIndex: number
  operatorLevel: number
  levelIndex: number
}
export interface DamageThreeComparisonCommon { defense: number; resistance: number; enemyCount: number }
export type DamageThreeComparisonOverrides = Record<string, number | string | boolean | undefined>
export interface ComparisonConditionField {
  key: string
  label: string
  kind: 'number' | 'boolean' | 'select'
  value: number | string | boolean | null
  min?: number
  max?: number
  step?: number
  options?: readonly { value: number | string | boolean; label: string }[]
  locked: boolean
}
export interface DamageThreeComparisonResult {
  entry: DamageThreeComparisonEntry
  output: DamageCalculatorThreeOutput | null
  errors: string[]
  notes: string[]
  fields: ComparisonConditionField[]
  actualTargetCount: number | null
  damageType: string | null
  perAttack: number | null
  allTargetsPerAttack: number | null
  dps: number | null
  allTargetsDps: number | null
  damageOverTimeDps: number | null
  allTargetsDamageOverTimeDps: number | null
  combinedDps: number | null
  allTargetsCombinedDps: number | null
}

/** Only reviewed DC3 selections are enumerated; source descriptions are never interpreted here. */
export function getDamageThreeComparisonEntries(rows: readonly SkillRecord[]): DamageThreeComparisonEntry[] {
  const skills = new Map(rows.map(skill => [`${skill.operatorId}:${skill.skillId}:${skill.skillIndex}`, skill]))
  return getDamageCalculatorThreeStructures().flatMap(structure => {
    const info = structure.basicInfo
    const skill = skills.get(`${info.operatorId}:${info.skillId}:${info.skillIndex}`)
    if (!skill) return []
    const phaseIndex = getExpandedDefinition(skill.operatorId)?.phaseIndex ?? 2
    return (structure.guardRecipe?.stages ?? structure.effectStructure.stages).map(stage => {
      const entry: DamageThreeComparisonEntry = {
        key: `${skill.operatorId}:${skill.skillId}:${info.levelIndex}:${stage.id}`,
        skill, structure, stageId: stage.id, stageLabel: stage.label,
        kind: 'kind' in stage ? stage.kind : 'NORMAL', phaseIndex,
        operatorLevel: skill.operatorProfile.phases[phaseIndex]?.maxLevel ?? 90,
        levelIndex: info.levelIndex,
      }
      // Legacy structures resolve attack kind through DC3, including counter-attacks.
      if (!structure.guardRecipe) {
        const output = calculate(entry, { defense: 0, resistance: 0, enemyCount: 1 }, stageDefaults(entry), 1)
        if (output.activeStageLabel === stage.label) entry.kind = output.attackKind
      }
      return entry
    })
  })
}

/** A batch row calls the ordinary DC3 evaluator; no second damage formula or interpolation. */
export function evaluateDamageThreeComparisonEntry(
  entry: DamageThreeComparisonEntry, common: DamageThreeComparisonCommon,
  overrides: DamageThreeComparisonOverrides = {},
): DamageThreeComparisonResult {
  const errors: string[] = []
  if (!Number.isSafeInteger(common.enemyCount) || common.enemyCount < 1 || common.enemyCount > 10000) {
    errors.push('敵数を1〜10000の整数で入力してください。')
  }
  const values = { ...stageDefaults(entry), ...overrides }
  const fixed = fixedStageValue(entry)
  if (fixed) values[fixed.key] = fixed.value
  let output: DamageCalculatorThreeOutput | null = null
  try {
    // Discover the skill's cap with one target; then calculate the actual common enemy count.
    // Other errors from this discovery are deliberately not carried to a different final condition.
    const initial = calculate(entry, common, values, 1)
    const count = Math.min(common.enemyCount, initial.maxTargetCount ?? common.enemyCount)
    output = count === 1 ? initial : calculate(entry, common, values, count)
    errors.push(...output.unsupportedReasons)
    if (output.activeStageLabel !== entry.stageLabel || output.attackKind !== entry.kind || !matchesEntryStage(entry, output, values)) {
      errors.push(`段階「${entry.stageLabel}」の条件を満たしていません。`)
    }
  } catch (error) { errors.push(error instanceof Error ? error.message : '計算条件を解決できません。') }
  const fields: ComparisonConditionField[] = output?.guard
    ? output.guard.inputs.map(input => ({ ...input, key: `guard.${input.key}`,
      value: output!.guard!.conditions[input.key] ?? input.defaultValue,
      locked: ['actualAttackTargetCount', 'enemyResistance'].includes(input.key) || fixed?.key === `guard.${input.key}`,
    }))
    : (output?.conditionInputs ?? []).map(input => ({ ...input, key: input.metric,
      value: input.metric === 'actualAttackTargetCount' ? output!.actualTargetCount
        : input.metric === 'enemyResistance' ? common.resistance : values[input.metric] ?? input.defaultValue,
      locked: ['actualAttackTargetCount', 'enemyResistance'].includes(input.metric) || fixed?.key === input.metric,
    }))
  const row = !errors.length && output?.rows.length === 1 ? output.rows[0] : null
  const directDps = row?.dps ?? null
  const combinedDps = row?.combinedDps ?? null
  // Null means not calculable; zero only means the engine confirmed there is no periodic contribution.
  const periodic = row?.damageOverTimeDps ?? (directDps !== null && combinedDps === directDps ? 0 : null)
  return {
    entry, output, errors: [...new Set(errors)], fields,
    notes: [...new Set([...(output?.scopeNotes ?? []), ...(output?.talentEffects.filter(effect => effect.status === 'UNSUPPORTED').map(effect => effect.reason) ?? [])])],
    actualTargetCount: Number.isSafeInteger(output?.actualTargetCount) && output!.actualTargetCount > 0 ? output!.actualTargetCount : null,
    damageType: output?.damageType ?? (row ? 'MIXED' : null),
    perAttack: row?.perAttack ?? null, allTargetsPerAttack: row?.allTargetsPerAttack ?? null,
    dps: directDps, allTargetsDps: row?.allTargetsDps ?? null,
    damageOverTimeDps: periodic,
    allTargetsDamageOverTimeDps: periodic !== null && output ? periodic * output.actualTargetCount : null,
    combinedDps, allTargetsCombinedDps: row?.allTargetsCombinedDps ?? null,
  }
}

function stageDefaults(entry: DamageThreeComparisonEntry): DamageThreeComparisonOverrides {
  const fixed = fixedStageValue(entry)
  if (fixed) return { [fixed.key]: fixed.value }
  const stage = entry.structure.guardRecipe?.stages.find(stage => stage.id === entry.stageId)
  const legacy = entry.structure.effectStructure.stages.find(stage => stage.id === entry.stageId)
  // An explicit activation-count boundary names the repeated phase (e.g. second activation onward).
  // HP/range predicates retain DC3 defaults instead of inventing representative values.
  if (stage?.when?.input === 'skillActivationCount' && stage.when.comparison === 'GTE') {
    return { 'guard.skillActivationCount': stage.when.value }
  }
  if (legacy?.applicability?.metric === 'skillActivationCount' && legacy.applicability.comparison === 'GTE') {
    return { skillActivationCount: legacy.applicability.value }
  }
  return {}
}

function fixedStageValue(entry: DamageThreeComparisonEntry): { key: string; value: number | string | boolean } | null {
  const stage = entry.structure.guardRecipe?.stages.find(stage => stage.id === entry.stageId)
  if (stage?.when?.comparison === 'EQ') return { key: `guard.${stage.when.input}`, value: stage.when.value }
  if (entry.structure.guardRecipe) return null
  const condition = entry.structure.effectStructure.stages.find(stage => stage.id === entry.stageId)?.applicability
  return condition?.comparison === 'EQ' ? { key: condition.metric, value: condition.value } : null
}

function calculate(entry: DamageThreeComparisonEntry, common: DamageThreeComparisonCommon,
  values: DamageThreeComparisonOverrides, count: number): DamageCalculatorThreeOutput {
  const conditions: DamageCalculatorThreeConditions = entry.structure.guardRecipe
    ? { guard: { ...Object.fromEntries(Object.entries(values).filter(([key]) => key.startsWith('guard.')).map(([key, value]) => [key.slice(6), value])),
      actualAttackTargetCount: count, enemyResistance: common.resistance } }
    : { ...Object.fromEntries(Object.entries(values).filter(([key]) => !key.startsWith('guard.'))),
      actualAttackTargetCount: count, enemyResistance: common.resistance }
  return buildDamageCalculatorThreeOutput({ operator: entry.skill, skill: entry.skill,
    phaseIndex: entry.phaseIndex, operatorLevel: entry.operatorLevel, trust: 100,
    skillLevelIndex: entry.levelIndex, conditions, enemy: { defense: common.defense, resistance: common.resistance } })
}

function matchesEntryStage(entry: DamageThreeComparisonEntry, output: DamageCalculatorThreeOutput,
  values: DamageThreeComparisonOverrides): boolean {
  const stage = entry.structure.guardRecipe?.stages.find(stage => stage.id === entry.stageId)
  if (stage) return !stage.when || !!output.guard && guardConditionMatches(stage.when, output.guard.conditions)
  const condition = entry.structure.effectStructure.stages.find(stage => stage.id === entry.stageId)?.applicability
  if (!condition) return true
  const actual = values[condition.metric] ?? output.conditionInputs.find(input => input.metric === condition.metric)?.defaultValue
  if (condition.comparison === 'EQ') return actual === condition.value
  if (condition.comparison === 'NE') return actual !== condition.value
  if (typeof actual !== 'number' || typeof condition.value !== 'number') return false
  return condition.comparison === 'GT' ? actual > condition.value : condition.comparison === 'GTE' ? actual >= condition.value
    : condition.comparison === 'LT' ? actual < condition.value : actual <= condition.value
}
