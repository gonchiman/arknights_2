import type { MapSummary } from '../types/map.ts'
import { parseEnemyHistogramCounts, type EnemyHistogramCounts } from './enemyHistogramCounts.ts'
import { getMapCoverageStatus, summarizeMapCoverage } from './enemyMapCoverage.ts'
import { getMapCategory, getMapEnvironment } from './mapDatabase.ts'

/** Numbered main battles in the standard environment, including chapters stored as MAINLINE_ACTIVITY. */
export function selectEnemyMainStoryMaps(maps: readonly MapSummary[]): MapSummary[] {
  const seen = new Set<string>()
  return maps.filter(map => {
    if (getMapCategory(map) !== 'main' || map.difficulty !== 'NORMAL'
      || !/^obt\/main\/level_main_\d+-\d+$/.test(map.levelId)
      || !['none', 'NORMAL', 'ALL'].includes(getMapEnvironment(map))
      || map.statisticsExclusion || seen.has(map.levelId)) return false
    seen.add(map.levelId)
    return true
  })
}

/** Recover stage appearances from the archived map references, without guessing spawn weights. */
export function buildEnemyMainStoryMapCounts(
  maps: readonly MapSummary[],
  counts: EnemyHistogramCounts,
): EnemyHistogramCounts {
  const enemies: EnemyHistogramCounts['enemies'] = Object.create(null)
  const coverage = summarizeMapCoverage(maps, 'MAPS')
  for (const map of maps) {
    if (getMapCoverageStatus(map, 'MAPS') !== 'included') continue
    for (const id of new Set(map.enemyIds)) {
      const weight = enemies[id] ??= { mapCount: 0, spawnCount: 0 }
      weight.mapCount += 1
    }
  }
  return {
    schemaVersion: 1,
    generatedAt: counts.generatedAt,
    sourceGeneratedAt: counts.sourceGeneratedAt,
    summary: {
      mapCount: coverage.included,
      missingMapCount: coverage.missing,
      excludedMapCount: coverage.excluded,
      spawnMapCount: 0,
      spawnExcludedMapCount: coverage.included,
    },
    enemies,
  }
}

/** Check the scoped weights against the same snapshot's map coverage and overall counts. */
export function parseEnemyMainStoryCounts(
  source: unknown,
  maps: readonly MapSummary[],
  overall: EnemyHistogramCounts,
): EnemyHistogramCounts {
  const counts = parseEnemyHistogramCounts(source)
  const mainMaps = selectEnemyMainStoryMaps(maps)
  const stageCounts = buildEnemyMainStoryMapCounts(mainMaps, overall)
  const spawnMaps = mainMaps.filter(map => getMapCoverageStatus(map, 'SPAWNS') === 'included')
  const lowerCount = spawnMaps.filter(map => map.spawnAggregation?.kind === 'lower-bound').length
  const expectedCount = spawnMaps.filter(map => map.spawnAggregation?.kind === 'expected-lower-bound').length
  const mapTotal = spawnMaps.reduce((sum, map) => sum + (map.spawnCount ?? map.spawnAggregation?.count ?? 0), 0)
  const scopeTotal = Object.values(counts.enemies).reduce((sum, enemy) => sum + enemy.spawnCount, 0)
  const enemyIds = new Set([...Object.keys(stageCounts.enemies), ...Object.keys(counts.enemies)])
  const { summary } = counts
  if (counts.generatedAt !== overall.generatedAt || counts.sourceGeneratedAt !== overall.sourceGeneratedAt
    || counts.spawnAggregationMode !== overall.spawnAggregationMode
    || summary.mapCount !== stageCounts.summary.mapCount || summary.missingMapCount !== stageCounts.summary.missingMapCount
    || (summary.excludedMapCount ?? 0) !== stageCounts.summary.excludedMapCount
    || summary.spawnMapCount !== spawnMaps.length || (summary.lowerBoundMapCount ?? 0) !== lowerCount
    || (summary.expectedMapCount ?? 0) !== expectedCount || Math.abs(scopeTotal - mapTotal) > 1e-8
    || [...enemyIds].some(id => (counts.enemies[id]?.mapCount ?? 0) !== (stageCounts.enemies[id]?.mapCount ?? 0)
      || (counts.enemies[id]?.spawnCount ?? 0) > (overall.enemies[id]?.spawnCount ?? 0) + 1e-8)) {
    throw new Error('メインストーリーの登場データと集計版が一致しません。')
  }
  return counts
}
