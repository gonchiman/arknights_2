import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSurtrComparisonWinnerData, getSurtrComparisonWinnerTsv, getSurtrWinnerColumnCondition,
  type SurtrComparisonWinnerSource, type SurtrWinnerStage } from '../src/lib/surtrComparisonWinner.ts'
import { getModuleTableWinner } from '../src/lib/moduleTableWinner.ts'

const stages: SurtrWinnerStage[] = [
  { id: 'none', type: null, level: 0, label: '未装備', color: '#737982' },
  { id: 'x:lv3', type: 'X', level: 3, label: 'MOD X Lv.3', color: '#3f7699' },
  { id: 'y:lv3', type: 'Y', level: 3, label: 'MOD Y Lv.3', color: '#b4763e' },
]
const series = (stage: string, potential: number, values: number[]) => ({ id: `${stage}:pot${potential}`,
  moduleStageId: stage, potential, label: `${stage} 潜在${potential}`, color: '#000',
  points: [0, 60, 100].map((x, index) => ({ x, value: values[index] })) })
const x1 = series('x:lv3', 1, [125, 80, 10]), y1 = series('y:lv3', 1, [150, 80, 5])
const x6 = series('x:lv3', 6, [200, 100, 20]), y6 = series('y:lv3', 6, [180, 110, 15])
const raw = [x1, y1, x6, y6]
const baseline = series('none', 1, [999, 999, 999])
const source: SurtrComparisonWinnerSource = { series: raw, resistances: [0, 60, 100], winnerStages: stages,
  blockingComparison: [true, false].map(blocking => ({ blocking, series: raw.map(item => blocking
    ? { ...item, points: item.points.map(point => ({ ...point, value: point.value + (item.id.startsWith('y:') ? 100 : 0) })) } : item).reverse(),
    baseline, referenceSeries: [baseline, series('x:lv2', 1, [10000, 10000, 10000])] })) }
const winner = (data: ReturnType<typeof buildSurtrComparisonWinnerData>, rowId: string, columnId: string) => {
  const candidates = data.cells.find(cell => cell.rowId === rowId && cell.columnId === columnId)?.candidates ?? []
  return getModuleTableWinner(candidates)
}

test('potentials remain independent groups and each blocking condition uses matching absolute DPS', () => {
  const captured = structuredClone(source)
  const data = buildSurtrComparisonWinnerData(source)
  assert.deepEqual(data.columnAxis.items.map(column => [column.id, column.groupLabel, column.label]), [
    ['pot1:unblocked', '潜在1', '未ブロック'], ['pot1:blocked', '潜在1', '対象を自身でブロック'],
    ['pot6:unblocked', '潜在6', '未ブロック'], ['pot6:blocked', '潜在6', '対象を自身でブロック'],
  ])
  assert.deepEqual(winner(data, '0', 'pot1:unblocked')?.winners.map(item => item.id), [y1.id])
  assert.deepEqual(winner(data, '0', 'pot6:unblocked')?.winners.map(item => item.id), [x6.id])
  assert.deepEqual(winner(data, '0', 'pot6:blocked')?.winners.map(item => item.id), [y6.id])
  assert.deepEqual(winner(data, '60', 'pot1:unblocked')?.winners.map(item => item.shortLabel), ['X3', 'Y3'])
  assert.equal(winner(data, '0', 'pot1:unblocked')?.increasePercent, 20)
  assert.deepEqual(source, captured)
})

test('hidden unequipped and previous-stage references never participate, and excluding a selected stage removes it', () => {
  const data = buildSurtrComparisonWinnerData(source)
  assert.ok(data.cells.every(cell => cell.candidates.length === 2 && cell.candidates.every(candidate => !candidate.id.startsWith('none:') && !candidate.id.startsWith('x:lv2'))))
  const xOnly = buildSurtrComparisonWinnerData({ ...source, winnerStages: stages.filter(stage => stage.type === 'X') })
  assert.equal(winner(xOnly, '0', 'pot1:unblocked')?.winners[0].id, x1.id)
  assert.equal(winner(xOnly, '0', 'pot1:unblocked')?.increasePercent, null)
})

test('missing condition or candidate is unavailable rather than a partial winning comparison', () => {
  const missing = { ...source, blockingComparison: source.blockingComparison!.map(group => group.blocking
    ? { ...group, series: group.series.filter(item => item.id !== y1.id) } : group) }
  const data = buildSurtrComparisonWinnerData(missing)
  assert.equal(winner(data, '0', 'pot1:blocked'), null)
  assert.equal(data.cells.find(cell => cell.rowId === '0' && cell.columnId === 'pot1:blocked')?.candidates.find(item => item.id === y1.id)?.value, null)
  assert.deepEqual(winner(data, '0', 'pot1:unblocked')?.winners.map(item => item.id), [y1.id])
})

test('selected unequipped can win and no selected candidate produces an empty table', () => {
  const none = { ...source, series: [baseline], blockingComparison: undefined }
  const data = buildSurtrComparisonWinnerData(none)
  assert.equal(winner(data, '0', 'pot1:current')?.winners[0].shortLabel, '未装備')
  assert.equal(winner(data, '0', 'pot1:current')?.winners[0].moduleType, null)
  assert.equal(buildSurtrComparisonWinnerData({ ...none, winnerStages: [] }).columnAxis.items.length, 0)
})

test('clipboard uses full winner names and potential/blocking headings with optional resistance ranks', () => {
  const tsv = getSurtrComparisonWinnerTsv(source, 'merged')
  const lines = tsv.split('\r\n').map(row => row.split('\t'))
  assert.deepEqual(lines[0], ['術耐性', '術耐性ランク', '潜在1 未ブロック', '潜在1 対象を自身でブロック', '潜在6 未ブロック', '潜在6 対象を自身でブロック'])
  assert.equal(lines[2][2], 'MOD X Lv.3＝MOD Y Lv.3')
  assert.ok(buildSurtrComparisonWinnerData(source).rowAxis.items.every(row => row.rank && row.rankTitle))
  assert.deepEqual(getSurtrWinnerColumnCondition('pot6:blocked'), { potential: 6, blocking: true })
  assert.equal(getSurtrWinnerColumnCondition('invalid'), null)
})
