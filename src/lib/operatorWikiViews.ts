import type { OperatorDatabaseRecord } from './operatorDatabase'

export const WIKI_ROOT = 'https://arknights.wikiru.jp/'
const SNAPSHOT_PATH = 'data/operator-wiki-views.json'
const METRICS = ['yesterday', 'today', 'total'] as const
const names = new Intl.Collator('ja')
const INVALID_SNAPSHOT = 'Wiki 閲覧数のデータ形式が正しくありません。'

type Counts = Record<typeof METRICS[number], number | null>
type Operator = Pick<OperatorDatabaseRecord, 'operatorId' | 'name'>

export type OperatorWikiViewEntry = Counts & { operatorId: string; wikiUrl: string }
export type OperatorWikiViewRow = Operator & Counts & { wikiUrl: string | null }
export type OperatorWikiViewSort = { key: 'name' | typeof METRICS[number]; direction: 'asc' | 'desc' }
export type OperatorWikiViewSnapshot = {
  observedAt: string
  todayDate: string
  yesterdayDate: string
  entries: readonly OperatorWikiViewEntry[]
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function isTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && isCalendarDate(value.slice(0, 10))
    && Number.isFinite(Date.parse(value))
}

export function wikiPageTitle(value: unknown): string | null {
  const prefix = `${WIKI_ROOT}?`
  if (typeof value !== 'string' || !value.startsWith(prefix)) return null
  const encodedTitle = value.slice(prefix.length)
  try {
    const title = decodeURIComponent(encodedTitle)
    return title.trim() && !/[\u0000-\u001f\u007f]/u.test(title)
      && encodeURIComponent(title) === encodedTitle ? title : null
  } catch {
    return null
  }
}

function count(value: unknown): number | null {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(INVALID_SNAPSHOT)
  }
  return value
}

export function parseOperatorWikiViewSnapshot(value: unknown): OperatorWikiViewSnapshot {
  if (!isRecord(value)) throw new Error(INVALID_SNAPSHOT)
  const { observedAt, todayDate, yesterdayDate, entries } = value
  if (!isTimestamp(observedAt) || !isCalendarDate(todayDate) || !isCalendarDate(yesterdayDate)
      || Date.parse(todayDate) - Date.parse(yesterdayDate) !== 86_400_000 || !Array.isArray(entries)) {
    throw new Error(INVALID_SNAPSHOT)
  }

  const ids = new Set<string>()
  const pages = new Set<string>()
  const parsedEntries = entries.map((entry: unknown): OperatorWikiViewEntry => {
    if (!isRecord(entry)) throw new Error(INVALID_SNAPSHOT)
    const { operatorId, wikiUrl, yesterday, today, total } = entry
    const title = wikiPageTitle(wikiUrl)
    if (typeof operatorId !== 'string' || !operatorId.trim() || ids.has(operatorId)
        || typeof wikiUrl !== 'string' || !title || pages.has(title)) {
      throw new Error(INVALID_SNAPSHOT)
    }
    ids.add(operatorId)
    pages.add(title)
    return { operatorId, wikiUrl, yesterday: count(yesterday), today: count(today), total: count(total) }
  })
  return { observedAt, todayDate, yesterdayDate, entries: parsedEntries }
}

export async function loadOperatorWikiViewSnapshot(signal?: AbortSignal): Promise<OperatorWikiViewSnapshot> {
  const base = import.meta.env?.BASE_URL ?? '/'
  const response = await fetch(`${base.replace(/\/?$/, '/')}${SNAPSHOT_PATH}`, { signal, cache: 'no-store' })
  if (!response.ok) throw new Error('Wiki 閲覧数を読み込めませんでした。')
  return parseOperatorWikiViewSnapshot(await response.json())
}

export function buildOperatorWikiViewRows(
  operators: readonly Operator[],
  snapshot: OperatorWikiViewSnapshot | null,
): OperatorWikiViewRow[] {
  const byId = new Map(snapshot?.entries.map(entry => [entry.operatorId, entry]))
  return operators.map(({ operatorId, name }) => {
    const entry = byId.get(operatorId)
    return {
      operatorId,
      name,
      wikiUrl: entry?.wikiUrl ?? null,
      yesterday: entry?.yesterday ?? null,
      today: entry?.today ?? null,
      total: entry?.total ?? null,
    }
  })
}

export function sortOperatorWikiViewRows(
  rows: readonly OperatorWikiViewRow[],
  sort: OperatorWikiViewSort,
): OperatorWikiViewRow[] {
  return sortOperatorWikiMetricRows(rows, sort)
}

export function sortOperatorWikiMetricRows<K extends string, Row extends Operator & Record<K, number | null>>(
  rows: readonly Row[],
  { key, direction }: { key: 'name' | K; direction: 'asc' | 'desc' },
): Row[] {
  const order = direction === 'asc' ? 1 : -1
  return [...rows].sort((left, right) => {
    const nameOrder = names.compare(left.name, right.name)
    const tie = nameOrder || left.operatorId.localeCompare(right.operatorId)
    if (key === 'name') return nameOrder * order || tie
    const a = left[key]
    const b = right[key]
    if (a === null || b === null) return Number(a === null) - Number(b === null) || tie
    return (a - b) * order || tie
  })
}
