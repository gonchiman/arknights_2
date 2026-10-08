import assert from 'node:assert/strict'
import test from 'node:test'
import type { SurtrDpsOutputSeries } from '../src/lib/surtrDpsOutput.ts'
import {
  buildSurtrUnequippedComparisonSeries,
  formatSurtrUnequippedComparisonValue,
  getSurtrUnequippedComparisonTsv,
} from '../src/lib/surtrUnequippedComparison.ts'

function series(id: string, values: readonly [number, number | null][], label = id): SurtrDpsOutputSeries {
  return { id, label, color: '#3f7699', points: values.map(([x, value]) => ({ x, value })) }
}

test('未装備を非表示にしても独立した基準で比較し、表示順とMOD段階の識別を保つ', () => {
  const baseline = series('none', [[0, 100], [60, 50]], '未装備')
  const targets = [
    { ...series('x:lv3', [[60, 75], [0, 150]], 'MOD X Lv.3'), lineStyle: 'solid' as const },
    { ...series('x:lv1', [[0, 125], [60, 40]], 'MOD X Lv.1'), lineStyle: 'dotted' as const },
    { ...series('y:lv2', [[0, 90], [60, 60]], 'MOD Y Lv.2'), lineStyle: 'dashed' as const },
  ]
  const before = structuredClone({ targets, baseline })
  const output = buildSurtrUnequippedComparisonSeries(targets, baseline, 'difference')
  assert.deepEqual(output.map(item => item.id), ['x:lv3', 'x:lv1', 'y:lv2'])
  assert.deepEqual(output.map(item => item.points.map(point => point.value)), [[25, 50], [25, -10], [-10, 10]])
  assert.deepEqual(output.map(({ points: _, ...identity }) => identity), targets.map(({ points: _, ...identity }) => identity))
  output[0].points[0].value = 999
  assert.deepEqual({ targets, baseline }, before)
})

test('表示中の未装備系列を返さず、別渡しの基準を優先して各指標を計算する', () => {
  const baseline = series('none', [[0, 100], [60, 50]])
  const input = [series('none', [[0, 999], [60, 999]]), series('x:lv3', [[0, 125], [60, 40]])]
  for (const [metric, expected] of [
    ['difference', [25, -10]], ['ratio', [125, 80]], ['percent', [25, -19.999999999999996]],
  ] as const) {
    const output = buildSurtrUnequippedComparisonSeries(input, baseline, metric)
    assert.deepEqual(output.map(item => item.id), ['x:lv3'])
    assert.deepEqual(output[0].points.map(point => point.value), expected)
  }
})

test('ゼロ・欠損・非有限の基準では比率を表示せず、ゼロ基準のDPS差は保持する', () => {
  const baseline = series('none', [[0, 0], [10, 0], [20, null], [30, NaN], [40, Infinity], [60, 50]])
  const input = [series('x', [[0, 20], [10, 0], [20, 20], [30, 20], [40, 20], [50, 20], [60, 0]])]
  assert.deepEqual(buildSurtrUnequippedComparisonSeries(input, baseline, 'difference')[0].points.map(point => point.value),
    [20, 0, null, null, null, null, -50])
  assert.deepEqual(buildSurtrUnequippedComparisonSeries(input, baseline, 'ratio')[0].points.map(point => point.value),
    [null, null, null, null, null, null, 0])
  assert.deepEqual(buildSurtrUnequippedComparisonSeries(input, baseline, 'percent')[0].points.map(point => point.value),
    [null, null, null, null, null, null, -100])
})

test('未装備モデルがないときは他MODへ基準を切り替えず、比較値をnullにする', () => {
  const input = [series('none', [[0, 100]]), series('x', [[0, 200]])]
  for (const metric of ['difference', 'ratio', 'percent'] as const) {
    assert.deepEqual(buildSurtrUnequippedComparisonSeries(input, null, metric), [series('x', [[0, null]])])
    assert.deepEqual(buildSurtrUnequippedComparisonSeries([], null, metric), [])
  }
})

test('比較は表示の丸め前に求め、比率は微小値を増加率への変換で失わない', () => {
  const baseline = series('none', [[0, 1.004], [10, 100]])
  const input = [series('x', [[0, 1.006], [10, 1e-20]])]
  const difference = buildSurtrUnequippedComparisonSeries(input, baseline, 'difference')[0].points[0].value
  assert.equal(difference, 1.006 - 1.004)
  assert.equal(formatSurtrUnequippedComparisonValue(difference, 'difference', 2), '0.00')
  const ratio = buildSurtrUnequippedComparisonSeries(input, baseline, 'ratio')[0].points
  assert.equal(ratio[0].value, 1.006 / 1.004 * 100)
  assert.equal(ratio[1].value, 1e-20 / 100 * 100)
  assert.ok(ratio[1].value! > 0)
})

test('非有限の比較DPSと演算オーバーフローをnullにする', () => {
  const baseline = series('none', [[0, 100], [10, 100], [20, Number.MIN_VALUE]])
  const input = [series('x', [[0, NaN], [10, Infinity], [20, Number.MAX_VALUE]])]
  for (const metric of ['ratio', 'percent'] as const) {
    assert.deepEqual(buildSurtrUnequippedComparisonSeries(input, baseline, metric)[0].points.map(point => point.value), [null, null, null])
  }
  assert.deepEqual(buildSurtrUnequippedComparisonSeries(input, baseline, 'difference')[0].points.map(point => point.value),
    [null, null, Number.MAX_VALUE])
})

test('DPS差と増加率は正値に＋を付け、基準比は通常の百分率にする', () => {
  assert.equal(formatSurtrUnequippedComparisonValue(1234.5, 'difference', 2), '+1,234.50')
  assert.equal(formatSurtrUnequippedComparisonValue(1234.5, 'difference', 2, false), '+1234.50')
  assert.equal(formatSurtrUnequippedComparisonValue(20.25, 'percent', 2), '+20.25%')
  assert.equal(formatSurtrUnequippedComparisonValue(-20.25, 'percent', 2), '-20.25%')
  assert.equal(formatSurtrUnequippedComparisonValue(120.25, 'ratio', 2), '120.25%')
  for (const metric of ['difference', 'ratio', 'percent'] as const) {
    for (const value of [-0, -0.0001, 0.0001]) {
      assert.equal(formatSurtrUnequippedComparisonValue(value, metric, 2), metric === 'difference' ? '0.00' : '0.00%')
    }
    for (const value of [null, undefined, NaN, Infinity, -Infinity]) {
      assert.equal(formatSurtrUnequippedComparisonValue(value, metric, 2), '—')
    }
  }
})

test('小数0〜3桁を固定し、既存S3のtoFixed境界丸めと不正な桁数の扱いに揃える', () => {
  for (const [digits, expected] of [[0, '+1'], [1, '+1.0'], [2, '+1.00'], [3, '+1.005']] as const) {
    assert.equal(formatSurtrUnequippedComparisonValue(1.005, 'difference', digits), expected)
  }
  assert.equal(formatSurtrUnequippedComparisonValue(-1.005, 'difference', 2), '-1.00')
  assert.equal(formatSurtrUnequippedComparisonValue(1.015, 'difference', 2), '+1.01')
  for (const digits of [-1, 4, 0.5, NaN]) {
    assert.equal(formatSurtrUnequippedComparisonValue(12.5, 'ratio', digits), '13%')
  }
})

test('B形式TSVは未装備DPSと各MODのDPS・比較値を別セルに出し、行の指定順を保つ', () => {
  const baseline = series('none', [[0, 100], [60, 50]], '未装備')
  const input = [series('none', [[0, 999]]), series('x:lv3', [[0, 125], [60, 40]], 'MOD X Lv.3')]
  const before = structuredClone({ input, baseline })
  const labels = {
    difference: '未装備とのDPS差', ratio: '未装備に対するDPS比（%）', percent: '未装備からの増加率（%）',
  }
  const values = { difference: ['-10.00', '+25.00'], ratio: ['80.00%', '125.00%'], percent: ['-20.00%', '+25.00%'] }
  for (const metric of ['difference', 'ratio', 'percent'] as const) {
    const output = getSurtrUnequippedComparisonTsv(input, baseline, [60, 0, 100], 2, metric, 'combined')
    assert.equal(output, [
      `術耐性\t未装備 DPS\tMOD X Lv.3 DPS\tMOD X Lv.3 ${labels[metric]}`,
      `60\t50.00\t40.00\t${values[metric][0]}`,
      `0\t100.00\t125.00\t${values[metric][1]}`,
      '100\t—\t—\t—',
    ].join('\r\n'))
    assert.ok(output.split('\r\n').every(row => row.split('\t').length === 4))
  }
  assert.deepEqual({ input, baseline }, before)
})

test('C形式TSVは複数の同MOD段階を別列に保ち、基準比だけをコピーする', () => {
  const baseline = series('none', [[0, 1000], [10, 0]], '未装備')
  const input = [
    series('x:lv1', [[0, 1100], [10, 25]], 'MOD X Lv.1'),
    series('x:lv2', [[0, 1200], [10, 25]], 'MOD X Lv.2'),
    series('x:lv3', [[0, 1300], [10, 25]], 'MOD X Lv.3'),
  ]
  assert.equal(getSurtrUnequippedComparisonTsv(input, baseline, [0, 10], 1, 'ratio', 'comparison'), [
    '術耐性\tMOD X Lv.1 未装備に対するDPS比（%）\tMOD X Lv.2 未装備に対するDPS比（%）\tMOD X Lv.3 未装備に対するDPS比（%）',
    '0\t110.0%\t120.0%\t130.0%', '10\t—\t—\t—',
  ].join('\r\n'))
  assert.equal(getSurtrUnequippedComparisonTsv(input.slice(0, 1), baseline, [0, 10], 0, 'difference', 'comparison'), [
    '術耐性\tMOD X Lv.1 未装備とのDPS差', '0\t+100', '10\t+25',
  ].join('\r\n'))
  assert.equal(getSurtrUnequippedComparisonTsv(input.slice(0, 1), baseline, [0, 10], 0, 'percent', 'comparison'), [
    '術耐性\tMOD X Lv.1 未装備からの増加率（%）', '0\t+10%', '10\t—',
  ].join('\r\n'))
})

test('TSVは生DPSを丸めてから差を取らず、非有限値と未装備なしを—で出す', () => {
  const baseline = series('none', [[0, 1.004], [10, null]])
  const input = [series('x', [[0, 1.006], [10, Infinity]], 'MOD X')]
  assert.equal(getSurtrUnequippedComparisonTsv(input, baseline, [0, 10], 2, 'difference', 'combined'), [
    '術耐性\t未装備 DPS\tMOD X DPS\tMOD X 未装備とのDPS差',
    '0\t1.00\t1.01\t0.00', '10\t—\t—\t—',
  ].join('\r\n'))
  assert.equal(getSurtrUnequippedComparisonTsv(input, null, [0], 2, 'ratio', 'combined'), [
    '術耐性\t未装備 DPS\tMOD X DPS\tMOD X 未装備に対するDPS比（%）', '0\t—\t1.01\t—',
  ].join('\r\n'))
})

test('TSVの見出しにタブや改行を持ち込まず、値は桁区切りなしの1セル1値にする', () => {
  const baseline = series('none', [[0, 1000]])
  const input = [series('x', [[0, 1234.5]], ' MOD\tX\r\nLv.3 ')]
  assert.equal(getSurtrUnequippedComparisonTsv(input, baseline, [0], 2, 'difference', 'combined'), [
    '術耐性\t未装備 DPS\tMOD X Lv.3 DPS\tMOD X Lv.3 未装備とのDPS差', '0\t1000.00\t1234.50\t+234.50',
  ].join('\r\n'))
  assert.equal(getSurtrUnequippedComparisonTsv([series('x', [[0, 2]], '=1+2')], baseline, [], 0, 'percent', 'comparison'),
    "術耐性\t'=1+2 未装備からの増加率（%）")
  assert.equal(getSurtrUnequippedComparisonTsv([], null, [], 0, 'difference', 'comparison'), '術耐性')
})
