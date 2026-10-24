import { useEffect, useState, useSyncExternalStore } from 'react'
import { enemyAggregationClient, type EnemyAggregationData } from './enemyAggregationData'
import type { EnemyAggregationIndex } from './enemyAggregationContract'

const STORAGE_KEY = 'enemy-aggregation-version'
const CHANGE_EVENT = 'enemy-aggregation-version-change'
const QUERY_KEY = 'aggregationVersion'
let memorySelection = ''

function readSelection() {
  if (typeof window === 'undefined') return ''
  const fromUrl = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get(QUERY_KEY)
  if (fromUrl) return fromUrl
  try { return window.localStorage.getItem(STORAGE_KEY) || memorySelection } catch { return memorySelection }
}
function subscribe(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener)
  window.addEventListener('storage', listener)
  window.addEventListener('hashchange', listener)
  window.addEventListener('popstate', listener)
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener)
    window.removeEventListener('storage', listener)
    window.removeEventListener('hashchange', listener)
    window.removeEventListener('popstate', listener)
  }
}
function persistSelection(id: string) {
  memorySelection = id
  try { window.localStorage.setItem(STORAGE_KEY, id) } catch { /* Selection still lasts for this session. */ }
  const [path, query = ''] = window.location.hash.split('?')
  const params = new URLSearchParams(query)
  params.set(QUERY_KEY, id)
  window.history.replaceState(null, '', `${path}?${params}`)
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function useEnemyAggregation({ versionId, enabled = true }: { versionId?: string; enabled?: boolean } = {}) {
  const selection = useSyncExternalStore(subscribe, readSelection, () => '')
  const [catalog, setCatalog] = useState<EnemyAggregationIndex | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<{ key: string; data?: EnemyAggregationData; error?: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const selectedId = versionId ?? (selection || catalog?.currentVersionId || '')
  const version = catalog?.versions.find(item => item.id === selectedId) ?? null
  const key = version ? `${version.id}:${version.sha256}` : ''
  useEffect(() => {
    if (!enabled || versionId || !version) return
    memorySelection = version.id
    try { window.localStorage.setItem(STORAGE_KEY, version.id) } catch { /* Session selection is sufficient. */ }
  }, [enabled, versionId, key])
  useEffect(() => {
    if (!enabled) return
    let active = true
    setCatalogError(null)
    void enemyAggregationClient.loadIndex().then(result => { if (active) setCatalog(result) })
      .catch((error: unknown) => { if (active) setCatalogError(error instanceof Error ? error.message : '集計版を取得できませんでした。') })
    return () => { active = false }
  }, [attempt, enabled])
  useEffect(() => {
    if (!enabled || !version) return
    let active = true
    setLoaded(null)
    void enemyAggregationClient.loadVersion(version).then(data => { if (active) setLoaded({ key, data }) })
      .catch((error: unknown) => { if (active) setLoaded({ key, error: error instanceof Error ? error.message : '集計版を取得できませんでした。' }) })
    return () => { active = false }
  }, [key, attempt, enabled])
  const error = enabled ? catalogError || (catalog && !version ? `指定された集計版「${selectedId}」はありません。` : null)
    || (loaded?.key === key ? loaded.error ?? null : null) : null
  const data = enabled && !error && loaded?.key === key ? loaded.data ?? null : null
  return { catalog, version, data, selectedId, setSelectedId: persistSelection,
    loading: enabled && !data && !error, error, retry: () => setAttempt(value => value + 1) }
}
