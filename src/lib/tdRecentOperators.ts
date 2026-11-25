import { addRecentOperatorId, normalizeRecentOperatorIds } from './operatorSearchFilters.ts'

const STORAGE_KEY = 'arknights-td-recent-operator-ids-v1'
// Keep failed writes ahead of the older list still in storage.
let unsavedIds: string[] = []

export function loadTdRecentOperatorIds(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const saved: unknown = raw === null ? [] : JSON.parse(raw)
    if (Array.isArray(saved)) {
      return normalizeRecentOperatorIds([...unsavedIds, ...saved.filter((id): id is string => typeof id === 'string')])
    }
  } catch {
    // The browser may deny access or contain an invalid stored value.
  }
  return [...unsavedIds]
}

export function rememberTdOperator(id: string, currentIds: readonly string[]): string[] {
  const next = addRecentOperatorId([...loadTdRecentOperatorIds(), ...currentIds], id)
  if (typeof window === 'undefined') return next
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    unsavedIds = []
  } catch {
    unsavedIds = addRecentOperatorId(unsavedIds, id)
  }
  return next
}
