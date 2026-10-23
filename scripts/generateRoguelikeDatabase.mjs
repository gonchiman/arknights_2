import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildMapDatabase } from './generateMapDatabase.mjs'
import { normalizeLevelId } from './generateEnemyStageAppearances.mjs'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const REPOSITORY = 'https://github.com/ArknightsAssets/ArknightsGamedata'
const DEFAULT_REVISION = '60e3aaf434919fbca931024a59d51088e810a9d3'
const TOPIC_TABLE = 'excel/roguelike_topic_table.json'
const CONTEXT_REASON = 'roguelike-context-unspecified'
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null
const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null
const compare = (a, b) => a.localeCompare(b, 'en', { numeric: true })
const stripFormatting = (value) => text(value)?.replace(/<@[^>]+>|<\/>/g, '') ?? null

/** Stage identities and normal/emergency links remain separate from shared level files. */
export function selectRoguelikeStages(source) {
  const topics = record(source?.topics), details = record(source?.details)
  if (!topics || !details) throw new Error('Invalid roguelike topic table.')
  const themes = Object.entries(topics).map(([key, topic]) => {
    if (!record(topic) || !text(topic.name)) throw new Error(`Invalid theme: ${key}`)
    return { id: text(topic.id) ?? key, name: topic.name.trim(), sortId: Number.isFinite(topic.sort) ? topic.sort : 0 }
  }).sort((a, b) => a.sortId - b.sortId || compare(a.id, b.id))
  if (new Set(themes.map(({ id }) => id)).size !== themes.length) throw new Error('Duplicate theme ID.')
  const stages = themes.flatMap((theme) => {
    const rawStages = record(details[theme.id]?.stages)
    if (!rawStages) throw new Error(`Missing stage table: ${theme.id}`)
    const entries = Object.entries(rawStages).map(([key, raw]) => {
      const levelId = normalizeLevelId(raw?.levelId)
      if (!record(raw) || !levelId) throw new Error(`Invalid stage: ${theme.id}/${key}`)
      const replacements = raw.levelReplaceIds == null ? [] : Array.isArray(raw.levelReplaceIds) ? raw.levelReplaceIds
        : record(raw.levelReplaceIds) && Object.keys(raw.levelReplaceIds).length === 0 ? [] : null
      if (!replacements || replacements.some((id) => !normalizeLevelId(id))) throw new Error(`Invalid replacement levels: ${key}`)
      if (![0, 1, false, true].includes(raw.isElite) || ![0, 1, false, true].includes(raw.isBoss)) throw new Error(`Invalid stage kind: ${key}`)
      return {
        id: text(raw.id) ?? key, themeId: theme.id, levelId, name: text(raw.name) ?? text(raw.id) ?? key,
        isEmergency: raw.isElite === 1 || raw.isElite === true, isBoss: raw.isBoss === 1 || raw.isBoss === true,
        linkedStageId: text(raw.linkedStageId), eliteDescription: stripFormatting(raw.eliteDesc),
        difficulty: text(raw.difficulty), replacementLevelIds: [...new Set(replacements.map(normalizeLevelId))],
      }
    }).sort((a, b) => compare(a.id, b.id))
    const ids = new Set(entries.map(({ id }) => id))
    for (const stage of entries) if (stage.linkedStageId && !ids.has(stage.linkedStageId)) {
      throw new Error(`Missing linked stage: ${stage.id} -> ${stage.linkedStageId}`)
    }
    return entries
  })
  if (new Set(stages.map(({ id }) => id)).size !== stages.length) throw new Error('Duplicate stage ID.')
  return { themes, stages }
}

/**
 * Reuse ordinary-map geometry, enemy registry and raw spawn parsing. Integrated Strategies
 * adds run-dependent replacements, relics and difficulty modifiers outside the level file.
 * A shared level must therefore never present the normal-mode analysis as resolved emergency
 * data. Counts and resolutions stay unknown until a complete run context is supported.
 */
export function buildRoguelikeDatabase({
  topicTable, handbook, database, levels, revision = DEFAULT_REVISION,
  generatedAt = new Date().toISOString(), sourceGeneratedAt = null,
}) {
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error('A full immutable source commit is required.')
  const { themes, stages } = selectRoguelikeStages(topicTable)
  const byLevel = new Map()
  // Prefer a normal record for display metadata; no difficulty resolution is exposed.
  for (const stage of [...stages].sort((a, b) => Number(a.isEmergency) - Number(b.isEmergency))) {
    for (const levelId of [stage.levelId, ...stage.replacementLevelIds]) if (!byLevel.has(levelId)) byLevel.set(levelId, stage)
  }
  const stageTable = { stages: Object.fromEntries([...byLevel].map(([levelId, stage]) => [levelId, {
    stageId: levelId, levelId, name: stage.name, code: stage.id, zoneId: stage.themeId,
    isStoryOnly: false, difficulty: 'NORMAL',
  }])) }
  const zoneTable = { zones: Object.fromEntries(themes.map(({ id, name }) => [id, { zoneNameFirst: name, type: 'ROGUELIKE' }])) }
  const output = buildMapDatabase({ stageTable, zoneTable, handbook, database, levels, generatedAt, sourceGeneratedAt })
  for (const summary of output.index.maps) {
    const stage = byLevel.get(summary.levelId)
    summary.stageId = stage.id
    delete summary.difficulty
    if (summary.status === 'missing') continue
    summary.status = 'excluded'
    summary.spawnCount = null
    summary.reasons = [...new Set([CONTEXT_REASON, ...summary.reasons])]
    const detail = output.details[summary.detailFile].maps[summary.levelId]
    detail.enemies = detail.enemies.map(({ id }) => ({ id, count: null }))
    for (const [waveIndex, wave] of (detail.waves ?? []).entries()) {
      for (const [fragmentIndex, fragment] of wave.fragments.entries()) {
        for (const [actionIndex, action] of fragment.actions.entries()) {
          if (action.actionType !== 'SPAWN') continue
          action.resolution = action.count === 0
            ? { status: 'excluded', resolvedEnemyId: action.key, resolvedCount: 0,
              reasons: [], conditions: ['設定体数が0'], evidence: [] }
            : { status: 'unknown', resolvedEnemyId: action.key, resolvedCount: null,
              reasons: [...new Set([CONTEXT_REASON, ...action.reasons])], conditions: ['統合戦略の選択条件未適用'],
              evidence: [`waves[${waveIndex}].fragments[${fragmentIndex}].actions[${actionIndex}]`] }
        }
      }
    }
  }
  Object.assign(output.index, { themes, stages, source: { repository: REPOSITORY, commit: revision, region: 'jp', topicTable: TOPIC_TABLE } })
  return output
}

async function readSource(path, { revision, cacheRoot, sourceRoot, offline }) {
  const localPath = sourceRoot ? resolve(sourceRoot, path) : resolve(cacheRoot, revision, path)
  try { return JSON.parse(await readFile(localPath, 'utf8')) } catch (error) {
    if (error.code !== 'ENOENT') throw error
    if (sourceRoot || offline) throw new Error(`Missing source file: ${localPath}`)
  }
  const url = `https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/${revision}/jp/gamedata/${path}`
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(45000) })
      if (response.status === 404) {
        // Cache confirmed absence at this immutable revision, including for offline regeneration.
        await mkdir(dirname(localPath), { recursive: true })
        await writeFile(localPath, 'null\n', 'utf8')
        return null
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`)
      const data = await response.json()
      await mkdir(dirname(localPath), { recursive: true })
      await writeFile(localPath, JSON.stringify(data) + '\n', 'utf8')
      return data
    } catch (error) {
      if (attempt === 2) throw error
    }
  }
}

export async function generateRoguelikeDatabase({
  revision = DEFAULT_REVISION, cacheRoot = resolve(ROOT, '.cache/roguelike'), sourceRoot,
  outputRoot = resolve(ROOT, 'public/data/roguelike'), offline = false,
} = {}) {
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error('A full immutable source commit is required.')
  const options = { revision, cacheRoot, sourceRoot, offline }
  const [topicTable, handbook, database] = await Promise.all([
    readSource(TOPIC_TABLE, options), readSource('excel/enemy_handbook_table.json', options),
    readSource('levels/enemydata/enemy_database.json', options),
  ])
  if (!topicTable || !handbook || !database) throw new Error('Required source table is unavailable.')
  const { stages } = selectRoguelikeStages(topicTable)
  const levelIds = [...new Set(stages.flatMap((stage) => [stage.levelId, ...stage.replacementLevelIds]))].sort(compare)
  const levels = [], missing = []
  let next = 0
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next < levelIds.length) {
      const levelId = levelIds[next++]
      const data = await readSource(`levels/${levelId}.json`, options)
      if (data) levels.push({ levelId, data })
      else missing.push(levelId)
    }
  }))
  const output = buildRoguelikeDatabase({ topicTable, handbook, database, levels, revision })
  await mkdir(outputRoot, { recursive: true })
  await writeFile(resolve(outputRoot, 'index.json'), JSON.stringify(output.index) + '\n', 'utf8')
  for (const [filename, document] of Object.entries(output.details)) {
    await writeFile(resolve(outputRoot, filename), JSON.stringify(document) + '\n', 'utf8')
  }
  console.log(JSON.stringify({ themes: output.index.themes.length, stages: stages.length, maps: levelIds.length,
    available: levels.length, missing: missing.sort(compare), enemies: Object.keys(output.index.enemies).length, revision, outputRoot }))
  return output
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const options = {}
  const paths = { '--cache-root': 'cacheRoot', '--source-root': 'sourceRoot', '--output-root': 'outputRoot' }
  for (let index = 2; index < process.argv.length; index += 1) {
    const flag = process.argv[index]
    if (flag === '--offline') { options.offline = true; continue }
    const key = paths[flag] ?? (flag === '--revision' ? 'revision' : null)
    if (!key || !process.argv[index + 1]) throw new Error(`Unknown or incomplete option: ${flag}`)
    const value = process.argv[++index]
    options[key] = key === 'revision' ? value : resolve(value)
  }
  await generateRoguelikeDatabase(options)
}
