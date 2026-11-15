import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildMainStorySpawnList, getMainStorySpawnRows, getMainStorySpawnStages, loadMainStorySpawnLists } from '../src/lib/mainStoryEnemySpawns.ts'
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
  assert.deepEqual(getMainStorySpawnRows([list], '', 'units'), { rows: [], confirmedCount: 0, rowCount: 0 })
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

test('同じ版のステージデータを読み込んで0-1の兵士にステージ固有の防御力を使う', async context => {
  const { stage, map } = fixture('0-1')
  const filenames = ['index.json', 'main-enemy-trends.json', map.detailFile]
  context.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
    const { pathname } = new URL(String(url), 'http://localhost')
    const filename = pathname.replace(/^\/data\/maps\//, '')
    assert.ok(filenames.includes(filename), pathname)
    return new Response(readFileSync(new URL(filename, dataDirectory), 'utf8'))
  })
  const [list] = await loadMainStorySpawnLists([stage])
  const { rows } = getMainStorySpawnRows([list], '兵士', 'units')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].stats.defense, 30)
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
