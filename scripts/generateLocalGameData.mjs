import { buildEnemyStageAppearanceDocument, normalizeLevelId, selectStageLevels } from './generateEnemyStageAppearances.mjs'
import { buildEnemyHistogramCounts } from './generateEnemyHistogramCounts.mjs'
import { buildMapDatabase } from './generateMapDatabase.mjs'
import { buildMainEnemyTrends } from './generate-main-enemy-trends.mjs'
import { parseEnemyHistogramCounts } from '../src/lib/enemyHistogramCounts.ts'
import { getMapDetail, parseMapDetailShard, parseMapIndex } from '../src/lib/mapDatabase.ts'
import { parseMainEnemyTrends } from '../src/lib/mainEnemyTrends.ts'
import { LOCAL_GAME_DATA_RUNTIME_FILES } from '../src/lib/localGameDataContract.ts'
import { validateGameDataRuntimeTables } from './localGameDataSource.mjs'

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null
const nonemptyRecord = (value) => record(value) && Object.keys(value).length > 0
const text = (value) => typeof value === 'string' && value.trim().length > 0

function requireTable(source, key, tableName) {
  const entries = record(source)?.[key]
  if (!nonemptyRecord(entries) || Object.values(entries).some((entry) => !record(entry))) {
    throw new Error(`Invalid or empty ${tableName}`)
  }
  return entries
}

/** The map registry accepts both upstream dictionary and exported Key/Value formats. */
function normalizeDatabase(source) {
  const container = record(source) && Object.hasOwn(source, 'enemies') ? source.enemies : source
  const entries = Array.isArray(container)
    ? container.map((entry) => [entry?.Key ?? entry?.key, entry?.Value ?? entry?.value])
    : Object.entries(record(container) ?? {})
  if (!entries.length) throw new Error('Invalid or empty enemy database')
  const seen = new Set()
  for (const [id, levels] of entries) {
    if (!text(id) || seen.has(id) || !Array.isArray(levels) || !levels.length
      || levels.some((level) => !record(level) || !Number.isSafeInteger(level.level)
        || level.level < 0 || !record(level.enemyData))) {
      throw new Error(`Invalid enemy database entry: ${String(id)}`)
    }
    seen.add(id)
  }
  return Object.fromEntries(entries)
}

function validateSource(source, generatedAt) {
  if (!record(source) || !/^[0-9a-f]{40}$/i.test(source.revision ?? '')) {
    throw new Error('A full source revision is required')
  }
  if (!text(generatedAt) || !Number.isFinite(Date.parse(generatedAt))) throw new Error('Invalid generation timestamp')
  requireTable(source.stageTable, 'stages', 'stage table')
  requireTable(source.zoneTable, 'zones', 'zone table')
  requireTable(source.handbook, 'enemyData', 'enemy handbook')
  validateGameDataRuntimeTables(source)
  if (!(source.levels instanceof Map)) throw new Error('Source levels must be a Map')
  for (const id of source.levels.keys()) {
    if (!text(id) || normalizeLevelId(id) !== id) throw new Error(`Invalid source level ID: ${String(id)}`)
  }
  const selection = selectStageLevels(source.stageTable)
  if (!selection.levels.length) throw new Error('The stage table contains no battle levels')
  const selectedIds = new Set(selection.levels.map(({ levelId }) => levelId))
  const declaredMissing = source.missingLevelIds ?? []
  if (!Array.isArray(declaredMissing) || declaredMissing.some((id) => !text(id)
    || normalizeLevelId(id) !== id || !selectedIds.has(id) || source.levels.has(id))
    || new Set(declaredMissing).size !== declaredMissing.length) {
    throw new Error('Invalid missing source level declaration')
  }
  const missingIds = new Set(declaredMissing)
  for (const { levelId } of selection.levels) {
    // Only absences confirmed against the immutable repository tree are allowed.
    // Download/parse failures must never be silently relabelled as upstream omissions.
    if (missingIds.has(levelId)) continue
    if (!source.levels.has(levelId)) throw new Error(`Missing source level: ${levelId}`)
    const level = record(source.levels.get(levelId))
    if (!level || !Array.isArray(level.enemyDbRefs) || !record(level.mapData)) {
      throw new Error(`Invalid source level: ${levelId}`)
    }
  }
  if (selection.levels.every(({ levelId }) => missingIds.has(levelId))) throw new Error('No source battle levels are available')
  return { database: normalizeDatabase(source.database), missingIds, selection }
}

function validateOutput(appearances, histogram, maps, trends, selection, missingIds) {
  parseEnemyHistogramCounts(histogram)
  const index = parseMapIndex(maps.index)
  const shards = new Map(Object.entries(maps.details).map(([filename, shard]) => [filename, parseMapDetailShard(shard)]))
  parseMainEnemyTrends(trends)
  const scopeExcluded = new Set(appearances.diagnostics.excludedLevelIds)
  const scopedMissingCount = [...missingIds].filter((id) => !scopeExcluded.has(id)).length
  if (appearances.status !== (scopedMissingCount ? 'partial' : 'complete')
    || appearances.summary.failedLevelCount !== scopedMissingCount
    || appearances.summary.processedLevelCount !== appearances.summary.uniqueLevelCount - scopedMissingCount
    || histogram.summary.mapCount !== appearances.summary.processedLevelCount
    || histogram.summary.missingMapCount !== scopedMissingCount || index.maps.length !== selection.levels.length
    || index.maps.filter((map) => map.status === 'missing').length !== missingIds.size) {
    throw new Error('Generated game data coverage disagrees with source coverage')
  }

  for (const [enemyId, appearance] of Object.entries(appearances.enemies)) {
    if (appearance.stageCount !== appearance.stageIds.length
      || appearance.stageCount !== (histogram.enemies[enemyId]?.mapCount ?? 0)) {
      throw new Error(`Enemy appearance counts disagree: ${enemyId}`)
    }
  }
  let detailCount = 0
  for (const shard of shards.values()) detailCount += Object.keys(shard.maps).length
  if (detailCount !== index.maps.length - missingIds.size) throw new Error('Map index and detail coverage disagree')
  for (const map of index.maps) {
    if (map.status === 'missing' && missingIds.has(map.levelId)) continue
    const shard = shards.get(map.detailFile)
    if (map.status === 'missing' || !shard) throw new Error(`Missing generated map detail: ${map.levelId}`)
    getMapDetail(shard, map)
  }
}

/** Build and validate a complete, immutable-revision snapshot without network or filesystem I/O. */
export function generateLocalGameData(source, { generatedAt = new Date().toISOString() } = {}) {
  const { database, missingIds, selection: allSelection } = validateSource(source, generatedAt)
  const revision = source.revision.toLowerCase()
  const base = `https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/${revision}/jp/gamedata`
  const provenance = {
    repository: 'ArknightsAssets/ArknightsGamedata', region: 'jp', revision,
    stageTableUrl: `${base}/excel/stage_table.json`, zoneTableUrl: `${base}/excel/zone_table.json`,
    handbookTableUrl: `${base}/excel/enemy_handbook_table.json`,
    enemyDatabaseUrl: `${base}/levels/enemydata/enemy_database.json`, levelBaseUrl: `${base}/levels`,
  }
  const selection = selectStageLevels(source.stageTable, {
    excludeStoryEnvironment: true, excludeOtherCategories: true, zoneTableSource: source.zoneTable,
  })
  const appearances = buildEnemyStageAppearanceDocument({
    selection, handbookSource: source.handbook, levelsById: source.levels, failedLevelIds: [...missingIds], generatedAt,
  })
  const histogram = buildEnemyHistogramCounts(selection.levels.filter(({ levelId }) => source.levels.has(levelId)).map(({ levelId }) => ({
    levelId, data: source.levels.get(levelId),
  })), {
    generatedAt, sourceGeneratedAt: generatedAt, sourceSummary: appearances.summary,
    failedLevelIds: [...missingIds], excludedLevelIds: selection.excludedLevelIds,
  })
  const maps = buildMapDatabase({
    stageTable: source.stageTable, zoneTable: source.zoneTable, handbook: source.handbook, database,
    levels: [...source.levels].map(([levelId, data]) => ({ levelId, data })),
    generatedAt, sourceGeneratedAt: generatedAt,
  })
  const trends = buildMainEnemyTrends({
    mapIndex: maps.index, stageTable: source.stageTable, handbook: source.handbook, database,
    levels: source.levels, generatedAt,
  })
  validateOutput(appearances, histogram, maps, trends, allSelection, missingIds)
  const files = new Map([
    ['enemy-stage-appearances.json', appearances], ['enemy-histogram-counts.json', histogram],
    ['maps/index.json', maps.index],
    ...Object.entries(maps.details).map(([filename, document]) => [`maps/${filename}`, document]),
    ['maps/main-enemy-trends.json', trends],
  ])
  for (const document of files.values()) document.source = { ...document.source, ...provenance }
  // Runtime consumers need the original upstream schemas. Do not inject provenance
  // into their dictionaries: it would be interpreted as another operator/enemy/etc.
  const runtime = { ...source, enemyHandbook: source.handbook, enemyDatabase: source.database }
  for (const [key, filename] of Object.entries(LOCAL_GAME_DATA_RUNTIME_FILES)) files.set(filename, runtime[key])
  return files
}
