import type { SkillRecord } from '../types/skill.ts'
import {
  evaluateDamageThreeComparisonEntry, getDamageThreeComparisonEntries,
  type DamageThreeComparisonEntry,
} from './damageCalculatorThreeComparison.ts'
import { validateDamageCalculatorThreeEnemy } from './damageCalculatorThreeEnemy.ts'
import { resolveDamageThreeStageDuration } from './damageCalculatorThreePeriodTotal.ts'
import { getDamageCalculatorThreeSkillInformationValues } from './damageCalculatorThreeSkillInformation.ts'
import { fitMultipleLinearRegression, type MultipleLinearRegressionResult } from './multipleLinearRegression.ts'
import type { SkillStructure } from './skillStructure.ts'

export type SkillDpsAnalysisAxis = 'duration' | 'spCost' | 'spGap'
export type SkillDpsAnalysisMetric = 'direct' | 'combined'
export type SkillDpsDamageType = 'PHYSICAL' | 'ARTS' | 'TRUE' | 'ELEMENTAL' | 'MIXED'
export type SkillDpsSpRecovery = Exclude<SkillStructure['activationSettings']['spRecovery'], 'NO_SP'>

export interface SkillDpsAnalysisConfig {
  profession: string | 'ALL'
  rarity: number | 'ALL'
  spRecovery: SkillDpsSpRecovery
  damageType: SkillDpsDamageType | 'ALL'
  skillLevel: 'MAX' | 'RANK_7'
  defense: number
  resistance: number
}

export const DEFAULT_SKILL_DPS_ANALYSIS_CONFIG: SkillDpsAnalysisConfig = {
  profession: 'ALL', rarity: 'ALL', spRecovery: 'INCREASE_WITH_TIME', damageType: 'ALL',
  skillLevel: 'MAX', defense: 0, resistance: 0,
}

export interface SkillDpsObservation {
  id: string
  skill: SkillRecord
  stageLabel: string
  durationSeconds: number | null
  spCost: number | null
  initialSp: number | null
  /** Literal signed SP cost minus initial SP, never a recharge/cycle time. */
  spGap: number | null
  directDps: number | null
  /** DC3's combined rate, including steady DoT where supported. */
  combinedDps: number | null
  damageType: SkillDpsDamageType
}

export interface SkillDpsAnalysisDataset {
  observations: SkillDpsObservation[]
  consideredCount: number
  excludedCount: number
  exclusions: { label: string; count: number }[]
}

export interface SkillDpsAnalysisResult {
  observations: (SkillDpsObservation & { x: number; y: number })[]
  missingValueCount: number
  fit: MultipleLinearRegressionResult | null
  correlation: number | null
  error: string | null
}

const EXCLUSION_LABELS = [
  'DC3未対応', 'スキルLv未対応', '通常攻撃型なし', '通常攻撃型の段階が複数', '計算条件未解決', 'DPS未計算',
] as const
type ExclusionLabel = typeof EXCLUSION_LABELS[number]

function skillKey(skill: SkillRecord): string {
  return `${skill.operatorId}:${skill.skillId}:${skill.skillIndex}`
}

function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isOwnerNormalStage(entry: DamageThreeComparisonEntry): boolean {
  if (entry.kind !== 'NORMAL') return false
  const stage = entry.structure.guardRecipe?.stages.find(candidate => candidate.id === entry.stageId)
  return !stage?.actor
}

/** One reviewed owner NORMAL stage per operator/skill at the selected source level.
 * Ambiguous stages are excluded, never chosen by their calculated DPS. All damage
 * values and defaults come from ordinary DC3, with no module, trust 100 and potential 1.
 * Counts use the profession/rarity/recovery cohort; known attribute mismatches are
 * filtered out, while unresolved coverage stays visible in the exclusion counts.
 */
export function buildSkillDpsAnalysisDataset(
  rows: readonly SkillRecord[], config: SkillDpsAnalysisConfig,
): SkillDpsAnalysisDataset {
  const conditionErrors = validateDamageCalculatorThreeEnemy(config)
  if (conditionErrors.length) throw new RangeError(conditionErrors.join(' '))
  const unique = new Map<string, SkillRecord>()
  for (const skill of rows) if (!unique.has(skillKey(skill))) unique.set(skillKey(skill), skill)
  const scoped = [...unique.values()].filter(skill => {
    if (config.profession !== 'ALL' && skill.profession !== config.profession) return false
    if (config.rarity !== 'ALL' && skill.rarity !== config.rarity) return false
    const index = config.skillLevel === 'MAX' ? skill.skillLevels.length - 1 : 6
    return skill.skillLevels[index]?.spData?.spType === config.spRecovery
  })
  const grouped = new Map<string, DamageThreeComparisonEntry[]>()
  for (const entry of getDamageThreeComparisonEntries(scoped)) {
    const key = skillKey(entry.skill)
    const values = grouped.get(key) ?? []
    if (!values.some(candidate => candidate.key === entry.key)) values.push(entry)
    grouped.set(key, values)
  }
  const counts = new Map<ExclusionLabel, number>()
  const exclude = (label: ExclusionLabel) => counts.set(label, (counts.get(label) ?? 0) + 1)
  const observations: SkillDpsObservation[] = []
  let attributeFiltered = 0
  for (const skill of scoped) {
    const id = skillKey(skill)
    const allEntries = grouped.get(id) ?? []
    if (!allEntries.length) { exclude('DC3未対応'); continue }
    const levelIndex = config.skillLevel === 'MAX' ? skill.skillLevels.length - 1 : 6
    const atLevel = allEntries.filter(entry => entry.levelIndex === levelIndex)
    if (!atLevel.length) { exclude('スキルLv未対応'); continue }
    const candidates = atLevel.filter(isOwnerNormalStage)
    if (!candidates.length) { exclude('通常攻撃型なし'); continue }
    if (candidates.length !== 1) { exclude('通常攻撃型の段階が複数'); continue }
    const entry = candidates[0]
    let result: ReturnType<typeof evaluateDamageThreeComparisonEntry>
    try {
      result = evaluateDamageThreeComparisonEntry(entry,
        { defense: config.defense, resistance: config.resistance, enemyCount: 1 }, {},
        { operatorLevel: entry.operatorLevel, trust: 100 })
    } catch { exclude('計算条件未解決'); continue }
    if (!result.output || result.errors.length) { exclude('計算条件未解決'); continue }
    const directDps = finite(result.dps)
    const combinedDps = finite(result.combinedDps)
    if (directDps === null && combinedDps === null) { exclude('DPS未計算'); continue }
    const damageType: SkillDpsDamageType = result.damageType === 'PHYSICAL' || result.damageType === 'ARTS'
      || result.damageType === 'TRUE' || result.damageType === 'ELEMENTAL' ? result.damageType : 'MIXED'
    if (config.damageType !== 'ALL' && config.damageType !== damageType) { attributeFiltered++; continue }
    const information = getDamageCalculatorThreeSkillInformationValues(entry.structure, skill, result.output)
    const spCost = finite(information.spCost)
    const initialSp = finite(information.initialSp)
    const raw = skill.skillLevels[levelIndex]
    const stage = entry.structure.guardRecipe
      ? entry.structure.guardRecipe.stages.find(candidate => candidate.id === entry.stageId)
      : entry.structure.effectStructure.stages.find(candidate => candidate.id === entry.stageId)
    const durationSeconds = raw?.durationType === 'AMMO' ? null : resolveDamageThreeStageDuration(stage, {
      sourceDuration: raw?.duration, blackboard: raw?.blackboard, conditions: result.output.guard?.conditions,
    })
    observations.push({ id, skill, stageLabel: entry.stageLabel, durationSeconds, spCost, initialSp,
      spGap: spCost === null || initialSp === null ? null : finite(spCost - initialSp),
      directDps, combinedDps, damageType })
  }
  const exclusions = EXCLUSION_LABELS.flatMap(label => counts.has(label) ? [{ label, count: counts.get(label)! }] : [])
  return { observations, consideredCount: scoped.length - attributeFiltered,
    excludedCount: exclusions.reduce((total, row) => total + row.count, 0), exclusions }
}

/** Each tab fits its own unweighted single-predictor OLS on finite pairs only.
 * Zero DPS and signed SP gaps remain observations; no outlier is removed.
 */
export function analyzeSkillDps(
  dataset: SkillDpsAnalysisDataset, axis: SkillDpsAnalysisAxis, metric: SkillDpsAnalysisMetric,
): SkillDpsAnalysisResult {
  const observations = dataset.observations.flatMap(observation => {
    const x = finite(axis === 'duration' ? observation.durationSeconds
      : axis === 'spCost' ? observation.spCost : observation.spGap)
    const y = finite(metric === 'direct' ? observation.directDps : observation.combinedDps)
    return x === null || y === null ? [] : [{ ...observation, x, y }]
  })
  const missingValueCount = dataset.observations.length - observations.length
  try {
    const fit = fitMultipleLinearRegression(observations.map(({ x }) => [x]), observations.map(({ y }) => y))
    // With exactly one predictor and an intercept, standardized beta equals Pearson r.
    const correlation = Math.max(-1, Math.min(1, fit.standardizedCoefficients[0]))
    return { observations, missingValueCount, fit, correlation, error: null }
  } catch (cause) {
    return { observations, missingValueCount, fit: null, correlation: null,
      error: cause instanceof Error ? cause.message : '回帰分析を計算できません。' }
  }
}
