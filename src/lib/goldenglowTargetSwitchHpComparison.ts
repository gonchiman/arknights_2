import {
  GOLDENGLOW_TARGET_SWITCH_HP_LIMITS,
  simulateGoldenglowTargetSwitchHp,
  type GoldenglowDamageBreakdown,
  type GoldenglowTargetSwitchHpInput,
  type GoldenglowTargetSwitchHpPoint,
} from './goldenglowTargetSwitchHp.ts'
import {
  GOLDENGLOW_TARGET_SWITCH_GRID_LIMITS,
  validateGoldenglowTargetSwitchGridWorkload,
} from './goldenglowTargetSwitchGrid.ts'
import type { GoldenglowTargetSwitchExecutionOptions } from './goldenglowTargetSwitch.ts'

export const HP_COMPARISON_LIMITS = {
  maxBuilds: 8,
  maxDroneOpportunities: GOLDENGLOW_TARGET_SWITCH_GRID_LIMITS.maxDroneOpportunities,
} as const

interface HpComparisonIdentity {
  id: string
  label: string
  moduleType?: string | null
  potential?: number
}

export interface HpComparisonBuild extends HpComparisonIdentity {
  input: GoldenglowTargetSwitchHpInput
}

export interface HpComparisonInput {
  builds: readonly HpComparisonBuild[]
}

export interface HpComparisonSeries extends HpComparisonIdentity {
  points: GoldenglowTargetSwitchHpPoint[]
}

export type HpComparisonMessage =
  | { type: 'point'; buildId: string; point: GoldenglowTargetSwitchHpPoint; completedPoints: number; totalPoints: number }
  | { type: 'complete'; series: HpComparisonSeries[] }
  | { type: 'error'; error: string }

export type HpComparisonMetric = 'total' | 'difference' | 'percent'

export interface HpComparisonDisplaySeries extends HpComparisonIdentity {
  points: { enemyHp: number; value: number | null; damageBreakdown?: GoldenglowDamageBreakdown }[]
}

/** All selected builds must pass validation before any simulation starts. */
export function validateHpComparisonInput(input: HpComparisonInput, options?: GoldenglowTargetSwitchExecutionOptions): void {
  snapshotComparison(input, options)
}

/**
 * Runs one MOD at a time so only one draw buffer is alive. Each build uses its
 * own PRD parameters with the common seed, exactly as an independent HP sweep.
 */
export function simulateGoldenglowTargetSwitchHpComparison(
  input: HpComparisonInput,
  onPoint?: (message: Extract<HpComparisonMessage, { type: 'point' }>) => void,
  options?: GoldenglowTargetSwitchExecutionOptions,
): HpComparisonSeries[] {
  const builds = snapshotComparison(input, options)
  const totalPoints = builds.reduce((total, build) => total + build.input.enemyHps.length, 0)
  let completedPoints = 0
  return builds.map((build) => {
    const result = simulateGoldenglowTargetSwitchHp(build.input, (point) => {
      completedPoints += 1
      onPoint?.({
        type: 'point', buildId: build.id,
        point: {
          ...point,
          ...(point.damageBreakdown ? { damageBreakdown: { ...point.damageBreakdown } } : {}),
        },
        completedPoints, totalPoints,
      })
    }, options)
    return { ...copyComparisonIdentity(build), points: result.points }
  })
}

export function chooseHpComparisonBaseline(
  series: readonly { id: string }[],
  requestedId: string,
): string {
  return series.find((item) => item.id === requestedId)?.id
    ?? series.find((item) => item.id === 'none')?.id
    ?? series[0]?.id
    ?? ''
}

/** Presentation only: no simulation, interpolation, rounding or input mutation. */
export function createHpComparisonDisplaySeries(
  series: readonly HpComparisonSeries[],
  enemyHps: readonly number[],
  metric: HpComparisonMetric,
  baselineId: string,
): HpComparisonDisplaySeries[] {
  const selectedBaseline = chooseHpComparisonBaseline(series, baselineId)
  const values = new Map(series.map((item) => [
    item.id,
    new Map(item.points.map((point) => [point.enemyHp, point])),
  ]))
  const baseline = values.get(selectedBaseline)
  return series.map((item) => ({
    ...copyComparisonIdentity(item),
    points: enemyHps.map((enemyHp) => {
      const point = values.get(item.id)?.get(enemyHp)
      const total = point?.expectedDamage
      const base = baseline?.get(enemyHp)?.expectedDamage
      let value: number | null = null
      if (total !== undefined && Number.isFinite(total)) {
        if (metric === 'total') value = total
        else if (base !== undefined && Number.isFinite(base)) {
          if (metric === 'difference') value = total - base
          else if (base !== 0) value = (total - base) / base * 100
        }
      }
      return {
        enemyHp, value,
        ...(metric === 'total' && value !== null && point?.damageBreakdown
          ? { damageBreakdown: { ...point.damageBreakdown } } : {}),
      }
    }),
  }))
}

/**
 * Samples the complete HP range and retains a selected table row. Counts below
 * one become one; fractions round down and non-finite counts fall back to five.
 * With at least three samples, the minimum and maximum HP are always retained.
 */
export function selectHpComparisonBarHps(
  enemyHps: readonly number[],
  selectedHp: number | null = null,
  count: number | 'all' = 5,
): number[] {
  const hps = [...new Set(enemyHps.filter((hp) => Number.isFinite(hp) && hp > 0))]
    .sort((left, right) => left - right)
  const sampleCount = count === 'all' ? hps.length
    : Math.min(hps.length, Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 5)
  if (hps.length <= sampleCount) return hps
  const sampled = Array.from({ length: sampleCount }, (_, index) => (
    hps[sampleCount === 1 ? 0 : Math.round(index * (hps.length - 1) / (sampleCount - 1))]
  ))
  if (selectedHp !== null && hps.includes(selectedHp) && !sampled.includes(selectedHp)) {
    const firstReplaceableIndex = sampleCount >= 3 ? 1 : 0
    const lastReplaceableIndex = sampleCount >= 3 ? sampleCount - 2 : sampleCount - 1
    let closestIndex = firstReplaceableIndex
    for (let index = firstReplaceableIndex + 1; index <= lastReplaceableIndex; index += 1) {
      if (Math.abs(sampled[index] - selectedHp) < Math.abs(sampled[closestIndex] - selectedHp)) {
        closestIndex = index
      }
    }
    sampled[closestIndex] = selectedHp
    sampled.sort((left, right) => left - right)
  }
  return sampled
}

/**
 * Uses the plot width excluding margins, with room for each grouped series.
 * Unmeasured/invalid widths use five HPs; invalid series counts use one series.
 */
export function getHpComparisonAutoBarCount(plotWidth: number, seriesCount: number): number {
  if (!Number.isFinite(plotWidth) || plotWidth <= 0) return 5
  const visibleSeries = Number.isFinite(seriesCount) && seriesCount > 0 ? Math.ceil(seriesCount) : 1
  const groupWidth = Math.max(62, visibleSeries * 16 + 14)
  return Math.max(5, Math.min(15, Math.floor(plotWidth / groupWidth)))
}

/** Unlike the configurable comparison, an unequipped difference never changes its baseline. */
export function createHpComparisonUnequippedDifferenceSeries(
  series: readonly HpComparisonSeries[],
  enemyHps: readonly number[],
): HpComparisonDisplaySeries[] {
  if (series.some((item) => item.id === 'none')) {
    return createHpComparisonDisplaySeries(series, enemyHps, 'difference', 'none')
  }
  return series.map((item) => ({
    ...copyComparisonIdentity(item),
    points: enemyHps.map((enemyHp) => ({ enemyHp, value: null })),
  }))
}

function copyComparisonIdentity(item: HpComparisonIdentity): HpComparisonIdentity {
  return {
    id: item.id,
    label: item.label,
    ...(item.moduleType !== undefined ? { moduleType: item.moduleType } : {}),
    ...(item.potential !== undefined ? { potential: item.potential } : {}),
  }
}

function snapshotComparison(input: HpComparisonInput, options?: GoldenglowTargetSwitchExecutionOptions): HpComparisonBuild[] {
  if (!input || !Array.isArray(input.builds)
    || input.builds.length < 1 || input.builds.length > HP_COMPARISON_LIMITS.maxBuilds) {
    throw new RangeError(`比較するMODは1〜${HP_COMPARISON_LIMITS.maxBuilds}件選んでください。`)
  }
  const ids = new Set<string>()
  let sharedKey: string | undefined
  let totalWork = 0
  const sourceBuilds: readonly HpComparisonBuild[] = input.builds
  const builds = sourceBuilds.map((build) => {
    if (!build || typeof build.id !== 'string' || !build.id.trim()
      || typeof build.label !== 'string' || !build.label.trim()) {
      throw new RangeError('比較するMODの情報を確認してください。')
    }
    if (ids.has(build.id)) throw new RangeError('比較するMODが重複しています。')
    ids.add(build.id)
    const setup = build.input
    if (!setup || !Array.isArray(setup.enemyHps)) throw new RangeError('敵HPを配列で指定してください。')
    if (setup.enemyHps.some((hp) => !Number.isSafeInteger(hp)
      || hp < 1 || hp > GOLDENGLOW_TARGET_SWITCH_HP_LIMITS.maxEnemyHp)) {
      throw new RangeError('敵HPは1〜1,000,000,000の整数で指定してください。')
    }
    const snapshot = { ...setup, enemyHps: [...setup.enemyHps], model: setup.model && { ...setup.model } }
    try {
      totalWork += validateGoldenglowTargetSwitchGridWorkload({
        ...snapshot, enemyResistances: [snapshot.enemyResistance],
      }, options)
    } catch (cause) {
      if (cause instanceof RangeError) {
        throw new RangeError(cause.message.replaceAll('表全体', 'HP全体')
          .replaceAll('表の抽選データ', '抽選データ').replaceAll('HP・術耐性の点数', 'HPの点数'))
      }
      throw cause
    }
    const key = JSON.stringify([
      snapshot.skillIndex, snapshot.duration, snapshot.enemyDefense, snapshot.enemyResistance,
      snapshot.switchDelay, snapshot.retargetRemainingDrones ?? false, snapshot.trials,
      snapshot.seed, snapshot.enemyHps,
    ])
    if (sharedKey !== undefined && sharedKey !== key) {
      throw new RangeError('比較するMODのスキル・敵条件・計測時間・試行回数・抽選番号を揃えてください。')
    }
    sharedKey = key
    return { ...copyComparisonIdentity(build), input: snapshot }
  })
  if (totalWork > HP_COMPARISON_LIMITS.maxDroneOpportunities) {
    throw new RangeError('MOD比較全体の計算量が上限を超えています。MOD数・HPの点数・計測時間・試行回数を減らしてください。')
  }
  return builds
}
