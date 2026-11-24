import type { SkillRecord } from '../types/skill.ts'
import {
  evaluateDamageThreeComparisonEntry, getDamageThreeComparisonEntries,
  type DamageThreeComparisonEntry,
} from './damageCalculatorThreeComparison.ts'
import { validateDamageCalculatorThreeEnemy } from './damageCalculatorThreeEnemy.ts'
import { resolveDamageThreeStageDuration } from './damageCalculatorThreePeriodTotal.ts'
import { getDamageCalculatorThreeSkillInformationValues } from './damageCalculatorThreeSkillInformation.ts'
import { fitMultipleLinearRegression, type MultipleLinearRegressionResult } from './multipleLinearRegression.ts'
import { buildOperatorDatabaseRecords } from './operatorDatabase.ts'
import { calculateInitialSpRatio } from './skillInitialSpRatio.ts'
import type { SkillStructure } from './skillStructure.ts'
import { resolveSkillDpsUptime } from './skillDpsUptime.ts'

export const SKILL_DPS_ANALYSIS_AXES = [
  ['duration', '持続時間'], ['spCost', '必要SP'], ['spGap', '必要SP−初期SP'],
  ['deploymentCost', '配置コスト'], ['initialRatio', '初期SP率'], ['uptime', '理論稼働率'],
  ['maxTargets', '最大対象数'], ['attack', '攻撃力'], ['interval', '攻撃間隔'],
] as const
export type SkillDpsAnalysisAxis = typeof SKILL_DPS_ANALYSIS_AXES[number][0]
export const SKILL_DPS_ANALYSIS_X_LABELS: Record<SkillDpsAnalysisAxis, string> = {
  duration: '持続時間（秒）', spCost: '必要SP', spGap: '必要SP−初期SP',
  deploymentCost: '配置コスト', initialRatio: '初期SP率（%）', uptime: '理論稼働率（%）',
  maxTargets: '最大対象数（体）', attack: '軽減前攻撃力', interval: '攻撃間隔（秒）',
}
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
  deploymentCost: number | null
  initialRatio: number | null
  uptime: number | null
  uptimeUnavailableReason: string | null
  maxTargets: number | 'UNLIMITED' | null
  attack: number | null
  attackInterval: number | null
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
  observations: (SkillDpsObservation & { x: number | 'UNLIMITED'; y: number })[]
  missingValueCount: number
  missingValueReasons: { label: string; count: number }[]
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

function positiveFinite(value: number | null | undefined): number | null {
  const result = finite(value)
  return result !== null && result > 0 ? result : null
}

export { calculateInitialSpRatio as calculateSkillDpsInitialSpRatio }

/** Only a successful reviewed DC3 output can certify an unlimited target cap. */
function getMaximumTargets(value: number | null | undefined): SkillDpsObservation['maxTargets'] {
  return value === null ? 'UNLIMITED'
    : typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 ? value : null
}

export function getSkillDpsAnalysisAxisValue(
  observation: SkillDpsObservation, axis: SkillDpsAnalysisAxis,
): number | 'UNLIMITED' | null {
  switch (axis) {
    case 'duration': return finite(observation.durationSeconds)
    case 'spCost': return finite(observation.spCost)
    case 'spGap': return finite(observation.spGap)
    case 'deploymentCost': {
      const value = finite(observation.deploymentCost)
      return value !== null && value >= 0 ? value : null
    }
    case 'initialRatio': return finite(observation.initialRatio)
    case 'uptime': return finite(observation.uptime)
    case 'maxTargets': return observation.maxTargets === 'UNLIMITED' ? 'UNLIMITED'
      : observation.maxTargets === null ? null : getMaximumTargets(observation.maxTargets)
    case 'attack': return finite(observation.attack)
    case 'interval': return positiveFinite(observation.attackInterval)
  }
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
  // The database already defines max-promotion/max-level, potential-1 base cost.
  // Reuse that source calculation once per operator rather than per skill.
  const costs = new Map(buildOperatorDatabaseRecords(scoped).map(operator => [operator.operatorId, operator.stats.deploymentCost]))
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
    const uptime = resolveSkillDpsUptime({ entry, output: result.output, skill, durationSeconds, spCost })
    const deploymentCost = finite(costs.get(skill.operatorId))
    observations.push({ id, skill, stageLabel: entry.stageLabel, durationSeconds, spCost, initialSp,
      spGap: spCost === null || initialSp === null ? null : finite(spCost - initialSp),
      deploymentCost: deploymentCost !== null && deploymentCost >= 0 ? deploymentCost : null,
      initialRatio: calculateInitialSpRatio(initialSp, spCost),
      uptime: finite(uptime.percentage), uptimeUnavailableReason: uptime.reason,
      maxTargets: getMaximumTargets(result.output.maxTargetCount),
      attack: finite(result.finalAttack), attackInterval: positiveFinite(result.output.attackInterval),
      directDps, combinedDps, damageType })
  }
  const exclusions = EXCLUSION_LABELS.flatMap(label => counts.has(label) ? [{ label, count: counts.get(label)! }] : [])
  return { observations, consideredCount: scoped.length - attributeFiltered,
    excludedCount: exclusions.reduce((total, row) => total + row.count, 0), exclusions }
}

/** Numeric axes fit an unweighted single-predictor OLS on their finite pairs.
 * Target capacities are categories, including UNLIMITED, and never enter OLS.
 * Zero DPS and signed SP gaps remain observations; no outlier is removed.
 */
export function analyzeSkillDps(
  dataset: SkillDpsAnalysisDataset, axis: SkillDpsAnalysisAxis, metric: SkillDpsAnalysisMetric,
): SkillDpsAnalysisResult {
  const missingReasons = new Map<string, number>()
  const axisLabel = SKILL_DPS_ANALYSIS_AXES.find(([key]) => key === axis)![1]
  const missing = (label: string) => missingReasons.set(label, (missingReasons.get(label) ?? 0) + 1)
  const observations = dataset.observations.flatMap(observation => {
    const y = finite(metric === 'direct' ? observation.directDps : observation.combinedDps)
    if (y === null) { missing(`${axisLabel}・DPS未確定`); return [] }
    const x = getSkillDpsAnalysisAxisValue(observation, axis)
    if (x === null) {
      missing(axis === 'uptime' ? observation.uptimeUnavailableReason ?? '理論稼働率未確定' : `${axisLabel}・DPS未確定`)
      return []
    }
    return [{ ...observation, x, y }]
  })
  const missingValueCount = dataset.observations.length - observations.length
  const missingValueReasons = [...missingReasons].map(([label, count]) => ({ label, count }))
  if (axis === 'maxTargets') return { observations, missingValueCount, missingValueReasons,
    fit: null, correlation: null, error: null }
  try {
    const fit = fitMultipleLinearRegression(observations.map(({ x }) => [x as number]), observations.map(({ y }) => y))
    // With exactly one predictor and an intercept, standardized beta equals Pearson r.
    const correlation = Math.max(-1, Math.min(1, fit.standardizedCoefficients[0]))
    return { observations, missingValueCount, missingValueReasons, fit, correlation, error: null }
  } catch (cause) {
    return { observations, missingValueCount, missingValueReasons, fit: null, correlation: null,
      error: cause instanceof Error ? cause.message : '回帰分析を計算できません。' }
  }
}
