import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildEnemyHistogramCounts } from './generateEnemyHistogramCounts.mjs'
import { normalizeLevelId } from './generateEnemyStageAppearances.mjs'
import { extractMapWaves } from './generateMapDatabase.mjs'
import { getMainEnemyCoverage, parseMainEnemyTrends } from '../src/lib/mainEnemyTrends.ts'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null
const array = (value) => Array.isArray(value) ? value : []
const unwrap = (value) => record(value) && 'm_value' in value
  ? value.m_defined === false ? undefined : value.m_value : value
const text = (value) => typeof unwrap(value) === 'string' ? unwrap(value) : null
const numeric = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
const METRICS = { hp: 'maxHp', attack: 'atk', defense: 'def', resistance: 'magicResistance' }

// Verified roles in the JP handbook / enemy database. Visibility, attack=0 and
// isUnharmfulAndAlwaysCountAsKilled alone are not reliable NPC classifiers.
// In particular the two high-HP Soul Chalices are damage-sharing ELITE enemies.
export const MAIN_ENEMY_EXCLUSIONS = {
  enemy_3001_upeopl: 'neutral-civilian',
  enemy_3002_ftrtal: 'allied-talulah',
  enemy_3002_ftrtal_s: 'allied-talulah',
  enemy_3007_lrssia: 'cinematic-theresa',
  enemy_3008_lramiy: 'cinematic-amiya',
  enemy_1313_wdfmr: 'neutral-civilian',
  enemy_1540_wdncr: 'cinematic-eblana',
  enemy_1541_wdslms: 'cinematic-shapeshifter',
  enemy_1115_embald: 'untargetable-cinematic-emperors-blade',
  enemy_1276_telex: 'untargetable-cinematic-theresis',
  enemy_1369_bmbcar1: 'neutral-rail-bomb',
  enemy_1370_bmbcar2: 'neutral-rail-bomb',
  enemy_1367_dseed: 'revival-material',
  enemy_1420_lrmm: 'environmental-originium-storm',
  enemy_1421_lrchld: 'environmental-beacon',
  enemy_1555_lrking: 'cinematic-nachzehrer-king',
  enemy_1432_lrccon: 'noncombat-cocoon',
  enemy_1432_lrccon_2: 'cinematic-cocoon',
  enemy_3009_mpprss: 'hidden-cinematic-priestess',
  enemy_10072_mpprhd: 'noncombat-call-command',
  enemy_10082_mpweak: 'noncombat-weakening-node',
  enemy_3010_mcreep: 'allied-miner',
  enemy_3010_mcreep_a: 'allied-miner',
}

/** Undefined wrappers contain export placeholders; they must never overwrite inherited values. */
function mergeDefined(target, source) {
  for (const [key, value] of Object.entries(record(source) ?? {})) {
    const wrapped = record(value)
    if (wrapped && 'm_value' in wrapped) {
      if (wrapped.m_defined !== false) target[key] = wrapped.m_value
    } else if (wrapped) {
      if (!record(target[key])) target[key] = {}
      mergeDefined(target[key], value)
    } else if (value != null) target[key] = value
  }
  return target
}
export function resolveMainEnemyReference(ref, database) {
  if (!record(ref) || typeof ref.id !== 'string') throw new Error('Invalid enemy reference')
  const level = ref.level ?? 0
  if (!Number.isSafeInteger(level) || level < 0) throw new Error(`Invalid DB level: ${ref.id}`)
  const resolved = {}
  if (ref.useDb !== false) {
    const levels = array(database[ref.id])
    const base = levels.find((entry) => entry.level === 0)
    const selected = levels.find((entry) => entry.level === level)
    if (!base || !selected) throw new Error(`Missing enemy DB level: ${ref.id} (${level})`)
    mergeDefined(resolved, base.enemyData)
    if (selected !== base) mergeDefined(resolved, selected.enemyData)
  }
  mergeDefined(resolved, ref.overwrittenData)
  return resolved
}

export function selectMainEnemyTrendMaps(mapIndex, stageTable) {
  const stages = record(record(stageTable)?.stages) ?? {}
  const seen = new Set()
  return array(mapIndex?.maps).flatMap((map) => {
    const levelId = normalizeLevelId(map.levelId)
    const match = /^obt\/main\/level_main_(\d+)-(\d+)$/.exec(levelId ?? '')
    const stage = stages[map.stageId]
    if (!match || Number(match[1]) > 16 || !record(stage)
      || !['MAIN', 'SUB'].includes(stage.stageType) || stage.isStoryOnly !== false
      || !['MAIN_NORMAL', 'MAIN_PREDEFINED'].includes(stage.appearanceStyle)
      || stage.difficulty !== 'NORMAL' || ![undefined, null, 'NONE', 'NORMAL', 'ALL'].includes(stage.diffGroup)) return []
    if (seen.has(levelId)) throw new Error(`Duplicate main stage level: ${levelId}`)
    seen.add(levelId)
    return [{ ...map, levelId, chapter: Number(match[1]), order: Number(match[2]) }]
  }).sort((a, b) => a.chapter - b.chapter || a.order - b.order)
}

function unsupportedNormalStatEffect(level) {
  // Fail closed for direct normal-mode attribute changes. Challenge/story runes
  // are deliberately ignored; runtime abilities and environmental effects are
  // outside this initial-stat dataset, not mistaken for permanent stat changes.
  return array(level.runes).some((rune) => [undefined, null, 'NONE', 'ALL', 'NORMAL'].includes(rune.difficultyMask)
    && (String(rune.key).includes('enemy_attribute') || rune.key === 'ebuff_attribute'))
}
function countDirectSpawns(waves) {
  const counts = new Map(), fixedCounts = new Map(), conditionalReasons = new Set()
  for (const wave of waves) for (const fragment of wave.fragments) {
    for (const action of fragment.actions) {
      if (action.actionType !== 'SPAWN' || action.count === 0) continue
      if (!Number.isSafeInteger(action.count) || action.count < 0 || typeof action.key !== 'string') {
        throw new Error('Invalid direct SPAWN action')
      }
      const next = (counts.get(action.key) ?? 0) + action.count
      if (!Number.isSafeInteger(next)) throw new Error('Direct SPAWN count overflow')
      counts.set(action.key, next)
      if (action.spawnKind === 'fixed') fixedCounts.set(action.key, (fixedCounts.get(action.key) ?? 0) + action.count)
      else if (action.spawnKind === 'conditional') for (const reason of action.reasons) conditionalReasons.add(reason)
    }
  }
  return { counts, fixedCounts, conditionalReasons }
}

/** Count fixed actions using the map database's action-level classification.
 * Conditional wave actions and branch spawns remain outside this dataset.
 * Unsafe metadata excludes the whole map; published counts are checked against the source.
 */
export function buildMainEnemyTrends({ mapIndex, stageTable, handbook, database, levels,
  generatedAt = new Date().toISOString() }) {
  const handbookEntries = record(record(handbook)?.enemyData) ?? {}
  const selected = selectMainEnemyTrendMaps(mapIndex, stageTable)
  const diagnostics = { excludedUnits: [] }
  const maps = selected.map((source) => {
    const map = { levelId: source.levelId, stageId: source.stageId, chapter: source.chapter,
      order: source.order, code: source.code, name: source.name, status: 'excluded',
      reasons: [...(source.reasons ?? [])], enemyCount: 0, excludedUnitCount: 0, enemies: [] }
    if (source.status === 'missing') {
      map.status = 'missing'
      if (!map.reasons.length) map.reasons.push('missing-level')
      return map
    }
    const level = levels.get(source.levelId)
    if (!record(level)) { map.status = 'missing'; map.reasons = ['missing-level']; return map }
    const classified = buildEnemyHistogramCounts([{ levelId: source.levelId, data: level }])
    const rejected = classified.diagnostics.excludedLevels[0]
    const reasons = rejected?.reasons ?? []
    if ((source.status === 'supported') !== (reasons.length === 0)
      || [...(source.reasons ?? [])].sort().join('|') !== reasons.join('|')) {
      throw new Error(`Map index and level schedule disagree: ${source.code} (${reasons.join(', ')})`)
    }
    map.reasons = reasons
    if (unsupportedNormalStatEffect(level)) {
      map.reasons = ['unsupported-normal-stat-rune']
      return map
    }
    const waves = extractMapWaves(level)
    if (waves === null) return map
    // Unknown metadata or invalid schedules cannot be treated as merely missing extra spawns.
    if (waves.some((wave) => wave.fragments.some((fragment) => fragment.actions
      .some((action) => action.actionType === 'SPAWN' && action.count !== 0 && action.spawnKind === 'unknown')))) return map
    const { counts: direct, fixedCounts, conditionalReasons } = countDirectSpawns(waves)
    if (reasons.some((reason) => reason !== 'branch-spawn' && !conditionalReasons.has(reason))) return map
    const saved = new Map(Object.entries(source.enemySpawnCounts ?? {}).filter(([, count]) => count > 0))
    if (direct.size !== saved.size || [...direct].some(([id, count]) => saved.get(id) !== count)
      || (source.status === 'supported' && source.spawnCount !== [...direct.values()].reduce((sum, count) => sum + count, 0))) {
      throw new Error(`Map index and level spawn counts disagree: ${source.code}`)
    }
    const refs = new Map(array(level.enemyDbRefs).map((ref) => [ref.id, ref]))
    for (const [enemyId, count] of [...fixedCounts].sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))) {
      const ref = refs.get(enemyId)
      let resolved
      if (source.levelId === 'obt/main/level_main_16-08' && enemyId === 'enemy_10128_fearpj') {
        resolved = resolveMainEnemyReference(ref, database)
      }
      const exclusion = MAIN_ENEMY_EXCLUSIONS[enemyId]
        // This ID is otherwise a real self-destructing enemy. Only the tutorial
        // variant overrides ATK to 0, life reduction to 0 and notCountInTotal to true.
        ?? (resolved?.attributes?.atk === 0 && resolved?.lifePointReduce === 0 && resolved?.notCountInTotal === true
          ? 'noncombat-tutorial-variant' : null)
      if (exclusion) {
        map.excludedUnitCount += count
        diagnostics.excludedUnits.push({ levelId: source.levelId, enemyId, count, reason: exclusion })
        continue
      }
      if (!ref) throw new Error(`Missing enemy reference: ${source.code} ${enemyId}`)
      resolved ??= resolveMainEnemyReference(ref, database)
      const role = text(handbookEntries[enemyId]?.enemyLevel) ?? resolved.levelType
      const type = ['NORMAL', 'ELITE', 'BOSS'].includes(role) ? role.toLowerCase() : 'unknown'
      map.enemies.push({ enemyId, name: text(handbookEntries[enemyId]?.name) ?? resolved.name ?? enemyId,
        level: ref.level ?? 0, type, count,
        ...Object.fromEntries(Object.entries(METRICS).map(([key, field]) => [key, numeric(resolved.attributes?.[field])])) })
      map.enemyCount += count
    }
    if (map.enemies.length) map.status = reasons.length ? 'partial' : 'included'
    else map.reasons = [...reasons, 'no-hostile-spawn']
    return map
  })
  const chapters = Array.from({ length: 17 }, (_, chapter) => {
    const chapterMaps = maps.filter((map) => map.chapter === chapter)
    const original = selected.find((map) => map.chapter === chapter)
    return { chapter, name: original?.zoneName ?? `第${chapter}章`, ...getMainEnemyCoverage(chapterMaps),
      enemyCount: chapterMaps.reduce((sum, map) => sum + map.enemyCount, 0),
      excludedUnitCount: chapterMaps.reduce((sum, map) => sum + map.excludedUnitCount, 0) }
  })
  return parseMainEnemyTrends({ schemaVersion: 1, generatedAt, sourceGeneratedAt: mapIndex.generatedAt ?? null,
    source: { region: 'jp', scope: 'main-standard-fixed-direct-spawns', chapterRange: [0, 16] },
    summary: { ...getMainEnemyCoverage(maps), enemyCount: maps.reduce((sum, map) => sum + map.enemyCount, 0),
      excludedUnitCount: maps.reduce((sum, map) => sum + map.excludedUnitCount, 0) },
    chapters, maps, diagnostics })
}

export async function generateMainEnemyTrends({
  sourceRoot = resolve(ROOT, 'reference-data/ArknightsGamedata/jp/gamedata'),
  indexPath = resolve(ROOT, 'public/data/maps/index.json'),
  outputPath = resolve(ROOT, 'public/data/maps/main-enemy-trends.json'),
} = {}) {
  const readJson = async (path) => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''))
  const [mapIndex, stageTable, handbook, database] = await Promise.all([
    readJson(indexPath), readJson(resolve(sourceRoot, 'excel/stage_table.json')),
    readJson(resolve(sourceRoot, 'excel/enemy_handbook_table.json')),
    readJson(resolve(sourceRoot, 'levels/enemydata/enemy_database.json')),
  ])
  const selected = selectMainEnemyTrendMaps(mapIndex, stageTable)
  const levels = new Map(await Promise.all(selected.filter((map) => map.status !== 'missing').map(async (map) => {
    const path = resolve(sourceRoot, 'levels', `${map.levelId}.json`)
    try { return [map.levelId, await readJson(path)] }
    catch (error) { if (error.code === 'ENOENT') return [map.levelId, null]; throw error }
  })))
  const document = buildMainEnemyTrends({ mapIndex, stageTable, handbook, database, levels })
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(document) + '\n', 'utf8')
  console.log(JSON.stringify({ ...document.summary, outputPath }, null, 2))
  return document
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const options = {}
  const flags = { '--source-root': 'sourceRoot', '--index': 'indexPath', '--output': 'outputPath' }
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = flags[process.argv[index]]
    if (!key || !process.argv[index + 1]) throw new Error(`Unknown or incomplete option: ${process.argv[index]}`)
    options[key] = resolve(process.argv[index + 1])
  }
  await generateMainEnemyTrends(options)
}
