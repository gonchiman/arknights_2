import { useCallback, useEffect, useState } from 'react'
import type { EnemyRecord } from '../types/enemy'
import { loadEnemyRecords } from './enemyData'

export function useEnemyRecords() {
  const [rows, setRows] = useState<EnemyRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadVersion, setLoadVersion] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

    void loadEnemyRecords()
      .then((records) => {
        if (!active) return
        setRows(records)
      })
      .catch((cause) => {
        if (!active) return
        setError(cause instanceof Error ? cause.message : '不明なエラーが発生しました。')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [loadVersion])

  const retry = useCallback(() => setLoadVersion((value) => value + 1), [])

  return { rows, loading, error, retry }
}
