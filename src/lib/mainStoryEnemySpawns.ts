import { MAIN_ENEMY_EXCLUSIONS } from '../../scripts/lib/enemyUnitRoles.mjs'
import type { MapDetail, MapIndex, MapSummary, MapWaveAction } from '../types/map.ts'
import { selectEnemyMainStoryMaps } from './enemyMainStoryScope.ts'
import { compareNumericValues } from './enemyTableSort.ts'
import { getMapSpawnFlow } from './mapWaves.ts'

export const MAIN_STORY_SPAWN_AGGREGATION_VERSION = 'v12'

export interface MainStorySpawnStage {
  id: string
  code: string
  name: string
  chapter: number
}

export interface MainStorySpawnStats {
  hp: number | null
  attack: number | null
  defense: number | null
  resistance: number | null
}

interface SpawnGroup {
  enemyId: string
  enemyName: string
  count: number
  wave: number | null
  fragment: number | null
  time: number | null
  entrance: string | null
  fromBranch?: boolean
  stats: MainStorySpawnStats
}

export interface MainStorySpawnList {
  stage: MainStorySpawnStage
  status: 'confirmed' | 'unconfirmed' | 'unavailable'
  groups: SpawnGroup[]
}

export interface MainStorySpawnRow extends Omit<SpawnGroup, 'enemyId'> {
  key: string
  stage: MainStorySpawnStage
  rank?: number | null
}

export type MainStorySpawnSortKey = keyof MainStorySpawnStats | 'stage' | 'enemyName' | 'wave' | 'time' | 'entrance' | 'count'

export interface MainStorySpawnSort {
  key: MainStorySpawnSortKey
  direction: 'asc' | 'desc'
}

export interface MainStorySpawnChapterRow {
  chapter: number
  count: number
  stageCount: number
  partialStageCount: number
}

export interface MainStorySpawnChapterSort {
  key: 'chapter' | 'count'
  direction: 'asc' | 'desc'
}

export interface MainStorySpawnJumpTarget {
  kind: 'rank' | 'stat'
  value: number
}

const UNKNOWN_STATS: MainStorySpawnStats = { hp: null, attack: null, defense: null, resistance: null }
const nameOrder = new Intl.Collator('ja-JP', { numeric: true })
const stageOrder = new Intl.Collator('en', { numeric: true })

export function getMainStorySpawnRankMetric(sort?: MainStorySpawnSort): keyof MainStorySpawnStats | null {
  return sort && Object.hasOwn(UNKNOWN_STATS, sort.key) ? sort.key as keyof MainStorySpawnStats : null
}

function compareStages(left: MainStorySpawnStage, right: MainStorySpawnStage): number {
  return left.chapter - right.chapter || stageOrder.compare(left.id, right.id)
}

export function getMainStorySpawnStages(index: MapIndex): MainStorySpawnStage[] {
  return selectEnemyMainStoryMaps(index.maps)
    .map(map => ({
      id: map.levelId,
      code: map.code,
      name: map.name,
      chapter: Number(map.levelId.match(/_(\d+)-\d+$/)![1]),
    }))
    .sort(compareStages)
}

interface ArchivedSpawnData {
  version: string
  enemies: Record<string, { name: string; stats: MainStorySpawnStats }>
  lists: (Omit<MainStorySpawnList, 'groups'> & {
    groups: Omit<SpawnGroup, 'enemyName' | 'stats'>[]
  })[]
}

const archivePath = `${import.meta.env?.BASE_URL ?? '/'}data/enemy-aggregation/${MAIN_STORY_SPAWN_AGGREGATION_VERSION}-main-story-spawns.json`
let archiveRequest: Promise<Map<string, MainStorySpawnList>> | null = null

function loadMainStorySpawnArchive() {
  archiveRequest ??= fetch(archivePath).then(async response => {
    if (!response.ok) throw new Error('集計版 v12 の出現データを読み込めませんでした。')
    const data = await response.json() as ArchivedSpawnData
    if (data?.version !== MAIN_STORY_SPAWN_AGGREGATION_VERSION || !Array.isArray(data.lists)
      || !data.enemies || data.lists.length === 0) {
      throw new Error('出現データと集計版が一致しません。')
    }

    const lists = new Map<string, MainStorySpawnList>()
    for (const { stage, status, groups } of data.lists) {
      if (lists.has(stage.id)) throw new Error('出現データに重複したステージがあります。')
      lists.set(stage.id, {
        stage, status, groups: groups.map(group => {
          const enemy = Object.hasOwn(data.enemies, group.enemyId) ? data.enemies[group.enemyId] : undefined
          if (!enemy || !Number.isSafeInteger(group.count) || group.count < 1) {
            throw new Error('集計版 v12 の出現データが不正です。')
          }
          return { ...group, enemyName: enemy.name, stats: enemy.stats }
        }),
      })
    }
    return lists
  }).catch(cause => {
    archiveRequest = null
    throw cause
  })
  return archiveRequest
}

export async function loadMainStorySpawnStages(): Promise<MainStorySpawnStage[]> {
  return Array.from((await loadMainStorySpawnArchive()).values(), ({ stage }) => stage)
}

export async function loadMainStorySpawnLists(stages: readonly MainStorySpawnStage[]): Promise<MainStorySpawnList[]> {
  if (stages.length === 0) return []
  const lists = await loadMainStorySpawnArchive()
  return stages.map(stage => {
    const list = lists.get(stage.id)
    if (!list) throw new Error('集計版 v12 に選択したステージがありません。')
    return list
  })
}

function confirmedAction(action: MapWaveAction): MapWaveAction[] {
  if (action.actionType !== 'SPAWN') return []
  const resolution = action.resolution
  const count = resolution
    ? resolution.status === 'included' ? resolution.resolvedCount : null
    : action.spawnKind === 'fixed' ? action.count : null
  return count !== null && count > 0 ? [{ ...action, count }] : []
}

function addCount(counts: Map<string, number>, enemyId: string, count: number) {
  const total = (counts.get(enemyId) ?? 0) + count
  if (!Number.isSafeInteger(total)) throw new Error('敵の出現体数を確認できませんでした。')
  counts.set(enemyId, total)
}

export function buildMainStorySpawnList(
  stage: MainStorySpawnStage,
  map: MapSummary,
  detail: MapDetail | null,
  registry: MapIndex['enemies'],
  stats?: ReadonlyMap<string, MainStorySpawnStats>,
  excludedUnits?: ReadonlySet<string>,
  includedEnemyIds?: ReadonlySet<string>,
): MainStorySpawnList {
  if (!detail) return { stage, status: 'unavailable', groups: [] }
  const isEnemy = (id: string) => includedEnemyIds?.has(id)
    ?? (!Object.hasOwn(MAIN_ENEMY_EXCLUSIONS, id) && !excludedUnits?.has(id))
  const makeGroup = (enemyId: string, count: number, wave: number | null = null, fragment: number | null = null,
    time: number | null = null, entrance: string | null = null): SpawnGroup => ({
    enemyId, enemyName: registry[enemyId]?.name ?? enemyId, count, wave, fragment, time, entrance,
    stats: stats?.get(enemyId) ?? UNKNOWN_STATS,
  })
  const resolvedCounts = new Map<string, number>()
  const timedGroups = (detail.waves ?? []).flatMap((wave, waveIndex) => wave.fragments.flatMap((fragment, fragmentIndex) => {
    // The shared wave view expands configured candidates. Pass only accepted
    // actions and their resolved counts here, retaining the original routing.
    const actions = fragment.actions.flatMap(confirmedAction).filter(action => {
      const id = action.resolution?.resolvedEnemyId ?? action.key
      if (!id || !isEnemy(id)) return false
      addCount(resolvedCounts, id, action.count!)
      return true
    })
    if (!actions.length) return []
    return getMapSpawnFlow(detail, { ...fragment, actions }).rows.flatMap(row =>
      row.enemies.flatMap(({ key, count }) => key && count !== null && count > 0
        ? [makeGroup(key, count, waveIndex + 1, fragmentIndex + 1, row.time, row.entrance?.label ?? null)] : []))
  }))
  for (const { enemyId, count } of map.countedBranchSpawns ?? []) {
    if (count <= 0 || !isEnemy(enemyId)) continue
    addCount(resolvedCounts, enemyId, count)
    timedGroups.push({ ...makeGroup(enemyId, count), fromBranch: true })
  }

  const confirmed = map.status === 'supported' && detail.enemies.every(enemy => enemy.count !== null)
  const totals = confirmed
    ? new Map(detail.enemies.flatMap(({ id, count }) => count && isEnemy(id) ? [[id, count] as const] : []))
    : resolvedCounts
  const timedCounts = new Map<string, number>()
  for (const group of timedGroups) addCount(timedCounts, group.enemyId, group.count)

  // Keep verified totals even if a legacy map has no timing or the wave display
  // cap is reached. Disagreements retain the verified count without a time.
  const groups = timedGroups.filter(({ enemyId }) => (timedCounts.get(enemyId) ?? 0) <= (totals.get(enemyId) ?? 0))
  for (const [id, total] of totals) {
    const fromFlow = timedCounts.get(id) ?? 0
    if (fromFlow !== total) groups.push(makeGroup(id, fromFlow > total ? total : total - fromFlow))
  }
  return { stage, status: confirmed ? 'confirmed' : 'unconfirmed', groups }
}

const normalizeName = (value: string) => value.trim().normalize('NFKC').toLocaleLowerCase('ja-JP')

function matchingGroups(groups: SpawnGroup[], term: string) {
  return term ? groups.filter(group => normalizeName(group.enemyName).includes(term)) : groups
}

export function getMainStorySpawnChapterRows(
  lists: readonly MainStorySpawnList[], query: string,
  sort: MainStorySpawnChapterSort = { key: 'chapter', direction: 'asc' },
): MainStorySpawnChapterRow[] {
  const term = normalizeName(query)
  const byChapter = new Map<number, MainStorySpawnChapterRow>()
  for (const { stage: { chapter }, status, groups } of lists) {
    const row = byChapter.get(chapter) ?? { chapter, count: 0, stageCount: 0, partialStageCount: 0 }
    row.stageCount++
    if (status !== 'confirmed') row.partialStageCount++
    for (const group of matchingGroups(groups, term)) row.count += group.count
    byChapter.set(chapter, row)
  }
  const rows = [...byChapter.values()]
  if (term && !rows.some(row => row.count > 0)) return []
  const direction = sort.direction === 'asc' ? 1 : -1
  return rows.sort((a, b) => (a[sort.key] - b[sort.key]) * direction || a.chapter - b.chapter)
}

function compareSpawnRows(left: MainStorySpawnRow, right: MainStorySpawnRow, sort: MainStorySpawnSort): number {
  const direction = sort.direction === 'asc' ? 1 : -1
  switch (sort.key) {
    case 'stage': return compareStages(left.stage, right.stage) * direction
    case 'enemyName': return nameOrder.compare(left.enemyName, right.enemyName) * direction
    case 'wave':
      return compareNumericValues(left.wave, right.wave, direction)
        || compareNumericValues(left.fragment, right.fragment, direction)
    case 'entrance':
      if (left.entrance === null) return right.entrance === null ? 0 : 1
      if (right.entrance === null) return -1
      return (left.entrance.length - right.entrance.length || nameOrder.compare(left.entrance, right.entrance)) * direction
    case 'time':
    case 'count': return compareNumericValues(left[sort.key], right[sort.key], direction)
    default: return compareNumericValues(left.stats[sort.key], right.stats[sort.key], direction)
  }
}

function rankSpawnValues(
  entries: readonly MainStorySpawnRow[], metric: keyof MainStorySpawnStats, mode: 'units' | 'counts',
) {
  const frequencies = new Map<number, number>()
  for (const entry of entries) {
    const value = entry.stats[metric]
    if (value === null || !Number.isFinite(value)) continue
    const weight = mode === 'units' ? entry.count : 1
    frequencies.set(value, (frequencies.get(value) ?? 0) + weight)
  }

  // Rank depends on how many displayed rows have a higher value, even when the
  // table is ascending or a page or image range starts in the middle of a tie.
  const ranks = new Map<number, number>()
  let rank = 1
  for (const [value, weight] of [...frequencies].sort(([left], [right]) => right - left)) {
    ranks.set(value, rank)
    rank += weight
  }
  return { ranks, rankedRowCount: rank - 1 }
}

function getSpawnEntries(
  lists: readonly MainStorySpawnList[], query: string, mode: 'units' | 'counts', sort?: MainStorySpawnSort,
): MainStorySpawnRow[] {
  const term = normalizeName(query)
  const entries: MainStorySpawnRow[] = []
  for (const { stage, groups } of lists) {
    let visibleGroups = matchingGroups(groups, term)
    if (mode === 'counts') {
      const byEnemy = new Map<string, SpawnGroup>()
      for (const group of visibleGroups) {
        const previous = byEnemy.get(group.enemyId)
        if (previous) previous.count += group.count
        else byEnemy.set(group.enemyId, { ...group, wave: null, fragment: null, entrance: null, time: null, fromBranch: undefined })
      }
      visibleGroups = [...byEnemy.values()].sort((a, b) => b.count - a.count)
    }

    visibleGroups.forEach(({ enemyId, ...group }, groupIndex) => {
      entries.push({ ...group, key: `${stage.id}:${groupIndex}`, stage })
    })
  }

  const sortable = mode === 'units' ? sort?.key !== 'count'
    : sort?.key !== 'wave' && sort?.key !== 'time' && sort?.key !== 'entrance'
  if (sort && sortable) entries.sort((left, right) => compareSpawnRows(left, right, sort))
  return entries
}

export function findMainStorySpawnJump(
  lists: readonly MainStorySpawnList[], query: string, mode: 'units' | 'counts', sort: MainStorySpawnSort,
  target: MainStorySpawnJumpTarget,
): { offset: number; key: string; rank: number; value: number } | null {
  const metric = getMainStorySpawnRankMetric(sort)
  if (metric === null || !Number.isFinite(target.value) || target.value < 0) return null
  if (target.kind === 'rank' && (!Number.isSafeInteger(target.value) || target.value < 1)) return null

  const entries = getSpawnEntries(lists, query, mode, sort)
  const { ranks, rankedRowCount } = rankSpawnValues(entries, metric, mode)
  if (target.kind === 'rank' && target.value > rankedRowCount) return null

  let match: { value: number; rank: number } | null = null
  // Ranks are visited in high-to-low stat order. A skipped rank belongs to
  // the preceding tie, and equal stat distances favor the higher value.
  for (const [value, rank] of ranks) {
    if (target.kind === 'rank') {
      if (rank > target.value) break
    } else if (match && Math.abs(value - target.value) >= Math.abs(match.value - target.value)) {
      continue
    }
    match = { value, rank }
  }
  if (!match) return null

  let offset = 0
  for (const entry of entries) {
    if (entry.stats[metric] === match.value) return { offset, key: `${entry.key}:0`, ...match }
    offset += mode === 'units' ? entry.count : 1
  }
  return null
}

export function getMainStorySpawnRows(
  lists: readonly MainStorySpawnList[], query: string, mode: 'units' | 'counts', offset = 0, limit = Infinity,
  sort?: MainStorySpawnSort,
): { rows: MainStorySpawnRow[]; confirmedCount: number; rowCount: number; rankedRowCount: number } {
  const entries = getSpawnEntries(lists, query, mode, sort)
  const rankMetric = getMainStorySpawnRankMetric(sort)
  const ranking = rankMetric === null ? null : rankSpawnValues(entries, rankMetric, mode)

  // Sort the compressed groups first and expand only the individual rows on the page.
  const rows: MainStorySpawnRow[] = []
  let rowCount = 0
  let confirmedCount = 0
  for (const entry of entries) {
    const units = mode === 'units' ? entry.count : 1
    const first = Math.max(0, offset - rowCount)
    const end = Math.min(units, offset + limit - rowCount)
    const value = rankMetric === null ? null : entry.stats[rankMetric]
    const rank = value === null ? null : ranking?.ranks.get(value) ?? null
    for (let i = first; i < end; i += 1) {
      rows.push({ ...entry, count: mode === 'units' ? 1 : entry.count, key: `${entry.key}:${i}`,
        ...(rankMetric === null ? {} : { rank }) })
    }
    rowCount += units
    confirmedCount += entry.count
  }
  return { rows, confirmedCount, rowCount, rankedRowCount: ranking?.rankedRowCount ?? 0 }
}
