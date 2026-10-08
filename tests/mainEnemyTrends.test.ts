import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { aggregateMainEnemyChapters, aggregateMainEnemyMaps, getMainEnemyCoverage, parseMainEnemyTrends,
  type MainEnemyMap, type MainEnemyObservation, type MainEnemyTrendsData } from '../src/lib/mainEnemyTrends.ts'

const enemy = (enemyId: string, count: number, hp: number, extra: Partial<MainEnemyObservation> = {}): MainEnemyObservation =>
  ({ enemyId, name: enemyId, level: 0, type: 'normal', count, hp, attack: 20, defense: 10, resistance: 0, ...extra })
const map = (order: number, enemies: MainEnemyObservation[], extra: Partial<MainEnemyMap> = {}): MainEnemyMap => ({
  levelId: `obt/main/level_main_00-0${order}`, stageId: `main_00-0${order}`, chapter: 0, order,
  code: `0-${order}`, name: `ステージ${order}`, status: 'included', reasons: [],
  enemies, enemyCount: enemies.reduce((sum, enemy) => sum + enemy.count, 0), excludedUnitCount: 0, ...extra,
})
function dataset(maps: MainEnemyMap[]): MainEnemyTrendsData {
  const coverage = getMainEnemyCoverage(maps)
  const totals = { enemyCount: maps.reduce((sum, map) => sum + map.enemyCount, 0),
    excludedUnitCount: maps.reduce((sum, map) => sum + map.excludedUnitCount, 0) }
  return { schemaVersion: 1, generatedAt: '2026-10-08T00:00:00Z', sourceGeneratedAt: null,
    source: { region: 'jp', scope: 'main-standard-fixed-direct-spawns', chapterRange: [0, 0] },
    summary: { ...coverage, ...totals }, chapters: [{ chapter: 0, name: '序章', ...coverage, ...totals }],
    maps, diagnostics: { excludedUnits: [] } }
}

test('章平均はマップ平均の平均でなく敵の出現数で集計し、指標ごとの欠測を保持する', () => {
  const data = dataset([map(1, [enemy('a', 9, 100, { defense: null })]), map(2, [enemy('b', 1, 1000, { defense: 20 })])])
  const [chapter] = aggregateMainEnemyChapters(data)
  assert.equal(chapter.stats.hp.mean, 190)
  assert.equal(chapter.stats.hp.median, 100)
  assert.equal(chapter.stats.defense.mean, 20)
  assert.equal(chapter.stats.defense.missingCount, 9)
  assert.equal(chapter.stats.defense.count, 1)
  assert.equal(chapter.stats.resistance.mean, 0)
  assert.equal(chapter.enemyCount, 10)
})

test('種類数は同じ敵の反復をまとめるが指定levelとステージ固有ステータスの違いを保持する', () => {
  const data = dataset([
    map(1, [enemy('a', 100, 100)]), map(2, [enemy('a', 1, 100)]),
    map(3, [enemy('a', 1, 100, { level: 1 })]), map(4, [enemy('a', 1, 400)]),
  ])
  const [row] = aggregateMainEnemyChapters(data, { weighting: 'types' })
  assert.equal(row.typeCount, 3)
  assert.equal(row.stats.hp.count, 3)
  assert.equal(row.stats.hp.mean, 200)
  assert.equal(row.enemyCount, 103)
  assert.equal(row.matchedMapCount, 4)
})

test('通常+エリートはボスと未分類を除くが攻撃力0の正規支援敵は含める', () => {
  const data = dataset([map(1, [enemy('normal', 4, 100), enemy('chalice', 2, 100000, { type: 'elite', attack: 0 }),
    enemy('boss', 1, 20000, { type: 'boss' }), enemy('unknown', 3, 300, { type: 'unknown' })])])
  assert.equal(aggregateMainEnemyChapters(data, { kind: 'combat' })[0].enemyCount, 6)
  assert.equal(aggregateMainEnemyChapters(data, { kind: 'combat' })[0].stats.hp.maximum, 100000)
  assert.equal(aggregateMainEnemyChapters(data, { kind: 'normal' })[0].enemyCount, 4)
  assert.equal(aggregateMainEnemyChapters(data, { kind: 'boss' })[0].enemyCount, 1)
  assert.equal(aggregateMainEnemyChapters(data, { kind: 'all' })[0].enemyCount, 10)
})

test('対象外ステージとフィルター後に敵がいないステージは0値に置換せず、カバー率を保つ', () => {
  const data = dataset([map(3, [], { status: 'excluded', reasons: ['branch-spawn'] }),
    map(1, [enemy('boss', 1, 500, { type: 'boss' })]), map(2, [], { status: 'missing', reasons: ['missing-level'] })])
  const rows = aggregateMainEnemyMaps(data, 0, { kind: 'normal' })
  assert.deepEqual(rows.map((row) => row.label), ['0-1', '0-2', '0-3'])
  assert.ok(rows.every((row) => row.stats.hp.mean === null && row.stats.hp.median === null))
  const [chapter] = aggregateMainEnemyChapters(data, { kind: 'normal' })
  assert.equal(chapter.includedMapCount, 1)
  assert.equal(chapter.eligibleMapCount, 3)
  assert.equal(chapter.matchedMapCount, 0)
})

test('一部集計の固定敵も章平均とボス集計に含め、カバー率で一部集計数を保持する', () => {
  const data = dataset([
    map(1, [enemy('normal', 3, 100)]),
    map(2, [enemy('boss', 1, 1000, { type: 'boss' })], { status: 'partial', reasons: ['branch-spawn'] }),
    map(3, [], { status: 'excluded', reasons: ['enemy-replacement'] }),
  ])
  assert.equal(parseMainEnemyTrends(data).summary.partialMapCount, 1)
  const [chapter] = aggregateMainEnemyChapters(data)
  assert.equal(chapter.stats.hp.mean, 325)
  assert.equal(chapter.includedMapCount, 2)
  assert.equal(chapter.partialMapCount, 1)
  assert.equal(chapter.eligibleMapCount, 3)
  const boss = aggregateMainEnemyChapters(data, { kind: 'boss' })[0]
  assert.equal(boss.stats.hp.mean, 1000)
  assert.equal(boss.enemyCount, 1)
  assert.equal(aggregateMainEnemyMaps(data, 0)[1].status, 'partial')
})

test('読み込みは集計値の不一致・対象外の架空敵数・非有限値・重複マップを拒否する', () => {
  const valid = dataset([map(1, [enemy('a', 2, 100)])])
  assert.equal(parseMainEnemyTrends(valid).summary.enemyCount, 2)
  for (const mutate of [
    (data: MainEnemyTrendsData) => { data.summary.enemyCount = 3 },
    (data: MainEnemyTrendsData) => { data.maps[0].status = 'excluded' },
    (data: MainEnemyTrendsData) => { data.maps[0].enemies[0].hp = Number.POSITIVE_INFINITY },
    (data: MainEnemyTrendsData) => { data.maps.push(data.maps[0]) },
  ]) {
    const data = structuredClone(valid)
    mutate(data)
    assert.throws(() => parseMainEnemyTrends(data), /形式/)
  }
})

test('一部集計は理由と固定敵が必須で、章・全体の一部集計件数が一致しないデータを拒否する', () => {
  const valid = dataset([map(1, [enemy('a', 2, 100)], { status: 'partial', reasons: ['branch-spawn'] })])
  assert.equal(parseMainEnemyTrends(valid).summary.includedMapCount, 1)
  for (const mutate of [
    (data: MainEnemyTrendsData) => { data.maps[0].reasons = [] },
    (data: MainEnemyTrendsData) => { data.maps[0].reasons = [''] },
    (data: MainEnemyTrendsData) => { data.maps[0].reasons = ['branch-spawn', 'branch-spawn'] },
    (data: MainEnemyTrendsData) => { data.maps[0].enemies = []; data.maps[0].enemyCount = 0 },
    (data: MainEnemyTrendsData) => { data.maps[0].status = 'included' },
    (data: MainEnemyTrendsData) => { data.summary.partialMapCount = 0 },
    (data: MainEnemyTrendsData) => { data.chapters[0].partialMapCount = 0 },
    (data: MainEnemyTrendsData) => { data.summary.partialMapCount = 2 },
  ]) {
    const data = structuredClone(valid)
    mutate(data)
    assert.throws(() => parseMainEnemyTrends(data), /形式/)
  }
})

test('生成済みJPデータのカバー率と欠測の監査結果を維持する', () => {
  const data = parseMainEnemyTrends(JSON.parse(readFileSync(new URL('../public/data/maps/main-enemy-trends.json', import.meta.url), 'utf8')))
  assert.deepEqual(data.summary, { eligibleMapCount: 251, includedMapCount: 246, partialMapCount: 44, excludedMapCount: 5,
    missingMapCount: 0, enemyCount: 10559, excludedUnitCount: 510 })
  const complete = data.maps.filter((map) => map.status === 'included')
  assert.equal(complete.length, 202)
  assert.equal(complete.reduce((sum, map) => sum + map.enemyCount, 0), 9210)
  const chapters = aggregateMainEnemyChapters(data)
  assert.equal(chapters.length, 17)
  assert.equal(chapters[11].stats.defense.missingCount, 137)
  assert.equal(aggregateMainEnemyChapters({ ...data, maps: complete })[11].stats.defense.missingCount, 103)
  assert.equal(chapters[14].stats.resistance.missingCount, 64)
  const crown = data.maps.find((map) => map.code === '4-4')?.enemies.find((enemy) => enemy.enemyId === 'enemy_1502_crowns')
  assert.equal(crown?.hp, 23000)
  assert.equal(data.maps.find((map) => map.code === '14-22')?.status, 'excluded')
  assert.ok(data.maps.flatMap((map) => map.enemies).some((enemy) => enemy.enemyId === 'enemy_1430_lrrook_2' && enemy.hp === 125000))
  for (const [code, id, chapter] of [['12-20', 'enemy_1542_wdslm', 12], ['13-21', 'enemy_1547_blord', 13]] as const) {
    const bossMap = data.maps.find((map) => map.code === code)
    assert.equal(bossMap?.status, 'partial')
    assert.deepEqual(bossMap?.enemies.filter((enemy) => enemy.type === 'boss').map((enemy) => [enemy.enemyId, enemy.count]), [[id, 1]])
    const bosses = aggregateMainEnemyChapters(data, { kind: 'boss' })[chapter]
    assert.equal(bosses.enemyCount, 1)
    assert.equal(bosses.stats.hp.count, 1)
    assert.ok(bosses.stats.hp.mean !== null && bosses.stats.hp.mean > 0)
    assert.equal(bosses.partialMapCount > 0, true)
  }
})
