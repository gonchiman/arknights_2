import { calculateDamageBreakdown, type DamageCalculationBreakdown } from './damageCalculator.ts'
import { getDamageCalculatorThreeVirtualAttackCapability } from './damageCalculatorThree.ts'
import type { DamageThreeAttributeEntry, DamageThreeAttributeType } from './damageCalculatorThreeAttributeComparison.ts'
import {
  evaluateDamageThreeComparisonEntry,
  type DamageThreeComparisonEvaluationOptions,
  type DamageThreeComparisonOverrides,
  type DamageThreeComparisonResult,
} from './damageCalculatorThreeComparison.ts'
import { getEnemyRatingNumericRanges } from './enemyStatRatings.ts'
import type { EnemyResistanceThreshold } from './enemyDefenseResistance.ts'

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

type DamageThreeAttributeRankPair = Pick<EnemyResistanceThreshold, 'resistance' | 'defense' | 'percentage'>

export interface DamageThreeAttributeRankRow extends DamageThreeAttributeRankPair {
  physical: number | null
  arts: number | null
}

export interface DamageThreeAttributeRankTable {
  reference: DamageThreeComparisonResult
  rows: DamageThreeAttributeRankRow[]
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
function mainAttackDamage(result: DamageThreeComparisonResult): number {
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
  return perAttack
}

function mainAttackDps(result: DamageThreeComparisonResult, perAttack: number): number | null {
  const output = result.output!
  if (!output.canShowDps) return null
  if (!finiteNonnegative(output.attackInterval) || output.attackInterval <= 0) {
    throw new RangeError('主攻撃の攻撃間隔を計算できません。')
  }
  const dps = perAttack / output.attackInterval
  if (!finiteNonnegative(dps)) throw new RangeError('主攻撃のDPSが有効な数値ではありません。')
  return dps
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

function createAttributeEvaluator(input: DamageThreeAttributeTablesInput, table: 'rating' | 'rank') {
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
    errors.push(table === 'rating' ? '敵の防御力を基準とする主攻撃は、評価別の範囲計算に対応していません。'
      : '敵の防御力を基準とする主攻撃は、出現順位別の属性比較に対応していません。')
  }
  const mainActions = stage?.actions.filter(action => action.role === 'MAIN') ?? []
  if (mainActions.length > 0 && mainActions.every(action => action.timing === 'PER_SECOND')) {
    errors.push('継続ダメージのみの段階は、1回の攻撃ダメージを表示できません。')
  }
  // Do not let runtime nulls silently select the comparison evaluator's default growth settings.
  if (input.operatorLevel !== undefined && typeof input.operatorLevel !== 'number') errors.push('オペレーターレベルが有効な数値ではありません。')
  if (input.trust !== undefined && typeof input.trust !== 'number') errors.push('信頼度が有効な数値ではありません。')
  function evaluate(defense: number, resistance: number, virtualMainAttackType: DamageThreeAttributeType, checkFloor = false) {
    const result = evaluateDamageThreeComparisonEntry(entry, { defense, resistance, enemyCount },
      overrides, { ...settings, virtualMainAttackType })
    const rowErrors = [...result.errors]
    if (result.actualTargetCount !== reference.actualTargetCount) rowErrors.push('属性変更で攻撃対象数が一致しません。')
    if (!rowErrors.length) {
      try {
        const perAttack = mainAttackDamage(result)
        const dps = table === 'rating' ? mainAttackDps(result, perAttack) : null
        return { perAttack, dps, settled: checkFloor && isPhysicalDamageSettled(result) }
      }
      catch (error) { rowErrors.push(error instanceof Error ? error.message : '主攻撃の計算結果を取得できません。') }
    }
    errors.push(...rowErrors)
    return null
  }
  return { reference, errors, evaluate }
}

/** Vary DEF for physical main attacks and RES for Arts main attacks; all other selected conditions stay fixed. */
export function evaluateDamageThreeAttributeTables(input: DamageThreeAttributeTablesInput): DamageThreeAttributeTables {
  const { reference, errors, evaluate } = createAttributeEvaluator(input, 'rating')
  const canShowDps = reference.output?.canShowDps ?? false
  const physical = gradeRows('defense')
  const arts = gradeRows('magicResistance')
  if (errors.length) return { reference, physical, arts, canShowDps, errors: [...new Set(errors)] }

  function evaluateGrade(row: DamageThreeAttributeTableRow, type: DamageThreeAttributeType): DamageThreeAttributeTableRow {
    const { minStat, maxStat } = row
    const evaluateStat = (value: number, checkFloor = false) => type === 'PHYSICAL'
      ? evaluate(value, 0, type, checkFloor)
      : evaluate(0, value, type, checkFloor)
    const first = evaluateStat(minStat, maxStat === null)
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
        const sample = evaluateStat(defense, true)
        if (!sample) return row
        last = sample
      }
    } else if (maxStat !== minStat) {
      const sample = evaluateStat(maxStat)
      if (!sample) return row
      last = sample
    }
    return { ...row, perAttack: damageRange(first.perAttack, last.perAttack), dps: damageRange(first.dps, last.dps) }
  }

  const physicalResults = physical.map(row => evaluateGrade(row, 'PHYSICAL'))
  const artsResults = arts.map(row => evaluateGrade(row, 'ARTS'))
  return { reference, physical: physicalResults, arts: artsResults, canShowDps, errors: [...new Set(errors)] }
}

/** Use the same appearance-rank DEF/RES pair for both virtual attributes. */
export function evaluateDamageThreeAttributeRankTable(
  input: DamageThreeAttributeTablesInput,
  pairs: readonly DamageThreeAttributeRankPair[],
): DamageThreeAttributeRankTable {
  const { reference, errors, evaluate } = createAttributeEvaluator(input, 'rank')
  const invalidInput = errors.length > 0
  const rows = pairs.map(({ resistance, defense, percentage }): DamageThreeAttributeRankRow => {
    const row = { resistance, defense, percentage, physical: null, arts: null }
    if (invalidInput || defense === null) return row

    const physical = evaluate(defense, resistance, 'PHYSICAL')
    const arts = evaluate(defense, resistance, 'ARTS')
    return physical && arts ? { ...row, physical: physical.perAttack, arts: arts.perAttack } : row
  })
  return { reference, rows, errors: [...new Set(errors)] }
}
