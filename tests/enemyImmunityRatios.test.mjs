import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Ratios, counts
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()], logLevel: 'error',
    cacheDir: 'node_modules/.vite/enemy-immunity-ratios-test', resolve: { preserveSymlinks: true },
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  ;({ EnemyImmunityRatios: Ratios } = await server.ssrLoadModule('/src/components/EnemyImmunityRatios.tsx'))
  const { parseEnemyHistogramCounts } = await server.ssrLoadModule('/src/lib/enemyHistogramCounts.ts')
  counts = parseEnemyHistogramCounts({ schemaVersion: 1, generatedAt: '', sourceGeneratedAt: null,
    summary: { mapCount: 1, missingMapCount: 0, spawnMapCount: 1, spawnExcludedMapCount: 0 },
    enemies: Object.fromEntries(Object.entries({ n1: 10, n2: 30, e1: 20, e2: 5, e3: 15, b1: 20 })
      .map(([id, spawnCount]) => [id, { mapCount: 1, spawnCount }])) })
})
after(async () => { await server?.close() })

const enemy = (id, levelType, immune) => ({ id, levelType, statusImmunities: immune ? ['沈黙'] : [] })
const rows = [enemy('n1', 'NORMAL', true), enemy('n2', 'NORMAL', false),
  enemy('e1', 'ELITE', true), enemy('e2', 'ELITE', false), enemy('e3', 'ELITE', false), enemy('b1', 'BOSS', true)]
const render = (props = {}) => renderToStaticMarkup(createElement(Ratios,
  { rows, immunityKey: 'silenceImmune', countMode: 'TYPES', counts, levelType: 'ALL', ...props }))
const chartRows = markup => new Map([...markup.matchAll(/data-coverage-section="([^"]+)"([\s\S]*?)(?=data-coverage-section=|<\/section>|$)/g)]
  .map(([, key, content]) => [key, content]))
const segments = markup => [...markup.matchAll(/data-coverage-status="([^"]+)" style="--coverage-bar-color:([^;]+);width:([^%]+)%"/g)]
  .map(([, key, color, width]) => ({ key, color, width: Number(width) }))

test('全体の耐性ありを区分で分け、各区分の保有率とは異なる分母で表示する', () => {
  const markup = render()
  const rendered = chartRows(markup)
  assert.deepEqual([...rendered.keys()], ['ALL', 'NORMAL', 'ELITE', 'BOSS'])
  const overall = segments(rendered.get('ALL'))
  assert.deepEqual(overall.map(segment => segment.key), ['NORMAL', 'ELITE', 'BOSS', 'absent'])
  overall.forEach((segment, index) => assert.ok(Math.abs(segment.width - [100 / 6, 100 / 6, 100 / 6, 50][index]) < 1e-10))
  assert.match(rendered.get('ALL'), /3 \/ 6種類<\/span><strong>50\.0%/)
  for (const [level, ratio] of [['NORMAL', 50], ['ELITE', 100 / 3], ['BOSS', 100]]) {
    const groupSegments = segments(rendered.get(level))
    assert.ok(Math.abs(groupSegments[0].width - ratio) < 1e-10, level)
    assert.equal(groupSegments[0].color, overall.find(segment => segment.key === level).color)
  }
  assert.doesNotMatch(markup, /<button|title=|coverage-stacked-percent|NaN|Infinity/)
})

test('出現回数と区分絞り込みを反映し、全体の各色も絞り込み後の総数を分母にする', () => {
  const all = chartRows(render({ countMode: 'SPAWNS' }))
  assert.deepEqual(segments(all.get('ALL')).map(({ key, width }) => [key, width]),
    [['NORMAL', 10], ['ELITE', 20], ['BOSS', 20], ['absent', 50]])
  assert.match(all.get('ALL'), /50 \/ 100体<\/span><strong>50\.0%/)
  assert.equal(segments(all.get('NORMAL'))[0].width, 25)
  const selectedRows = rows.filter(row => row.levelType !== 'NORMAL')
  const filtered = chartRows(render({ rows: selectedRows, countMode: 'SPAWNS', levelType: ['ELITE', 'BOSS'] }))
  assert.deepEqual([...filtered.keys()], ['ALL', 'ELITE', 'BOSS'])
  assert.match(filtered.get('ALL'), /40 \/ 60体<\/span><strong>66\.7%/)
  assert.ok(segments(filtered.get('ALL')).every(segment => Math.abs(segment.width - 100 / 3) < 1e-10))
  const boss = chartRows(render({ rows: rows.filter(row => row.levelType === 'BOSS'), countMode: 'SPAWNS', levelType: 'BOSS' }))
  assert.deepEqual([...boss.keys()], ['BOSS'])
  assert.equal(segments(boss.get('BOSS'))[0].width, 100)
})

test('対象なしと出現回数未登録では割合を捏造せず、選択した未分類も対象なしで表示する', () => {
  for (const props of [{ rows: [] }, { rows: [], levelType: 'UNKNOWN' },
    { rows: [enemy('missing', 'NORMAL', true)], countMode: 'SPAWNS' }]) {
    const markup = render(props)
    assert.match(markup, /対象なし/)
    assert.doesNotMatch(markup, /role="img"|coverage-stacked-segment|NaN|Infinity/)
  }
  assert.deepEqual([...chartRows(render({ rows: [], levelType: 'UNKNOWN' })).keys()], ['UNKNOWN'])
})
