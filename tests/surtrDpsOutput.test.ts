import assert from 'node:assert/strict'
import test from 'node:test'
import { getSurtrDpsResistanceRating, getSurtrDpsResistanceSamples, isValidSurtrDpsResistanceRange, normalizeSurtrDpsResistanceRange } from '../src/lib/surtrDpsResistance.ts'
import {
  getSurtrDpsOutputTsv,
  transformSurtrDpsSeries,
  type SurtrDpsOutputSeries,
} from '../src/lib/surtrDpsOutput.ts'

test('ゲーム内表記は各ランク内の代表値を1点ずつ使用する', () => {
  const samples = getSurtrDpsResistanceSamples('ratings')
  assert.deepEqual(samples, [0, 5, 15, 25, 40, 55, 65, 75, 85, 95])
  assert.deepEqual(samples.map(value => getSurtrDpsResistanceRating(value)?.rating), ['E', 'D', 'C', 'B', 'B+', 'A', 'A+', 'S', 'S+', 'SS'])
  samples[0] = 100
  assert.equal(getSurtrDpsResistanceSamples('ratings')[0], 0)
})

test('ゲーム内表記は共通の術耐性ランク境界に従う', () => {
  for (const [value, expected] of [[0, 'E'], [1, 'D'], [9, 'D'], [10, 'C'], [20, 'B'], [30, 'B+'], [50, 'A'], [60, 'A+'], [70, 'S'], [80, 'S+'], [90, 'S+'], [91, 'SS'], [100, 'SS']] as const) {
    assert.equal(getSurtrDpsResistanceRating(value)?.rating, expected)
  }
  assert.equal(getSurtrDpsResistanceRating(5)?.label, '0 超 10 未満')
  for (const value of [-1, 101, NaN, Infinity]) assert.equal(getSurtrDpsResistanceRating(value), null)
})

test('数値の刻みは従来の0〜100の比較点を維持する', () => {
  assert.deepEqual(getSurtrDpsResistanceSamples(20), [0, 20, 40, 60, 80, 100])
  assert.deepEqual(getSurtrDpsResistanceSamples(10), Array.from({ length: 11 }, (_, index) => index * 10))
  for (const value of [undefined, 0, -1, 101, 0.5, NaN]) assert.deepEqual(getSurtrDpsResistanceSamples(value), getSurtrDpsResistanceSamples(20))
})

test('任意の整数刻みでも開始値を起点にし、刻みに一致しない終了値は追加しない', () => {
  assert.deepEqual(getSurtrDpsResistanceSamples(7, { min: 15, max: 55 }), [15, 22, 29, 36, 43, 50])
  assert.deepEqual(getSurtrDpsResistanceSamples(1), Array.from({ length: 101 }, (_, index) => index))
  assert.deepEqual(getSurtrDpsResistanceSamples(100), [0, 100])
  assert.deepEqual(getSurtrDpsResistanceSamples(100, { min: 15, max: 55 }), [15])
})

test('表示範囲の検証は整数の0〜100、開始より大きい終了を要求する', () => {
  for (const range of [{ min: 0, max: 100 }, { min: 0, max: 50 }, { min: 99, max: 100 }]) {
    assert.ok(isValidSurtrDpsResistanceRange(range))
    assert.deepEqual(normalizeSurtrDpsResistanceRange(range), range)
    assert.notEqual(normalizeSurtrDpsResistanceRange(range), range)
  }
  for (const range of [{ min: -1, max: 50 }, { min: 50, max: 101 }, { min: 50, max: 50 }, { min: 51, max: 50 }, { min: 0.5, max: 50 }, { min: 0, max: NaN }, { min: 0, max: Infinity }]) {
    assert.equal(isValidSurtrDpsResistanceRange(range), false)
    assert.deepEqual(normalizeSurtrDpsResistanceRange(range), { min: 0, max: 100 })
  }
})

test('数値刻みは開始値を起点に終了値以下の点だけ生成する', () => {
  assert.deepEqual(getSurtrDpsResistanceSamples(10, { min: 0, max: 50 }), [0, 10, 20, 30, 40, 50])
  assert.deepEqual(getSurtrDpsResistanceSamples(10, { min: 15, max: 55 }), [15, 25, 35, 45, 55])
  assert.deepEqual(getSurtrDpsResistanceSamples(20, { min: 0, max: 50 }), [0, 20, 40])
  assert.deepEqual(getSurtrDpsResistanceSamples(10, { min: 99, max: 100 }), [99])
})

test('ランクの代表値を範囲で絞り、狭い範囲でも代表値を再計算しない', () => {
  assert.deepEqual(getSurtrDpsResistanceSamples('ratings', { min: 0, max: 50 }), [0, 5, 15, 25, 40])
  assert.deepEqual(getSurtrDpsResistanceSamples('ratings', { min: 10, max: 30 }), [15, 25])
  assert.deepEqual(getSurtrDpsResistanceSamples('ratings', { min: 1, max: 4 }), [])
})

function series(): SurtrDpsOutputSeries[] {
  return [
    { id: 'base', label: '未装備', color: '#888', points: [
      { x: 0, value: 100 }, { x: 20, value: 80 }, { x: 40, value: 0 }, { x: 60, value: null },
    ] },
    { id: 'x', label: 'MOD X Lv.3', color: '#f80', points: [
      { x: 20, value: 60 }, { x: 0, value: 125 }, { x: 40, value: 20 }, { x: 60, value: 30 }, { x: 80, value: 20 },
    ] },
    { id: 'y', label: 'MOD Y Lv.3', color: '#48f', points: [
      { x: 0, value: null }, { x: 20, value: 100 }, { x: 40, value: 0 }, { x: 60, value: 20 },
    ] },
  ]
}

test('差分は術耐性で対応させ、基準列・負値・ゼロ基準を保持する', () => {
  const output = transformSurtrDpsSeries(series(), 'difference', 'base')
  assert.deepEqual(output.map(item => item.id), ['base', 'x', 'y'])
  assert.deepEqual(output[0].points.map(point => point.value), [0, 0, 0, null])
  assert.deepEqual(output[1].points.map(point => point.value), [-20, 25, 20, null, null])
  assert.deepEqual(output[2].points.map(point => point.value), [null, 20, 0, null])
})

test('増減率は基準0%で算出し、負の増減率を残し、ゼロ・欠損基準はnull', () => {
  const output = transformSurtrDpsSeries(series(), 'percent', 'base')
  assert.deepEqual(output[0].points.map(point => point.value), [0, 0, null, null])
  assert.deepEqual(output[1].points.map(point => point.value), [-25, 25, null, null, null])
  assert.deepEqual(output[2].points.map(point => point.value), [null, 25, null, null])
  const alternate = transformSurtrDpsSeries(series(), 'percent', 'x')
  assert.equal(alternate[0].points[0].value, -19.999999999999996)
  assert.equal(alternate[2].points[2].value, -100)
})

test('totalは基準を無視し、全モードが入力と点オブジェクトを変更しない', () => {
  const input = series()
  const original = structuredClone(input)
  for (const metric of ['total', 'difference', 'percent'] as const) {
    const output = transformSurtrDpsSeries(input, metric, 'base')
    assert.notEqual(output, input)
    assert.notEqual(output[0], input[0])
    assert.notEqual(output[0].points, input[0].points)
    assert.notEqual(output[0].points[0], input[0].points[0])
    assert.equal(output[0].label, input[0].label)
    assert.equal(output[0].color, input[0].color)
    output[0].points[0].value = 9999
    assert.deepEqual(input, original)
  }
  assert.deepEqual(transformSurtrDpsSeries(input, 'total', 'absent'), original)
  assert.ok(transformSurtrDpsSeries(input, 'difference', 'absent').every(item => item.points.every(point => point.value === null)))
})

test('same-MOD stage ids and explicit line styles survive every metric, filtering and reordering', () => {
  const input: SurtrDpsOutputSeries[] = [
    { id: 'x:lv1', label: 'MOD X Lv.1', color: '#3f7699', lineStyle: 'dotted', points: [{ x: 20, value: 100 }] },
    { id: 'x:lv2', label: 'MOD X Lv.2', color: '#3f7699', lineStyle: 'dashed', points: [{ x: 20, value: 120 }] },
    { id: 'x:lv3', label: 'MOD X Lv.3', color: '#3f7699', lineStyle: 'solid', points: [{ x: 20, value: 150 }] },
  ]
  const before = structuredClone(input)
  for (const metric of ['total', 'difference', 'percent'] as const) {
    const output = transformSurtrDpsSeries(input, metric, 'x:lv2')
    assert.deepEqual(output.map(({ id, label, color, lineStyle }) => ({ id, label, color, lineStyle })),
      input.map(({ id, label, color, lineStyle }) => ({ id, label, color, lineStyle })))
    const filtered = output.filter(item => item.id !== 'x:lv2').reverse()
    assert.deepEqual(filtered.map(item => [item.id, item.lineStyle]), [['x:lv3', 'solid'], ['x:lv1', 'dotted']])
    assert.deepEqual(input, before)
  }
  assert.deepEqual(transformSurtrDpsSeries(input, 'difference', 'x:lv2').map(item => item.points[0].value), [-20, 0, 30])
  const copy = getSurtrDpsOutputTsv(transformSurtrDpsSeries(input, 'difference', 'x:lv2'), [20], 0, 'difference')
  assert.equal(copy, '術耐性\tMOD X Lv.1\tMOD X Lv.2\tMOD X Lv.3\r\n20\t-20\t0\t30')
})

test('NaN・Infinityと演算オーバーフローを数値として出力しない', () => {
  const input = series()
  input[0].points[0].value = NaN
  input[1].points[0].value = Infinity
  for (const metric of ['total', 'difference', 'percent'] as const) {
    const output = transformSurtrDpsSeries(input, metric, 'base')
    assert.equal(output[0].points[0].value, null)
    assert.equal(output[1].points[0].value, null)
  }
  input[0].points[0].value = Number.MIN_VALUE
  input[1].points[1].value = Number.MAX_VALUE
  assert.equal(transformSurtrDpsSeries(input, 'percent', 'base')[1].points[1].value, null)
})

test('TSVは実際の変換結果を指定の行順でコピーし、欠損を—で出す', () => {
  const output = transformSurtrDpsSeries(series(), 'percent', 'base')
  assert.equal(getSurtrDpsOutputTsv(output, [20, 0, 40, 100], 2, 'percent'), [
    '術耐性\t未装備\tMOD X Lv.3\tMOD Y Lv.3',
    '20\t0.00%\t-25.00%\t25.00%',
    '0\t0.00%\t25.00%\t—',
    '40\t—\t—\t—',
    '100\t—\t—\t—',
  ].join('\r\n'))
  assert.equal(getSurtrDpsOutputTsv(transformSurtrDpsSeries(series(), 'difference', 'base'), [0, 20], 0, 'difference'), [
    '術耐性\t未装備\tMOD X Lv.3\tMOD Y Lv.3',
    '0\t0\t25\t—',
    '20\t0\t-20\t20',
  ].join('\r\n'))
})

test('TSVは固定小数・桁区切りなし・通常数値で、ラベルのタブと改行を除去する', () => {
  const input: SurtrDpsOutputSeries[] = [{ id: 'x', label: ' MOD\tX\r\nLv.3 ', color: '#f80', points: [
    { x: 0, value: 1234.5 }, { x: 1, value: -0.0001 }, { x: 2, value: 1e22 }, { x: 3, value: NaN },
  ] }]
  const copy = getSurtrDpsOutputTsv(input, [0, 1, 2, 3], 3, 'total')
  assert.equal(copy, [
    '術耐性\tMOD X Lv.3', '0\t1234.500', '1\t0.000', '2\t10000000000000000000000.000', '3\t—',
  ].join('\r\n'))
  assert.ok(!copy.includes('='))
  assert.ok(!copy.includes('%'))
  for (const precision of [-1, 4, NaN]) {
    assert.equal(getSurtrDpsOutputTsv(input, [0], precision, 'total'), '術耐性\tMOD X Lv.3\r\n0\t1235')
  }
  assert.equal(getSurtrDpsOutputTsv([], [], 0, 'total'), '術耐性')
})

test('TSVの境界値の丸めが画面とグラフのtoFixed丸めに一致する', () => {
  const input: SurtrDpsOutputSeries[] = [{ id: 'x', label: 'MOD X Lv.3', color: '#f80', points: [
    { x: 0, value: 1.005 }, { x: 1, value: -1.005 }, { x: 2, value: -0.0001 }, { x: 3, value: 1.015 },
  ] }]
  const expectedRows = ['0\t1.00', '1\t-1.00', '2\t0.00', '3\t1.01']
  assert.equal(getSurtrDpsOutputTsv(input, [0, 1, 2, 3], 2, 'difference'), [
    '術耐性\tMOD X Lv.3', ...expectedRows,
  ].join('\r\n'))
  assert.equal(getSurtrDpsOutputTsv(input, [0, 1, 2, 3], 2, 'percent'), [
    '術耐性\tMOD X Lv.3', ...expectedRows.map(row => `${row}%`),
  ].join('\r\n'))
})
