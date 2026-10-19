import assert from 'node:assert/strict'
import test from 'node:test'
import type { SurtrDpsOutputSeries } from '../src/lib/surtrDpsOutput.ts'
import { buildSurtrRemnantComparisonColumns, buildSurtrRemnantWinnerData, getSurtrRemnantComparisonColorScaleMaximum,
  getSurtrRemnantComparisonTsv, getSurtrRemnantStateLabel, getSurtrRemnantWinnerColumnCondition,
  type SurtrRemnantComparisonState } from '../src/lib/surtrRemnantComparison.ts'
import { getModuleTableWinner } from '../src/lib/moduleTableWinner.ts'

const make = (stage: string, potential: number, values: readonly (number | null)[]): SurtrDpsOutputSeries => ({
  id: `${stage}:pot${potential}`, moduleStageId: stage, potential,
  label: `${stage === 'none' ? '未装備' : `MOD ${stage[0].toUpperCase()} Lv.${stage.at(-1)}`} 潜在${potential}`,
  color: stage.startsWith('x') ? '#3f7699' : '#b4763e',
  points: [0, 20, 100].map((x, index) => ({ x, value: values[index] ?? null })),
})
const baseline = make('none', 1, [100, 100, 10])
const x = make('x:lv3', 1, [116, 125, 15.1])
const y = make('y:lv3', 1, [108, 108, 10.8])
const yOn = make('y:lv3', 1, [140, 140, 14])
const stages = [
  { id: 'none', type: null, level: 0, label: '未装備', color: '#777' },
  { id: 'x:lv3', type: 'X', level: 3, label: 'MOD X Lv.3', color: '#3f7699' },
  { id: 'y:lv3', type: 'Y', level: 3, label: 'MOD Y Lv.3', color: '#b4763e' },
]
const states: SurtrRemnantComparisonState[] = [
  { remnantActive: false, series: [x, y], baseline, referenceSeries: [baseline] },
  { remnantActive: true, series: [x, yOn], baseline, referenceSeries: [baseline] },
]
const source = { series: [x, y], baseline, resistances: [0, 20, 100], precision: 0,
  metric: 'percent' as const, layout: 'comparison' as const, winnerStages: stages,
  remnantComparison: states, remnantLayout: 'common' as const }

test('common columns merge complete exact raw and comparison values, independent of MOD type', () => {
  const captured = structuredClone(source)
  const columns = buildSurtrRemnantComparisonColumns(source)
  assert.deepEqual(columns.map(column => [column.seriesId, column.remnantActive, column.common]), [
    [x.id, undefined, true], [y.id, false, false], [y.id, true, false],
  ])
  assert.equal(columns[0].raw?.get(20), 125)
  assert.ok(Math.abs(columns[1].comparison!.get(0)! - 8) < 1e-10)
  assert.equal(columns[2].raw?.get(0), 140)
  const sameY = buildSurtrRemnantComparisonColumns({ ...source, remnantComparison: states.map(state => ({ ...state, series: [x, y] })) })
  assert.ok(sameY.every(column => column.common), 'Y can be common too')
  assert.deepEqual(source, captured)
})

test('C columns retain adjacent off/on pairs even when raw values are identical', () => {
  const columns = buildSurtrRemnantComparisonColumns({ ...source, remnantLayout: 'columns' })
  assert.deepEqual(columns.map(column => [column.seriesId, column.remnantActive]), [
    [x.id, false], [x.id, true], [y.id, false], [y.id, true],
  ])
  assert.equal(new Set(columns.map(column => column.id)).size, 4)
})

test('rounded equality and matching percentages with different raw DPS never collapse', () => {
  const slightlyDifferentX = make('x:lv3', 1, [116.00000001, 125, 15.1])
  const data = { ...source, remnantComparison: [states[0], { ...states[1], series: [slightlyDifferentX, yOn] }] }
  assert.equal(buildSurtrRemnantComparisonColumns(data).filter(column => column.seriesId === x.id).length, 2)
  const scale = (item: SurtrDpsOutputSeries) => ({ ...item, points: item.points.map(point => ({ ...point, value: point.value! * 2 })) })
  const samePercent = { ...source, remnantComparison: [states[0], { ...states[1], series: [scale(x), scale(y)], baseline: scale(baseline), referenceSeries: [scale(baseline)] }] }
  assert.ok(buildSurtrRemnantComparisonColumns(samePercent).every(column => !column.common))
})

test('missing states, points, nonfinite values and references remain unavailable and cannot merge', () => {
  const missingState = buildSurtrRemnantComparisonColumns({ ...source, remnantComparison: [states[0]] })
  assert.equal(missingState.length, 4)
  assert.ok(missingState.filter(column => column.remnantActive).every(column => column.raw?.size === 0 && [...column.comparison!.values()].every(value => value === null)))
  for (const value of [null, Infinity, NaN]) {
    const badX = make('x:lv3', 1, [value, 125, 15.1])
    const columns = buildSurtrRemnantComparisonColumns({ ...source, remnantComparison: states.map(state => ({ ...state, series: [badX, y] })) })
    assert.equal(columns.filter(column => column.seriesId === x.id).length, 2)
  }
  const noX = { ...states[1], series: [yOn] }
  const columns = buildSurtrRemnantComparisonColumns({ ...source, remnantComparison: [states[0], noX] })
  assert.equal(columns.find(column => column.seriesId === x.id && column.remnantActive)?.raw?.get(0), undefined)
  const previous = buildSurtrRemnantComparisonColumns({ ...source, comparisonBase: 'previous', remnantComparison: states })
  assert.ok(previous.every(column => [...column.comparison!.values()].every(value => value === null)))
})

test('common detection examines exactly the visible resistances', () => {
  const valueAtHiddenRowDiffers = make('x:lv3', 1, [116, 125, 10000])
  const columns = buildSurtrRemnantComparisonColumns({ ...source, resistances: [0, 20],
    remnantComparison: [states[0], { ...states[1], series: [valueAtHiddenRowDiffers, yOn] }] })
  assert.ok(columns.find(column => column.seriesId === x.id)?.common)
  assert.ok(buildSurtrRemnantComparisonColumns({ ...source, resistances: [] }).every(column => !column.common))
})

const blockedState = (state: SurtrRemnantComparisonState): SurtrRemnantComparisonState => ({ ...state,
  blockingComparison: [true, false].map(blocking => ({ blocking, baseline: make('none', 1, blocking ? [200, 200, 20] : [100, 100, 10]),
    series: state.series.map(item => ({ ...item, points: item.points.map(point => ({ ...point, value: point.value! + (blocking ? 100 : 0) })) })),
    referenceSeries: [make('none', 1, blocking ? [200, 200, 20] : [100, 100, 10])],
  })) })

test('numeric ordering retains module/block conditions and baselines use the matching condition', () => {
  const data = { ...source, layout: 'combined' as const, remnantLayout: 'columns' as const, remnantComparison: states.map(blockedState) }
  const moduleOrder = buildSurtrRemnantComparisonColumns(data)
  assert.deepEqual(moduleOrder.map(column => [column.seriesId, column.blocking, column.remnantActive]), [
    [baseline.id, false, false], [baseline.id, false, true], [baseline.id, true, false], [baseline.id, true, true],
    [x.id, false, false], [x.id, false, true], [x.id, true, false], [x.id, true, true],
    [y.id, false, false], [y.id, false, true], [y.id, true, false], [y.id, true, true],
  ])
  const blocked = moduleOrder.find(column => column.isBaseline && column.blocking)
  assert.equal(blocked?.raw?.get(0), 200)
  const blockingOrder = buildSurtrRemnantComparisonColumns({ ...data, columnOrder: 'blocking' })
  assert.deepEqual(blockingOrder.map(column => column.blocking), [false, false, false, false, false, false, true, true, true, true, true, true])
  assert.ok(blockingOrder[0].isBaseline && blockingOrder[6].isBaseline)
  const missing = buildSurtrRemnantComparisonColumns({ ...data, remnantComparison: [blockedState(states[0]), { ...blockedState(states[1]), blockingComparison: [] }] })
  assert.ok(missing.filter(column => column.remnantActive).every(column => column.raw === undefined))
})

test('multiple potentials keep independent references and hidden fixed-potential/previous stages', () => {
  const six = make('x:lv3', 6, [150, 170, 20])
  const refs = [baseline, x, make('none', 6, [110, 120, 12]), make('x:lv2', 6, [125, 140, 15])]
  const data = { ...source, series: [six], remnantComparison: states.map(state => ({ ...state, series: [six], referenceSeries: refs })) }
  const percent = buildSurtrRemnantComparisonColumns({ ...data, comparisonBase: 'potential-1' })[0]
  assert.equal(percent.reference?.id, x.id)
  assert.equal(percent.raw?.get(0), 150)
  assert.ok(Math.abs(percent.comparison!.get(0)! - (150 / 116 - 1) * 100) < 1e-10)
  const previous = buildSurtrRemnantComparisonColumns({ ...data, comparisonBase: 'previous' })[0]
  assert.equal(previous.reference?.id, 'x:lv2:pot6')
  assert.ok(Math.abs(previous.comparison!.get(0)! - 20) < 1e-10)
  const baselineColumns = buildSurtrRemnantComparisonColumns({ ...data, layout: 'combined' }).filter(column => column.isBaseline)
  assert.equal(baselineColumns.length, 1)
  assert.equal(baselineColumns[0].item.potential, 6)
  assert.equal(baselineColumns[0].raw?.get(0), 110)
})

test('selected baseline values come from their actual remnant state even when not duplicated in references', () => {
  const noneSix = make('none', 6, [100, 100, 10])
  const noneSixOn = make('none', 6, [150, 150, 15])
  const target = make('x:lv3', 6, [200, 200, 20])
  const columns = buildSurtrRemnantComparisonColumns({ ...source, series: [noneSix, target], layout: 'combined',
    remnantComparison: [
      { remnantActive: false, series: [noneSix, target], baseline },
      { remnantActive: true, series: [noneSixOn, target], baseline },
    ] })
  const baselineColumns = columns.filter(column => column.isBaseline)
  assert.deepEqual(baselineColumns.map(column => column.raw?.get(0)), [100, 150])
  assert.ok(baselineColumns.every(column => !column.common))
})

test('one color maximum covers both states/visible rows and honors valid fixed-scale overrides', () => {
  assert.ok(Math.abs(getSurtrRemnantComparisonColorScaleMaximum(source) - 51) < 1e-10)
  assert.ok(Math.abs(getSurtrRemnantComparisonColorScaleMaximum({ ...source, resistances: [0] }) - 40) < 1e-10)
  assert.ok(Math.abs(getSurtrRemnantComparisonColorScaleMaximum({ ...source, metric: 'ratio' }) - 51) < 1e-10)
  assert.equal(getSurtrRemnantComparisonColorScaleMaximum({ ...source, metric: 'difference' }), 40)
  assert.equal(getSurtrRemnantComparisonColorScaleMaximum({ ...source, colorScaleMaximum: 1000 }), 1000)
  assert.equal(getSurtrRemnantComparisonColorScaleMaximum({ ...source, colorScaleMaximum: 0 }), 0)
  assert.ok(Math.abs(getSurtrRemnantComparisonColorScaleMaximum({ ...source, colorScaleMaximum: Infinity }) - 51) < 1e-10)
})

test('TSV preserves full module/state/rank headings and formatted values for both layouts and all metrics', () => {
  assert.deepEqual(getSurtrRemnantComparisonTsv({ ...source, rankMode: 'merged' }).split('\r\n').map(row => row.split('\t')), [
    ['術耐性', '術耐性ランク', 'MOD X Lv.3 潜在1 余燼なし・中 共通 未装備からの増加率（%）',
      'MOD Y Lv.3 潜在1 余燼なし 未装備からの増加率（%）', 'MOD Y Lv.3 潜在1 余燼中 未装備からの増加率（%）'],
    ['0', 'E', '+16%', '+8%', '+40%'], ['20', 'B', '+25%', '+8%', '+40%'], ['100', 'SS', '+51%', '+8%', '+40%'],
  ])
  const combined = getSurtrRemnantComparisonTsv({ ...source, layout: 'combined', metric: 'difference', precision: 1 }).split('\r\n').map(row => row.split('\t'))
  assert.deepEqual(combined[1], ['0', '100.0', '116.0', '+16.0', '108.0', '+8.0', '140.0', '+40.0'])
  assert.equal(combined[0][1], '未装備 潜在1 余燼なし・中 共通 DPS')
  const ratio = getSurtrRemnantComparisonTsv({ ...source, metric: 'ratio' }).split('\r\n')[1]
  assert.equal(ratio, '0\t116%\t108%\t140%')
  const previous = getSurtrRemnantComparisonTsv({ ...source, comparisonBase: 'previous' })
  assert.match(previous, /基準：前段階不明/)
  assert.match(previous, /0\t—\t—\t—\t—/)
})

test('winner columns retain same potential/block groups and derive winners from absolute raw values', () => {
  const data = buildSurtrRemnantWinnerData({ ...source, remnantComparison: states.map(blockedState), displayMode: 'winner' })
  assert.deepEqual(data.columnAxis.items.map(column => column.groupLabel), ['潜在1 未ブロック', '潜在1 未ブロック', '潜在1 対象を自身でブロック', '潜在1 対象を自身でブロック'])
  assert.deepEqual(data.columnAxis.items.map(column => getSurtrRemnantWinnerColumnCondition(column.id)), [
    { potential: 1, blocking: false, remnantActive: false }, { potential: 1, blocking: false, remnantActive: true },
    { potential: 1, blocking: true, remnantActive: false }, { potential: 1, blocking: true, remnantActive: true },
  ])
  const winners = data.cells.filter(cell => cell.rowId === '0').map(cell => getModuleTableWinner(cell.candidates)?.winners.map(winner => winner.label))
  assert.deepEqual(winners, [['MOD X Lv.3'], ['MOD Y Lv.3'], ['MOD X Lv.3'], ['MOD Y Lv.3']])
  assert.ok(data.cells.every(cell => cell.candidates.every(candidate => candidate.id !== baseline.id)))
})

test('same winner does not imply common data; every candidate must match before winner columns collapse', () => {
  const minorY = make('y:lv3', 1, [109, 109, 10.9])
  const data = buildSurtrRemnantWinnerData({ ...source, remnantComparison: [states[0], { ...states[1], series: [x, minorY] }] })
  assert.equal(data.columnAxis.items.length, 2)
  assert.ok(data.cells.filter(cell => cell.rowId === '0').every(cell => getModuleTableWinner(cell.candidates)?.winners[0].id === x.id))
  const common = buildSurtrRemnantWinnerData({ ...source, remnantComparison: states.map(state => ({ ...state, series: [x, y] })) })
  assert.equal(common.columnAxis.items.length, 1)
  assert.deepEqual(getSurtrRemnantWinnerColumnCondition(common.columnAxis.items[0].id), { potential: 1 })
  assert.equal(buildSurtrRemnantWinnerData({ ...source, remnantLayout: 'columns', remnantComparison: states.map(state => ({ ...state, series: [x, y] })) }).columnAxis.items.length, 2)
})

test('selected baseline can win, hidden reference cannot; missing candidate invalidates winner', () => {
  const enormous = make('none', 1, [10000, 10000, 10000])
  const hidden = buildSurtrRemnantWinnerData({ ...source, remnantComparison: states.map(state => ({ ...state, baseline: enormous, referenceSeries: [enormous] })) })
  assert.ok(hidden.cells.every(cell => cell.candidates.length === 2))
  const selected = buildSurtrRemnantWinnerData({ ...source, series: [enormous, x, y], remnantComparison: states.map(state => ({ ...state, series: [enormous, ...state.series] })) })
  assert.ok(selected.cells.every(cell => getModuleTableWinner(cell.candidates)?.winners[0].id === enormous.id))
  const missing = buildSurtrRemnantWinnerData({ ...source, remnantComparison: [states[0], { ...states[1], series: [x] }] })
  assert.ok(missing.cells.filter(cell => getSurtrRemnantWinnerColumnCondition(cell.columnId)?.remnantActive).every(cell => getModuleTableWinner(cell.candidates) === null))
})

test('winner clipboard includes complete names, separate state labels and ranks', () => {
  const table = getSurtrRemnantComparisonTsv({ ...source, displayMode: 'winner', rankMode: 'inline' }).split('\r\n').map(row => row.split('\t'))
  assert.deepEqual(table[0], ['術耐性', '術耐性ランク', '潜在1 余燼なし', '潜在1 余燼中'])
  assert.deepEqual(table[1], ['0', 'E', 'MOD X Lv.3', 'MOD Y Lv.3'])
  assert.equal(getSurtrRemnantWinnerColumnCondition('bad'), null)
  assert.deepEqual([getSurtrRemnantStateLabel(false), getSurtrRemnantStateLabel(true), getSurtrRemnantStateLabel(undefined)], ['余燼なし', '余燼中', '余燼なし・中 共通'])
})
