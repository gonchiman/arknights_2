import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { analyzeEnemySpawns } from '../scripts/lib/enemySpawnConditions.mjs'
import { resolveEnemySpawnAggregation } from '../scripts/lib/enemySpawnAggregation.mjs'
import { buildEnemyHistogramCounts } from '../scripts/generateEnemyHistogramCounts.mjs'
import { buildMapDatabase } from '../scripts/generateMapDatabase.mjs'
import { ENEMY_UNIT_ROLE_SOURCE_REVISION } from '../scripts/lib/enemyUnitRoles.mjs'

const spawn = (key = 'enemy_a', count = 2, extra = {}) => ({ actionType: 'SPAWN', key, count, ...extra })
const branch = actions => ({ phases: [{ actions }] })
const geometry = { map: [[0]], tiles: [{ tileKey: 'tile_start', heightType: 'LOWLAND', buildableType: 'NONE', passableMask: 'ALL' }] }
const level = (actions = [spawn()], extra = {}) => ({
  enemyDbRefs: [{ id: 'enemy_a' }, { id: 'enemy_b' }], mapData: geometry,
  waves: [{ fragments: [{ actions }] }], ...extra,
})
const partial = (actions = [spawn()], extra = {}) => level(actions, { branches: { unknown: branch([spawn('enemy_b', 100)]) }, ...extra })
const mode = { mode: 'lower-bound' }
const context = { levelId: 'obt/main/level_main_10-04', sourceRevision: ENEMY_UNIT_ROLE_SOURCE_REVISION }
const rune = (key, target, replacement, extra = {}) => ({ key, difficultyMask: 'NORMAL', professionMask: 1023, buildableMask: 'ALL',
  blackboard: [{ key: 'key', valueStr: target }, ...(replacement ? [{ key: 'value', valueStr: replacement }] : [])], ...extra })
const total = histogram => Object.values(histogram.enemies).reduce((sum, enemy) => sum + enemy.spawnCount, 0)
const fixture = name => JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/enemyBranchPolicy/' + name + '.json.gz', import.meta.url))))

test('V4 retains only known wave counts without changing strict V3 or source evidence', () => {
  const source = partial([spawn('enemy_a', 7)])
  const original = structuredClone(source)
  const analysis = analyzeEnemySpawns(source, context)
  const before = structuredClone(analysis)
  assert.equal(resolveEnemySpawnAggregation(source, context, { analysis }).kind, 'excluded')
  const result = resolveEnemySpawnAggregation(source, context, { ...mode, analysis })
  assert.equal(result.kind, 'lower-bound')
  assert.equal(result.count, 7)
  assert.deepEqual([...result.counts], [['enemy_a', 7]])
  assert.deepEqual(result.reasons, ['branch-spawn'])
  assert.deepEqual(source, original)
  assert.deepEqual(analysis, before)
  const strict = buildEnemyHistogramCounts([{ levelId: context.levelId, data: source }])
  assert.equal(strict.summary.spawnMapCount, 0)
  assert.equal(strict.summary.spawnExcludedMapCount, 1)
  assert.equal(total(strict), 0)
  assert.equal(Object.hasOwn(strict, 'spawnAggregationMode'), false)
  assert.equal(Object.hasOwn(strict.summary, 'lowerBoundMapCount'), false)
  assert.equal(Object.hasOwn(strict.diagnostics, 'lowerBoundLevels'), false)
})

test('random, weighted and runtime actions never contribute their possible counts', () => {
  for (const extra of [{ randomSpawnGroupKey: 'choice' }, { randomSpawnGroupPackKey: 'pack' }, { weight: 5 },
    { condition: 'boss_dead' }, { conditions: ['boss_dead'] }, { randomType: 'RANDOM' },
    { refreshType: 'RANDOM' }, { managedByScheduler: false }]) {
    const result = resolveEnemySpawnAggregation(level([spawn('enemy_a', 3), spawn('enemy_b', 90, extra)]), context, mode)
    assert.equal(result.kind, 'lower-bound', JSON.stringify(extra))
    assert.equal(result.count, 3)
    assert.deepEqual([...result.counts], [['enemy_a', 3]])
  }
  const result = resolveEnemySpawnAggregation(level([], { waves: [
    { fragments: [{ actions: [spawn('enemy_a', 3)] }] },
    { advancedWaveTag: 'runtime_selection', fragments: [{ actions: [spawn('enemy_b', 90)] }] },
  ] }), context, mode)
  assert.equal(result.kind, 'lower-bound')
  assert.equal(result.count, 3)
  assert.deepEqual(result.reasons, ['unsupported-wave-tag'])
})

test('lower-bound counting still obeys default-off groups and selected difficulty', () => {
  const source = partial([spawn('enemy_a', 4), spawn('enemy_b', 5, { hiddenGroup: 'tough' })], {
    runes: [rune('level_hidden_group_enable', 'tough', null, { difficultyMask: 'FOUR_STAR' })],
  })
  assert.equal(resolveEnemySpawnAggregation(source, context, mode).count, 4)
  assert.equal(resolveEnemySpawnAggregation(source, { ...context, diffGroup: 'TOUGH' }, mode).count, 9)
  assert.equal(resolveEnemySpawnAggregation(partial([spawn('enemy_a', 2, { hiddenGroup: 'off' })]), context, mode).kind, 'excluded')
})

test('verified mandatory branches still contribute their proven counts in V4', () => {
  const input = fixture('larva-levels')
  const id = 'obt/main/level_main_11-06'
  const source = new Map(input.levels).get(id)
  const proofContext = { levelId: id, sourceRevision: input.sourceRevision, difficulty: 'NORMAL', diffGroup: 'NORMAL' }
  const analysis = analyzeEnemySpawns(source, proofContext)
  assert.ok(analysis.countedBranchSpawns.length > 0)
  const fixed = analysis.actions.filter(action => action.status === 'included').reduce((sum, action) => sum + action.resolvedCount, 0)
  assert.equal(fixed, 50)
  const result = resolveEnemySpawnAggregation(source, proofContext, mode)
  assert.equal(result.kind, 'exact')
  assert.equal(result.count, 51)
  assert.deepEqual(result, resolveEnemySpawnAggregation(source, proofContext))
})

test('malformed or uncertain wave rules remain held even with positive known waves', () => {
  const cases = [
    partial([spawn(), spawn('enemy_b', -1)]),
    partial([spawn(), spawn('enemy_b', 2, { repeatCount: 3 })]),
    partial([spawn(), spawn('enemy_b', Number.MAX_SAFE_INTEGER)]),
    partial([spawn()], { waves: [{ fragments: [{ actions: [spawn()], futureCondition: 'x' }] }] }),
    partial([spawn()], { waves: [{ fragments: [{ actions: [spawn()] }], futureControl: true }] }),
    partial([spawn()], { runes: {} }),
    partial([spawn()], { enemyDbRefs: null }),
    partial([spawn()], { runes: [rune('level_enemy_replace', 'enemy_b', 'enemy_a', { professionMask: 3 })],
      branches: { unknown: branch([spawn('enemy_b', 1)]) } }),
    partial([spawn()], { optionalRunes: { choose: [rune('level_enemy_replace', 'enemy_a', 'enemy_b')] } }),
  ]
  for (const source of cases) {
    assert.equal(resolveEnemySpawnAggregation(source, context, mode).kind, 'excluded', JSON.stringify(source))
  }
})

test('the generic branch-spawn reason does not conceal malformed branch actions', () => {
  for (const actions of [[spawn('enemy_b', -1)], [spawn('enemy_b', 1, { repeatCount: 4 })],
    [spawn('', 3)], [spawn('enemy_b', 1), null]]) {
    const source = partial([spawn()], { branches: { unknown: branch(actions) } })
    assert.equal(resolveEnemySpawnAggregation(source, context, mode).kind, 'excluded')
  }
  for (const branches of [{ unknown: { phases: [{ actions: [spawn('enemy_b')], future: true }] } },
    { unknown: { phases: [{ actions: [spawn('enemy_b')] }], repeat: 4 } }]) {
    assert.equal(resolveEnemySpawnAggregation(partial([spawn()], { branches }), context, mode).kind, 'excluded')
  }
  const uncertain = partial([spawn()], { branches: { unknown: branch([spawn('enemy_b')]) },
    runes: [rune('level_enemy_replace', 'enemy_b', 'enemy_a', { professionMask: 3 })] })
  assert.deepEqual([...analyzeEnemySpawns(uncertain, context).reasons], ['branch-spawn'])
  assert.equal(resolveEnemySpawnAggregation(uncertain, context, mode).kind, 'excluded')
})

test('only exact empty-object collections are recoverable and never modify source collections', () => {
  const source = partial([spawn()], { waves: [{ fragments: [{ actions: [spawn()] }] }, { fragments: {} }],
    branches: { empty: { phases: [{ actions: {} }] } } })
  const original = structuredClone(source)
  const result = resolveEnemySpawnAggregation(source, context, mode)
  assert.equal(result.kind, 'lower-bound')
  assert.equal(result.count, 2)
  assert.deepEqual(result.reasons, ['invalid-branch-actions', 'invalid-fragments'])
  assert.equal(resolveEnemySpawnAggregation(source, context).kind, 'excluded')
  assert.deepEqual(source, original)
  const unknownControl = structuredClone(source)
  unknownControl.waves[1].futureControl = true
  assert.equal(resolveEnemySpawnAggregation(unknownControl, context, mode).kind, 'excluded')
  for (const invalid of [null, undefined, false, { future: [] }]) {
    assert.equal(resolveEnemySpawnAggregation(level([spawn()], { waves: [
      { fragments: [{ actions: [spawn()] }] }, { fragments: invalid },
    ] }), context, mode).kind, 'excluded')
    assert.equal(resolveEnemySpawnAggregation(partial([spawn()], { branches: { empty: {
      phases: [{ actions: invalid }],
    } } }), context, mode).kind, 'excluded')
  }
})

test('non-enemy role filters match V3; no positive known hostile count stays excluded', () => {
  const miner = 'enemy_3010_mcreep'
  const source = partial([spawn('enemy_a', 3), spawn(miner, 6)], {
    enemyDbRefs: [{ id: 'enemy_a' }, { id: 'enemy_b' }, { id: miner, useDb: true, level: 0 }],
  })
  const lower = resolveEnemySpawnAggregation(source, context, mode)
  assert.equal(lower.count, 3)
  assert.equal(lower.excludedNonEnemySpawns[0].count, 6)
  const strictSource = { ...source, branches: {} }
  const exact = resolveEnemySpawnAggregation(strictSource, context)
  assert.equal(exact.count, lower.count)
  assert.deepEqual(exact.excludedNonEnemySpawns, lower.excludedNonEnemySpawns)
  const unknownOverride = structuredClone(source)
  unknownOverride.enemyDbRefs.at(-1).useDb = false
  const unknown = resolveEnemySpawnAggregation(unknownOverride, context, mode)
  assert.equal(unknown.count, 9)
  assert.equal(unknown.unverifiedNonEnemySpawns[0].reason, 'unverified-reference-or-override')
  const onlyMiner = structuredClone(source)
  onlyMiner.waves[0].fragments[0].actions = [spawn(miner, 6)]
  assert.equal(resolveEnemySpawnAggregation(onlyMiner, context, mode).kind, 'excluded')
  for (const actions of [[], [spawn('enemy_a', 0)], [spawn('enemy_a', 10, { weight: 1 })]]) {
    assert.equal(resolveEnemySpawnAggregation(partial(actions), context, mode).kind, 'excluded')
  }
})

test('histogram and map coverage agree on positive partial counts; excluded scopes stay excluded', () => {
  const source = partial([spawn('enemy_a', 7)])
  const stages = Object.fromEntries([
    ['main', 'main_10', 'NORMAL'], ['story', 'main_10', 'EASY'], ['other', 'annihilation', 'NORMAL'],
  ].map(([id, zoneId, diffGroup]) => [id, { stageId: id, levelId: 'obt/' + id, zoneId, diffGroup,
    difficulty: 'NORMAL', code: id, name: id, isStoryOnly: false }]))
  const levels = Object.keys(stages).map(id => ({ levelId: 'obt/' + id, data: source }))
  const options = { levels, stageTable: { stages }, zoneTable: { zones: {
    main_10: { type: 'MAINLINE', zoneNameFirst: '第十章' }, annihilation: { type: 'CAMPAIGN', zoneNameFirst: '殲滅' },
  } }, handbook: { enemyData: {} }, database: {}, sourceRevision: context.sourceRevision, generatedAt: '2026-10-28T00:00:00Z' }
  const maps = buildMapDatabase({ ...options, spawnAggregationMode: 'lower-bound' })
  const histogram = buildEnemyHistogramCounts(levels, { sourceRevision: context.sourceRevision, spawnAggregationMode: 'lower-bound',
    excludedLevelIds: ['obt/story', 'obt/other'], stageContexts: Object.fromEntries(Object.values(stages).map(stage => [stage.levelId, stage])) })
  const summary = maps.index.maps.find(map => map.levelId === 'obt/main')
  assert.deepEqual(summary.spawnAggregation, { kind: 'lower-bound', count: 7, reasons: ['branch-spawn'] })
  assert.equal(summary.status, 'excluded')
  assert.equal(summary.spawnCount, null)
  assert.deepEqual(summary.reasons, summary.spawnAggregation.reasons)
  assert.ok(maps.details[summary.detailFile].maps[summary.levelId].enemies.every(enemy => enemy.count === null))
  assert.equal(maps.index.maps.find(map => map.levelId === 'obt/story').spawnAggregation, undefined)
  assert.equal(maps.index.maps.find(map => map.levelId === 'obt/other').spawnAggregation, undefined)
  assert.equal(histogram.spawnAggregationMode, 'lower-bound')
  assert.equal(histogram.summary.spawnMapCount, 1)
  assert.equal(histogram.summary.lowerBoundMapCount, 1)
  assert.equal(histogram.summary.spawnExcludedMapCount, 0)
  assert.equal(total(histogram), summary.spawnAggregation.count)
  assert.deepEqual(histogram.diagnostics.lowerBoundLevels, [{ levelId: summary.levelId, spawnCount: 7, reasons: summary.reasons }])
  assert.deepEqual(histogram.diagnostics.excludedLevels, [])
  const old = buildMapDatabase(options)
  assert.ok(old.index.maps.every(map => !Object.hasOwn(map, 'spawnAggregation')))
  const empty = buildEnemyHistogramCounts([], { spawnAggregationMode: 'lower-bound' })
  assert.equal(empty.summary.lowerBoundMapCount, 0)
  assert.deepEqual(empty.diagnostics.lowerBoundLevels, [])
})

test('unsupported mode and cumulative numeric overflow are not admitted as partial data', () => {
  assert.throws(() => resolveEnemySpawnAggregation(level(), context, { mode: 'guess' }), /mode/)
  assert.throws(() => buildEnemyHistogramCounts([], { spawnAggregationMode: 'guess' }), /mode/)
  const output = buildEnemyHistogramCounts([
    { levelId: 'obt/a', data: level([spawn('enemy_a', Number.MAX_SAFE_INTEGER)]) },
    { levelId: 'obt/b', data: partial() },
  ], { spawnAggregationMode: 'lower-bound' })
  assert.equal(output.summary.spawnMapCount, 1)
  assert.equal(output.summary.lowerBoundMapCount, 0)
  assert.ok(output.diagnostics.excludedLevels[0].reasons.includes('spawn-total-overflow'))
})
