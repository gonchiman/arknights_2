import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildEnemyHistogramCounts } from '../scripts/generateEnemyHistogramCounts.mjs'

const provenance = {
  generatedAt: '2026-09-27T00:00:00.000Z',
  sourceGeneratedAt: '2026-08-31T03:11:03.024Z',
}

function spawn(key: unknown, count: unknown, extra: Record<string, unknown> = {}) {
  return { actionType: 'SPAWN', key, count, ...extra }
}

function level(levelId: string, refs: unknown[], actions: unknown[], extra: Record<string, unknown> = {}) {
  return {
    levelId,
    data: { enemyDbRefs: refs, waves: [{ fragments: [{ actions }] }], ...extra },
  }
}

test('MAPS counts one reference per enemy and map; SPAWNS sums all repeated action counts', () => {
  const result = buildEnemyHistogramCounts([
    level('obt/a', [{ id: 'enemy_a' }, { id: 'enemy_a' }, { id: 'enemy_b' }, { id: '' }, null], [
      spawn('enemy_a', 2), spawn('enemy_a', 3), spawn('enemy_b', 4),
      { actionType: 'DISPLAY_ENEMY_INFO', key: 'enemy_a', count: 99 },
    ]),
    level('obt/b', [{ id: 'enemy_a' }], [spawn('enemy_a', 7)]),
  ], provenance)

  assert.deepEqual(result.enemies.enemy_a, { mapCount: 2, spawnCount: 12 })
  assert.deepEqual(result.enemies.enemy_b, { mapCount: 1, spawnCount: 4 })
  assert.deepEqual(Object.keys(result.enemies), ['enemy_a', 'enemy_b'])
  assert.deepEqual(result.summary, { mapCount: 2, missingMapCount: 0, spawnMapCount: 2, spawnExcludedMapCount: 0 })
  // Both enemies in the same bin contribute their map frequencies independently.
  assert.equal(Object.values(result.enemies).reduce((sum, value) => sum + value.mapCount, 0), 3)
})

test('normalized duplicate level IDs are counted once and invalid IDs are diagnosed', () => {
  const result = buildEnemyHistogramCounts([
    level('Obt/A.json', [{ id: 'enemy_a' }], [spawn('enemy_a', 2)]),
    level('obt\\a', [{ id: 'enemy_a' }], [spawn('enemy_a', 20)]),
    level('../outside', [{ id: 'enemy_a' }], [spawn('enemy_a', 200)]),
  ], provenance)

  assert.deepEqual(result.enemies.enemy_a, { mapCount: 1, spawnCount: 2 })
  assert.deepEqual(result.diagnostics.duplicateLevelIds, ['obt/a'])
  assert.deepEqual(result.diagnostics.invalidLevelIds, ['../outside'])
  assert.equal(result.summary.mapCount, 1)
})

test('random candidates, packs, hidden groups and weights exclude the whole map from SPAWNS only', () => {
  const cases = [
    ['random', { randomSpawnGroupKey: 'choice' }, 'random-spawn-group'],
    ['pack', { randomSpawnGroupPackKey: 'bundle' }, 'random-spawn-group'],
    ['hidden', { hiddenGroup: 'normal' }, 'hidden-spawn-group'],
    ['weight', { weight: 5 }, 'weighted-spawn'],
  ] as const
  for (const [name, extra, reason] of cases) {
    const result = buildEnemyHistogramCounts([
      level(`obt/${name}`, [{ id: 'enemy_a' }, { id: 'enemy_b' }], [
        spawn('enemy_a', 9), spawn('enemy_b', 1, extra),
      ]),
      level('obt/fixed', [{ id: 'enemy_a' }], [spawn('enemy_a', 2)]),
    ], provenance)
    assert.deepEqual(result.enemies.enemy_a, { mapCount: 2, spawnCount: 2 })
    assert.deepEqual(result.enemies.enemy_b, { mapCount: 1, spawnCount: 0 })
    assert.equal(result.summary.spawnMapCount, 1)
    assert.equal(result.summary.spawnExcludedMapCount, 1)
    assert.deepEqual(result.diagnostics.excludedLevels, [{ levelId: `obt/${name}`, reasons: [reason] }])
  }
})

test('legacy isValid:false, empty optional fields and ALWAYS conditions still count', () => {
  const result = buildEnemyHistogramCounts([
    level('obt/legacy', [{ id: 'enemy_a' }], [spawn('enemy_a', 4, {
      isValid: false, randomSpawnGroupKey: null, randomSpawnGroupPackKey: '', hiddenGroup: '',
      weight: 0, randomType: 'ALWAYS', refreshType: 'ALWAYS', condition: true,
    })]),
  ], provenance)
  assert.deepEqual(result.enemies.enemy_a, { mapCount: 1, spawnCount: 4 })
  assert.equal(result.summary.spawnMapCount, 1)
})

test('unknown conditions and unscheduled spawns cannot masquerade as exact totals', () => {
  for (const extra of [
    { randomType: 'RANDOM' }, { refreshType: 'ON_EVENT' }, { condition: 'if_boss_dead' }, { condition: false },
    { conditions: [{ key: 'flag' }] }, { repeatCount: 2 }, { managedByScheduler: false },
  ]) {
    const result = buildEnemyHistogramCounts([
      level('obt/conditional', [{ id: 'enemy_a' }], [spawn('enemy_a', 3), spawn('enemy_a', 1, extra)]),
    ], provenance)
    assert.equal(result.enemies.enemy_a.spawnCount, 0)
    assert.equal(result.summary.spawnExcludedMapCount, 1)
    assert.ok(result.diagnostics.excludedLevels[0].reasons.length > 0)
  }
})

test('future conditions on waves or fragments exclude their totals until supported', () => {
  for (const waves of [
    [{ condition: 'if_boss_dead', fragments: [{ actions: [spawn('enemy_a', 2)] }] }],
    [{ fragments: [{ repeatCount: 5, actions: [spawn('enemy_a', 2)] }] }],
  ]) {
    const result = buildEnemyHistogramCounts([level('obt/future', [{ id: 'enemy_a' }], [], { waves })], provenance)
    assert.deepEqual(result.enemies.enemy_a, { mapCount: 1, spawnCount: 0 })
    assert.equal(result.summary.spawnExcludedMapCount, 1)
  }
})

test('special wave tags are excluded because tagged waves can be chosen at runtime', () => {
  for (const advancedWaveTag of ['stage', '0', 'bosswave', 'ball_lv1_lose:100|ball_lv1_win:20']) {
    const result = buildEnemyHistogramCounts([level('obt/tagged', [{ id: 'enemy_a' }], [], {
      waves: [{ advancedWaveTag, fragments: [{ actions: [spawn('enemy_a', 2)] }] }],
    })], provenance)
    assert.deepEqual(result.enemies.enemy_a, { mapCount: 1, spawnCount: 0 })
    assert.deepEqual(result.diagnostics.excludedLevels[0].reasons, ['unsupported-wave-tag'])
  }
})

test('invalid counts and unsafe sums exclude a whole map without producing NaN or partial totals', () => {
  for (const count of [NaN, Infinity, -1, 1.5, '3', null, undefined, Number.MAX_SAFE_INTEGER + 1]) {
    const result = buildEnemyHistogramCounts([
      level('obt/bad', [{ id: 'enemy_a' }], [spawn('enemy_a', 4), spawn('enemy_a', count)]),
    ], provenance)
    assert.deepEqual(result.enemies.enemy_a, { mapCount: 1, spawnCount: 0 })
    assert.deepEqual(result.diagnostics.excludedLevels[0].reasons, ['invalid-spawn-count'])
  }
  const result = buildEnemyHistogramCounts([
    level('obt/overflow', [{ id: 'enemy_a' }], [spawn('enemy_a', Number.MAX_SAFE_INTEGER), spawn('enemy_a', 1)]),
  ], provenance)
  assert.equal(result.enemies.enemy_a.spawnCount, 0)
  assert.deepEqual(result.diagnostics.excludedLevels[0].reasons, ['spawn-total-overflow'])
})

test('zero count, empty schedules and non-SPAWN actions are supported zero contributions', () => {
  const result = buildEnemyHistogramCounts([
    level('obt/zero', [{ id: 'enemy_a' }], [spawn(null, 0, { hiddenGroup: 'unused' })]),
    level('obt/empty', [], []),
    level('obt/no-waves', [], [], { waves: [] }),
    level('obt/info', [{ id: 'enemy_a' }], [{ actionType: 'DISPLAY_ENEMY_INFO', count: 'irrelevant' }]),
  ], provenance)
  assert.deepEqual(result.enemies.enemy_a, { mapCount: 2, spawnCount: 0 })
  assert.equal(result.summary.spawnMapCount, 4)
  assert.equal(result.summary.spawnExcludedMapCount, 0)
})

test('missing schedule structure and SPAWN enemy IDs are diagnosed rather than assumed zero', () => {
  for (const extra of [{ waves: null }, { waves: {} }, { waves: [{}] }, { waves: [{ fragments: [{}] }] }]) {
    const result = buildEnemyHistogramCounts([level('obt/malformed', [], [], extra)], provenance)
    assert.equal(result.summary.spawnMapCount, 0)
    assert.equal(result.summary.spawnExcludedMapCount, 1)
  }
  const result = buildEnemyHistogramCounts([level('obt/no-enemy', [], [spawn('', 1)])], provenance)
  assert.deepEqual(result.diagnostics.excludedLevels[0].reasons, ['invalid-spawn-enemy'])
})

test('branch SPAWNs and normal enemy replacements exclude maps; non-spawn branches and challenge-only runes do not', () => {
  const result = buildEnemyHistogramCounts([
    level('obt/branch', [{ id: 'enemy_a' }], [spawn('enemy_a', 2)], {
      branches: { summon: { phases: [{ actions: [spawn('enemy_a', 1)] }] } },
    }),
    level('obt/replacement', [{ id: 'enemy_a' }], [spawn('enemy_a', 3)], {
      runes: [{ difficultyMask: 'ALL', key: 'level_enemy_replace' }],
    }),
    level('obt/normal', [{ id: 'enemy_a' }], [spawn('enemy_a', 4)], {
      branches: { visual: { phases: [{ actions: [{ actionType: 'ACTIVATE_PREDEFINED', count: 1 }] }] } },
      runes: [{ difficultyMask: 'FOUR_STAR', key: 'level_enemy_replace' }],
    }),
  ], provenance)
  assert.deepEqual(result.enemies.enemy_a, { mapCount: 3, spawnCount: 4 })
  assert.deepEqual(result.diagnostics.reasonCounts, { 'branch-spawn': 1, 'enemy-replacement': 1 })
  assert.equal(result.summary.spawnMapCount, 1)
})

test('source date and missing coverage stay explicit and recovered missing levels are accounted for', () => {
  const sourceProvenance = {
    ...provenance,
    sourceSummary: { uniqueLevelCount: 4, processedLevelCount: 2, failedLevelCount: 2 },
    failedLevelIds: ['obt/missing', 'obt/recovered'],
  }
  const levels = [level('obt/a', [], []), level('obt/recovered', [], [])]
  const result = buildEnemyHistogramCounts(levels, sourceProvenance)
  assert.equal(result.sourceGeneratedAt, provenance.sourceGeneratedAt)
  assert.equal(result.generatedAt, provenance.generatedAt)
  assert.equal(result.summary.missingMapCount, 2)
  assert.deepEqual(result.diagnostics.missingLevelIds, ['obt/missing'])
  assert.equal(result.diagnostics.sourceCoverage.recoveredMapCount, 1)
  assert.deepEqual(buildEnemyHistogramCounts(levels), buildEnemyHistogramCounts(levels))
  assert.equal(buildEnemyHistogramCounts(levels).generatedAt, null)
})

test('committed cache aggregate retains source coverage and all existing per-enemy map counts', async () => {
  const [result, source] = await Promise.all([
    readFile(new URL('../public/data/enemy-histogram-counts.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../public/data/enemy-stage-appearances.json', import.meta.url), 'utf8').then(JSON.parse),
  ])
  assert.equal(result.schemaVersion, 1)
  assert.equal(result.scope, 'cached-stage-levels')
  assert.equal(result.sourceGeneratedAt, source.generatedAt)
  assert.equal(result.summary.mapCount, source.summary.processedLevelCount)
  assert.equal(result.summary.missingMapCount, source.summary.failedLevelCount)
  assert.equal(result.summary.spawnMapCount + result.summary.spawnExcludedMapCount, result.summary.mapCount)
  assert.equal(result.diagnostics.excludedLevels.length, result.summary.spawnExcludedMapCount)
  assert.ok(result.summary.spawnMapCount > 0)
  assert.ok(result.summary.spawnExcludedMapCount > 0)
  for (const [enemyId, counts] of Object.entries(source.enemies)) {
    assert.equal(result.enemies[enemyId]?.mapCount ?? 0, counts.stageCount, enemyId)
  }
  for (const counts of Object.values(result.enemies)) {
    assert.ok(Number.isSafeInteger(counts.mapCount) && counts.mapCount >= 0)
    assert.ok(Number.isSafeInteger(counts.spawnCount) && counts.spawnCount >= 0)
  }
})
