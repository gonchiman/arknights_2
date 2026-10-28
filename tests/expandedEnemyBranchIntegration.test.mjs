import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { gunzipSync } from 'node:zlib'
import { buildMapDatabase } from '../scripts/generateMapDatabase.mjs'
import { buildEnemyHistogramCounts } from '../scripts/generateEnemyHistogramCounts.mjs'
import { buildEnemyStageAppearanceDocument } from '../scripts/generateEnemyStageAppearances.mjs'
import { buildMainEnemyTrends } from '../scripts/generate-main-enemy-trends.mjs'
import { archiveEnemyAggregation } from '../scripts/enemyAggregationArchive.mjs'
import { getMapDetail, parseMapDetailShard, parseMapIndex } from '../src/lib/mapDatabase.ts'
import { parseEnemyAggregationBundle, parseEnemyAggregationIndex } from '../src/lib/enemyAggregationContract.ts'

const fixture = name => JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/enemyBranchPolicy/' + name + '.json.gz', import.meta.url))))
const larva = fixture('larva-levels'), nonEnemy = fixture('non-enemy-roles')
const sourceRevision = larva.sourceRevision
const generatedAt = '2026-10-24T00:00:00.000Z'
const rawLevels = new Map([...larva.levels, ...nonEnemy.levels, ...fixture('deployment-trigger-levels')])
const larvaId = 'obt/main/level_main_11-06'
const minerId = 'obt/main/level_main_16-02'
const railId = 'obt/main/level_main_13-06'
const treantId = 'activities/act41side/level_act41side_05'
const marbleId = 'activities/act44side/level_act44side_01'
const selected = [larvaId, minerId, railId, treantId, marbleId]
const source = id => structuredClone(rawLevels.get(id))
const defined = value => ({ m_defined: true, m_value: value })

function build(ids = selected, { replacements = new Map(), revision = sourceRevision } = {}) {
  const levels = ids.map(levelId => ({ levelId, data: replacements.get(levelId) ?? source(levelId) }))
  const stageTable = { stages: Object.fromEntries(ids.map(levelId => {
    const stageId = levelId.split('/').at(-1).replace(/^level_/, '')
    const chapter = /^main_(\d+)-/.exec(stageId)?.[1]
    return [stageId, { stageId, levelId, zoneId: chapter ? 'main_' + chapter : 'event',
      stageType: chapter ? 'MAIN' : 'ACTIVITY', appearanceStyle: 'MAIN_NORMAL',
      code: levelId === larvaId ? '11-7' : stageId, name: stageId, isStoryOnly: false,
      difficulty: 'NORMAL', diffGroup: 'NORMAL' }]
  })) }
  const zoneTable = { zones: Object.fromEntries(['main_11', 'main_13', 'main_16', 'event'].map(id =>
    [id, { type: id === 'event' ? 'ACTIVITY' : 'MAINLINE', zoneNameFirst: id }])) }
  const enemyIds = [...new Set(levels.flatMap(({ data }) => data.enemyDbRefs.map(ref => ref.id)))]
  // Counts and mechanics come from the raw primary level fixtures. Minimal
  // statistics isolate this integration test from unrelated stat extraction.
  const handbook = { enemyData: Object.fromEntries(enemyIds.map(id => [id,
    nonEnemy.handbook[id] ?? { enemyId: id, name: id, enemyLevel: 'NORMAL', hideInHandbook: false, isInvalidKilled: false }])) }
  const database = Object.fromEntries(enemyIds.map(id => [id, nonEnemy.database[id] ?? [{ level: 0,
    enemyData: { name: defined(id), levelType: defined('NORMAL'), attributes: {
      maxHp: defined(100), atk: defined(20), def: defined(10), magicResistance: defined(0),
    } } }]]))
  const stageContexts = new Map(ids.map(id => [id, { difficulty: 'NORMAL', diffGroup: 'NORMAL' }]))
  const maps = buildMapDatabase({ levels, stageTable, zoneTable, handbook, database,
    sourceRevision: revision, generatedAt, sourceGeneratedAt: generatedAt })
  const histogram = buildEnemyHistogramCounts(levels, { sourceRevision: revision, stageContexts,
    generatedAt, sourceGeneratedAt: generatedAt })
  const appearances = buildEnemyStageAppearanceDocument({ selection: { stageRecordCount: ids.length,
    levels: maps.index.maps.map(({ levelId, stageId }) => ({ levelId, stageId })), excludedLevelIds: [] },
  handbookSource: handbook, levelsById: new Map(levels.map(({ levelId, data }) => [levelId, data])), generatedAt })
  return { maps, histogram, appearances, levels, stageTable, handbook, database, revision }
}

function parsedMap(output, levelId) {
  const summary = parseMapIndex(output.maps.index).maps.find(map => map.levelId === levelId)
  const detail = getMapDetail(parseMapDetailShard(output.maps.details[summary.detailFile]), summary)
  return { summary, detail }
}
const histogramTotal = histogram => Object.values(histogram.enemies).reduce((sum, entry) => sum + entry.spawnCount, 0)
const runNode = promisify(execFile)

async function temporaryRoot(t) {
  const parent = await realpath(tmpdir())
  const root = await mkdtemp(resolve(parent, 'arknights-expanded-branches-'))
  assert.equal(dirname(root), parent)
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

async function writeTrendInputs(root, output) {
  const sourceRoot = resolve(root, 'source')
  const indexPath = resolve(root, 'maps/index.json')
  const files = [
    [indexPath, output.maps.index],
    [resolve(sourceRoot, 'excel/stage_table.json'), output.stageTable],
    [resolve(sourceRoot, 'excel/enemy_handbook_table.json'), output.handbook],
    [resolve(sourceRoot, 'levels/enemydata/enemy_database.json'), output.database],
    ...output.levels.map(({ levelId, data }) => [resolve(sourceRoot, 'levels', levelId + '.json'), data]),
  ]
  for (const [path, contents] of files) {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify(contents))
  }
  return ['--source-root', sourceRoot, '--index', indexPath, '--output', resolve(root, 'trends.json')]
}

test('mandatory, non-enemy and deployment branches agree in index, detail and histogram', () => {
  const expected = new Map([[larvaId, 51], [minerId, 22], [treantId, 29], [marbleId, 21]])
  const output = build()
  assert.equal(output.histogram.summary.spawnMapCount, 4)
  assert.equal(output.histogram.summary.spawnExcludedMapCount, 1)
  assert.equal(histogramTotal(output.histogram), 123)
  for (const [id, count] of expected) {
    const { summary, detail } = parsedMap(output, id)
    assert.equal(summary.status, 'supported', id)
    assert.equal(summary.spawnCount, count, id)
    assert.equal(detail.enemies.reduce((sum, enemy) => sum + enemy.count, 0), count, id)
    const single = build([id])
    assert.equal(histogramTotal(single.histogram), count, id)
    assert.deepEqual(Object.fromEntries(detail.enemies.map(enemy => [enemy.id, enemy.count])),
      Object.fromEntries(Object.entries(single.histogram.enemies).map(([enemyId, entry]) => [enemyId, entry.spawnCount])))
  }
  const apostle = parsedMap(output, larvaId)
  assert.equal(apostle.detail.enemies.find(enemy => enemy.id === 'enemy_1266_nhapos').count, 1)
  assert.equal(apostle.summary.countedBranchSpawns[0].count, 1)
  assert.equal(apostle.summary.countedBranchSpawns[0].ruleId, 'larva-mandatory-apostle-v1')
  for (const id of [minerId, treantId, marbleId]) {
    const { summary } = parsedMap(output, id)
    assert.ok(summary.omittedBranchSpawns.length > 0)
    assert.ok(summary.omittedBranchSpawns.every(entry => entry.evidence.length > 0 && entry.condition))
  }
  assert.equal(parsedMap(output, minerId).detail.enemies.find(enemy => enemy.id === 'enemy_3010_mcreep').count, 0)
})

test('unresolved hostile branches keep the whole map held while known neutral evidence survives', () => {
  const output = build([railId])
  const { summary, detail } = parsedMap(output, railId)
  assert.equal(summary.status, 'excluded')
  assert.equal(summary.spawnCount, null)
  assert.deepEqual(summary.reasons, ['branch-spawn'])
  assert.equal(summary.omittedBranchSpawns.length, 1)
  assert.equal(summary.omittedBranchSpawns[0].enemyId, 'enemy_1369_bmbcar1')
  assert.ok(detail.enemies.every(enemy => enemy.count === null))
  assert.equal(output.histogram.summary.spawnMapCount, 0)
  assert.equal(histogramTotal(output.histogram), 0)
})

test('ordinary waves keep the same hostile enemy ID that appears in resolved branches', () => {
  for (const [id, enemyId, expectedTotal, expectedEnemy] of [
    [larvaId, 'enemy_1266_nhapos', 53, 3], [treantId, 'enemy_10069_ftlsj', 31, 3],
  ]) {
    const level = source(id)
    const action = Object.values(level.branches).flatMap(branch => branch.phases.flatMap(phase => phase.actions))
      .find(action => action.key === enemyId)
    assert.ok(action)
    level.waves[0].fragments[0].actions.push({ ...structuredClone(action), count: 2, routeIndex: 0 })
    const output = build([id], { replacements: new Map([[id, level]]) })
    const { summary, detail } = parsedMap(output, id)
    assert.equal(summary.status, 'supported')
    assert.equal(summary.spawnCount, expectedTotal)
    assert.equal(detail.enemies.find(enemy => enemy.id === enemyId).count, expectedEnemy)
    assert.equal(output.histogram.enemies[enemyId].spawnCount, expectedEnemy)
    assert.equal(histogramTotal(output.histogram), expectedTotal)
  }
})

test('unverified mandatory callers and source revisions never turn a branch into zero', () => {
  const level = source(larvaId)
  level.branches.unreviewed = structuredClone(level.branches.route1)
  const cases = [build([larvaId], { replacements: new Map([[larvaId, level]]) }),
    build([larvaId], { revision: 'f'.repeat(40) })]
  for (const output of cases) {
    const { summary, detail } = parsedMap(output, larvaId)
    assert.equal(summary.status, 'excluded')
    assert.ok(summary.reasons.includes('branch-spawn'))
    assert.equal(summary.countedBranchSpawns, undefined)
    assert.ok(detail.enemies.every(enemy => enemy.count === null))
    assert.equal(output.histogram.summary.spawnMapCount, 0)
  }
})

test('the main-trends generator receives the source revision and includes the mandatory apostle once', () => {
  const output = build([larvaId, minerId])
  const input = { mapIndex: output.maps.index, stageTable: output.stageTable, handbook: output.handbook,
    database: output.database, levels: new Map(output.levels.map(({ levelId, data }) => [levelId, data])), generatedAt }
  const trends = buildMainEnemyTrends({ ...input, sourceRevision })
  const map = trends.maps.find(map => map.levelId === larvaId)
  assert.equal(map.status, 'included')
  assert.equal(map.enemyCount, 51)
  assert.equal(map.enemies.find(enemy => enemy.enemyId === 'enemy_1266_nhapos').count, 1)
  assert.equal(trends.maps.find(map => map.levelId === minerId).enemyCount, 22)
  assert.throws(() => buildMainEnemyTrends(input), /schedule disagree/)
  assert.throws(() => buildMainEnemyTrends({ ...input, sourceRevision: 'f'.repeat(40) }), /schedule disagree/)
})

test('a certified zero-count mandatory branch is not an enemy observation in main trends', () => {
  const level = source(larvaId)
  level.predefines.tokenInsts[0].hidden = true
  const output = build([larvaId], { replacements: new Map([[larvaId, level]]) })
  const { summary } = parsedMap(output, larvaId)
  assert.equal(summary.status, 'supported')
  assert.equal(summary.countedBranchSpawns[0].count, 0)
  assert.equal(summary.spawnCount, 50)
  const trends = buildMainEnemyTrends({ mapIndex: output.maps.index, stageTable: output.stageTable,
    handbook: output.handbook, database: output.database,
    levels: new Map(output.levels.map(({ levelId, data }) => [levelId, data])), sourceRevision, generatedAt })
  assert.equal(trends.maps[0].status, 'included')
  assert.equal(trends.maps[0].enemyCount, 50)
  assert.ok(!trends.maps[0].enemies.some(enemy => enemy.enemyId === 'enemy_1266_nhapos'))
})

test('main trends reject a saved mandatory branch proof from a different raw level', () => {
  const hidden = source(larvaId)
  hidden.predefines.tokenInsts[0].hidden = true
  for (const [indexed, current] of [[hidden, source(larvaId)], [source(larvaId), hidden]]) {
    const output = build([larvaId], { replacements: new Map([[larvaId, indexed]]) })
    assert.throws(() => buildMainEnemyTrends({ mapIndex: output.maps.index, stageTable: output.stageTable,
      handbook: output.handbook, database: output.database, levels: new Map([[larvaId, current]]),
      sourceRevision, generatedAt }), /Map index and level branch counts disagree/)
  }
  // Equal aggregate totals do not justify assigning the addition to another
  // enemy or using a stale caller binding.
  for (const changed of [{ enemyId: 'enemy_1026_ordef' }, { branchId: 'stale-caller' }]) {
    const output = build([larvaId])
    Object.assign(output.maps.index.maps[0].countedBranchSpawns[0], changed)
    assert.throws(() => buildMainEnemyTrends({ mapIndex: output.maps.index, stageTable: output.stageTable,
      handbook: output.handbook, database: output.database, levels: new Map([[larvaId, source(larvaId)]]),
      sourceRevision, generatedAt }), /Map index and level branch counts disagree/)
  }
})

test('standalone main-trends CLI receives an explicit revision and fails closed without it', async t => {
  const root = await temporaryRoot(t)
  const args = await writeTrendInputs(root, build([larvaId]))
  const script = fileURLToPath(new URL('../scripts/generate-main-enemy-trends.mjs', import.meta.url))
  await runNode(process.execPath, [script, ...args, '--source-revision', sourceRevision])
  const saved = await readFile(resolve(root, 'trends.json'), 'utf8')
  const document = JSON.parse(saved)
  assert.equal(document.maps[0].status, 'included')
  assert.equal(document.maps[0].enemyCount, 51)
  assert.equal(document.maps[0].enemies.find(enemy => enemy.enemyId === 'enemy_1266_nhapos').count, 1)
  await assert.rejects(runNode(process.execPath, [script, ...args]), /schedule disagree/)
  await assert.rejects(runNode(process.execPath, [script, ...args, '--source-revision', 'f'.repeat(40)]), /schedule disagree/)
  await assert.rejects(runNode(process.execPath, [script, ...args, '--source-revision', sourceRevision.slice(0, 7)]),
    /sourceRevision must be a complete lowercase Git commit SHA/)
  assert.equal(await readFile(resolve(root, 'trends.json'), 'utf8'), saved)
})

test('standalone main-trends CLI preserves revision-free direct-wave generation', async t => {
  const root = await temporaryRoot(t)
  const level = source(larvaId)
  level.branches = {}
  const args = await writeTrendInputs(root, build([larvaId], { replacements: new Map([[larvaId, level]]) }))
  const script = fileURLToPath(new URL('../scripts/generate-main-enemy-trends.mjs', import.meta.url))
  await runNode(process.execPath, [script, ...args])
  const document = JSON.parse(await readFile(resolve(root, 'trends.json'), 'utf8'))
  assert.equal(document.maps[0].status, 'included')
  assert.equal(document.maps[0].enemyCount, 50)
})

test('archiving and parsing retain 51 and both kinds of branch evidence', async t => {
  const root = await temporaryRoot(t)
  const output = build()
  const files = {
    'maps/index.json': output.maps.index,
    'enemy-histogram-counts.json': output.histogram,
    'enemy-stage-appearances.json': output.appearances,
    'runtime/enemy_handbook_table.json': output.handbook,
    'runtime/enemy_database.json': output.database,
  }
  const directory = resolve(root, 'snapshot')
  for (const [name, contents] of Object.entries(files)) {
    const path = resolve(directory, name)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify(contents))
  }
  const archived = await archiveEnemyAggregation({ root, snapshot: { directory, revision: sourceRevision,
    generatorVersion: 'a'.repeat(64), generatedAt } })
  assert.equal(archived.status, 'created')
  const archiveDirectory = resolve(root, 'public/data/enemy-aggregation')
  const catalogue = parseEnemyAggregationIndex(JSON.parse(await readFile(resolve(archiveDirectory, 'index.json'), 'utf8')))
  assert.equal(catalogue.currentVersionId, archived.version.id)
  const bundle = parseEnemyAggregationBundle(JSON.parse(gunzipSync(await readFile(resolve(archiveDirectory,
    archived.version.file)))), archived.version.id)
  const parsed = parseMapIndex(bundle.files['maps/index.json'])
  for (const id of selected) {
    const saved = parsed.maps.find(map => map.levelId === id)
    const original = output.maps.index.maps.find(map => map.levelId === id)
    assert.deepEqual(saved.countedBranchSpawns, original.countedBranchSpawns)
    assert.deepEqual(saved.omittedBranchSpawns, original.omittedBranchSpawns)
    getMapDetail(parseMapDetailShard(output.maps.details[saved.detailFile]), saved)
  }
  const saved = parsed.maps.find(map => map.levelId === larvaId)
  assert.equal(saved.spawnCount, 51)
  assert.equal(saved.countedBranchSpawns[0].count, 1)
  assert.equal(bundle.files['enemy-histogram-counts.json'].enemies.enemy_1266_nhapos.spawnCount, 1)
  const malformed = structuredClone(bundle.files['maps/index.json'])
  malformed.maps.find(map => map.levelId === larvaId).countedBranchSpawns[0].count = -1
  assert.throws(() => parseMapIndex(malformed))
  const wrongDetail = structuredClone(output.maps.details[saved.detailFile])
  wrongDetail.maps[larvaId].enemies.find(enemy => enemy.id === 'enemy_1266_nhapos').count = 0
  assert.throws(() => getMapDetail(parseMapDetailShard(wrongDetail), saved), /出現数が一致/)
})
