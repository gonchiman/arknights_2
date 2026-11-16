import { getWikiCommentRange } from './operatorWikiComments.ts'
import { isCalendarDate, isRecord, isTimestamp, wikiPageTitle } from './operatorWikiViews.ts'

const INVALID_SNAPSHOT = '敵別 Wiki 集計データの形式が正しくありません。'
const DAY_MS = 86_400_000
const JST_OFFSET_MS = 9 * 3_600_000

export type EnemyWikiGrade = 'NORMAL' | 'ELITE' | 'BOSS'

export type EnemyWikiStatsComment = {
  status: 'available' | 'no-log' | 'unavailable'
  wikiUrl: string | null
  coveredFrom: string | null
  counts: Readonly<Record<string, number>>
  total: number | null
}

type EnemyWikiView = Record<'today' | 'yesterday' | 'total', number | null>

export type EnemyWikiStatsEntry = {
  index: string
  name: string
  grade: EnemyWikiGrade | null
  wikiUrl: string
  view: EnemyWikiView | null
  comment: EnemyWikiStatsComment | null
}

export type EnemyWikiStatsSnapshot = {
  rosterObservedAt: string
  viewsObservedAt: string | null
  commentsObservedAt: string | null
  todayDate: string
  yesterdayDate: string
  throughDate: string
  entries: readonly EnemyWikiStatsEntry[]
}

function jstDate(timestamp: string) {
  return new Date(Date.parse(timestamp) + JST_OFFSET_MS).toISOString().slice(0, 10)
}

function readCount(value: unknown): number | null {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error(INVALID_SNAPSHOT)
  return value
}

function readView(value: unknown): EnemyWikiView | null {
  if (value === null) return null
  if (!isRecord(value)) throw new Error(INVALID_SNAPSHOT)
  return { today: readCount(value.today), yesterday: readCount(value.yesterday), total: readCount(value.total) }
}

function readComment(value: unknown, title: string, throughDate: string): EnemyWikiStatsComment | null {
  if (value === null) return null
  if (!isRecord(value)) throw new Error(INVALID_SNAPSHOT)
  const { status, wikiUrl, coveredFrom, counts } = value
  const total = readCount(value.total)
  const commentTitle = wikiPageTitle(wikiUrl)
  const currentTitle = 'コメント/' + title
  const isCommentPage = commentTitle === currentTitle ||
    (commentTitle?.startsWith(currentTitle + '/') && /^[1-9]\d*$/.test(commentTitle.slice(currentTitle.length + 1)))
  if ((status !== 'available' && status !== 'no-log' && status !== 'unavailable')
      || (wikiUrl !== null && (typeof wikiUrl !== 'string' || !isCommentPage))
      || (coveredFrom !== null && (!isCalendarDate(coveredFrom) || coveredFrom > throughDate))
      || !isRecord(counts)) throw new Error(INVALID_SNAPSHOT)

  const earliest = getWikiCommentRange(throughDate, 30).start
  const days: Record<string, number> = {}
  let recorded = 0
  for (const [date, count] of Object.entries(counts)) {
    if (!coveredFrom || !isCalendarDate(date) || date < earliest || date < coveredFrom || date > throughDate
        || typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1) throw new Error(INVALID_SNAPSHOT)
    days[date] = count
    recorded += count
  }
  if ((total !== null && recorded > total)
      || (status === 'available' && (wikiUrl === null || coveredFrom === null && total === null))
      || (status !== 'available' && (coveredFrom !== null || total !== null))
      || (status === 'no-log' && wikiUrl !== null)) throw new Error(INVALID_SNAPSHOT)

  return { status, wikiUrl, coveredFrom, counts: days, total }
}

export function parseEnemyWikiStatsSnapshot(value: unknown): EnemyWikiStatsSnapshot {
  if (!isRecord(value)) throw new Error(INVALID_SNAPSHOT)
  const { rosterObservedAt, viewsObservedAt, commentsObservedAt, todayDate, yesterdayDate, throughDate, entries } = value
  if (!isTimestamp(rosterObservedAt) || !isCalendarDate(todayDate)
      || !isCalendarDate(yesterdayDate) || !isCalendarDate(throughDate)
      || Date.parse(todayDate) - Date.parse(yesterdayDate) !== DAY_MS
      || (viewsObservedAt !== null && (!isTimestamp(viewsObservedAt) || jstDate(viewsObservedAt) !== todayDate))
      || (commentsObservedAt !== null && (!isTimestamp(commentsObservedAt)
        || Date.parse(jstDate(commentsObservedAt)) - Date.parse(throughDate) !== DAY_MS))
      || !Array.isArray(entries)) throw new Error(INVALID_SNAPSHOT)

  const urls = new Set<string>()
  const parsed = entries.map((entry: unknown): EnemyWikiStatsEntry => {
    if (!isRecord(entry)) throw new Error(INVALID_SNAPSHOT)
    const { index, name, grade, wikiUrl } = entry
    const title = wikiPageTitle(wikiUrl)
    if (typeof index !== 'string' || typeof name !== 'string' || !name.trim()
        || (grade !== null && grade !== 'NORMAL' && grade !== 'ELITE' && grade !== 'BOSS')
        || typeof wikiUrl !== 'string' || !title || urls.has(wikiUrl)) throw new Error(INVALID_SNAPSHOT)
    urls.add(wikiUrl)

    const view = readView(entry.view)
    const comment = readComment(entry.comment, title, throughDate)
    if ((view && viewsObservedAt === null) || (comment?.status === 'available' && commentsObservedAt === null)) {
      throw new Error(INVALID_SNAPSHOT)
    }
    return { index, name, grade, wikiUrl, view, comment }
  })
  return { rosterObservedAt, viewsObservedAt, commentsObservedAt, todayDate, yesterdayDate, throughDate, entries: parsed }
}

export async function loadEnemyWikiStats(signal?: AbortSignal): Promise<EnemyWikiStatsSnapshot> {
  const base = import.meta.env?.BASE_URL ?? '/'
  const response = await fetch(base.replace(/\/?$/, '/') + 'data/enemy-wiki-stats.json', { signal, cache: 'no-store' })
  if (!response.ok) throw new Error('敵別 Wiki 集計データを読み込めませんでした。')
  return parseEnemyWikiStatsSnapshot(await response.json())
}
