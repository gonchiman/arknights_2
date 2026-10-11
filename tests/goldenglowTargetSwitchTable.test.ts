import assert from 'node:assert/strict'
import test from 'node:test'
import type { ResistanceComparisonSeries } from '../src/lib/goldenglowResistanceComparison.ts'
import { buildGgTableRows, formatGgTableValue, getGgTableBaselineId, getGgTableTargets, getGgTableTitle, getGgTableTsv,
  type GgTableBuild, type GgTableData } from '../src/lib/goldenglowTargetSwitchTable.ts'

const none: GgTableBuild = { id: 'none', label: '未装備', moduleId: '', moduleType: null, moduleLevel: 0 }
const x = (level: number): GgTableBuild => ({ id: `x:lv${level}`, label: `MOD X Lv.${level}`, moduleId: 'x', moduleType: 'X', moduleLevel: level })
const y = (level: number): GgTableBuild => ({ id: `y:lv${level}`, label: `MOD Y Lv.${level}`, moduleId: 'y', moduleType: 'Y', moduleLevel: level })
function series(build: GgTableBuild, values: readonly [number, number, number][]): ResistanceComparisonSeries {
  return { id: build.id, label: build.label, moduleType: build.moduleType,
    points: values.map(([enemyHp, enemyResistance, expectedDamage]) => ({ enemyHp, enemyResistance, expectedDamage,
      damageBreakdown: { normalDamage: 0, explosionDamage: 0, bodyDamage: 0 } })) }
}
function data(changes: Partial<GgTableData> = {}): GgTableData {
  return { builds: [none, x(3), y(3)], series: [series(none, [[500, 0, 100]]), series(x(3), [[500, 0, 125]]), series(y(3), [[500, 0, 140]])],
    hps: [500], resistances: [0], baseline: { kind: 'unequipped' }, metric: 'difference', layout: 'combined',
    precision: 1, showRanks: false, colorScale: 'NONE', ...changes }
}

test('HPと術耐性の両方を厳密に照合し、表示順を維持し、expectedDamageをそのまま使う', () => {
  const input = data({ hps: [2000, 500], resistances: [60, 0], series: [
    series(none, [[500, 0, 100], [500, 60, 110], [2000, 0, 200], [2000, 60, 210]]),
    series(x(3), [[2000, 60, 300], [500, 0, 120], [2000, 0, 240], [500, 60, 150]]),
    series(y(3), [[500, 0, 1800], [2000, 60, 330]]),
  ] })
  const before = structuredClone(input)
  const rows = buildGgTableRows(input)
  assert.deepEqual(rows.map(row => row.resistance), [60, 0])
  assert.deepEqual(rows[0].cells.map(cell => [cell.hp, cell.buildId, cell.total, cell.comparison]), [
    [2000, 'none', 210, null], [2000, 'x:lv3', 300, 90], [2000, 'y:lv3', 330, 120],
    [500, 'none', 110, null], [500, 'x:lv3', 150, 40], [500, 'y:lv3', null, null],
  ])
  assert.equal(rows[1].cells.find(cell => cell.hp === 2000 && cell.buildId === 'y:lv3')?.total, null)
  assert.equal(rows[1].cells.find(cell => cell.hp === 500 && cell.buildId === 'y:lv3')?.total, 1800)
  assert.equal(rows[0].rank?.rating, 'A+')
  assert.deepEqual(input, before)
})

test('表示されていない前段階と選択基準を同じHP・術耐性の独立系列から参照する', () => {
  const input = data({ builds: [x(3), y(1)], series: [series(x(3), [[500, 0, 200]]), series(y(1), [[500, 0, 150]]),
    series(x(2), [[500, 0, 160]]), series(y(2), [[500, 0, 9999]]), series(none, [[500, 0, 100]])],
    baseline: { kind: 'previous' }, layout: 'comparison' })
  assert.equal(getGgTableBaselineId(x(1), input.baseline), 'none')
  assert.equal(getGgTableBaselineId(x(3), input.baseline), 'x:lv2')
  assert.equal(getGgTableBaselineId(none, input.baseline), null)
  assert.deepEqual(buildGgTableRows(input)[0].cells.map(cell => cell.comparison), [40, 50])
  assert.deepEqual(buildGgTableRows({ ...input, baseline: { kind: 'selected', id: 'x:lv2' }, metric: 'ratio' })[0].cells.map(cell => cell.comparison), [125, 93.75])
  assert.equal(buildGgTableRows({ ...input, series: input.series.filter(item => item.id !== 'x:lv2') })[0].cells[0].comparison, null)
})

test('比較値のみでは未装備と選択基準を除外し、総ダメージと併記では選択した列を保つ', () => {
  const input = data({ baseline: { kind: 'selected', id: 'x:lv3' } })
  assert.deepEqual(getGgTableTargets({ ...input, layout: 'comparison' }).map(build => build.id), ['y:lv3'])
  for (const layout of ['total', 'combined'] as const) assert.deepEqual(getGgTableTargets({ ...input, layout }).map(build => build.id), ['none', 'x:lv3', 'y:lv3'])
  assert.equal(buildGgTableRows(input)[0].cells[1].comparison, 0)
  assert.equal(buildGgTableRows({ ...input, metric: 'ratio' })[0].cells[1].comparison, 100)
  assert.ok(buildGgTableRows({ ...input, layout: 'total' })[0].cells.every(cell => cell.comparison === null))
})

test('丸め前の値で差・比率・増加率を求め、表示だけを指定桁数に丸める', () => {
  const input = data({ builds: [x(3)], series: [series(none, [[500, 0, 1.004]]), series(x(3), [[500, 0, 1.006]])], precision: 2 })
  const cell = buildGgTableRows(input)[0].cells[0]
  assert.equal(cell.comparison, 1.006 - 1.004)
  assert.equal(formatGgTableValue(cell.total, 'total', 2), '1.01')
  assert.equal(formatGgTableValue(cell.comparison, 'difference', 2), '0.00')
  assert.equal(buildGgTableRows({ ...input, metric: 'ratio' })[0].cells[0].comparison, 1.006 / 1.004 * 100)
  assert.equal(buildGgTableRows({ ...input, metric: 'percent' })[0].cells[0].comparison, (1.006 / 1.004 - 1) * 100)
  assert.equal(formatGgTableValue(1234.567, 'total', 2), '1,234.57')
  assert.equal(formatGgTableValue(1234.567, 'total', 2, false), '1234.57')
  assert.equal(formatGgTableValue(-0.001, 'total', 2), '0.00')
})

test('ゼロ基準・欠損点・非有限値は比率と増加率を空欄扱いにする', () => {
  const input = data({ builds: [x(3)], resistances: [0, 20, 40, 60], series: [
    series(none, [[500, 0, 0], [500, 20, 10], [500, 40, NaN]]),
    series(x(3), [[500, 0, 20], [500, 20, Infinity], [500, 40, 30], [500, 60, 40]]),
  ] })
  assert.deepEqual(buildGgTableRows(input).map(row => row.cells[0].comparison), [20, null, null, null])
  for (const metric of ['ratio', 'percent'] as const) assert.deepEqual(buildGgTableRows({ ...input, metric }).map(row => row.cells[0].comparison), [null, null, null, null])
  assert.equal(formatGgTableValue(Infinity, 'total', 1), '—')
  assert.equal(formatGgTableValue(null, 'ratio', 1), '—')
})

test('TSVは画面と同じHP・MOD順、1セル1値、未装備の総ダメージ1列を保つ', () => {
  assert.equal(getGgTableTsv(data()), [
    '術耐性\t敵HP 500 未装備 総ダメージ期待値\t敵HP 500 MOD X Lv.3 総ダメージ期待値\t敵HP 500 MOD X Lv.3 未装備とのダメージ差\t敵HP 500 MOD Y Lv.3 総ダメージ期待値\t敵HP 500 MOD Y Lv.3 未装備とのダメージ差',
    '0\t100.0\t125.0\t+25.0\t140.0\t+40.0',
  ].join('\r\n'))
  const ranked = getGgTableTsv(data({ showRanks: true, layout: 'comparison', metric: 'ratio' })).split('\r\n').map(row => row.split('\t'))
  assert.deepEqual(ranked[0].slice(0, 2), ['術耐性ランク', '術耐性'])
  assert.deepEqual(ranked[1], ['E', '0', '125.0%', '140.0%'])
  assert.ok(ranked.every(row => row.length === 4))
  const unsafe = { ...x(3), label: '=MOD\tX\r\nLv.3' }
  assert.match(getGgTableTsv(data({ builds: [unsafe], layout: 'comparison' })), /'=MOD X Lv\.3/)
  assert.equal(getGgTableTitle(data({ baseline: { kind: 'previous' } })), 'ゴールデングロー MOD・段階比較（総ダメージ＋総ダメージ差・前段階基準）')
  assert.equal(getGgTableTitle(data({ layout: 'total' })), 'ゴールデングロー スキル総ダメージ期待値')
})

test('比較画像の自動タイトルで差・比率・増加率と実際の基準を区別する', () => {
  assert.equal(getGgTableTitle(data({ layout: 'comparison', metric: 'percent' })), 'ゴールデングロー MOD比較（増加率・未装備基準）')
  assert.equal(getGgTableTitle(data({ layout: 'comparison', metric: 'ratio', baseline: { kind: 'selected', id: 'x:lv3' } })),
    'ゴールデングロー MOD比較（基準比・MOD X Lv.3基準）')
  assert.equal(getGgTableTitle(data({ builds: [x(3)], layout: 'comparison', metric: 'difference', baseline: { kind: 'previous' } })),
    'ゴールデングロー MOD段階比較（総ダメージ差・前段階基準）')
  assert.equal(getGgTableTitle(data({ builds: [y(3)], layout: 'combined', metric: 'ratio', baseline: { kind: 'selected', id: 'x:lv3' } })),
    'ゴールデングロー MOD比較（総ダメージ＋基準比・MOD X Lv.3基準）')
})
