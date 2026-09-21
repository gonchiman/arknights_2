import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { HpComparisonInput } from './goldenglowTargetSwitchHpComparison'
import { validateGoldenglowTrialBenchmarkInput } from './goldenglowTrialBenchmark'
import type { TrialBenchmarkRequest, TrialBenchmarkState } from './goldenglowTrialBenchmarkRunner'
import {
  EMPTY_RUNTIME_CALIBRATION,
  RuntimeCalibrationRunner,
  type RuntimeCalibrationRequest,
  type RuntimeCalibrationState,
} from './goldenglowRuntimeCalibration'
import {
  createRuntimePredictionKey,
  emptyRuntimePredictionHistory,
  predictRuntime,
  readRuntimePredictionHistory,
  recordRuntimeCalibration,
  recordRuntimeMeasurements,
  writeRuntimePredictionHistory,
  type RuntimePrediction,
  type RuntimePredictionHistory,
} from './goldenglowRuntimePrediction'
import { measureGoldenglowTrialBenchmark } from './useGoldenglowTrialBenchmark'

const STORAGE_WARNING = '計測履歴を保存できません。ページを開いている間だけ予測に使います。'

type HistoryStorage = Pick<Storage, 'getItem' | 'setItem'>

function readSavedHistory(): { history: RuntimePredictionHistory; storage: HistoryStorage | null; warning: string | null } {
  try {
    const local = window.localStorage
    let failed = false
    const storage: HistoryStorage = {
      getItem(key) {
        try { return local.getItem(key) } catch (cause) { failed = true; throw cause }
      },
      setItem(key, value) { local.setItem(key, value) },
    }
    const history = readRuntimePredictionHistory(storage)
    return { history, storage, warning: failed ? STORAGE_WARNING : null }
  } catch {
    return { history: emptyRuntimePredictionHistory(), storage: null, warning: STORAGE_WARNING }
  }
}

interface CapturedRun {
  id: string
  recordedLengths: Map<number, number>
}

export interface GoldenglowRuntimePrediction {
  conditionKey: string | null
  predict: (trials: number) => RuntimePrediction | null
  calibrate: () => void
  cancelCalibration: () => void
  calibration: RuntimeCalibrationState
  calibrating: boolean
  storageWarning: string | null
}

/** Prediction is read-only. Workers start only through the explicit calibration action. */
export function useGoldenglowRuntimePrediction(
  input: HpComparisonInput | null,
  benchmark: TrialBenchmarkState,
): GoldenglowRuntimePrediction {
  const [initial] = useState(readSavedHistory)
  const [history, setHistory] = useState(initial.history)
  const [storageWarning, setStorageWarning] = useState(initial.warning)
  const historyRef = useRef(history)
  const capturedRuns = useRef(new WeakMap<TrialBenchmarkRequest, CapturedRun>())
  const capturedCalibrations = useRef(new WeakSet<RuntimeCalibrationRequest>())
  const [calibration, setCalibration] = useState(EMPTY_RUNTIME_CALIBRATION)
  const calibrationRunner = useRef<RuntimeCalibrationRunner | null>(null)
  if (!calibrationRunner.current) {
    calibrationRunner.current = new RuntimeCalibrationRunner(measureGoldenglowTrialBenchmark, setCalibration)
  }
  useEffect(() => () => calibrationRunner.current?.cancel(false), [])
  const conditionKey = useMemo(() => {
    if (!input) return null
    try { return createRuntimePredictionKey(input) } catch { return null }
  }, [input])
  const validationCache = useMemo(() => new Map<number, boolean>(), [conditionKey])

  // Full benchmarks retain completed repeats even if a later repeat fails.
  // Short calibration adds only its final quality-checked samples, all at once.
  useEffect(() => {
    let next = historyRef.current
    if (benchmark.request) {
      let captured = capturedRuns.current.get(benchmark.request)
      if (!captured) {
        captured = { id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, recordedLengths: new Map() }
        capturedRuns.current.set(benchmark.request, captured)
      }
      let key: string | null = null
      try { key = createRuntimePredictionKey(benchmark.request.input) } catch { /* Invalid requests never seed predictions. */ }
      if (key) {
        for (const row of benchmark.rows) {
          if (row.timesMs.length <= (captured.recordedLengths.get(row.trials) ?? 0)) continue
          captured.recordedLengths.set(row.trials, row.timesMs.length)
          next = recordRuntimeMeasurements(next, key, {
            id: `${captured.id}:${row.trials}`,
            trials: row.trials,
            timesMs: row.timesMs,
            measuredAt: Date.now(),
          })
        }
      }
    }
    if (calibration.status === 'complete' && calibration.request
      && !capturedCalibrations.current.has(calibration.request)) {
      capturedCalibrations.current.add(calibration.request)
      const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
      const measuredAt = Date.now()
      const samples = new Map<number, number[]>()
      for (const measurement of calibration.measurements) {
        if (measurement.role !== 'sample') continue
        const times = samples.get(measurement.trials) ?? []
        times.push(measurement.elapsedMs)
        samples.set(measurement.trials, times)
      }
      const recorded = recordRuntimeCalibration(next, calibration.request.key,
        [...samples].map(([trials, timesMs]) => ({ id: `${id}:${trials}`, trials, timesMs, measuredAt })))
      next = recorded.history
      if (!recorded.accepted) {
        setCalibration((current) => current.request === calibration.request && current.status === 'complete'
          ? { ...current, status: 'insufficient', error: '予測に使える安定した結果が得られませんでした。' }
          : current)
      }
    }
    if (next === historyRef.current) return
    historyRef.current = next
    setHistory(next)
    const saved = initial.storage !== null && writeRuntimePredictionHistory(next, initial.storage)
    setStorageWarning(saved ? null : STORAGE_WARNING)
  }, [benchmark.request, benchmark.rows, calibration.request, calibration.measurements, calibration.status, initial.storage])

  useEffect(() => {
    if (calibration.status === 'running'
      && (calibration.request?.key !== conditionKey || benchmark.status === 'running')) {
      calibrationRunner.current?.cancel()
    }
  }, [conditionKey, calibration.request, calibration.status, benchmark.status])

  const predict = useCallback((trials: number): RuntimePrediction | null => {
    if (!input || !conditionKey) return null
    if (!validationCache.has(trials)) {
      try {
        const candidate = structuredClone(input)
        for (const build of candidate.builds) build.input.trials = trials
        validateGoldenglowTrialBenchmarkInput(candidate)
        validationCache.set(trials, true)
      } catch {
        validationCache.set(trials, false)
      }
    }
    return validationCache.get(trials) ? predictRuntime(history, conditionKey, trials) : null
  }, [input, conditionKey, history, validationCache])

  const calibrate = () => {
    if (!input || !conditionKey || benchmark.status === 'running' || calibration.status === 'running') return
    void calibrationRunner.current!.start({ input, key: conditionKey })
  }
  const cancelCalibration = useCallback(() => calibrationRunner.current?.cancel(), [])

  return { conditionKey, predict, calibrate, cancelCalibration,
    calibration, calibrating: calibration.status === 'running', storageWarning }
}
