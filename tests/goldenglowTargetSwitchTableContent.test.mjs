import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, content, image, imageModule
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()], cacheDir: 'node_modules/.vite/gg-target-switch-table-content-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  content = (await server.ssrLoadModule('/src/components/GoldenglowTargetSwitchTableContent.tsx')).GoldenglowTargetSwitchTableContent
  imageModule = await server.ssrLoadModule('/src/components/GoldenglowTargetSwitchTableImage.tsx')
  image = imageModule.GoldenglowTargetSwitchTableImage
})
after(async () => { await server?.close() })

const builds = [{ id: 'none', label: '未装備', moduleId: '', moduleType: null, moduleLevel: 0 },
  ...[1, 3].map(level => ({ id: `x:lv${level}`, label: `MOD X Lv.${level}`, moduleId: 'x', moduleType: 'X', moduleLevel: level })),
  { id: 'y:lv3', label: 'MOD Y Lv.3', moduleId: 'y', moduleType: 'Y', moduleLevel: 3 }]
const data = { builds, series: builds.map((build, index) => ({ id: build.id, label: build.label, moduleType: build.moduleType,
  points: [500, 2000].flatMap(enemyHp => [1, 5, 60].map(enemyResistance => ({ enemyHp, enemyResistance,
    expectedDamage: enemyHp + 100 * index - enemyResistance }))) })),
  hps: [500, 2000], resistances: [1, 5, 60], baseline: { kind: 'unequipped' }, metric: 'difference',
  layout: 'combined', precision: 0, showRanks: true, rankMode: 'merged', colorScale: 'LINEAR' }
const render = (changes = {}, props = {}) => renderToStaticMarkup(createElement(content, { data: { ...data, ...changes }, ...props }))
const cells = html => [...html.matchAll(/<td\b[^>]*data-build-id="([^"]+)"[^>]*data-hp="([^"]+)"[^>]*data-resistance="([^"]+)"[^>]*data-metric="([^"]+)"[^>]*>(.*?)<\/td>/gs)]
  .map(match => ({ key: match.slice(1, 5).join(':'), value: match[5].replace(/<[^>]*>/g, ''), color: /background-color:([^;"]+)/.exec(match[0])?.[1] }))
  .sort((a, b) => a.key.localeCompare(b.key))

test('数値表の転置はすべてのHP・術耐性・MOD・指標・色を保持する', () => {
  for (const layout of ['total', 'comparison', 'combined']) {
    const normal = cells(render({ layout }))
    assert.ok(normal.length > 0)
    assert.deepEqual(cells(render({ layout }, { transpose: true })), normal, layout)
  }
  assert.match(render(), /rowspan="2"/i)
  assert.match(render({}, { transpose: true }), /colspan="2"/i)
  assert.match(render({ rankMode: 'inline' }), /gg-switch-table-inline-rank/)
  assert.doesNotMatch(render({ rankMode: 'none', showRanks: false }), /gg-switch-table-inline-rank|術耐性<br\/>ランク/)
})

test('最大MODの表示は元のMOD列を畳み、全組み合わせに勝者名を表示する', () => {
  const html = render({ layout: 'winner', winnerColor: 'none' })
  assert.match(html, /module-winner-table/)
  assert.equal((html.match(/class="module-winner-label"/g) ?? []).length, 6)
  assert.match(html, />Y3<\/span>/)
  assert.equal(cells(html).length, 0)
  assert.doesNotMatch(html, /background-color:/)
  const transpose = render({ layout: 'winner' }, { transpose: true })
  assert.equal((transpose.match(/class="module-winner-label"/g) ?? []).length, 6)
})

test('画像上下配置はHPごとの表へ分けても値とカラースケールを変えない', () => {
  const common = { data, conditions: 'S3 特化3', title: '比較表', typography: { numberSize: '150', titleSize: 10, detailSize: 8 } }
  const current = renderToStaticMarkup(createElement(image, { ...common, imageLayout: 'current' }))
  const stacked = renderToStaticMarkup(createElement(image, { ...common, imageLayout: 'stacked' }))
  assert.deepEqual(cells(stacked), cells(current))
  assert.equal((stacked.match(/<table\b/g) ?? []).length, 2)
  assert.match(stacked, /敵HP 500/)
  assert.match(stacked, /敵HP 2,000/)
  assert.equal((stacked.match(/comparison-table-image-title"/g) ?? []).length, 1)
  assert.equal((stacked.match(/comparison-table-image-footer"/g) ?? []).length, 1)
})

test('段階画像は表示列のみを絞り比較元を保持する', () => {
  const snapshot = { data, conditions: 'S3 特化3' }
  const stage = imageModule.getGoldenglowTargetSwitchTableImageStageSnapshot(snapshot, 1)
  assert.deepEqual(stage.data.builds.map(build => build.id), ['none', 'x:lv1'])
  assert.equal(stage.data.series, data.series)
  const html = renderToStaticMarkup(createElement(image, stage))
  assert.match(html, /MOD Lv\.1/)
  assert.equal(cells(html).length, 18)
  assert.ok(cells(html).every(cell => !cell.key.startsWith('x:lv3') && !cell.key.startsWith('y:lv3')))
})

test('画像名は配置・文字設定・最大MODの有効設定を反映する', () => {
  const name = changes => imageModule.getGoldenglowTargetSwitchTableImageFilename({ data, conditions: 'S3 特化3', ...changes })
  const base = name({})
  assert.notEqual(name({ imageLayout: 'transpose' }), base)
  assert.notEqual(name({ imageLayout: 'stacked' }), base)
  assert.notEqual(name({ typography: { numberSize: '200', titleSize: 16, detailSize: 12 } }), base)
  assert.notEqual(name({ data: { ...data, rankMode: 'none' } }), base)
  const winner = { ...data, layout: 'winner', winnerColor: 'none', winnerGapShading: false }
  assert.equal(name({ data: winner }), name({ data: { ...winner, metric: 'percent', precision: 3, winnerGapShading: true } }))
  assert.notEqual(name({ data: { ...winner, winnerColor: 'module' } }), name({ data: { ...winner, winnerColor: 'module', winnerGapShading: true } }))
  assert.match(imageModule.getGoldenglowTargetSwitchTableImageFilename({ data, conditions: '' }, 16 / 9), /比率16x9\.png$/)
})
