import { calculateWeightedHistogram } from './enemyWeightedHistogram.ts'
import type { NumericStatistics } from './enemyStatistics.ts'

export const MAIN_ENEMY_METRICS = [
  { key: 'hp', label: 'HP' }, { key: 'attack', label: '攻撃力' },
  { key: 'defense', label: '防御力' }, { key: 'resistance', label: '術耐性' },
] as const
export type MainEnemyMetric = typeof MAIN_ENEMY_METRICS[number]['key']
export type MainEnemyKind = 'all' | 'combat' | 'normal' | 'boss'
export type MainEnemyWeighting = 'appearances' | 'types'
export type MainEnemyType = 'normal' | 'elite' | 'boss' | 'unknown'

export interface MainEnemyObservation {
  enemyId: string
  name: string
  level: number
  type: MainEnemyType
  count: number
  hp: number | null
  attack: number | null
  defense: number | null
  resistance: number | null
}
export interface MainEnemyCoverage {
  eligibleMapCount: number
  /** Contributing maps, including maps with only their fixed spawns counted. */
  includedMapCount: number
  partialMapCount: number
  excludedMapCount: number
  missingMapCount: number
}
export interface MainEnemyChapter extends MainEnemyCoverage {
  chapter: number
  name: string
  enemyCount: number
  excludedUnitCount: number
}
export interface MainEnemyMap {
  levelId: string
  stageId: string
  chapter: number
  order: number
  code: string
  name: string
  status: 'included' | 'partial' | 'excluded' | 'missing'
  reasons: string[]
  enemyCount: number
  excludedUnitCount: number
  enemies: MainEnemyObservation[]
}
export interface MainEnemyTrendsData {
  schemaVersion: 1
  generatedAt: string
  sourceGeneratedAt: string | null
  source: { region: 'jp'; scope: 'main-standard-fixed-direct-spawns'; chapterRange: [number, number] }
  summary: MainEnemyCoverage & { enemyCount: number; excludedUnitCount: number }
  chapters: MainEnemyChapter[]
  maps: MainEnemyMap[]
  diagnostics: { excludedUnits: { levelId: string; enemyId: string; count: number; reason: string }[] }
}
export interface MainEnemyAggregationOptions { kind?: MainEnemyKind; weighting?: MainEnemyWeighting }
export type MainEnemyMetricSummary = Pick<NumericStatistics,
  'totalCount' | 'count' | 'missingCount' | 'minimum' | 'maximum' | 'mean' | 'median'
  | 'firstQuartile' | 'thirdQuartile' | 'standardDeviation'>
export interface MainEnemyTrendRow extends MainEnemyCoverage {
  id: string
  label: string
  name: string
  chapter: number
  levelId?: string
  status?: MainEnemyMap['status']
  reasons: string[]
  enemyCount: number
  typeCount: number
  matchedMapCount: number
  excludedUnitCount: number
  stats: Record<MainEnemyMetric, MainEnemyMetricSummary>
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const text = (value: unknown): value is string => typeof value === 'string'
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
const numeric = (value: unknown): value is number | null => value === null
  || (typeof value === 'number' && Number.isFinite(value) && value >= 0)
function fail(): never { throw new Error('敵ステータス推移データの形式を確認できませんでした。') }
const isCoverage = (value: Record<string, unknown>): boolean =>
  ['eligibleMapCount', 'includedMapCount', 'partialMapCount', 'excludedMapCount', 'missingMapCount'].every((key) => count(value[key]))
  && value.eligibleMapCount === Number(value.includedMapCount) + Number(value.excludedMapCount) + Number(value.missingMapCount)
  && Number(value.partialMapCount) <= Number(value.includedMapCount)

export function parseMainEnemyTrends(source: unknown): MainEnemyTrendsData {
  const root = record(source), provenance = record(root?.source), summary = record(root?.summary)
  const diagnostics = record(root?.diagnostics)
  if (!root || root.schemaVersion !== 1 || !text(root.generatedAt)
    || !(root.sourceGeneratedAt === null || text(root.sourceGeneratedAt))
    || !provenance || provenance.region !== 'jp' || provenance.scope !== 'main-standard-fixed-direct-spawns'
    || !Array.isArray(provenance.chapterRange) || provenance.chapterRange.length !== 2
    || !provenance.chapterRange.every(count) || provenance.chapterRange[0] > provenance.chapterRange[1]
    || !summary || !isCoverage(summary) || !count(summary.enemyCount) || !count(summary.excludedUnitCount)
    || !Array.isArray(root.chapters) || !Array.isArray(root.maps)
    || !diagnostics || !Array.isArray(diagnostics.excludedUnits)) fail()
  const chapterRange = provenance.chapterRange
  const chapterIds = new Set<number>()
  const chapters: MainEnemyChapter[] = root.chapters.map((raw) => {
    const chapter = record(raw)
    if (!chapter || !count(chapter.chapter) || !text(chapter.name) || !isCoverage(chapter)
      || !count(chapter.enemyCount) || !count(chapter.excludedUnitCount)
      || chapter.chapter < Number(chapterRange[0]) || chapter.chapter > Number(chapterRange[1])
      || chapterIds.has(chapter.chapter)) fail()
    chapterIds.add(chapter.chapter)
    return chapter as unknown as MainEnemyChapter
  })
  const seenMaps = new Set<string>()
  const maps: MainEnemyMap[] = root.maps.map((raw) => {
    const map = record(raw)
    if (!map || !text(map.levelId) || !map.levelId || seenMaps.has(map.levelId)
      || !text(map.stageId) || !text(map.code) || !text(map.name)
      || !count(map.chapter) || !chapterIds.has(map.chapter) || !count(map.order)
      || !['included', 'partial', 'excluded', 'missing'].includes(String(map.status))
      || !Array.isArray(map.reasons) || !map.reasons.every((reason) => text(reason) && reason.length > 0)
      || new Set(map.reasons).size !== map.reasons.length
      || !count(map.enemyCount) || !count(map.excludedUnitCount) || !Array.isArray(map.enemies)) fail()
    seenMaps.add(map.levelId)
    const seenEnemies = new Set<string>()
    const enemies = map.enemies.map((rawEnemy): MainEnemyObservation => {
      const enemy = record(rawEnemy)
      if (!enemy || !text(enemy.enemyId) || !enemy.enemyId || seenEnemies.has(enemy.enemyId)
        || !text(enemy.name) || !count(enemy.level) || !count(enemy.count) || enemy.count === 0
        || !['normal', 'elite', 'boss', 'unknown'].includes(String(enemy.type))
        || !MAIN_ENEMY_METRICS.every(({ key }) => numeric(enemy[key]))) fail()
      seenEnemies.add(enemy.enemyId)
      return enemy as unknown as MainEnemyObservation
    })
    if (map.enemyCount !== enemies.reduce((sum, enemy) => sum + enemy.count, 0)
      || (map.status === 'included' ? enemies.length === 0 || map.reasons.length > 0
        : map.status === 'partial' ? enemies.length === 0 || map.reasons.length === 0
          : enemies.length > 0 || map.reasons.length === 0)) fail()
    return { ...map, enemies } as unknown as MainEnemyMap
  })
  for (const chapter of chapters) {
    const matching = maps.filter((map) => map.chapter === chapter.chapter)
    const coverage = getMainEnemyCoverage(matching)
    if (Object.entries(coverage).some(([key, value]) => chapter[key as keyof MainEnemyCoverage] !== value)
      || chapter.enemyCount !== matching.reduce((sum, map) => sum + map.enemyCount, 0)
      || chapter.excludedUnitCount !== matching.reduce((sum, map) => sum + map.excludedUnitCount, 0)) fail()
  }
  if (Object.entries(getMainEnemyCoverage(maps)).some(([key, value]) => summary[key] !== value)
    || summary.enemyCount !== maps.reduce((sum, map) => sum + map.enemyCount, 0)
    || summary.excludedUnitCount !== maps.reduce((sum, map) => sum + map.excludedUnitCount, 0)) fail()
  const excludedUnits = diagnostics.excludedUnits.map((raw) => {
    const excluded = record(raw)
    if (!excluded || !text(excluded.levelId) || !seenMaps.has(excluded.levelId)
      || !text(excluded.enemyId) || !count(excluded.count) || excluded.count === 0 || !text(excluded.reason)) fail()
    return excluded as unknown as MainEnemyTrendsData['diagnostics']['excludedUnits'][number]
  })
  return { ...root, chapters, maps, diagnostics: { excludedUnits } } as unknown as MainEnemyTrendsData
}

const APP_BASE = import.meta.env?.BASE_URL ?? '/'
const DATA_URL = `${APP_BASE.endsWith('/') ? APP_BASE : `${APP_BASE}/`}data/maps/main-enemy-trends.json`
let dataRequest: Promise<MainEnemyTrendsData> | null = null
export function loadMainEnemyTrends(): Promise<MainEnemyTrendsData> {
  if (!dataRequest) dataRequest = fetch(DATA_URL).then(async (response) => {
    if (!response.ok) throw new Error('敵ステータス推移データを読み込めませんでした。')
    return parseMainEnemyTrends(await response.json())
  }).catch((error) => { dataRequest = null; throw error })
  return dataRequest
}

export function getMainEnemyCoverage(maps: readonly MainEnemyMap[]): MainEnemyCoverage {
  return { eligibleMapCount: maps.length,
    includedMapCount: maps.filter((map) => map.status === 'included' || map.status === 'partial').length,
    partialMapCount: maps.filter((map) => map.status === 'partial').length,
    excludedMapCount: maps.filter((map) => map.status === 'excluded').length,
    missingMapCount: maps.filter((map) => map.status === 'missing').length }
}
export function matchesMainEnemyKind(enemy: MainEnemyObservation, kind: MainEnemyKind): boolean {
  return kind === 'all' || (kind === 'combat' ? enemy.type === 'normal' || enemy.type === 'elite' : enemy.type === kind)
}
/** A type is one enemy ID / DB level / resolved four-stat variant within this aggregation.
 * Repeated appearances on different maps have weight one together; stage overrides remain distinct.
 * Types are deduplicated before dropping metric-specific missing values, using the same denominator for all metrics.
 */
export function getMainEnemyTypeKey(enemy: MainEnemyObservation): string {
  return JSON.stringify([enemy.enemyId, enemy.level, enemy.type, enemy.hp, enemy.attack, enemy.defense, enemy.resistance])
}
function summarizeMaps(maps: readonly MainEnemyMap[], options: MainEnemyAggregationOptions) {
  const kind = options.kind ?? 'all', weighting = options.weighting ?? 'appearances'
  const matching = maps.filter((map) => map.status === 'included' || map.status === 'partial')
    .map((map) => map.enemies.filter((enemy) => matchesMainEnemyKind(enemy, kind)))
  const all = matching.flat(), types = [...new Map(all.map((enemy) => [getMainEnemyTypeKey(enemy), enemy])).values()]
  const observations = weighting === 'types' ? types : all
  const stats = Object.fromEntries(MAIN_ENEMY_METRICS.map(({ key }) => {
    const { bins: _bins, histogram: _histogram, ...statistics } = calculateWeightedHistogram(
      observations.map((enemy) => ({ value: enemy[key], weight: weighting === 'types' ? 1 : enemy.count })),
    )
    return [key, statistics]
  })) as Record<MainEnemyMetric, MainEnemyMetricSummary>
  return { ...getMainEnemyCoverage(maps), stats, enemyCount: all.reduce((sum, enemy) => sum + enemy.count, 0),
    typeCount: types.length, matchedMapCount: matching.filter((enemies) => enemies.length > 0).length,
    excludedUnitCount: maps.reduce((sum, map) => sum + map.excludedUnitCount, 0) }
}
export function aggregateMainEnemyChapters(data: MainEnemyTrendsData, options: MainEnemyAggregationOptions = {}): MainEnemyTrendRow[] {
  return [...data.chapters].sort((a, b) => a.chapter - b.chapter).map((chapter) => ({
    id: `chapter-${chapter.chapter}`, label: `${chapter.chapter}章`, name: chapter.name, chapter: chapter.chapter, reasons: [],
    ...summarizeMaps(data.maps.filter((map) => map.chapter === chapter.chapter), options),
  }))
}
/** Excluded maps remain rows with null statistics so incomplete coverage never appears as a zero-value stage. */
export function aggregateMainEnemyMaps(data: MainEnemyTrendsData, chapter: number, options: MainEnemyAggregationOptions = {}): MainEnemyTrendRow[] {
  return data.maps.filter((map) => map.chapter === chapter).sort((a, b) => a.order - b.order).map((map) => ({
    id: map.levelId, levelId: map.levelId, label: map.code, name: map.name, chapter: map.chapter,
    status: map.status, reasons: map.reasons, ...summarizeMaps([map], options),
  }))
}
