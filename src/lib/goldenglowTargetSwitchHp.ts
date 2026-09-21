import { GOLDENGLOW_TARGET_SWITCH_LIMITS, type GoldenglowTargetSwitchExecutionOptions } from './goldenglowTargetSwitch.ts'
import {
  GOLDENGLOW_TARGET_SWITCH_GRID_LIMITS,
  simulateGoldenglowTargetSwitchGrid,
  type GoldenglowDamageBreakdown,
  type GoldenglowTargetSwitchGridSetup,
} from './goldenglowTargetSwitchGrid.ts'

export type { GoldenglowDamageBreakdown } from './goldenglowTargetSwitchGrid.ts'

export const GOLDENGLOW_TARGET_SWITCH_HP_LIMITS = {
  maxPoints: GOLDENGLOW_TARGET_SWITCH_GRID_LIMITS.maxHpColumns,
  maxEnemyHp: GOLDENGLOW_TARGET_SWITCH_LIMITS.maxEnemyHp,
} as const

export interface GoldenglowTargetSwitchHpInput extends GoldenglowTargetSwitchGridSetup {
  enemyResistance: number
  enemyHps: readonly number[]
}

export interface GoldenglowTargetSwitchHpPoint {
  enemyHp: number
  /** Mean total damage after resistance, including overkill. */
  expectedDamage: number
  /** Present for simulation output; optional for previously stored points. */
  damageBreakdown?: GoldenglowDamageBreakdown
}

export interface GoldenglowTargetSwitchHpResult {
  points: GoldenglowTargetSwitchHpPoint[]
  trials: number
  seed: number
  duration: number
}

export type GoldenglowTargetSwitchHpMessage =
  | { type: 'point'; point: GoldenglowTargetSwitchHpPoint; completedPoints: number; totalPoints: number }
  | { type: 'complete'; result: GoldenglowTargetSwitchHpResult }
  | { type: 'error'; error: string }

/** HP 0 is an axis origin, never a simulation target. The last sample is <= end. */
export function createGoldenglowTargetSwitchHpValues(start: number, end: number, step: number): number[] {
  validateHpInteger(start, '開始HP')
  validateHpInteger(end, '終了HP')
  validateHpInteger(step, 'HPの刻み')
  if (start > end) throw new RangeError('終了HPは開始HP以上にしてください。')
  const count = Math.floor((end - start) / step) + 1
  validatePointCount(count)
  return Array.from({ length: count }, (_, index) => start + index * step)
}

/**
 * Uses the grid's common seeded PRD patterns and independent actor scheduler.
 * All axes, model parameters and aggregate work are checked before the first
 * progress notification. Run in a Worker and terminate it to cancel a sweep.
 */
export function simulateGoldenglowTargetSwitchHp(
  input: GoldenglowTargetSwitchHpInput,
  onPoint?: (point: GoldenglowTargetSwitchHpPoint, completedPoints: number, totalPoints: number) => void,
  options?: GoldenglowTargetSwitchExecutionOptions,
): GoldenglowTargetSwitchHpResult {
  if (!input || !Array.isArray(input.enemyHps)) throw new RangeError('敵HPを配列で指定してください。')
  validatePointCount(input.enemyHps.length)
  input.enemyHps.forEach((hp) => validateHpInteger(hp, '敵HP'))
  const enemyHps = [...input.enemyHps]
  try {
    const result = simulateGoldenglowTargetSwitchGrid({
      ...input, enemyHps, enemyResistances: [input.enemyResistance],
    }, undefined, (cell, completedPoints, totalPoints) => {
      onPoint?.({
        enemyHp: cell.enemyHp, expectedDamage: cell.expectedDamage,
        damageBreakdown: { ...cell.damageBreakdown },
      }, completedPoints, totalPoints)
    }, options)
    return {
      points: result.rows[0].expectedDamages.map((expectedDamage, index) => ({
        enemyHp: enemyHps[index], expectedDamage,
        damageBreakdown: { ...result.rows[0].damageBreakdowns[index] },
      })),
      trials: result.trials,
      seed: result.seed,
      duration: result.duration,
    }
  } catch (cause) {
    if (cause instanceof RangeError) {
      throw new RangeError(cause.message
        .replaceAll('表全体', 'HP全体')
        .replaceAll('表の抽選データ', '抽選データ')
        .replaceAll('HP・術耐性の点数', 'HPの点数'))
    }
    throw cause
  }
}

function validateHpInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > GOLDENGLOW_TARGET_SWITCH_HP_LIMITS.maxEnemyHp) {
    throw new RangeError(`${label}は1〜1,000,000,000の整数で指定してください。`)
  }
}

function validatePointCount(count: number): void {
  if (count < 1 || count > GOLDENGLOW_TARGET_SWITCH_HP_LIMITS.maxPoints) {
    throw new RangeError(`HPは1〜${GOLDENGLOW_TARGET_SWITCH_HP_LIMITS.maxPoints}点で指定してください。`)
  }
}
