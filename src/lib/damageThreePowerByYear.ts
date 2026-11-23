import type { SkillRecord } from '../types/skill.ts'
import type { DamageCalculatorThreeOutput } from './damageCalculatorThree.ts'
import {
  evaluateDamageThreeComparisonEntry, getDamageThreeComparisonEntries,
  type DamageThreeComparisonCommon, type DamageThreeComparisonEntry,
} from './damageCalculatorThreeComparison.ts'
import type { CoverageSnapshot } from './damageCalculatorThreeCoverageHistory.ts'
import { evaluateTimedPowerSkill } from './damageThreeTimedSkills.ts'
import { calculateBoxPlotStatistics } from './enemyStatistics.ts'
import { getOperatorReleaseDateJp } from './operatorReleaseDates.ts'
import { createSkillJsonSelectionKey } from './skillJsonAnalysis.ts'

export type PowerYearEnemy = 'zero' | 'standard'
export type PowerYearUnit = 'operator' | 'skill'
export type PowerYearMetric = 'dps' | 'total' | 'gain'
const ENEMIES: Record<PowerYearEnemy, DamageThreeComparisonCommon> = {
  zero: { defense: 0, resistance: 0, enemyCount: 1 },
  standard: { defense: 120, resistance: 20, enemyCount: 1 },
}

interface PowerSample {
  count: number
  median: number | null
}
export interface PowerYearRow extends PowerSample {
  year: number | null
  rosterCount: number
  physical: PowerSample
  arts: PowerSample
  otherCount: number
}
export interface PowerYearResult {
  years: PowerYearRow[]
  total: PowerYearRow
  latestReleaseDate: string | null
}

type PowerAttribute = 'PHYSICAL' | 'ARTS' | 'OTHER'
interface PowerValue {
  value: number
  attribute: PowerAttribute
}
interface PowerObservation {
  year: number
  best: PowerValue | null
}

function getPowerAttribute(output: DamageCalculatorThreeOutput, damageOverTimeDps: number | null): PowerAttribute {
  const type = output.damageType
  if (type !== 'PHYSICAL' && type !== 'ARTS') return 'OTHER'
  if (output.rows[0].attackComponents.some(component => component.damageType !== type)) return 'OTHER'
  // Guard recipes include per-second actions in output.damageType. The legacy engine
  // resolves a separate Arts DoT, which can accompany a physical main attack.
  if (damageOverTimeDps === null || (damageOverTimeDps > 0 && !output.guard && type !== 'ARTS')) return 'OTHER'
  return type
}

function summarizeValues(values: number[]): PowerSample {
  return { count: values.length, median: calculateBoxPlotStatistics(values)?.median ?? null }
}

function summarizePower(year: number | null, observations: PowerObservation[]): PowerYearRow {
  const samples = observations.flatMap(observation => observation.best ? [observation.best] : [])
  const physical = summarizeValues(samples.filter(sample => sample.attribute === 'PHYSICAL').map(sample => sample.value))
  const arts = summarizeValues(samples.filter(sample => sample.attribute === 'ARTS').map(sample => sample.value))
  return {
    year, rosterCount: observations.length, ...summarizeValues(samples.map(sample => sample.value)),
    physical, arts, otherCount: samples.length - physical.count - arts.count,
  }
}

function selectBest(observation: PowerObservation, value: number, attribute: PowerAttribute) {
  if (!observation.best || value > observation.best.value) observation.best = { value, attribute }
  else if (value === observation.best.value && attribute !== observation.best.attribute) observation.best.attribute = 'OTHER'
}

export function buildDamageThreePowerByYear(
  rows: readonly SkillRecord[], snapshot: CoverageSnapshot, enemy: PowerYearEnemy,
  unit: PowerYearUnit = 'operator', metric: PowerYearMetric = 'dps', seconds = 60, incomingInterval: number | null = 2,
): PowerYearResult {
  const roster = new Map<string, PowerObservation>()
  const supportedSkills = new Map<string, PowerObservation>()
  let latestReleaseDate: string | null = null
  for (const { skill, status, selection } of snapshot.rows) {
    if (skill.rarity !== 6) continue
    const date = getOperatorReleaseDateJp(skill.operatorId)
    if (!date) continue
    const rosterKey = unit === 'operator' ? skill.operatorId : createSkillJsonSelectionKey(skill)
    let observation = roster.get(rosterKey)
    if (!observation) {
      observation = { year: Number(date.slice(0, 4)), best: null }
      roster.set(rosterKey, observation)
      if (!latestReleaseDate || date > latestReleaseDate) latestReleaseDate = date
    }
    if (status === 'SUPPORTED' && selection?.levelIndex === 9) {
      supportedSkills.set(createSkillJsonSelectionKey(selection), observation)
    }
  }

  const supportedRows = rows.filter(skill => supportedSkills.has(createSkillJsonSelectionKey(skill)))
  const timedEntries = new Map<string, DamageThreeComparisonEntry[]>()
  for (const entry of getDamageThreeComparisonEntries(supportedRows)) {
    if (entry.phaseIndex !== 2 || entry.operatorLevel !== 90 || entry.levelIndex !== 9) continue
    const skillKey = createSkillJsonSelectionKey(entry.skill)
    if (metric !== 'dps') {
      const group = timedEntries.get(skillKey)
      if (group) group.push(entry)
      else timedEntries.set(skillKey, [entry])
      continue
    }
    if (entry.kind !== 'NORMAL') continue
    const result = evaluateDamageThreeComparisonEntry(entry, ENEMIES[enemy])
    const dps = result.combinedDps
    if (!result.output || result.errors.length || result.output.hasUnsupportedTalentDamage
      || dps === null || !Number.isFinite(dps) || dps <= 0) continue

    selectBest(supportedSkills.get(skillKey)!, dps, getPowerAttribute(result.output, result.damageOverTimeDps))
  }
  for (const [key, stages] of timedEntries) {
    const result = evaluateTimedPowerSkill(stages, ENEMIES[enemy], seconds, incomingInterval)
    if (!result) continue
    const value = metric === 'gain' ? result.total - result.baseline : result.total
    if (Number.isFinite(value)) selectBest(supportedSkills.get(key)!, value, result.attribute)
  }

  const byYear = new Map<number, PowerObservation[]>()
  for (const observation of roster.values()) {
    const group = byYear.get(observation.year)
    if (group) group.push(observation)
    else byYear.set(observation.year, [observation])
  }
  return {
    years: [...byYear.entries()].sort(([left], [right]) => left - right)
      .map(([year, observations]) => summarizePower(year, observations)),
    total: summarizePower(null, [...roster.values()]),
    latestReleaseDate,
  }
}
