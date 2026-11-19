import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildOperatorWikiDisplayRoster, filterOperatorWikiDisplayRoster, matchOperatorWikiDisplayEntries,
} from '../src/lib/operatorWikiDisplay.ts'
import { rankOperatorWikiTotals } from '../src/lib/operatorWikiViews.ts'

const page = (name: string) => `https://arknights.wikiru.jp/?${encodeURIComponent(name)}`
const newName = '新規オペレーター'
const wikiId = `wiki:${encodeURIComponent(newName)}`
const wikiRoster = [
  { operatorId: 'char_377_gdglow', name: 'ゴールデングロー', wikiUrl: page('ゴールデングロー'), profession: 'CASTER' as const, rarity: 6 },
  { operatorId: wikiId, name: newName, wikiUrl: page(newName), profession: 'SNIPER' as const, rarity: 5 },
]

test('ゲームデータを待たずにWiki名簿を表示し、名前・職業・レアリティで絞り込める', () => {
  const roster = buildOperatorWikiDisplayRoster([], wikiRoster)
  assert.deepEqual(roster.map(entry => entry.name), ['ゴールデングロー', newName])
  assert.deepEqual(filterOperatorWikiDisplayRoster(roster, {
    query: ' 新規 ', profession: 'SNIPER', rarity: 5,
  }).map(entry => entry.operatorId), [wikiId])
  assert.equal(filterOperatorWikiDisplayRoster(roster, {
    query: '', profession: 'SNIPER', rarity: 6,
  }).length, 0)

  const gameOnly = { operatorId: 'char_legacy', name: 'Ｌａｎｃｅｔ−２', profession: 'MEDIC', rarity: 1 }
  const union = buildOperatorWikiDisplayRoster([gameOnly], wikiRoster)
  assert.equal(union.length, 3)
  assert.deepEqual(filterOperatorWikiDisplayRoster(union, {
    query: 'lancet', profession: 'ALL', rarity: 'ALL',
  }).map(entry => entry.operatorId), ['char_legacy'])
})

test('Wiki先行のオペレーターにゲームIDが追加されても重複せず、旧IDと新IDの集計を引き継ぐ', () => {
  const roster = buildOperatorWikiDisplayRoster([
    { operatorId: 'char_new', name: newName, profession: 'SNIPER', rarity: 5 },
  ], wikiRoster)
  assert.equal(roster.length, 2)
  const added = roster.find(entry => entry.name === newName)!
  assert.equal(added.operatorId, wikiId)
  assert.deepEqual(added.sourceIds, [wikiId, 'char_new'])
  const oldViews = { operatorId: wikiId, wikiUrl: page(newName), total: 120 }
  const newComments = { operatorId: 'char_new', wikiUrl: page(`コメント/${newName}`), total: 8 }
  assert.equal(matchOperatorWikiDisplayEntries(roster, [oldViews]).get(wikiId), oldViews)
  assert.equal(matchOperatorWikiDisplayEntries(roster, [newComments]).get(wikiId), newComments)
})

test('WikiページURLで集計IDの変更を照合し、全名簿での順位と0件を保つ', () => {
  const roster = buildOperatorWikiDisplayRoster([], wikiRoster)
  const matched = matchOperatorWikiDisplayEntries(roster, [
    { operatorId: 'different-view-id', wikiUrl: page(newName), total: 100 },
    { operatorId: 'different-comment-id', wikiUrl: page('コメント/ゴールデングロー'), total: 0 },
  ])
  const ranks = rankOperatorWikiTotals(roster, roster.map(({ operatorId }) => ({
    operatorId, total: matched.get(operatorId)?.total ?? null,
  })))
  const filtered = filterOperatorWikiDisplayRoster(roster, { query: '', profession: 'CASTER', rarity: 'ALL' })
  assert.equal(filtered.length, 1)
  assert.equal(ranks.get(filtered[0].operatorId), 2)
  assert.equal(matched.get(filtered[0].operatorId)?.total, 0)
})

test('Wikiの正規ページ名で表記ゆれを統合し、Wiki情報のないゲームオペレーターも残す', () => {
  const wiki = { operatorId: 'wiki:amiya-guard', name: 'Wiki表記', wikiUrl: page('アーミヤ(前衛)'), profession: 'WARRIOR' as const, rarity: 5 }
  const roster = buildOperatorWikiDisplayRoster([
    { operatorId: 'char_amiya_guard', name: 'アーミヤ（前衛）', profession: 'WARRIOR', rarity: 5 },
    { operatorId: 'char_unlinked', name: '未対応', profession: 'MEDIC', rarity: 4 },
  ], [wiki])
  assert.equal(roster.length, 2)
  assert.equal(roster[0].operatorId, wiki.operatorId)
  assert.equal(roster[0].name, 'アーミヤ（前衛）')
  assert.deepEqual(roster[0].sourceIds, [wiki.operatorId, 'char_amiya_guard'])
  assert.equal(roster[1].wikiUrl, null)
  assert.equal(matchOperatorWikiDisplayEntries(roster, []).size, 0)
})

test('同名の形態はIDで照合し、別のWikiページへ統合しない', () => {
  const roster = buildOperatorWikiDisplayRoster([
    { operatorId: 'amiya', name: 'アーミヤ', profession: 'CASTER', rarity: 5 },
    { operatorId: 'amiya-guard', name: 'アーミヤ', profession: 'WARRIOR', rarity: 5 },
  ], [
    { operatorId: 'amiya', name: 'アーミヤ', wikiUrl: page('アーミヤ'), profession: 'CASTER', rarity: 5 },
    { operatorId: 'amiya-guard', name: 'アーミヤ(前衛)', wikiUrl: page('アーミヤ(前衛)'), profession: 'WARRIOR', rarity: 5 },
  ])
  assert.equal(roster.length, 2)
  assert.equal(roster[0].wikiUrl, page('アーミヤ'))
  assert.equal(roster[1].wikiUrl, page('アーミヤ(前衛)'))
  const matched = matchOperatorWikiDisplayEntries(roster, [
    { operatorId: 'amiya', wikiUrl: page('アーミヤ'), total: 90 },
    { operatorId: 'amiya-guard', wikiUrl: page('アーミヤ(前衛)'), total: 10 },
  ])
  assert.equal(matched.get('amiya')?.total, 90)
  assert.equal(matched.get('amiya-guard')?.total, 10)
})

test('Wikiの参照先を変更した直後は、旧ページの集計値を表示しない', () => {
  const roster = buildOperatorWikiDisplayRoster([], [{
    operatorId: 'char_113_cqbw', name: 'W', wikiUrl: page('W(プレイアブル)'), profession: 'SNIPER', rarity: 6,
  }])
  assert.equal(matchOperatorWikiDisplayEntries(roster, [{
    operatorId: 'char_113_cqbw', wikiUrl: page('W'), total: 10,
  }]).size, 0)
  assert.equal(matchOperatorWikiDisplayEntries(roster, [{
    operatorId: 'char_113_cqbw', wikiUrl: page('コメント/W(プレイアブル)'), total: 20,
  }]).get('char_113_cqbw')?.total, 20)
})
