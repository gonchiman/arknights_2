import assert from 'node:assert/strict'
import test from 'node:test'
import { parseOperatorWikiPage } from '../scripts/refreshOperatorWikiViews.mjs'
import { APP_NAV_ITEMS } from '../src/lib/navigation.ts'
import {
  buildOperatorWikiViewRows,
  parseOperatorWikiViewSnapshot,
  rankOperatorWikiTotals,
  sortOperatorWikiViewRows,
} from '../src/lib/operatorWikiViews.ts'
import { parseHashRoute } from '../src/lib/routes.ts'

const goldenglowUrl = `https://arknights.wikiru.jp/?${encodeURIComponent('ゴールデングロー')}`
const surtrUrl = `https://arknights.wikiru.jp/?${encodeURIComponent('スルト')}`
const snapshot = {
  observedAt: '2026-11-12T09:10:00.000Z',
  todayDate: '2026-11-12',
  yesterdayDate: '2026-11-11',
  entries: [
    { operatorId: 'char_377_gdglow', wikiUrl: goldenglowUrl, yesterday: 105, today: 0, total: 620296 },
    { operatorId: 'char_350_surtr', wikiUrl: surtrUrl, yesterday: 0, today: null, total: 12000 },
  ],
}

test('個別ページの見出しを照合し、トップページのカウンターを誤採用しない', () => {
  const html = `<h1 class="title"><a href="./?plugin=related&amp;page=operator">アーミヤ(前衛)</a></h1>
    <h2>カウンター</h2><ul><li>合計：1,230</li><li>今日：0</li><li>昨日：19</li></ul>`
  assert.deepEqual(parseOperatorWikiPage(html, 'アーミヤ(前衛)'), { total: 1230, today: 0, yesterday: 19 })
  assert.throws(() => parseOperatorWikiPage(html, 'アーミヤ'))
  assert.throws(() => parseOperatorWikiPage(html.replace('<li>昨日：19</li>', ''), 'アーミヤ(前衛)'))
})

test('Wiki 閲覧数のデータは不正な日付・件数や、別ページへのリンクを受け付けない', () => {
  assert.deepEqual(parseOperatorWikiViewSnapshot(snapshot), snapshot)

  const [goldenglow, surtr] = snapshot.entries
  for (const invalid of [
    { ...snapshot, observedAt: 'invalid' },
    { ...snapshot, todayDate: '2026-02-30' },
    { ...snapshot, entries: [{ ...goldenglow, yesterday: -1 }] },
    { ...snapshot, entries: [{ ...goldenglow, today: 1.5 }] },
    { ...snapshot, entries: [{ ...goldenglow, total: '620296' }] },
    { ...snapshot, entries: [{ ...goldenglow, wikiUrl: goldenglowUrl.replace('wikiru.jp', 'example.com') }] },
    { ...snapshot, entries: [{ ...goldenglow, wikiUrl: `${goldenglowUrl}&cmd=edit` }] },
    { ...snapshot, entries: [{ ...goldenglow, wikiUrl: goldenglowUrl.replace('/?', '/index.php?') }] },
    { ...snapshot, entries: [goldenglow, { ...surtr, operatorId: goldenglow.operatorId }] },
    { ...snapshot, entries: [goldenglow, { ...surtr, wikiUrl: goldenglow.wikiUrl }] },
  ]) {
    assert.throws(() => parseOperatorWikiViewSnapshot(invalid))
  }
})

test('閲覧数は表示名にかかわらずオペレーター ID で照合し、未取得は昇順でも降順でも最後に置く', () => {
  const operators = [
    { operatorId: 'char_002_amiya', name: 'アーミヤ' },
    { operatorId: 'char_350_surtr', name: '同じ表示名' },
    { operatorId: 'char_377_gdglow', name: '同じ表示名' },
  ]
  const rows = buildOperatorWikiViewRows(operators, parseOperatorWikiViewSnapshot(snapshot))
  assert.deepEqual(rows.map(({ operatorId, wikiUrl, yesterday }) => [operatorId, wikiUrl, yesterday]), [
    ['char_002_amiya', null, null],
    ['char_350_surtr', surtrUrl, 0],
    ['char_377_gdglow', goldenglowUrl, 105],
  ])
  assert.deepEqual(sortOperatorWikiViewRows(rows, { key: 'yesterday', direction: 'desc' }).map(row => row.yesterday), [
    105, 0, null,
  ])
  assert.deepEqual(sortOperatorWikiViewRows(rows, { key: 'yesterday', direction: 'asc' }).map(row => row.yesterday), [
    0, 105, null,
  ])
})

test('累計順位はオペレーターIDで対応し、同数、実測0、未取得を区別する', () => {
  const operators = ['top', 'tie-a', 'tie-b', 'zero', 'missing', 'absent'].map(operatorId => ({ operatorId }))
  const entries = [
    { operatorId: 'zero', total: 0 },
    { operatorId: 'tie-b', total: 80 },
    { operatorId: 'missing', total: null },
    { operatorId: 'top', total: 100 },
    { operatorId: 'outside', total: 150 },
    { operatorId: 'tie-a', total: 80 },
  ]

  const ranks = rankOperatorWikiTotals(operators, entries)
  assert.deepEqual(operators.map(({ operatorId }) => ranks.get(operatorId)), [1, 2, 2, 4, undefined, undefined])
  assert.equal(ranks.has('outside'), false)
})

test('オペレーター別 Wiki 閲覧数は分析メニューのリンクから開く', () => {
  const href = '#/analysis/operators/wiki-views'
  const item = APP_NAV_ITEMS.find(item => item.href === href)

  assert.equal(item?.section, 'analysis')
  assert.deepEqual(parseHashRoute(href), { view: 'operator-wiki-views' })
})
