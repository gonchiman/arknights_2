import { calculateNumericStatistics, type NumericStatistics } from './enemyStatistics.ts'
import { calculatePearsonCorrelation } from './pearsonCorrelation.ts'
import { getWikiCommentCount, getWikiCommentRange, type OperatorWikiCommentSnapshot } from './operatorWikiComments.ts'
import { matchOperatorWikiDisplayEntries, type OperatorWikiDisplayEntry } from './operatorWikiDisplay.ts'
import {
  isCalendarDate, parseOperatorWikiViewHistory, type OperatorWikiViewHistory,
  type OperatorWikiViewEntry, type OperatorWikiViewSnapshot,
} from './operatorWikiViews.ts'

export const WIKI_ANALYSIS_VERSION = 'v1'
export type WikiAnalysisPeriod = 1 | 7
export type WikiAnalysisHistory = ReadonlyMap<string, OperatorWikiViewHistory>
export type WikiAnalysisMetric = NumericStatistics & { zeroCount: number | null }
export interface OperatorWikiAnalysis {
  range: { start: string; end: string }
  totalCount: number
  views: WikiAnalysisMetric
  comments: WikiAnalysisMetric
  points: { id: string; x: number; y: number }[]
  spearman: number | null
}

export function getWikiAnalysisThroughDate(views: OperatorWikiViewSnapshot, comments: OperatorWikiCommentSnapshot) {
  return views.yesterdayDate < comments.throughDate ? views.yesterdayDate : comments.throughDate
}

function periodDates(throughDate: string, period: WikiAnalysisPeriod): string[] {
  const start = Date.parse(getWikiCommentRange(throughDate, period).start)
  return Array.from({ length: period }, (_, index) => new Date(start + index * 86_400_000).toISOString().slice(0, 10))
}

export async function loadOperatorWikiAnalysisHistory(throughDate: string, signal?: AbortSignal): Promise<WikiAnalysisHistory> {
  if (!isCalendarDate(throughDate)) throw new Error('Wiki 閲覧数の履歴の日付が不正です。')
  const base = import.meta.env?.BASE_URL ?? '/'
  const days = await Promise.all(periodDates(throughDate, 7).map(async date => {
    const response = await fetch(`${base.replace(/\/?$/, '/')}data/operator-wiki-views-history/${date}.json`, {
      signal, cache: 'no-store', headers: { Accept: 'application/json' },
    })
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`Wiki 閲覧数の履歴を読み込めませんでした（${date}）。`)
    return parseOperatorWikiViewHistory(await response.json(), date)
  }))
  return new Map(days.flatMap(day => day ? [[day.date, day] as const] : []))
}

function periodViews(
  dates: readonly string[], history: WikiAnalysisHistory, sourceIds: readonly string[],
  snapshot: OperatorWikiViewSnapshot, entry: OperatorWikiViewEntry | undefined,
): number | null {
  let total = 0
  for (const date of dates) {
    const day = history.get(date)
    const archived = sourceIds.map(id => day?.counts[id]).find(value => typeof value === 'number')
    const yesterday = date === snapshot.yesterdayDate ? entry?.yesterday : null
    // The archive can preserve known counts from an earlier, more complete collection.
    // A newer snapshot can also be visible before the corresponding archive is published.
    const value = yesterday != null && (!day || Date.parse(snapshot.observedAt) > Date.parse(day.observedAt))
      ? yesterday : archived ?? yesterday
    if (value == null) return null
    total += value
  }
  return total
}

function summarize(values: readonly (number | null)[]): WikiAnalysisMetric {
  const stats = calculateNumericStatistics(values)
  return { ...stats, zeroCount: stats.count > 0 ? values.filter(value => value === 0).length : null }
}

function averageRanks(values: readonly number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((left, right) => left.value - right.value)
  const ranks = new Array<number>(values.length)
  for (let first = 0; first < order.length;) {
    let end = first + 1
    while (end < order.length && order[first].value === order[end].value) end++
    const rank = (first + 1 + end) / 2
    for (let i = first; i < end; i++) ranks[order[i].index] = rank
    first = end
  }
  return ranks
}

export function calculateOperatorWikiAnalysis(
  operators: readonly OperatorWikiDisplayEntry[], views: OperatorWikiViewSnapshot,
  comments: OperatorWikiCommentSnapshot, history: WikiAnalysisHistory, period: WikiAnalysisPeriod,
): OperatorWikiAnalysis {
  const throughDate = getWikiAnalysisThroughDate(views, comments)
  const range = getWikiCommentRange(throughDate, period)
  const dates = periodDates(throughDate, period)
  const commentsRetained = range.start >= getWikiCommentRange(comments.throughDate, 30).start
  const viewEntries = matchOperatorWikiDisplayEntries(operators, views.entries)
  const commentEntries = matchOperatorWikiDisplayEntries(operators, comments.entries)
  const snapshotIds = new Set(views.entries.map(entry => entry.operatorId))
  const viewValues: (number | null)[] = []
  const commentValues: (number | null)[] = []
  const points: OperatorWikiAnalysis['points'] = []
  for (const operator of operators) {
    const entry = viewEntries.get(operator.operatorId)
    // History only carries IDs. Exclude known IDs that now point to a different Wiki page.
    const ids = operator.sourceIds.filter(id => !snapshotIds.has(id))
    if (entry) ids.unshift(entry.operatorId)
    const viewCount = periodViews(dates, history, ids, views, entry)
    const commentCount = commentsRetained ? getWikiCommentCount(commentEntries.get(operator.operatorId), range) : null
    viewValues.push(viewCount)
    commentValues.push(commentCount)
    if (viewCount !== null && commentCount !== null) points.push({ id: operator.operatorId, x: viewCount, y: commentCount })
  }
  return {
    range, totalCount: operators.length, views: summarize(viewValues), comments: summarize(commentValues), points,
    spearman: calculatePearsonCorrelation(averageRanks(points.map(point => point.x)), averageRanks(points.map(point => point.y))),
  }
}
