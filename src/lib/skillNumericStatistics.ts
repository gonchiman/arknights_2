import type { EffectWindowType, RawSkillLevel, SkillRecord } from '../types/skill.ts'
import { classifySkill, EFFECT_WINDOW_LABELS } from './classifier.ts'
import {
  calculateBoxPlotStatistics, calculateNumericStatistics,
  type BoxPlotStatistics, type NumericStatistics,
} from './enemyStatistics.ts'
import { createSkillJsonSelectionKey, getSkillLevelLabel } from './skillJsonAnalysis.ts'
import { calculateInitialSpRatio } from './skillInitialSpRatio.ts'
import type { SkillStructure } from './skillStructure.ts'

export type SkillNumericMetric = 'duration' | 'spCost' | 'initialSp' | 'spGap' | 'initialRatio'
export type SkillNumericSpRecovery = SkillStructure['activationSettings']['spRecovery']

export interface SkillNumericConfig {
  profession: string | 'ALL'
  rarity: number | 'ALL'
  spRecovery: SkillNumericSpRecovery
  skillLevel: 'MAX' | 'RANK_7'
}

export const DEFAULT_SKILL_NUMERIC_CONFIG: SkillNumericConfig = {
  profession: 'ALL', rarity: 'ALL', spRecovery: 'INCREASE_WITH_TIME', skillLevel: 'MAX',
}

export const SKILL_NUMERIC_SP_RECOVERIES: readonly SkillNumericSpRecovery[] = [
  'INCREASE_WITH_TIME', 'INCREASE_WHEN_ATTACK', 'INCREASE_WHEN_TAKEN_DAMAGE', 'NO_SP',
]

export const SKILL_NUMERIC_METRICS: readonly {
  key: SkillNumericMetric; label: string; unit: '秒' | 'SP' | '%'
}[] = [
  { key: 'duration', label: '持続時間', unit: '秒' },
  { key: 'spCost', label: '必要SP', unit: 'SP' },
  { key: 'initialSp', label: '初期SP', unit: 'SP' },
  { key: 'spGap', label: '必要SP−初期SP', unit: 'SP' },
  { key: 'initialRatio', label: '初期SP率', unit: '%' },
]

export const SKILL_NUMERIC_DURATION_LABELS: Readonly<Record<EffectWindowType, string>> = EFFECT_WINDOW_LABELS

export interface SkillNumericObservation {
  id: string
  skill: SkillRecord
  skillLevelIndex: number
  skillLevelLabel: string
  durationSeconds: number | null
  durationState: EffectWindowType
  spCost: number | null
  initialSp: number | null
  /** Signed source SP cost minus source initial SP; never a waiting time. */
  spGap: number | null
  initialRatio: number | null
}

export interface SkillNumericDataset {
  observations: SkillNumericObservation[]
  /** Profession/rarity matches with no exact selected level. Their SP recovery
   * cannot be established at that level, so they stay outside the SP cohort.
   */
  unavailableLevelCount: number
}

export interface SkillNumericSummary {
  metric: SkillNumericMetric
  statistics: NumericStatistics
  boxPlot: BoxPlotStatistics | null
  validCount: number
  excludedCount: number
  values: number[]
}

function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function nonnegative(value: number | null | undefined): number | null {
  const result = finite(value)
  return result !== null && result >= 0 ? result : null
}

function normalizeSpRecovery(value: unknown): SkillNumericSpRecovery | null {
  // The runtime table serializes non-SP passive skills as numeric 8; reviewed
  // structures use NO_SP. Do not classify arbitrary missing/unknown enums as it.
  if (value === 8) return 'NO_SP'
  return SKILL_NUMERIC_SP_RECOVERIES.find(recovery => recovery === value) ?? null
}

function durationOf(raw: RawSkillLevel): Pick<SkillNumericObservation, 'durationSeconds' | 'durationState'> {
  if (raw.durationType === 'AMMO') return { durationSeconds: null, durationState: 'AMMO' }
  const duration = finite(raw.duration)
  if (duration !== null && duration > 0) return { durationSeconds: duration, durationState: 'FIXED_DURATION' }
  const state = classifySkill(raw).effectWindow.value
  // Description-derived fixed windows cannot supply a numeric source duration.
  return { durationSeconds: null, durationState: state === 'FIXED_DURATION' ? 'UNKNOWN' : state }
}

/** One unweighted observation per operator/skill, from the exact selected raw
 * level. Combat coverage, talents, modules, enemy stats and DPS are not inputs.
 */
export function buildSkillNumericDataset(
  rows: readonly SkillRecord[], config: SkillNumericConfig,
): SkillNumericDataset {
  const unique = new Map<string, SkillRecord>()
  for (const skill of rows) {
    const key = createSkillJsonSelectionKey(skill)
    if (!unique.has(key)) unique.set(key, skill)
  }

  const observations: SkillNumericObservation[] = []
  let unavailableLevelCount = 0
  for (const [id, skill] of unique) {
    if (config.profession !== 'ALL' && skill.profession !== config.profession) continue
    if (config.rarity !== 'ALL' && skill.rarity !== config.rarity) continue
    const skillLevelIndex = config.skillLevel === 'MAX' ? skill.skillLevels.length - 1 : 6
    const raw = skill.skillLevels[skillLevelIndex]
    if (!raw) { unavailableLevelCount++; continue }
    const spRecovery = normalizeSpRecovery(raw.spData?.spType)
    if (spRecovery !== config.spRecovery) continue

    const hasSp = spRecovery !== 'NO_SP'
    const spCost = hasSp ? nonnegative(raw.spData?.spCost) : null
    const initialSp = hasSp ? nonnegative(raw.spData?.initSp) : null
    observations.push({
      id, skill, skillLevelIndex, skillLevelLabel: getSkillLevelLabel(skillLevelIndex, skill.skillLevels.length),
      ...durationOf(raw), spCost, initialSp,
      spGap: spCost === null || initialSp === null ? null : finite(spCost - initialSp),
      initialRatio: calculateInitialSpRatio(initialSp, spCost),
    })
  }
  return { observations, unavailableLevelCount }
}

export function getSkillNumericValue(observation: SkillNumericObservation, metric: SkillNumericMetric): number | null {
  return metric === 'duration' ? observation.durationSeconds : observation[metric]
}

/** Keep each metric's missing cases independent. Shared statistics retain all
 * values (including signed gaps and statistical outliers) and their counts.
 */
export function summarizeSkillNumericMetric(
  dataset: SkillNumericDataset, metric: SkillNumericMetric,
): SkillNumericSummary {
  const source = dataset.observations.map(observation => getSkillNumericValue(observation, metric))
  const statistics = calculateNumericStatistics(source)
  return {
    metric, statistics, boxPlot: calculateBoxPlotStatistics(source),
    validCount: statistics.count, excludedCount: statistics.missingCount,
    values: source.filter((value): value is number => value !== null && Number.isFinite(value)),
  }
}
