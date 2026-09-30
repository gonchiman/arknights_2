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
      zoneId, zoneName,
      ...(text(stage?.difficulty) ? { difficulty: text(stage.difficulty) } : {}),
      ...(text(stage?.diffGroup) ? { diffGroup: text(stage.diffGroup) } : {}),
    }
    if (!levelsById.has(levelId)) return {
      ...base, status: 'missing', spawnCount: null, enemyIds: [], reasons: ['missing-level'], detailFile: null,
    }
    const source = levelsById.get(levelId)
    const counts = buildEnemyHistogramCounts([{ levelId, data: source }])
    const reasons = counts.diagnostics.excludedLevels[0]?.reasons ?? []
    const supported = reasons.length === 0
    // Keep both the declared references and any actual SPAWN-only enemy IDs.
    const enemyIds = [...new Set([...extractLevelEnemyIds(source), ...Object.keys(counts.enemies)])].sort(compare)
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
      deployLimit: nonnegative(options?.characterLimit), enemies,
    }
    return {
      ...base, status: supported ? 'supported' : 'excluded',
      spawnCount: supported ? enemies.reduce((sum, enemy) => sum + enemy.count, 0) : null,
      enemyIds, reasons, detailFile,
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
