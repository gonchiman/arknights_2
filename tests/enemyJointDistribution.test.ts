import test from 'node:test'
import assert from 'node:assert/strict'
import type { EnemyRecord } from '../src/types/enemy.ts'
import { buildEnemyJointDistribution } from '../src/lib/enemyJointDistribution.ts'
import { matchesEnemySearchFilters } from '../src/lib/enemySearchFilters.ts'
import type { EnemyHistogramCounts } from '../src/lib/enemyHistogramCounts.ts'
import { getEnemyJointImageConditions, getEnemyJointImageFilename } from '../src/lib/enemyJointImage.ts'

function enemy(
  id: string,
  hp: number | null,
  resistance: number | null,
  levelType: EnemyRecord['levelType'] = 'NORMAL',
): EnemyRecord {
  return {
    id, index: id, sortId: 0, name: id, levelType, description: '', abilities: [], damageTypes: [],
    attackWay: null, lifePointReduce: null, databaseLevel: 0, databaseLevelCount: 1,
    stageAppearanceCount: null, statusImmunities: [],
    ratings: { endurance: null, attack: null, defense: null, resistance: null },
    stats: {
      maxHp: hp, attack: null, defense: null, magicResistance: resistance, moveSpeed: null,
      attackSpeed: null, baseAttackTime: null, massLevel: null,
    },
  }
}

test('HPは既存評価の境界を含む側に一度だけ集計し、S以上を一つにまとめる', () => {
  const values = [
    [Number.MIN_VALUE, 999.9],
    [1_000, 3_499.9],
    [3_500, 4_999.9],
    [5_000, 7_999.9],
    [8_000, 11_999.9],
    [12_000, 24_999.9],
    [25_000, 99_999.9],
    [100_000, 250_000, 500_000, 500_001, Number.MAX_VALUE],
  ]
  const rows = values.flatMap((group, hpIndex) => group.map((hp, index) => enemy(`${hpIndex}-${index}`, hp, 0)))
  const result = buildEnemyJointDistribution(rows)

  assert.deepEqual(result.hpBins.map(({ label }) => label), ['E', 'D', 'C', 'B', 'B+', 'A', 'A+', 'S以上'])
  assert.deepEqual(result.hpTotals, [2, 2, 2, 2, 2, 2, 2, 5])
  assert.equal(result.count, 19)
  assert.equal(result.missingCount, 0)
  assert.equal(result.maximumCount, 5)
  assert.equal(result.hpBins[0].rangeLabel, '0 超 1,000 未満')
  assert.equal(result.hpBins[7].rangeLabel, '100,000 以上')
  for (let hpIndex = 0; hpIndex < values.length; hpIndex += 1) {
    assert.deepEqual(result.cells[0][hpIndex].enemies.map(({ stats }) => stats.maxHp), values[hpIndex])
    assert.equal(result.cells[0][hpIndex].hpIndex, hpIndex)
    assert.equal(result.cells[0][hpIndex].resistanceIndex, 0)
  }
})

test('術耐性0を独立させ、20刻みの境界・小数・100超を漏らさず集計する', () => {
  const values = [
    [0, -0],
    [Number.MIN_VALUE, 0.5, 1, 19, 19.999],
    [20, 20.5, 39.999],
    [40, 59.999],
    [60, 79.999],
    [80, 99, 99.999],
    [100, 100.5, 120, Number.MAX_VALUE],
  ]
  const rows = values.flatMap((group, resistanceIndex) => group.map((resistance, index) => (
    enemy(`${resistanceIndex}-${index}`, 1_000, resistance)
  )))
  const result = buildEnemyJointDistribution(rows)

  assert.deepEqual(result.resistanceBins.map(({ label }) => label), ['0', '1–19', '20–39', '40–59', '60–79', '80–99', '100以上'])
  assert.deepEqual(result.resistanceTotals, [2, 5, 3, 2, 2, 3, 4])
  assert.equal(result.count, rows.length)
  assert.equal(result.resistanceBins[1].rangeLabel, '0 超 20 未満')
  assert.equal(result.resistanceBins[2].rangeLabel, '20 以上 40 未満')
  assert.equal(result.resistanceBins[6].rangeLabel, '100 以上')
  for (let resistanceIndex = 0; resistanceIndex < values.length; resistanceIndex += 1) {
    assert.deepEqual(result.cells[resistanceIndex][1].enemies.map(({ stats }) => stats.magicResistance), values[resistanceIndex])
    assert.equal(result.cells[resistanceIndex][1].resistanceIndex, resistanceIndex)
    assert.equal(result.cells[resistanceIndex][1].hpIndex, 1)
  }
})

test('HPか術耐性の欠損・非有限値・範囲外は敵単位で除外し、有効な敵だけを割合の分母にする', () => {
  const rows = [
    enemy('one', 500, 0), enemy('two', 999, 0), enemy('three', 100_000, 100),
    ...[null, NaN, Infinity, -Infinity, 0, -1].map((hp, index) => enemy(`hp-${index}`, hp, 20)),
    ...[null, NaN, Infinity, -Infinity, -1].map((resistance, index) => enemy(`res-${index}`, 500, resistance)),
    enemy('both-missing', null, null),
  ]
  const result = buildEnemyJointDistribution(rows)

  assert.equal(result.count, 3)
  assert.equal(result.missingCount, 12)
  assert.equal(result.cells[0][0].count, 2)
  assert.equal(result.cells[0][0].proportion, 2 / 3)
  assert.equal(result.cells[6][7].proportion, 1 / 3)
  assert.equal(result.cells[1][0].proportion, 0)
  assert.equal(result.maximumCount, 2)
  assert.equal(result.hpTotals.reduce((total, value) => total + value, 0), result.count)
  assert.equal(result.resistanceTotals.reduce((total, value) => total + value, 0), result.count)
  assert.equal(result.cells.flat().reduce((total, cell) => total + cell.count, 0), result.count)
  assert.equal(result.cells.flat().reduce((total, cell) => total + cell.proportion, 0), 1)
})

test('同じ敵IDは最初のレコードを採用し、重複や後続の有効値で度数を増やさない', () => {
  const first = enemy('same', 500, 0)
  const rows = [
    first, enemy('same', 100_000, 100), first, enemy('same', null, null),
    enemy('invalid-first', null, 0), enemy('invalid-first', 500, 0),
    enemy('other', 500, 0),
  ]
  const result = buildEnemyJointDistribution(rows)

  assert.equal(result.count, 2)
  assert.equal(result.missingCount, 1)
  assert.equal(result.cells[0][0].count, 2)
  assert.equal(result.cells[6][7].count, 0)
  assert.deepEqual(result.cells[0][0].enemies.map(({ id }) => id), ['same', 'other'])
  assert.equal(result.cells[0][0].enemies[0], first)
})

test('空配列や全欠損でも固定した8×7の階級と有限なゼロの集計を返す', () => {
  for (const rows of [[], [enemy('missing', null, null), enemy('invalid', 0, -1)]]) {
    const result = buildEnemyJointDistribution(rows)

    assert.equal(result.count, 0)
    assert.equal(result.missingCount, rows.length)
    assert.equal(result.maximumCount, 0)
    assert.equal(result.hpBins.length, 8)
    assert.equal(result.resistanceBins.length, 7)
    assert.equal(result.cells.length, 7)
    assert.ok(result.cells.every((row) => row.length === 8))
    assert.deepEqual(result.hpTotals, Array(8).fill(0))
    assert.deepEqual(result.resistanceTotals, Array(7).fill(0))
    assert.ok(result.cells.flat().every((cell) => cell.count === 0 && cell.proportion === 0 && cell.enemies.length === 0))
  }
})

test('区分・検索・評価で絞り込んだ敵だけを集計し、固定区間と元データを保持する', () => {
  const rows = [
    enemy('兵士A', 1_500, 0), enemy('兵士B', 2_000, 20),
    enemy('兵士C', 2_000, 20, 'ELITE'), enemy('別名', 2_000, 20),
    enemy('兵士D', 50_000, 20),
  ]
  const original = structuredClone(rows)
  const all = buildEnemyJointDistribution(rows)
  const filtered = rows.filter((row) => matchesEnemySearchFilters(row, {
    query: '兵士', levelType: 'NORMAL', hpRatings: ['D'], resistanceRatings: [],
  }))
  const result = buildEnemyJointDistribution(filtered)

  assert.equal(result.count, 2)
  assert.equal(result.cells[0][1].proportion, 0.5)
  assert.equal(result.cells[2][1].proportion, 0.5)
  assert.deepEqual(result.cells.flatMap((row) => row.flatMap((cell) => cell.enemies.map(({ id }) => id))).sort(), ['兵士A', '兵士B'])
  assert.deepEqual(result.hpBins, all.hpBins)
  assert.deepEqual(result.resistanceBins, all.resistanceBins)
  assert.deepEqual(rows, original)
})

test('入力配列と敵を変更せず、呼び出しごとのセルに前回の集計を残さない', () => {
  const row = enemy('frozen', 12_000, 40)
  Object.freeze(row.stats)
  Object.freeze(row)
  const rows = Object.freeze([row])
  const first = buildEnemyJointDistribution(rows)
  const second = buildEnemyJointDistribution(rows)
  const empty = buildEnemyJointDistribution([])

  assert.deepEqual(first, second)
  assert.notEqual(first.cells, second.cells)
  assert.notEqual(first.cells[3][5].enemies, second.cells[3][5].enemies)
  assert.equal(first.cells[3][5].enemies[0], row)
  assert.equal(first.cells[3][5].count, 1)
  assert.equal(empty.cells[3][5].count, 0)
})

const counts: EnemyHistogramCounts = {
  schemaVersion: 1, generatedAt: '2026-09-27', sourceGeneratedAt: '2026-08-31',
  summary: { mapCount: 100, missingMapCount: 10, spawnMapCount: 80, spawnExcludedMapCount: 20 },
  enemies: {
    one: { mapCount: 3, spawnCount: 10 }, two: { mapCount: 4, spawnCount: 20 },
    three: { mapCount: 2, spawnCount: 70 }, missing: { mapCount: 5, spawnCount: 50 },
    zero: { mapCount: 0, spawnCount: 0 },
  },
}

test('同じ区間の敵ごとの登場マップ数を合計し、敵一覧を件数分に増やさない', () => {
  const rows = [enemy('one', 500, 0), enemy('two', 800, 0), enemy('three', 20_000, 40)]
  const result = buildEnemyJointDistribution([...rows, rows[0]], 'MAPS', counts)
  assert.equal(result.countMode, 'MAPS')
  assert.equal(result.count, 9)
  assert.equal(result.maximumCount, 7)
  assert.equal(result.cells[0][0].count, 7)
  assert.equal(result.cells[0][0].proportion, 7 / 9)
  assert.deepEqual({ ...result.cells[0][0].enemyCounts }, { one: 3, two: 4 })
  assert.deepEqual(result.cells[0][0].enemies, rows.slice(0, 2))
  assert.equal(result.hpTotals[0], 7)
  assert.equal(result.resistanceTotals[3], 2)
  assert.equal(result.cells.flat().reduce((total, cell) => total + cell.count, 0), 9)
})

test('出現回数で割合と周辺合計を計算し、欠損値の除外数にも同じ重みを適用する', () => {
  const rows = [enemy('one', 500, 0), enemy('two', 800, 0), enemy('three', 20_000, 40),
    enemy('missing', null, 0), enemy('zero', null, null), enemy('no-source', 500, 0)]
  const result = buildEnemyJointDistribution(rows, 'SPAWNS', counts)
  assert.equal(result.countMode, 'SPAWNS')
  assert.equal(result.count, 100)
  assert.equal(result.missingCount, 50)
  assert.equal(result.maximumCount, 70)
  assert.equal(result.cells[0][0].count, 30)
  assert.equal(result.cells[0][0].proportion, 0.3)
  assert.equal(result.cells[3][5].proportion, 0.7)
  assert.equal(result.hpTotals.reduce((sum, value) => sum + value, 0), 100)
  assert.equal(result.resistanceTotals.reduce((sum, value) => sum + value, 0), 100)
  assert.equal(result.cells.flat().flatMap((cell) => cell.enemies).length, 3)
  assert.equal(buildEnemyJointDistribution(rows.filter(({ id }) => id === 'two'), 'SPAWNS', counts).count, 20)
})

test('登場データ未取得時は加重モードをゼロ件とし、種類数は登場データに依存しない', () => {
  const rows = [enemy('one', 500, 0), enemy('missing', null, null)]
  for (const mode of ['MAPS', 'SPAWNS'] as const) {
    const result = buildEnemyJointDistribution(rows, mode)
    assert.equal(result.count, 0)
    assert.equal(result.missingCount, 0)
    assert.equal(result.maximumCount, 0)
    assert.ok(result.cells.flat().every((cell) => cell.enemies.length === 0 && cell.proportion === 0))
  }
  assert.deepEqual(buildEnemyJointDistribution(rows), buildEnemyJointDistribution(rows, 'TYPES', counts))
  assert.equal(buildEnemyJointDistribution(rows).count, 1)
  assert.equal(buildEnemyJointDistribution(rows).missingCount, 1)
})

test('画像の説明・名前は集計方法と表示する対象マップ数を反映し、無関係な集計値を無視する', async () => {
  const rows = [enemy('one', 500, 0), enemy('missing', null, null)]
  const types = buildEnemyJointDistribution(rows)
  const maps = buildEnemyJointDistribution(rows, 'MAPS', counts)
  const spawns = buildEnemyJointDistribution(rows, 'SPAWNS', counts)
  const coverage = counts.summary
  assert.equal(getEnemyJointImageConditions(types, '全敵', coverage), '全敵 · 1種類 · 値なし等 1種類を除外')
  assert.equal(getEnemyJointImageConditions(maps, '全敵', coverage), '全敵 · 3件 · 値なし等 5件を除外 · 収録 100マップ')
  assert.equal(getEnemyJointImageConditions(spawns, '全敵', coverage), '全敵 · 10体 · 値なし等 50体を除外 · 出現数確定 80マップ')
  const original = await getEnemyJointImageFilename(maps, '全敵', coverage)
  assert.equal(await getEnemyJointImageFilename(maps, '全敵', coverage, 'LINEAR'), original)
  const sqrtName = await getEnemyJointImageFilename(maps, '全敵', coverage, 'SQRT')
  assert.notEqual(sqrtName, original)
  assert.equal(await getEnemyJointImageFilename(maps, '全敵', { ...coverage, spawnMapCount: 1 }, 'SQRT'), sqrtName)
  assert.notEqual(await getEnemyJointImageFilename(maps, '通常敵', coverage, 'SQRT'), sqrtName)
  assert.equal(await getEnemyJointImageFilename(maps, '全敵', { ...coverage, spawnMapCount: 1, missingMapCount: 20 }), original)
  assert.notEqual(await getEnemyJointImageFilename(maps, '全敵', { ...coverage, mapCount: 101 }), original)
  assert.notEqual(await getEnemyJointImageFilename({ ...maps, countMode: 'SPAWNS' }, '全敵', coverage), original)
  assert.equal(await getEnemyJointImageFilename(types, '全敵', coverage), await getEnemyJointImageFilename(types, '全敵'))
  const spawnName = await getEnemyJointImageFilename(spawns, '全敵', coverage)
  assert.equal(await getEnemyJointImageFilename(spawns, '全敵', { ...coverage, mapCount: 900 }), spawnName)
  assert.notEqual(await getEnemyJointImageFilename(spawns, '全敵', { ...coverage, spawnMapCount: 81 }), spawnName)
})
