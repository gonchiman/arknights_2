import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Comparison, SummaryTable, ChangesTable, canonical, diff, summarize
const index = JSON.parse(readFileSync(new URL('../public/data/dc3-coverage/index.json', import.meta.url), 'utf8'))
const saved = index.versions.map(version => JSON.parse(readFileSync(new URL(`../public/data/dc3-coverage/${version.file}`, import.meta.url), 'utf8')))
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()], logLevel: 'error',
    cacheDir: 'node_modules/.vite/dc3-version-comparison-test', resolve: { preserveSymlinks: true },
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  ;({ DamageCalculatorThreeCoverageVersionComparison: Comparison, CoverageVersionSummaryTable: SummaryTable,
    CoverageVersionChangesTable: ChangesTable } = await server.ssrLoadModule('/src/components/DamageCalculatorThreeCoverageVersionComparison.tsx'))
  ;({ canonicalCoverageJson: canonical, diffCoverageRecords: diff } = await server.ssrLoadModule('/src/lib/damageCalculatorThreeCoverageHistory.ts'))
  ;({ summarizeCoverageVersions: summarize } = await server.ssrLoadModule('/src/lib/damageCalculatorThreeCoverageComparison.ts'))
})
after(async () => { await server?.close() })

const render = (Component, props) => renderToStaticMarkup(createElement(Component, props))
const text = value => value.replace(/<[^>]+>/g, '').trim()
const tableRows = html => [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)]
  .map(row => [...row[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/g)].map(cell => text(cell[1])))
const snapshots = () => Object.fromEntries(index.versions.map((version, i) => [canonical(version), saved[i]]))
const props = (overrides = {}) => ({ versions: index.versions, snapshots: snapshots(), selectedIds: ['v1', 'v2'],
  onSelectedIdsChange() {}, loading: false, error: '', onRetry() {}, onDetail() {}, ...overrides })

test('保存版の915スキルを同じ4区分で並べ、凡例1つと正しい総合差分を表示する', () => {
  const html = render(Comparison, props())
  assert.equal((html.match(/class="coverage-stacked-track"/g) ?? []).length, 8)
  assert.equal((html.match(/aria-label="実装状況の凡例"/g) ?? []).length, 1)
  assert.equal((html.match(/class="coverage-stacked-counts"/g) ?? []).length, 0)
  assert.doesNotMatch(html, / title="/)
  assert.match(html, /<option value="ALL" selected="">すべて<\/option>/)
  assert.match(html, /v1：915スキル中、対応 242件（26.4%）/)
  assert.match(html, /v2：915スキル中、対応 286件（31.3%）/)
  assert.deepEqual(tableRows(html), [
    ['版', '対応', '条件付き', '保留', '未対応', '対象外', '合計'],
    ['v1', '242', '10', '63', '600', '0', '915'],
    ['v2', '286', '10', '77', '542', '0', '915'],
    ['v2 − v1', '+44', '0', '+14', '−58', '0', '0'],
  ])
  assert.match(html, /新規対応 44・登録追加 14/)
  assert.match(html, /aria-label="v1からv2の変更スキル 71件"/)
  assert.match(html, /aria-label="各版の総合対応件数" tabindex="0"/)
})

test('1版だけなら4本と件数を表示し、差分行や変更ボタンは表示しない', () => {
  const html = render(Comparison, props({ selectedIds: ['v2'] }))
  assert.equal((html.match(/class="coverage-stacked-track"/g) ?? []).length, 4)
  assert.deepEqual(tableRows(html).slice(1), [['v2', '286', '10', '77', '542', '0', '915']])
  assert.doesNotMatch(html, /変更スキル|damage-three-version-delta/)
})

test('対象外への分類は新規対応に加算せず、別の件数・差分ラベルを表示する', () => {
  const before = structuredClone(saved[0].rows[0])
  before.status = 'UNSUPPORTED'
  const after = { ...structuredClone(before), status: 'NOT_APPLICABLE',
    sections: { skill: 'NOT_APPLICABLE', talent: 'NOT_APPLICABLE', trait: 'NOT_APPLICABLE' } }
  const versions = index.versions.slice(0, 2)
  const changedSnapshots = Object.fromEntries(versions.map((version, i) => [canonical(version),
    { ...saved[i], rows: [i === 0 ? before : after] }]))
  const html = render(Comparison, props({ versions, snapshots: changedSnapshots }))
  assert.match(html, /新規対応 0・登録追加 0・対象外に分類 1/)
  assert.deepEqual(tableRows(html).at(-1), ['v2 − v1', '0', '0', '0', '−1', '+1', '0'])
  const changes = diff([before], [after])
  const list = tableRows(render(ChangesTable, { changes, before: versions[0], after: versions[1], onDetail() {} }))
  assert.deepEqual(list[1].slice(3, 6), ['未対応', '対象外', '対象外に分類'])
})

test('選択なし・保存なし・読み込み中・取得失敗を区別して部分データを表示しない', () => {
  for (const [overrides, message] of [
    [{ selectedIds: [] }, '比較する版を選択してください'],
    [{ versions: [], selectedIds: [] }, '保存された版がありません'],
    [{ snapshots: { [canonical(index.versions[0])]: saved[0] } }, '読み込み中…'],
    [{ loading: true }, '読み込み中…'],
    [{ error: '保存データを取得できませんでした。' }, '保存データを取得できませんでした。'],
    [{ selectedIds: ['v99'] }, 'バージョン「v99」がありません。'],
  ]) {
    const html = render(Comparison, props(overrides))
    assert.ok(html.includes(message), message)
    assert.doesNotMatch(html, /class="coverage-stacked-track"|<table/, message)
  }
})

test('3版以上でも数値順で各版の分母と隣接版との差を保持する', () => {
  const extra = structuredClone(saved[1].rows[0])
  extra.skill.operatorId = 'new-operator'
  const v10 = { ...index.versions[1], id: 'v10', label: 'v10 テスト版', file: 'v10.json' }
  const v10Snapshot = { ...saved[1], id: 'v10', rows: [...saved[1].rows, extra] }
  const entries = summarize([v10, ...index.versions], { ...snapshots(), [canonical(v10)]: v10Snapshot },
    ['v10', 'v2', 'v1'], { profession: 'ALL', rarity: 'ALL' })
  const rows = tableRows(render(SummaryTable, { entries }))
  assert.deepEqual(rows.slice(1).map(row => row[0]), ['v1', 'v2', 'v2 − v1', 'v10', 'v10 − v2'])
  assert.deepEqual(rows.slice(1).map(row => row.at(-1)), ['915', '915', '0', '916', '+1'])
})

test('変更表は追加・削除を空欄側とラベルで区別し、既存詳細のボタンを持つ', () => {
  const added = structuredClone(saved[1].rows[0]), removed = structuredClone(saved[0].rows[1])
  added.skill.operatorId = 'catalog-added'; added.skill.operatorName = '追加OP'
  removed.skill.operatorId = 'catalog-removed'; removed.skill.operatorName = '削除OP'
  const changes = diff([removed], [added])
  const html = render(ChangesTable, { changes, before: index.versions[0], after: index.versions[1], onDetail() {} })
  const rows = tableRows(html)
  const addedCells = rows.find(row => row[0] === '追加OP'), removedCells = rows.find(row => row[0] === '削除OP')
  assert.equal(addedCells[3], '—')
  assert.equal(addedCells[5], 'カタログ追加')
  assert.equal(removedCells[4], '—')
  assert.equal(removedCells[5], 'カタログ削除')
  assert.match(html, /aria-haspopup="dialog" aria-label="追加OP S\d+の変更詳細"/)
  assert.match(html, /aria-label="版間で変更されたスキル" tabindex="0"/)
  assert.equal(rows.length, 3)
})

test('変更がない版の一覧は空の表ではなく状態を示す', () => {
  const html = render(ChangesTable, { changes: [], before: index.versions[0], after: index.versions[1], onDetail() {} })
  assert.match(html, /role="status">変更されたスキルはありません/)
  assert.doesNotMatch(html, /<table/)
})
