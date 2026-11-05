import {
  getDamageThreeComparisonEntries, evaluateDamageThreeComparisonEntry,
  type DamageThreeComparisonEntry, type DamageThreeComparisonCommon,
  type DamageThreeComparisonOverrides, type DamageThreeComparisonResult,
  type DamageThreeComparisonEvaluationOptions,
} from './damageCalculatorThreeComparison.ts'
import { getDamageCalculatorThreeVirtualAttackCapability } from './damageCalculatorThree.ts'
import type { SkillRecord } from '../types/skill.ts'

export type DamageThreeAttributeAxis = 'defense' | 'resistance'
export type DamageThreeAttributeType = 'PHYSICAL' | 'ARTS'
export interface DamageThreeAttributeEntry extends DamageThreeComparisonEntry {
  capability: { supported: boolean; reason: string | null }
}
export interface DamageThreeAttributeMetrics {
  perAttack: number | null
  dps: number | null
  combinedDps: number | null
}
export interface DamageThreeAttributeSample {
  x: number
  original: DamageThreeAttributeMetrics
  changed: DamageThreeAttributeMetrics
}
export interface DamageThreeAttributeComparisonInput {
  entry: DamageThreeAttributeEntry
  common: DamageThreeComparisonCommon
  overrides?: DamageThreeComparisonOverrides
  operatorLevel?: number
  trust?: number
  targetType: DamageThreeAttributeType
  axis: DamageThreeAttributeAxis
}
export interface DamageThreeAttributeComparison {
  original: DamageThreeComparisonResult
  changed: DamageThreeComparisonResult | null
  errors: string[]
  samples: DamageThreeAttributeSample[]
  axisMaximum: number
}

/** Share the DC3 catalog, including one-shot attacks and unavailable stages with their original errors. */
export function getDamageThreeAttributeEntries(rows: readonly SkillRecord[]): DamageThreeAttributeEntry[] {
  return getDamageThreeComparisonEntries(rows).map(entry => ({
    ...entry, capability: getDamageCalculatorThreeVirtualAttackCapability(entry.structure, entry.stageId),
  }))
}

function metrics(result: DamageThreeComparisonResult | null): DamageThreeAttributeMetrics {
  if (!result || result.errors.length) return { perAttack: null, dps: null, combinedDps: null }
  const finite = (value: number | null) => value !== null && Number.isFinite(value) ? value : null
  return { perAttack: finite(result.perAttack), dps: finite(result.dps), combinedDps: finite(result.combinedDps) }
}

export function getDamageThreeAttributeChangeRate(original: number | null, changed: number | null): number | null {
  if (original === null || changed === null || !Number.isFinite(original) || !Number.isFinite(changed)
    || original < 0 || changed < 0) return null
  if (original === 0) return changed === 0 ? 0 : null
  const rate = (changed / original - 1) * 100
  return Number.isFinite(rate) ? rate : null
}

/** Evaluate both series through DC3 at identical explicit DEF/RES, never its type-dependent automatic axes. */
export function evaluateDamageThreeAttributeComparison(input: DamageThreeAttributeComparisonInput): DamageThreeAttributeComparison {
  const { entry, common, overrides = {}, targetType, axis } = input
  const settings: DamageThreeComparisonEvaluationOptions = {
    ...(input.operatorLevel === undefined ? {} : { operatorLevel: input.operatorLevel }),
    ...(input.trust === undefined ? {} : { trust: input.trust }),
  }
  const original = evaluateDamageThreeComparisonEntry(entry, common, overrides, settings)
  const errors: string[] = []
  if (!Number.isFinite(common.defense) || common.defense < 0) errors.push('敵の防御力は0以上で入力してください。')
  if (!Number.isFinite(common.resistance) || common.resistance < 0 || common.resistance > 100) errors.push('敵の術耐性は0〜100で入力してください。')
  if (!Number.isSafeInteger(common.enemyCount) || common.enemyCount < 1 || common.enemyCount > 10000) errors.push('敵の数は1〜10000の整数で入力してください。')
  if (axis !== 'defense' && axis !== 'resistance') errors.push('横軸を選択してください。')
  if (targetType !== 'PHYSICAL' && targetType !== 'ARTS') errors.push('変更後の属性を物理・術から選択してください。')
  // Derive eligibility from the structure again; callers cannot enable an unsupported stage via a UI flag.
  const capability = getDamageCalculatorThreeVirtualAttackCapability(entry.structure, entry.stageId)
  if (!capability.supported) errors.push(capability.reason ?? 'この段階の属性変更は未対応です。')
  const maximum = axis === 'resistance' ? 100 : Number.isFinite(common.defense) && common.defense >= 0
    ? Math.max(3000, common.defense) : 3000
  if (errors.length) return { original, changed: null, errors: [...new Set(errors)], samples: [], axisMaximum: maximum }

  const changedSettings = { ...settings, virtualMainAttackType: targetType }
  const changed = evaluateDamageThreeComparisonEntry(entry, common, overrides, changedSettings)
  errors.push(...original.errors, ...changed.errors)
  if (original.actualTargetCount !== changed.actualTargetCount) errors.push('元の属性と変更後で攻撃対象数が一致しません。')
  if (errors.length) return { original, changed, errors: [...new Set(errors)], samples: [], axisMaximum: maximum }

  // Samples span the requested axis only, include the selected point exactly, and retain nulls for uncomputable points.
  const selectedX = common[axis]
  const coordinates = [...new Set([
    ...Array.from({ length: 61 }, (_, index) => maximum * (index / 60)), selectedX,
    ...(axis === 'resistance' ? [95] : []),
  ])].sort((left, right) => left - right)
  const samples = coordinates.map(x => {
    if (x === selectedX) return { x, original: metrics(original), changed: metrics(changed) }
    const enemy = { ...common, [axis]: x }
    const before = evaluateDamageThreeComparisonEntry(entry, enemy, overrides, settings)
    const after = evaluateDamageThreeComparisonEntry(entry, enemy, overrides, changedSettings)
    // A failed side makes the point non-comparable. Do not draw an apparent advantage from a missing value.
    if (before.errors.length || after.errors.length || before.actualTargetCount !== after.actualTargetCount) {
      return { x, original: metrics(null), changed: metrics(null) }
    }
    return { x, original: metrics(before), changed: metrics(after) }
  })
  return { original, changed, errors: [], samples, axisMaximum: maximum }
}
