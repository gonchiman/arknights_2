import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  mergeOperatorWikiRoster, parseOperatorWikiRosterHtml, refreshOperatorWikiRoster, resolveOperatorWikiRosterUrl,
} from '../scripts/refreshOperatorWikiRoster.mjs'
import { parseOperatorWikiRosterSnapshot } from '../src/lib/operatorWikiRoster.ts'

const root = 'https://arknights.wikiru.jp/'
const url = title => root + '?' + encodeURIComponent(title)
const observedAt = '2026-11-19T01:00:00Z'
const page = body => '<head><link rel="canonical" href="' + url('キャラクター一覧') + '"></head>'
  + '<h1>キャラクター一覧</h1><div id="body">' + body + '</div>'
const headings = ['画像', '名前', '職業', '職分', 'HP', '攻撃力', '防御力', '術耐性', '再配置', 'コスト', 'ブロック数', '攻撃速度', '入手方法', '募集タグ']
const table = rows => '<table><tr>' + headings.map(title => '<th>' + title + '</th>').join('') + '</tr>'
  + rows.map(({ name, title = name, profession }) => '<tr><td><img /></td><td><a href="./?'
    + encodeURIComponent(title) + '">' + name + '</a></td><td>' + profession + '</td>'
    + Array.from({ length: 11 }, () => '<td></td>').join('') + '</tr>').join('') + '</table>'
const sources = [
  { name: '焔狐竜オーキッド', profession: '狙撃' },
  { name: 'ジンオウSカタパルト', profession: '前衛' },
  { name: 'ジェイ', profession: '特殊' },
  { name: 'オーキッド', profession: '補助' },
  { name: 'ヤトウ', profession: '先鋒' },
  { name: 'Lancet-2', profession: '医療' },
]
const mainList = source => source.map((row, index) => '<h3>★' + (6 - index) + 'キャラ <a>†</a></h3>' + table([row])).join('')

test('current JP tables include a new alter and skip separately labeled future and limited-mode tables', () => {
  const future = '<h3>日本未実装キャラ <a>†</a></h3>' + table([{ name: '将来のキャラ', profession: '重装' }])
  const temporary = '<h3>統合戦略・保全駐在限定キャラ <a>†</a></h3>' + table([{ name: '助っ人', profession: '術師' }])
  const input = sources.map((row, index) => '<h3>★' + (6 - index) + 'キャラ <a>†</a></h3>'
    + table([row]) + future + temporary).join('')
  const rows = parseOperatorWikiRosterHtml(page(input))
  assert.equal(rows.length, 6)
  assert.deepEqual(rows[0], { name: '焔狐竜オーキッド', wikiUrl: url('焔狐竜オーキッド'), profession: 'SNIPER', rarity: 6 })
  assert.deepEqual(rows.at(-1), { name: 'Lancet-2', wikiUrl: url('Lancet-2'), profession: 'MEDIC', rarity: 1 })
})

test('incomplete Wiki responses and unfamiliar operator row structures fail before publication', () => {
  const valid = page(mainList(sources))
  assert.throws(() => parseOperatorWikiRosterHtml(valid.replace('<h1>キャラクター一覧</h1>', '<h1>FrontPage</h1>')), /見出し/)
  assert.throws(() => parseOperatorWikiRosterHtml(valid.replace('<h3>★1キャラ', '<h3>日本未実装キャラ')), /各レアリティ/)
  assert.throws(() => parseOperatorWikiRosterHtml(valid.replace('<th>職業</th>', '<th>変更後</th>')), /列構成/)
  assert.throws(() => parseOperatorWikiRosterHtml(valid.replace('<td>狙撃</td>', '<td>新職業</td>')), /職業/)
  assert.throws(() => parseOperatorWikiRosterHtml(valid.replace('./?' + encodeURIComponent(sources[0].name), 'https://example.com/?example')), /リンク|不正/)
})

test('stable identities preserve saved metrics, W playable identity and previous roster entries', () => {
  const discovered = parseOperatorWikiRosterHtml(page(mainList(sources)))
  discovered.push({ name: 'W', wikiUrl: url('W(プレイアブル)'), profession: 'SNIPER', rarity: 6 })
  const viewsSnapshot = { entries: [
    { operatorId: 'char_278_orchid', wikiUrl: url('オーキッド') },
    { operatorId: 'char_113_cqbw', wikiUrl: url('W') },
  ] }
  const retained = { operatorId: 'retained', name: '以前のキャラ', wikiUrl: url('以前のキャラ'), profession: 'TANK', rarity: 5 }
  const previousRoster = { entries: [retained] }
  const entries = mergeOperatorWikiRoster(discovered, { viewsSnapshot, previousRoster })
  assert.equal(entries.find(row => row.name === 'オーキッド').operatorId, 'char_278_orchid')
  assert.equal(entries.find(row => row.name === 'W').operatorId, 'char_113_cqbw')
  assert.equal(entries.find(row => row.name === sources[0].name).operatorId, 'wiki:' + encodeURIComponent(sources[0].name))
  assert.deepEqual(entries.at(-1), retained)
  assert.deepEqual(mergeOperatorWikiRoster(discovered, { viewsSnapshot, previousRoster: { entries } }), entries)
})

test('canonical link decoding keeps raw query plus and escaped literal plus distinct', () => {
  assert.equal(resolveOperatorWikiRosterUrl('./?Big+Bob'), url('Big Bob'))
  assert.equal(resolveOperatorWikiRosterUrl('./?Big%2BBob'), url('Big+Bob'))
  assert.equal(resolveOperatorWikiRosterUrl('./?cmd=read&page=W'), null)
  assert.equal(resolveOperatorWikiRosterUrl('./?W#section'), null)
})

test('roster snapshot validates identities, classifications and canonical URLs', () => {
  const entry = { operatorId: 'wiki:new', name: '新キャラ', wikiUrl: url('新キャラ'), profession: 'CASTER', rarity: 6 }
  const snapshot = { observedAt, entries: [entry] }
  assert.deepEqual(parseOperatorWikiRosterSnapshot(snapshot), snapshot)
  assert.throws(() => parseOperatorWikiRosterSnapshot({ ...snapshot, entries: [entry, entry] }), /形式/)
  for (const change of [{ rarity: 0 }, { rarity: 7 }, { profession: '医療' }, { wikiUrl: 'https://example.com/' }]) {
    assert.throws(() => parseOperatorWikiRosterSnapshot({ ...snapshot, entries: [{ ...entry, ...change }] }), /形式/)
  }
})

test('roster refresh can replay saved source without editing the view snapshot and preserves a prior valid roster on parse failure', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'wiki-roster-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const viewsPath = join(directory, 'views.json')
  const views = { observedAt, todayDate: '2026-11-19', yesterdayDate: '2026-11-18', entries: [{
    operatorId: 'char_278_orchid', wikiUrl: url('オーキッド'), today: 5, yesterday: 10, total: 80_000,
  }] }
  await writeFile(viewsPath, JSON.stringify(views))
  const options = {
    viewsPath, rosterPath: join(directory, 'roster.json'), sourcePath: join(directory, 'source.html'),
    stagingDirectory: join(directory, 'staging'), now: () => new Date(observedAt),
  }
  const snapshot = await refreshOperatorWikiRoster({ ...options, request: async address => {
    assert.equal(address, url('キャラクター一覧'))
    return page(mainList(sources))
  } })
  assert.equal(snapshot.entries.find(row => row.name === 'オーキッド').operatorId, 'char_278_orchid')
  assert.deepEqual(JSON.parse(await readFile(viewsPath, 'utf8')), views)
  const saved = await readFile(options.rosterPath, 'utf8')
  await assert.rejects(refreshOperatorWikiRoster({ ...options, request: async () => page('') }), /各レアリティ/)
  assert.equal(await readFile(options.rosterPath, 'utf8'), saved)
})
