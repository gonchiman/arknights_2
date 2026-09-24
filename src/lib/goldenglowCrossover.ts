import { GOLDENGLOW_TARGET_SWITCH_LIMITS } from './goldenglowTargetSwitch.ts'
import {
  GOLDENGLOW_TARGET_SWITCH_GRID_LIMITS, simulateGoldenglowTargetSwitchGrid,
  validateGoldenglowTargetSwitchGridWorkload, type GoldenglowTargetSwitchGridSetup,
} from './goldenglowTargetSwitchGrid.ts'

export const CROSSOVER_MAX_HP_POINTS = 2001
export interface CrossoverSearch {
  startResistance: number; endResistance: number; resistanceStep: number
  startHp: number; endHp: number; hpStep: number; trials: number; seed: number
}
export interface CrossoverBuild {
  label: string
  input: Omit<GoldenglowTargetSwitchGridSetup, 'trials' | 'seed'>
}
export interface CrossoverInput extends CrossoverSearch { x: CrossoverBuild; y: CrossoverBuild }
export interface CrossoverBoundary {
  kind: 'found' | 'from-start' | 'not-found'
  hp: number | null
  previousHp: number | null
}
export interface CrossoverPoint {
  resistance: number
  first: CrossoverBoundary
  sustained: CrossoverBoundary
}
export type CrossoverMessage =
  | { type: 'progress'; completed: number; total: number }
  | { type: 'row'; point: CrossoverPoint }
  | { type: 'complete'; points: CrossoverPoint[] }
  | { type: 'error'; error: string }

/** Include the exact upper bound, even when the last interval is shorter. */
function axis(start: number, end: number, step: number, max: number, maxCount: number, label: string, min: number): number[] {
  if (![start, end, step].every(Number.isSafeInteger) || start < min || end > max || start > end || step < 1 || step > max) {
    throw new RangeError(`${label}は${min}〜${max.toLocaleString('ja-JP')}の整数で、開始値≦終了値、刻み≧1にしてください。`)
  }
  const count = Math.floor((end - start) / step) + 1
  const appendEnd = start + (count - 1) * step !== end
  if (count + Number(appendEnd) > maxCount) throw new RangeError(`${label}は${maxCount.toLocaleString('ja-JP')}点以内になるよう刻みを広げてください。`)
  const values = Array.from({ length: count }, (_, i) => start + i * step)
  if (appendEnd) values.push(end)
  return values
}

export function createCrossoverAxes(input: CrossoverSearch) {
  if (!Number.isSafeInteger(input.trials) || input.trials < 1 || input.trials > GOLDENGLOW_TARGET_SWITCH_LIMITS.maxTrials) {
    throw new RangeError('試行回数は1〜20,000の整数にしてください。')
  }
  if (!Number.isSafeInteger(input.seed) || input.seed < 0 || input.seed > GOLDENGLOW_TARGET_SWITCH_LIMITS.maxSeed) {
    throw new RangeError('抽選番号は0〜4,294,967,295の整数にしてください。')
  }
  return {
    resistances: axis(input.startResistance, input.endResistance, input.resistanceStep, 100, 101, '術耐性', 0),
    hps: axis(input.startHp, input.endHp, input.hpStep, GOLDENGLOW_TARGET_SWITCH_LIMITS.maxEnemyHp, CROSSOVER_MAX_HP_POINTS, '敵HP', 1),
  }
}

/** No monotonicity assumption: examine every sample, treating a tie as not Y-leading. */
export function findCrossoverBoundaries(hps: readonly number[], differences: readonly number[]): Pick<CrossoverPoint, 'first' | 'sustained'> {
  if (!hps.length || hps.length !== differences.length
    || hps.some((hp, i) => !Number.isSafeInteger(hp) || hp < 1 || (i > 0 && hp <= hps[i - 1]))
    || differences.some(value => !Number.isFinite(value))) throw new RangeError('逆転HPの計算点を確認してください。')
  const boundary = (index: number): CrossoverBoundary => index < 0 || index >= hps.length
    ? { kind: 'not-found', hp: null, previousHp: null }
    : { kind: index === 0 ? 'from-start' : 'found', hp: hps[index], previousHp: index === 0 ? null : hps[index - 1] }
  const first = differences.findIndex(value => value > 0)
  let lastNotLeading = -1
  differences.forEach((value, index) => { if (value <= 0) lastNotLeading = index })
  return { first: boundary(first), sustained: boundary(lastNotLeading + 1) }
}

function setup(input: CrossoverInput, build: CrossoverBuild) {
  return { ...build.input, trials: input.trials, seed: input.seed }
}

export function validateCrossoverInput(input: CrossoverInput) {
  const axes = createCrossoverAxes(input)
  if (!input.x?.input || !input.y?.input) throw new RangeError('MOD XとMOD Yの情報を取得できませんでした。')
  const shared = (build: CrossoverBuild) => {
    const s = build.input
    return JSON.stringify([s.skillIndex, s.duration, s.enemyDefense, s.switchDelay, s.retargetRemainingDrones ?? false])
  }
  if (shared(input.x) !== shared(input.y)) throw new RangeError('MOD XとMOD Yのスキル・計測時間・切り替え条件を揃えてください。')
  // Validate both builds at every resistance before emitting any partial result.
  // Each batch keeps the existing grid's memory and work limits intact.
  const batch = axes.hps.slice(0, GOLDENGLOW_TARGET_SWITCH_GRID_LIMITS.maxHpColumns)
  for (const resistance of axes.resistances) for (const build of [input.x, input.y]) {
    validateGoldenglowTargetSwitchGridWorkload({ ...setup(input, build), enemyHps: batch, enemyResistances: [resistance] })
  }
  return axes
}

/** Worker-only sweep. Termination cancels immediately; completed rows are safe to retain. */
export function simulateGoldenglowCrossover(source: CrossoverInput, emit?: (message: CrossoverMessage) => void): CrossoverPoint[] {
  const input = structuredClone(source)
  const { resistances, hps } = validateCrossoverInput(input)
  const total = resistances.length * hps.length * 2
  let completed = 0
  const points: CrossoverPoint[] = []
  for (const resistance of resistances) {
    const means: number[][] = []
    for (const build of [input.x, input.y]) {
      const values: number[] = []
      for (let offset = 0; offset < hps.length; offset += GOLDENGLOW_TARGET_SWITCH_GRID_LIMITS.maxHpColumns) {
        const enemyHps = hps.slice(offset, offset + GOLDENGLOW_TARGET_SWITCH_GRID_LIMITS.maxHpColumns)
        const result = simulateGoldenglowTargetSwitchGrid({
          ...setup(input, build), enemyHps, enemyResistances: [resistance],
        }, undefined, () => { completed++; emit?.({ type: 'progress', completed, total }) })
        values.push(...result.rows[0].expectedDamages)
      }
      means.push(values)
    }
    const point = { resistance, ...findCrossoverBoundaries(hps, means[1].map((value, i) => value - means[0][i])) }
    points.push(point)
    emit?.({ type: 'row', point: structuredClone(point) })
  }
  return points
}

export function formatCrossoverBoundary(boundary: CrossoverBoundary | undefined): string {
  return !boundary ? '—' : boundary.kind === 'from-start' ? '開始HPからY優勢'
    : boundary.kind === 'not-found' ? '上限内で未検出' : boundary.hp!.toLocaleString('ja-JP')
}
