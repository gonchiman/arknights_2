import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { buildEnemyRecords } from '../src/lib/enemyData.ts'
import { buildMainStorySpawnList, findMainStorySpawnJump, getMainStorySpawnChapterRows, getMainStorySpawnRows, getMainStorySpawnStages, loadMainStorySpawnLists, loadMainStorySpawnStages } from '../src/lib/mainStoryEnemySpawns.ts'
import { getMapDetail, parseMapDetailShard, parseMapIndex } from '../src/lib/mapDatabase.ts'
import type { MapDetailShard } from '../src/types/map.ts'

const dataDirectory = new URL('../public/data/maps/', import.meta.url)
const readData = (filename: string): unknown => JSON.parse(readFileSync(new URL(filename, dataDirectory), 'utf8'))
const index = parseMapIndex(readData('index.json'))
const stages = getMainStorySpawnStages(index)
const shards = new Map<string, MapDetailShard>()

function fixture(code: string) {
  const stage = stages.find(candidate => candidate.code === code)
  assert.ok(stage, code)
  const map = index.maps.find(candidate => candidate.levelId === stage.id)
  assert.ok(map?.detailFile, code)
  const shard = shards.get(map.detailFile) ?? parseMapDetailShard(readData(map.detailFile))
  shards.set(map.detailFile, shard)
  return { stage, map, detail: getMapDetail(shard, map) }
}

function listFor(code: string) {
  const { stage, map, detail } = fixture(code)
  return buildMainStorySpawnList(stage, map, detail, index.enemies)
}

test('通常環境の0-1では同じ敵の出現も独立した1体行になり、ページをまたいで行の識別子を維持する', () => {
  const list = listFor('0-1')
  assert.equal(list.status, 'confirmed')
  const units = getMainStorySpawnRows([list], '', 'units')
  assert.equal(units.confirmedCount, 11)
  assert.equal(units.rowCount, 11)
  assert.equal(units.rows.length, 11)
  assert.equal(units.rows.filter(row => row.enemyName === 'オリジムシ').length, 10)
  assert.equal(units.rows.filter(row => row.enemyName === '兵士').length, 1)
  assert.ok(units.rows.every(row => row.count === 1 && row.stage.code === '0-1'))
  const keys = units.rows.map(row => row.key)
  assert.equal(new Set(keys).size, 11)

  const page = getMainStorySpawnRows([list], '', 'units', 3, 4)
  assert.equal(page.confirmedCount, 11)
  assert.equal(page.rowCount, 11)
  assert.deepEqual(page.rows.map(row => row.key), keys.slice(3, 7))
})

test('体数表示ではステージごとに同じ敵の出現を合計する', () => {
  const first = listFor('0-1')
  const second = listFor('1-7')
  assert.equal(second.status, 'confirmed')
  const counts = getMainStorySpawnRows([first, second], '', 'counts')
  assert.equal(counts.confirmedCount, 52)
  assert.equal(counts.rowCount, 8)
  assert.deepEqual(
    Object.fromEntries(counts.rows.filter(row => row.stage.code === '1-7').map(row => [row.enemyName, row.count])),
    { オリジムシα: 23, 兵士: 7, 暴徒: 4, 火炎瓶暴徒: 4, 流れ者: 2, 機動盾兵: 1 },
  )

  const filtered = getMainStorySpawnRows([first, second], '兵士', 'counts')
  assert.equal(filtered.confirmedCount, 8)
  assert.equal(filtered.rowCount, 2)
  assert.deepEqual(filtered.rows.map(row => [row.stage.code, row.count]), [['0-1', 1], ['1-7', 7]])
})

test('分岐が未確定な11-7では判定済みの50体を表示し、ステージ全体は未確定とする', () => {
  const list = listFor('11-7')
  assert.equal(list.status, 'unconfirmed')
  const units = getMainStorySpawnRows([list], '', 'units')
  assert.equal(units.confirmedCount, 50)
  assert.equal(units.rowCount, 50)
})

test('章別の敵名検索で出現グループを合算し、対象ステージや0回の章を残す', () => {
  const [first, second, partial] = [listFor('0-1'), listFor('1-7'), listFor('11-7')]
  const noData = { stage: fixture('0-2').stage, status: 'unavailable' as const, groups: [] }
  const lists = [partial, second, first, noData]
  const rows = getMainStorySpawnChapterRows(lists, ' ｵﾘｼﾞﾑｼ ')
  assert.deepEqual(rows, [
    { chapter: 0, count: 10, stageCount: 2, partialStageCount: 1 },
    { chapter: 1, count: 23, stageCount: 1, partialStageCount: 0 },
    { chapter: 11, count: 0, stageCount: 1, partialStageCount: 1 },
  ])
  assert.equal(rows.reduce((sum, row) => sum + row.count, 0), getMainStorySpawnRows(lists, ' ｵﾘｼﾞﾑｼ ', 'counts').confirmedCount)
  assert.deepEqual(getMainStorySpawnChapterRows(lists, '該当なし'), [])
  assert.deepEqual(getMainStorySpawnChapterRows([noData], '  '), [{ chapter: 0, count: 0, stageCount: 1, partialStageCount: 1 }])

  const tied = [{ ...first, stage: { ...first.stage, chapter: 9 } }, second, first]
  assert.deepEqual(getMainStorySpawnChapterRows(tied, '', { key: 'count', direction: 'desc' }).map(row => row.chapter), [1, 0, 9])
  assert.deepEqual(getMainStorySpawnChapterRows(tied, '', { key: 'count', direction: 'asc' }).map(row => row.chapter), [0, 9, 1])
  assert.deepEqual(getMainStorySpawnChapterRows(tied, '', { key: 'chapter', direction: 'desc' }).map(row => row.chapter), [9, 1, 0])
})

test('12-7の出現ユニットから民間人を除いて敵の30体を表示する', () => {
  const list = listFor('12-7')
  assert.equal(list.status, 'confirmed')
  const units = getMainStorySpawnRows([list], '', 'units')
  assert.equal(units.confirmedCount, 30)
  assert.equal(units.rowCount, 30)
  assert.ok(units.rows.every(row => row.enemyName !== 'ノーポート民間人'))
})

test('ステージの詳細が未取得の場合は出現一覧を未取得とする', () => {
  const { stage, map } = fixture('0-1')
  const list = buildMainStorySpawnList(stage, map, null, index.enemies)
  assert.equal(list.status, 'unavailable')
  assert.deepEqual(getMainStorySpawnRows([list], '', 'units'), { rows: [], confirmedCount: 0, rowCount: 0, rankedRowCount: 0 })
})

test('未確定ステージでは置換後の敵と検証済み分岐を表示し、条件未確定と無効の出現を除く', () => {
  const { stage, map, detail } = fixture('0-1')
  const wave = detail.waves?.[0]
  const fragment = wave?.fragments[0]
  const spawn = detail.waves?.flatMap(item => item.fragments.flatMap(part => part.actions))
    .find(action => action.actionType === 'SPAWN' && action.key === 'enemy_1007_slime')
  assert.ok(wave && fragment && spawn?.resolution)

  const branch = {
    branchId: 'test-branch', phaseIndex: 0, actionIndex: 0,
    enemyId: 'enemy_1007_slime', count: 2,
    ruleId: 'test-rule', condition: '検証済み', evidence: ['固定分岐'],
  }
  const testcaseMap = {
    ...map, status: 'excluded' as const, spawnCount: null, reasons: ['branch-spawn'],
    countedBranchSpawns: [branch],
  }
  const testcaseDetail = {
    ...detail,
    enemies: detail.enemies.map(enemy => ({ ...enemy, count: null })),
    waves: [{ ...wave, fragments: [{ ...fragment, actions: [
      { ...spawn, count: 3, resolution: { ...spawn.resolution, resolvedEnemyId: 'enemy_1002_nsabr', resolvedCount: 1 } },
      { ...spawn, resolution: { ...spawn.resolution, status: 'excluded' as const, resolvedCount: 0 } },
      { ...spawn, resolution: { ...spawn.resolution, status: 'conditional' as const, resolvedCount: null } },
    ] }] }],
  }
  const stats = new Map([['enemy_1002_nsabr', { hp: 100, attack: 20, defense: 5, resistance: 0 }]])
  const list = buildMainStorySpawnList(stage, testcaseMap, testcaseDetail, index.enemies, stats)
  assert.equal(list.status, 'unconfirmed')
  const units = getMainStorySpawnRows([list], '', 'units')
  assert.equal(units.confirmedCount, 3)
  assert.deepEqual(units.rows.map(row => row.enemyName), ['兵士', 'オリジムシ', 'オリジムシ'])
  assert.deepEqual(units.rows[0].stats, stats.get('enemy_1002_nsabr'))
  assert.ok(units.rows.slice(1).every(row => row.time === null))
})

test('全章の出現体数と術耐性順位を集計版v12に揃え、同値の順位から先頭行に移動する', async context => {
  const archiveDirectory = new URL('../public/data/enemy-aggregation/', import.meta.url)
  const archive = JSON.parse(gunzipSync(readFileSync(new URL('v12.json.gz', archiveDirectory))).toString('utf8'))
  const archivedIndex = parseMapIndex(archive.files['maps/index.json'])
  const archivedStages = new Map(archivedIndex.maps.map(map => [map.levelId, map]))
  const archivedEnemies = new Set(buildEnemyRecords(archive.files['runtime/enemy_handbook_table.json'],
    archive.files['runtime/enemy_database.json'], archive.files['enemy-stage-appearances.json']).map(enemy => enemy.id))
  const archivedCounts = archive.files['enemy-histogram-counts.json'].mainStory.enemies as Record<string, { spawnCount: number }>
  context.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
    const { pathname } = new URL(String(url), 'http://localhost')
    assert.equal(pathname, '/data/enemy-aggregation/v12-main-story-spawns.json')
    return new Response(readFileSync(new URL('v12-main-story-spawns.json', archiveDirectory), 'utf8'))
  })

  const stages = await loadMainStorySpawnStages()
  assert.equal(stages.length, 268)
  assert.deepEqual(stages, getMainStorySpawnStages(archivedIndex))
  assert.ok(stages.some(stage => stage.code === '17-2'))

  const lists = await loadMainStorySpawnLists(stages)
  const chapterRows = getMainStorySpawnChapterRows(lists, '')
  assert.deepEqual(chapterRows.map(row => row.chapter), Array.from({ length: 18 }, (_, i) => i))
  assert.deepEqual(chapterRows.map(row => row.count), [
    323, 531, 473, 502, 491, 598, 692, 818, 844, 762, 627, 716, 638, 517, 996, 784, 705, 593,
  ])
  assert.equal(chapterRows.reduce((sum, row) => sum + row.stageCount, 0), 268)
  assert.equal(chapterRows.reduce((sum, row) => sum + row.partialStageCount, 0), 35)
  const appearances = new Map<string, number>()
  for (const { stage, status, groups } of lists) {
    const archived = archivedStages.get(stage.id)
    assert.ok(archived, stage.code)
    if (archived.enemyIds.every(id => archivedEnemies.has(id))) {
      assert.equal(groups.reduce((total, group) => total + group.count, 0),
        archived.spawnCount ?? archived.spawnAggregation?.count, stage.code)
    }
    assert.equal(status, archived.spawnAggregation?.kind === 'lower-bound' ? 'unconfirmed' : 'confirmed', stage.code)
    for (const group of groups) {
      appearances.set(group.enemyId, (appearances.get(group.enemyId) ?? 0) + group.count)
    }
  }
  assert.deepEqual(appearances, new Map(
    Object.entries(archivedCounts).filter(([id, row]) => row.spawnCount > 0 && archivedEnemies.has(id))
      .map(([id, row]) => [id, row.spawnCount]),
  ))

  const sort = { key: 'resistance', direction: 'desc' } as const
  const ranked = getMainStorySpawnRows(lists, '', 'units', 0, Infinity, sort)
  assert.equal(ranked.confirmedCount, 11_610)
  assert.equal(ranked.rankedRowCount, 11_409)
  const higher = ranked.rows[420].stats.resistance
  const lower = ranked.rows[1857].stats.resistance
  assert.ok(higher !== null && higher > 50)
  assert.ok(ranked.rows.slice(421, 1857).every(row => row.stats.resistance === 50 && row.rank === 422))
  assert.ok(lower !== null && lower < 50)

  assert.deepEqual(findMainStorySpawnJump(lists, '', 'units', sort, { kind: 'rank', value: 1857 }), {
    offset: 421, key: ranked.rows[421].key, rank: 422, value: 50,
  })
})

test('体数での並べ替えは全ステージを対象にしてからページを切り出す', () => {
  const lists = [listFor('0-1'), listFor('1-7')]
  const result = getMainStorySpawnRows(lists, '', 'counts', 1, 2, { key: 'count', direction: 'desc' })
  assert.equal(result.confirmedCount, 52)
  assert.equal(result.rowCount, 8)
  assert.deepEqual(result.rows.map(row => [row.stage.code, row.enemyName, row.count]), [
    ['0-1', 'オリジムシ', 10],
    ['1-7', '兵士', 7],
  ])
})

test('ステージの並べ替えは番号順で、表示中の敵名検索を保つ', () => {
  const lists = [listFor('0-11'), listFor('0-2'), listFor('0-1')]
  const ascending = getMainStorySpawnRows(lists, '兵士', 'counts', 0, Infinity, { key: 'stage', direction: 'asc' })
  const descending = getMainStorySpawnRows(lists, '兵士', 'counts', 0, Infinity, { key: 'stage', direction: 'desc' })
  assert.deepEqual(ascending.rows.map(row => row.stage.code), ['0-1', '0-2', '0-11'])
  assert.deepEqual(descending.rows.map(row => row.stage.code), ['0-11', '0-2', '0-1'])
})

test('ステータスの並べ替えでは昇順・降順ともに欠測を末尾に置き、0を数値として扱う', () => {
  const { stage, map, detail } = fixture('0-1')
  const stats = new Map([
    ['enemy_1002_nsabr', { hp: 0, attack: null, defense: null, resistance: null }],
    ['enemy_1007_slime', { hp: 550, attack: null, defense: null, resistance: null }],
  ])
  const first = buildMainStorySpawnList(stage, map, detail, index.enemies, stats)
  const lists = [listFor('1-7'), first]
  const ascending = getMainStorySpawnRows(lists, '', 'counts', 0, Infinity, { key: 'hp', direction: 'asc' })
  const descending = getMainStorySpawnRows(lists, '', 'counts', 0, Infinity, { key: 'hp', direction: 'desc' })
  const unknown = Array.from({ length: 6 }, () => null)
  assert.deepEqual(ascending.rows.map(row => row.stats.hp), [0, 550, ...unknown])
  assert.deepEqual(descending.rows.map(row => row.stats.hp), [550, 0, ...unknown])
})

test('ウェーブと区間をまとめて並べ替え、同じ区間内では出現順を保つ', () => {
  const list = listFor('0-2')
  const original = getMainStorySpawnRows([list], '', 'units')
  const sorted = getMainStorySpawnRows([list], '', 'units', 0, Infinity, { key: 'wave', direction: 'desc' })
  const segment = ({ wave, fragment }: typeof sorted.rows[number]) => [wave, fragment].join('/')
  assert.deepEqual([...new Set(sorted.rows.map(segment))], ['3/1', '2/2', '2/1', '1/2'])
  assert.deepEqual(
    sorted.rows.filter(row => segment(row) === '2/2').map(row => row.time),
    original.rows.filter(row => segment(row) === '2/2').map(row => row.time),
  )
})

test('表示形式にない列を指定しても出現順と集約順を保つ', () => {
  const lists = [listFor('0-2')]
  const units = getMainStorySpawnRows(lists, '', 'units')
  const counts = getMainStorySpawnRows(lists, '', 'counts')
  assert.deepEqual(getMainStorySpawnRows(lists, '', 'units', 0, Infinity, { key: 'count', direction: 'asc' }), units)
  assert.deepEqual(getMainStorySpawnRows(lists, '', 'counts', 0, Infinity, { key: 'time', direction: 'asc' }), counts)
})

function rankFixtures() {
  const stats = (hp: number, defense: number | null = null) => ({ hp, attack: null, defense, resistance: null })
  const first = fixture('0-1')
  const second = fixture('1-7')
  return [
    buildMainStorySpawnList(first.stage, first.map, first.detail, index.enemies, new Map([
      ['enemy_1007_slime', stats(100)],
      ['enemy_1002_nsabr', stats(20, 0)],
    ])),
    buildMainStorySpawnList(second.stage, second.map, second.detail, index.enemies, new Map([
      ['enemy_1002_nsabr', stats(100, 5)],
      ['enemy_1007_slime_2', stats(50)],
    ])),
  ]
}

test('1体ずつ表示する順位は同値の17体を同率1位とし、並べ替え方向と出力範囲を変えても維持する', () => {
  const lists = rankFixtures()
  const descending = { key: 'hp', direction: 'desc' } as const
  const ascending = { key: 'hp', direction: 'asc' } as const
  const firstPage = getMainStorySpawnRows(lists, '', 'units', 0, 18, descending)
  assert.equal(firstPage.rowCount, 52)
  assert.equal(firstPage.rows.filter(row => row.stats.hp === 100 && row.rank === 1).length, 17)
  assert.deepEqual(firstPage.rows.slice(-1).map(row => [row.stats.hp, row.rank]), [[50, 18]])
  const selectedRange = getMainStorySpawnRows(lists, '', 'units', 17, 2, descending)
  assert.deepEqual(selectedRange.rows.map(row => [row.stats.hp, row.rank]), [[50, 18], [50, 18]])
  const reversePage = getMainStorySpawnRows(lists, '', 'units', 0, 2, ascending)
  assert.deepEqual(reversePage.rows.map(row => [row.stats.hp, row.rank]), [[20, 41], [50, 18]])
})

test('体数をまとめる表示ではステージごとの敵を1行として数え、欠測のステータスに順位を付けない', () => {
  const lists = rankFixtures()
  const { rows } = getMainStorySpawnRows(lists, '', 'counts', 0, Infinity, { key: 'hp', direction: 'desc' })
  assert.deepEqual(rows.map(row => [row.stats.hp, row.rank]), [
    [100, 1], [100, 1], [50, 3], [20, 4],
    [null, null], [null, null], [null, null], [null, null],
  ])
})

test('検索に一致する行で順位を付け、ステータス以外で並べ替えると順位を表示しない', () => {
  const lists = rankFixtures()
  const hp = getMainStorySpawnRows(lists, '兵士', 'units', 0, 2, { key: 'hp', direction: 'asc' })
  const defense = getMainStorySpawnRows(lists, '兵士', 'units', 0, 2, { key: 'defense', direction: 'asc' })
  assert.deepEqual(hp.rows.map(row => [row.stage.code, row.rank]), [['0-1', 8], ['1-7', 1]])
  assert.deepEqual(defense.rows.map(row => [row.stats.defense, row.rank]), [[0, 8], [5, 1]])
  const byStage = getMainStorySpawnRows(lists, '兵士', 'units', 0, 2, { key: 'stage', direction: 'asc' })
  assert.ok(byStage.rows.every(row => row.rank === undefined))
})

test('順位の移動先は同率グループの先頭行になり、並べ替えとページの行キーを保つ', () => {
  const lists = rankFixtures()
  const cases = [
    { direction: 'desc', target: 18, offset: 17, rank: 18, value: 50 },
    { direction: 'asc', target: 40, offset: 1, rank: 18, value: 50 },
    { direction: 'desc', target: 41, offset: 40, rank: 41, value: 20 },
    { direction: 'asc', target: 1, offset: 24, rank: 1, value: 100 },
  ] as const
  for (const { direction, target, offset, rank, value } of cases) {
    const sort = { key: 'hp', direction } as const
    const destination = findMainStorySpawnJump(lists, '', 'units', sort, { kind: 'rank', value: target })
    const start = Math.floor(offset / 25) * 25
    const page = getMainStorySpawnRows(lists, '', 'units', start, 25, sort)
    assert.equal(page.rankedRowCount, 41)
    const expectedRow = page.rows[offset - start]
    assert.deepEqual(destination, { offset, key: expectedRow.key, rank, value })
    assert.equal(expectedRow.rank, rank)
  }
})

test('値で移動すると最も近い値を選び、同じ差なら高い値を優先する', () => {
  const lists = rankFixtures()
  const ascending = { key: 'hp', direction: 'asc' } as const
  for (const [target, offset, rank, value] of [[40, 1, 18, 50], [75, 24, 1, 100], [500, 24, 1, 100]]) {
    const destination = findMainStorySpawnJump(lists, '', 'units', ascending, { kind: 'stat', value: target })
    assert.ok(destination)
    assert.deepEqual([destination.offset, destination.rank, destination.value], [offset, rank, value])
  }

  const defense = { key: 'defense', direction: 'asc' } as const
  const zero = findMainStorySpawnJump(lists, '', 'units', defense, { kind: 'stat', value: 0 })
  assert.ok(zero)
  assert.deepEqual([zero.offset, zero.rank, zero.value], [0, 8, 0])
})

test('絞り込みと表示形式に合わせて順位の移動範囲を決める', () => {
  const lists = rankFixtures()
  const sort = { key: 'hp', direction: 'desc' } as const
  const units = getMainStorySpawnRows(lists, '兵士', 'units', 0, 1, sort)
  const counts = getMainStorySpawnRows(lists, '兵士', 'counts', 0, 1, sort)
  assert.equal(units.rankedRowCount, 8)
  assert.equal(counts.rankedRowCount, 2)

  const destination = findMainStorySpawnJump(lists, '兵士', 'counts', sort, { kind: 'rank', value: 2 })
  assert.ok(destination)
  assert.deepEqual([destination.offset, destination.rank, destination.value], [1, 2, 20])
  assert.equal(findMainStorySpawnJump(lists, '兵士', 'counts', sort, { kind: 'rank', value: 3 }), null)
})

test('不正な移動入力と、順位を持つ行がない場合に移動先を返さない', () => {
  const lists = rankFixtures()
  const sort = { key: 'hp', direction: 'desc' } as const
  for (const value of [0, -1, 1.5, 42, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(findMainStorySpawnJump(lists, '', 'units', sort, { kind: 'rank', value }), null)
  }
  for (const value of [-1, Infinity, NaN]) {
    assert.equal(findMainStorySpawnJump(lists, '', 'units', sort, { kind: 'stat', value }), null)
  }
  assert.equal(findMainStorySpawnJump(lists, '', 'units', { key: 'stage', direction: 'asc' },
    { kind: 'rank', value: 1 }), null)
  assert.equal(findMainStorySpawnJump([listFor('0-1')], '', 'units', sort, { kind: 'stat', value: 0 }), null)
  assert.equal(findMainStorySpawnJump(lists, '該当なし', 'units', sort, { kind: 'rank', value: 1 }), null)
})
