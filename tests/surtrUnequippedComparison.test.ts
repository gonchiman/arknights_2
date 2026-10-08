import assert from 'node:assert/strict'
import test from 'node:test'
import type { SurtrDpsOutputSeries } from '../src/lib/surtrDpsOutput.ts'
import { getSurtrUnequippedColorScaleBackground, getSurtrUnequippedColorScaleMaximum } from '../src/lib/surtrUnequippedColorScale.ts'
import {
  buildSurtrUnequippedComparisonSeries,
  formatSurtrUnequippedComparisonValue,
  getSurtrPreviousStageId,
  getSurtrStageComparisonBaseline,
  getSurtrUnequippedComparisonTsv,
  type SurtrUnequippedBlockingComparison,
} from '../src/lib/surtrUnequippedComparison.ts'

test('余燼のTSVは期待総ダメージの値・基準名を使い、DPS表の既定ラベルを変えない', () => {
  const baseline = series('none', [[60, 1000]], '未装備')
  const target = series('y:lv3', [[60, 2400]], 'MOD Y Lv.3')
  const references = [series('y:lv2', [[60, 1600]], 'MOD Y Lv.2')]
  const expected = getSurtrUnequippedComparisonTsv([target], baseline, [60], 1, 'difference', 'combined',
    undefined, 'none', 'module', 'previous', references, 'expected-damage')
  assert.equal(expected, [
    '術耐性\tMOD Y Lv.3 総ダメージ期待値\tMOD Y Lv.3 前段階とのダメージ差（基準：MOD Y Lv.2）',
    '60\t2400.0\t+800.0',
  ].join('\r\n'))
  const ratio = getSurtrUnequippedComparisonTsv([target], baseline, [60], 1, 'ratio', 'comparison',
    undefined, 'none', 'module', 'unequipped', [], 'expected-damage')
  assert.equal(ratio, '術耐性\tMOD Y Lv.3 未装備に対する総ダメージ期待値比（%）\r\n60\t240.0%')
  const dps = getSurtrUnequippedComparisonTsv([target], baseline, [60], 1, 'difference', 'combined',
    undefined, 'none', 'module', 'previous', references)
  assert.equal(dps, expected.replaceAll('総ダメージ期待値', 'DPS').replace('とのダメージ差', 'とのDPS差'))
})

function series(id: string, values: readonly [number, number | null][], label = id): SurtrDpsOutputSeries {
  return { id, label, color: '#3f7699', points: values.map(([x, value]) => ({ x, value })) }
}

test('カラースケールは同じ基準からの差を線形に色付けし、比率100%を中立にする', () => {
  for (const metric of ['difference', 'percent', 'ratio'] as const) {
    const neutral = metric === 'ratio' ? 100 : 0
    const maximum = getSurtrUnequippedColorScaleMaximum([neutral - 25, neutral, neutral + 50, null, undefined, NaN, Infinity], metric)
    assert.equal(maximum, 50)
    assert.equal(getSurtrUnequippedColorScaleBackground(neutral + 50, metric, maximum), 'color-mix(in srgb, #245ea8 40%, var(--surface))')
    assert.equal(getSurtrUnequippedColorScaleBackground(neutral + 25, metric, maximum), 'color-mix(in srgb, #245ea8 20%, var(--surface))')
    assert.equal(getSurtrUnequippedColorScaleBackground(neutral - 25, metric, maximum), 'color-mix(in srgb, #ae733c 20%, var(--surface))')
    assert.equal(getSurtrUnequippedColorScaleBackground(neutral, metric, maximum), undefined)
  }
})

test('カラースケールは欠損・非有限値・最大値ゼロを着色せず濃さの上限を守る', () => {
  assert.equal(getSurtrUnequippedColorScaleMaximum([], 'difference'), 0)
  assert.equal(getSurtrUnequippedColorScaleMaximum([0, -0, null, NaN, Infinity], 'percent'), 0)
  assert.equal(getSurtrUnequippedColorScaleMaximum([100, null, NaN], 'ratio'), 0)
  for (const mode of ['LINEAR', 'SQRT'] as const) {
    for (const value of [undefined, null, NaN, Infinity, -Infinity, 0, -0]) {
      assert.equal(getSurtrUnequippedColorScaleBackground(value, 'difference', 50, mode), undefined)
    }
    for (const maximum of [0, -1, NaN, Infinity]) {
      assert.equal(getSurtrUnequippedColorScaleBackground(25, 'difference', maximum, mode), undefined)
    }
    assert.equal(getSurtrUnequippedColorScaleBackground(75, 'difference', 50, mode), 'color-mix(in srgb, #245ea8 40%, var(--surface))')
  }
})

test('平方根の濃淡は最大差と中立を保ち、正負とも中程度の差を見やすくする', () => {
  for (const metric of ['difference', 'percent', 'ratio'] as const) {
    const neutral = metric === 'ratio' ? 100 : 0
    assert.equal(getSurtrUnequippedColorScaleBackground(neutral + 100, metric, 100, 'SQRT'), 'color-mix(in srgb, #245ea8 40%, var(--surface))')
    assert.equal(getSurtrUnequippedColorScaleBackground(neutral + 25, metric, 100, 'SQRT'), 'color-mix(in srgb, #245ea8 20%, var(--surface))')
    assert.equal(getSurtrUnequippedColorScaleBackground(neutral - 25, metric, 100, 'SQRT'), 'color-mix(in srgb, #ae733c 20%, var(--surface))')
    assert.equal(getSurtrUnequippedColorScaleBackground(neutral + 25, metric, 100, 'LINEAR'), 'color-mix(in srgb, #245ea8 10%, var(--surface))')
    assert.equal(getSurtrUnequippedColorScaleBackground(neutral, metric, 100, 'SQRT'), undefined)
  }
})

test('ランク表示付きTSVは境界に従うランクを独立列に出し、結合セルも全行へ展開する', () => {
  const resistances = [0, 1, 9, 10, 19, 20, 29, 30, 49, 50, 59, 60, 69, 70, 79, 80, 90, 91, 100]
  const ranks = ['E', 'D', 'D', 'C', 'C', 'B', 'B', 'B+', 'B+', 'A', 'A', 'A+', 'A+', 'S', 'S', 'S+', 'S+', 'SS', 'SS']
  const baseline = series('none', resistances.map(value => [value, 100]), '未装備')
  const input = [series('x:lv3', resistances.map(value => [value, 125]), 'MOD X Lv.3')]
  const blockingComparison = [
    { blocking: false, series: input, baseline },
    { blocking: true, series: [series('x:lv3', resistances.map(value => [value, 150]), 'MOD X Lv.3')], baseline },
  ]
  for (const blocking of [undefined, blockingComparison]) {
    for (const layout of ['combined', 'comparison'] as const) {
      for (const metric of ['difference', 'ratio', 'percent'] as const) {
        const old = getSurtrUnequippedComparisonTsv(input, baseline, resistances, 1, metric, layout, blocking)
        assert.equal(getSurtrUnequippedComparisonTsv(input, baseline, resistances, 1, metric, layout, blocking, 'none'), old)
        for (const rankMode of ['inline', 'merged'] as const) {
          const copied = getSurtrUnequippedComparisonTsv(input, baseline, resistances, 1, metric, layout, blocking, rankMode)
          const rows = copied.split('\r\n').map(row => row.split('\t'))
          assert.equal(rows[0][1], '術耐性ランク')
          assert.deepEqual(rows.slice(1).map(row => row[1]), ranks)
          assert.ok(rows.every(row => row.length === rows[0].length), 'Each copied row must retain complete columns')
          assert.equal(rows.map(row => [row[0], ...row.slice(2)].join('\t')).join('\r\n'), old,
            'Rank visibility must not change resistance, baseline, blocking columns or comparison values')
        }
      }
    }
  }
})

test('ランク付きコピーは部分範囲と指定順を保ち、不明なランクを推測しない', () => {
  const resistances = [55, 48, 41, 34, 27, 20, 13, -1, 101]
  const baseline = series('none', resistances.map(value => [value, 100]))
  const input = [series('x', resistances.map(value => [value, 125]))]
  const expectedRanks = ['A', 'B+', 'B+', 'B+', 'B', 'B', 'C', '—', '—']
  for (const rankMode of ['inline', 'merged'] as const) {
    const copied = getSurtrUnequippedComparisonTsv(input, baseline, resistances, 0, 'difference', 'comparison', undefined, rankMode)
    assert.deepEqual(copied.split('\r\n').slice(1).map(row => row.split('\t').slice(0, 2)),
      resistances.map((value, index) => [String(value), expectedRanks[index]]))
  }
})

test('ブロック条件別TSVは条件→指定MOD段階の列順で各指標を出し、ランク列と基準を維持する', () => {
  const resistances = [0, 60]
  const baseline = series('none', [[0, 100], [60, 80]], '未装備')
  const input = [series('y:lv2', [[0, 150], [60, 80]], 'MOD Y Lv.2'),
    series('x:lv3', [[0, 125], [60, 60]], 'MOD X Lv.3'), series('x:lv1', [[0, 130], [60, 70]], 'MOD X Lv.1')]
  const blocked = [series('x:lv1', [[0, 140], [60, 65]], 'MOD X Lv.1'),
    series('x:lv3', [[0, 115], [60, 55]], 'MOD X Lv.3'), series('y:lv2', [[0, 180], [60, 88]], 'MOD Y Lv.2')]
  const blockingComparison = [{ blocking: true, series: blocked, baseline }, { blocking: false, series: [...input].reverse(), baseline }]
  const raw = [['150.0', '125.0', '130.0', '180.0', '115.0', '140.0'], ['80.0', '60.0', '70.0', '88.0', '55.0', '65.0']]
  const expected = {
    difference: [['+50.0', '+25.0', '+30.0', '+80.0', '+15.0', '+40.0'], ['0.0', '-20.0', '-10.0', '+8.0', '-25.0', '-15.0']],
    ratio: [['150.0%', '125.0%', '130.0%', '180.0%', '115.0%', '140.0%'], ['100.0%', '75.0%', '87.5%', '110.0%', '68.8%', '81.3%']],
    percent: [['+50.0%', '+25.0%', '+30.0%', '+80.0%', '+15.0%', '+40.0%'], ['0.0%', '-25.0%', '-12.5%', '+10.0%', '-31.3%', '-18.8%']],
  }
  for (const layout of ['combined', 'comparison'] as const) {
    for (const metric of ['difference', 'ratio', 'percent'] as const) {
      for (const rankMode of ['none', 'inline', 'merged'] as const) {
        const tsv = getSurtrUnequippedComparisonTsv(input, baseline, resistances, 1, metric, layout, blockingComparison, rankMode, 'blocking')
        const rows = tsv.split('\r\n').map(row => row.split('\t'))
        const leading = 1 + (rankMode === 'none' ? 0 : 1) + (layout === 'combined' ? 1 : 0)
        const headings = ['未ブロック MOD Y Lv.2', '未ブロック MOD X Lv.3', '未ブロック MOD X Lv.1',
          '対象を自身でブロック MOD Y Lv.2', '対象を自身でブロック MOD X Lv.3', '対象を自身でブロック MOD X Lv.1']
        const width = layout === 'combined' ? 2 : 1
        headings.forEach((heading, index) => assert.ok(rows[0][leading + index * width].startsWith(`${heading} `)))
        assert.deepEqual(rows.slice(1), resistances.map((value, row) => [String(value),
          ...(rankMode === 'none' ? [] : [row === 0 ? 'E' : 'A+']),
          ...(layout === 'combined' ? [row === 0 ? '100.0' : '80.0'] : []),
          ...expected[metric][row].flatMap((comparison, index) => layout === 'combined' ? [raw[row][index], comparison] : [comparison])]))
        assert.ok(rows.every(row => row.length === rows[0].length))
        const standard = getSurtrUnequippedComparisonTsv(input, baseline, resistances, 1, metric, layout, blockingComparison, rankMode)
        assert.equal(getSurtrUnequippedComparisonTsv(input, baseline, resistances, 1, metric, layout, blockingComparison, rankMode, 'module'), standard)
        assert.equal(getSurtrUnequippedComparisonTsv(input, baseline, resistances, 1, metric, layout, undefined, rankMode, 'blocking'),
          getSurtrUnequippedComparisonTsv(input, baseline, resistances, 1, metric, layout, undefined, rankMode))
      }
    }
  }
})

test('条件別コピーは欠けた条件を別条件や通常系列で補わない', () => {
  const baseline = series('none', [[60, 80]])
  const input = [series('x', [[60, 100]], 'MOD X Lv.3'), series('y', [[60, 150]], 'MOD Y Lv.3')]
  const blockingComparison = [{ blocking: true, series: [series('x', [[60, 96]])], baseline }]
  const tsv = getSurtrUnequippedComparisonTsv(input, baseline, [60], 1, 'ratio', 'combined', blockingComparison, 'merged', 'blocking')
  assert.deepEqual(tsv.split('\r\n')[1].split('\t'), ['60', 'A+', '80.0', '—', '—', '—', '—', '96.0', '120.0%', '—', '—'])
})

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

test('ブロック比較のB形式はMOD段階の表示順と未ブロック→自身ブロックの列順を保つ', () => {
  const baseline = series('none', [[0, 1000]], '未装備')
  const input = [
    series('none', [[0, 9999]]),
    series('y:lv2', [[0, 9999]], 'MOD Y Lv.2'),
    series('x:lv3', [[0, 9999]], 'MOD X Lv.3'),
    series('x:lv1', [[0, 9999]], 'MOD X Lv.1'),
  ]
  const conditions: readonly SurtrUnequippedBlockingComparison[] = [
    { blocking: true, baseline: series('none', [[0, 200]]), series: [
      series('x:lv1', [[0, 220]]), series('y:lv2', [[0, 300]]), series('x:lv3', [[0, 240]]),
      series('none', [[0, 9999]]), series('unselected', [[0, 9999]]),
    ] },
    { blocking: false, baseline: series('none', [[0, 100]]), series: [
      series('x:lv3', [[0, 150]]), series('x:lv1', [[0, 120]]), series('y:lv2', [[0, 80]]),
    ] },
  ]
  const before = structuredClone({ input, baseline, conditions })
  const output = getSurtrUnequippedComparisonTsv(input, baseline, [0], 1, 'difference', 'combined', conditions)
  assert.equal(output, [
    [
      '術耐性', '未装備 DPS',
      'MOD Y Lv.2 未ブロック DPS', 'MOD Y Lv.2 未ブロック 未装備とのDPS差',
      'MOD Y Lv.2 対象を自身でブロック DPS', 'MOD Y Lv.2 対象を自身でブロック 未装備とのDPS差',
      'MOD X Lv.3 未ブロック DPS', 'MOD X Lv.3 未ブロック 未装備とのDPS差',
      'MOD X Lv.3 対象を自身でブロック DPS', 'MOD X Lv.3 対象を自身でブロック 未装備とのDPS差',
      'MOD X Lv.1 未ブロック DPS', 'MOD X Lv.1 未ブロック 未装備とのDPS差',
      'MOD X Lv.1 対象を自身でブロック DPS', 'MOD X Lv.1 対象を自身でブロック 未装備とのDPS差',
    ].join('\t'),
    '0\t1000.0\t80.0\t-20.0\t300.0\t+100.0\t150.0\t+50.0\t240.0\t+40.0\t120.0\t+20.0\t220.0\t+20.0',
  ].join('\r\n'))
  assert.ok(output.split('\r\n').every(row => row.split('\t').length === 14))
  assert.deepEqual({ input, baseline, conditions }, before)
})

test('ブロック比較のC形式は各条件の未装備からDPS差・比率・増加率を計算する', () => {
  const input = [series('x:lv3', [[0, 9999]], 'MOD X Lv.3')]
  const conditions: readonly SurtrUnequippedBlockingComparison[] = [
    { blocking: true, baseline: series('none', [[0, 200]]), series: [series('x:lv3', [[0, 150]])] },
    { blocking: false, baseline: series('none', [[0, 100]]), series: [series('x:lv3', [[0, 125]])] },
  ]
  for (const [metric, label, values] of [
    ['difference', '未装備とのDPS差', '+25.00\t-50.00'],
    ['ratio', '未装備に対するDPS比（%）', '125.00%\t75.00%'],
    ['percent', '未装備からの増加率（%）', '+25.00%\t-25.00%'],
  ] as const) {
    assert.equal(getSurtrUnequippedComparisonTsv(input, null, [0], 2, metric, 'comparison', conditions), [
      `術耐性\tMOD X Lv.3 未ブロック ${label}\tMOD X Lv.3 対象を自身でブロック ${label}`,
      `0\t${values}`,
    ].join('\r\n'))
  }
})

test('ブロック比較はゼロ基準・欠損点・非有限DPSを—にし、条件ごとの利用可能な値を残す', () => {
  const input = [series('x', [[0, 9999]], 'MOD X')]
  const baseline = series('none', [[0, 90], [10, null], [20, 90], [30, 90]])
  const conditions: readonly SurtrUnequippedBlockingComparison[] = [
    { blocking: false, baseline: series('none', [[0, 0], [10, 10], [20, 10], [30, null]]), series: [
      series('x', [[0, 25], [10, Infinity], [20, 15], [30, 15]]),
    ] },
    { blocking: true, baseline: series('none', [[0, 20], [10, 20], [20, 20], [30, 20]]), series: [
      series('x', [[0, 40], [10, 30]]),
    ] },
  ]
  const difference = getSurtrUnequippedComparisonTsv(input, baseline, [30, 0, 10, 20], 0, 'difference', 'combined', conditions)
  assert.deepEqual(difference.split('\r\n').slice(1), [
    '30\t90\t15\t—\t—\t—',
    '0\t90\t25\t+25\t40\t+20',
    '10\t—\t—\t—\t30\t+10',
    '20\t90\t15\t+5\t—\t—',
  ])
  for (const [metric, values] of [
    ['ratio', ['30\t—\t—', '0\t—\t200%', '10\t—\t150%', '20\t150%\t—']],
    ['percent', ['30\t—\t—', '0\t—\t+100%', '10\t—\t+50%', '20\t+50%\t—']],
  ] as const) {
    const output = getSurtrUnequippedComparisonTsv(input, baseline, [30, 0, 10, 20], 0, metric, 'comparison', conditions)
    assert.deepEqual(output.split('\r\n').slice(1), values)
  }
})

test('条件やMOD段階が欠損していても別条件や通常系列から補わず、両条件の列を維持する', () => {
  const baseline = series('none', [[0, 100]])
  const input = [series('x:lv3', [[0, 150]], 'MOD X Lv.3'), series('x:lv1', [[0, 120]], 'MOD X Lv.1')]
  const partial: readonly SurtrUnequippedBlockingComparison[] = [
    { blocking: false, baseline, series: [input[0]] },
  ]
  const output = getSurtrUnequippedComparisonTsv(input, baseline, [0], 0, 'difference', 'comparison', partial)
  assert.equal(output.split('\r\n')[1], '0\t+50\t—\t—\t—')
  assert.equal(output.split('\r\n')[0].split('\t').length, 5)
  assert.equal(getSurtrUnequippedComparisonTsv(input, baseline, [0], 0, 'difference', 'combined', []).split('\r\n')[1],
    '0\t100\t—\t—\t—\t—\t—\t—\t—\t—')
  assert.equal(getSurtrUnequippedComparisonTsv(input, baseline, [0], 0, 'difference', 'comparison', undefined),
    getSurtrUnequippedComparisonTsv(input, baseline, [0], 0, 'difference', 'comparison'))
})

test('両条件の比較を生DPSから計算し、見出しの制御文字を既存ルールで処理する', () => {
  const input = [series('x', [[0, 9999]], ' MOD\tX\r\nLv.3 ')]
  const baseline = series('none', [[0, 1.004]])
  const conditions: readonly SurtrUnequippedBlockingComparison[] = [
    { blocking: false, baseline, series: [series('x', [[0, 1.006]])] },
    { blocking: true, baseline: series('none', [[0, 2.004]]), series: [series('x', [[0, 2.006]])] },
  ]
  const difference = getSurtrUnequippedComparisonTsv(input, baseline, [0], 2, 'difference', 'combined', conditions)
  assert.equal(difference, [
    '術耐性\t未装備 DPS\tMOD X Lv.3 未ブロック DPS\tMOD X Lv.3 未ブロック 未装備とのDPS差\tMOD X Lv.3 対象を自身でブロック DPS\tMOD X Lv.3 対象を自身でブロック 未装備とのDPS差',
    '0\t1.00\t1.01\t0.00\t2.01\t0.00',
  ].join('\r\n'))
  assert.equal(getSurtrUnequippedComparisonTsv(input, baseline, [0], 2, 'ratio', 'comparison', conditions).split('\r\n')[1],
    '0\t100.20%\t100.10%')
})

test('前段階IDは同じMODの一段階前とLv.1の未装備を特定し、不正な段階を受け付けない', () => {
  for (const id of ['x', 'y', 'mod-x']) {
    assert.equal(getSurtrPreviousStageId(`${id}:lv1`), 'none')
    assert.equal(getSurtrPreviousStageId(`${id}:lv2`), `${id}:lv1`)
    assert.equal(getSurtrPreviousStageId(`${id}:lv3`), `${id}:lv2`)
  }
  for (const id of ['', 'none', 'x', ':lv1', 'none:lv1', 'x:lv0', 'x:lv4', 'x:lv01', 'x:lv2.0',
    'x:LV2', 'x:lv2:lv3', 'x:lv3tail', 'x :lv2', ' x:lv2', 'x:lv2\n']) {
    assert.equal(getSurtrPreviousStageId(id), null, id)
  }
})

test('前段階基準はLv.1の独立した未装備と同MODの正確な段階を使い、他MODへ切り替えない', () => {
  const baseline = series('none', [[0, 100]], '未装備')
  const x1 = series('x:lv1', [[0, 125]], 'MOD X Lv.1')
  const x2 = series('x:lv2', [[0, 160]], 'MOD X Lv.2')
  const references = [series('none', [[0, 9999]]), series('y:lv2', [[0, 9999]]), x2, x1]
  assert.equal(getSurtrStageComparisonBaseline({ id: 'x:lv1' }, baseline, 'previous', references), baseline)
  assert.equal(getSurtrStageComparisonBaseline({ id: 'x:lv2' }, baseline, 'previous', references), x1)
  assert.equal(getSurtrStageComparisonBaseline({ id: 'x:lv3' }, baseline, 'previous', references), x2)
  assert.equal(getSurtrStageComparisonBaseline({ id: 'y:lv3' }, baseline, 'previous', references), references[1])
  assert.equal(getSurtrStageComparisonBaseline({ id: 'y:lv2' }, baseline, 'previous', references), null)
  assert.equal(getSurtrStageComparisonBaseline({ id: 'x:lv3' }, baseline, 'previous', [references[1]]), null)
  assert.equal(getSurtrStageComparisonBaseline({ id: 'x:lv1' }, null, 'previous', references), null)
  assert.equal(getSurtrStageComparisonBaseline({ id: 'x:lv3' }, null, 'previous', references), x2)
  assert.equal(getSurtrStageComparisonBaseline({ id: 'invalid' }, baseline, 'previous', references), null)
  assert.equal(getSurtrStageComparisonBaseline({ id: 'invalid' }, baseline), baseline)
})

test('前段階が非表示でも参照系列から差・比率・増加率を計算し、未装備モードの旧挙動を維持する', () => {
  const baseline = series('none', [[0, 100]], '未装備')
  const targets = [series('y:lv3', [[0, 135]], 'MOD Y Lv.3'), series('x:lv1', [[0, 125]], 'MOD X Lv.1'),
    { ...series('x:lv3', [[0, 200]], 'MOD X Lv.3'), lineStyle: 'dashed' as const }]
  const references = [series('x:lv2', [[0, 160]], 'MOD X Lv.2'), series('y:lv2', [[0, 90]], 'MOD Y Lv.2'),
    series('x:lv1', [[0, 9999]], 'MOD X Lv.1')]
  const before = structuredClone({ targets, baseline, references })
  const expected = { difference: [45, 25, 40], ratio: [150, 125, 125], percent: [50, 25, 25] }
  for (const metric of ['difference', 'ratio', 'percent'] as const) {
    const output = buildSurtrUnequippedComparisonSeries(targets, baseline, metric, 'previous', references)
    assert.deepEqual(output.map(item => item.id), ['y:lv3', 'x:lv1', 'x:lv3'])
    assert.deepEqual(output.map(item => item.points[0].value), expected[metric])
    assert.deepEqual(output.map(({ points: _, ...identity }) => identity), targets.map(({ points: _, ...identity }) => identity))
    assert.deepEqual(buildSurtrUnequippedComparisonSeries(targets, baseline, metric, 'unequipped', references),
      buildSurtrUnequippedComparisonSeries(targets, baseline, metric))
    output[0].points[0].value = 9999
  }
  assert.deepEqual({ targets, baseline, references }, before)
})

test('表示系列の前段階に依存せず、独立参照のゼロ・欠損・非有限値と丸め前の値を扱う', () => {
  const baseline = series('none', [[0, 9999], [10, 9999], [20, 9999], [30, 9999], [40, 9999], [50, 9999], [60, 9999]])
  const targets = [series('x:lv2', [[0, 1.006], [10, 20], [20, 20], [30, 20], [40, 20], [50, Infinity], [60, 1e-20]]),
    series('x:lv1', [[0, 9999]])]
  const references = [series('x:lv1', [[0, 1.004], [10, 0], [20, null], [30, NaN], [50, 10], [60, 100]])]
  const difference = buildSurtrUnequippedComparisonSeries(targets, baseline, 'difference', 'previous', references)[0]
  assert.deepEqual(difference.points.map(point => point.value), [1.006 - 1.004, 20, null, null, null, null, -100])
  assert.equal(formatSurtrUnequippedComparisonValue(difference.points[0].value, 'difference', 2), '0.00')
  const ratio = buildSurtrUnequippedComparisonSeries(targets, baseline, 'ratio', 'previous', references)[0]
  assert.deepEqual(ratio.points.map(point => point.value), [1.006 / 1.004 * 100, null, null, null, null, null, 1e-20])
  assert.ok(ratio.points[6].value! > 0)
  const percent = buildSurtrUnequippedComparisonSeries(targets, baseline, 'percent', 'previous', references)[0]
  assert.deepEqual(percent.points.map(point => point.value), [(1.006 / 1.004 - 1) * 100, null, null, null, null, null, -100])
  for (const metric of ['difference', 'ratio', 'percent'] as const) {
    assert.equal(buildSurtrUnequippedComparisonSeries([targets[0]], baseline, metric, 'previous')[0].points[0].value, null)
  }
})

test('前段階のTSVは両条件の独立参照で各指標を求め、B/Cと両列順の見出し・列数を保つ', () => {
  const baseline = series('none', [[0, 9999]], '未装備')
  const targets = [series('y:lv3', [[0, 9999]], 'MOD Y Lv.3'), series('x:lv1', [[0, 9999]], 'MOD X Lv.1')]
  const conditions: readonly SurtrUnequippedBlockingComparison[] = [
    { blocking: true, baseline: series('none', [[0, 200]], '未装備'), series: [
      series('x:lv1', [[0, 150]]), series('y:lv3', [[0, 240]]),
    ], referenceSeries: [series('y:lv2', [[0, 160]], 'MOD Y Lv.2')] },
    { blocking: false, baseline: series('none', [[0, 100]], '未装備'), series: [
      series('x:lv1', [[0, 125]]), series('y:lv3', [[0, 150]]),
    ], referenceSeries: [series('y:lv2', [[0, 120]], 'MOD Y Lv.2')] },
  ]
  const references = [series('y:lv2', [[0, 9999]], 'wrong global reference')]
  const labels = { difference: '前段階とのDPS差', ratio: '前段階に対するDPS比（%）', percent: '前段階からの増加率（%）' }
  const columns = [
    { module: 'MOD Y Lv.3', condition: '未ブロック', baseline: 'MOD Y Lv.2', raw: '150.0', difference: '+30.0', ratio: '125.0%', percent: '+25.0%' },
    { module: 'MOD Y Lv.3', condition: '対象を自身でブロック', baseline: 'MOD Y Lv.2', raw: '240.0', difference: '+80.0', ratio: '150.0%', percent: '+50.0%' },
    { module: 'MOD X Lv.1', condition: '未ブロック', baseline: '未装備', raw: '125.0', difference: '+25.0', ratio: '125.0%', percent: '+25.0%' },
    { module: 'MOD X Lv.1', condition: '対象を自身でブロック', baseline: '未装備', raw: '150.0', difference: '-50.0', ratio: '75.0%', percent: '-25.0%' },
  ]
  const before = structuredClone({ targets, baseline, conditions, references })
  for (const layout of ['combined', 'comparison'] as const) {
    for (const metric of ['difference', 'ratio', 'percent'] as const) {
      for (const order of ['module', 'blocking'] as const) {
        for (const rankMode of ['none', 'inline', 'merged'] as const) {
          const ordered = order === 'module' ? columns : [columns[0], columns[2], columns[1], columns[3]]
          const output = getSurtrUnequippedComparisonTsv(targets, baseline, [0, 100], 1, metric, layout,
            conditions, rankMode, order, 'previous', references)
          const rows = output.split('\r\n').map(row => row.split('\t'))
          assert.deepEqual(rows[0], ['術耐性', ...(rankMode === 'none' ? [] : ['術耐性ランク']), ...ordered.flatMap(column => {
            const heading = order === 'module' ? `${column.module} ${column.condition}` : `${column.condition} ${column.module}`
            return [...(layout === 'combined' ? [`${heading} DPS`] : []), `${heading} ${labels[metric]}（基準：${column.baseline}）`]
          })])
          assert.deepEqual(rows[1], ['0', ...(rankMode === 'none' ? [] : ['E']),
            ...ordered.flatMap(column => [...(layout === 'combined' ? [column.raw] : []), column[metric]])])
          assert.deepEqual(rows[2], ['100', ...(rankMode === 'none' ? [] : ['SS']),
            ...Array(ordered.length * (layout === 'combined' ? 2 : 1)).fill('—')])
          assert.ok(rows.every(row => row.length === 1 + (rankMode === 'none' ? 0 : 1) + 4 * (layout === 'combined' ? 2 : 1)))
          assert.ok(!rows[0].includes('未装備 DPS'))
        }
      }
    }
  }
  assert.deepEqual({ targets, baseline, conditions, references }, before)
})

test('条件の前段階参照が欠けても通常参照・他条件・表示中の前段階で補わない', () => {
  const baseline = series('none', [[0, 100]], '未装備')
  const targets = [series('x:lv2', [[0, 150]], 'MOD X Lv.2'), series('x:lv3', [[0, 200]], 'MOD X Lv.3')]
  const references = [series('x:lv1', [[0, 125]]), series('x:lv2', [[0, 150]])]
  const conditions: readonly SurtrUnequippedBlockingComparison[] = [
    { blocking: false, baseline, series: targets },
    { blocking: true, baseline, series: targets, referenceSeries: [series('x:lv2', [[0, 160]], 'MOD X Lv.2')] },
  ]
  for (const metric of ['difference', 'ratio', 'percent'] as const) {
    const tsv = getSurtrUnequippedComparisonTsv(targets, baseline, [0], 0, metric, 'comparison', conditions,
      'none', 'module', 'previous', references)
    const available = metric === 'difference' ? '+40' : metric === 'ratio' ? '125%' : '+25%'
    assert.deepEqual(tsv.split('\r\n')[1].split('\t'), ['0', '—', '—', '—', available])
    assert.match(tsv.split('\r\n')[0], /MOD X Lv\.2 未ブロック 前段階.*（基準：x:lv1）/)
  }
  const missing = getSurtrUnequippedComparisonTsv(targets, baseline, [0], 0, 'difference', 'combined', [],
    'none', 'blocking', 'previous', references).split('\r\n').map(row => row.split('\t'))
  assert.deepEqual(missing[1], ['0', ...Array(8).fill('—')])
  assert.equal(missing[0].length, 9)
})

test('通常の前段階TSVは非表示参照と基準名を使い、比較値を生DPSから求める', () => {
  const baseline = series('none', [[0, 1.004]], ' 未\t装備\r\n ')
  const targets = [series('x:lv1', [[0, 1.006]], 'MOD X Lv.1'), series('x:lv3', [[0, 2.006]], 'MOD X Lv.3')]
  const references = [series('x:lv2', [[0, 2.004]], ' MOD\tX\r\nLv.2 ')]
  const copied = getSurtrUnequippedComparisonTsv(targets, baseline, [0], 2, 'difference', 'combined', undefined,
    'none', 'module', 'previous', references)
  assert.equal(copied, [
    '術耐性\tMOD X Lv.1 DPS\tMOD X Lv.1 前段階とのDPS差（基準：未 装備）\tMOD X Lv.3 DPS\tMOD X Lv.3 前段階とのDPS差（基準：MOD X Lv.2）',
    '0\t1.01\t0.00\t2.01\t0.00',
  ].join('\r\n'))
  const comparison = getSurtrUnequippedComparisonTsv(targets, baseline, [0], 2, 'ratio', 'comparison', undefined,
    'inline', 'blocking', 'previous', references).split('\r\n').map(row => row.split('\t'))
  assert.deepEqual(comparison[1], ['0', 'E', '100.20%', '100.10%'])
  assert.equal(comparison[0].length, 4)
  assert.equal(getSurtrUnequippedComparisonTsv([], baseline, [], 0, 'difference', 'combined', undefined,
    'none', 'module', 'previous', references), '術耐性')
})
