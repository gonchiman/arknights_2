import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { buildTdDeploymentRoster, loadTdDeploymentRoster } from '../src/lib/tdDeploymentRoster.ts'
import { PROFESSION_ORDER } from '../src/lib/operatorFilters.ts'

test('TD deployment uses base placement traits and includes operators without skills', () => {
  const roster = buildTdDeploymentRoster({
    guard: { name: '前衛', displayNumber: 'A1', position: 'MELEE', rarity: 0 },
    pusher: { name: 'ショウ', displayNumber: 'A2', position: 'MELEE', rarity: 'TIER_4', profession: 'SPECIAL', subProfessionId: 'pusher' },
    hook: { name: '鉤縄師', displayNumber: 'A3', position: 'MELEE', subProfessionId: 'hookmaster' },
    summon: { name: '召喚物', displayNumber: null, position: 'MELEE' },
    unknown: { name: '未定義', displayNumber: 'A4', position: 'NONE' },
  }, { pusher: { subProfessionName: '推撃手' } })
  assert.deepEqual(Object.fromEntries(roster.map(row => [row.id, row.position])), {
    guard: 'MELEE', pusher: 'ALL', hook: 'ALL',
  })
  const pusher = roster.find(row => row.id === 'pusher')!
  assert.deepEqual([pusher.rarity, pusher.nameInitial], [4, 'S_ROW'])
  assert.equal(roster.find(row => row.id === 'guard')?.rarity, 1)
  assert.deepEqual([pusher.profession, pusher.subProfessionId, pusher.subProfessionName], ['SPECIAL', 'pusher', '推撃手'])
  assert.equal(roster.find(row => row.id === 'hook')?.subProfessionName, 'hookmaster')
})

test('the shipped roster supplies distinct melee and ranged operators without a game data server', async t => {
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    assert.equal(url, '/data/maps/td-deployment-roster.json')
    return new Response(await readFile(new URL('../public/data/maps/td-deployment-roster.json', import.meta.url), 'utf8'))
  })
  const roster = await loadTdDeploymentRoster()
  assert.equal(roster.length, new Set(roster.map(operator => operator.id)).size)
  assert.equal(roster.length, new Set(roster.map(operator => operator.shortName)).size)
  assert.ok(roster.every(op => Array.from(op.shortName).length > 0 && Array.from(op.shortName).length <= 2))
  assert.deepEqual(new Set(roster.map(operator => operator.profession)), new Set(PROFESSION_ORDER))
  assert.deepEqual(new Set(roster.map(operator => operator.rarity)), new Set([1, 2, 3, 4, 5, 6]))
  assert.ok(roster.every(op => op.subProfessionId && op.subProfessionName && op.subProfessionName !== op.subProfessionId))
  const surtr = roster.find(operator => operator.name === 'スルト')!
  assert.deepEqual([surtr.rarity, surtr.nameInitial], [6, 'S_ROW'])
  assert.deepEqual([surtr.profession, surtr.subProfessionId, surtr.subProfessionName], ['WARRIOR', 'artsfghter', '術戦士'])
  assert.equal(roster.find(operator => operator.name === 'メランサ')?.position, 'MELEE')
  assert.equal(roster.find(operator => operator.name === 'クルース')?.position, 'RANGED')
  const labels = new Map(roster.map(op => [op.name, op.shortName]))
  assert.deepEqual(['メランサ', 'メラナイト', 'メテオ', 'メテオリーテ'].map(name => labels.get(name)), ['メラ', 'メナ', 'メテ', 'メリ'])
})

test('local roster label collisions, including identical names, are resolved independently of data order', () => {
  const character = { name: 'テスト', displayNumber: 'A1', position: 'MELEE' }
  const entries = ['d', 'a', 'b', 'c'].map(id => [id, character] as const)
  const roster = buildTdDeploymentRoster(Object.fromEntries(entries))
  assert.deepEqual(roster, buildTdDeploymentRoster(Object.fromEntries(entries.reverse())))
  assert.equal(new Set(roster.map(op => op.shortName)).size, entries.length)
})
