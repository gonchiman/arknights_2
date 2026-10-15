import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

let server, loadSkillRecords, urls, getOperatorAffiliationIds

before(async () => {
  server = await createServer({
    configFile: false, logLevel: 'error',
    cacheDir: 'node_modules/.vite/operator-affiliation-data-test',
    resolve: { preserveSymlinks: true },
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false },
    appType: 'custom',
  })
  ;({ loadSkillRecords, DATA_URLS: urls } = await server.ssrLoadModule('/src/lib/arknightsData.ts'))
  ;({ getOperatorAffiliationIds } = await server.ssrLoadModule('/src/lib/operatorAffiliation.ts'))
})

after(async () => { await server?.close() })

const character = affiliations => ({
  name: 'テストOP', displayNumber: 'TEST', profession: 'WARRIOR', rarity: 'TIER_6',
  skills: [{ skillId: 'test_s1' }, { skillId: 'test_s2' }], ...affiliations,
})

async function loadCharacters(characters, handbook = { ok: true, json: async () => ({}) }) {
  const previousFetch = globalThis.fetch
  const data = new Map([
    [urls.character, characters],
    [urls.skill, {
      test_s1: { levels: [{ name: 'S1', description: '攻撃力+10%' }] },
      test_s2: { levels: [{ name: 'S2', description: '攻撃力+20%' }] },
    }],
    [urls.uniequip, {}], [urls.battleEquip, {}],
  ])
  globalThis.fetch = async url => {
    if (url === urls.handbookTeam) {
      if (handbook instanceof Error) throw handbook
      return handbook
    }
    assert.ok(data.has(url), `unexpected fetch: ${url}`)
    return { ok: true, json: async () => structuredClone(data.get(url)) }
  }
  try { return await loadSkillRecords() }
  finally { globalThis.fetch = previousFetch }
}

test('技能データの取得時に所属IDをすべて保持し、表示名の優先順位と混同しない', async () => {
  const rows = await loadCharacters({ char_test: character({ nationId: ' aegir ', groupId: 'abyssal', teamId: 'test_team' }) }, {
    ok: true, json: async () => ({ test_team: { powerName: '表示用チーム名' }, abyssal: { powerName: 'アビサル' } }),
  })
  assert.equal(rows.length, 2)
  for (const row of rows) {
    assert.equal(row.operatorProfile.affiliation, '表示用チーム名')
    assert.deepEqual(row.operatorProfile.affiliationIds, { nationId: 'aegir', groupId: 'abyssal', teamId: 'test_team' })
  }
})

test('所属が明示的にない場合と、データが欠けた場合を取得後も区別する', async () => {
  const rows = await loadCharacters({
    char_none: character({ nationId: null, groupId: '', teamId: '  ' }),
    char_partial: character({ groupId: 'abyssal' }),
    char_invalid: character({ nationId: 123, groupId: false, teamId: [] }),
  })
  const profile = id => rows.find(row => row.operatorId === id).operatorProfile
  assert.deepEqual(profile('char_none').affiliationIds, { nationId: null, groupId: null, teamId: null })
  assert.deepEqual(profile('char_partial').affiliationIds, { groupId: 'abyssal' })
  assert.equal(Object.hasOwn(profile('char_partial').affiliationIds, 'nationId'), false)
  assert.deepEqual(profile('char_invalid').affiliationIds, {})
})

test('所属名の取得失敗時も生の所属IDは残り、翻訳文字列から推定しない', async () => {
  for (const handbook of [{ ok: false }, new Error('offline')]) {
    const rows = await loadCharacters({ char_test: character({ nationId: null, groupId: 'abyssal', teamId: null }) }, handbook)
    assert.deepEqual(rows[0].operatorProfile.affiliationIds, { nationId: null, groupId: 'abyssal', teamId: null })
    assert.equal(rows[0].operatorProfile.affiliation, 'abyssal')
  }
  assert.deepEqual(getOperatorAffiliationIds({}), {})
  assert.deepEqual(getOperatorAffiliationIds({ affiliation: 'アビサル' }), {})
})
