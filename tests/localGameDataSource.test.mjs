import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fetchGameDataRevision, loadGameDataSource } from '../scripts/localGameDataSource.mjs'

const REVISION = 'a'.repeat(40)
const NEXT_REVISION = 'b'.repeat(40)
const JP_TREE = 'c'.repeat(40)
const DATA_TREE = 'd'.repeat(40)
const API = 'https://api.github.com/repos/ArknightsAssets/ArknightsGamedata'
const RAW = 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata'
const hash = (text) => createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex')
const json = (value) => new Response(JSON.stringify(value))
const level = (enemy = 'enemy_a') => ({ enemyDbRefs: [{ id: enemy }], waves: [], mapData: {} })
const stage = (id, extra = {}) => ({ stageId: id, levelId: `obt/main/${id}`, isStoryOnly: false, difficulty: 'NORMAL', ...extra })

async function cache(t) {
  const path = await mkdtemp(join(tmpdir(), 'arknights-data-source-'))
  t.after(() => rm(path, { recursive: true, force: true }))
  return path
}

function sourceFixture({ stages, levels, revision = REVISION, overrides = {}, mutateTree } = {}) {
  const documents = {
    'excel/character_table.json': { char_a: { name: 'Operator A', phases: [{ maxLevel: 90 }], skills: [{ skillId: 'skill_a' }] } },
    'excel/skill_table.json': { skill_a: { levels: [{ name: 'Skill A', blackboard: [{ key: 'atk', value: 1 }] }] } },
    'excel/uniequip_table.json': {
      equipDict: { equip_a: { charId: 'char_a', uniEquipId: 'equip_a' } },
      subProfDict: { warrior: { subProfessionId: 'warrior' } },
    },
    'excel/battle_equip_table.json': { equip_a: { phases: [{ equipLevel: 1 }] } },
    'excel/handbook_team_table.json': { rhodes: { powerName: 'Rhodes Island' } },
    'excel/stage_table.json': { stages: stages ?? { a: stage('a') } },
    'excel/zone_table.json': { zones: { main: { zoneNameFirst: 'Main' } } },
    'excel/enemy_handbook_table.json': { enemyData: { enemy_a: { name: 'Enemy A' } } },
    'levels/enemydata/enemy_database.json': { enemies: [{ Key: 'enemy_a', Value: [{ level: 0, enemyData: { name: 'Enemy A' } }] }] },
    ...(levels ?? { 'levels/obt/main/a.json': level() }),
    ...overrides,
  }
  const bodies = Object.fromEntries(Object.entries(documents).map(([path, data]) => [path, typeof data === 'string' ? data : JSON.stringify(data)]))
  const tree = Object.entries(bodies).map(([path, body]) => ({ path, type: 'blob', mode: '100644', sha: hash(body) }))
  mutateTree?.(tree)
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, options })
    if (url === `${API}/commits?sha=master&path=jp%2Fgamedata&per_page=1`) return json([{ sha: revision }])
    if (url === `${API}/git/trees/${revision}`) return json({ truncated: false, tree: [{ path: 'jp', type: 'tree', sha: JP_TREE }] })
    if (url === `${API}/git/trees/${JP_TREE}`) return json({ truncated: false, tree: [{ path: 'gamedata', type: 'tree', sha: DATA_TREE }] })
    if (url === `${API}/git/trees/${DATA_TREE}?recursive=1`) return json({ truncated: false, tree })
    const prefix = `${RAW}/${revision}/jp/gamedata/`
    if (url.startsWith(prefix)) {
      const path = decodeURIComponent(url.slice(prefix.length))
      return path in bodies ? new Response(bodies[path]) : new Response('', { status: 404 })
    }
    throw new Error(`Unexpected request: ${url}`)
  }
  return { fetchImpl, calls, bodies, tree }
}

test('revision lookup is scoped to JP data and rejects malformed commits', async () => {
  const fixture = sourceFixture()
  assert.equal(await fetchGameDataRevision({ fetchImpl: fixture.fetchImpl }), REVISION)
  assert.match(fixture.calls[0].url, /sha=master&path=jp%2Fgamedata&per_page=1$/)
  assert.equal(fixture.calls[0].options.headers['X-GitHub-Api-Version'], '2022-11-28')
  await assert.rejects(fetchGameDataRevision({ fetchImpl: async () => json([]) }), /Missing JP/)
  await assert.rejects(fetchGameDataRevision({ fetchImpl: async () => json([{ sha: 'master' }]) }), /Invalid revision/)
})

test('one immutable revision supplies unique battle levels including EASY maps, but not story-only scenes', async (t) => {
  const fixture = sourceFixture({ stages: {
    a: stage('a', { levelId: 'OBT/Main/A.json' }),
    duplicate: stage('a'),
    easy: stage('easy', { diffGroup: 'EASY' }),
    story: stage('story', { isStoryOnly: true }),
  }, levels: {
    'levels/obt/main/a.json': level(),
    'levels/obt/main/easy.json': level('enemy_easy'),
    'levels/obt/main/story.json': level(),
  } })
  const progress = []
  const result = await loadGameDataSource({ revision: REVISION, cacheRoot: await cache(t), fetchImpl: fixture.fetchImpl, onProgress: (event) => progress.push(event) })
  assert.equal(result.revision, REVISION)
  assert.deepEqual([...result.levels.keys()], ['obt/main/a', 'obt/main/easy'])
  assert.equal(result.handbook.enemyData.enemy_a.name, 'Enemy A')
  assert.equal(result.character.char_a.name, 'Operator A')
  assert.equal(result.skill.skill_a.levels[0].name, 'Skill A')
  assert.equal(result.uniequip.equipDict.equip_a.charId, 'char_a')
  assert.equal(result.battleEquip.equip_a.phases[0].equipLevel, 1)
  assert.equal(result.handbookTeam.rhodes.powerName, 'Rhodes Island')
  const downloads = fixture.calls.filter(({ url }) => url.startsWith(RAW))
  assert.equal(downloads.length, 11)
  assert.ok(downloads.every(({ url }) => url.includes(`/${REVISION}/jp/gamedata/`)))
  assert.deepEqual(progress.at(-1), { phase: 'levels', completed: 2, total: 2 })
  assert.equal(fixture.calls.filter(({ url }) => url.includes('recursive=1')).length, 1)
})

test('accepts the upstream bare enemy dictionary as well as the wrapped export format', async (t) => {
  const database = { enemy_a: [{ level: 0, enemyData: { name: 'Enemy A' } }] }
  const fixture = sourceFixture({ overrides: { 'levels/enemydata/enemy_database.json': database } })
  const result = await loadGameDataSource({ revision: REVISION, cacheRoot: await cache(t), fetchImpl: fixture.fetchImpl })
  assert.deepEqual(result.database, database)
})

test('unchanged blobs are reused across revisions; only changed content is downloaded', async (t) => {
  const cacheRoot = await cache(t)
  const first = sourceFixture()
  await loadGameDataSource({ revision: REVISION, cacheRoot, fetchImpl: first.fetchImpl })
  const second = sourceFixture({ revision: NEXT_REVISION, levels: { 'levels/obt/main/a.json': level('enemy_new') } })
  const result = await loadGameDataSource({ revision: NEXT_REVISION, cacheRoot, fetchImpl: second.fetchImpl })
  assert.equal(result.levels.get('obt/main/a').enemyDbRefs[0].id, 'enemy_new')
  assert.deepEqual(second.calls.filter(({ url }) => url.startsWith(RAW)).map(({ url }) => url), [
    `${RAW}/${NEXT_REVISION}/jp/gamedata/levels/obt/main/a.json`,
  ])
  const sha = hash(second.bodies['levels/obt/main/a.json'])
  assert.equal(await readFile(join(cacheRoot, 'blobs', `${sha}.json`), 'utf8'), second.bodies['levels/obt/main/a.json'])
})

test('hash-corrupt cache is recovered once from verified immutable source content', async (t) => {
  const cacheRoot = await cache(t)
  const fixture = sourceFixture()
  await loadGameDataSource({ revision: REVISION, cacheRoot, fetchImpl: fixture.fetchImpl })
  const sha = hash(fixture.bodies['levels/obt/main/a.json'])
  await writeFile(join(cacheRoot, 'blobs', `${sha}.json`), '{}')
  fixture.calls.length = 0
  const result = await loadGameDataSource({ revision: REVISION, cacheRoot, fetchImpl: fixture.fetchImpl })
  assert.deepEqual(result.levels.get('obt/main/a'), level())
  assert.deepEqual(fixture.calls.filter(({ url }) => url.startsWith(RAW)).map(({ url }) => url), [
    `${RAW}/${REVISION}/jp/gamedata/levels/obt/main/a.json`,
  ])
  assert.equal(await readFile(join(cacheRoot, 'blobs', `${sha}.json`), 'utf8'), fixture.bodies['levels/obt/main/a.json'])
  await writeFile(join(cacheRoot, 'blobs', `${sha}.json`), '{}')
  await assert.rejects(loadGameDataSource({ revision: REVISION, cacheRoot, fetchImpl: (url, options) =>
    url.endsWith('/obt/main/a.json') ? Promise.resolve(new Response('{}')) : fixture.fetchImpl(url, options),
  }), /blob hash mismatch/)
})

test('special level wave objects are valid, but scalar or null wave data is rejected', async (t) => {
  const fixture = sourceFixture({ levels: { 'levels/obt/main/a.json': { ...level(), waves: {} } } })
  const result = await loadGameDataSource({ revision: REVISION, cacheRoot: await cache(t), fetchImpl: fixture.fetchImpl })
  assert.deepEqual(result.levels.get('obt/main/a').waves, {})
  for (const waves of [null, 3, 'invalid']) {
    const invalid = sourceFixture({ levels: { 'levels/obt/main/a.json': { ...level(), waves } } })
    await assert.rejects(loadGameDataSource({ revision: REVISION, cacheRoot: await cache(t), fetchImpl: invalid.fetchImpl }), /Invalid level document/)
  }
})

test('a mismatched downloaded blob and syntactically invalid JSON both fail', async (t) => {
  const invalidHash = sourceFixture({ mutateTree: (tree) => { tree.find(({ path }) => path === 'levels/obt/main/a.json').sha = 'f'.repeat(40) } })
  await assert.rejects(loadGameDataSource({ revision: REVISION, cacheRoot: await cache(t), fetchImpl: invalidHash.fetchImpl }), /blob hash mismatch/)
  const invalidJson = sourceFixture({ levels: { 'levels/obt/main/a.json': '{"enemyDbRefs":' } })
  await assert.rejects(loadGameDataSource({ revision: REVISION, cacheRoot: await cache(t), fetchImpl: invalidJson.fetchImpl }), /Invalid JSON/)
})

test('missing required files and incomplete trees fail before publication', async (t) => {
  const fixture = sourceFixture({ mutateTree: (tree) => tree.splice(tree.findIndex(({ path }) => path === 'excel/zone_table.json'), 1) })
  await assert.rejects(loadGameDataSource({ revision: REVISION, cacheRoot: await cache(t), fetchImpl: fixture.fetchImpl }), /Missing game data file: excel/)
  const truncated = sourceFixture()
  await assert.rejects(loadGameDataSource({ revision: REVISION, cacheRoot: await cache(t), fetchImpl: async (url, options) =>
    url.includes('recursive=1') ? json({ tree: truncated.tree, truncated: true }) : truncated.fetchImpl(url, options),
  }), /truncated/)
})

test('levels absent in the immutable upstream tree are explicit coverage gaps, not zero counts', async (t) => {
  const fixture = sourceFixture({ stages: { a: stage('a'), missing: stage('missing') } })
  const result = await loadGameDataSource({ revision: REVISION, cacheRoot: await cache(t), fetchImpl: fixture.fetchImpl })
  assert.deepEqual(result.missingLevelIds, ['obt/main/missing'])
  assert.deepEqual([...result.levels.keys()], ['obt/main/a'])
  assert.ok(!fixture.calls.some(({ url }) => url.endsWith('/missing.json')))
  const listedButMissing = sourceFixture()
  await assert.rejects(loadGameDataSource({ revision: REVISION, cacheRoot: await cache(t), fetchImpl: (url, options) =>
    url.endsWith('/obt/main/a.json') ? Promise.resolve(new Response('', { status: 404 })) : listedButMissing.fetchImpl(url, options),
  }), /HTTP 404/)
})

test('untrusted paths, symlinks and malformed required table structure fail', async (t) => {
  for (const levelId of ['../secret', '/absolute', 'C:/outside', 'obt//main']) {
    const fixture = sourceFixture({ stages: { a: stage('a', { levelId }) } })
    await assert.rejects(loadGameDataSource({ revision: REVISION, cacheRoot: await cache(t), fetchImpl: fixture.fetchImpl }), /Invalid game data path/)
  }
  const symlink = sourceFixture({ mutateTree: (tree) => { tree.find(({ path }) => path === 'levels/obt/main/a.json').mode = '120000' } })
  await assert.rejects(loadGameDataSource({ revision: REVISION, cacheRoot: await cache(t), fetchImpl: symlink.fetchImpl }), /Missing regular game data/)
  const badTree = sourceFixture({ mutateTree: (tree) => { tree[0].path = '../escape.json' } })
  await assert.rejects(loadGameDataSource({ revision: REVISION, cacheRoot: await cache(t), fetchImpl: badTree.fetchImpl }), /Invalid game data path/)
  const badShape = sourceFixture({ overrides: { 'excel/stage_table.json': {} } })
  await assert.rejects(loadGameDataSource({ revision: REVISION, cacheRoot: await cache(t), fetchImpl: badShape.fetchImpl }), /empty stage table/)
})

test('all five operator tables are required, including formerly optional MOD and team data', async (t) => {
  for (const path of ['excel/character_table.json', 'excel/skill_table.json', 'excel/uniequip_table.json',
    'excel/battle_equip_table.json', 'excel/handbook_team_table.json']) {
    const fixture = sourceFixture({ mutateTree: (tree) => tree.splice(tree.findIndex((entry) => entry.path === path), 1) })
    const progress = []
    await assert.rejects(loadGameDataSource({ revision: REVISION, cacheRoot: await cache(t), fetchImpl: fixture.fetchImpl,
      onProgress: (event) => progress.push(event) }), /Missing game data file/)
    assert.ok(progress.every((event) => event.phase === 'tables'))
  }
})

test('empty or malformed runtime tables reject the update before map loading', async (t) => {
  for (const [path, value] of [
    ['excel/character_table.json', {}],
    ['excel/character_table.json', { char_a: { name: 'A' } }],
    ['excel/skill_table.json', { skill_a: { levels: null } }],
    ['excel/uniequip_table.json', { equipDict: {}, subProfDict: {} }],
    ['excel/battle_equip_table.json', {}],
    ['excel/battle_equip_table.json', { equip_a: { phases: 3 } }],
    ['excel/handbook_team_table.json', {}],
    ['excel/handbook_team_table.json', { rhodes: { powerName: null } }],
  ]) {
    const fixture = sourceFixture({ overrides: { [path]: value } })
    await assert.rejects(loadGameDataSource({ revision: REVISION, cacheRoot: await cache(t), fetchImpl: fixture.fetchImpl }), /Invalid or empty|Invalid .* structure/)
    assert.ok(!fixture.calls.some(({ url }) => url.endsWith('/obt/main/a.json')))
  }
})

test('transient HTTP failure is retried, but permanent failure is not', async () => {
  let attempts = 0
  const revision = await fetchGameDataRevision({ fetchImpl: async () => {
    attempts += 1
    return attempts === 1 ? new Response('', { status: 503 }) : json([{ sha: REVISION }])
  } })
  assert.equal(revision, REVISION)
  assert.equal(attempts, 2)
  attempts = 0
  await assert.rejects(fetchGameDataRevision({ fetchImpl: async () => {
    attempts += 1
    return new Response('', { status: 403 })
  } }), /HTTP 403/)
  assert.equal(attempts, 1)
})

test('abort stops a request and prevents retries and subsequent downloads', async (t) => {
  const controller = new AbortController()
  let attempts = 0
  const pending = fetchGameDataRevision({ signal: controller.signal, fetchImpl: async (_url, { signal }) => {
    attempts += 1
    await delay(10_000, undefined, { signal })
    return json([{ sha: REVISION }])
  } })
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(attempts, 1)
  const fixture = sourceFixture()
  await assert.rejects(loadGameDataSource({ revision: REVISION, cacheRoot: await cache(t), signal: controller.signal, fetchImpl: fixture.fetchImpl }), { name: 'AbortError' })
  assert.equal(fixture.calls.length, 0)
})

test('level downloads use bounded concurrency without dropping results', async (t) => {
  const stages = {}
  const levels = {}
  for (let index = 0; index < 20; index += 1) {
    stages[index] = stage(`stage_${index}`)
    levels[`levels/obt/main/stage_${index}.json`] = level(`enemy_${index}`)
  }
  const fixture = sourceFixture({ stages, levels })
  let active = 0
  let maximum = 0
  const result = await loadGameDataSource({ revision: REVISION, cacheRoot: await cache(t), fetchImpl: async (url, options) => {
    if (!url.startsWith(RAW)) return fixture.fetchImpl(url, options)
    active += 1
    maximum = Math.max(maximum, active)
    await delay(10)
    try { return await fixture.fetchImpl(url, options) }
    finally { active -= 1 }
  } })
  assert.equal(result.levels.size, 20)
  assert.ok(maximum > 1 && maximum <= 8, `observed concurrency: ${maximum}`)
})

test('revision validation rejects mutable branch names without network access', async (t) => {
  const fixture = sourceFixture()
  await assert.rejects(loadGameDataSource({ revision: 'master', cacheRoot: await cache(t), fetchImpl: fixture.fetchImpl }), /Invalid revision SHA/)
  assert.equal(fixture.calls.length, 0)
})
