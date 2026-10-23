import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getMapDetail, loadMapDatabase, loadMapDetail, parseMapDetailShard } from '../src/lib/mapDatabase.ts'
import { getRoguelikeStageGroups, loadRoguelikeDatabase, loadRoguelikeMapDetail, parseRoguelikeIndex } from '../src/lib/roguelikeDatabase.ts'
import type { MapDetailShard, MapSummary } from '../src/types/map.ts'
import type { RoguelikeIndex, RoguelikeStage } from '../src/types/roguelike.ts'

const levelId = 'obt/roguelike/ro3/level_rogue3_1-1'
const map: MapSummary = {
  levelId, stageId: 'ro3_n_1_1', code: '', name: '死刑囚の夜', zoneId: 'rogue_3', zoneName: '探索者と銀氷の果て',
  status: 'excluded', spawnCount: null, enemyIds: ['enemy_a'], reasons: ['roguelike-context-unspecified'], detailFile: 'details-0.json',
}
const normal: RoguelikeStage = {
  id: 'ro3_n_1_1', themeId: 'rogue_3', levelId, name: '死刑囚の夜', isEmergency: false, isBoss: false,
  linkedStageId: null, eliteDescription: null, difficulty: 'NORMAL', replacementLevelIds: [],
}
const emergency: RoguelikeStage = {
  ...normal, id: 'ro3_e_1_1', isEmergency: true, linkedStageId: normal.id,
  eliteDescription: '制限：敵の最大HPが上昇', difficulty: 'FOUR_STAR',
}
const index: RoguelikeIndex = {
  schemaVersion: 1, generatedAt: '2026-10-23T00:00:00Z', sourceGeneratedAt: null,
  maps: [map], enemies: { enemy_a: { name: '一般囚人', hp: 5500, attack: 280, defense: 60, resistance: 0 } },
  themes: [{ id: 'rogue_3', name: '探索者と銀氷の果て', sortId: 3 }], stages: [normal, emergency],
  source: { repository: 'https://github.com/ArknightsAssets/ArknightsGamedata', commit: 'a'.repeat(40), region: 'jp',
    topicTable: 'jp/gamedata/excel/roguelike_topic_table.json' },
}
const shard: MapDetailShard = {
  schemaVersion: 1, generatedAt: index.generatedAt, maps: {
    [levelId]: { levelId, grid: [[0, 1]], tiles: [
      { tileKey: 'tile_start', heightType: 'LOWLAND', buildableType: 'NONE', passableMask: 'ALL' },
      { tileKey: 'tile_end', heightType: 'LOWLAND', buildableType: 'NONE', passableMask: 'ALL' },
    ], life: 3, initialCost: 10, deployLimit: 6, enemies: [{ id: 'enemy_a', count: null }], routes: [], waves: [] },
  },
}

test('normal and emergency stage identities remain separate while their shared level is parsed once', () => {
  const parsed = parseRoguelikeIndex(index)
  assert.equal(parsed.maps.length, 1)
  assert.deepEqual(parsed.stages, [normal, emergency])
  assert.notEqual(parsed.stages[0], normal)
  assert.notEqual(parsed.stages[0].replacementLevelIds, normal.replacementLevelIds)
  assert.deepEqual(parsed.source, index.source)
  assert.notEqual(parsed.source, index.source)
  assert.equal(parsed.maps[0].spawnCount, null)
  assert.equal(parsed.enemies.enemy_a.defense, 60)
  assert.deepEqual(getRoguelikeStageGroups(parsed, 'rogue_3'), [{ id: normal.id, name: normal.name, stages: [normal, emergency] }])
})

test('replacement levels preserve source order, are independently cloned, and participate in enemy search', () => {
  const otherId = 'obt/roguelike/ro3/level_variant'
  const replacement = { ...map, levelId: otherId, enemyIds: ['enemy_b'] }
  const variantIndex = { ...index, maps: [map, replacement], enemies: { ...index.enemies,
    enemy_b: { name: '拳闘士囚人', hp: 8000, attack: 300, defense: 300, resistance: 0 } },
  stages: [{ ...normal, replacementLevelIds: [otherId] }, emergency] }
  const parsed = parseRoguelikeIndex(variantIndex)
  assert.deepEqual(parsed.stages[0].replacementLevelIds, [otherId])
  assert.notEqual(parsed.stages[0].replacementLevelIds, variantIndex.stages[0].replacementLevelIds)
  assert.equal(getRoguelikeStageGroups(parsed, 'rogue_3', '拳闘士囚人').length, 1)
  assert.equal(getRoguelikeStageGroups(parsed, 'rogue_3', 'level_variant').length, 1)
  const { replacementLevelIds, ...legacy } = normal
  assert.deepEqual(parseRoguelikeIndex({ ...index, stages: [legacy, emergency] }).stages[0].replacementLevelIds, [])
  for (const replacementLevelIds of [null, {}, ['unknown'], [otherId, otherId], ['../private']]) {
    assert.throws(() => parseRoguelikeIndex({ ...variantIndex, stages: [{ ...normal, replacementLevelIds }, emergency] }))
  }
})

test('invalid metadata, duplicate identities, broken links and cross-theme links are rejected', () => {
  for (const themes of [null, [{ ...index.themes[0], id: '' }], [index.themes[0], index.themes[0]],
    [{ ...index.themes[0], sortId: -1 }], [{ ...index.themes[0], sortId: 1.5 }], [{ ...index.themes[0], name: ' ' }]]) {
    assert.throws(() => parseRoguelikeIndex({ ...index, themes }))
  }
  for (const patch of [
    { id: '' }, { themeId: 'unknown' }, { levelId: 'unknown' }, { name: ' ' }, { isEmergency: 1 }, { isBoss: null },
    { difficulty: 3 }, { eliteDescription: {} }, { linkedStageId: 'unknown' }, { linkedStageId: normal.id },
  ]) assert.throws(() => parseRoguelikeIndex({ ...index, stages: [{ ...normal, ...patch }, emergency] }))
  assert.throws(() => parseRoguelikeIndex({ ...index, stages: [normal, normal] }))
  assert.throws(() => parseRoguelikeIndex({ ...index, stages: [{ ...normal, linkedStageId: emergency.id }, emergency] }))
  assert.throws(() => parseRoguelikeIndex({ ...index,
    themes: [...index.themes, { id: 'rogue_4', name: '別テーマ', sortId: 4 }],
    stages: [normal, { ...emergency, themeId: 'rogue_4' }] }))
  assert.throws(() => parseRoguelikeIndex({ ...index, stages: [] }))
})

test('provenance and detail paths cannot name remote resources or traverse outside bundled data', () => {
  for (const patch of [
    { repository: 'http://github.com/example/data' }, { repository: 'https://github.com/example/data/../private' },
    { repository: 'javascript:alert(1)' }, { commit: 'master' }, { commit: '../main' }, { region: 'cn' },
    { topicTable: '../private.json' }, { topicTable: '/jp/table.json' }, { topicTable: 'https://example.test/table.json' },
    { topicTable: 'jp\\table.json' }, { topicTable: 'jp/table.json?v=1' },
  ]) assert.throws(() => parseRoguelikeIndex({ ...index, source: { ...index.source, ...patch } }))
  for (const detailFile of ['../details-0.json', 'details-0.json?v=1', 'https://example.test/details-0.json']) {
    assert.throws(() => parseRoguelikeIndex({ ...index, maps: [{ ...map, detailFile }] }))
  }
  for (const levelId of ['../level', 'obt\\level', 'Obt/Level']) {
    assert.throws(() => parseRoguelikeIndex({ ...index, maps: [{ ...map, levelId }], stages: [{ ...normal, levelId }] }))
  }
})

test('stage grouping follows links across maps and never combines themes or distinct explicit groups', () => {
  const secondMap = { ...map, levelId: 'obt/roguelike/ro3/level_rogue3_other' }
  const otherNormal = { ...normal, id: 'ro3_n_other', name: '別ステージ' }
  const otherEmergency = { ...emergency, id: 'ro3_e_other', linkedStageId: otherNormal.id }
  const otherTheme = { ...normal, id: 'ro4_n_1_1', themeId: 'rogue_4' }
  const parsed = parseRoguelikeIndex({ ...index, maps: [map, secondMap],
    themes: [...index.themes, { id: 'rogue_4', name: 'サルカズの炉辺奇談', sortId: 4 }],
    stages: [{ ...emergency, levelId: secondMap.levelId }, normal, otherNormal, otherEmergency, otherTheme] })
  const groups = getRoguelikeStageGroups(parsed, 'rogue_3')
  assert.deepEqual(groups.map((group) => group.id), [normal.id, otherNormal.id])
  assert.deepEqual(groups[0].stages.map((stage) => stage.id), [normal.id, emergency.id])
  assert.deepEqual(groups[1].stages.map((stage) => stage.id), [otherNormal.id, otherEmergency.id])
  assert.deepEqual(getRoguelikeStageGroups(parsed, 'rogue_4').flatMap((group) => group.stages.map((stage) => stage.id)), [otherTheme.id])
  assert.deepEqual(getRoguelikeStageGroups(parsed, 'unknown'), [])
})

test('unlinked variants fall back to their shared level, and normalized search retains the complete variant group', () => {
  const parsed = parseRoguelikeIndex({ ...index, stages: [{ ...emergency, linkedStageId: null }, normal] })
  const groups = getRoguelikeStageGroups(parsed, 'rogue_3', 'ＲＯ３　囚人')
  assert.equal(groups.length, 1)
  assert.equal(groups[0].id, normal.id)
  assert.deepEqual(groups[0].stages.map((stage) => stage.id), [normal.id, emergency.id])
  assert.equal(getRoguelikeStageGroups(parsed, 'rogue_3', emergency.id)[0].stages.length, 2)
  assert.equal(getRoguelikeStageGroups(parsed, 'rogue_3', '死刑囚 未知の敵').length, 0)
})

test('stage list starts with normal non-boss stages in natural source-ID order, independent of source record order', () => {
  const makeStage = (id: string, isBoss = false): RoguelikeStage => ({
    ...normal, id, levelId: `obt/roguelike/ro3/level_${id}`, name: id, isBoss,
  })
  const second = makeStage('ro3_n_1_2')
  const tenth = makeStage('ro3_n_1_10')
  const boss = makeStage('ro3_b_1', true)
  const event = makeStage('ro3_ev_1')
  const secondEmergency = { ...second, id: 'ro3_e_1_2', isEmergency: true, linkedStageId: second.id }
  const stages = [boss, event, tenth, secondEmergency, emergency, normal, second]
  const levels = [...new Set(stages.map((stage) => stage.levelId))]
  const parsed = parseRoguelikeIndex({ ...index, stages, maps: levels.map((levelId) => ({ ...map, levelId })) })
  const groups = getRoguelikeStageGroups(parsed, 'rogue_3')
  assert.deepEqual(groups.map((group) => group.id), [normal.id, second.id, tenth.id, event.id, boss.id])
  assert.deepEqual(groups[1].stages.map((stage) => stage.id), [second.id, secondEmergency.id])
})

test('roguelike loaders isolate ordinary caches, share requests, reject mixed versions and retry failures', async (context) => {
  const ordinaryMap = { ...map, status: 'supported' as const, reasons: [], spawnCount: 3 }
  const ordinaryIndex = { ...index, maps: [ordinaryMap] }
  const ordinaryShard = { ...shard, maps: { [levelId]: { ...shard.maps[levelId], life: 10, enemies: [{ id: 'enemy_a', count: 3 }] } } }
  let indexCalls = 0
  let detailCalls = 0
  let ordinaryCalls = 0
  context.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
    const path = String(url)
    if (path.startsWith('/data/maps/')) {
      ordinaryCalls += 1
      return Response.json(path.endsWith('index.json') ? ordinaryIndex : ordinaryShard)
    }
    assert.ok(path.startsWith('/data/roguelike/'), path)
    if (path.endsWith('index.json')) {
      indexCalls += 1
      if (indexCalls === 1) return new Response('', { status: 500 })
      if (indexCalls === 2) return Response.json({ ...index, source: null })
      return Response.json(index)
    }
    assert.equal(path, `/data/roguelike/details-0.json?v=${encodeURIComponent(index.generatedAt)}`)
    detailCalls += 1
    if (detailCalls === 1) return new Response('', { status: 500 })
    if (detailCalls === 2) return Response.json({ ...shard, generatedAt: '2025-01-01T00:00:00Z' })
    if (detailCalls === 3) return Response.json({ ...shard, maps: {} })
    return Response.json(shard)
  })
  const ordinary = await loadMapDatabase()
  const ordinaryDetail = await loadMapDetail(ordinary.maps[0])
  assert.equal(ordinaryDetail.life, 10)
  assert.equal(ordinaryCalls, 2)
  await assert.rejects(loadRoguelikeDatabase(), /一覧を読み込めません/)
  await assert.rejects(loadRoguelikeDatabase(), /一覧形式または取得元/)
  const [first, second] = await Promise.all([loadRoguelikeDatabase(), loadRoguelikeDatabase()])
  assert.equal(first, second)
  assert.equal(indexCalls, 3)
  for (const invalid of [{ ...map, status: 'missing' as const, detailFile: null },
    { ...map, detailFile: '../private.json' }, { ...map, levelId: 'unknown' }, { ...map, detailFile: 'details-1.json' }]) {
    await assert.rejects(loadRoguelikeMapDetail(invalid))
  }
  assert.equal(detailCalls, 0)
  await assert.rejects(loadRoguelikeMapDetail(map), /詳細を読み込めません/)
  await assert.rejects(loadRoguelikeMapDetail(map), /更新日時が一致しません/)
  await assert.rejects(loadRoguelikeMapDetail(map), /詳細が見つかりません/)
  const [a, b] = await Promise.all([loadRoguelikeMapDetail(map), loadRoguelikeMapDetail(map)])
  assert.equal(a, b)
  assert.equal(detailCalls, 4)
  assert.equal(a.life, 3)
  assert.equal(a.enemies[0].count, null)
  assert.equal((await loadMapDetail(ordinary.maps[0])), ordinaryDetail)
  assert.equal(ordinaryCalls, 2)
})

test('bundled themes, stage variants, replacement maps and every lazy shard agree', async () => {
  const base = new URL('../public/data/roguelike/', import.meta.url)
  const bundled = parseRoguelikeIndex(JSON.parse(await readFile(new URL('index.json', base), 'utf8')))
  assert.ok(bundled.themes.length >= 5)
  assert.ok(bundled.stages.length > bundled.maps.length)
  const shards = new Map(await Promise.all([...new Set(bundled.maps.flatMap((map) => map.detailFile ? [map.detailFile] : []))]
    .map(async (file) => [file, parseMapDetailShard(JSON.parse(await readFile(new URL(file, base), 'utf8')))] as const)))
  for (const map of bundled.maps) {
    if (!map.detailFile) {
      assert.equal(map.status, 'missing')
      continue
    }
    const detailShard = shards.get(map.detailFile)!
    assert.equal(detailShard.generatedAt, bundled.generatedAt)
    const detail = getMapDetail(detailShard, map)
    assert.equal(map.status, 'excluded')
    assert.equal(map.spawnCount, null)
    assert.ok(detail.enemies.every((enemy) => enemy.count === null))
    for (const action of detail.waves?.flatMap((wave) => wave.fragments.flatMap((fragment) => fragment.actions)) ?? []) {
      if (action.actionType === 'SPAWN' && (action.count ?? 0) > 0) {
        assert.equal(action.resolution?.status, 'unknown', `${map.levelId}: source spawns must not look resolved`)
        assert.equal(action.resolution?.resolvedCount, null)
      }
    }
  }
  const prison = getRoguelikeStageGroups(bundled, 'rogue_3', '死刑囚の夜')
  assert.equal(getRoguelikeStageGroups(bundled, 'rogue_3')[0].id, 'ro3_n_1_1')
  assert.equal(prison.length, 1)
  assert.ok(prison[0].stages.some((stage) => !stage.isEmergency))
  assert.ok(prison[0].stages.some((stage) => stage.isEmergency))
  assert.equal(new Set(prison[0].stages.map((stage) => stage.levelId)).size, 1)
  assert.ok(bundled.stages.some((stage) => stage.replacementLevelIds.length > 0))
})
