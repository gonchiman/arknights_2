import test from 'node:test'
import assert from 'node:assert/strict'
import { buildGoldenglowPerformanceTable, buildGoldenglowPerformanceTableTsv } from '../src/lib/goldenglowPerformanceTable.ts'
import type { GoldenglowPerformanceComparisonColumn, GoldenglowPerformanceComparisonValue } from '../src/lib/goldenglowPerformanceComparison.ts'

test('総ダメージは術耐性無視と最低保証の境界を保ち、小数耐性を丸めず元の区間から求める', () => {
  const source = column('target', [row(100, 60), row(2.5, 1200), row(97.5, 60), row(0, 1200)])
  const before = structuredClone(source)
  const resistances = [100, 0, 1.25, 2.499, 2.5, 2.501, 37.5, 97.499, 97.5, 97.501, 99.125]
  const [result] = buildGoldenglowPerformanceTable([source], 'total', 'unused', resistances)
  assert.deepEqual(result.values.map((value) => value.resistance), resistances)
  for (const value of result.values) {
    const expected = 1200 * Math.max(0.05, 1 - Math.max(0, value.resistance - 2.5) / 100)
    assertRowClose(value, row(value.resistance, expected))
  }
  assert.equal(result.values[0].expectedTotalDamage, 60)
  assert.equal(result.values[1].expectedTotalDamage, 1200)
  assert.equal(result.build, source.build)
  assert.equal(result.skill, source.skill)
  assert.notEqual(result.values, source.values)
  assert.deepEqual(source, before)
})

test('総ダメージは範囲外や欠損を外挿・補間せず、成分ごとの欠損も維持する', () => {
  const partial = { ...row(40, null), expectedBodyDamage: 4, expectedDroneNormalDamage: Infinity }
  const source = column('target', [row(-10, 500), row(20, 80), partial, row(80, 20), row(110, 500), row(NaN, 500)])
  const resistances = [-1, 0, 20, 30, 40, 60, 80, 100, 101, NaN, Infinity]
  const [result] = buildGoldenglowPerformanceTable([source], 'total', '', resistances)
  assert.deepEqual(result.values.map((value) => value.expectedTotalDamage), [null, null, 80, null, null, null, 20, null, null, null, null])
  for (const index of [3, 4, 5]) {
    assert.equal(result.values[index].expectedDroneNormalDamage, null)
    assert.equal(result.values[index].expectedExplosionDamage, null)
    assert.ok(Number.isFinite(result.values[index].expectedBodyDamage))
  }
  const [single] = buildGoldenglowPerformanceTable([column('one', [row(37.5, 12)])], 'total', '', [37, 37.5, 38])
  assert.deepEqual(single.values.map((value) => value.expectedTotalDamage), [null, 12, null])
})

test('差分は異なる元曲線の境界をそれぞれ使い、指定耐性で整列してから基準を引く', () => {
  const columns = [column('target', [row(0, 1200), row(20, 1200), row(100, 240)]),
    column('base', [row(0, 1000), row(15, 1000), row(100, 150)])]
  const before = structuredClone(columns)
  const resistances = [15, 17.5, 20, 20.001, 37.5, 100]
  const result = buildGoldenglowPerformanceTable(columns, 'difference', 'base', resistances)
  assert.deepEqual(result.map((value) => value.build.id), ['target'])
  for (const value of result[0].values) {
    const expected = artsDamage(1200, value.resistance, 20) - artsDamage(1000, value.resistance, 15)
    assertRowClose(value, row(value.resistance, expected))
  }
  const reversed = buildGoldenglowPerformanceTable(columns, 'difference', 'target', resistances)
  assert.deepEqual(reversed.map((value) => value.build.id), ['base'])
  reversed[0].values.forEach((value, index) => assertRowClose(value, row(value.resistance, -result[0].values[index].expectedTotalDamage!)))
  assert.deepEqual(columns, before)
})

test('比率は比率の端点補間ではなく、指定小数耐性での元ダメージ同士の比から求める', () => {
  const columns = [column('base', [row(0, 100), row(100, 50)]), column('target', [row(0, 120), row(100, 120)])]
  for (const metric of ['ratio', 'growth'] as const) {
    const [result] = buildGoldenglowPerformanceTable(columns, metric, 'base', [37.5, 50])
    assert.equal(result.build.id, 'target')
    const ratio = 120 / 81.25 * 100
    close(result.values[0].expectedTotalDamage!, metric === 'ratio' ? ratio : ratio - 100)
    close(result.values[1].expectedTotalDamage!, metric === 'ratio' ? 160 : 60)
    assert.notEqual(result.values[1].expectedTotalDamage, metric === 'ratio' ? 180 : 80)
  }
})

test('負の増減と成分の相殺を保ち、欠損基準や基準0では比率を表示しない', () => {
  const columns = [column('base', [row(0, 0), row(10, null), row(20, 100, 20, 60, 20)]),
    column('target', [row(0, 40), row(10, 40), row(20, 80, 10, 65, 5)])]
  const difference = buildGoldenglowPerformanceTable(columns, 'difference', 'base', [0, 10, 20])[0]
  assert.equal(difference.values[0].expectedTotalDamage, 40)
  assert.deepEqual(difference.values[1], row(10, null))
  assert.deepEqual(difference.values[2], row(20, -20, -10, 5, -15))
  const growth = buildGoldenglowPerformanceTable(columns, 'growth', 'base', [0, 10, 20])[0]
  assert.deepEqual(growth.values[0], row(0, null))
  assert.deepEqual(growth.values[1], row(10, null))
  assertRowClose(growth.values[2], row(20, -20, -10, 5, -15))
  const ratio = buildGoldenglowPerformanceTable(columns, 'ratio', 'base', [0, 10, 20])[0]
  assert.deepEqual(ratio.values[0], row(0, null))
  assert.deepEqual(ratio.values[1], row(10, null))
  assert.deepEqual(ratio.values[2], row(20, 80, 10, 65, 5))
})

test('空の対象・行を安全に扱い、相対表示では基準列自身を含めない', () => {
  const columns = [column('base', [row(0, 100)])]
  for (const metric of ['total', 'difference', 'ratio', 'growth'] as const) {
    assert.deepEqual(buildGoldenglowPerformanceTable([], metric, '', [0]), [])
    const result = buildGoldenglowPerformanceTable(columns, metric, 'base', [])
    assert.deepEqual(result, metric === 'total' ? [{ ...columns[0], values: [] }] : [])
  }
})

test('TSVはグラフの0〜3桁で直接丸め、負値・丸め後の0・欠損と小数術耐性を維持する', () => {
  const columns = [{ label: 'MOD X', values: [row(37.5, 123.4567), row(40, -0.0001), row(60, null)] },
    { label: 'MOD Y', values: [row(60, Infinity), row(37.5, -12.3456)] }]
  const expected = [
    ['123', '-12'], ['=1235/10', '=-123/10'], ['=12346/100', '=-1235/100'], ['=123457/1000', '=-12346/1000'],
  ]
  for (const metric of ['total', 'difference'] as const) for (const digits of [0, 1, 2, 3]) {
    assert.equal(buildGoldenglowPerformanceTableTsv(columns, metric, digits), [
      '敵の術耐性\tMOD X\tMOD Y', `=375/10\t${expected[digits].join('\t')}`, '40\t0\t', '60\t\t',
    ].join('\r\n'))
  }
})

test('比率TSVは見出しに%を明記し、基準比・負の増減率を百分率の数値で貼り付けられる', () => {
  const columns = [{ label: 'MOD X［基準：未装備］', values: [row(0, 120), row(37.125, -20.256), row(100, null)] }]
  for (const metric of ['ratio', 'growth'] as const) {
    assert.equal(buildGoldenglowPerformanceTableTsv(columns, metric, 2), [
      '敵の術耐性\tMOD X［基準：未装備］（%）', '0\t=12000/100', '=37125/1000\t=-2026/100', '100\t',
    ].join('\r\n'))
    assert.equal(buildGoldenglowPerformanceTableTsv(columns, metric, 0), [
      '敵の術耐性\tMOD X［基準：未装備］（%）', '0\t120', '=37125/1000\t-20', '100\t',
    ].join('\r\n'))
  }
})

test('TSVの術耐性は表示値の丸め桁数に関係なく、入力の小数精度を維持する', () => {
  const resistances = [37.12345, 0.0001, 99.99999999, 0, -0, 100]
  const expected = ['=3712345/100000', '=1/10000', '=9999999999/100000000', '0', '0', '100']
  const columns = [{ label: 'MOD X', values: resistances.map((resistance) => row(resistance, 12.34567)) }]
  for (const metric of ['total', 'difference', 'ratio', 'growth'] as const) for (const digits of [0, 1, 2, 3]) {
    const rows = buildGoldenglowPerformanceTableTsv(columns, metric, digits).split('\r\n').slice(1)
    assert.deepEqual(rows.map((line) => line.split('\t')[0]), expected)
    const damage = ['12', '=123/10', '=1235/100', '=12346/1000'][digits]
    assert.ok(rows.every((line) => line.split('\t')[1] === damage))
  }
})

test('TSVの指数表記された微小耐性を整数比に展開し、極端な指数や非有限値も安全に扱う', () => {
  const resistances = [1e-7, 1.2345e-12, 1e-100, 1e-308, 1e-309, Number.MIN_VALUE, NaN, Infinity]
  const columns = [{ label: 'MOD X', values: resistances.map((resistance) => row(resistance, 10)) }]
  const cells = buildGoldenglowPerformanceTableTsv(columns, 'total', 0).split('\r\n').slice(1)
    .map((line) => line.split('\t')[0])
  assert.deepEqual(cells, [
    '=1/10000000', '=12345/10000000000000000', `=1/1${'0'.repeat(100)}`, `=1/1${'0'.repeat(308)}`,
    "'1e-309", "'5e-324", '', '',
  ])
  cells.slice(0, 4).forEach((cell, index) => {
    assert.match(cell, /^=\d+\/\d+$/)
    const [numerator, denominator] = cell.slice(1).split('/').map(Number)
    assert.ok(Number.isFinite(numerator) && Number.isFinite(denominator))
    assert.equal(numerator / denominator, resistances[index])
  })
  assert.equal(Number(cells[4].slice(1)), resistances[4])
  assert.equal(Number(cells[5].slice(1)), resistances[5])
})

test('TSV見出しの数式化とセル分割を防ぎ、数式には生成した整数の除算だけを使う', () => {
  const labels = ['=1+2\nMOD', '+SUM(A1)\tX', '-1', ' @test', '通常\r\nMOD']
  const columns = labels.map((label) => ({ label, values: [row(0, 0.125)] }))
  assert.equal(buildGoldenglowPerformanceTableTsv(columns, 'ratio', 3), [
    "敵の術耐性\t'=1+2 MOD（%）\t'+SUM(A1) X（%）\t'-1（%）\t' @test（%）\t通常 MOD（%）",
    '0\t=125/1000\t=125/1000\t=125/1000\t=125/1000\t=125/1000',
  ].join('\r\n'))
  assert.equal(buildGoldenglowPerformanceTableTsv([], 'total', 3), '')
})

function column(id: string, values: GoldenglowPerformanceComparisonValue[]): GoldenglowPerformanceComparisonColumn {
  return { build: { id, moduleId: '', moduleLevel: 3, potential: 1 }, skill: null, values }
}

function row(resistance: number, total: number | null, body = total === null ? null : total * 0.1,
  drone = total === null ? null : total * 0.6, explosion = total === null ? null : total * 0.3): GoldenglowPerformanceComparisonValue {
  return { resistance, expectedTotalDamage: total, expectedBodyDamage: body, expectedDroneNormalDamage: drone, expectedExplosionDamage: explosion }
}

function artsDamage(attack: number, resistance: number, ignore: number): number {
  return attack * Math.max(0.05, 1 - Math.max(0, resistance - ignore) / 100)
}

function assertRowClose(actual: GoldenglowPerformanceComparisonValue, expected: GoldenglowPerformanceComparisonValue): void {
  assert.equal(actual.resistance, expected.resistance)
  for (const key of ['expectedTotalDamage', 'expectedBodyDamage', 'expectedDroneNormalDamage', 'expectedExplosionDamage'] as const) {
    if (expected[key] === null) assert.equal(actual[key], null)
    else close(actual[key]!, expected[key])
  }
}

function close(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`)
}
