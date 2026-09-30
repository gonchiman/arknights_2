import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getSurtrDpsOutputTsv,
  transformSurtrDpsSeries,
  type SurtrDpsOutputSeries,
} from '../src/lib/surtrDpsOutput.ts'

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
