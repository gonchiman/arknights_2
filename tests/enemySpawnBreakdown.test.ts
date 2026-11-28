import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { buildEnemySpawnPopulation } from '../src/lib/damageThreeEnemySpawnAdvantage.ts'
import { createEnemyAggregationClient, getEnemyMainStoryScope } from '../src/lib/enemyAggregationData.ts'
import { buildEnemySpawnBreakdown } from '../src/lib/enemySpawnBreakdown.ts'
import type { EnemyHistogramCounts } from '../src/lib/enemyHistogramCounts.ts'
import { loadMainStorySpawnLists, loadMainStorySpawnStages } from '../src/lib/mainStoryEnemySpawns.ts'
import type { EnemyRecord } from '../src/types/enemy.ts'

test('集計範囲の重みを保ち、同名の敵・有効な0・欠測を区別する', () => {
  const rows = [
    { id: 'a', name: '同名', stats: { defense: 0, magicResistance: 0 } },
    { id: 'b', name: '同名', stats: { defense: 0, magicResistance: 0 } },
    { id: 'c', name: '別名', stats: { defense: 100, magicResistance: 5 } },
    { id: 'd', name: '不明', stats: { defense: 0, magicResistance: null } },
  ] as EnemyRecord[]
  const counts = { enemies: { a: { spawnCount: 3 }, b: { spawnCount: 0.5 }, c: { spawnCount: 2 },
    d: { spawnCount: 7 } } } as EnemyHistogramCounts
  const byPair = buildEnemySpawnBreakdown(rows, counts, { view: 'pairs' })
  assert.deepEqual(byPair.rows.map(({ key, count }) => [key, count]), [['[0,0]', 3.5], ['[100,5]', 2]])
  assert.equal(byPair.missingCount, 7)
  const byEnemy = buildEnemySpawnBreakdown(rows, counts, { view: 'enemies', pairKey: '[0,0]' })
  assert.deepEqual(byEnemy.rows.map(({ key, count, share }) => [key, count, share]),
    [['a', 3, 3 / 3.5], ['b', 0.5, 0.5 / 3.5]])
  assert.notEqual(byEnemy.rows[0].label, byEnemy.rows[1].label)
  assert.equal(byEnemy.total, 3.5)
  assert.deepEqual(buildEnemySpawnBreakdown(rows, counts, { view: 'enemies', pairKey: '[1,1]' }).rows, [])
})

test('v12の11,409回を組別・敵別・章別から再現し、章と組で絞り込める', async t => {
  const fetchFromArchive = async (path: RequestInfo | URL) => {
    const { pathname } = new URL(String(path), 'http://localhost')
    return new Response(await readFile(new URL('../public' + pathname, import.meta.url)))
  }
  t.mock.method(globalThis, 'fetch', fetchFromArchive)
  const client = createEnemyAggregationClient({ fetch: fetchFromArchive })
  const version = (await client.loadIndex()).versions.find(entry => entry.id === 'v12')!
  const { rows, counts } = getEnemyMainStoryScope(await client.loadVersion(version))
  const population = buildEnemySpawnPopulation(rows, counts)
  const chapterLists = await loadMainStorySpawnLists(await loadMainStorySpawnStages())
  const pairs = buildEnemySpawnBreakdown(rows, counts, { view: 'pairs' })
  const enemies = buildEnemySpawnBreakdown(rows, counts, { view: 'enemies' })
  const chapters = buildEnemySpawnBreakdown(rows, counts, { view: 'chapters', chapterLists })
  for (const result of [pairs, enemies, chapters]) {
    assert.equal(result.total, population.spawnCount)
    assert.equal(result.total, 11409)
    assert.equal(result.rows.reduce((sum, row) => sum + row.count, 0), result.total)
    assert.equal(result.missingCount, 201)
  }
  assert.deepEqual([pairs.rows.length, enemies.rows.length, chapters.rows.length], [136, 272, 18])
  const perEnemyCount = new Map<string, number>()
  for (const row of chapters.rows) {
    const inChapter = buildEnemySpawnBreakdown(rows, counts, { view: 'enemies', chapter: Number(row.key), chapterLists })
    assert.equal(inChapter.total, row.count)
    for (const { key, count } of inChapter.rows) perEnemyCount.set(key, (perEnemyCount.get(key) ?? 0) + count)
  }
  assert.deepEqual(perEnemyCount, new Map(enemies.rows.map(({ key, count }) => [key, count])))
  assert.deepEqual(chapters.rows[0], { key: '14', label: '第14章', count: 932, share: 932 / 11409 })
  assert.equal(pairs.rows[0].key, '[0,0]')
  assert.equal(pairs.rows[0].count, 901)
  const byEnemy = buildEnemySpawnBreakdown(rows, counts, { view: 'enemies', pairKey: '[0,0]' })
  assert.equal(byEnemy.total, 901)
  assert.deepEqual(byEnemy.rows.slice(0, 3).map(({ count }) => count), [245, 214, 150])
  const inChapter = buildEnemySpawnBreakdown(rows, counts, { view: 'enemies', chapter: 0, chapterLists, pairKey: '[0,0]' })
  assert.equal(inChapter.rows.find(row => row.label === 'オリジムシ')?.count, 185)
})
