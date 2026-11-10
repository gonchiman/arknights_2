import { calculateDamageBreakdown, type DamageCalculationBreakdown } from './damageCalculator.ts'
import { getDamageCalculatorThreeVirtualAttackCapability } from './damageCalculatorThree.ts'
import type { DamageThreeAttributeEntry } from './damageCalculatorThreeAttributeComparison.ts'
import {
  evaluateDamageThreeComparisonEntry,
  type DamageThreeComparisonEvaluationOptions,
  type DamageThreeComparisonOverrides,
  type DamageThreeComparisonResult,
} from './damageCalculatorThreeComparison.ts'
import { getEnemyRatingNumericRanges } from './enemyStatRatings.ts'

interface DamageRange {
  min: number
  max: number
}

type StatRange = { min: number; max: number | null }

export interface AttackAttributeRanges {
  defense: StatRange
  resistance: DamageRange
}

export interface DamageThreeAttributeTableRow {
  rating: string
  minStat: number
  maxStat: number | null
  /** Expected main-attack damage per target; additional attacks and periodic damage are excluded. */
  perAttack: DamageRange | null
  dps: DamageRange | null
}

export interface DamageThreeAttributeTablesInput {
  entry: DamageThreeAttributeEntry
  enemyCount: number
  overrides?: DamageThreeComparisonOverrides
  operatorLevel?: number
  trust?: number
  disablePenetration?: boolean
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

function gradeRows(stat: 'defense' | 'magicResistance', range?: StatRange): DamageThreeAttributeTableRow[] {
  return getEnemyRatingNumericRanges(stat).flatMap(({ rating, lowerBound, lowerInclusive, upperBound, upperInclusive }) => {
    const lower = lowerBound === null ? 0 : lowerInclusive ? Math.ceil(lowerBound) : Math.floor(lowerBound) + 1
    const upper = upperBound === null ? null : upperInclusive ? Math.floor(upperBound) : Math.ceil(upperBound) - 1
    const gradeMax = stat === 'magicResistance' ? Math.min(100, upper ?? 100) : upper
    const minStat = Math.max(lower, range?.min ?? 0)
    const maxStat = range?.max == null ? gradeMax : Math.min(range.max, gradeMax ?? range.max)
    if (maxStat !== null && minStat > maxStat) return []
    return [{ rating, minStat, maxStat, perAttack: null, dps: null }]
  })
}

/** Aggregate DC3's already resolved per-target components, without applying mitigation or hit counts again. */
function mainAttackMetrics(result: DamageThreeComparisonResult): { perAttack: number; dps: number | null } {
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

function isMinimumDamage(mitigation: Pick<DamageCalculationBreakdown, 'result' | 'minimumDamage'>): boolean {
  return mitigation.result === mitigation.minimumDamage
}

/** The given DEF is positive. A main branch is at its final value once it is at
 * its floor, has zero contribution, or fully removes further defense increases. */
function isPhysicalDamageSettled(result: DamageThreeComparisonResult): boolean {
  const row = result.output!.rows[0]
  if (row.breakdown) return row.perAttack === 0 || isMinimumDamage(row.breakdown.mitigation)
  return row.attackComponents.every(component => component.role !== 'MAIN' || component.expectedDamage === 0
    || (component.branches.length > 0 && component.branches.every(branch => branch.probability === 0 || branch.damage === 0
      // Weakpoint selection can resolve to Arts; at fixed RES this branch no longer depends on DEF.
      || branch.mitigation.damageType !== 'PHYSICAL'
      || isMinimumDamage(branch.mitigation) || branch.mitigation.defenseBeforeIgnore === 0
      || (branch.defenseIgnoreRatio === 1 && branch.mitigation.defenseIgnoreFixed > 0))))
}

function damageRange(first: number | null, last: number | null): DamageRange | null {
  return first === null || last === null ? null : { min: Math.min(first, last), max: Math.max(first, last) }
}

export function evaluateAttackAttributeTables(attack: number, ranges?: AttackAttributeRanges): Pick<DamageThreeAttributeTables, 'physical' | 'arts'> {
  const physical = gradeRows('defense', ranges?.defense).map(row => {
    const atLowerDefense = calculateDamageBreakdown(attack, 'PHYSICAL', row.minStat, 0)
    const minimum = row.maxStat === null
      ? atLowerDefense.minimumDamage
      : calculateDamageBreakdown(attack, 'PHYSICAL', row.maxStat, 0).result
    return { ...row, perAttack: damageRange(minimum, atLowerDefense.result) }
  })
  const arts = gradeRows('magicResistance', ranges?.resistance).map(row => {
    const maximum = calculateDamageBreakdown(attack, 'ARTS', 0, row.minStat).result
    const minimum = calculateDamageBreakdown(attack, 'ARTS', 0, row.maxStat ?? 100).result
    return { ...row, perAttack: damageRange(minimum, maximum) }
  })
  return { physical, arts }
}

/** Vary DEF for physical main attacks and RES for Arts main attacks; all other selected conditions stay fixed. */
export function evaluateDamageThreeAttributeTables(input: DamageThreeAttributeTablesInput): DamageThreeAttributeTables {
  const { entry, enemyCount, overrides = {} } = input
  const settings: DamageThreeComparisonEvaluationOptions = {
    ...(input.operatorLevel === undefined ? {} : { operatorLevel: input.operatorLevel }),
    ...(input.trust === undefined ? {} : { trust: input.trust }),
    ...(input.disablePenetration ? { disablePenetration: true } : {}),
  }
  const reference = evaluateDamageThreeComparisonEntry(entry, { defense: 0, resistance: 0, enemyCount }, overrides, settings)
  const errors = [...reference.errors]
  const capability = getDamageCalculatorThreeVirtualAttackCapability(entry.structure, entry.stageId)
  if (!capability.supported) errors.push(capability.reason ?? 'この段階の属性変更は未対応です。')
  const stage = entry.structure.guardRecipe?.stages.find(stage => stage.id === entry.stageId)
  if (stage?.actions.some(action => action.role === 'MAIN' && action.basis === 'TARGET_DEFENSE')) {
    errors.push('敵の防御力を基準とする主攻撃は、評価別の範囲計算に対応していません。')
  }
  const mainActions = stage?.actions.filter(action => action.role === 'MAIN') ?? []
  if (mainActions.length > 0 && mainActions.every(action => action.timing === 'PER_SECOND')) {
    errors.push('継続ダメージのみの段階は、1回の攻撃・通常攻撃DPSの範囲表に対応していません。')
  }
  // Do not let runtime nulls silently select the comparison evaluator's default growth settings.
  if (input.operatorLevel !== undefined && typeof input.operatorLevel !== 'number') errors.push('オペレーターレベルが有効な数値ではありません。')
  if (input.trust !== undefined && typeof input.trust !== 'number') errors.push('信頼度が有効な数値ではありません。')
  const canShowDps = reference.output?.canShowDps ?? false
  const physical = gradeRows('defense')
  const arts = gradeRows('magicResistance')
  if (errors.length) return { reference, physical, arts, canShowDps, errors: [...new Set(errors)] }

  const evaluate = (value: number, virtualMainAttackType: 'PHYSICAL' | 'ARTS', checkFloor = false) => {
    const result = evaluateDamageThreeComparisonEntry(entry, {
      defense: virtualMainAttackType === 'PHYSICAL' ? value : 0,
      resistance: virtualMainAttackType === 'ARTS' ? value : 0,
      enemyCount,
    }, overrides, { ...settings, virtualMainAttackType })
    const rowErrors = [...result.errors]
    if (result.actualTargetCount !== reference.actualTargetCount) rowErrors.push('属性変更で攻撃対象数が一致しません。')
    if (!rowErrors.length) {
      try {
        return { ...mainAttackMetrics(result), settled: checkFloor && isPhysicalDamageSettled(result) }
      }
      catch (error) { rowErrors.push(error instanceof Error ? error.message : '主攻撃の計算結果を取得できません。') }
    }
    errors.push(...rowErrors)
    return null
  }

  function evaluateGrade(row: DamageThreeAttributeTableRow, type: 'PHYSICAL' | 'ARTS'): DamageThreeAttributeTableRow {
    const { minStat, maxStat } = row
    const first = evaluate(minStat, type, maxStat === null)
    if (!first) return row
    // With fixed skill conditions, these attributes can only reduce main attack damage.
    // Finite grades use both endpoints. An open DEF grade uses a proven plateau.
    let last = first
    if (maxStat === null) {
      let defense = minStat
      while (!last.settled) {
        defense *= 2
        if (!Number.isSafeInteger(defense)) {
          errors.push('防御力SSの最低ダメージを取得できません。')
          return row
        }
        const sample = evaluate(defense, type, true)
        if (!sample) return row
        last = sample
      }
    } else if (maxStat !== minStat) {
      const sample = evaluate(maxStat, type)
      if (!sample) return row
      last = sample
    }
    return { ...row, perAttack: damageRange(first.perAttack, last.perAttack), dps: damageRange(first.dps, last.dps) }
  }

  const physicalResults = physical.map(row => evaluateGrade(row, 'PHYSICAL'))
  const artsResults = arts.map(row => evaluateGrade(row, 'ARTS'))
  return { reference, physical: physicalResults, arts: artsResults, canShowDps, errors: [...new Set(errors)] }
}
