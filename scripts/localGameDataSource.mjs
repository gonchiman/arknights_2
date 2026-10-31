import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { normalizeLevelId, selectStageLevels } from './generateEnemyStageAppearances.mjs'

const API = 'https://api.github.com/repos/ArknightsAssets/ArknightsGamedata'
const RAW = 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata'
const SHA = /^[0-9a-f]{40}$/
const CONCURRENCY = 8
const REQUEST_TIMEOUT_MS = 30_000
const TABLES = {
  character: 'excel/character_table.json',
  skill: 'excel/skill_table.json',
  uniequip: 'excel/uniequip_table.json',
  battleEquip: 'excel/battle_equip_table.json',
  handbookTeam: 'excel/handbook_team_table.json',
  stageTable: 'excel/stage_table.json',
  zoneTable: 'excel/zone_table.json',
  activityTable: 'excel/activity_table.json',
  handbook: 'excel/enemy_handbook_table.json',
  database: 'levels/enemydata/enemy_database.json',
}
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

class PermanentFetchError extends Error {}

function validSha(value, label) {
  if (typeof value !== 'string' || !SHA.test(value)) throw new Error(`Invalid ${label} SHA`)
  return value
}

function validatePath(value) {
  if (typeof value !== 'string' || !value || /[\\:\u0000-\u001f\u007f]/.test(value)
    || value.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Invalid game data path: ${String(value)}`)
  }
  return value
}

function parseJson(bytes, label) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
  catch (error) { throw new Error(`Invalid JSON: ${label}`, { cause: error }) }
}

async function fetchBytes(url, { fetchImpl, signal }) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    signal?.throwIfAborted()
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
    try {
      const response = await fetchImpl(url, {
        signal: requestSignal,
        headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      })
      if (!response.ok) {
        // Do not retry missing files, forbidden/authentication failures, or invalid requests.
        const ErrorType = response.status === 429 || response.status >= 500 ? Error : PermanentFetchError
        throw new ErrorType(`HTTP ${response.status}: ${url}`)
      }
      const bytes = Buffer.from(await response.arrayBuffer())
      requestSignal.throwIfAborted()
      return bytes
    } catch (error) {
      signal?.throwIfAborted()
      if (error instanceof PermanentFetchError || attempt === 2) throw error
      await delay(250 * (2 ** attempt), undefined, { signal })
    }
  }
  throw new Error(`Unable to fetch ${url}`)
}

async function fetchJson(url, options) {
  return parseJson(await fetchBytes(url, options), url)
}

/** The last commit changing JP data avoids rebuilding for updates to other locales. */
export async function fetchGameDataRevision({ fetchImpl = fetch, signal } = {}) {
  const commits = await fetchJson(`${API}/commits?sha=master&path=jp%2Fgamedata&per_page=1`, { fetchImpl, signal })
  if (!Array.isArray(commits) || commits.length !== 1) throw new Error('Missing JP game data revision')
  return validSha(commits[0]?.sha, 'revision')
}

async function fetchTree(sha, recursive, options) {
  const result = await fetchJson(`${API}/git/trees/${validSha(sha, 'tree')}${recursive ? '?recursive=1' : ''}`, options)
  if (!record(result) || !Array.isArray(result.tree) || result.truncated !== false) {
    throw new Error('Incomplete game data tree (missing or truncated)')
  }
  const entries = new Map()
  for (const entry of result.tree) {
    validatePath(entry?.path)
    validSha(entry?.sha, 'tree entry')
    if (entries.has(entry.path)) throw new Error(`Duplicate game data path: ${entry.path}`)
    entries.set(entry.path, entry)
  }
  return entries
}

async function sourceTree(revision, options) {
  // Query only jp/gamedata recursively: the whole multilingual repository can exceed GitHub's tree limit.
  let entries = await fetchTree(revision, false, options)
  for (const [index, directory] of ['jp', 'gamedata'].entries()) {
    const entry = entries.get(directory)
    if (entry?.type !== 'tree') throw new Error(`Missing game data directory: ${directory}`)
    entries = await fetchTree(entry.sha, index === 1, options)
  }
  return entries
}

function blobHash(bytes) {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}

async function readBlob({ entry, revision, cacheRoot, options }) {
  if (entry?.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) {
    throw new Error(`Missing regular game data file: ${entry?.path ?? '(unknown)'}`)
  }
  const sha = validSha(entry.sha, 'blob')
  const directory = resolve(cacheRoot, 'blobs')
  const destination = resolve(directory, `${sha}.json`)
  let bytes
  try { bytes = await readFile(destination) }
  catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  // A damaged local cache must not make every future startup fail. Recover it
  // from the immutable source; downloaded content still has to match the tree.
  const cached = bytes !== undefined && blobHash(bytes) === sha
  if (!cached) {
    const path = validatePath(entry.path).split('/').map(encodeURIComponent).join('/')
    bytes = await fetchBytes(`${RAW}/${revision}/jp/gamedata/${path}`, options)
  }
  options.signal?.throwIfAborted()
  if (blobHash(bytes) !== sha) throw new Error(`Game data blob hash mismatch: ${entry.path}`)
  const data = parseJson(bytes, entry.path)
  if (!record(data) && !Array.isArray(data)) throw new Error(`Invalid game data document: ${entry.path}`)
  if (!cached) {
    await mkdir(directory, { recursive: true })
    const temporary = resolve(directory, `${sha}.${randomUUID()}.tmp`)
    try {
      await writeFile(temporary, bytes, { signal: options.signal })
      options.signal?.throwIfAborted()
      await rename(temporary, destination)
    } finally {
      await rm(temporary, { force: true })
    }
  }
  return data
}

async function mapConcurrent(values, mapper, signal) {
  const results = new Array(values.length)
  let index = 0
  let failure
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, values.length) }, async () => {
    while (!failure && index < values.length) {
      const current = index++
      try {
        signal?.throwIfAborted()
        results[current] = await mapper(values[current], current)
      } catch (error) { failure ??= error }
    }
  }))
  if (failure) throw failure
  return results
}

function dictionaryValues(value, name) {
  if (!record(value) || !Object.keys(value).length || Object.values(value).some((entry) => !record(entry))) {
    throw new Error(`Invalid or empty ${name}`)
  }
  return Object.values(value)
}

/** Shared by acquisition and generation: optional runtime fallbacks are not valid snapshots. */
export function validateGameDataRuntimeTables({ character, skill, uniequip, battleEquip, handbookTeam }) {
  const characters = dictionaryValues(character, 'character table')
  if (!characters.some((entry) => typeof entry.name === 'string' && entry.name.trim()
    && Array.isArray(entry.phases) && entry.phases.length && entry.phases.every(record)
    && Array.isArray(entry.skills))) throw new Error('Invalid character table structure')

  const skills = dictionaryValues(skill, 'skill table')
  if (skills.some((entry) => !Array.isArray(entry.levels) || entry.levels.some((level) => !record(level)))
    || !skills.some((entry) => entry.levels.length)) throw new Error('Invalid skill table structure')

  const equipment = dictionaryValues(uniequip?.equipDict, 'module equipment table')
  const professions = dictionaryValues(uniequip?.subProfDict, 'module profession table')
  if (!equipment.some((entry) => typeof entry.charId === 'string' && typeof entry.uniEquipId === 'string')
    || !professions.some((entry) => typeof entry.subProfessionId === 'string')) {
    throw new Error('Invalid module equipment table structure')
  }

  const battleEquipment = dictionaryValues(battleEquip, 'battle equipment table')
  if (battleEquipment.some((entry) => !Array.isArray(entry.phases) || entry.phases.some((phase) => !record(phase)))
    || !battleEquipment.some((entry) => entry.phases.length)) throw new Error('Invalid battle equipment table structure')

  const teams = dictionaryValues(handbookTeam, 'handbook team table')
  if (!teams.some((entry) => typeof entry.powerName === 'string' && entry.powerName.trim())) {
    throw new Error('Invalid handbook team table structure')
  }
}

function validateTables(tables) {
  const { stageTable, zoneTable, activityTable, handbook, database } = tables
  validateGameDataRuntimeTables(tables)
  const enemies = record(database) && Object.hasOwn(database, 'enemies') ? database.enemies : database
  dictionaryValues(stageTable?.stages, 'stage table')
  dictionaryValues(zoneTable?.zones, 'zone table')
  dictionaryValues(activityTable?.basicInfo, 'activity basic information')
  const nonemptyKey = (value) => typeof value === 'string' && value.length > 0 && value.trim() === value
  if (Object.entries(activityTable.basicInfo).some(([id, activity]) => !nonemptyKey(id)
    || activity.id !== id || !nonemptyKey(activity.type))) {
    throw new Error('Invalid activity basic information structure')
  }
  if (!record(activityTable.zoneToActivity) || !Object.keys(activityTable.zoneToActivity).length
    || Object.entries(activityTable.zoneToActivity).some(([zoneId, activityId]) => !nonemptyKey(zoneId)
      || !nonemptyKey(activityId) || !Object.hasOwn(activityTable.basicInfo, activityId))) {
    throw new Error('Invalid activity zone mapping structure')
  }
  dictionaryValues(handbook?.enemyData, 'enemy handbook')
  if ((!record(enemies) && !Array.isArray(enemies)) || !Object.keys(enemies).length) {
    throw new Error('Required game data table structure is missing')
  }
  for (const stage of Object.values(stageTable.stages)) {
    if (!record(stage) || stage.isStoryOnly !== false) continue
    validatePath(typeof stage.levelId === 'string' ? stage.levelId.replaceAll('\\', '/') : stage.levelId)
    if (!normalizeLevelId(stage.levelId)) throw new Error(`Invalid stage level: ${stage.levelId}`)
  }
}

/** Load all required inputs from one immutable source revision; never mix branches or partial downloads. */
export async function loadGameDataSource({ revision, cacheRoot, fetchImpl = fetch, signal, onProgress = () => {} }) {
  validSha(revision, 'revision')
  if (typeof cacheRoot !== 'string' || !cacheRoot) throw new Error('A game data cache directory is required')
  signal?.throwIfAborted()
  const options = { fetchImpl, signal }
  const entries = await sourceTree(revision, options)
  const pendingBlobs = new Map()
  const load = (path) => {
    validatePath(path)
    const entry = entries.get(path)
    if (!entry) throw new Error(`Missing game data file: ${path}`)
    if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) {
      throw new Error(`Missing regular game data file: ${path}`)
    }
    if (!pendingBlobs.has(entry.sha)) pendingBlobs.set(entry.sha, readBlob({ entry, revision, cacheRoot, options }))
    return pendingBlobs.get(entry.sha)
  }
  const tables = {}
  let completed = 0
  onProgress({ phase: 'tables', completed, total: Object.keys(TABLES).length })
  await mapConcurrent(Object.entries(TABLES), async ([key, path]) => {
    tables[key] = await load(path)
    onProgress({ phase: 'tables', completed: ++completed, total: Object.keys(TABLES).length })
  }, signal)
  validateTables(tables)
  // Maps include EASY/story-environment battles; enemy statistics apply their
  // narrower exclusion rule during aggregation, after the shared inputs load.
  const selection = selectStageLevels(tables.stageTable)
  if (!selection.levels.length) throw new Error('No eligible game data levels found')
  // The upstream stage table includes levels not shipped in the repository.
  // Preserve these as explicit coverage gaps; a listed blob failing to download is still fatal.
  const missingLevelIds = selection.levels.filter(({ levelId }) => !entries.has(`levels/${levelId}.json`)).map(({ levelId }) => levelId)
  const availableLevels = selection.levels.filter(({ levelId }) => entries.has(`levels/${levelId}.json`))
  completed = 0
  onProgress({ phase: 'levels', completed, total: availableLevels.length })
  const levels = await mapConcurrent(availableLevels, async ({ levelId }) => {
    const data = await load(`levels/${validatePath(levelId)}.json`)
    if (!record(data) || !Array.isArray(data.enemyDbRefs)
      || (!Array.isArray(data.waves) && !record(data.waves))) {
      throw new Error(`Invalid level document: ${levelId}`)
    }
    onProgress({ phase: 'levels', completed: ++completed, total: availableLevels.length })
    return [levelId, data]
  }, signal)
  signal?.throwIfAborted()
  return { revision, ...tables, levels: new Map(levels), missingLevelIds }
}
