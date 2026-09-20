import test from 'node:test'
import assert from 'node:assert/strict'
import { getEnemyChartImageFilename, getEnemyChartImageLayout, type EnemyChartKind } from '../src/lib/enemyChartImage.ts'

const kinds: EnemyChartKind[] = ['HISTOGRAM', 'ECDF', 'BOX', 'SCATTER', 'INDIVIDUAL']

test('自動比率ではグラフの自然な高さに見出しと余白を加える', () => {
  for (const kind of ['HISTOGRAM', 'ECDF', 'SCATTER'] as const) {
    assert.deepEqual(getEnemyChartImageLayout({ kind }), { width: 960, height: 410, chartHeight: 334 })
  }
  assert.deepEqual(getEnemyChartImageLayout({ kind: 'HISTOGRAM', chromeHeight: 143.5 }), { width: 960, height: 478, chartHeight: 334 })
})

test('箱ひげ図と個別プロットは表示するグループ数に必要な高さを確保する', () => {
  for (const kind of ['BOX', 'INDIVIDUAL'] as const) {
    assert.deepEqual(getEnemyChartImageLayout({ kind, groupCount: 1 }), { width: 960, height: 170, chartHeight: 94 })
    assert.deepEqual(getEnemyChartImageLayout({ kind, groupCount: 3 }), { width: 960, height: 310, chartHeight: 234 })
    assert.deepEqual(getEnemyChartImageLayout({ kind, groupCount: 5 }), { width: 960, height: 450, chartHeight: 374 })
    const wide = getEnemyChartImageLayout({ kind, groupCount: 12, aspectRatio: 3 })
    assert.equal(wide.chartHeight, 864)
    assert.equal(wide.width, wide.height * 3)
  }
})

test('プリセットや縦長・極端な比率でも余白を含む画像全体が指定比率になる', () => {
  const ratios = [16 / 9, 2, 21 / 9, 3, 9 / 16, 1 / 100, 100]
  for (const kind of kinds) {
    for (const aspectRatio of ratios) {
      const layout = getEnemyChartImageLayout({ kind, aspectRatio, groupCount: 4, chromeHeight: 137 })
      assert.ok([layout.width, layout.height, layout.chartHeight].every((dimension) => Number.isFinite(dimension) && dimension > 0))
      assert.ok(layout.width >= 960)
      assert.ok(Math.abs(layout.height - layout.width / aspectRatio) < 1)
      assert.equal(layout.height - layout.chartHeight, 137)
      assert.ok(layout.chartHeight >= (kind === 'BOX' || kind === 'INDIVIDUAL' ? 304 : 334))
    }
  }
})

test('縦長では幅を維持し、必要なときだけ横幅を広げる', () => {
  assert.deepEqual(getEnemyChartImageLayout({ kind: 'HISTOGRAM', aspectRatio: 16 / 9 }), { width: 960, height: 540, chartHeight: 464 })
  const tall = getEnemyChartImageLayout({ kind: 'SCATTER', aspectRatio: 1 / 2 })
  assert.deepEqual(tall, { width: 960, height: 1920, chartHeight: 1844 })
  const wide = getEnemyChartImageLayout({ kind: 'ECDF', aspectRatio: 10 })
  assert.deepEqual(wide, { width: 4100, height: 410, chartHeight: 334 })
})

test('条件表記が折り返されても描画高さと指定比率を保つ', () => {
  for (const kind of kinds) {
    const options = { kind, groupCount: 3, chromeHeight: 220 }
    const automatic = getEnemyChartImageLayout(options)
    const natural = getEnemyChartImageLayout({ kind, groupCount: 3 })
    assert.equal(automatic.chartHeight, natural.chartHeight)
    assert.equal(automatic.height - natural.height, 220 - 76)

    const panoramic = getEnemyChartImageLayout({ ...options, aspectRatio: 3 })
    assert.equal(panoramic.chartHeight, natural.chartHeight)
    assert.equal(panoramic.width, panoramic.height * 3)
    assert.equal(panoramic.height - panoramic.chartHeight, 220)
  }
})

test('不正な比率は自動へ戻し、不正なグループ数や余白が画像寸法へ伝播しない', () => {
  for (const aspectRatio of [0, -1, NaN, Infinity, -Infinity, 0.001, 101]) {
    assert.deepEqual(getEnemyChartImageLayout({ kind: 'HISTOGRAM', aspectRatio }), getEnemyChartImageLayout({ kind: 'HISTOGRAM' }))
  }
  for (const value of [NaN, Infinity, -1]) {
    assert.deepEqual(getEnemyChartImageLayout({ kind: 'BOX', groupCount: value, chromeHeight: value }), { width: 960, height: 170, chartHeight: 94 })
  }
})

test('保存名は指標とグラフ名を含み、散布図は両方の軸を区別する', () => {
  assert.equal(getEnemyChartImageFilename({ kind: 'HISTOGRAM', metricLabel: 'HP' }), '敵_HP_ヒストグラム.png')
  assert.equal(getEnemyChartImageFilename({ kind: 'ECDF', metricLabel: '防御力' }), '敵_防御力_累積分布.png')
  assert.equal(getEnemyChartImageFilename({ kind: 'BOX', metricLabel: '術耐性' }), '敵_術耐性_箱ひげ図.png')
  assert.equal(getEnemyChartImageFilename({ kind: 'INDIVIDUAL', metricLabel: 'HP' }), '敵_HP_個別プロット.png')
  assert.equal(getEnemyChartImageFilename({ kind: 'SCATTER', metricLabel: 'HP', secondaryMetricLabel: '攻撃力' }), '敵_HP_攻撃力_散布図.png')
  assert.equal(getEnemyChartImageFilename({ kind: 'BOX', metricLabel: 'HP', secondaryMetricLabel: '攻撃力' }), '敵_HP_箱ひげ図.png')
})

test('指標名の禁止文字・末尾のドットを除去し、空の指標名には代替名を使う', () => {
  assert.equal(getEnemyChartImageFilename({ kind: 'SCATTER', metricLabel: ' HP/最大. ', secondaryMetricLabel: '攻撃:防御?\n' }), '敵_HP_最大_攻撃_防御___散布図.png')
  assert.equal(getEnemyChartImageFilename({ kind: 'HISTOGRAM', metricLabel: ' ... ' }), '敵_ステータス_ヒストグラム.png')
  assert.ok(!/[<>:"/\\|?*\u0000-\u001f\u007f]/.test(getEnemyChartImageFilename({ kind: 'BOX', metricLabel: '<>"/\\|?*\u0000' })))
  assert.ok(getEnemyChartImageFilename({ kind: 'BOX', metricLabel: '字'.repeat(1000) }).length < 100)
})

test('絞り込みのない旧名を維持し、異なる対象条件を保存名で区別する', () => {
  const options = { kind: 'HISTOGRAM' as const, metricLabel: 'HP' }
  assert.equal(getEnemyChartImageFilename({ ...options, scopeLabel: '全敵' }), '敵_HP_ヒストグラム.png')
  assert.equal(getEnemyChartImageFilename({ ...options, scopeLabel: '全敵 · 術耐性＝50' }), '敵_HP_ヒストグラム_術耐性＝50.png')
  assert.equal(getEnemyChartImageFilename({ ...options, scopeLabel: '全敵 · 術耐性＝0' }), '敵_HP_ヒストグラム_術耐性＝0.png')
  assert.equal(getEnemyChartImageFilename({ ...options, scopeLabel: '全敵 · 術耐性＝60' }), '敵_HP_ヒストグラム_術耐性＝60.png')
  assert.equal(getEnemyChartImageFilename({ kind: 'SCATTER', metricLabel: 'HP', secondaryMetricLabel: '攻撃力',
    scopeLabel: 'ボス · 検索「巨像」 · 術耐性＝50 · HP≥10000' }), '敵_HP_攻撃力_散布図_ボス_検索「巨像」_術耐性＝50_HP≥10000.png')
  for (const kind of kinds) {
    assert.ok(getEnemyChartImageFilename({ ...options, kind, scopeLabel: 'エリート · 移動速度＜0.8' }).endsWith('_エリート_移動速度＜0.8.png'))
  }
})

test('検索条件の禁止文字を置換しても元の条件を識別できる', () => {
  const filename = (query: string) => getEnemyChartImageFilename({ kind: 'BOX', metricLabel: 'HP', scopeLabel: `全敵 · 検索「${query}」` })
  const slash = filename('A/B')
  const colon = filename('A:B')
  assert.match(slash, /^敵_HP_箱ひげ図_検索「A_B」_[0-9a-f]{8}\.png$/)
  assert.notEqual(slash, colon)
  assert.equal(slash, filename('A/B'))
  assert.ok(!/[<>:"/\\|?*\u0000-\u001f\u007f]/.test(filename('<>"/\\|?*\u0000')))
})

test('長い条件は末尾の違いを保持し、散布図の両軸を含む保存名全体の長さを抑える', () => {
  const scope = `全敵 · 検索「${'敵'.repeat(120)}」 · 術耐性＝`
  const options = { kind: 'SCATTER' as const, metricLabel: 'HP', secondaryMetricLabel: '攻撃力' }
  const first = getEnemyChartImageFilename({ ...options, scopeLabel: `${scope}50` })
  const second = getEnemyChartImageFilename({ ...options, scopeLabel: `${scope}60` })
  assert.notEqual(first, second)
  for (const name of [first, second, getEnemyChartImageFilename({ ...options, metricLabel: '字'.repeat(100),
    secondaryMetricLabel: '😀'.repeat(100), scopeLabel: scope })]) {
    assert.ok(new TextEncoder().encode(name).length <= 200)
    assert.match(name, /_[0-9a-f]{8}\.png$/)
    assert.ok(!name.includes('\ufffd'))
  }
})
