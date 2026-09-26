import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ResistanceComparisonInput, ResistanceComparisonMessage, ResistanceComparisonSeries,
} from '../lib/goldenglowResistanceComparison'

export interface ResistanceSimulationRequest {
  input: ResistanceComparisonInput
  minHp: number
  key: string
  buildLabel: string
  skillLabel: string
  operatorLabel: string
}

interface ResistanceSimulationState {
  request: ResistanceSimulationRequest | null
  series: ResistanceComparisonSeries[]
  status: 'idle' | 'running' | 'complete' | 'cancelled' | 'error'
  error: string | null
  completedPoints: number
  totalPoints: number
}

export function useGoldenglowResistanceSimulation() {
  const [state, setState] = useState<ResistanceSimulationState>({
    request: null, series: [], status: 'idle', error: null, completedPoints: 0, totalPoints: 0,
  })
  const workerRef = useRef<Worker | null>(null)
  const stop = useCallback(() => {
    const worker = workerRef.current
    workerRef.current = null
    if (!worker) return
    worker.onmessage = null
    worker.onerror = null
    worker.onmessageerror = null
    worker.terminate()
  }, [])
  useEffect(() => stop, [stop])

  const start = useCallback((request: ResistanceSimulationRequest) => {
    stop()
    let snapshot: ResistanceSimulationRequest
    try {
      snapshot = structuredClone(request)
    } catch {
      setState((previous) => ({ ...previous, status: 'error', error: '計算条件を読み取れませんでした。条件を確認して再計算してください。' }))
      return
    }
    const emptySeries: ResistanceComparisonSeries[] = snapshot.input.builds.map((build) => ({
      id: build.id, label: build.label, moduleType: build.moduleType, potential: build.potential, points: [],
    }))
    const totalPoints = snapshot.input.builds.reduce((total, build) => total + build.input.enemyHps.length * snapshot.input.enemyResistances.length, 0)
    setState({ request: snapshot, series: emptySeries, status: 'running', error: null, completedPoints: 0, totalPoints })
    try {
      const worker = new Worker(new URL('../lib/goldenglowResistanceComparison.worker.ts', import.meta.url), { type: 'module' })
      workerRef.current = worker
      const fail = (message: string) => {
        if (workerRef.current !== worker) return
        stop()
        setState((previous) => previous.request === snapshot ? { ...previous, status: 'error', error: message } : previous)
      }
      worker.onmessage = (event: MessageEvent<ResistanceComparisonMessage>) => {
        if (workerRef.current !== worker) return
        const message = event.data
        if (message.type === 'point') {
          setState((previous) => previous.request === snapshot ? {
            ...previous,
            completedPoints: message.completedPoints,
            totalPoints: message.totalPoints,
            series: previous.series.map((series) => series.id === message.buildId
              ? { ...series, points: [...series.points, message.point] } : series),
          } : previous)
        } else if (message.type === 'complete') {
          stop()
          setState((previous) => previous.request === snapshot ? {
            ...previous, series: message.series, status: 'complete', error: null,
            completedPoints: message.series.reduce((total, series) => total + series.points.length, 0),
          } : previous)
        } else fail(message.error)
      }
      worker.onerror = () => fail('計算を完了できませんでした。条件を確認して再計算してください。')
      worker.onmessageerror = () => fail('計算結果を読み取れませんでした。再計算してください。')
      worker.postMessage(snapshot.input)
    } catch {
      stop()
      setState({
        request: snapshot, series: emptySeries, status: 'error', completedPoints: 0, totalPoints,
        error: '計算を開始できませんでした。ページを再読み込みしてください。',
      })
    }
  }, [stop])
  const cancel = useCallback(() => {
    stop()
    setState((previous) => previous.status === 'running' ? { ...previous, status: 'cancelled' } : previous)
  }, [stop])

  return { ...state, start, cancel }
}
