import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { extractLevelEnemyIds, normalizeLevelId, selectStageLevels } from './generateEnemyStageAppearances.mjs'
import { analyzeEnemySpawns } from './lib/enemySpawnConditions.mjs'
import { resolveEnemySpawnAggregation } from './lib/enemySpawnAggregation.mjs'

const DEFAULT_CACHE_ROOT = fileURLToPath(new URL('../.cache/enemy-stage-appearances/levels', import.meta.url))
const DEFAULT_SOURCE_PATH = fileURLToPath(new URL('../public/data/enemy-stage-appearances.json', import.meta.url))
const DEFAULT_OUTPUT_PATH = fileURLToPath(new URL('../public/data/enemy-histogram-counts.json', import.meta.url))
const DEFAULT_STAGES_PATH = fileURLToPath(new URL('../reference-data/ArknightsGamedata/jp/gamedata/excel/stage_table.json', import.meta.url))

/**
 * Counts enemy references once per cached level, and explicit SPAWN quantities
 * on supported maps, with V4 optionally retaining known contributions from
 * partial schedules. A zero spawnCount is never evidence of global absence.
 * Timestamps are supplied by the caller to keep this transformation pure.
 */
export function buildEnemyHistogramCounts(levels, provenance = {}) {
  const mode = provenance.spawnAggregationMode ?? 'strict'
  if (!['strict', 'lower-bound'].includes(mode)) throw new Error('Unknown enemy spawn aggregation mode')
  const excludedLevelIds = [...new Set((Array.isArray(provenance.excludedLevelIds) ? provenance.excludedLevelIds : [])
    .map(normalizeLevelId).filter(Boolean))].sort(compareIds)
  const scopeExcluded = new Set(excludedLevelIds)
  const byLevel = new Map()
  const duplicates = new Set()
  const invalidLevelIds = []
  for (const rawLevel of levels) {
    const level = asRecord(rawLevel)
    const levelId = normalizeLevelId(level?.levelId)
    if (!levelId) {
      invalidLevelIds.push(typeof level?.levelId === 'string' ? level.levelId : null)
      continue
    }
    // Scope exclusions apply even when an older or separately populated cache contains the level.
    if (scopeExcluded.has(levelId)) continue
    if (byLevel.has(levelId)) duplicates.add(levelId)
    else byLevel.set(levelId, level.data)
  }

  const enemies = new Map()
  const contextEntries = provenance.stageContexts instanceof Map ? [...provenance.stageContexts]
    : Object.entries(asRecord(provenance.stageContexts) ?? {})
  const stageContexts = new Map(contextEntries.map(([id, context]) => [normalizeLevelId(id), context]))
  const excludedLevels = []
  const lowerBoundLevels = []
  const excludedNonEnemySpawns = [], unverifiedNonEnemySpawns = []
  const reasonCounts = new Map()
  let spawnMapCount = 0
  for (const [levelId, data] of [...byLevel].sort(([left], [right]) => compareIds(left, right))) {
    for (const enemyId of extractLevelEnemyIds(data)) {
      const counts = enemies.get(enemyId) ?? { mapCount: 0, spawnCount: 0 }
      counts.mapCount += 1
      enemies.set(enemyId, counts)
    }
    const context = stageContexts.has(levelId) ? stageContexts.get(levelId)
      : provenance.stageContexts === undefined ? {} : null
    const resolutionContext = asRecord(context) ? { ...context, levelId, sourceRevision: provenance.sourceRevision } : context
    const analysis = analyzeEnemySpawns(data, resolutionContext)
    const { reasons } = analysis
    // Check before applying any contribution so overflow also excludes the whole map.
    for (const [enemyId, count] of analysis.counts) {
      if (!Number.isSafeInteger((enemies.get(enemyId)?.spawnCount ?? 0) + count)) {
        reasons.add('spawn-total-overflow')
      }
    }
    const aggregation = resolveEnemySpawnAggregation(data, resolutionContext, { mode, analysis })
    if (aggregation.kind === 'excluded') {
      const sortedReasons = aggregation.reasons
      excludedLevels.push({ levelId, reasons: sortedReasons })
      for (const reason of sortedReasons) reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1)
      continue
    }
    spawnMapCount += 1
    if (aggregation.kind === 'lower-bound') lowerBoundLevels.push({ levelId,
      spawnCount: aggregation.count, reasons: aggregation.reasons })
    excludedNonEnemySpawns.push(...aggregation.excludedNonEnemySpawns.map(entry => ({ levelId, ...entry })))
    unverifiedNonEnemySpawns.push(...aggregation.unverifiedNonEnemySpawns.map(entry => ({ levelId, ...entry })))
    for (const [enemyId, count] of aggregation.counts) {
      const entry = enemies.get(enemyId) ?? { mapCount: 0, spawnCount: 0 }
      entry.spawnCount += count
      enemies.set(enemyId, entry)
    }
  }

  const sourceSummary = asRecord(provenance.sourceSummary)
  const allSourceFailedIds = new Set((Array.isArray(provenance.failedLevelIds) ? provenance.failedLevelIds : [])
    .map(normalizeLevelId).filter(Boolean))
  const sourceFailedIds = new Set([...allSourceFailedIds].filter((levelId) => !scopeExcluded.has(levelId)))
  const missingLevelIds = [...sourceFailedIds].filter((levelId) => !byLevel.has(levelId)).sort(compareIds)
  // Older provenance totals still include levels subsequently marked out of scope.
  // New stage summaries record excludedLevelCount and already omit them from their totals.
  const sourceScopeApplied = nonnegativeInteger(sourceSummary?.excludedLevelCount) !== null
  const sourceRequestedMapCount = nonnegativeInteger(sourceSummary?.uniqueLevelCount)
  const sourceFailedMapCount = nonnegativeInteger(sourceSummary?.failedLevelCount)
  const requestedMapCount = sourceRequestedMapCount === null ? null
    : Math.max(0, sourceRequestedMapCount - (sourceScopeApplied ? 0 : excludedLevelIds.length))
  const sourceMissingMapCount = sourceFailedMapCount === null ? null
    : Math.max(0, sourceFailedMapCount - (sourceScopeApplied ? 0 : allSourceFailedIds.size - sourceFailedIds.size))
  const recoveredMapCount = sourceFailedIds.size - missingLevelIds.length
  const missingMapCount = Math.max(
    missingLevelIds.length,
    (requestedMapCount ?? 0) - byLevel.size,
    (sourceMissingMapCount ?? 0) - recoveredMapCount,
    0,
  )

  return {
    schemaVersion: 1,
    scope: 'cached-stage-levels',
    ...(mode === 'lower-bound' ? { spawnAggregationMode: mode } : {}),
    generatedAt: readString(provenance.generatedAt),
    sourceGeneratedAt: readString(provenance.sourceGeneratedAt),
    summary: {
      mapCount: byLevel.size,
      missingMapCount,
      excludedMapCount: excludedLevelIds.length,
      spawnMapCount,
      spawnExcludedMapCount: excludedLevels.length,
      ...(mode === 'lower-bound' ? { lowerBoundMapCount: lowerBoundLevels.length } : {}),
    },
    enemies: Object.fromEntries([...enemies].sort(([left], [right]) => compareIds(left, right))),
    diagnostics: {
      excludedLevelIds,
      excludedLevels,
      ...(mode === 'lower-bound' ? { lowerBoundLevels } : {}),
      ...(excludedNonEnemySpawns.length ? { excludedNonEnemySpawns } : {}),
      ...(unverifiedNonEnemySpawns.length ? { unverifiedNonEnemySpawns } : {}),
      reasonCounts: Object.fromEntries([...reasonCounts].sort(([left], [right]) => compareIds(left, right))),
      missingLevelIds,
      duplicateLevelIds: [...duplicates].sort(compareIds),
      invalidLevelIds,
      sourceCoverage: {
        requestedMapCount,
        sourceProcessedMapCount: nonnegativeInteger(sourceSummary?.processedLevelCount),
        sourceMissingMapCount,
        recoveredMapCount,
      },
    },
  }
}

function asRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function readString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function nonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}

function compareIds(left, right) {
  return left.localeCompare(right, 'en', { numeric: true })
}

function assertInside(root, target) {
  const child = relative(root, target)
  if (isAbsolute(child) || child === '..' || child.startsWith(`..${sep}`)) {
    throw new Error(`Cache path escaped its root: ${target}`)
  }
}

/** Read only local files. Resolve every path before reading, including symlinks. */
export async function readCachedLevels(cacheRoot) {
  const root = await realpath(resolve(cacheRoot))
  const levels = []
  const visitedDirectories = new Set()
  async function walk(directory) {
    const actualDirectory = await realpath(directory)
    assertInside(root, actualDirectory)
    if (visitedDirectories.has(actualDirectory)) return
    visitedDirectories.add(actualDirectory)
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => compareIds(a.name, b.name))) {
      const path = resolve(directory, entry.name)
      assertInside(root, path)
      const actualPath = await realpath(path)
      assertInside(root, actualPath)
      if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not supported in the level cache: ${path}`)
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile() && /\.json$/i.test(entry.name)) {
        const levelId = normalizeLevelId(relative(root, path))
        if (!levelId) throw new Error(`Invalid cached level path: ${path}`)
        levels.push({ levelId, data: JSON.parse(await readFile(actualPath, 'utf8')) })
      }
    }
  }
  await walk(root)
  return levels
}

async function generate({ cacheRoot, sourcePath, stagesPath, outputPath }) {
  const [levels, source, stages] = await Promise.all([
    readCachedLevels(cacheRoot),
    readFile(sourcePath, 'utf8').then(JSON.parse),
    readFile(stagesPath, 'utf8').then(JSON.parse),
  ])
  const document = buildEnemyHistogramCounts(levels, {
    generatedAt: new Date().toISOString(),
    sourceGeneratedAt: source.generatedAt,
    sourceSummary: source.summary,
    failedLevelIds: source.diagnostics?.failedLevelIds,
    excludedLevelIds: source.diagnostics?.excludedLevelIds,
    stageContexts: new Map(selectStageLevels(stages).levels.map(({ levelId, context }) => [levelId, context ?? {}])),
  })
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ ...document.summary, reasons: document.diagnostics.reasonCounts }, null, 2))
  console.log(`Generated: ${outputPath}`)
}

function parseArguments(argv) {
  const values = new Map()
  for (const argument of argv) {
    const match = /^--(cache|source|stages|output)=(.+)$/.exec(argument)
    if (!match) throw new Error(`Expected --cache=path, --source=path, --stages=path, or --output=path: ${argument}`)
    values.set(match[1], resolve(match[2]))
  }
  return {
    cacheRoot: values.get('cache') ?? DEFAULT_CACHE_ROOT,
    sourcePath: values.get('source') ?? DEFAULT_SOURCE_PATH,
    stagesPath: values.get('stages') ?? DEFAULT_STAGES_PATH,
    outputPath: values.get('output') ?? DEFAULT_OUTPUT_PATH,
  }
}

const directRunUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null
if (directRunUrl === import.meta.url) {
  Promise.resolve().then(() => generate(parseArguments(process.argv.slice(2)))).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
