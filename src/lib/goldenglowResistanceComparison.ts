import type { GoldenglowTargetSwitchExecutionOptions } from './goldenglowTargetSwitch.ts'
import {
  GOLDENGLOW_TARGET_SWITCH_GRID_LIMITS,
  simulateGoldenglowTargetSwitchGrid,
  validateGoldenglowTargetSwitchGridWorkload,
  type GoldenglowTargetSwitchGridInput,
} from './goldenglowTargetSwitchGrid.ts'
import {
  GOLDENGLOW_TARGET_SWITCH_HP_LIMITS,
  type GoldenglowDamageBreakdown,
  type GoldenglowTargetSwitchHpPoint,
} from './goldenglowTargetSwitchHp.ts'
import {
  HP_COMPARISON_LIMITS,
  createHpComparisonDisplaySeries,
  type HpComparisonBuild,
  type HpComparisonMetric,
  type HpComparisonSeries,
} from './goldenglowTargetSwitchHpComparison.ts'

export interface ResistanceComparisonInput {
  builds: readonly HpComparisonBuild[]
  enemyResistances: readonly number[]
}

export interface ResistanceComparisonPoint extends GoldenglowTargetSwitchHpPoint {
  enemyResistance: number
}

type ComparisonIdentity = Omit<HpComparisonSeries, 'points'>

export interface ResistanceComparisonSeries extends ComparisonIdentity {
  points: ResistanceComparisonPoint[]
}

export interface ResistanceComparisonDisplaySeries extends ComparisonIdentity {
  points: {
    enemyHp: number
    enemyResistance: number
    value: number | null
    damageBreakdown?: GoldenglowDamageBreakdown
  }[]
}

export type ResistanceComparisonMessage =
  | { type: 'point'; buildId: string; point: ResistanceComparisonPoint; completedPoints: number; totalPoints: number }
  | { type: 'complete'; series: ResistanceComparisonSeries[] }
  | { type: 'error'; error: string }

interface SnapshotBuild extends ComparisonIdentity {
  input: GoldenglowTargetSwitchGridInput
}

/** Validate every MOD and resistance, including their aggregate cost, before drawing PRD patterns. */
export function validateResistanceComparisonInput(
  input: ResistanceComparisonInput,
  options?: GoldenglowTargetSwitchExecutionOptions,
): void {
  snapshotComparison(input, options)
}

/**
 * Builds run sequentially with their own PRD settings and a common seed. Within
 * each build the grid shares indexed draws across every HP/resistance condition.
 * Points retain build, resistance, then HP input order. Callback objects are
 * separate from both the frozen input snapshot and the final complete result.
 */
export function simulateGoldenglowResistanceComparison(
  input: ResistanceComparisonInput,
  onPoint?: (message: Extract<ResistanceComparisonMessage, { type: 'point' }>) => void,
  options?: GoldenglowTargetSwitchExecutionOptions,
): ResistanceComparisonSeries[] {
  const executionOptions = options && { ...options }
  const builds = snapshotComparison(input, executionOptions)
  const totalPoints = builds.reduce((total, build) => (
    total + build.input.enemyHps.length * build.input.enemyResistances.length
  ), 0)
  let completedPoints = 0
  return builds.map((build) => {
    const result = simulateGoldenglowTargetSwitchGrid(build.input, undefined, (point) => {
      completedPoints += 1
      onPoint?.({ type: 'point', buildId: build.id, point, completedPoints, totalPoints })
    }, executionOptions)
    return {
      ...copyIdentity(build),
      points: result.rows.flatMap((row) => build.input.enemyHps.map((enemyHp, index) => ({
        enemyHp,
        enemyResistance: row.enemyResistance,
        expectedDamage: row.expectedDamages[index],
        damageBreakdown: { ...row.damageBreakdowns[index] },
      }))),
    }
  })
}

/** Presentation only: compare each exact HP/RES pair, leaving missing cells null. */
export function createResistanceComparisonDisplaySeries(
  series: readonly ResistanceComparisonSeries[],
  enemyHps: readonly number[],
  enemyResistances: readonly number[],
  metric: HpComparisonMetric,
  baselineId: string,
): ResistanceComparisonDisplaySeries[] {
  const display: ResistanceComparisonDisplaySeries[] = series.map((item) => ({ ...copyIdentity(item), points: [] }))
  for (const enemyResistance of enemyResistances) {
    const resistanceSeries = series.map((item) => ({
      ...copyIdentity(item),
      points: item.points.filter((point) => point.enemyResistance === enemyResistance),
    }))
    // Reuse the single-RES baseline fallback, finite-value and zero-base rules.
    const resistanceDisplay = createHpComparisonDisplaySeries(resistanceSeries, enemyHps, metric, baselineId)
    resistanceDisplay.forEach((item, index) => {
      display[index].points.push(...item.points.map((point) => ({ ...point, enemyResistance })))
    })
  }
  return display
}

function copyIdentity(item: ComparisonIdentity): ComparisonIdentity {
  return {
    id: item.id,
    label: item.label,
    ...(item.moduleType !== undefined ? { moduleType: item.moduleType } : {}),
    ...(item.potential !== undefined ? { potential: item.potential } : {}),
  }
}

function snapshotComparison(
  input: ResistanceComparisonInput,
  options?: GoldenglowTargetSwitchExecutionOptions,
): SnapshotBuild[] {
  if (!input || !Array.isArray(input.builds)
    || input.builds.length < 1 || input.builds.length > HP_COMPARISON_LIMITS.maxBuilds) {
    throw new RangeError(`比較するMODは1〜${HP_COMPARISON_LIMITS.maxBuilds}件選んでください。`)
  }
  if (!Array.isArray(input.enemyResistances)) throw new RangeError('術耐性を配列で指定してください。')
  const enemyResistances = [...input.enemyResistances]
  if (new Set(enemyResistances).size !== enemyResistances.length) {
    throw new RangeError('術耐性の値が重複しています。')
  }
  const ids = new Set<string>()
  let sharedKey: string | undefined
  let totalWork = 0
  const builds = Array.from(input.builds).map((build): SnapshotBuild => {
    if (!build || typeof build.id !== 'string' || !build.id.trim()
      || typeof build.label !== 'string' || !build.label.trim()) {
      throw new RangeError('比較するMODの情報を確認してください。')
    }
    if (ids.has(build.id)) throw new RangeError('比較するMODが重複しています。')
    ids.add(build.id)
    const setup = build.input
    if (!setup || !Array.isArray(setup.enemyHps)) throw new RangeError('敵HPを配列で指定してください。')
    const enemyHps = [...setup.enemyHps]
    if (enemyHps.some((hp) => !Number.isSafeInteger(hp)
      || hp < 1 || hp > GOLDENGLOW_TARGET_SWITCH_HP_LIMITS.maxEnemyHp)) {
      throw new RangeError('敵HPは1〜1,000,000,000の整数で指定してください。')
    }
    if (new Set(enemyHps).size !== enemyHps.length) throw new RangeError('敵HPの値が重複しています。')
    // The original single-RES input is intentionally replaced by the selected axis.
    const { enemyResistance: _singleResistance, ...gridSetup } = setup
    const snapshot = { ...gridSetup, enemyHps, enemyResistances, model: setup.model && { ...setup.model } }
    totalWork += validateGoldenglowTargetSwitchGridWorkload(snapshot, options)
    const key = JSON.stringify([
      snapshot.skillIndex, snapshot.duration, snapshot.enemyDefense,
      snapshot.switchDelay, snapshot.retargetRemainingDrones ?? false,
      snapshot.trials, snapshot.seed, snapshot.enemyHps,
    ])
    if (sharedKey !== undefined && sharedKey !== key) {
      throw new RangeError('比較するMODのスキル・敵条件・計測時間・試行回数・抽選番号を揃えてください。')
    }
    sharedKey = key
    return { ...copyIdentity(build), input: snapshot }
  })
  if (totalWork > GOLDENGLOW_TARGET_SWITCH_GRID_LIMITS.maxDroneOpportunities) {
    throw new RangeError('MOD比較全体の計算量が上限を超えています。MOD数・HPと術耐性の点数・計測時間・試行回数を減らしてください。')
  }
  return builds
}
