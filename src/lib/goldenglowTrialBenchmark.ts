import {
  simulateGoldenglowTargetSwitchHpComparison,
  validateHpComparisonInput,
  type HpComparisonInput,
  type HpComparisonSeries,
} from './goldenglowTargetSwitchHpComparison.ts'
import {
  GOLDENGLOW_TARGET_SWITCH_BENCHMARK_MAX_TRIALS,
  type GoldenglowTargetSwitchExecutionOptions,
} from './goldenglowTargetSwitch.ts'

export const GOLDENGLOW_TRIAL_BENCHMARK_PRESETS = [10_000, 20_000, 50_000, 100_000] as const

/** Presets are defaults; every integer within the benchmark ceiling is valid. */
export function isGoldenglowTrialBenchmarkCount(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= GOLDENGLOW_TARGET_SWITCH_BENCHMARK_MAX_TRIALS
}

export type GoldenglowTrialBenchmarkMessage =
  | { type: 'complete'; elapsedMs: number }
  | { type: 'error'; error: string; kind: 'limit' | 'error' }

export interface GoldenglowTrialBenchmarkSummary {
  samples: number
  medianMs: number
  minMs: number
  maxMs: number
}

const benchmarkOptions: GoldenglowTargetSwitchExecutionOptions = Object.freeze({ trialLimit: 'benchmark' })

/** Allows up to 100,000 trials, while preserving every workload/memory guard. */
export function validateGoldenglowTrialBenchmarkInput(input: HpComparisonInput): void {
  validateHpComparisonInput(input, benchmarkOptions)
}

/** The same complete comparison workload, without charting or progress traffic. */
export function simulateGoldenglowTrialBenchmark(input: HpComparisonInput): HpComparisonSeries[] {
  return simulateGoldenglowTargetSwitchHpComparison(input, undefined, benchmarkOptions)
}

/** Summarizes only completed worker measurements; failures are never samples. */
export function summarizeGoldenglowTrialBenchmark(elapsedMs: readonly number[]): GoldenglowTrialBenchmarkSummary {
  if (!Array.isArray(elapsedMs) || elapsedMs.length === 0) {
    throw new RangeError('計測時間は0以上の有限値を1件以上指定してください。')
  }
  for (const value of elapsedMs) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError('計測時間は0以上の有限値を1件以上指定してください。')
    }
  }
  const sorted = [...elapsedMs].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  const medianMs = sorted.length % 2 === 1
    ? sorted[middle]
    : sorted[middle - 1] / 2 + sorted[middle] / 2
  return { samples: sorted.length, medianMs, minMs: sorted[0], maxMs: sorted[sorted.length - 1] }
}
