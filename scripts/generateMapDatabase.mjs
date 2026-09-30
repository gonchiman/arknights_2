import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { extractLevelEnemyIds, selectStageLevels } from './generateEnemyStageAppearances.mjs'
import { buildEnemyHistogramCounts, readCachedLevels } from './generateEnemyHistogramCounts.mjs'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null
const unwrap = (value) => {
  const wrapped = record(value)
  return wrapped && 'm_value' in wrapped
    ? ('m_defined' in wrapped && wrapped.m_defined !== true ? null : wrapped.m_value)
    : value
}
const text = (value) => typeof unwrap(value) === 'string' && unwrap(value).trim() ? unwrap(value).trim() : null
const number = (value) => typeof unwrap(value) === 'number' && Number.isFinite(unwrap(value)) ? unwrap(value) : null
const nonnegative = (value) => number(value) !== null && number(value) >= 0 ? number(value) : null
const compare = (a, b) => a.localeCompare(b, 'en', { numeric: true })
const array = (value) => Array.isArray(value) ? value : []
const readBlackboard = (value) => Array.isArray(value)
  ? Object.fromEntries(value.filter(record).map((entry) => [entry.key, entry.value]))
  : record(value) ?? {}
const TERRAIN_FEATURES = new Map([
  'hole', 'healing', 'defup', 'grass', 'gazebo', 'bigforce', 'corrosion', 'infection', 'volcano',
].map((id) => [`tile_${id}`, id]))
const DEVICE_FEATURES = new Map([
  ['trap_002_emp', 'emp'], ['trap_038_dsbell', 'dsbell'], ['trap_001_crate', 'crate'],
])
// The source uses these long intervals for stages without natural DP recovery.
const DISABLED_COST_INTERVALS = new Set([999, 9999, 99999, 999999, 100000000])
const isUnconditionalSchedule = (value) => record(value) && value.managedByScheduler !== false
  && ['hiddenGroup', 'randomSpawnGroupKey', 'randomSpawnGroupPackKey', 'advancedWaveTag']
    .every((key) => value[key] == null || value[key] === '')
  && (value.weight == null || value.weight === 0)
  && ['randomType', 'refreshType'].every((key) => value[key] == null || value[key] === '' || value[key] === 'ALWAYS')
  && ['condition', 'conditions'].every((key) => value[key] == null || value[key] === ''
    || value[key] === 'ALWAYS' || value[key] === true || (Array.isArray(value[key]) && value[key].length === 0))

/** Include hidden and database-only enemies: maps reference more than handbook-visible enemies. */
export function buildMapEnemyRegistry(handbookSource, databaseSource) {
  const handbook = record(record(handbookSource)?.enemyData) ?? {}
  const container = record(databaseSource)?.enemies ?? databaseSource
  const database = new Map(Array.isArray(container)
    ? container.flatMap((entry) => {
      const id = text(entry?.Key ?? entry?.key)
      return id ? [[id, entry.Value ?? entry.value]] : []
    }) : Object.entries(record(container) ?? {}))
  const handbookById = new Map(Object.entries(handbook).map(([id, value]) => [text(value?.enemyId) ?? id, value]))
  return Object.fromEntries([...new Set([...handbookById.keys(), ...database.keys()])].sort(compare).map((id) => {
    const levels = (Array.isArray(database.get(id)) ? database.get(id) : []).filter(record)
      .sort((a, b) => (number(a.level) ?? Infinity) - (number(b.level) ?? Infinity))
    const base = record((levels.find((level) => number(level.level) === 0) ?? levels[0])?.enemyData)
    const attributes = record(base?.attributes)
    return [id, {
      name: text(handbookById.get(id)?.name) ?? text(base?.name) ?? id,
      hp: nonnegative(attributes?.maxHp),
      resistance: nonnegative(attributes?.magicResistance),
    }]
  }))
}

export function mapDetailFile(levelId) {
  let hash = 0
  for (const character of levelId) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0
  return `details-${(hash % 16).toString(16)}.json`
}

/** Preserve row/column order; only duplicate tile descriptions are compacted. */
export function extractMapGeometry(source) {
  const mapData = record(record(source)?.mapData)
  const matrix = record(mapData?.map)
  let grid = mapData?.map
  if (matrix) {
    if (!Number.isSafeInteger(matrix.row_size) || matrix.row_size < 1
      || !Number.isSafeInteger(matrix.column_size) || matrix.column_size < 1
      || !Array.isArray(matrix.matrix_data) || matrix.matrix_data.length !== matrix.row_size * matrix.column_size) {
      throw new Error('Invalid map matrix dimensions.')
    }
    grid = Array.from({ length: matrix.row_size }, (_, row) => matrix.matrix_data.slice(
      row * matrix.column_size, (row + 1) * matrix.column_size,
    ))
  }
  const sourceTiles = mapData?.tiles
  if (!Array.isArray(grid) || grid.length === 0 || !Array.isArray(grid[0]) || grid[0].length === 0
    || !Array.isArray(sourceTiles) || sourceTiles.length === 0
    || grid.some((row) => !Array.isArray(row) || row.length !== grid[0].length
      || row.some((index) => !Number.isSafeInteger(index) || index < 0 || index >= sourceTiles.length))) {
    throw new Error('Invalid map grid or tile index.')
  }
  const tiles = []
  const palette = new Map()
  const translated = new Map()
  for (const index of new Set(grid.flat())) {
    const raw = record(sourceTiles[index])
    if (!raw || !text(raw.tileKey)) throw new Error('Invalid map tile.')
    const tile = {
      tileKey: text(raw.tileKey),
      heightType: text(raw.heightType) ?? 'UNKNOWN',
      buildableType: text(raw.buildableType) ?? 'UNKNOWN',
      passableMask: text(raw.passableMask) ?? 'UNKNOWN',
    }
    const key = JSON.stringify(tile)
    if (!palette.has(key)) {
      palette.set(key, tiles.length)
      tiles.push(tile)
    }
    translated.set(index, palette.get(key))
  }
  return { grid: grid.map((row) => row.map((index) => translated.get(index))), tiles }
}

/** Keep original indices, including unusable routes, so actions still refer to the same entry. */
export function extractMapRoutes(source) {
  const routes = record(source)?.routes
  if (!Array.isArray(routes)) return null
  return routes.map((raw) => {
    const route = record(raw)
    if (!route) return null
    const start = record(route.startPosition)
    return {
      startPosition: start && Number.isSafeInteger(start.row) && Number.isSafeInteger(start.col)
        ? { row: start.row, col: start.col } : null,
    }
  })
}

/** Classify each SPAWN with the same conservative rules as map totals. */
function classifyMapSpawn(action, wave, fragment) {
  if (action.actionType !== 'SPAWN') return { spawnKind: null, reasons: [] }
  // Even a zero-count action retains its conditional metadata in the schedule.
  // The classifier normally skips zero-count actions when calculating totals.
  const classifiedAction = action.count === 0 ? { ...action, count: 1 } : action
  const result = buildEnemyHistogramCounts([{
    levelId: 'map/wave-action',
    data: { enemyDbRefs: [], waves: [{ ...wave, fragments: [{ ...fragment, actions: [classifiedAction] }] }] },
  }])
  const reasons = result.diagnostics.excludedLevels[0]?.reasons ?? []
  const conditionalReason = (reason) => [
    'hidden-spawn-group', 'random-spawn-group', 'weighted-spawn',
    'unscheduled-spawn', 'unsupported-wave-tag',
  ].includes(reason) || reason.startsWith('conditional-spawn:')
  return {
    spawnKind: reasons.some((reason) => !conditionalReason(reason)) ? 'unknown'
      : reasons.length > 0 ? 'conditional' : 'fixed',
    reasons,
  }
}

/**
 * Preserve source wave / fragment / action order and raw relative settings.
 * These values are not a simulated global timeline; branch actions are separate.
 * Null means unavailable structure, while [] means a known empty wave schedule.
 */
export function extractMapWaves(source) {
  const waves = record(source)?.waves
  if (!Array.isArray(waves) || waves.some((wave) => !record(wave) || !Array.isArray(wave.fragments)
    || wave.fragments.some((fragment) => !record(fragment) || !Array.isArray(fragment.actions)
      || fragment.actions.some((action) => !record(action))))) return null
  const integer = (value) => Number.isSafeInteger(unwrap(value)) && unwrap(value) >= 0 ? unwrap(value) : null
  const boolean = (value) => typeof unwrap(value) === 'boolean' ? unwrap(value) : null
  return waves.map((wave) => ({
    preDelay: nonnegative(wave.preDelay),
    postDelay: nonnegative(wave.postDelay),
    // -1 is an explicit upstream sentinel, not an invalid or missing delay.
    maxTimeWaitingForNextWave: number(wave.maxTimeWaitingForNextWave) === -1 ? -1
      : nonnegative(wave.maxTimeWaitingForNextWave),
    advancedWaveTag: text(wave.advancedWaveTag),
    fragments: wave.fragments.map((fragment) => ({
      preDelay: nonnegative(fragment.preDelay),
      actions: fragment.actions.map((action) => ({
        actionType: typeof action.actionType === 'string' && action.actionType.trim() ? action.actionType : 'UNKNOWN',
        key: text(action.key),
        count: integer(action.count),
        preDelay: nonnegative(action.preDelay),
        interval: nonnegative(action.interval),
        routeIndex: integer(action.routeIndex),
        hiddenGroup: text(action.hiddenGroup),
        randomSpawnGroupKey: text(action.randomSpawnGroupKey),
        randomSpawnGroupPackKey: text(action.randomSpawnGroupPackKey),
        randomType: text(action.randomType),
        refreshType: text(action.refreshType),
        managedByScheduler: boolean(action.managedByScheduler),
        blockFragment: boolean(action.blockFragment),
        dontBlockWave: boolean(action.dontBlockWave),
        ...classifyMapSpawn(action, wave, fragment),
      })),
    })),
  }))
}

/** Base-level effects, used terrain, and available devices only; optional/challenge runes and conditional branches are not evaluated. */
export function extractMapFeatures(source, geometry) {
  const level = record(source)
  if (!level) return null
  const features = new Set()
  const usedGeometry = geometry ?? extractMapGeometry(level)
  for (const index of new Set(usedGeometry.grid.flat())) {
    const feature = TERRAIN_FEATURES.get(usedGeometry.tiles[index]?.tileKey)
    if (feature) features.add(feature)
  }
  for (const buff of array(level.globalBuffs)) {
    if (buff?.playerSideMask != null && buff.playerSideMask !== 'ALL') continue
    const blackboard = readBlackboard(buff?.blackboard)
    if (buff?.prefabKey === 'periodic_damage'
      && number(blackboard.damage) > 0 && number(blackboard.interval) > 0) features.add('periodic_damage')
    if (buff?.prefabKey === 'character_in_magiccircuit_env'
      && number(blackboard.sp_recover_ratio) < 0) features.add('sp_slow')
  }
  let costInterval = number(record(level.options)?.costIncreaseTime)
  const costDisabled = DISABLED_COST_INTERVALS.has(costInterval)
  for (const rune of array(level.runes)) {
    if (rune?.key !== 'global_cost_recovery_mul' || !['ALL', 'NORMAL'].includes(rune.difficultyMask)
      || rune.professionMask !== 1023 || rune.buildableMask !== 'ALL' || !isUnconditionalSchedule(rune)) continue
    const scale = number(readBlackboard(rune.blackboard).scale)
    // 12-17/13-20 adverse environments confirm that this multiplier scales the interval, not the recovery rate.
    if (scale > 0) costInterval = (costInterval ?? 1) * scale
  }
  if (costDisabled || DISABLED_COST_INTERVALS.has(costInterval)) features.add('cost_none')
  else if (costInterval > 1) features.add('cost_slow')

  const activated = new Set(array(level.waves).filter(isUnconditionalSchedule)
    .flatMap((wave) => array(wave.fragments).filter(isUnconditionalSchedule))
    .flatMap((fragment) => array(fragment.actions)).filter(isUnconditionalSchedule)
    .filter((action) => action?.actionType === 'ACTIVATE_PREDEFINED' && number(action.count) > 0
      && Number.isSafeInteger(number(action.count)))
    .map((action) => text(action.key)).filter(Boolean))
  const predefines = record(level.predefines)
  for (const kind of ['tokenInsts', 'tokenCards']) {
    for (const token of array(predefines?.[kind])) {
      const id = text(record(token?.inst)?.characterKey)
      const feature = DEVICE_FEATURES.get(id)
      if (!feature || (kind === 'tokenCards' && !(number(token?.initialCnt) > 0))) continue
      // The crate filter means deployable obstacles, not obstacles already fixed on the map.
      if (feature === 'crate' && kind !== 'tokenCards') continue
      if (token.hidden === true && !activated.has(text(token.alias) ?? id)) continue
      features.add(feature)
    }
  }
  return [...features].sort(compare)
}

export function buildMapDatabase({
  stageTable, zoneTable, handbook, database, levels,
  generatedAt = new Date().toISOString(), sourceGeneratedAt = null,
}) {
  const selection = selectStageLevels(stageTable)
  const stages = new Map(Object.entries(record(record(stageTable)?.stages) ?? {})
    .map(([key, stage]) => [text(stage?.stageId) ?? key, stage]))
  const zones = record(record(zoneTable)?.zones) ?? {}
  const levelsById = new Map(levels.map((level) => [level.levelId, level.data]))
  const registry = buildMapEnemyRegistry(handbook, database)
  const usedEnemies = new Set()
  const details = Object.fromEntries(Array.from({ length: 16 }, (_, index) => [
    `details-${index.toString(16)}.json`, { schemaVersion: 1, generatedAt, maps: {} },
  ]))
  const maps = selection.levels.map(({ levelId, stageId }) => {
    const stage = stages.get(stageId)
    const zoneId = text(stage?.zoneId) ?? ''
    const zone = zones[zoneId]
    const zoneName = [text(zone?.zoneNameFirst), text(zone?.zoneNameSecond)].filter(Boolean).join(' ') || zoneId || 'その他'
    const base = {
      levelId, stageId, code: text(stage?.code) ?? stageId, name: text(stage?.name) ?? '',
      zoneId, zoneName, zoneType: text(zone?.type) ?? 'UNKNOWN',
      ...(text(stage?.difficulty) ? { difficulty: text(stage.difficulty) } : {}),
      ...(text(stage?.diffGroup) ? { diffGroup: text(stage.diffGroup) } : {}),
    }
    if (!levelsById.has(levelId)) return {
      ...base, status: 'missing', spawnCount: null, enemyIds: [], features: null, reasons: ['missing-level'], detailFile: null,
    }
    const source = levelsById.get(levelId)
    const counts = buildEnemyHistogramCounts([{ levelId, data: source }])
    const reasons = counts.diagnostics.excludedLevels[0]?.reasons ?? []
    const supported = reasons.length === 0
    const waves = extractMapWaves(source)
    // Keep declared references and SPAWN-only IDs, including conditional spawns.
    const spawnIds = waves?.flatMap((wave) => wave.fragments.flatMap((fragment) => fragment.actions
      .flatMap((action) => action.actionType === 'SPAWN' && action.key ? [action.key] : []))) ?? []
    const enemyIds = [...new Set([...extractLevelEnemyIds(source), ...Object.keys(counts.enemies), ...spawnIds])].sort(compare)
    for (const id of enemyIds) usedEnemies.add(id)
    let geometry
    try { geometry = extractMapGeometry(source) } catch (error) {
      throw new Error(`${levelId}: ${error.message}`)
    }
    const options = record(record(source)?.options)
    const detailFile = mapDetailFile(levelId)
    const enemies = enemyIds.map((id) => ({ id, count: supported ? counts.enemies[id]?.spawnCount ?? 0 : null }))
    details[detailFile].maps[levelId] = {
      levelId, ...geometry, life: nonnegative(options?.maxLifePoint), initialCost: nonnegative(options?.initialCost),
      deployLimit: nonnegative(options?.characterLimit), enemies, routes: extractMapRoutes(source), waves,
    }
    return {
      ...base, status: supported ? 'supported' : 'excluded',
      spawnCount: supported ? enemies.reduce((sum, enemy) => sum + enemy.count, 0) : null,
      enemyIds, features: extractMapFeatures(source, geometry), reasons, detailFile,
    }
  })
  return {
    index: {
      schemaVersion: 1, generatedAt, sourceGeneratedAt, maps,
      enemies: Object.fromEntries([...usedEnemies].sort(compare).map((id) => [
        id, registry[id] ?? { name: id, hp: null, resistance: null },
      ])),
    },
    details,
  }
}

export async function generateMapDatabase({
  sourceRoot = resolve(ROOT, 'reference-data/ArknightsGamedata/jp/gamedata'),
  cacheRoot = resolve(ROOT, '.cache/enemy-stage-appearances/levels'),
  provenancePath = resolve(ROOT, 'public/data/enemy-stage-appearances.json'),
  outputRoot = resolve(ROOT, 'public/data/maps'),
} = {}) {
  const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))
  const [stageTable, zoneTable, handbook, database, levels, provenance] = await Promise.all([
    readJson(resolve(sourceRoot, 'excel/stage_table.json')),
    readJson(resolve(sourceRoot, 'excel/zone_table.json')),
    readJson(resolve(sourceRoot, 'excel/enemy_handbook_table.json')),
    readJson(resolve(sourceRoot, 'levels/enemydata/enemy_database.json')),
    readCachedLevels(cacheRoot), readJson(provenancePath),
  ])
  const output = buildMapDatabase({
    stageTable, zoneTable, handbook, database, levels, sourceGeneratedAt: text(provenance.generatedAt),
  })
  await mkdir(outputRoot, { recursive: true })
  await writeFile(resolve(outputRoot, 'index.json'), JSON.stringify(output.index) + '\n', 'utf8')
  for (const [filename, document] of Object.entries(output.details)) {
    await writeFile(resolve(outputRoot, filename), JSON.stringify(document) + '\n', 'utf8')
  }
  console.log(JSON.stringify({
    maps: output.index.maps.length,
    supported: output.index.maps.filter((map) => map.status === 'supported').length,
    excluded: output.index.maps.filter((map) => map.status === 'excluded').length,
    missing: output.index.maps.filter((map) => map.status === 'missing').length,
    enemies: Object.keys(output.index.enemies).length,
    outputRoot,
  }))
  return output
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const options = {}
  const flags = { '--source-root': 'sourceRoot', '--cache-root': 'cacheRoot', '--provenance': 'provenancePath', '--output-root': 'outputRoot' }
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = flags[process.argv[index]]
    if (!key || !process.argv[index + 1]) throw new Error(`Unknown or incomplete option: ${process.argv[index]}`)
    options[key] = resolve(process.argv[index + 1])
  }
  await generateMapDatabase(options)
}
