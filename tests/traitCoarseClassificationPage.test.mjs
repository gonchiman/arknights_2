import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Page, Detail, buildRecords
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()], logLevel: 'error',
    cacheDir: '.cache/vite-trait-page-test', resolve: { preserveSymlinks: true },
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  ;({ TraitCoarseClassificationPage: Page, TraitCoarseDetailModal: Detail } =
    await server.ssrLoadModule('/src/components/TraitCoarseClassificationPage.tsx'))
  ;({ buildTraitCoarseRecords: buildRecords } = await server.ssrLoadModule('/src/lib/traitCoarseClassification.ts'))
})
after(async () => { await server?.close() })

function operator(id, name, rarity = 6, description = '味方の治療対象にならない。敵を攻撃するたび自身のHPを70回復') {
  return { id: `${id}:s1`, operatorId: id, operatorName: name, profession: 'WARRIOR', professionLabel: '前衛',
    subProfessionId: 'musha', subProfessionName: '武者', rarity, skillIndex: 1,
    operatorProfile: { phases: [{ maxLevel: 50 }, { maxLevel: 90 }], traitDescription: description, talents: [] } }
}
const first = operator('char_first', '試験甲')
const second = operator('char_second', '試験乙')
const rows = [first, { ...first, id: 'char_first:s2', skillIndex: 2 }, second, operator('char_low', '試験丙', 4)]
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props))

test('職分と説明文を1行にまとめ、初期の星6絞り込みに合うOPだけを数える', () => {
  const markup = render(Page, { rows, loading: false, onOpenOperatorDetail() {} })
  assert.match(markup, /<h1>特性大分類<\/h1>/)
  assert.match(markup, /1 \/ 1 特性表示・2 OP/)
  const table = markup.match(/<table class="skill-coarse-table trait-coarse-table">([\s\S]*?)<\/table>/)[1]
  const body = table.match(/<tbody>([\s\S]*?)<\/tbody>/)[1]
  assert.equal((body.match(/<tr\b/g) || []).length, 1)
  assert.deepEqual([...table.matchAll(/<th\b[^>]*>(.*?)<\/th>/g)].map(match => match[1]), ['職業', '職分', '特性', '大分類候補', '該当OP数'])
  assert.doesNotMatch(table, /味方の治療対象|試験甲|rowspan|colspan|<br|<small/)
  assert.match(table, /武者の特性1の該当オペレーター2人を表示/)
  assert.match(markup, /role="region" aria-label="特性大分類の検索結果" tabindex="0"/)
})

test('詳細では説明文と該当OP一覧を表示し、既存OPモーダルへのリンクを持つ', () => {
  const [row] = buildRecords(rows)
  const markup = render(Detail, { row, onClose() {}, onOpenOperatorDetail() {} })
  assert.match(markup, /味方の治療対象にならない/)
  assert.match(markup, /HPを70回復/)
  assert.match(markup, /href="#\/operators\/char_first"[^>]*aria-haspopup="dialog"/)
  assert.equal((markup.match(/href="#\/operators\//g) || []).length, 3)
  assert.match(markup, new RegExp(`href="#/trait-structure\\?operatorId=${row.operators[0].operatorId}"`))
  assert.match(markup, />特性構造を表示<\/a>/)
  assert.match(markup, /role="region" aria-label="この特性を持つオペレーター" tabindex="0"/)
})

test('特性構造へのリンクは表示中の該当OPを選び、対象外の職分には表示しない', () => {
  const [row] = buildRecords(rows)
  const filtered = { ...row, operators: [row.operators[1]] }
  const markup = render(Detail, { row: filtered, onClose() {}, onOpenOperatorDetail() {} })
  assert.match(markup, new RegExp(`href="#/trait-structure\\?operatorId=${filtered.operators[0].operatorId}"`))
  assert.doesNotMatch(markup, new RegExp(`href="#/trait-structure\\?operatorId=${row.operators[0].operatorId}"`))
  for (const unsupported of [
    { ...row, profession: 'CASTER' },
    { ...row, subProfessionId: 'unknown-job' },
    { ...row, operators: [] },
  ]) {
    const unsupportedMarkup = render(Detail, { row: unsupported, onClose() {}, onOpenOperatorDetail() {} })
    assert.doesNotMatch(unsupportedMarkup, /href="#\/trait-structure/)
  }
})

test('読込中と0件を区別し、分類別件数も特性単位で表示する', () => {
  const loading = render(Page, { rows: [], loading: true, onOpenOperatorDetail() {} })
  assert.match(loading, /読み込み中/)
  assert.doesNotMatch(loading, /条件に一致する特性がありません/)
  const empty = render(Page, { rows: [], loading: false, onOpenOperatorDetail() {} })
  assert.match(empty, /条件に一致する特性がありません/)
  const markup = render(Page, { rows, loading: false, onOpenOperatorDetail() {} })
  assert.match(markup, /対象：1 特性・2 OP/)
  assert.match(markup, /該当特性数/)
  assert.match(markup, /role="tab" aria-selected="true"/)
  assert.match(markup, /role="tab" aria-selected="false"/)
  assert.doesNotMatch(markup, /NaN|Infinity/)
})
