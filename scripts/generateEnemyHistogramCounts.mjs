import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { extractLevelEnemyIds, normalizeLevelId } from './generateEnemyStageAppearances.mjs'

const DEFAULT_CACHE_ROOT = fileURLToPath(new URL('../.cache/enemy-stage-appearances/levels', import.meta.url))
const DEFAULT_SOURCE_PATH = fileURLToPath(new URL('../public/data/enemy-stage-appearances.json', import.meta.url))
const DEFAULT_OUTPUT_PATH = fileURLToPath(new URL('../public/data/enemy-histogram-counts.json', import.meta.url))
const ACTION_FIELDS = new Set([
  'actionType', 'key', 'count', 'managedByScheduler', 'preDelay', 'interval', 'routeIndex',
  'blockFragment', 'autoPreviewRoute', 'autoDisplayEnemyInfo', 'isUnharmfulAndAlwaysCountAsKilled',
  'hiddenGroup', 'randomSpawnGroupKey', 'randomSpawnGroupPackKey', 'randomType', 'refreshType',
  'weight', 'dontBlockWave', 'forceBlockWaveInBranch', 'isValid', 'condition', 'conditions',
])
const WAVE_FIELDS = new Set(['fragments', 'preDelay', 'postDelay', 'maxTimeWaitingForNextWave', 'advancedWaveTag'])
const FRAGMENT_FIELDS = new Set(['actions', 'preDelay'])

/**
 * Counts enemy references once per cached level, and explicit SPAWN quantities
 * only on maps whose entire spawn schedule is supported. A zero spawnCount is
 * therefore zero within the fixed supported subset, never a global absence.
 * Timestamps are supplied by the caller to keep this transformation pure.
 */
export function buildEnemyHistogramCounts(levels, provenance = {}) {
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
    if (byLevel.has(levelId)) duplicates.add(levelId)
    else byLevel.set(levelId, level.data)
  }

  const enemies = new Map()
  const excludedLevels = []
  const reasonCounts = new Map()
  let spawnMapCount = 0
  for (const [levelId, data] of [...byLevel].sort(([left], [right]) => compareIds(left, right))) {
    for (const enemyId of extractLevelEnemyIds(data)) {
      const counts = enemies.get(enemyId) ?? { mapCount: 0, spawnCount: 0 }
      counts.mapCount += 1
      enemies.set(enemyId, counts)
    }
    const { counts, reasons } = readSpawnCounts(data)
    // Check before applying any contribution so overflow also excludes the whole map.
    for (const [enemyId, count] of counts) {
      if (!Number.isSafeInteger((enemies.get(enemyId)?.spawnCount ?? 0) + count)) {
        reasons.add('spawn-total-overflow')
      }
    }
    if (reasons.size > 0) {
      const sortedReasons = [...reasons].sort()
      excludedLevels.push({ levelId, reasons: sortedReasons })
      for (const reason of sortedReasons) reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1)
      continue
    }
    spawnMapCount += 1
    for (const [enemyId, count] of counts) {
      const entry = enemies.get(enemyId) ?? { mapCount: 0, spawnCount: 0 }
      entry.spawnCount += count
      enemies.set(enemyId, entry)
    }
  }

  const sourceSummary = asRecord(provenance.sourceSummary)
  const sourceFailedIds = new Set((Array.isArray(provenance.failedLevelIds) ? provenance.failedLevelIds : [])
    .map(normalizeLevelId).filter(Boolean))
  const missingLevelIds = [...sourceFailedIds].filter((levelId) => !byLevel.has(levelId)).sort(compareIds)
  const requestedMapCount = nonnegativeInteger(sourceSummary?.uniqueLevelCount)
  const sourceMissingMapCount = nonnegativeInteger(sourceSummary?.failedLevelCount)
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
    generatedAt: readString(provenance.generatedAt),
    sourceGeneratedAt: readString(provenance.sourceGeneratedAt),
    summary: {
      mapCount: byLevel.size,
      missingMapCount,
      spawnMapCount,
      spawnExcludedMapCount: excludedLevels.length,
    },
    enemies: Object.fromEntries([...enemies].sort(([left], [right]) => compareIds(left, right))),
    diagnostics: {
      excludedLevels,
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

function readSpawnCounts(value) {
  const level = asRecord(value)
  const counts = new Map()
  const reasons = new Set()
  if (!level) return { counts, reasons: new Set(['invalid-level']) }
  if (!Array.isArray(level.enemyDbRefs)) reasons.add('invalid-enemy-refs')

  if (!Array.isArray(level.waves)) reasons.add('invalid-waves')
  else for (const rawWave of level.waves) {
    const wave = asRecord(rawWave)
    if (!wave || !Array.isArray(wave.fragments)) {
      reasons.add('invalid-fragments')
      continue
    }
    checkUnknownFields(wave, WAVE_FIELDS, 'wave', reasons)
    // Special modes also use tags containing runtime selection expressions.
    // Without their interpreter, even a numeric tag is not evidence of a fixed wave.
    if (wave.advancedWaveTag != null && wave.advancedWaveTag !== '') reasons.add('unsupported-wave-tag')
    for (const rawFragment of wave.fragments) {
      const fragment = asRecord(rawFragment)
      if (!fragment || !Array.isArray(fragment.actions)) {
        reasons.add('invalid-actions')
        continue
      }
      checkUnknownFields(fragment, FRAGMENT_FIELDS, 'fragment', reasons)
      for (const rawAction of fragment.actions) {
        const action = asRecord(rawAction)
        if (!action || !readString(action.actionType)) reasons.add('invalid-action')
        else if (action.actionType === 'SPAWN') addSpawn(action, counts, reasons)
      }
    }
  }

  if (level.branches != null) {
    const branches = asRecord(level.branches)
    if (!branches) reasons.add('invalid-branches')
    else for (const rawBranch of Object.values(branches)) {
      const branch = asRecord(rawBranch)
      if (!branch || !Array.isArray(branch.phases)) {
        reasons.add('invalid-branch-phases')
        continue
      }
      for (const rawPhase of branch.phases) {
        const phase = asRecord(rawPhase)
        if (!phase || !Array.isArray(phase.actions)) {
          reasons.add('invalid-branch-actions')
          continue
        }
        for (const rawAction of phase.actions) {
          const action = asRecord(rawAction)
          if (!action || !readString(action.actionType)) reasons.add('invalid-branch-action')
          else if (action.actionType === 'SPAWN') reasons.add('branch-spawn')
        }
      }
    }
  }

  if (level.runes != null && !Array.isArray(level.runes)) reasons.add('invalid-runes')
  for (const rawRune of Array.isArray(level.runes) ? level.runes : []) {
    const rune = asRecord(rawRune)
    if (!rune) reasons.add('invalid-rune')
    // FOUR_STAR replacement rules do not apply to the normal stage schedule.
    else if (rune.key === 'level_enemy_replace' && rune.difficultyMask !== 'FOUR_STAR') {
      reasons.add('enemy-replacement')
    }
  }
  return { counts, reasons }
}

function addSpawn(action, counts, reasons) {
  const count = nonnegativeInteger(action.count)
  if (count === null) {
    reasons.add('invalid-spawn-count')
    return
  }
  // An explicit zero creates no enemy, even when it has otherwise conditional metadata.
  if (count === 0) return
  const enemyId = readString(action.key)
  if (!enemyId) reasons.add('invalid-spawn-enemy')
  for (const key of ['randomSpawnGroupKey', 'randomSpawnGroupPackKey']) {
    if (action[key] != null && action[key] !== '') reasons.add('random-spawn-group')
  }
  if (action.hiddenGroup != null && action.hiddenGroup !== '') reasons.add('hidden-spawn-group')
  if (action.weight != null && action.weight !== '' && action.weight !== 0) reasons.add('weighted-spawn')
  for (const key of ['randomType', 'refreshType']) {
    if (action[key] != null && action[key] !== '' && action[key] !== 'ALWAYS') {
      reasons.add(`conditional-spawn:${key}`)
    }
  }
  for (const key of ['condition', 'conditions']) {
    const value = action[key]
    if (value != null && value !== '' && value !== 'ALWAYS' && value !== true
      && !(Array.isArray(value) && value.length === 0)) {
      reasons.add(`conditional-spawn:${key}`)
    }
  }
  if (action.managedByScheduler === false) reasons.add('unscheduled-spawn')
  checkUnknownFields(action, ACTION_FIELDS, 'spawn', reasons)
  // Legacy exports set isValid:false on every SPAWN. It is editor metadata,
  // not a switch that disables the action, so it deliberately is not filtered.
  if (!enemyId) return
  const next = (counts.get(enemyId) ?? 0) + count
  if (!Number.isSafeInteger(next)) reasons.add('spawn-total-overflow')
  else counts.set(enemyId, next)
}

function checkUnknownFields(record, supported, context, reasons) {
  for (const [key, value] of Object.entries(record)) {
    if (!supported.has(key) && !isDefault(value)) reasons.add(`unsupported-${context}-field:${key}`)
  }
}

function isDefault(value) {
  return value == null || value === false || value === 0 || value === ''
    || (Array.isArray(value) && value.length === 0)
    || (asRecord(value) !== null && Object.keys(value).length === 0)
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

async function generate({ cacheRoot, sourcePath, outputPath }) {
  const [levels, source] = await Promise.all([
    readCachedLevels(cacheRoot),
    readFile(sourcePath, 'utf8').then(JSON.parse),
  ])
  const document = buildEnemyHistogramCounts(levels, {
    generatedAt: new Date().toISOString(),
    sourceGeneratedAt: source.generatedAt,
    sourceSummary: source.summary,
    failedLevelIds: source.diagnostics?.failedLevelIds,
  })
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ ...document.summary, reasons: document.diagnostics.reasonCounts }, null, 2))
  console.log(`Generated: ${outputPath}`)
}

function parseArguments(argv) {
  const values = new Map()
  for (const argument of argv) {
    const match = /^--(cache|source|output)=(.+)$/.exec(argument)
    if (!match) throw new Error(`Expected --cache=path, --source=path, or --output=path: ${argument}`)
    values.set(match[1], resolve(match[2]))
  }
  return {
    cacheRoot: values.get('cache') ?? DEFAULT_CACHE_ROOT,
    sourcePath: values.get('source') ?? DEFAULT_SOURCE_PATH,
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
