import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { parseEnemyAggregationIndex } from '../src/lib/enemyAggregationContract.ts'
import { createEnemyAggregationClient, getEnemyMainStoryScope } from '../src/lib/enemyAggregationData.ts'
import { buildMainStorySpawnList, getMainStorySpawnStages } from '../src/lib/mainStoryEnemySpawns.ts'
import { getMapDetail, parseMapDetailShard, parseMapIndex } from '../src/lib/mapDatabase.ts'

const ARCHIVE_DIRECTORY = fileURLToPath(new URL('../public/data/enemy-aggregation/', import.meta.url))
const VERSION_ID = 'v12'
const OUTPUT_FILENAME = 'v12-main-story-spawns.json'

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function loadArchive() {
  const index = parseEnemyAggregationIndex(await readJson(resolve(ARCHIVE_DIRECTORY, 'index.json')))
  const version = index.versions.find(entry => entry.id === VERSION_ID)
  assert.ok(version, '集計版 v12 がありません。')

  const url = '/data/enemy-aggregation/' + version.file
  const client = createEnemyAggregationClient({
    async fetch(input) {
      assert.equal(String(input), url)
      return new Response(await readFile(resolve(ARCHIVE_DIRECTORY, version.file)))
    },
  })
  return { version, data: await client.loadVersion(version) }
}

async function loadSnapshotReader(directory, version) {
  const manifest = await readJson(resolve(directory, '..', 'manifest.json'))
  assert.ok(manifest.revision === version.sourceRevision && manifest.generatorVersion === version.generatorVersion
    && manifest.generatedAt === version.generatedAt, '集計版 v12 と同じ時点に生成したスナップショットを指定してください。')
  const files = new Map(manifest.files.map(file => [file.path, file]))

  return async function readSnapshotFile(path) {
    const file = files.get(path)
    assert.ok(file, 'スナップショットにファイルがありません。 ' + path)
    const bytes = await readFile(resolve(directory, path))
    const hash = createHash('sha256').update(bytes).digest('hex')
    assert.ok(bytes.length === file.size && hash === file.sha256, '保存時とファイルの内容が異なります。 ' + path)
    return JSON.parse(bytes.toString('utf8'))
  }
}

async function generate(directory) {
  const { version, data } = await loadArchive()
  const snapshotReader = await loadSnapshotReader(directory, version)
  const mapIndex = parseMapIndex(await snapshotReader('maps/index.json'))
  assert.ok(isDeepStrictEqual(mapIndex, data.maps), 'スナップショットのマップ一覧が集計版 v12 と一致しません。')

  const { rows, counts, spawnCountsAvailable } = getEnemyMainStoryScope(data)
  assert.ok(spawnCountsAvailable, 'メインストーリーの出現体数がありません。')
  const expectedCounts = new Map(Object.entries(counts.enemies)
    .filter(([, entry]) => entry.spawnCount > 0).map(([enemyId, entry]) => [enemyId, entry.spawnCount]))
  const countedIds = new Set(expectedCounts.keys())
  const enemies = Object.fromEntries(rows.filter(row => countedIds.has(row.id)).map(row => [row.id, {
    name: row.name,
    stats: { hp: row.stats.maxHp, attack: row.stats.attack, defense: row.stats.defense, resistance: row.stats.magicResistance },
  }]))

  const stages = getMainStorySpawnStages(mapIndex)
  assert.equal(stages.length, counts.summary.spawnMapCount, 'メインストーリーのマップ件数が一致しません。')
  const maps = new Map(mapIndex.maps.map(map => [map.levelId, map]))
  const shards = new Map()
  const observedCounts = new Map()
  const lists = []
  for (const stage of stages) {
    const map = maps.get(stage.id)
    assert.ok(map?.detailFile, 'マップ詳細がありません。 ' + stage.code)
    let shard = shards.get(map.detailFile)
    if (!shard) {
      shard = parseMapDetailShard(await snapshotReader('maps/' + map.detailFile))
      assert.equal(shard.generatedAt, mapIndex.generatedAt, 'マップ詳細の更新日時が一致しません。 ' + map.detailFile)
      shards.set(map.detailFile, shard)
    }
    const list = buildMainStorySpawnList(stage, map, getMapDetail(shard, map), mapIndex.enemies,
      undefined, undefined, countedIds)
    const expectedTotal = map.spawnCount ?? map.spawnAggregation?.count
    const observedTotal = list.groups.reduce((total, group) => total + group.count, 0)
    assert.equal(observedTotal, expectedTotal, 'ステージ別の出現体数が一致しません。 ' + stage.code)

    for (const group of list.groups) {
      observedCounts.set(group.enemyId, (observedCounts.get(group.enemyId) ?? 0) + group.count)
    }
    const groups = list.groups.filter(group => Object.hasOwn(enemies, group.enemyId)).map(group => ({
      enemyId: group.enemyId, count: group.count, wave: group.wave, fragment: group.fragment,
      time: group.time, entrance: group.entrance, ...(group.fromBranch ? { fromBranch: true } : {}),
    }))
    lists.push({ stage, status: list.status, groups })
  }

  for (const [enemyId, count] of expectedCounts) {
    assert.equal(observedCounts.get(enemyId), count, '敵別の出現体数が一致しません。 ' + enemyId)
  }
  assert.equal(observedCounts.size, expectedCounts.size, '敵の出現内訳が一致しません。')

  await writeFile(resolve(ARCHIVE_DIRECTORY, OUTPUT_FILENAME),
    JSON.stringify({ version: VERSION_ID, enemies, lists }) + '\n', 'utf8')
  const retainedCount = lists.reduce((total, list) => total + list.groups.reduce((sum, group) => sum + group.count, 0), 0)
  process.stdout.write(OUTPUT_FILENAME + ' を生成しました。 ' + lists.length + 'ステージ、' + retainedCount + '体\n')
}

const directory = process.argv[2]
if (process.argv.length !== 3 || !directory) {
  throw new Error('Usage: node --experimental-strip-types scripts/generateMainStorySpawnV12.mjs <snapshot-data-directory>')
}
await generate(resolve(directory))
