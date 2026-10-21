import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'vite'
import { createGameDataClient } from '../src/lib/gameDataClient.ts'
import { buildEnemyRecords } from '../src/lib/enemyData.ts'
import { DATA_SOURCE_URLS } from '../src/lib/dataSources.ts'
import { LOCAL_GAME_DATA_RUNTIME_FILES, type LocalGameDataTable } from '../src/lib/localGameDataContract.ts'

const base = '/arknights_2/'
const manifestUrl = `${base}data/runtime/manifest.json`
const version = '2026-10-21T11:22:33.456Z'
const revision = 'a'.repeat(40)
const manifest = { schemaVersion: 1, available: true, revision, version }
const tables = Object.keys(LOCAL_GAME_DATA_RUNTIME_FILES) as LocalGameDataTable[]
const pinnedUrl = (path: string) => `${base}data/${path}?v=${encodeURIComponent(version)}`
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })

test('development pins all raw tables and enemy counts to one local manifest without upstream access', async () => {
  const calls: string[] = []
  const client = createGameDataClient({
    base: base.slice(0, -1), dev: true,
    fetch: async (input) => {
      const url = String(input)
      calls.push(url)
      assert.ok(!url.startsWith('https:'), 'local mode must work while upstream is offline')
      return json(url === manifestUrl ? manifest : { requestedUrl: url })
    },
  })
  const values = await Promise.all([
    ...tables.map(table => client.readTable<{ requestedUrl: string }>(table)),
    client.readStageAppearances<{ requestedUrl: string }>(),
  ])
  const urls = [...Object.values(LOCAL_GAME_DATA_RUNTIME_FILES), 'enemy-stage-appearances.json'].map(pinnedUrl)
  assert.deepEqual(values.map(value => value.requestedUrl), urls)
  assert.deepEqual(calls, [manifestUrl, ...urls])
  assert.deepEqual(await client.getSource(), { mode: 'local', version, revision })
  await client.readTable('character')
  assert.equal(calls.filter(url => url === manifestUrl).length, 1)
  assert.equal(calls.at(-1), pinnedUrl(LOCAL_GAME_DATA_RUNTIME_FILES.character))
})

test('an unavailable first-run snapshot selects upstream once until the page reloads', async () => {
  const calls: string[] = []
  let snapshotReady = false
  const client = createGameDataClient({ base, dev: true, fetch: async input => {
    const url = String(input)
    calls.push(url)
    return json(url === manifestUrl ? snapshotReady ? manifest : { schemaVersion: 1, available: false } : {})
  } })
  await client.readTable('enemyHandbook')
  snapshotReady = true
  await Promise.all([client.readTable('enemyDatabase'), client.readStageAppearances()])
  assert.deepEqual(calls, [
    manifestUrl, DATA_SOURCE_URLS.enemyHandbook, DATA_SOURCE_URLS.enemyDatabase,
    `${base}data/enemy-stage-appearances.json`,
  ])
  assert.deepEqual(await client.getSource(), { mode: 'upstream' })
})

test('production and preview keep upstream URLs and do not request the development manifest', async () => {
  const calls: string[] = []
  const client = createGameDataClient({ base, dev: false, fetch: async input => {
    const url = String(input)
    calls.push(url)
    assert.notEqual(url, manifestUrl)
    return json({})
  } })
  await Promise.all([...tables.map(table => client.readTable(table)), client.readStageAppearances()])
  assert.deepEqual(calls, [...tables.map(table => DATA_SOURCE_URLS[table]), `${base}data/enemy-stage-appearances.json`])
})

test('an older development server with no usable manifest falls back before selecting any local table', async t => {
  for (const [name, response] of [
    ['404', () => new Response('not found', { status: 404 })],
    ['SPA HTML', () => new Response('<html>app</html>')],
    ['network failure', () => { throw new Error('offline') }],
    ['invalid revision', () => json({ ...manifest, revision: '../invalid' })],
    ['invalid version', () => json({ ...manifest, version: 'invalid' })],
  ] as const) {
    await t.test(name, async () => {
      const calls: string[] = []
      const client = createGameDataClient({ base, dev: true, fetch: async input => {
        const url = String(input)
        calls.push(url)
        return url === manifestUrl ? response() : json({})
      } })
      await client.readTable('character')
      assert.deepEqual(calls, [manifestUrl, DATA_SOURCE_URLS.character])
    })
  }
})

test('a selected local snapshot never falls back per file, including formerly optional tables and counts', async t => {
  for (const [name, response] of [
    ['HTTP failure', () => new Response('missing', { status: 404 })],
    ['invalid JSON', () => new Response('{')],
    ['invalid object', () => json(null)],
    ['network failure', () => { throw new Error('disconnected') }],
  ] as const) {
    await t.test(name, async () => {
      const calls: string[] = []
      const client = createGameDataClient({ base, dev: true, fetch: async input => {
        const url = String(input)
        calls.push(url)
        assert.ok(!url.startsWith('https:'))
        return url === manifestUrl ? json(manifest) : response()
      } })
      await assert.rejects(client.readTable('character'))
      await assert.rejects(client.readTable('battleEquip', { optional: true }))
      await assert.rejects(client.readTable('handbookTeam', { optional: true }))
      await assert.rejects(client.readStageAppearances({ optional: true }))
      assert.equal(calls.length, 5)
      assert.equal(calls.filter(url => url === manifestUrl).length, 1)
      assert.ok(calls.slice(1).every(url => url.endsWith(`?v=${encodeURIComponent(version)}`)))
    })
  }
})

test('upstream mode preserves optional module, affiliation and count loading, while required errors reject', async () => {
  const client = createGameDataClient({ base, dev: false, fetch: async () => new Response('missing', { status: 503 }) })
  assert.equal(await client.readTable('battleEquip', { optional: true }), null)
  assert.equal(await client.readTable('handbookTeam', { optional: true }), null)
  assert.equal(await client.readStageAppearances({ optional: true }), null)
  await assert.rejects(client.readTable('skill'))
})

test('root Key/Value arrays are accepted only for the enemy database and remain readable by the enemy parser', async () => {
  const database = [{ Key: 'enemy_test', Value: [{ level: 0, enemyData: { attributes: { maxHp: 4321 } } }] }]
  for (const dev of [true, false]) {
    const client = createGameDataClient({ base, dev, fetch: async input => json(String(input) === manifestUrl ? manifest : database) })
    const loaded = await client.readTable('enemyDatabase')
    assert.deepEqual(loaded, database)
    const enemies = buildEnemyRecords({ enemyData: { enemy_test: { name: 'テスト敵', enemyId: 'enemy_test' } } }, loaded)
    assert.equal(enemies[0].stats.maxHp, 4321)
    for (const table of tables.filter(table => table !== 'enemyDatabase')) {
      await assert.rejects(client.readTable(table), /形式が正しくありません/)
    }
    await assert.rejects(client.readStageAppearances(), /形式が正しくありません/)
  }
})

test('operator loading uses the pinned local module and affiliation data and surfaces missing local optional files', async t => {
  const server = await createServer({
    configFile: false, logLevel: 'silent', appType: 'custom',
    cacheDir: 'node_modules/.vite/game-data-client-test',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false },
  })
  t.after(() => server.close())
  const { loadSkillRecords } = await server.ssrLoadModule('/src/lib/arknightsData.ts')
  const documents: Partial<Record<LocalGameDataTable, unknown>> = {
    character: { char_test: { name: 'テストOP', displayNumber: 'TEST', skills: [{ skillId: 'test_s1' }], teamId: 'test_team' } },
    skill: { test_s1: { levels: [{ name: 'S1', description: '攻撃力+10%' }] } },
    uniequip: { equipDict: { equip_test: { charId: 'char_test', uniEquipName: 'テストMOD', uniEquipId: 'equip_test', type: 'ADVANCED' } } },
    battleEquip: { equip_test: { phases: [{ equipLevel: 1 }] } },
    handbookTeam: { test_team: { powerName: 'テスト所属' } },
  }
  const source = (missing?: LocalGameDataTable) => createGameDataClient({ base, dev: true, fetch: async input => {
    const url = String(input)
    if (url === manifestUrl) return json(manifest)
    const key = tables.find(table => pinnedUrl(LOCAL_GAME_DATA_RUNTIME_FILES[table]) === url)
    assert.ok(key, `unexpected upstream URL: ${url}`)
    return key === missing ? new Response('missing', { status: 404 }) : json(documents[key])
  } })
  const rows = await loadSkillRecords(source())
  assert.equal(rows.length, 1)
  assert.equal(rows[0].operatorProfile.affiliation, 'テスト所属')
  assert.equal(rows[0].operatorProfile.modules[0].phases[0].equipLevel, 1)
  await assert.rejects(loadSkillRecords(source('battleEquip')))
  await assert.rejects(loadSkillRecords(source('handbookTeam')))
})
