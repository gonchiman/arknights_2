import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Picker, LegacyPicker
before(async () => {
  server = await createServer({
    configFile: false, plugins: [react()], cacheDir: 'node_modules/.vite/enemy-picker-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  ;({ EnemyPicker: Picker } = await server.ssrLoadModule('/src/components/EnemyPicker.tsx'))
  ;({ GoldenglowEnemyPicker: LegacyPicker } = await server.ssrLoadModule('/src/components/GoldenglowEnemyPicker.tsx'))
})
after(async () => { await server?.close() })

const enemy = (id, fields = {}) => ({
  id, index: id, sortId: 0, name: `敵${id}`, levelType: 'NORMAL', description: '', abilities: [],
  damageTypes: ['PHYSIC'], attackWay: 'MELEE', lifePointReduce: 1, databaseLevel: 0,
  databaseLevelCount: 1, stageAppearanceCount: Number(id) || 1, statusImmunities: [],
  ratings: { endurance: null, attack: null, defense: null, resistance: null },
  stats: { maxHp: 1000, attack: 200, defense: 0, magicResistance: 20, moveSpeed: 1,
    attackSpeed: 200, baseAttackTime: 4, massLevel: 1 }, ...fields,
})
const render = (props = {}, Component = Picker) => renderToStaticMarkup(createElement(Component, {
  enemies: [enemy('1')], loading: false, error: null, onRetry: () => {}, onSelect: () => {}, ...props,
}))
const text = markup => markup.replace(/<[^>]*>/g, '').replaceAll('&#x27;', "'")
const headLabels = markup => [...(markup.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/)?.[1] ?? '').matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)]
  .map(match => text(match[1]).replace(/[↑↓↕]/g, ''))
const bodyRows = markup => [...(markup.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/)?.[1] ?? '').matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/g)]
  .map(match => ({ attrs: match[1], html: match[2], cells: [...match[2].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(cell => text(cell[1])) }))

test('GGラッパーと標準ピッカーは従来の5列・HP/術耐性フィルターを維持する', () => {
  for (const Component of [Picker, LegacyPicker]) {
    const markup = render({}, Component)
    assert.deepEqual(headLabels(markup), ['敵名', '区分', 'HP', '術耐性', '登場ステージ数'])
    assert.deepEqual(bodyRows(markup)[0].cells, ['敵1', '通常', '1,000', '20', '1'])
    for (const label of ['HPの下限', 'HPの上限', '術耐性の下限', '術耐性の上限']) assert.ok(markup.includes(`aria-label="${label}"`))
    assert.doesNotMatch(markup, /攻撃間隔（秒）の下限|<select/)
    assert.match(markup, /aria-label="敵の区分"/)
    assert.match(markup, /<details class="gg-enemy-picker-search">/)
    assert.match(markup, /aria-sort="descending"[^>]*><button[^>]*aria-label="登場ステージ数を昇順/)
  }
})

test('戦闘用は補正後の間隔を含む6列と戦闘フィルターを表示する', () => {
  const markup = render({ variant: 'combat' })
  assert.deepEqual(headLabels(markup), ['敵名', '区分', '攻撃力', '攻撃種別', '攻撃間隔（秒）', '登場ステージ数'])
  assert.deepEqual(bodyRows(markup)[0].cells, ['敵1', '通常', '200', '物理', '2', '1'])
  for (const label of ['攻撃力の下限', '攻撃力の上限', '攻撃間隔（秒）の下限', '攻撃間隔（秒）の上限']) assert.ok(markup.includes(`aria-label="${label}"`))
  assert.doesNotMatch(markup, /HPの下限|術耐性の下限/)
  for (const label of ['物理', '術', '確定', '混合・不明', '通常攻撃なし']) assert.ok(markup.includes(`>${label}</option>`))
  assert.match(markup, /aria-sort="descending"[^>]*><button[^>]*aria-label="登場ステージ数を昇順/)
})

test('選択できない敵は一覧に残し、理由と無効ボタンを表示する', () => {
  let selections = 0
  const markup = render({ variant: 'combat', selectedEnemyId: '1',
    enemies: [enemy('1'), enemy('2', { damageTypes: ['NO_DAMAGE'] })],
    getSelectDisabledReason: foe => foe.id === '2' ? '通常攻撃なし' : null,
    onSelect: () => { selections++ },
  })
  const rows = bodyRows(markup)
  const disabled = rows.find(row => row.attrs.includes('data-enemy-id="2"'))
  assert.match(disabled.attrs, /aria-disabled="true"/)
  assert.match(disabled.html, /<button\b[^>]*disabled=""/)
  assert.ok(disabled.cells[0].includes('通常攻撃なし'))
  assert.deepEqual(disabled.cells.slice(1), ['通常', '—', '通常攻撃なし', '—', '2'])
  const selected = rows.find(row => row.attrs.includes('data-enemy-id="1"'))
  assert.match(selected.attrs, /aria-current="true"/)
  assert.doesNotMatch(selected.html, /disabled=""/)
  assert.ok(selected.cells[0].includes('選択中'))
  assert.equal(selections, 0)
})

test('読み込み・エラー・空状態のセル範囲は表示列数と一致する', () => {
  for (const [variant, columns] of [['stats', 5], ['combat', 6]]) {
    for (const state of [{ loading: true }, { error: '取得エラー' }, { enemies: [] }]) {
      const markup = render({ variant, ...state })
      assert.match(markup, new RegExp(`colSpan="${columns}"|colspan="${columns}"`))
      assert.equal(bodyRows(markup).length, 1)
    }
    const failed = render({ variant, error: '取得エラー' })
    assert.match(failed, /role="alert">取得エラー/)
    assert.match(failed, />再読み込み<\/button>/)
  }
})

test('初期表示は登場ステージ数の降順で20体、続きを表示できる', () => {
  const markup = render({ variant: 'combat', enemies: Array.from({ length: 23 }, (_, index) => enemy(String(index + 1))) })
  const rows = bodyRows(markup)
  assert.equal(rows.length, 20)
  assert.match(rows[0].attrs, /data-enemy-id="23"/)
  assert.match(rows.at(-1).attrs, /data-enemy-id="4"/)
  assert.match(markup, />20 \/ 23体<\/p>/)
  assert.match(markup, />さらに3体を表示<\/button>/)
})
