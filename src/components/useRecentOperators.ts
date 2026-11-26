import { useMemo, useSyncExternalStore } from 'react'
import { addRecentOperatorId, normalizeRecentOperatorIds } from '../lib/operatorSearchFilters'

const STORAGE_KEY = 'arknights-recent-operator-ids-v1'
let unsavedHistory: string | null = null

function readHistory(): string | null {
  if (unsavedHistory !== null) return unsavedHistory
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function parseHistory(raw: string | null): string[] {
  if (!raw) return []
  try {
    const ids: unknown = JSON.parse(raw)
    return Array.isArray(ids) ? normalizeRecentOperatorIds(ids.filter((id): id is string => typeof id === 'string')) : []
  } catch {
    return []
  }
}

function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) notify()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(STORAGE_KEY, notify)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(STORAGE_KEY, notify)
  }
}

function rememberOperator(operatorId: string) {
  const next = JSON.stringify(addRecentOperatorId(parseHistory(readHistory()), operatorId))
  try {
    window.localStorage.setItem(STORAGE_KEY, next)
    unsavedHistory = null
  } catch {
    unsavedHistory = next
  }
  // The native storage event only reaches other windows.
  window.dispatchEvent(new Event(STORAGE_KEY))
}

export function useRecentOperators() {
  const raw = useSyncExternalStore(subscribe, readHistory, () => null)
  const recentOperatorIds = useMemo(() => parseHistory(raw), [raw])
  return { recentOperatorIds, rememberOperator }
}
