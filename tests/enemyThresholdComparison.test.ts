import assert from 'node:assert/strict'
import test from 'node:test'
import type { EnemyRecord } from '../src/types/enemy.ts'
import type { EnemyComparisonCondition } from '../src/lib/enemyDistributionComparison.ts'
import type { EnemyHistogramCounts } from '../src/lib/enemyHistogramCounts.ts'
import {
  buildEnemyThresholdComparison,
  createEnemyThresholdComparisonConditions,
  createEnemyThresholdComparisonImageFilename,
} from '../src/lib/enemyThresholdComparison.ts'

function enemy(id: string, resistance: number | null, levelType: EnemyRecord['levelType'] = 'NORMAL'): EnemyRecord {
  return {
    id, index: id, sortId: 0, name: id, levelType, description: '', abilities: [], damageTypes: [],
    attackWay: null, lifePointReduce: null, databaseLevel: 0, databaseLevelCount: 1,
    stageAppearanceCount: 2, statusImmunities: [],
    ratings: { endurance: null, attack: null, defense: null, resistance: null },
    stats: { maxHp: 100, attack: 20, defense: 30, magicResistance: resistance, moveSpeed: 1,
      attackSpeed: 100, baseAttackTime: 1, massLevel: 2 },
  }
}

function all(): EnemyComparisonCondition {
  return { id: 1, colorIndex: 0, filters: { levelType: 'ALL' }, numericConditions: [], visible: true }
}

const counts: EnemyHistogramCounts = {
  schemaVersion: 1, generatedAt: '', sourceGeneratedAt: null,
  summary: { mapCount: 10, missingMapCount: 1, spawnMapCount: 8, spawnExcludedMapCount: 2 },
  enemies: {
    a: { mapCount: 2, spawnCount: 8 }, b: { mapCount: 3, spawnCount: 2 },
    c: { mapCount: 5, spawnCount: 30 }, missing: { mapCount: 4, spawnCount: 20 },
    zero: { mapCount: 0, spawnCount: 0 },
  },
}

test('初期条件は通常敵・エリート敵・ボスで、呼び出し間で編集状態を共有しない', () => {
  const conditions = createEnemyThresholdComparisonConditions()
  assert.deepEqual(conditions, [
    { id: 1, colorIndex: 0, filters: { levelType: 'NORMAL' }, numericConditions: [], visible: true },
    { id: 2, colorIndex: 1, filters: { levelType: 'ELITE' }, numericConditions: [], visible: true },
    { id: 3, colorIndex: 2, filters: { levelType: 'BOSS' }, numericConditions: [], visible: true },
  ])
  conditions[0].filters.levelType = 'ALL'
  conditions[1].numericConditions = [{ id: 1, field: 'maxHp', operator: 'gt', value: '100' }]
  const next = createEnemyThresholdComparisonConditions()
  assert.equal(next[0].filters.levelType, 'NORMAL')
  assert.deepEqual(next[1].numericConditions, [])
})

test('分類別に元の術耐性を厳密に比較し、各系列の有効数を100%とする', () => {
  const rows = [enemy('n0', 0), enemy('n60', 60), enemy('n60plus', 60.00000000000001),
    enemy('e59', 59.99999999999999, 'ELITE'), enemy('enull', null, 'ELITE'),
    enemy('enan', NaN, 'ELITE'), enemy('b100', 100, 'BOSS'), enemy('unknown', 40, 'UNKNOWN')]
  const result = buildEnemyThresholdComparison(rows, createEnemyThresholdComparisonConditions(), 60, 'TYPES', null)
  assert.equal(result.threshold, 60)
  assert.deepEqual(result.series.map(({ label, matchedCount, count, missingCount }) => ({ label, matchedCount, count, missingCount })), [
    { label: '通常敵', matchedCount: 3, count: 3, missingCount: 0 },
    { label: 'エリート敵', matchedCount: 3, count: 1, missingCount: 2 },
    { label: 'ボス', matchedCount: 1, count: 1, missingCount: 0 },
  ])
  assert.deepEqual(result.series.map(({ distribution }) => distribution.buckets.map(({ count }) => count)), [[1, 1, 1], [1, 0, 0], [0, 0, 1]])
  assert.deepEqual(result.series.map(({ distribution }) => distribution.buckets.map(({ proportion }) => proportion)), [[1 / 3, 1 / 3, 1 / 3], [1, 0, 0], [0, 0, 1]])
  const unknown = { ...all(), filters: { levelType: 'UNKNOWN' as const } }
  assert.equal(buildEnemyThresholdComparison(rows, [unknown], 60, 'TYPES', null).series[0].count, 1)
})

test('敵分類と複数数値条件をANDで適用し、入力途中の条件を無視する', () => {
  const rows = [enemy('included', 60), enemy('small', 20), enemy('no-stages', 80), enemy('missing-hp', 10), enemy('boss', 80, 'BOSS')]
  rows[1].stats.maxHp = 99
  rows[2].stageAppearanceCount = 0
  rows[3].stats.maxHp = null
  const condition: EnemyComparisonCondition = { ...createEnemyThresholdComparisonConditions()[0], numericConditions: [
    { id: 1, field: 'maxHp', operator: 'gte', value: '100' },
    { id: 2, field: 'stageAppearanceCount', operator: 'gt', value: '0' },
    { id: 3, field: 'magicResistance', operator: 'lt', value: '-' },
  ] }
  const result = buildEnemyThresholdComparison(rows, [condition], 60, 'TYPES', null).series[0]
  assert.equal(result.label, '通常敵 · HP≥100 · 登場ステージ数＞0')
  assert.equal(result.matchedCount, 1)
  assert.equal(result.count, 1)
  assert.deepEqual(result.distribution.buckets.map(({ count }) => count), [0, 1, 0])
})

test('種類数・登場マップ数・出現回数を重み付きで集計し、0回と未収録を除外する', () => {
  const rows = [enemy('a', 0), enemy('b', 60), enemy('c', 80, 'ELITE'), enemy('missing', null), enemy('zero', 99), enemy('unrecorded', 99)]
  for (const [mode, expectedBuckets, expectedMissing] of [
    ['TYPES', [1, 1, 3], 1], ['MAPS', [2, 3, 5], 4], ['SPAWNS', [8, 2, 30], 20],
  ] as const) {
    const result = buildEnemyThresholdComparison(rows, [all()], 60, mode, counts).series[0]
    assert.equal(result.matchedCount, 6)
    assert.deepEqual(result.distribution.buckets.map(({ count }) => count), expectedBuckets)
    assert.equal(result.count, expectedBuckets.reduce((sum, count) => sum + count, 0))
    assert.equal(result.missingCount, expectedMissing)
    assert.equal(result.count, result.distribution.count)
    assert.equal(result.missingCount, result.distribution.missingCount)
    assert.equal(result.distribution.buckets.reduce((sum, bucket) => sum + bucket.proportion, 0), 1)
  }
  const perClass = buildEnemyThresholdComparison(rows, createEnemyThresholdComparisonConditions(), 60, 'SPAWNS', counts)
  assert.deepEqual(perClass.series.map(({ distribution }) => distribution.buckets.map(({ proportion }) => proportion)), [[0.8, 0.2, 0], [0, 0, 1], [0, 0, 0]])
})

test('重複IDは既存分布比較と同様に最後のデータを一度だけ数え、重複条件は独立に扱う', () => {
  const conditions = [all(), { ...all(), id: 2, visible: false }]
  const rows = [enemy('a', 20), enemy('b', 80), enemy('a', 60)]
  const result = buildEnemyThresholdComparison(rows, conditions, 60, 'MAPS', counts)
  assert.deepEqual(result.series.map(({ matchedCount, count }) => ({ matchedCount, count })), [{ matchedCount: 2, count: 5 }, { matchedCount: 2, count: 5 }])
  assert.deepEqual(result.series[0].distribution.buckets.map(({ count }) => count), [0, 2, 3])
  assert.deepEqual(result.series[0].distribution, result.series[1].distribution)
  assert.equal(result.series[1].condition.visible, false)
})

test('空集合・欠損のみ・重み0のみ・登場集計の未読込でも条件と3区分を保持する', () => {
  for (const [rows, mode, source, expectedMatched, expectedMissing] of [
    [[], 'TYPES', null, 0, 0],
    [[enemy('missing', null)], 'MAPS', counts, 1, 4],
    [[enemy('zero', null)], 'SPAWNS', counts, 1, 0],
    [[enemy('a', 20)], 'MAPS', null, 1, 0],
    [[enemy('a', 20)], 'SPAWNS', null, 1, 0],
  ] as const) {
    const result = buildEnemyThresholdComparison(rows, [all()], 60, mode, source).series[0]
    assert.equal(result.matchedCount, expectedMatched)
    assert.equal(result.count, 0)
    assert.equal(result.missingCount, expectedMissing)
    assert.deepEqual(result.distribution.buckets.map(({ count, proportion }) => [count, proportion]), [[0, 0], [0, 0], [0, 0]])
  }
  assert.deepEqual(buildEnemyThresholdComparison([enemy('a', 20)], [], 60, 'TYPES', null), { threshold: 60, series: [] })
})

test('非正・非有限の重みを除外し、大きな重みを展開せず計算する', () => {
  const weighted: EnemyHistogramCounts = { ...counts, enemies: {
    a: { mapCount: 1, spawnCount: 1e12 }, b: { mapCount: 1, spawnCount: -1 },
    c: { mapCount: 1, spawnCount: Infinity }, missing: { mapCount: 1, spawnCount: NaN },
  } }
  const result = buildEnemyThresholdComparison([enemy('a', 60), enemy('b', 0), enemy('c', 100), enemy('missing', null)], [all()], 60, 'SPAWNS', weighted).series[0]
  assert.equal(result.count, 1e12)
  assert.equal(result.missingCount, 0)
  assert.deepEqual(result.distribution.buckets.map(({ proportion }) => proportion), [0, 1, 0])
})

test('0・小数・100の基準値をそのまま使用し、空条件でも不正な基準値を拒否する', () => {
  const rows = [enemy('zero', 0), enemy('fraction', 60.5), enemy('max', 100)]
  for (const [threshold, buckets] of [[0, [0, 1, 2]], [60.5, [1, 1, 1]], [100, [2, 1, 0]]] as const) {
    assert.deepEqual(buildEnemyThresholdComparison(rows, [all()], threshold, 'TYPES', null).series[0].distribution.buckets.map(({ count }) => count), buckets)
  }
  for (const threshold of [-1, 101, NaN, Infinity]) {
    assert.throws(() => buildEnemyThresholdComparison(rows, [], threshold, 'TYPES', null), RangeError)
    assert.throws(() => createEnemyThresholdComparisonImageFilename({ comparison: { threshold, series: [] }, countMode: 'TYPES' }), RangeError)
  }
})

test('保存スナップショットは元の条件・数値条件・行・重みの編集に影響されない', () => {
  const condition: EnemyComparisonCondition = { ...all(), numericConditions: [{ id: 1, field: 'maxHp', operator: 'gte', value: '100' }] }
  const rows = [enemy('a', 60)]
  const source = structuredClone(counts)
  const result = buildEnemyThresholdComparison(rows, [condition], 60, 'MAPS', source)
  const snapshot = structuredClone(result)
  condition.filters.levelType = 'BOSS'
  condition.numericConditions[0].value = '999'
  condition.visible = false
  rows[0].stats.magicResistance = 100
  source.enemies.a.mapCount = 999
  assert.deepEqual(result, snapshot)
  result.series[0].condition.numericConditions[0].value = '200'
  assert.equal(condition.numericConditions[0].value, '999')
})

test('保存名は可視条件・比較順・基準値・集計・配置・比率を識別する', () => {
  const comparison = buildEnemyThresholdComparison([], createEnemyThresholdComparisonConditions(), 60, 'TYPES', null)
  const options = { comparison, countMode: 'TYPES' as const }
  const filename = createEnemyThresholdComparisonImageFilename(options)
  assert.equal(filename, '敵_術耐性_円グラフ比較_基準値60_種類数_条件1-通常敵_条件2-エリート敵_条件3-ボス_比率自動.png')
  assert.equal(createEnemyThresholdComparisonImageFilename({ ...options, labelLayout: 'BELOW' }), filename)
  assert.notEqual(createEnemyThresholdComparisonImageFilename({ ...options, comparison: { ...comparison, threshold: 60.5 } }), filename)
  assert.notEqual(createEnemyThresholdComparisonImageFilename({ ...options, comparison: { ...comparison, series: [...comparison.series].reverse() } }), filename)
  for (const countMode of ['MAPS', 'SPAWNS'] as const) assert.notEqual(createEnemyThresholdComparisonImageFilename({ ...options, countMode }), filename)
  for (const labelLayout of ['HYBRID', 'OUTSIDE', 'RIGHT'] as const) assert.notEqual(createEnemyThresholdComparisonImageFilename({ ...options, labelLayout }), filename)
  assert.match(createEnemyThresholdComparisonImageFilename({ ...options, labelLayout: 'RIGHT', aspectRatio: 16 / 9 }), /_右側に整列_比率16x9\.png$/)
  assert.equal(createEnemyThresholdComparisonImageFilename({ ...options, aspectRatio: 16 / 9 }), createEnemyThresholdComparisonImageFilename({ ...options, aspectRatio: 32 / 18 }))
  comparison.series[0].condition.visible = false
  const visibleName = createEnemyThresholdComparisonImageFilename(options)
  assert.match(visibleName, /_条件1-エリート敵_条件2-ボス_/)
  assert.doesNotMatch(visibleName, /通常敵/)
})

test('保存名は結果件数や内部IDで変わらず、長い条件を共通の文字数制限に収める', () => {
  const comparison = buildEnemyThresholdComparison([], [all()], 60, 'MAPS', counts)
  const options = { comparison, countMode: 'MAPS' as const, aspectRatio: 16 / 9 }
  const filename = createEnemyThresholdComparisonImageFilename(options)
  comparison.series[0].count = 999
  comparison.series[0].missingCount = 999
  comparison.series[0].matchedCount = 999
  comparison.series[0].condition.id = 999
  assert.equal(createEnemyThresholdComparisonImageFilename(options), filename)
  comparison.series[0].label = `全敵 · ${'HP≥100-'.repeat(100)}`
  const long = createEnemyThresholdComparisonImageFilename(options)
  assert.ok(new TextEncoder().encode(long).length <= 240)
  assert.match(long, /^敵_術耐性_円グラフ比較_基準値60_登場マップ数_/)
  assert.match(long, /_ほか1項目_比率16x9\.png$/)
})
