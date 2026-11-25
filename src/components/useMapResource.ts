import { useEffect, useState } from 'react'

export function useMapResource<T>(load: () => Promise<T>, enabled = true) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let active = true
    setError('')
    void load().then(result => {
      if (active) setData(result)
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'データを読み込めませんでした。')
    })
    return () => { active = false }
  }, [load, attempt, enabled])
  return { data, error, retry: () => setAttempt(value => value + 1) }
}
