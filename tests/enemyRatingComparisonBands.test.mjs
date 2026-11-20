import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { buildEnemyRatingComparison } from '../src/lib/enemyRatingComparison.ts'
import { formatEnemyRatingVideoShare } from '../src/lib/enemyRatingVideoValues.ts'

const enemies = [
  { id: 'common', stats: { defense: 0, magicResistance: 0 } },
  { id: 'low', stats: { defense: 100, magicResistance: 10 } },
  { id: 'rare', stats: { defense: 1100, magicResistance: 75 } },
  { id: 'missing', stats: { defense: null, magicResistance: 30 } },
]
const counts = {
  schemaVersion: 1, generatedAt: 'band-fixture', sourceGeneratedAt: null,
  summary: { mapCount: 1, missingMapCount: 0, spawnMapCount: 1, spawnExcludedMapCount: 0 },
  enemies: Object.fromEntries(enemies.map(({ id }, i) => [id, { mapCount: 1, spawnCount: [1000, 10, 1, 25][i] }])),
}
const source = buildEnemyRatingComparison(enemies, 'SPAWNS', counts)
const frozenSource = JSON.stringify(source)
const ranks = source.rows.map(row => row.rank)
let server, Plot
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()],
    cacheDir: 'node_modules/.vite/enemy-rating-comparison-bands-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  ;({ EnemyRatingComparisonPlot: Plot } = await server.ssrLoadModule('/src/components/EnemyRatingComparisonPlot.tsx'))
})
after(async () => { await server?.close() })

const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]))
const classes = tag => (tag.class ?? '').split(' ')
const decode = value => value.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
const rectangles = markup => [...markup.matchAll(/<rect\b[^>]*>/g)].map(([tag]) => attributes(tag))
const texts = markup => [...markup.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)].map(([, tag, value]) => ({ ...attributes(tag), text: decode(value) }))
const bars = markup => rectangles(markup).filter(tag => classes(tag).includes('enemy-rating-comparison-series'))
const bands = markup => rectangles(markup).filter(tag => classes(tag).includes('chart-strip-fill'))
const values = markup => texts(markup).filter(tag => classes(tag).includes('enemy-rating-comparison-value'))
const rankLabels = markup => texts(markup).filter(tag => classes(tag).includes('enemy-rating-comparison-rank'))
const render = overrides => renderToStaticMarkup(createElement(Plot, {
  data: source, layout: 'MIRRORED', width: 960, height: 352, imageMode: true, ...overrides,
}))
const close = (actual, expected, message) => assert.ok(Math.abs(Number(actual) - expected) < 1e-8, `${message}: ${actual} vs ${expected}`)

test('左右の割合と評価を共通の淡い帯で表示し、全評価の数値を保持する', () => {
  for (const sideValue of ['rank', 'cumulative']) {
    const markup = render({ sideValue })
    assert.equal(bands(markup).length, 30)
    assert.equal(values(markup).length, 20)
    assert.deepEqual(rankLabels(markup).map(tag => tag.text), ranks)
    assert.ok([...values(markup), ...rankLabels(markup)].every(tag => classes(tag).includes('chart-strip-label')))
    assert.ok(bands(markup).every(tag => tag['fill-opacity'] === '0.06'))
    assert.equal(bands(markup).filter(tag => tag['data-rating-comparison-band'] === 'values').length, 20)
    assert.equal(bands(markup).filter(tag => tag['data-rating-comparison-band'] === 'ranks').length, 10)
    for (const metric of ['defense', 'magicResistance']) {
      const expected = source.rows.map(row => formatEnemyRatingVideoShare(row.stats[metric][sideValue === 'rank' ? 'share' : 'cumulativeShare']))
      const actual = values(markup).filter(tag => tag['data-rating-video-metric'] === metric)
      assert.deepEqual(actual.map(tag => tag.text), expected)
      assert.deepEqual(actual.map(tag => Number(tag['data-rating-video-value'])), source.rows.map((_, index) => index))
    }
    assert.doesNotMatch(markup, /onClick|tabindex|role="button"|data-tooltip|font-size=|textLength=/)
    assert.equal(JSON.stringify(source), frozenSource, '描画時に計算結果を書き換えない')
  }
})

test('幅320・460・960でも割合帯を外側に保ち、評価帯と同じ行に置く', () => {
  for (const width of [320, 460, 960]) for (const { imageMode, height } of [
    { imageMode: false, height: 360 }, { imageMode: true, height: 352 }, { imageMode: true, height: 496 },
  ]) {
    const markup = render({ width, height, imageMode })
    const allBands = bands(markup)
    assert.equal(allBands.length, 30)
    const step = (height - (imageMode ? 5 : 28) - 54) / ranks.length
    const columnWidth = width < 460 ? 54 : 89
    for (let row = 0; row < ranks.length; row++) {
      const cells = allBands.filter(tag => Number(tag['data-rating-comparison-row']) === row)
      assert.equal(cells.length, 3)
      const central = cells.find(tag => tag['data-rating-comparison-band'] === 'ranks')
      close(central.x, width / 2 - 16, '評価帯を中央に置く')
      close(central.width, 32, '評価帯の幅')
      for (const metric of ['defense', 'magicResistance']) {
        const cell = cells.find(tag => tag['data-rating-comparison-metric'] === metric)
        assert.ok(cell, `${metric}の割合帯`)
        close(cell.width, columnWidth - 10, '左右の割合帯に同じ余白を設ける')
        if (metric === 'defense') assert.ok(Number(cell.x) + Number(cell.width) < columnWidth)
        else assert.ok(Number(cell.x) > width - columnWidth)
      }
      for (const cell of cells) {
        close(cell.y, 54 + row * step + 1.5, '帯を棒と同じ行に揃える')
        close(cell.height, step - 3, '隣の帯との間隔を3px確保する')
        assert.ok(Number(cell.x) >= 0 && Number(cell.x) + Number(cell.width) <= width)
        assert.ok(Number(cell.y) + Number(cell.height) <= height)
      }
    }
    for (const label of [...values(markup), ...rankLabels(markup)]) {
      assert.equal(label.transform, undefined, '割合と評価は横向きのまま')
      const cell = allBands.find(tag => Number(tag.x) <= Number(label.x)
        && Number(tag.x) + Number(tag.width) >= Number(label.x)
        && Number(tag.y) <= Number(label.y) && Number(tag.y) + Number(tag.height) >= Number(label.y))
      assert.ok(cell, '数値を対応する帯の中に置く')
    }
  }
})

test('割合の表示方式とハイライトを変えても棒と帯の寸法を変えない', () => {
  const baseline = render({ sideValue: 'cumulative' })
  const highlighted = render({ sideValue: 'rank', selectedRanks: ['S', 'E', 'S'] })
  assert.deepEqual(bars(highlighted), bars(baseline))
  assert.deepEqual(bands(highlighted), bands(baseline))
  assert.deepEqual(rankLabels(highlighted).filter(tag => classes(tag).includes('is-selected')).map(tag => tag.text), ['E', 'S'])
  assert.equal(rectangles(highlighted).filter(tag => classes(tag).includes('enemy-rating-comparison-highlight')).length, 2)
  for (const bar of bars(highlighted)) {
    assert.ok(classes(bar).some(name => name === 'defense' || name === 'magicResistance'))
    assert.equal(bar.fill, 'currentColor', '系列の青・橙を既存の共通配色から引き継ぐ')
  }
  assert.equal(JSON.stringify(source), frozenSource)
})

test('0・欠損・極小割合を区別し、PNGと動画の描画マーカーを保つ', () => {
  const markup = render({ sideValue: 'rank' })
  assert.ok(values(markup).some(tag => tag.text === '0'))
  assert.ok(values(markup).some(tag => tag.text === '<0.1'))
  const missing = render({ data: buildEnemyRatingComparison([{ id: 'only', stats: { defense: null, magicResistance: 0 } }], 'TYPES', null) })
  assert.deepEqual(values(missing).filter(tag => tag['data-rating-video-metric'] === 'defense').map(tag => tag.text), Array(10).fill('—'))
  assert.equal(bands(markup).filter(tag => tag['data-rating-video-band'] === 'values').length, 20)
  assert.equal(bands(markup).filter(tag => tag['data-rating-video-band'] === 'ranks').length, 10)
  for (const text of values(markup)) {
    const row = source.rows[Number(text['data-rating-video-value'])].stats[text['data-rating-video-metric']]
    close(text['data-rating-video-share'], row.share, '割合を動画へ引き継ぐ')
    close(text['data-rating-video-cumulative'], row.cumulativeShare, '累積割合を動画へ引き継ぐ')
    assert.equal(text['data-rating-video-value-mode'], 'rank')
  }
  const screen = render({ imageMode: false })
  assert.doesNotMatch(screen, /data-rating-video-/)
  for (const layout of ['GROUPED', 'CUMULATIVE']) {
    assert.doesNotMatch(render({ layout }), /data-rating-comparison-band=/, '今回の帯を他の表示形式へ追加しない')
  }
})
