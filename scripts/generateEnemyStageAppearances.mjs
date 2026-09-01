import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const RAW_BASE = 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/master/jp/gamedata'
const STAGE_TABLE_URL = `${RAW_BASE}/excel/stage_table.json`
const HANDBOOK_URL = `${RAW_BASE}/excel/enemy_handbook_table.json`
const LEVEL_BASE_URL = `${RAW_BASE}/levels`
const DEFAULT_CONCURRENCY = 8
const DEFAULT_RETRIES = 2
const DEFAULT_OUTPUT_PATH = fileURLToPath(new URL('../public/data/enemy-stage-appearances.json', import.meta.url))
const DEFAULT_CACHE_ROOT = fileURLToPath(new URL('../.cache/enemy-stage-appearances/levels', import.meta.url))

export function normalizeLevelId(value) {
  if (typeof value !== 'string') return null

  const normalized = value
    .trim()
    .replaceAll('\\', '/')
    .replace(/\.json$/i, '')
    .replace(/^\/+/, '')
    .toLowerCase()
  const segments = normalized.split('/')
  if (!normalized || segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes(':'))) {
    return null
  }
  return normalized
}

export function selectStageLevels(stageTableSource) {
  const stages = asRecord(asRecord(stageTableSource)?.stages)
  if (!stages) return { stageRecordCount: 0, levels: [] }

  const candidatesByLevel = new Map()
  let stageRecordCount = 0

  for (const [fallbackStageId, rawStage] of Object.entries(stages)) {
    const stage = asRecord(rawStage)
    if (!stage || stage.isStoryOnly !== false) continue

    const levelId = normalizeLevelId(stage.levelId)
    const stageId = readString(stage.stageId) ?? fallbackStageId
    if (!levelId || !stageId) continue

    stageRecordCount += 1
    const candidates = candidatesByLevel.get(levelId) ?? []
    candidates.push({
      levelId,
      stageId,
      difficulty: readString(stage.difficulty),
    })
    candidatesByLevel.set(levelId, candidates)
  }

  const levels = [...candidatesByLevel.entries()]
    .map(([levelId, candidates]) => {
      const [canonical] = [...candidates].sort(compareStageCandidates)
      return { levelId, stageId: canonical.stageId }
    })
    .sort((a, b) => a.levelId.localeCompare(b.levelId, 'en', { numeric: true }))

  return { stageRecordCount, levels }
}

export function extractLevelEnemyIds(levelSource) {
  const refs = asRecord(levelSource)?.enemyDbRefs
  if (!Array.isArray(refs)) return []

  return [...new Set(refs.flatMap((rawRef) => {
    const id = readString(asRecord(rawRef)?.id)
    return id ? [id] : []
  }))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
}

export function extractHandbookEnemyIds(handbookSource) {
  const enemyData = asRecord(asRecord(handbookSource)?.enemyData)
  if (!enemyData) return []

  return [...new Set(Object.entries(enemyData).flatMap(([fallbackId, rawEnemy]) => {
    const enemy = asRecord(rawEnemy)
    if (!enemy || readBoolean(enemy.hideInHandbook) === true || readBoolean(enemy.isInvalidKilled) === true) return []
    const id = readString(enemy.enemyId) ?? fallbackId
    return id ? [id] : []
  }))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
}

export function buildEnemyStageAppearanceDocument({
  selection,
  handbookSource,
  levelsById,
  failedLevelIds = [],
  generatedAt = new Date().toISOString(),
}) {
  const handbookEnemyIds = extractHandbookEnemyIds(handbookSource)
  const handbookEnemyIdSet = new Set(handbookEnemyIds)
  const appearances = new Map(handbookEnemyIds.map((enemyId) => [enemyId, new Map()]))
  const referencedEnemyIds = new Set()
  const failures = new Set(failedLevelIds.map(normalizeLevelId).filter(Boolean))
  let processedLevelCount = 0

  for (const level of selection.levels) {
    if (!levelsById.has(level.levelId)) {
      failures.add(level.levelId)
      continue
    }

    processedLevelCount += 1
    for (const enemyId of extractLevelEnemyIds(levelsById.get(level.levelId))) {
      referencedEnemyIds.add(enemyId)
      const stagesByLevel = appearances.get(enemyId) ?? new Map()
      stagesByLevel.set(level.levelId, level.stageId)
      appearances.set(enemyId, stagesByLevel)
    }
  }

  const unmatchedEnemyIds = [...referencedEnemyIds]
    .filter((enemyId) => !handbookEnemyIdSet.has(enemyId))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
  const enemies = Object.fromEntries([...appearances.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
    .map(([enemyId, stagesByLevel]) => {
      const stageIds = [...stagesByLevel.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
        .map(([, stageId]) => stageId)
      return [enemyId, { stageCount: stagesByLevel.size, stageIds }]
    }))
  const failed = [...failures].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))

  return {
    schemaVersion: 1,
    scope: 'stage_table',
    status: failed.length === 0 ? 'complete' : 'partial',
    generatedAt,
    source: {
      repository: 'ArknightsAssets/ArknightsGamedata',
      region: 'jp',
      stageTableUrl: STAGE_TABLE_URL,
      handbookTableUrl: HANDBOOK_URL,
      levelBaseUrl: LEVEL_BASE_URL,
    },
    summary: {
      stageRecordCount: selection.stageRecordCount,
      uniqueLevelCount: selection.levels.length,
      processedLevelCount,
      failedLevelCount: failed.length,
      handbookEnemyCount: handbookEnemyIds.length,
      referencedEnemyCount: referencedEnemyIds.size,
      unmatchedEnemyCount: unmatchedEnemyIds.length,
    },
    enemies,
    diagnostics: {
      failedLevelIds: failed,
      unmatchedEnemyIds,
    },
  }
}

export function buildLevelUrl(levelId) {
  const normalized = normalizeLevelId(levelId)
  if (!normalized) throw new Error(`Invalid levelId: ${String(levelId)}`)
  const encodedPath = normalized.split('/').map(encodeURIComponent).join('/')
  return `${LEVEL_BASE_URL}/${encodedPath}.json`
}

async function generate({ outputPath, cacheRoot, concurrency, refresh }) {
  const [stageTable, handbook] = await Promise.all([
    fetchJsonWithRetry(STAGE_TABLE_URL, { retries: DEFAULT_RETRIES }),
    fetchJsonWithRetry(HANDBOOK_URL, { retries: DEFAULT_RETRIES }),
  ])
  const selection = selectStageLevels(stageTable)
  console.log(`${selection.stageRecordCount}件のステージから${selection.levels.length}個のLevelを集計します。`)

  let completed = 0
  const results = await mapConcurrent(selection.levels, concurrency, async (level) => {
    const cachePath = resolveCachePath(cacheRoot, level.levelId)
    try {
      const data = await fetchJsonWithRetry(buildLevelUrl(level.levelId), {
        cachePath,
        retries: DEFAULT_RETRIES,
        refresh,
      })
      return { levelId: level.levelId, data, error: null }
    } catch (error) {
      return {
        levelId: level.levelId,
        data: null,
        error: error instanceof Error ? error.message : String(error),
      }
    } finally {
      completed += 1
      if (completed % 50 === 0 || completed === selection.levels.length) {
        console.log(`${completed} / ${selection.levels.length}`)
      }
    }
  })

  const levelsById = new Map()
  const failedLevelIds = []
  const failureMessages = []
  for (const result of results) {
    if (result.data === null) {
      failedLevelIds.push(result.levelId)
      failureMessages.push(`${result.levelId}: ${result.error}`)
    } else {
      levelsById.set(result.levelId, result.data)
    }
  }
  for (const message of failureMessages.slice(0, 20)) console.warn(message)
  if (failureMessages.length > 20) {
    console.warn(`ほか${failureMessages.length - 20}件の取得失敗は生成物のdiagnostics.failedLevelIdsに記録しました。`)
  }

  const document = buildEnemyStageAppearanceDocument({
    selection,
    handbookSource: handbook,
    levelsById,
    failedLevelIds,
  })
  await writeJson(outputPath, document)
  console.log(JSON.stringify(document.summary, null, 2))
  console.log(`生成先: ${outputPath}`)
}

async function fetchJsonWithRetry(url, { cachePath = null, retries, refresh = false }) {
  if (cachePath && !refresh) {
    const cached = await readCachedJson(cachePath)
    if (cached !== null) return cached
  }

  let lastError = null
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url)
      if (!response.ok) {
        const httpError = new Error(`${response.status} ${response.statusText}`)
        httpError.permanent = response.status === 404
        throw httpError
      }
      const data = await response.json()
      if (cachePath) await writeJson(cachePath, data)
      return data
    } catch (error) {
      lastError = error
      if (error?.permanent === true) break
      if (attempt < retries) await wait(300 * (2 ** attempt))
    }
  }
  throw new Error(`${url} の取得に失敗しました: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

async function readCachedJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function resolveCachePath(cacheRoot, levelId) {
  const root = resolve(cacheRoot)
  const target = resolve(root, `${levelId}.json`)
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error(`Cache path escaped its root: ${levelId}`)
  }
  return target
}

async function mapConcurrent(values, concurrency, mapper) {
  const results = new Array(values.length)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await mapper(values[currentIndex], currentIndex)
    }
  })
  await Promise.all(workers)
  return results
}

function compareStageCandidates(a, b) {
  return stageCandidateScore(a) - stageCandidateScore(b)
    || a.stageId.localeCompare(b.stageId, 'en', { numeric: true })
}

function stageCandidateScore(candidate) {
  if (candidate.difficulty === 'NORMAL' && !candidate.stageId.includes('#')) return 0
  if (candidate.difficulty === 'NORMAL') return 1
  if (!candidate.stageId.includes('#')) return 2
  return 3
}

function readString(value) {
  const unwrapped = unwrapValue(value)
  return typeof unwrapped === 'string' && unwrapped.trim() ? unwrapped : null
}

function readBoolean(value) {
  const unwrapped = unwrapValue(value)
  return typeof unwrapped === 'boolean' ? unwrapped : null
}

function unwrapValue(value) {
  const wrapped = asRecord(value)
  if (!wrapped || !('m_value' in wrapped)) return value
  if ('m_defined' in wrapped && wrapped.m_defined !== true) return null
  return wrapped.m_value
}

function asRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function wait(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))
}

function parseArguments(argv) {
  const output = argv.find((argument) => argument.startsWith('--output='))?.slice('--output='.length)
  const cache = argv.find((argument) => argument.startsWith('--cache='))?.slice('--cache='.length)
  const requestedConcurrency = Number(argv.find((argument) => argument.startsWith('--concurrency='))?.slice('--concurrency='.length))
  return {
    outputPath: resolve(output || DEFAULT_OUTPUT_PATH),
    cacheRoot: resolve(cache || DEFAULT_CACHE_ROOT),
    concurrency: Number.isInteger(requestedConcurrency) && requestedConcurrency > 0
      ? Math.min(requestedConcurrency, 24)
      : DEFAULT_CONCURRENCY,
    refresh: argv.includes('--refresh'),
  }
}

const directRunUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null
if (directRunUrl === import.meta.url) {
  generate(parseArguments(process.argv.slice(2))).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
