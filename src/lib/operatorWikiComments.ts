import { isCalendarDate, isRecord, isTimestamp, wikiPageTitle } from './operatorWikiViews.ts'

const INVALID_SNAPSHOT = 'Wiki コメントのデータ形式が正しくありません。'
const DAY_MS = 86_400_000
const JST_OFFSET_MS = 9 * 3_600_000

export const WIKI_COMMENT_PERIODS = [
  { days: 1, label: '前日' },
  { days: 7, label: '直近7日' },
  { days: 30, label: '直近30日' },
] as const

export type WikiCommentPeriod = typeof WIKI_COMMENT_PERIODS[number]['days']
type CommentRange = { start: string; end: string }

export type OperatorWikiCommentEntry = {
  operatorId: string
  wikiUrl: string
  coveredFrom: string | null
  counts: Readonly<Record<string, number>>
  total: number | null
}

export type OperatorWikiCommentSnapshot = {
  observedAt: string
  throughDate: string
  entries: readonly OperatorWikiCommentEntry[]
}

export function getWikiCommentRange(throughDate: string, days: WikiCommentPeriod): CommentRange {
  const start = new Date(Date.parse(throughDate) - (days - 1) * DAY_MS).toISOString().slice(0, 10)
  return { start, end: throughDate }
}

export function getWikiCommentCount(
  entry: OperatorWikiCommentEntry | undefined,
  { start, end }: CommentRange,
): number | null {
  if (!entry?.coveredFrom || start < entry.coveredFrom) return null
  return Object.entries(entry.counts).reduce((sum, [date, count]) => (
    date >= start && date <= end ? sum + count : sum
  ), 0)
}

export function parseOperatorWikiCommentSnapshot(value: unknown): OperatorWikiCommentSnapshot {
  if (!isRecord(value)) throw new Error(INVALID_SNAPSHOT)
  const { observedAt, throughDate, entries } = value
  if (!isTimestamp(observedAt) || !isCalendarDate(throughDate) || !Array.isArray(entries)
    || new Date(Date.parse(observedAt) + JST_OFFSET_MS - DAY_MS).toISOString().slice(0, 10) !== throughDate) {
    throw new Error(INVALID_SNAPSHOT)
  }
  const earliestDate = getWikiCommentRange(throughDate, 30).start
  const ids = new Set<string>()
  const pages = new Set<string>()
  const parsedEntries = entries.map((entry: unknown): OperatorWikiCommentEntry => {
    if (!isRecord(entry)) throw new Error(INVALID_SNAPSHOT)
    const { operatorId, wikiUrl, coveredFrom, counts } = entry
    const total = entry.total === undefined ? null : entry.total
    const title = wikiPageTitle(wikiUrl)
    if (typeof operatorId !== 'string' || !operatorId.trim() || ids.has(operatorId)
      || typeof wikiUrl !== 'string' || !title || !/^コメント\/[^/]+$/.test(title) || pages.has(title)
      || (coveredFrom !== null && (!isCalendarDate(coveredFrom) || coveredFrom > throughDate))
      || (total !== null && (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0))
      || !isRecord(counts)) throw new Error(INVALID_SNAPSHOT)
    ids.add(operatorId)
    pages.add(title)
    const days: Record<string, number> = {}
    for (const [date, count] of Object.entries(counts)) {
      if (!coveredFrom || !isCalendarDate(date) || date < earliestDate || date < coveredFrom || date > throughDate
        || typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1) {
        throw new Error(INVALID_SNAPSHOT)
      }
      days[date] = count
    }
    if (total !== null && Object.values(days).reduce((sum, count) => sum + count, 0) > total) {
      throw new Error(INVALID_SNAPSHOT)
    }
    return { operatorId, wikiUrl, coveredFrom, counts: days, total }
  })
  return { observedAt, throughDate, entries: parsedEntries }
}

export async function loadOperatorWikiCommentSnapshot(signal?: AbortSignal): Promise<OperatorWikiCommentSnapshot> {
  const base = import.meta.env?.BASE_URL ?? '/'
  const response = await fetch(`${base.replace(/\/?$/, '/')}data/operator-wiki-comments.json`, { signal, cache: 'no-store' })
  if (!response.ok) throw new Error('Wiki コメントを読み込めませんでした。')
  return parseOperatorWikiCommentSnapshot(await response.json())
}
