import { useEffect, useState } from 'react'
import { parseEnemyHistogramCounts, type EnemyHistogramCounts } from './enemyHistogramCounts'

const base = import.meta.env.BASE_URL
const url = `${base.endsWith('/') ? base : `${base}/`}data/enemy-histogram-counts.json`
let cached: Promise<EnemyHistogramCounts> | null = null

function loadCounts(): Promise<EnemyHistogramCounts> {
  if (cached) return cached
  cached = fetch(url).then(async (response) => {
    if (!response.ok) throw new Error('登場データを取得できませんでした。')
    return parseEnemyHistogramCounts(await response.json())
  }).catch((error: unknown) => {
    cached = null
    throw error
  })
  return cached
}

export function useEnemyHistogramCounts(active: boolean) {
  const [data, setData] = useState<EnemyHistogramCounts | null>(null)
  const [error, setError] = useState(false)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (!active || data) return
    let current = true
    setError(false)
    void loadCounts().then((result) => { if (current) setData(result) })
      .catch(() => { if (current) setError(true) })
    return () => { current = false }
  }, [active, data, version])
  return { data, error, loading: active && !data && !error, retry: () => setVersion((value) => value + 1) }
}
