import { getDamageCalculatorThreeVirtualAttackCapability } from './damageCalculatorThree.ts'
import type { DamageThreeAttributeEntry } from './damageCalculatorThreeAttributeComparison.ts'
import {
  evaluateDamageThreeComparisonEntry,
  type DamageThreeComparisonEvaluationOptions,
  type DamageThreeComparisonOverrides,
  type DamageThreeComparisonResult,
} from './damageCalculatorThreeComparison.ts'

export const DAMAGE_THREE_ATTRIBUTE_DEFENSE_VALUES = [0, 500, 1000, 1500, 2000] as const
export const DAMAGE_THREE_ATTRIBUTE_RESISTANCE_VALUES = [0, 20, 40, 60, 80] as const

export interface DamageThreeAttributeTableRow {
  value: number
  /** Expected main-attack damage per target; additional attacks and periodic damage are excluded. */
  perAttack: number | null
  dps: number | null
}

export interface DamageThreeAttributeTablesInput {
  entry: DamageThreeAttributeEntry
  enemyCount: number
  overrides?: DamageThreeComparisonOverrides
  operatorLevel?: number
  trust?: number
}

export interface DamageThreeAttributeTables {
  reference: DamageThreeComparisonResult
  physical: DamageThreeAttributeTableRow[]
  arts: DamageThreeAttributeTableRow[]
  canShowDps: boolean
  errors: string[]
}

const finiteNonnegative = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

/** Aggregate DC3's already resolved per-target components, without applying mitigation or hit counts again. */
function mainAttackMetrics(result: DamageThreeComparisonResult): Pick<DamageThreeAttributeTableRow, 'perAttack' | 'dps'> {
  const output = result.output
  if (!output || output.rows.length !== 1) throw new RangeError('主攻撃の計算結果を取得できません。')
  const row = output.rows[0]
  let perAttack: number
  if (output.guard || output.hasAttackSequence) {
    if (row.attackComponents.some(component => component.role !== 'MAIN' && component.role !== 'ADDITIONAL')) {
      throw new RangeError('主攻撃と追加ダメージの区分が未確認です。')
    }
    const main = row.attackComponents.filter(component => component.role === 'MAIN')
    // A reviewed main action can resolve to no hits. Its successfully evaluated contribution is zero.
    const stage = output.structure?.guardRecipe?.stages.find(stage => stage.id === result.entry.stageId)
    if (!main.length && !stage?.actions.some(action => action.role === 'MAIN'
      && action.timing !== 'PER_SECOND' && action.timing !== 'ON_DEPLOY')) {
      throw new RangeError('主攻撃の内訳を取得できません。')
    }
    if (row.attackComponents.some(component => !finiteNonnegative(component.expectedDamage))) {
      throw new RangeError('主攻撃のダメージが有効な数値ではありません。')
    }
    if (row.perAttack !== row.attackComponents.reduce((sum, component) => sum + component.expectedDamage, 0)) {
      throw new RangeError('主攻撃の内訳と計算結果が一致しません。')
    }
    perAttack = main.reduce((sum, component) => sum + component.expectedDamage, 0)
  } else {
    // Legacy ordinary/counter attacks expose their sole direct attack through the breakdown instead.
    // Poison is separately stored as damageOverTimeDps and is never added here.
    if (output.structure?.guardRecipe || !row.breakdown || row.attackComponents.length
      || !finiteNonnegative(row.perAttack) || row.breakdown.perAttack !== row.perAttack) {
      throw new RangeError('主攻撃の内訳を取得できません。')
    }
    perAttack = row.perAttack
  }
  if (!finiteNonnegative(perAttack)) throw new RangeError('主攻撃のダメージが有効な数値ではありません。')
  if (!output.canShowDps) return { perAttack, dps: null }
  if (!finiteNonnegative(output.attackInterval) || output.attackInterval <= 0) {
    throw new RangeError('主攻撃の攻撃間隔を計算できません。')
  }
  const dps = perAttack / output.attackInterval
  if (!finiteNonnegative(dps)) throw new RangeError('主攻撃のDPSが有効な数値ではありません。')
  return { perAttack, dps }
}

/** Vary DEF for physical main attacks and RES for Arts main attacks; all other selected conditions stay fixed. */
export function evaluateDamageThreeAttributeTables(input: DamageThreeAttributeTablesInput): DamageThreeAttributeTables {
  const { entry, enemyCount, overrides = {} } = input
  const settings: DamageThreeComparisonEvaluationOptions = {
    ...(input.operatorLevel === undefined ? {} : { operatorLevel: input.operatorLevel }),
    ...(input.trust === undefined ? {} : { trust: input.trust }),
  }
  const reference = evaluateDamageThreeComparisonEntry(entry, { defense: 0, resistance: 0, enemyCount }, overrides, settings)
  const errors = [...reference.errors]
  const capability = getDamageCalculatorThreeVirtualAttackCapability(entry.structure, entry.stageId)
  if (!capability.supported) errors.push(capability.reason ?? 'この段階の属性変更は未対応です。')
  // Do not let runtime nulls silently select the comparison evaluator's default growth settings.
  if (input.operatorLevel !== undefined && typeof input.operatorLevel !== 'number') errors.push('オペレーターレベルが有効な数値ではありません。')
  if (input.trust !== undefined && typeof input.trust !== 'number') errors.push('信頼度が有効な数値ではありません。')
  const canShowDps = reference.output?.canShowDps ?? false
  const unavailable = (values: readonly number[]) => values.map(value => ({ value, perAttack: null, dps: null }))
  if (errors.length) return { reference, physical: unavailable(DAMAGE_THREE_ATTRIBUTE_DEFENSE_VALUES),
    arts: unavailable(DAMAGE_THREE_ATTRIBUTE_RESISTANCE_VALUES), canShowDps, errors: [...new Set(errors)] }

  const evaluate = (value: number, virtualMainAttackType: 'PHYSICAL' | 'ARTS'): DamageThreeAttributeTableRow => {
    const result = evaluateDamageThreeComparisonEntry(entry, {
      defense: virtualMainAttackType === 'PHYSICAL' ? value : 0,
      resistance: virtualMainAttackType === 'ARTS' ? value : 0,
      enemyCount,
    }, overrides, { ...settings, virtualMainAttackType })
    const rowErrors = [...result.errors]
    if (result.actualTargetCount !== reference.actualTargetCount) rowErrors.push('属性変更で攻撃対象数が一致しません。')
    if (!rowErrors.length) {
      try { return { value, ...mainAttackMetrics(result) } }
      catch (error) { rowErrors.push(error instanceof Error ? error.message : '主攻撃の計算結果を取得できません。') }
    }
    errors.push(...rowErrors)
    return { value, perAttack: null, dps: null }
  }
  const physical = DAMAGE_THREE_ATTRIBUTE_DEFENSE_VALUES.map(value => evaluate(value, 'PHYSICAL'))
  const arts = DAMAGE_THREE_ATTRIBUTE_RESISTANCE_VALUES.map(value => evaluate(value, 'ARTS'))
  return { reference, physical, arts, canShowDps, errors: [...new Set(errors)] }
}
