import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { calculateWeightedHistogram } from '../src/lib/enemyWeightedHistogram.ts'
import { buildEnemyRatingHistogramBins } from '../src/lib/enemyRatingHistogram.ts'
import { createEnemyHistogramSnapshot, parseEnemyHistogramSnapshot } from '../src/lib/enemyHistogramSnapshot.ts'
import { buildEnemyRatingComparison, ENEMY_RATING_COMPARISON_LAYOUTS } from '../src/lib/enemyRatingComparison.ts'
import { withChartImageAspect } from '../src/lib/chartImageFilename.ts'

const fixtureCounts = {
  schemaVersion: 1, generatedAt: 'fixture', sourceGeneratedAt: null,
  summary: { mapCount: 5, missingMapCount: 0, spawnMapCount: 5, spawnExcludedMapCount: 0 },
  enemies: Object.fromEntries([2, 3, 1, 2, 84].map((spawnCount, index) => [`enemy_${index}`, { mapCount: 1, spawnCount }])),
}
const observations = [0, 10, 20, 30, null].map((value, index) => ({
  value, weight: fixtureCounts.enemies[`enemy_${index}`].spawnCount,
}))
const enemies = observations.map(({ value }, index) => ({
  id: `enemy_${index}`, index: String(index), sortId: index, name: `検証用の敵${index}`,
  levelType: 'ELITE', description: '', abilities: [], damageTypes: ['PHYSIC'],
  attackWay: 'MELEE', lifePointReduce: 1, databaseLevel: 0, databaseLevelCount: 1,
  stageAppearanceCount: 1, statusImmunities: [],
  ratings: { endurance: null, attack: null, defense: null, resistance: null },
  stats: { maxHp: 1000, attack: 200, defense: 100, magicResistance: value,
    moveSpeed: 1, attackSpeed: 100, baseAttackTime: 2, massLevel: 1 },
}))

let server, Plot, Panel, useControls, RatingImage, RatingPlot, RatingSaveDialog, getRatingFilename
let ScatterVideoDialog, ThresholdChart
before(async () => {
  server = await createServer({
    configFile: false, plugins: [react(), {
      name: 'enemy-histogram-cumulative-fixture-counts', enforce: 'pre',
      resolveId(source, importer) {
        if (importer?.endsWith('/EnemyStatisticsPanel.tsx') && source === '../lib/useEnemyHistogramCounts') {
          return '\0enemy-histogram-cumulative-fixture-counts'
        }
      },
      load(id) {
        if (id === '\0enemy-histogram-cumulative-fixture-counts') {
          return `export function useEnemyHistogramCounts() { return { data: ${JSON.stringify(fixtureCounts)}, error: false, loading: false, retry() {} } }`
        }
      },
    }], cacheDir: 'node_modules/.vite/enemy-histogram-cumulative-integration-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  ;({ EnemyHistogramSnapshotPlot: Plot, EnemyStatisticsPanel: Panel, useEnemyStatisticsControls: useControls }
    = await server.ssrLoadModule('/src/components/EnemyStatisticsPanel.tsx'))
  ;({ EnemyRatingComparisonImage: RatingImage, EnemyRatingComparisonSaveDialog: RatingSaveDialog,
    getEnemyRatingComparisonImageFilename: getRatingFilename }
    = await server.ssrLoadModule('/src/components/EnemyRatingComparisonImage.tsx'))
  ;({ EnemyRatingComparisonPlot: RatingPlot } = await server.ssrLoadModule('/src/components/EnemyRatingComparisonPlot.tsx'))
  ;({ EnemyResistanceScatterVideoDialog: ScatterVideoDialog }
    = await server.ssrLoadModule('/src/components/EnemyResistanceScatterVideoDialog.tsx'))
  ;({ EnemyResistanceThresholdScatter: ThresholdChart }
    = await server.ssrLoadModule('/src/components/EnemyResistanceThresholdScatter.tsx'))
})
after(async () => { await server?.close() })

test('防御力・術耐性の全3形式で複数ランクを強調し、同じ順序でファイル名に反映する', () => {
  const data = buildEnemyRatingComparison(enemies, 'SPAWNS', fixtureCounts)
  const filenames = ENEMY_RATING_COMPARISON_LAYOUTS.map(({ key: layout, label }) => {
    const unselectedSnapshot = { data, layout, scopeLabel: 'メインストーリー · 全敵',
      countMode: 'SPAWNS', countLabel: '出現回数', coverage: fixtureCounts.summary }
    const selectedRanks = ['B+', 'E', 'B+']
    const snapshot = { ...unselectedSnapshot, selectedRanks }
    const live = renderToStaticMarkup(createElement(RatingPlot, {
      data, layout, selectedRanks, width: 960, height: 360,
    }))
    assert.match(live, /enemy-rating-comparison-highlight|is-selected/)
    assert.match(live, /Eまでの累積割合 25\.000%/)
    assert.match(live, /B\+までの累積割合 100\.000%/)

    const renderImage = snapshot => renderToStaticMarkup(createElement(RatingImage, { snapshot, aspectRatio: 16 / 9 }))
    const image = renderImage(snapshot)
    const unselected = renderImage(unselectedSnapshot)
    for (const markup of [image, unselected]) {
      assert.ok(markup.includes(`防御力・術耐性の評価別分布（${label}）`))
      assert.ok(markup.includes('防御力 92体 / 術耐性 8体（値なし 84体）'))
      assert.doesNotMatch(markup, /Eまでの累積割合|評価Eの集計値/)
      assert.match(markup, /累積割合（%）/)
    }
    assert.equal(image.match(/class="enemy-rating-comparison-highlight"/g)?.length, 2)
    assert.doesNotMatch(unselected, /enemy-rating-comparison-highlight|is-selected|stroke-width="1\.5"/)
    const getRankTicks = markup => [...markup.matchAll(/<text\b[^>]*class="enemy-rating-comparison-tick( is-selected)?"[^>]*>([A-Z]\+?|SS)<\/text>/g)]
    const rankTicks = getRankTicks(image)
    for (const ticks of [rankTicks, getRankTicks(unselected)]) {
      assert.deepEqual(ticks.map(([, , rank]) => rank), ['E', 'D', 'C', 'B', 'B+', 'A', 'A+', 'S', 'S+', 'SS'])
    }
    assert.deepEqual(rankTicks.filter(([, selected]) => selected).map(([, , rank]) => rank), ['E', 'B+'])
    if (layout === 'CUMULATIVE') {
      assert.match(unselected, /ゲーム内評価/)
      const getLines = markup => [...markup.matchAll(/<polyline\b[^>]*points="([^"]+)"/g)].map(([, points]) => points)
      const lines = getLines(image)
      assert.equal(lines.length, 2)
      assert.ok(lines.every(points => points.split(' ').length === 10))
      assert.deepEqual(getLines(unselected), lines)
      assert.equal(image.match(/<circle\b[^>]*stroke-width="1\.5"/g)?.length, 4)
    } else {
      assert.match(unselected, /評価別割合（%）/)
      assert.match(image, /<text\b[^>]*class="(?:chart-strip-label|enemy-rating-comparison-value) is-selected"[^>]*>25<\/text>/)
      const getBars = markup => markup.match(/<rect\b[^>]*class="enemy-rating-comparison-series [^"]+"[^>]*>/g)
      const seriesRectangles = getBars(image)
      assert.equal(seriesRectangles?.length, layout === 'GROUPED' ? 7 : 5)
      assert.deepEqual(getBars(unselected), seriesRectangles)
      const getValues = markup => [...markup.matchAll(/<text\b[^>]*class="(?:chart-strip-label|enemy-rating-comparison-value)(?: is-selected)?"[^>]*>([^<]*)<\/text>/g)]
        .map(([, value]) => value)
      assert.deepEqual(getValues(unselected), getValues(image))
    }

    const filename = withChartImageAspect(getRatingFilename(snapshot), 16 / 9)
    assert.ok(filename.includes(label) && filename.includes('メインストーリー'))
    assert.match(filename, /_評価E-B\+強調_/)
    const inRankOrder = withChartImageAspect(getRatingFilename({ ...snapshot, selectedRanks: ['E', 'B+'] }), 16 / 9)
    assert.equal(inRankOrder, filename)
    const singleRank = withChartImageAspect(getRatingFilename({ ...snapshot, selectedRanks: ['B+'] }), 16 / 9)
    assert.equal(singleRank, filename.replace('_評価E-B+強調', '_評価B+強調'))
    assert.equal(withChartImageAspect(getRatingFilename(unselectedSnapshot), 16 / 9),
      filename.replace('_評価E-B+強調', ''))
    assert.equal(getRatingFilename({ ...snapshot, selectedRanks: [] }), getRatingFilename(unselectedSnapshot))
    const longScope = withChartImageAspect(getRatingFilename({ ...snapshot, scopeLabel: 'メインストーリー'.repeat(30) }), 16 / 9)
    assert.match(longScope, /_評価E-B\+強調_/)
    assert.match(longScope, /_ほか\d+項目_比率16x9\.png$/)
    assert.ok(filename.endsWith('_比率16x9.png'))
    return filename
  })
  assert.equal(new Set(filenames).size, 3)
})

const getAspectOptions = (markup, mediaLabel) => {
  const select = markup.match(new RegExp(`<select\\b[^>]*aria-label="${mediaLabel}の縦横比"[^>]*>(.*?)<\\/select>`))
  assert.ok(select, `${mediaLabel}の縦横比を選べる`)
  return [...select[1].matchAll(/<option value="([^"]+)"( selected="")?>([^<]+)<\/option>/g)]
    .map(([, value, selected, label]) => ({ value, selected: Boolean(selected), label }))
}

test('防御力・術耐性の画像保存は選択ランクを初期状態で強調し、縦横比を指定なしにする', () => {
  const data = buildEnemyRatingComparison(enemies, 'SPAWNS', fixtureCounts)
  const renderDialog = selectedRanks => renderToStaticMarkup(createElement(RatingSaveDialog, {
    data, layout: 'GROUPED', selectedRanks, scopeLabel: '全敵',
    countMode: 'SPAWNS', countLabel: '出現回数', onClose() {},
  }))
  const highlightCheckbox = markup => [...markup.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/g)]
    .find(([label]) => label.includes('選択ランクを強調'))?.[0] ?? ''
  const markup = renderDialog(['A', 'B+'])
  assert.match(highlightCheckbox(markup), /<input\b(?=[^>]*\btype="checkbox")(?=[^>]*\bchecked="")[^>]*>/)
  assert.equal(markup.match(/class="enemy-rating-comparison-highlight"/g)?.length, 2)
  assert.match(markup, /value="[^"]*_評価B\+-A強調_[^"]*_比率自動\.png"/)
  assert.doesNotMatch(markup, /棒の出し方|縦線の出し方|全体を生成|棒だけ伸ばす|割合の動き|棒に連動|割合連動/)
  const aspectOptions = getAspectOptions(markup, '画像')
  assert.deepEqual(aspectOptions.map(({ value }) => value), ['auto', '16:9', '2:1', '21:9', '3:1', 'custom'])
  assert.deepEqual(aspectOptions.filter(({ selected }) => selected), [{ value: 'auto', selected: true, label: '指定なし' }])

  const unselected = renderDialog([])
  assert.match(highlightCheckbox(unselected), /<input\b(?=[^>]*\btype="checkbox")(?=[^>]*\bdisabled="")[^>]*>/)
  assert.doesNotMatch(highlightCheckbox(unselected), /\bchecked=/)
  assert.doesNotMatch(unselected, /enemy-rating-comparison-highlight|評価[A-Z+\-]+強調/)
})

test('左右の横棒は外側の数値を階級の割合に切り替え、保存画像と既定名に反映する', () => {
  const data = buildEnemyRatingComparison(enemies, 'SPAWNS', fixtureCounts)
  const snapshot = { data, layout: 'MIRRORED', selectedRanks: ['D'], scopeLabel: '全敵',
    countMode: 'SPAWNS', countLabel: '出現回数' }
  const renderImage = sideValue => renderToStaticMarkup(createElement(RatingImage, { snapshot: { ...snapshot, sideValue } }))
  const getValues = markup => [...markup.matchAll(/<text\b[^>]*class="enemy-rating-comparison-value(?: is-selected)?"[^>]*>([^<]*)<\/text>/g)]
    .map(([, value]) => value)

  const cumulative = renderImage('cumulative')
  assert.match(cumulative, /累積割合（%）/)
  assert.deepEqual(getValues(cumulative), [
    '0', '100', '100', '100', '100', '100', '100', '100', '100', '100',
    '25', '25', '62.5', '75', '100', '100', '100', '100', '100', '100',
  ])
  const rank = renderImage('rank')
  assert.match(rank, /階級割合（%）/)
  assert.doesNotMatch(rank, /累積割合（%）/)
  assert.deepEqual(getValues(rank), [
    '0', '100', '0', '0', '0', '0', '0', '0', '0', '0',
    '25', '0', '37.5', '12.5', '25', '0', '0', '0', '0', '0',
  ])

  const filename = getRatingFilename(snapshot)
  assert.equal(getRatingFilename({ ...snapshot, sideValue: 'cumulative' }), filename)
  assert.match(withChartImageAspect(getRatingFilename({ ...snapshot, outputWidth: 1920 }), 16 / 7),
    /_幅1920px_全敵_左右の横棒_比率16x7\.png$/)
  assert.match(getRatingFilename({ ...snapshot, sideValue: 'rank' }), /_評価D強調_階級割合_全敵_左右の横棒\.png$/)
  const barsOnlyFilename = withChartImageAspect(getRatingFilename({
    ...snapshot, outputWidth: 1920, videoDuration: 5, videoAnimation: 'barsOnly',
  }), 16 / 9)
  assert.match(barsOnlyFilename, /棒だけ伸ばす/)
  assert.match(barsOnlyFilename, /_5秒_比率16x9\.png$/)
  const linkedFilename = withChartImageAspect(getRatingFilename({
    ...snapshot, outputWidth: 1920, videoDuration: 10, videoValues: 'linked',
  }), 16 / 7)
  assert.match(linkedFilename, /_左右の横棒_割合連動_10秒_比率16x7\.png$/)
  const linkedBarsOnlyFilename = getRatingFilename({
    ...snapshot, videoDuration: 5, videoAnimation: 'barsOnly', videoValues: 'linked',
  })
  assert.match(linkedBarsOnlyFilename, /_左右の横棒_棒だけ伸ばす_割合連動_5秒\.png$/)
  const fixedVideoFilename = getRatingFilename({ ...snapshot, videoDuration: 10 })
  assert.match(fixedVideoFilename, /_左右の横棒_10秒\.png$/)
  assert.doesNotMatch(fixedVideoFilename, /割合連動/)
  assert.doesNotMatch(filename, /棒だけ伸ばす|割合連動/)
  for (const layout of ['GROUPED', 'CUMULATIVE']) {
    assert.equal(getRatingFilename({ ...snapshot, layout, sideValue: 'rank' }), getRatingFilename({ ...snapshot, layout }))
  }
})

test('左右の横棒の動画は集計条件と強調を引き継ぎ、縦横比を選べる。初期値は幅1,920 pxの16:7', () => {
  const pairedEnemies = enemies.map((enemy, index) =>
    index === 1 ? { ...enemy, stats: { ...enemy.stats, magicResistance: 5 } } : enemy)
  const data = buildEnemyRatingComparison(pairedEnemies, 'SPAWNS', fixtureCounts)
  const renderVideoDialog = () => renderToStaticMarkup(createElement(RatingSaveDialog, {
    media: 'video', data, layout: 'MIRRORED', selectedRanks: ['D'], scopeLabel: 'メインストーリー・全敵',
    sideValue: 'rank', countMode: 'SPAWNS', countLabel: '出現回数', onClose() {},
  }))
  const canvasDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'HTMLCanvasElement')
  const recorderDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'MediaRecorder')
  const encoderDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'VideoEncoder')
  const frameDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'VideoFrame')
  try {
    Object.defineProperty(globalThis, 'VideoEncoder', { configurable: true, value: class {} })
    Object.defineProperty(globalThis, 'VideoFrame', { configurable: true, value: class {} })
    class Canvas { captureStream() {} }
    Object.defineProperty(globalThis, 'HTMLCanvasElement', { configurable: true, value: Canvas })
    for (const [extension, format] of [['mp4', 'MP4'], ['webm', 'WebM']]) {
      Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: {
        isTypeSupported: mimeType => mimeType.startsWith(`video/${extension}`),
      } })
      const markup = renderVideoDialog()
      assert.match(markup, /動画を保存/)
      assert.match(markup, /完成図/)
      const animationSelector = markup.match(/<div\b[^>]*role="group" aria-label="動画の演出"[^>]*>(.*?)<\/div>/)?.[1]
      assert.ok(animationSelector, '動画の生成方法を選べる')
      assert.deepEqual([...animationSelector.matchAll(/<button\b[^>]*aria-pressed="(true|false)"[^>]*>([^<]+)<\/button>/g)]
        .map(([, selected, label]) => [selected, label]),
        [['true', '全体を生成'], ['false', '棒だけ伸ばす']])
      const valuesSelector = markup.match(/<div\b[^>]*role="group" aria-label="割合の動き"[^>]*>(.*?)<\/div>/)?.[1]
      assert.ok(valuesSelector, '割合を棒に連動させるか選べる')
      assert.deepEqual([...valuesSelector.matchAll(/<button\b[^>]*aria-pressed="(true|false)"[^>]*>([^<]+)<\/button>/g)]
        .map(([, selected, label]) => [selected, label]),
        [['true', '棒に連動'], ['false', '固定']])
      assert.match(markup, new RegExp(`>${format}<`))
      const aspectOptions = getAspectOptions(markup, '動画')
      assert.deepEqual(aspectOptions.map(({ value }) => value).sort(), ['auto', '16:7', '16:9', '2:1', '21:9', '3:1', 'custom'].sort())
      assert.deepEqual(aspectOptions.filter(({ selected }) => selected), [{ value: '16:7', selected: true, label: '16:7' }])
      assert.equal(aspectOptions.find(({ value }) => value === 'auto')?.label, '指定なし')
      assert.equal(aspectOptions.find(({ value }) => value === 'custom')?.label, 'カスタム')
      const previewText = markup.replace(/<!--.*?-->/g, '')
      assert.match(previewText, /1,920 × 840 px/)
      assert.match(previewText, /5\.00 \/ 5\.00 秒/)
      assert.match(markup, /type="range"[^>]*aria-label="再生位置"/)
      assert.match(markup, /敵_防御力・術耐性の評価別分布_出現回数_評価D強調_階級割合_幅1920px_メインストーリー・全敵_左右の横棒_割合連動_5秒_比率16x7\.(mp4|webm)/)
      assert.match(markup, new RegExp(`_5秒_比率16x7\\.${extension}"`))
      assert.match(markup, /階級割合（%）/)
      const orderHeading = markup.match(/<h[2-6][^>]*id="([^"]+)"[^>]*>表示順・テンポ<\/h[2-6]>/)
      assert.ok(orderHeading)
      const orderList = markup.match(/<ol\b[^>]*aria-labelledby="([^"]+)"[^>]*>(.*?)<\/ol>/)
      assert.equal(orderList?.[1], orderHeading[1])
      assert.deepEqual([...orderList[2].matchAll(/aria-label="([^"]+)を上へ"/g)].map(([, label]) => label),
        ['タイトル・条件', '軸・目盛り', '階級名', '左右の棒', '階級割合'])
      assert.doesNotMatch(markup, /aria-label="テンポの表記"/)
      const phaseControls = [...orderList[2].matchAll(/aria-label="([^"]+)のテンポ">(.*?)<\/div>/g)]
      assert.deepEqual(phaseControls.map(([, label]) => label), ['タイトル・条件', '軸・目盛り', '階級名', '左右の棒', '階級割合'])
      for (const [, label, controls] of phaseControls) {
        assert.match(controls, /^<span aria-hidden="true">短い<\/span>.*<span aria-hidden="true">長い<\/span>$/)
        const tempoButtons = [...controls.matchAll(/<button\b([^>]*)>(\d)<\/button>/g)]
        assert.deepEqual(tempoButtons.map(([, attributes, number]) =>
          [number, attr(attributes, 'aria-label'), attr(attributes, 'aria-pressed')]),
          [['1', '1（最短）', 'false'], ['2', '2（短め）', 'false'], ['3', '3（標準）', 'true'],
            ['4', '4（長め）', 'false'], ['5', '5（最長）', 'false']])
        assert.ok(tempoButtons.every(([, attributes]) => /\bdisabled=""/.test(attributes) === (label === '階級割合')),
          `${label}のテンポは棒に連動する項目だけ固定される`)
      }
      const valuesOrderRow = [...orderList[2].matchAll(/<li\b[^>]*>(.*?)<\/li>/g)]
        .find(([, row]) => row.includes('階級割合'))?.[1]
      assert.ok(valuesOrderRow)
      assert.match(valuesOrderRow, /enemy-rating-video-phase-seconds">棒に連動<\/span>/)
      assert.ok([...valuesOrderRow.matchAll(/<button\b([^>]*)>/g)].every(([, attributes]) => /\bdisabled=""/.test(attributes)))
      const valuesDuration = markup.match(/<label\b[^>]*>.*?<\/label>/g)?.find(label => label.includes('階級割合（秒）'))
      assert.ok(valuesDuration)
      assert.match(valuesDuration, /<input\b(?=[^>]*\bdisabled="")(?=[^>]*\bvalue="0")[^>]*>/)
      const tempoSlider = markup.match(/<input\b[^>]*aria-label="テンポ"[^>]*>/)?.[0]
      assert.ok(tempoSlider)
      assert.deepEqual(['type', 'min', 'max', 'step', 'value', 'aria-valuetext'].map(name => attr(tempoSlider, name)),
        ['range', '0', '9', '1', '3', '5秒（標準）'])
      const tempoMarks = markup.match(/<datalist\b[^>]*>.*?<\/datalist>/)?.[0]
      assert.ok(tempoMarks)
      assert.equal(attr(tempoSlider, 'list'), attr(tempoMarks, 'id'))
      assert.deepEqual([...tempoMarks.matchAll(/<option value="(\d)"><\/option>/g)].map(([, value]) => value),
        ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
      assert.match(previewText, /enemy-rating-video-tempo-ticks[^>]*>.*?<span>20秒<\/span>/)
      assert.match(markup, /描画完了まで（秒）<\/span><input\b[^>]*type="number"[^>]*value="5"/)
      assert.match(markup, />既定値に戻す<\/button>/)
      assert.match(markup, /<summary>秒数で調整<\/summary>/)
      const holdField = markup.match(/<label\b[^>]*>.*?<\/label>/g)?.find(label => label.includes('完成図の保持（秒）'))
      assert.ok(holdField)
      assert.match(holdField, /<input\b[^>]*type="number"[^>]*value="0"/)
      assert.doesNotMatch(markup, /開始（秒）/)
      const textControl = markup.match(/<label\b[^>]*>.*?<\/label>/g)?.find(label => label.includes('文字の出し方'))
      assert.ok(textControl)
      assert.match(textControl, /<option value="instant">一斉に表示<\/option>/)
      assert.match(textControl, /<option value="stagger" selected="">順に表示<\/option>/)
      const effectControls = markup.match(/<label\b[^>]*>.*?<\/label>/g) ?? []
      const guideOptions = [['grow', false, '伸びる'], ['stagger', true, '順に表示']]
      for (const [controlLabel, expectedOptions] of [
        ['棒の出し方', [...guideOptions, ['staggerGrow', false, '順に伸びる']]],
        ['縦線の出し方', guideOptions],
      ]) {
        const control = effectControls.find(label => label.includes(controlLabel))
        assert.ok(control, `${controlLabel}を選べる`)
        const options = [...control.matchAll(/<option value="([^"]+)"( selected="")?>([^<]+)<\/option>/g)]
          .map(([, value, selected, label]) => [value, Boolean(selected), label])
        assert.deepEqual(options, expectedOptions)
      }
      const videoBars = markup.match(/<rect\b[^>]*data-rating-video-bar="[^"]+"[^>]*>/g) ?? []
      assert.deepEqual(videoBars.map(bar => [attr(bar, 'data-rating-video-bar'), attr(bar, 'data-rating-video-bar-rank')]),
        [['-1', '1'], ['1', '0'], ['1', '1'], ['1', '3'], ['1', '4']])
      assert.ok(videoBars.every(bar => Number(attr(bar, 'width')) > 0))
      assert.equal(markup.match(/class="enemy-rating-comparison-highlight"/g)?.length, 1)
      assert.doesNotMatch(markup, /画像の縦横比|出力幅を1,920 pxに固定/)
    }
    Reflect.deleteProperty(globalThis, 'MediaRecorder')
    assert.match(renderVideoDialog(), />MP4</)
    Reflect.deleteProperty(globalThis, 'VideoEncoder')
    const unsupported = renderVideoDialog()
    assert.match(unsupported, /このブラウザーは動画の出力に対応していません。/)
    assert.match(unsupported, /type="submit"[^>]*disabled=""/)
  } finally {
    if (canvasDescriptor) Object.defineProperty(globalThis, 'HTMLCanvasElement', canvasDescriptor)
    else Reflect.deleteProperty(globalThis, 'HTMLCanvasElement')
    if (recorderDescriptor) Object.defineProperty(globalThis, 'MediaRecorder', recorderDescriptor)
    else Reflect.deleteProperty(globalThis, 'MediaRecorder')
    if (encoderDescriptor) Object.defineProperty(globalThis, 'VideoEncoder', encoderDescriptor)
    else Reflect.deleteProperty(globalThis, 'VideoEncoder')
    if (frameDescriptor) Object.defineProperty(globalThis, 'VideoFrame', frameDescriptor)
    else Reflect.deleteProperty(globalThis, 'VideoFrame')
  }
})

test('術耐性別の棒グラフは0と欠損を区別し、全階級を保って画面と画像に表示する', () => {
  const rows = [
    { resistance: 0, defense: 0, percentage: 100, rankCutoff: 10 },
    { resistance: 50, defense: 350, percentage: 10, rankCutoff: 1 },
    { resistance: 100, defense: null, percentage: 0, rankCutoff: 0 },
  ]
  for (const imageHeight of [undefined, 334]) {
    const markup = renderToStaticMarkup(createElement(ThresholdChart, { rows, chartType: 'bar', imageHeight }))
    assert.match(markup, /術耐性と対応する防御力の棒グラフ/)
    assert.match(markup, /術耐性0以上、対応する防御力0/)
    assert.match(markup, /術耐性50以上、対応する防御力350/)
    assert.match(markup, /術耐性100以上、該当なし/)
    assert.equal(markup.match(/class="enemy-resistance-threshold-bar"/g)?.length, 2)
    const labels = [...markup.matchAll(/class="enemy-resistance-threshold-bar-value"[^>]*>(.*?)<\/span>/g)]
      .map(([, label]) => label)
    assert.deepEqual(labels, ['0', '350', '—'])
    assert.doesNotMatch(markup, /data-resistance-video-point|data-resistance-video-missing/)
  }
})

test('術耐性別の散布図動画は集計条件と点を引き継ぎ、16:9・5秒で保存できる', () => {
  const snapshot = {
    rows: [
      { resistance: 0, defense: 0, percentage: 100, rankCutoff: 10 },
      { resistance: 50, defense: 350, percentage: 10, rankCutoff: 1 },
      { resistance: 100, defense: null, percentage: 0, rankCutoff: 0 },
    ],
    chartConditions: ['集計版 v12', '全体', '出現回数10体'],
    chartFilenameParts: ['集計版v12', '全体', '出現回数', '術耐性10刻み'],
  }
  const canvasDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'HTMLCanvasElement')
  const recorderDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'MediaRecorder')
  const encoderDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'VideoEncoder')
  const frameDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'VideoFrame')
  try {
    Object.defineProperty(globalThis, 'VideoEncoder', { configurable: true, value: class {} })
    Object.defineProperty(globalThis, 'VideoFrame', { configurable: true, value: class {} })
    class Canvas { captureStream() {} }
    Object.defineProperty(globalThis, 'HTMLCanvasElement', { configurable: true, value: Canvas })
    for (const [extension, format] of [['mp4', 'MP4'], ['webm', 'WebM']]) {
      Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: {
        isTypeSupported: mimeType => mimeType.startsWith(`video/${extension}`),
      } })
      const markup = renderToStaticMarkup(createElement(ScatterVideoDialog, { snapshot, onClose() {} }))
      assert.match(markup, /動画を保存/)
      assert.doesNotMatch(markup, /全体を生成|棒だけ伸ばす|割合の動き|棒に連動|割合連動/)
      assert.match(markup, new RegExp(`>${format}<`))
      const aspect = getAspectOptions(markup, '動画')
      assert.deepEqual(aspect.filter(({ selected }) => selected), [{ value: '16:9', selected: true, label: '16:9' }])
      assert.ok(aspect.some(({ value }) => value === '16:7'))
      const phases = ['タイトル・条件', 'グラフの枠', '軸・目盛り', '点と数値', '該当なしの注記']
      assert.deepEqual([...markup.matchAll(/aria-label="([^"]+)を上へ"/g)].map(([, label]) => label), phases)
      assert.deepEqual([...markup.matchAll(/aria-label="([^"]+)のテンポ"/g)].map(([, label]) => label), phases)
      for (const label of ['文字の出し方', '点の出し方', '枠・目盛り線の出し方', '既定値に戻す', '秒数で調整', '完成図の保持（秒）']) {
        assert.ok(markup.includes(label), label)
      }
      const previewText = markup.replace(/<!--.*?-->/g, '')
      assert.match(previewText, /1,920 × 1,080 px/)
      assert.match(previewText, /5\.00 \/ 5\.00 秒/)
      assert.match(previewText, /集計版 v12・全体・出現回数10体/)
      assert.match(markup, /type="range"[^>]*aria-label="再生位置"/)
      assert.match(markup, new RegExp(`value="防御力と術耐性の対応（散布図）_集計版v12_全体_出現回数_術耐性10刻み_幅1920px_5秒_比率16x9\\.${extension}"`))
      assert.deepEqual([...markup.matchAll(/data-resistance-video-point="(\d+)"[^>]*>(\d+)<\/span>/g)]
        .map(([, resistance, defense]) => [resistance, defense]), [['0', '0'], ['50', '350']])
      assert.match(previewText, /<figcaption data-resistance-video-missing="true">術耐性100以上 · 該当なし<\/figcaption>/)
      const allMatched = renderToStaticMarkup(createElement(ScatterVideoDialog, {
        snapshot: { ...snapshot, rows: snapshot.rows.slice(0, -1) }, onClose() {},
      }))
      assert.doesNotMatch(allMatched, /該当なしの注記/)
    }
  } finally {
    if (canvasDescriptor) Object.defineProperty(globalThis, 'HTMLCanvasElement', canvasDescriptor)
    else Reflect.deleteProperty(globalThis, 'HTMLCanvasElement')
    if (recorderDescriptor) Object.defineProperty(globalThis, 'MediaRecorder', recorderDescriptor)
    else Reflect.deleteProperty(globalThis, 'MediaRecorder')
    if (encoderDescriptor) Object.defineProperty(globalThis, 'VideoEncoder', encoderDescriptor)
    else Reflect.deleteProperty(globalThis, 'VideoEncoder')
    if (frameDescriptor) Object.defineProperty(globalThis, 'VideoFrame', frameDescriptor)
    else Reflect.deleteProperty(globalThis, 'VideoFrame')
  }
})

function snapshot(options = {}) {
  const { kind = 'linear', showCumulative = true, cumulativeDisplay = 'line', showFrequencies = true, showPercentages = false,
    referenceVisibility = { mean: false, median: false } } = options
  const log = kind === 'log'
  const source = log ? observations.map((item, index) => ({ ...item, value: [1, 10, 100, 1000, null][index] })) : observations
  return createEnemyHistogramSnapshot({
    metric: 'magicResistance', source: { scopeLabel: 'エリート・検証fixture',
      enemyIds: enemies.map(enemy => enemy.id), countGeneratedAt: 'fixture' },
    countMode: 'SPAWNS', coverage: fixtureCounts.summary, scale: log ? 'LOG' : 'LINEAR',
    statistics: calculateWeightedHistogram(source, log ? { scale: 'LOG' }
      : { customLinearBinWidth: 10, customLinearUpperBound: 20 }),
    ratingBins: kind === 'rating' ? buildEnemyRatingHistogramBins(source, 'magicResistance') : null,
    customLinearUpperBound: log ? null : 20, showCumulative, cumulativeDisplay, showFrequencies, showPercentages, showBinRanges: false,
    referenceVisibility,
    editorSettings: { levelType: 'ALL', numericConditions: [], linearBinWidthInput: log ? '' : '10', linearUpperBoundInput: log ? '' : '20' },
  })
}
const renderPlot = (source, dimensions = {}) => renderToStaticMarkup(createElement(Plot, {
  snapshot: source, width: 960, height: 334, ...dimensions,
}))
const clean = value => value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
const attr = (value, key) => new RegExp(`\\b${key}="([^"]*)"`).exec(value)?.[1]
const histogramSection = (markup, marker) => {
  const start = new RegExp(`<g\\b[^>]*${marker}[^>]*>`).exec(markup)
  assert.ok(start, `${marker}の表示がある`)
  const content = markup.slice(start.index)
  let depth = 0
  for (const tag of content.matchAll(/<\/?g\b[^>]*>/g)) {
    depth += tag[0].startsWith('</') ? -1 : 1
    if (depth === 0) return content.slice(0, tag.index + tag[0].length)
  }
  assert.fail(`${marker}の表示が閉じている`)
}
const cumulativeSection = (markup, display) => histogramSection(markup, `data-histogram-cumulative="${display}"`)
const percentageSection = markup => histogramSection(markup, 'data-histogram-percentage="strip"')
const cumulativePoints = markup => [...markup.matchAll(/<g\b([^>]*data-cumulative-index="[^"]*"[^>]*)>/g)]
  .map(match => ({ index: Number(attr(match[1], 'data-cumulative-index')),
    count: Number(attr(match[1], 'data-cumulative-count')),
    proportion: Number(attr(match[1], 'data-cumulative-proportion')) }))
const barTitles = markup => [...markup.matchAll(/<rect\b[^>]*class="enemy-chart-bar[^"]*"[^>]*>([\s\S]*?)<\/rect>/g)]
  .map(match => clean(match[1]))
const overlayPath = markup => /<path\b[^>]*class="enemy-histogram-cumulative-line"[^>]*d="([^"]+)"/.exec(markup)?.[1]
const barCenters = markup => [...markup.matchAll(/<rect\b[^>]*class="enemy-chart-bar[^"]*"([^>]*)>/g)]
  .map(match => Number(attr(match[1], 'x')) + Number(attr(match[1], 'width')) / 2)
const cumulativePointXs = markup => [...markup.matchAll(/<circle\b[^>]*class="enemy-histogram-cumulative-point"([^>]*)>/g)]
  .map(match => Number(attr(match[1], 'cx')))
const cumulativeStripCells = markup => [...markup.matchAll(/<g\b([^>]*data-cumulative-index="[^"]*"[^>]*)>([\s\S]*?)<\/g>/g)]
  .map(match => ({
    index: Number(attr(match[1], 'data-cumulative-index')),
    rectangle: /<rect\b([^>]*)>/.exec(match[2])?.[1],
    label: /<text\b([^>]*)>([^<]*)<\/text>/.exec(match[2]),
  })).filter(cell => cell.rectangle)
const frequencyLabels = markup => [...markup.matchAll(/<text\b([^>]*data-frequency-index="[^"]*"[^>]*)>([^<]*)<\/text>/g)]
  .map(match => ({ index: Number(attr(match[1], 'data-frequency-index')), text: match[2],
    x: Number(attr(match[1], 'x')), y: Number(attr(match[1], 'y')) }))
const stripRectangles = markup => [...markup.matchAll(/<rect\b([^>]*)>/g)].map(match => match[1])
const stripBottom = markup => Math.max(...stripRectangles(markup).map(rectangle => Number(attr(rectangle, 'y')) + Number(attr(rectangle, 'height'))))
const percentageStripLabels = markup => [...percentageSection(markup).matchAll(/<text\b[^>]*class="chart-strip-label"[^>]*>([^<]*)<\/text>/g)]
  .map(([, label]) => label)
const countAxisTicks = markup => {
  const frame = /<rect\b[^>]*data-chart-image-plot-area=""([^>]*)>/.exec(markup)?.[1]
  return [...markup.matchAll(/<text\b([^>]*class="enemy-chart-tick"[^>]*)>([\d,]+)<\/text>/g)]
    .filter(match => Number(attr(match[1], 'x')) < Number(attr(frame, 'x')))
    .map(match => Number(match[2].replaceAll(',', '')))
}

function PanelWrapper({ initialSnapshot, editor = false, aggregationCounts, aggregationVersion, spawnCountsAvailable }) {
  const controls = useControls(initialSnapshot)
  return createElement(Panel, { rows: enemies, allRows: enemies, scopeLabel: 'エリート・検証fixture', controls,
    filterControls: null, aggregationCounts, aggregationVersion, spawnCountsAvailable,
    ...(editor ? { histogramEditor: { initialSnapshot: initialSnapshot ?? null, onChange() {} } } : {}) })
}
const renderPanel = props => renderToStaticMarkup(createElement(PanelWrapper, props))

test('ヒストグラムの見出しは元の値と集計方法から歪度・超過尖度を表示する', () => {
  const moments = markup => markup.match(/<dl class="enemy-histogram-moments">(.*?)<\/dl>/)?.[1]
  for (const kind of ['linear', 'log']) {
    const markup = renderPanel({ initialSnapshot: snapshot({ kind }), aggregationCounts: fixtureCounts })
    assert.match(moments(markup), /<dt>歪度<\/dt><dd>\+0\.32<\/dd>.*<dt>超過尖度<\/dt><dd>-1\.25<\/dd>/)
  }
  const mapCounts = renderPanel({ initialSnapshot: snapshot(), aggregationCounts: fixtureCounts, spawnCountsAvailable: false })
  assert.match(moments(mapCounts), /<dt>歪度<\/dt><dd>0\.00<\/dd>.*<dt>超過尖度<\/dt><dd>-1\.36<\/dd>/)
  const constantHp = renderPanel({ aggregationCounts: fixtureCounts })
  assert.match(moments(constantHp), /<dt>歪度<\/dt><dd>—<\/dd>.*<dt>超過尖度<\/dt><dd>—<\/dd>/)
})

test('統計サマリーは選択中のステータスにかかわらず全列の歪度・超過尖度を表示する', () => {
  const markup = renderPanel({ aggregationCounts: fixtureCounts })
  assert.match(markup, /<strong>HPのヒストグラム<\/strong>/)
  const readSummaryRow = (panel, label) => {
    const table = panel.match(/<table class="enemy-stat-summary-table"[^>]*>[\s\S]*?<\/table>/)?.[0]
    assert.ok(table)
    const row = [...table.matchAll(/<tr><th scope="row">([^<]+)<\/th>((?:<td>[^<]*<\/td>)+)<\/tr>/g)]
      .find(([, title]) => title === label)
    assert.ok(row, label)
    return [...row[2].matchAll(/<td>([^<]*)<\/td>/g)].map(([, value]) => value)
  }

  assert.deepEqual(readSummaryRow(markup, '歪度'), ['—', '—', '—', '+0.32', '—', '—', '—', '—'])
  assert.deepEqual(readSummaryRow(markup, '超過尖度'), ['—', '—', '—', '-1.25', '—', '—', '—', '—'])

  const mapCounts = renderPanel({ aggregationCounts: fixtureCounts, spawnCountsAvailable: false })
  assert.equal(readSummaryRow(mapCounts, '歪度')[3], '0.00')
  assert.equal(readSummaryRow(mapCounts, '超過尖度')[3], '-1.36')
})

const cumulativeSelect = markup => [...markup.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)]
  .find(match => clean(match[1]).startsWith('累積割合'))?.[1]
const selectedCumulativeDisplay = markup => {
  const select = cumulativeSelect(markup)
  assert.ok(select, '累積割合の選択欄がある')
  return [...select.matchAll(/<option\b([^>]*)>([^<]*)<\/option>/g)]
    .find(match => /\bselected=""/.test(match[1]))?.[2]
}

test('指定した集計版の出現数だけを描画し、別版のキャッシュへフォールバックしない', () => {
  const aggregationVersion = { id: 'v2', label: '第2版', sourceRevision: 'abc123', ruleVersion: 'hidden-groups-v2' }
  const initialSnapshot = snapshot()
  const live = renderPanel({ initialSnapshot })
  const aggregationCounts = { ...fixtureCounts, enemies: Object.fromEntries(
    Object.entries(fixtureCounts.enemies).map(([id, counts]) => [id, { ...counts, spawnCount: counts.spawnCount * 10 }]),
  ) }
  const fixed = renderPanel({ initialSnapshot, aggregationCounts, aggregationVersion })
  assert.notDeepEqual(barTitles(fixed), barTitles(live))
  assert.ok(barTitles(fixed).some(title => title.includes('20体')))
  const unavailable = renderPanel({ initialSnapshot, aggregationVersion })
  assert.deepEqual(barTitles(unavailable), [])
  assert.match(clean(unavailable), /登場データを取得できませんでした/)
})

test('本編の出現回数を使えない版では登場マップ数で分布を描画する', () => {
  const markup = renderPanel({ aggregationCounts: fixtureCounts, spawnCountsAvailable: false })
  const radio = (value) => [...markup.matchAll(/<input\b[^>]*>/g)].find(([tag]) => attr(tag, 'value') === value)?.[0]
  assert.match(radio('SPAWNS'), /\bdisabled=""/)
  assert.doesNotMatch(radio('SPAWNS'), /\bchecked=""/)
  assert.match(radio('MAPS'), /\bchecked=""/)
  assert.match(clean(markup), /この集計版ではメインストーリーの出現回数を利用できません/)
  assert.ok(barTitles(markup).some(title => title.includes('5件')))
})

test('累積オプションONだけに右軸0〜100%と線を出し、元の階級と件数は変えない', () => {
  const on = snapshot(), off = snapshot({ showCumulative: false })
  const before = structuredClone(on)
  const enabled = renderPlot(on), disabled = renderPlot(off)
  assert.match(enabled, /data-histogram-cumulative="true"/)
  assert.ok(overlayPath(enabled))
  assert.doesNotMatch(disabled, /data-histogram-cumulative|enemy-histogram-cumulative-axis|enemy-histogram-cumulative-line/)
  const axis = /<g class="enemy-histogram-cumulative-axis"([\s\S]*?)<path/.exec(enabled)?.[1]
  assert.deepEqual([...axis.matchAll(/<text\b[^>]*>(\d+%)<\/text>/g)].map(match => match[1]), ['0%', '25%', '50%', '75%', '100%'])
  assert.match(axis, />累積割合<\/text>/)
  assert.deepEqual(barTitles(enabled), barTitles(disabled))
  assert.deepEqual(on.statistics, off.statistics)
  assert.deepEqual(on, before)
})

test('旧v1の累積設定省略はOFFの画像として描画される', () => {
  const off = snapshot({ showCumulative: false })
  const { showCumulative: _overlay, ...legacy } = off
  const restored = parseEnemyHistogramSnapshot(legacy)
  assert.ok(restored)
  assert.equal(restored.showCumulative, false)
  assert.equal(renderPlot(legacy), renderPlot(off))
  assert.equal(renderPlot(restored), renderPlot(off))
  assert.doesNotMatch(renderPlot(restored), /data-histogram-cumulative/)
})

test('旧スナップショットの累積ONは表示形式の指定がなくても折れ線のまま復元される', () => {
  const line = snapshot()
  const { cumulativeDisplay: _display, ...legacy } = line
  const restored = parseEnemyHistogramSnapshot(legacy)
  assert.ok(restored)
  assert.equal(restored.showCumulative, true)
  assert.equal(renderPlot(legacy), renderPlot(line))
  assert.equal(renderPlot(restored), renderPlot(line))
  assert.ok(overlayPath(renderPlot(restored)))
  assert.doesNotMatch(renderPlot(restored), /data-histogram-cumulative="strip"/)
})

test('線形・対数・評価・上限超過の各階級は棒中央に累積し、最初の階級から最終100%まで結ぶ', () => {
  for (const kind of ['linear', 'log', 'rating']) {
    const source = snapshot({ kind })
    const bins = source.ratingBins ?? source.statistics.bins
    const markup = renderPlot(source)
    let sum = 0
    const expected = bins.map((bin, index) => ({ index, count: sum += bin.count, proportion: sum / source.statistics.count }))
    assert.deepEqual(cumulativePoints(markup), expected, kind)
    assert.equal(cumulativePoints(markup).at(-1).proportion, 1)
    assert.equal(cumulativePoints(markup).at(-1).count, 8)
    assert.equal(source.statistics.missingCount, 84)
    assert.doesNotMatch(markup, /NaN|Infinity/)
    const path = [...overlayPath(markup).matchAll(/[ML] ([\d.eE+-]+) ([\d.eE+-]+)/g)]
    assert.equal(path.length, bins.length)
    const frame = /<rect\b[^>]*data-chart-image-plot-area=""([^>]*)>/.exec(markup)?.[1]
    assert.ok(frame)
    const centers = barCenters(markup)
    assert.equal(centers.length, bins.length)
    const xs = cumulativePointXs(markup)
    assert.equal(xs.length, bins.length)
    for (let index = 0; index < bins.length; index++) {
      assert.ok(Math.abs(xs[index] - centers[index]) < 1e-9, `${kind}: point ${index} matches its bar center`)
      assert.equal(Number(path[index][1]), xs[index])
    }
    assert.ok(Number(path[0][1]) > Number(attr(frame, 'x')))
    assert.ok(Number(path.at(-1)[1]) < Number(attr(frame, 'x')) + Number(attr(frame, 'width')))
    if (kind === 'linear') {
      assert.match(markup, /10未満まで：累積2体（25%）/)
      assert.match(markup, /20以下：累積6体（75%）/)
      assert.match(markup, /全階級（20超を含む）：累積8体（100%）/)
      assert.equal(bins.at(-1).isOverflow, true)
    }
    if (kind === 'rating') assert.match(markup, /評価SSまで：累積8体（100%）/)
  }
})

test('最大2958件の件数軸を1000刻みに丸め、累積の4表示形式や保存幅で件数目盛りを変えない', () => {
  const weights = [2702, 791, 2085, 1625, 759, 2958, 894, 92, 276, 31]
  const statistics = calculateWeightedHistogram(weights.map((weight, index) => ({ value: index * 10, weight })), {
    scale: 'LINEAR', customLinearBinWidth: 10, minimumLinearUpperBound: 100,
  })
  for (const display of ['none', 'line', 'strip', 'both']) {
    const showCumulative = display !== 'none'
    const source = createEnemyHistogramSnapshot({ ...snapshot({ showCumulative, cumulativeDisplay: display === 'none' ? 'line' : display }),
      statistics, customLinearUpperBound: null,
      editorSettings: { levelType: 'ALL', numericConditions: [], linearBinWidthInput: '10', linearUpperBoundInput: '' },
    })
    for (const width of [360, 960]) {
      const markup = renderPlot(source, { width })
      assert.deepEqual(countAxisTicks(markup), [0, 1000, 2000, 3000])
      assert.deepEqual(barTitles(markup), weights.map((weight, index) =>
        `${index * 10}以上、${(index + 1) * 10}${index === weights.length - 1 ? '以下' : '未満'}：${weight.toLocaleString('ja-JP')}体`))
      if (showCumulative) assert.equal(cumulativePoints(markup).at(-1).proportion, 1)
      if ((display === 'strip' || display === 'both') && width === 960) {
        assert.deepEqual(cumulativeStripCells(markup).map(cell => cell.label?.[2]),
          ['22.1', '28.6', '45.7', '59', '65.2', '89.4', '96.7', '97.5', '99.7', '100'],
          '帯の数値は丸めた棒の割合を足さず、生の件数から計算する')
      }
    }
  }
})

test('画像モードは棒の度数・割合帯・平均・中央値と累積線を同時に残し、操作用要素を出力しない', () => {
  const markup = renderPlot(snapshot({ showPercentages: true, referenceVisibility: { mean: true, median: true } }))
  assert.match(markup, /class="enemy-chart-reference mean"/)
  assert.match(markup, /class="enemy-chart-reference median"/)
  assert.deepEqual(frequencyLabels(markup).map(({ text }) => text), ['2', '4', '2'])
  assert.deepEqual(percentageStripLabels(markup), ['25', '50', '25'])
  assert.match(markup, /data-histogram-cumulative="true"/)
  assert.match(markup, /各棒の中央に、その階級までの件数/)
  assert.match(markup, /線は最初の階級の点から始まります/)
  assert.match(markup, /<svg\b[^>]*role="img"/)
  assert.doesNotMatch(markup, /role="slider"|tabindex="0"|enemy-histogram-cumulative-hit-area|enemy-histogram-cumulative-tooltip|<button\b|NaN|Infinity/)
  assert.deepEqual(cumulativePoints(markup).map(point => point.count), [2, 6, 8])
  const small = renderPlot(snapshot({ showPercentages: true }), { width: 360, height: 334 })
  assert.deepEqual(cumulativePoints(small).map(point => point.proportion), [0.25, 0.75, 1])
})

test('累積割合の選択は初期なしで、保存された4表示形式・旧設定を復元する', () => {
  const normal = renderPanel({})
  assert.equal(selectedCumulativeDisplay(normal), 'なし')
  assert.deepEqual([...cumulativeSelect(normal).matchAll(/<option\b[^>]*>([^<]*)<\/option>/g)].map(match => match[1]),
    ['なし', '折れ線', '上部の帯', '折れ線＋上部の帯'])
  assert.doesNotMatch(normal, /data-histogram-cumulative/)
  const editor = renderPanel({ initialSnapshot: snapshot(), editor: true })
  assert.equal(selectedCumulativeDisplay(editor), '折れ線')
  assert.equal(selectedCumulativeDisplay(renderPanel({ initialSnapshot: snapshot({ cumulativeDisplay: 'strip' }), editor: true })), '上部の帯')
  assert.equal(selectedCumulativeDisplay(renderPanel({ initialSnapshot: snapshot({ showCumulative: false, cumulativeDisplay: 'strip' }), editor: true })), 'なし')
  assert.equal(selectedCumulativeDisplay(renderPanel({ initialSnapshot: snapshot({ cumulativeDisplay: 'both' }), editor: true })), '折れ線＋上部の帯')
  assert.equal(selectedCumulativeDisplay(renderPanel({ initialSnapshot: snapshot({ showCumulative: false, cumulativeDisplay: 'both' }), editor: true })), 'なし')
  const legacy = JSON.parse(JSON.stringify(snapshot({ showCumulative: false })))
  delete legacy.showCumulative
  delete legacy.cumulativeDisplay
  assert.equal(selectedCumulativeDisplay(renderPanel({ initialSnapshot: legacy, editor: true })), 'なし')
  legacy.showCumulative = true
  assert.equal(selectedCumulativeDisplay(renderPanel({ initialSnapshot: legacy, editor: true })), '折れ線')
})

test('度数を表示と割合の帯のチェックは初期ONで、編集時は別々の保存設定を復元する', () => {
  const control = (markup, text) => [...markup.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)]
    .find(([, label]) => clean(label) === text)?.[1]
  const defaults = renderPanel({})
  for (const label of ['度数を表示', '割合の帯']) {
    assert.match(control(defaults, label), /<input\b[^>]*type="checkbox"[^>]*checked=""/)
  }
  for (const showFrequencies of [false, true]) for (const showPercentages of [false, true]) {
    const source = snapshot({ showFrequencies, showPercentages })
    const markup = renderPanel({ initialSnapshot: source, editor: true })
    assert.equal(/checked=""/.test(control(markup, '度数を表示')), showFrequencies)
    assert.equal(/checked=""/.test(control(markup, '割合の帯')), showPercentages)
    const plot = renderPlot(source)
    assert.equal(frequencyLabels(plot).length, showFrequencies ? 3 : 0)
    assert.equal(/data-histogram-percentage="strip"/.test(plot), showPercentages)
  }
  const { showFrequencies: _setting, ...legacy } = snapshot({ showPercentages: false })
  assert.match(control(renderPanel({ initialSnapshot: legacy, editor: true }), '度数を表示'), /checked=""/)
})

test('上部の帯は線形・対数・評価・上限超過を同じ累積件数で示し、セルと数字を棒中央に合わせる', () => {
  for (const kind of ['linear', 'log', 'rating']) {
    const source = snapshot({ kind, cumulativeDisplay: 'strip' })
    const unchanged = structuredClone(source)
    const markup = renderPlot(source)
    const without = renderPlot(snapshot({ kind, showCumulative: false }))
    const line = renderPlot(snapshot({ kind }))
    const bins = source.ratingBins ?? source.statistics.bins
    const cells = cumulativeStripCells(markup)
    const centers = barCenters(markup)
    const frame = /<rect\b[^>]*data-chart-image-plot-area=""([^>]*)>/.exec(markup)?.[1]
    assert.match(markup, /data-histogram-cumulative="strip"/)
    assert.doesNotMatch(markup, /enemy-histogram-cumulative-axis|enemy-histogram-cumulative-line|enemy-histogram-cumulative-point|<path\b|<circle\b/)
    assert.deepEqual(cumulativePoints(markup), cumulativePoints(line), kind)
    assert.deepEqual(barTitles(markup), barTitles(without), kind)
    assert.equal(cells.length, bins.length)
    assert.equal(cumulativePoints(markup).at(-1).count, 8)
    assert.equal(cumulativePoints(markup).at(-1).proportion, 1)
    assert.equal(source.statistics.missingCount, 84)
    for (const [index, cell] of cells.entries()) {
      assert.ok(cell.rectangle && cell.label, `${kind}: cell ${index} has its background and cumulative label`)
      const left = Number(attr(cell.rectangle, 'x'))
      const right = left + Number(attr(cell.rectangle, 'width'))
      assert.ok(left < centers[index] && centers[index] < right, `${kind}: cell ${index} contains its bar center`)
      assert.ok(Math.abs(Number(attr(cell.label[1], 'x')) - centers[index]) < 1e-9, `${kind}: label ${index} matches its bar center`)
      assert.ok(Number(attr(cell.rectangle, 'y')) + Number(attr(cell.rectangle, 'height')) <= Number(attr(frame, 'y')),
        `${kind}: cumulative cell is above the plot`)
    }
    assert.doesNotMatch(markup, /NaN|Infinity/)
    assert.deepEqual(source, unchanged)
  }
})

test('折れ線と帯の併用は同じ階級の累積値を棒中央に示し、右軸を1つだけ持つ', () => {
  for (const kind of ['linear', 'log', 'rating']) {
    const source = snapshot({ kind, cumulativeDisplay: 'both' })
    const unchanged = structuredClone(source)
    const markup = renderPlot(source)
    const lineOnly = renderPlot(snapshot({ kind }))
    const strip = cumulativeSection(markup, 'strip')
    const line = cumulativeSection(markup, 'true')
    const centers = barCenters(markup)
    const cells = cumulativeStripCells(strip)
    const points = cumulativePointXs(line)
    assert.equal((markup.match(/data-histogram-cumulative="strip"/g) ?? []).length, 1)
    assert.equal((markup.match(/data-histogram-cumulative="true"/g) ?? []).length, 1)
    assert.equal((markup.match(/class="enemy-histogram-cumulative-axis"/g) ?? []).length, 1)
    assert.ok(overlayPath(line))
    assert.deepEqual(cumulativePoints(strip), cumulativePoints(line), kind)
    assert.deepEqual(cumulativePoints(line), cumulativePoints(lineOnly), kind)
    assert.deepEqual(barTitles(markup), barTitles(lineOnly), kind)
    assert.deepEqual(centers, barCenters(lineOnly), '併用時は折れ線と同じ右軸用の余白を使う')
    assert.equal(cells.length, centers.length)
    assert.equal(points.length, centers.length)
    for (const [index, center] of centers.entries()) {
      assert.ok(Math.abs(points[index] - center) < 1e-9, `${kind}: 点${index}は棒中央`)
      assert.ok(Math.abs(Number(attr(cells[index].label?.[1], 'x')) - center) < 1e-9, `${kind}: 帯の数値${index}は棒中央`)
    }
    assert.equal(cumulativePoints(strip).at(-1).count, 8)
    assert.equal(cumulativePoints(strip).at(-1).proportion, 1)
    assert.doesNotMatch(markup, /NaN|Infinity/)
    assert.deepEqual(source, unchanged)
  }
})

test('併用時も棒上の度数を維持し、折れ線との重なり回避と割合帯を残す', () => {
  const source = snapshot({ cumulativeDisplay: 'both', showPercentages: true })
  const markup = renderPlot(source)
  const lineOnly = renderPlot(snapshot({ showPercentages: true }))
  const labels = frequencyLabels(markup)
  assert.deepEqual(labels, frequencyLabels(lineOnly), '帯による全体移動以外は既存の度数配置を保つ')
  assert.deepEqual(labels.map(({ index, text }) => ({ index, text })), [
    { index: 0, text: '2' }, { index: 1, text: '4' }, { index: 2, text: '2' },
  ])
  assert.deepEqual(percentageStripLabels(markup), ['25', '50', '25'])
  const transform = /<g\b[^>]*class="enemy-histogram-values"[^>]*transform="translate\(([^ ]+) ([^)]+)\)"/.exec(markup)
  const bottom = stripBottom(percentageSection(markup))
  assert.ok(stripBottom(cumulativeSection(markup, 'strip')) < Number(attr(stripRectangles(percentageSection(markup))[0], 'y')),
    '累積割合を上、階級割合を下に並べる')
  const bars = [...markup.matchAll(/<rect\b[^>]*class="enemy-chart-bar[^"]*"([^>]*)>/g)]
  assert.ok(transform)
  for (const label of labels) {
    const labelY = Number(transform[2]) + label.y
    assert.ok(labelY > bottom, `度数${label.index}は割合帯の外にある`)
    assert.ok(labelY < Number(attr(bars[label.index][1], 'y')), `度数${label.index}は対応する棒より上にある`)
  }
  const hidden = renderPlot({ ...source, showFrequencies: false })
  assert.equal(frequencyLabels(hidden).length, 0)
  assert.deepEqual(percentageStripLabels(hidden), ['25', '50', '25'])
  assert.equal(cumulativeStripCells(hidden).length, 3)
  assert.equal(cumulativePointXs(hidden).length, 3)
})

test('上部の両帯でも度数は棒の上に残し、右軸用の横幅を使わない', () => {
  const source = snapshot({ cumulativeDisplay: 'strip', showPercentages: true })
  const markup = renderPlot(source)
  const without = renderPlot(snapshot({ showCumulative: false, showPercentages: true }))
  assert.deepEqual(barCenters(markup), barCenters(without))
  const labels = frequencyLabels(markup)
  assert.deepEqual(labels.map(({ index, text }) => ({ index, text })), [
    { index: 0, text: '2' }, { index: 1, text: '4' }, { index: 2, text: '2' },
  ])
  assert.deepEqual(percentageStripLabels(markup), ['25', '50', '25'])
  const transform = /<g\b[^>]*class="enemy-histogram-values"[^>]*transform="translate\(([^ ]+) ([^)]+)\)"/.exec(markup)
  assert.ok(transform)
  const bars = [...markup.matchAll(/<rect\b[^>]*class="enemy-chart-bar[^"]*"([^>]*)>/g)]
  const bottom = stripBottom(percentageSection(markup))
  for (const label of labels) {
    const labelY = Number(transform[2]) + label.y
    assert.ok(labelY > bottom, `度数${label.index}は割合帯の外にある`)
    assert.ok(labelY < Number(attr(bars[label.index][1], 'y')), `度数${label.index}は対応する棒より上にある`)
  }
  const noPercentages = renderPlot(snapshot({ cumulativeDisplay: 'strip' }))
  assert.deepEqual(frequencyLabels(noPercentages), labels)
  assert.doesNotMatch(noPercentages, /data-histogram-percentage="strip"/)
  assert.equal(cumulativeStripCells(noPercentages).length, 3)
})

test('左の帯名で上部見出しを各18px縮め、基準線なしでは4pxまで詰めて棒の高さを保つ', () => {
  for (const cumulativeDisplay of ['strip', 'both']) {
    for (const width of [360, 960]) {
      for (const showPercentages of [false, true]) {
        const source = snapshot({ cumulativeDisplay, showPercentages })
        const markup = renderPlot(source, { width })
        const without = renderPlot({ ...source, showCumulative: false }, { width })
        const frame = /<rect\b[^>]*data-chart-image-plot-area=""([^>]*)>/.exec(markup)?.[1]
        const lowerStrip = showPercentages ? percentageSection(markup) : cumulativeSection(markup, 'strip')
        assert.ok(frame && stripRectangles(lowerStrip).length)
        const rowCount = showPercentages ? 2 : 1
        assert.equal(Number(attr(frame, 'y')), 28 * rowCount,
          '各段は24pxのセルと4pxの隙間だけで、従来の18px見出し行を追加しない')
        assert.equal(Number(attr(frame, 'y')) - stripBottom(lowerStrip), 4)
        const barHeights = html => [...html.matchAll(/<rect\b[^>]*class="enemy-chart-bar[^"]*"([^>]*)>/g)]
          .map(match => Number(attr(match[1], 'height')))
        assert.deepEqual(barHeights(markup), barHeights(without), '帯の間を詰めても棒の高さを変えない')
      }
    }
  }
})

test('上部の帯と平均・中央値を保存画像へ残し、併用時も折れ線用の操作要素を出力しない', () => {
  for (const cumulativeDisplay of ['strip', 'both']) {
    const markup = renderPlot(snapshot({ cumulativeDisplay, showPercentages: true,
      referenceVisibility: { mean: true, median: true } }))
    assert.match(markup, /class="enemy-chart-reference mean"/)
    assert.match(markup, /class="enemy-chart-reference median"/)
    assert.match(markup, /data-histogram-cumulative="strip"/)
    assert.equal(frequencyLabels(markup).length, 3)
    assert.deepEqual(percentageStripLabels(markup), ['25', '50', '25'])
    assert.match(markup, /<svg\b[^>]*role="img"/)
    assert.doesNotMatch(markup, /role="slider"|tabindex="0"|enemy-histogram-cumulative-hit-area|enemy-histogram-cumulative-tooltip|<button\b|NaN|Infinity/)
    const bottom = stripBottom(percentageSection(markup))
    const references = [...markup.matchAll(/<text\b([^>]*class="enemy-chart-reference-label (?:mean|median)"[^>]*)>/g)]
    assert.equal(references.length, 2)
    for (const reference of references) assert.ok(Number(attr(reference[1], 'y')) > bottom, '平均・中央値の直接ラベルは両方の帯の下にある')
  }
})

test('累積の無効化・空データ・不正な分母や件数では上部に誤った帯を表示しない', () => {
  for (const cumulativeDisplay of ['strip', 'both']) {
    const source = snapshot({ cumulativeDisplay })
    assert.doesNotMatch(renderPlot({ ...source, showCumulative: false }), /data-histogram-cumulative/)
    const invalidStatistics = [
      { ...source.statistics, count: 0 },
      { ...source.statistics, count: -1 },
      { ...source.statistics, bins: [] },
      { ...source.statistics, bins: source.statistics.bins.map((bin, index) => ({ ...bin, count: index === 1 ? -1 : bin.count })) },
      { ...source.statistics, count: 1 },
    ]
    for (const statistics of invalidStatistics) {
      const markup = renderPlot({ ...source, statistics })
      assert.doesNotMatch(markup, /data-histogram-cumulative|data-cumulative-index/)
    }
  }
})

test('既存度数分布表の累積件数・割合と保存画像の折れ線が一致し、欠損84体を分母へ含めない', () => {
  const source = snapshot()
  const panel = renderPanel({ initialSnapshot: source })
  const table = /<table class="enemy-frequency-table">([\s\S]*?)<\/table>/.exec(panel)?.[1]
  assert.ok(table)
  const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(table)?.[1]
  const rows = [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(match => {
    const cells = [...match[1].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)]
    return { count: Number(clean(cells[0][2])), cumulative: attr(cells[2][1], 'title'), proportion: clean(cells[2][2]) }
  })
  assert.deepEqual(rows, [
    { count: 2, cumulative: '累積：2体', proportion: '25%' },
    { count: 4, cumulative: '累積：6体', proportion: '75%' },
    { count: 2, cumulative: '累積：8体', proportion: '100%' },
  ])
  const points = cumulativePoints(renderPlot(source))
  assert.deepEqual(rows.map(row => row.cumulative), points.map(point => `累積：${point.count}体`))
  assert.deepEqual(rows.map(row => row.proportion), points.map(point => `${point.proportion * 100}%`))
  assert.equal(source.statistics.count, 8)
  assert.equal(source.statistics.totalCount, 92)
})

test('期待出現数の小数を度数表・棒の値・分母へ残し、割合は未丸めの度数から求める', () => {
  const weights = [0.2, 0.3, 0.1, 0.2, 0.4]
  const aggregationCounts = { ...fixtureCounts, spawnAggregationMode: 'expected-lower-bound',
    summary: { ...fixtureCounts.summary, lowerBoundMapCount: 0, expectedMapCount: 1 },
    enemies: Object.fromEntries(weights.map((spawnCount, index) => [`enemy_${index}`, { mapCount: 1, spawnCount }])),
  }
  const source = createEnemyHistogramSnapshot({ ...snapshot(), coverage: aggregationCounts.summary,
    statistics: calculateWeightedHistogram(observations.map((observation, index) => ({ ...observation, weight: weights[index] })),
      { customLinearBinWidth: 10, customLinearUpperBound: 20 }),
  })
  const panel = renderPanel({ initialSnapshot: source, aggregationCounts })
  const table = /<table class="enemy-frequency-table">([\s\S]*?)<\/table>/.exec(panel)?.[1]
  assert.ok(table)
  const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(table)?.[1]
  const rows = [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(match => {
    const cells = [...match[1].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)]
    return { count: clean(cells[0][2]), cumulative: attr(cells[2][1], 'title'), proportion: clean(cells[2][2]) }
  })
  assert.deepEqual(rows, [
    { count: '0.2', cumulative: '累積：0.2体', proportion: '25%' },
    { count: '0.4', cumulative: '累積：0.6体', proportion: '75%' },
    { count: '0.2', cumulative: '累積：0.8体', proportion: '100%' },
  ])
  assert.ok(barTitles(panel).some(title => title.includes('0.2体')))
  assert.match(clean(panel), /割合の基準：エリート・検証fixture · 0\.8体/)
  assert.ok(barTitles(renderPlot(source)).some(title => title.includes('0.2体')))
  assert.equal(source.statistics.count, 0.8)
})
