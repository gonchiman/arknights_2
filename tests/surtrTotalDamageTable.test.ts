import assert from 'node:assert/strict'
import test from 'node:test'
import { classifySkill } from '../src/lib/classifier.ts'
import type { SurtrDpsSettings } from '../src/lib/surtrDps.ts'
import {
  calculateSurtrTotalDamage,
  deriveSurtrTotalDamageModel,
  SURTR_TOTAL_DAMAGE_DEFAULT_ASSUMPTIONS,
  type SurtrTotalDamageAssumptions,
} from '../src/lib/surtrTotalDamage.ts'
import {
  buildSurtrTotalDamageTable,
  buildSurtrTotalDamageTableTsv,
  formatSurtrTotalDamageTableValue,
  formatSurtrTotalDamageWinnerLabel,
  formatSurtrTotalDamageWinnerShortLabel,
  getSurtrTotalDamageSeriesShortLabel,
  getSurtrTotalDamageTablePoint,
  getSurtrTotalDamageTableWinnerGap,
  getSurtrTotalDamageTableWinners,
  SURTR_TOTAL_DAMAGE_TABLE_MAXIMUM_CELLS,
  SURTR_TOTAL_DAMAGE_WINNER_GAP_MAX_PERCENT,
  type SurtrTotalDamageTableComparison,
} from '../src/lib/surtrTotalDamageTable.ts'
import type { RawOperatorModule, SkillRecord } from '../src/types/skill.ts'

const settings: SurtrDpsSettings = { level: 90, trust: 100, potential: 1, skillLevelIndex: 9, blocking: false }
const xId = 'uniequip_002_surtr'
const yId = 'uniequip_003_surtr'

function comparisons(changes: Partial<SurtrDpsSettings> = {}): SurtrTotalDamageTableComparison[] {
  return ['', xId, yId].flatMap(moduleId => (moduleId ? [1, 2, 3] : [0]).map(moduleLevel => {
    const model = deriveSurtrTotalDamageModel(createRecord(), { ...settings, ...changes }, moduleId, moduleLevel)
    assert.ok(model)
    const id = moduleId ? `${moduleId}:lv${moduleLevel}` : 'none'
    return { id, label: moduleId ? `${moduleId === xId ? 'X' : 'Y'} Lv.${moduleLevel}` : '未装備', color: '#737982', model }
  }))
}

test('全段階・潜在・ブロック・時刻・術耐性の各セルは単点エンジンと完全一致する', () => {
  const times = [0, 0.6, 10.7, 25]
  const resistances = [0, 20, 40, 60, 80, 100]
  for (const potential of [1, 3, 5]) {
    for (const blocking of [false, true]) {
      const series = comparisons({ potential, blocking })
      for (const ctCarry of ['time', 'ratio'] as const) {
        const assumptions = { ...SURTR_TOTAL_DAMAGE_DEFAULT_ASSUMPTIONS, ctCarry }
        const matrix = buildSurtrTotalDamageTable(series, times, resistances, assumptions)!
        assert.ok(matrix)
        assert.equal(matrix.points.length, times.length * resistances.length * series.length)
        times.forEach((time, timeIndex) => resistances.forEach((resistance, resistanceIndex) => series.forEach((item, seriesIndex) => {
          const result = calculateSurtrTotalDamage(item.model, time, resistance, assumptions, { includeAttacks: false })!
          const { attacks: _attacks, ...expected } = result
          assert.deepEqual(getSurtrTotalDamageTablePoint(matrix, timeIndex, resistanceIndex, seriesIndex),
            { ...expected, time, resistance, seriesId: item.id })
        })))
        assert.equal(matrix.maximumTotalDamage, Math.max(...matrix.points.map(point => point.totalDamage)))
      }
    }
  }
})

test('素質2をまたぐ進行中の攻撃と退場同時の命中境界を術耐性全列で維持する', () => {
  const series = comparisons().slice(0, 1)
  const carried = buildSurtrTotalDamageTable(series, [10.7], [0, 60, 100])!
  assert.ok(carried.points.every(point => point.hitsBefore === 8 && point.hitsRemnant === 7 && point.totalHits === 15))
  const source = series[0].model
  const model = { before: { ...source.before, attackInterval: 1 }, after: { ...source.after, attackInterval: 1 },
    timing: { ...source.timing, attackIntervalBefore: 1, attackIntervalAfter: 1, remnantDuration: 2 } }
  const boundarySeries = [{ ...series[0], model }]
  const assumptions = { ...SURTR_TOTAL_DAMAGE_DEFAULT_ASSUMPTIONS, firstAttackStart: 0, hitDelay: 1 }
  const excluded = buildSurtrTotalDamageTable(boundarySeries, [0], [0, 60, 100], assumptions)!
  const included = buildSurtrTotalDamageTable(boundarySeries, [0], [0, 60, 100], { ...assumptions, includeRetreatHit: true })!
  assert.ok(excluded.points.every(point => point.totalHits === 1))
  assert.ok(included.points.every(point => point.totalHits === 2))
  assert.ok(included.points.every(point => point.totalDamage === 2 * point.perHitRemnant))
})

test('攻撃開始が退場より後なら全セル0で最大値も0になり、入力配列を変更しない', () => {
  const series = comparisons().slice(0, 1)
  const times = [0]
  const resistances = [0, 100]
  const originalSeries = structuredClone(series)
  const assumptions = { ...SURTR_TOTAL_DAMAGE_DEFAULT_ASSUMPTIONS, firstAttackStart: 20 }
  const result = buildSurtrTotalDamageTable(series, times, resistances, assumptions)!
  assert.equal(result.maximumTotalDamage, 0)
  assert.ok(result.points.every(point => point.totalHits === 0 && point.totalDamage === 0 && point.lastHitTime === null))
  result.times.push(1)
  result.resistances.push(101)
  result.series[0].label = 'changed'
  assert.deepEqual(times, [0])
  assert.deepEqual(resistances, [0, 100])
  assert.deepEqual(series, originalSeries)
})

test('順序不正・重複・非有限値・範囲外・サンプル数・セル数上限は無言で切り詰めず未計算にする', () => {
  const series = comparisons()
  for (const times of [[], [1, 0], [0, 0], [-1], [NaN], [Infinity], [3600.1], Array.from({ length: 202 }, (_, index) => index)]) {
    assert.equal(buildSurtrTotalDamageTable(series, times, [0]), null)
  }
  for (const resistances of [[], [20, 0], [0, 0], [-1], [101], [0.5], [NaN], [Infinity]]) {
    assert.equal(buildSurtrTotalDamageTable(series, [25], resistances), null)
  }
  assert.equal(buildSurtrTotalDamageTable([], [25], [0]), null)
  assert.equal(buildSurtrTotalDamageTable([series[0], series[0]], [25], [0]), null)
  assert.equal(buildSurtrTotalDamageTable([{ ...series[0], id: ' ' }], [25], [0]), null)
  assert.equal(buildSurtrTotalDamageTable(series, [25], [0], { ...SURTR_TOTAL_DAMAGE_DEFAULT_ASSUMPTIONS, hitDelay: -1 }), null)
  assert.equal(buildSurtrTotalDamageTable([{ ...series[0], model: { ...series[0].model,
    timing: { ...series[0].model.timing, moduleId: 'different' } } }], [25], [0]), null)
  const times = Array.from({ length: 201 }, (_, index) => index)
  const resistances = Array.from({ length: 101 }, (_, index) => index)
  assert.ok(times.length * resistances.length * 3 > SURTR_TOTAL_DAMAGE_TABLE_MAXIMUM_CELLS)
  assert.equal(buildSurtrTotalDamageTable(series.slice(0, 3), times, resistances), null)
  const maximumSamples = buildSurtrTotalDamageTable(series.slice(0, 1), times, [0])!
  assert.equal(maximumSamples.times.length, 201)
  for (const indices of [[-1, 0, 0], [0, -1, 0], [0, 0, -1], [201, 0, 0], [0, 1, 0], [0, 0, 1], [0.5, 0, 0]]) {
    assert.equal(getSurtrTotalDamageTablePoint(maximumSamples, indices[0], indices[1], indices[2]), null)
  }
})

test('TSVの3配置は同じ未丸めの数値を対応する順序で出力し、表示用精度だけを変える', () => {
  const selected = [comparisons()[6], comparisons()[0]]
  const result = buildSurtrTotalDamageTable(selected, [10.7, 25], [0, 60])!
  const before = structuredClone(result)
  const v = (time: number, resistance: number, series: number) =>
    getSurtrTotalDamageTablePoint(result, time, resistance, series)!.totalDamage.toFixed(2)
  const timeRows = buildSurtrTotalDamageTableTsv(result, 'time', 2).split('\r\n').map(row => row.split('\t'))
  assert.deepEqual(timeRows[0], ['素質2発動まで（秒）', 'MOD', '術耐性0', '術耐性60'])
  assert.deepEqual(timeRows[1], ['10.7', 'Y Lv.3', v(0, 0, 0), v(0, 1, 0)])
  assert.deepEqual(timeRows[2], ['10.7', '未装備', v(0, 0, 1), v(0, 1, 1)])
  const moduleRows = buildSurtrTotalDamageTableTsv(result, 'module', 2).split('\r\n').map(row => row.split('\t'))
  assert.deepEqual(moduleRows[0], ['MOD', '素質2発動まで（秒）', '術耐性0', '術耐性60'])
  assert.deepEqual(moduleRows[1], ['Y Lv.3', '10.7', v(0, 0, 0), v(0, 1, 0)])
  assert.deepEqual(moduleRows[2], ['Y Lv.3', '25', v(1, 0, 0), v(1, 1, 0)])
  const resistanceRows = buildSurtrTotalDamageTableTsv(result, 'resistance', 2).split('\r\n').map(row => row.split('\t'))
  assert.deepEqual(resistanceRows[0], ['術耐性', '10.7秒 Y Lv.3', '10.7秒 未装備', '25秒 Y Lv.3', '25秒 未装備'])
  assert.deepEqual(resistanceRows[1], ['0', v(0, 0, 0), v(0, 0, 1), v(1, 0, 0), v(1, 0, 1)])
  assert.deepEqual(resistanceRows[2], ['60', v(0, 1, 0), v(0, 1, 1), v(1, 1, 0), v(1, 1, 1)])
  assert.deepEqual(result, before)
})

test('TSVラベルは改行とタブを除き、表計算数式として評価されないようにする', () => {
  const item = { ...comparisons()[0], label: '=1\t+2\n' }
  const result = buildSurtrTotalDamageTable([item], [25], [0])!
  assert.ok(buildSurtrTotalDamageTableTsv(result, 'time').includes("\t'=1 +2\t"))
  assert.equal(formatSurtrTotalDamageTableValue(null, 1), '—')
  assert.equal(formatSurtrTotalDamageTableValue(Infinity, 1), '—')
  assert.equal(formatSurtrTotalDamageTableValue(1234.56, 1), '1,234.6')
  assert.equal(formatSurtrTotalDamageTableValue(1234.56, 1, false), '1234.6')
  assert.equal(formatSurtrTotalDamageTableValue(-0, 1), '0.0')
  assert.equal(formatSurtrTotalDamageTableValue(1.5, 5), '2')
})

test('未ブロック・術耐性20以下では30秒と40秒のX3とY3が実際の総ダメージで同率最大になる', () => {
  const all = comparisons()
  const table = buildSurtrTotalDamageTable([all[0], all[3], all[6]], [30, 40], [0, 20, 21])!
  for (let timeIndex = 0; timeIndex < 2; timeIndex += 1) {
    for (let resistanceIndex = 0; resistanceIndex < 2; resistanceIndex += 1) {
      const winners = getSurtrTotalDamageTableWinners(table, timeIndex, resistanceIndex)
      assert.deepEqual(winners.map(winner => winner.series.id), [all[3].id, all[6].id])
      assert.deepEqual(winners.map(winner => winner.seriesIndex), [1, 2])
      assert.ok(winners.every(winner => winner.point.totalDamage === [118041, 146657][timeIndex]))
      assert.ok(winners.every(winner => winner.point.totalHits === [33, 41][timeIndex]))
    }
    assert.deepEqual(getSurtrTotalDamageTableWinners(table, timeIndex, 2).map(winner => winner.series.id), [all[3].id])
  }
})

test('表示上同じ値でも未丸めの大小で最大MODを決め、浮動小数点の演算誤差だけを同値にする', () => {
  const all = comparisons()
  const table = buildSurtrTotalDamageTable([all[3], all[6]], [30], [0])!
  table.points[0].totalDamage = 1000.001
  table.points[1].totalDamage = 1000.002
  assert.equal(formatSurtrTotalDamageTableValue(table.points[0].totalDamage, 0),
    formatSurtrTotalDamageTableValue(table.points[1].totalDamage, 0))
  assert.deepEqual(getSurtrTotalDamageTableWinners(table, 0, 0).map(winner => winner.series.id), [all[6].id])

  table.points[0].totalDamage = 0.1 + 0.2
  table.points[1].totalDamage = 0.3
  assert.equal(getSurtrTotalDamageTableWinners(table, 0, 0).length, 2)

  table.points[0].totalDamage = 118041
  table.points[1].totalDamage = 118041 + 1e-8
  assert.deepEqual(getSurtrTotalDamageTableWinners(table, 0, 0).map(winner => winner.series.id), [all[6].id])
})

test('同じMODの段階を区別し、同値の段階と未装備も省略せず選択順に表記する', () => {
  const all = comparisons()
  const table = buildSurtrTotalDamageTable([all[3], all[2], all[0]], [0], [0],
    { ...SURTR_TOTAL_DAMAGE_DEFAULT_ASSUMPTIONS, firstAttackStart: 20 })!
  const before = structuredClone(table)
  const winners = getSurtrTotalDamageTableWinners(table, 0, 0)
  assert.deepEqual(winners.map(winner => winner.seriesIndex), [0, 1, 2])
  assert.ok(winners.every(winner => winner.point.totalDamage === 0))
  assert.equal(formatSurtrTotalDamageWinnerLabel(winners.map(winner => winner.series)), 'X Lv.3＝X Lv.2＝未装備')
  assert.deepEqual(table, before)
  const onlyUnequipped = buildSurtrTotalDamageTable([all[0]], [30], [0])!
  assert.equal(formatSurtrTotalDamageWinnerLabel(getSurtrTotalDamageTableWinners(onlyUnequipped, 0, 0)
    .map(winner => winner.series)), '未装備')
  assert.equal(formatSurtrTotalDamageWinnerLabel([]), '—')
  assert.deepEqual(getSurtrTotalDamageTableWinners({ ...table, series: [], points: [] }, 0, 0), [])
})

test('一部系列の値が欠落・不正なら有効な系列だけで最大MODを確定しない', () => {
  const all = comparisons()
  const table = buildSurtrTotalDamageTable([all[3], all[6]], [30], [0])!
  for (const invalid of [NaN, Infinity, -Infinity, -1]) {
    const invalidTable = structuredClone(table)
    invalidTable.points[1].totalDamage = invalid
    assert.deepEqual(getSurtrTotalDamageTableWinners(invalidTable, 0, 0), [])
  }
  const missing = structuredClone(table)
  missing.points.pop()
  assert.deepEqual(getSurtrTotalDamageTableWinners(missing, 0, 0), [])
  for (const changes of [{ seriesId: 'different' }, { time: 40 }, { resistance: 20 }]) {
    const invalidTable = structuredClone(table)
    Object.assign(invalidTable.points[1], changes)
    assert.deepEqual(getSurtrTotalDamageTableWinners(invalidTable, 0, 0), [])
  }
  for (const [timeIndex, resistanceIndex] of [[-1, 0], [1, 0], [0.5, 0], [0, -1], [0, 1], [0, NaN]]) {
    assert.deepEqual(getSurtrTotalDamageTableWinners(table, timeIndex, resistanceIndex), [])
  }
})

test('最大MODのTSVは時刻と術耐性を転置でき、MOD外側配置は術耐性行に置き換える', () => {
  const all = comparisons()
  const table = buildSurtrTotalDamageTable([all[0], all[3], all[6]], [10, 30], [0, 100])!
  const before = structuredClone(table)
  const resistanceRows = buildSurtrTotalDamageTableTsv(table, 'resistance', 0, 'winner').split('\r\n').map(row => row.split('\t'))
  assert.deepEqual(resistanceRows, [
    ['術耐性', '10秒', '30秒'],
    ['0', 'Y Lv.3', 'X Lv.3＝Y Lv.3'],
    ['100', 'X Lv.3', 'X Lv.3'],
  ])
  const timeRows = buildSurtrTotalDamageTableTsv(table, 'time', 3, 'winner').split('\r\n').map(row => row.split('\t'))
  assert.deepEqual(timeRows, [
    ['素質2発動まで（秒）', '術耐性0', '術耐性100'],
    ['10', 'Y Lv.3', 'X Lv.3'],
    ['30', 'X Lv.3＝Y Lv.3', 'X Lv.3'],
  ])
  assert.equal(buildSurtrTotalDamageTableTsv(table, 'module', 3, 'winner'),
    buildSurtrTotalDamageTableTsv(table, 'resistance', 0, 'winner'))
  for (const layout of ['time', 'module', 'resistance'] as const) {
    assert.equal(buildSurtrTotalDamageTableTsv(table, layout, 2),
      buildSurtrTotalDamageTableTsv(table, layout, 2, 'total'))
  }
  assert.deepEqual(table, before)
})

test('最大MODのTSVもラベルの改行・タブ・数式を処理し、不完全セルは横棒で出力する', () => {
  const source = comparisons()[0]
  const table = buildSurtrTotalDamageTable([{ ...source, label: '=1\t+2\n' }], [30], [0])!
  assert.equal(buildSurtrTotalDamageTableTsv(table, 'resistance', 0, 'winner'), "術耐性\t30秒\r\n0\t'=1 +2")
  table.points = []
  assert.equal(buildSurtrTotalDamageTableTsv(table, 'resistance', 0, 'winner'), '術耐性\t30秒\r\n0\t—')
})

test('MOD種別と段階の明示データを行列に保持し、X1〜Y3をラベル文字列に依存せず短縮する', () => {
  const items = comparisons().map((item, index): SurtrTotalDamageTableComparison => ({ ...item,
    type: index === 0 ? null : index <= 3 ? 'X' : 'Y', level: index === 0 ? 0 : (index - 1) % 3 + 1,
  }))
  const table = buildSurtrTotalDamageTable(items, [30], [0])!
  assert.deepEqual(table.series, items.map(({ model: _model, ...item }) => item))
  assert.deepEqual(table.series.map(getSurtrTotalDamageSeriesShortLabel), ['未装備', 'X1', 'X2', 'X3', 'Y1', 'Y2', 'Y3'])
  assert.equal(getSurtrTotalDamageSeriesShortLabel({ ...table.series[3], label: '別名Y Lv.1' }), 'X3')
  assert.equal(getSurtrTotalDamageSeriesShortLabel({ id: 'none', label: 'モジュールなし' }), '未装備')
  assert.equal(getSurtrTotalDamageSeriesShortLabel({ id: 'unequipped', label: 'MOD未装備', type: null }), '未装備')
  const noMetadata = buildSurtrTotalDamageTable(comparisons().slice(1, 2), [30], [0])!
  assert.deepEqual(noMetadata.series[0], { id: `${xId}:lv1`, label: 'X Lv.1', color: '#737982' })
})

test('種別・段階が不明な系列名は推測で短縮したり未装備にしたりしない', () => {
  const unknown = { id: 'custom', label: 'MOD X Lv.3（追加条件）' }
  assert.equal(getSurtrTotalDamageSeriesShortLabel(unknown), unknown.label)
  assert.equal(getSurtrTotalDamageSeriesShortLabel({ ...unknown, type: 'X' }), unknown.label)
  assert.equal(getSurtrTotalDamageSeriesShortLabel({ ...unknown, level: 3 }), unknown.label)
  for (const level of [0, -1, 1.5, 4, NaN, Infinity]) {
    assert.equal(getSurtrTotalDamageSeriesShortLabel({ ...unknown, type: 'X', level }), unknown.label)
  }
  assert.equal(getSurtrTotalDamageSeriesShortLabel({ ...unknown, type: 'Z' as 'X', level: 3 }), unknown.label)
  assert.equal(getSurtrTotalDamageSeriesShortLabel({ id: 'unknown-1', label: '独自名1' }), '独自名1')
  assert.equal(getSurtrTotalDamageSeriesShortLabel({ id: 'unknown-2', label: '独自名2' }), '独自名2')
  assert.equal(formatSurtrTotalDamageWinnerShortLabel([]), '—')
})

test('最大MODを短縮表示しても同値と段階を保ち、正式ラベルとTSVは変更しない', () => {
  const all = comparisons()
  const items: SurtrTotalDamageTableComparison[] = [
    { ...all[3], type: 'X', level: 3 }, { ...all[6], type: 'Y', level: 3 },
  ]
  const table = buildSurtrTotalDamageTable(items, [30], [0])!
  const winners = getSurtrTotalDamageTableWinners(table, 0, 0).map(winner => winner.series)
  assert.equal(formatSurtrTotalDamageWinnerShortLabel(winners), 'X3＝Y3')
  assert.equal(formatSurtrTotalDamageWinnerLabel(winners), 'X Lv.3＝Y Lv.3')
  assert.equal(buildSurtrTotalDamageTableTsv(table, 'resistance', 0, 'winner'), '術耐性\t30秒\r\n0\tX Lv.3＝Y Lv.3')
  const stageTie = buildSurtrTotalDamageTable([{ ...all[2], type: 'X', level: 2 }, { ...all[3], type: 'X', level: 3 }], [0], [0],
    { ...SURTR_TOTAL_DAMAGE_DEFAULT_ASSUMPTIONS, firstAttackStart: 20 })!
  assert.equal(formatSurtrTotalDamageWinnerShortLabel(getSurtrTotalDamageTableWinners(stageTie, 0, 0)
    .map(winner => winner.series)), 'X2＝X3')
})

test('最大と次点の差は未丸めの総ダメージから算出し、次点同率でも1系列を除いた2位を使う', () => {
  const all = comparisons()
  const table = buildSurtrTotalDamageTable([all[0], all[3], all[6]], [50], [0])!
  ;[1000.001, 1000.002, 1000.001].forEach((value, index) => { table.points[index].totalDamage = value })
  const before = structuredClone(table)
  const gap = getSurtrTotalDamageTableWinnerGap(table, 0, 0)!
  assert.equal(gap.runnerUpTotalDamage, 1000.001)
  assert.ok(Math.abs(gap.absoluteDifference - 0.001) < 1e-10)
  assert.ok(Math.abs(gap.increasePercent! - 0.001 / 1000.001 * 100) < 1e-10)
  assert.deepEqual(table, before)
  ;[150, 200, 150].forEach((value, index) => { table.points[index].totalDamage = value })
  assert.deepEqual(getSurtrTotalDamageTableWinnerGap(table, 0, 0),
    { runnerUpTotalDamage: 150, absoluteDifference: 50, increasePercent: 50 / 150 * 100 })
})

test('実際の50秒比較は術耐性0で約2.04%、100で約32.65%になり、指標自体は30%で切り詰めない', () => {
  const all = comparisons()
  const table = buildSurtrTotalDamageTable([all[0], all[3], all[6]], [50], [0, 100])!
  const before = structuredClone(table)
  const low = getSurtrTotalDamageTableWinnerGap(table, 0, 0)!
  const high = getSurtrTotalDamageTableWinnerGap(table, 0, 1)!
  assert.equal(low.runnerUpTotalDamage, 175273)
  assert.equal(low.absoluteDifference, 3577)
  assert.ok(Math.abs(low.increasePercent! - 100 / 49) < 1e-10)
  assert.ok(Math.abs(high.runnerUpTotalDamage - 35054.6) < 1e-8)
  assert.ok(Math.abs(high.absoluteDifference - 11446.4) < 1e-8)
  assert.ok(Math.abs(high.increasePercent! - 3200 / 98) < 1e-10)
  assert.equal(SURTR_TOTAL_DAMAGE_WINNER_GAP_MAX_PERCENT, 30)
  assert.ok(high.increasePercent! > SURTR_TOTAL_DAMAGE_WINNER_GAP_MAX_PERCENT)
  assert.deepEqual(table, before)
})

test('最大同率は下位の異なる値ではなく同率最大を次点にし、浮動小数点誤差内も差0・率0とする', () => {
  const all = comparisons()
  const table = buildSurtrTotalDamageTable([all[0], all[3], all[6]], [30, 40], [0])!
  assert.deepEqual(getSurtrTotalDamageTableWinnerGap(table, 0, 0),
    { runnerUpTotalDamage: 118041, absoluteDifference: 0, increasePercent: 0 })
  assert.deepEqual(getSurtrTotalDamageTableWinnerGap(table, 1, 0),
    { runnerUpTotalDamage: 146657, absoluteDifference: 0, increasePercent: 0 })
  ;[0.3, 0.1 + 0.2, 0.2].forEach((value, index) => { table.points[index].totalDamage = value })
  assert.deepEqual(getSurtrTotalDamageTableWinnerGap(table, 0, 0),
    { runnerUpTotalDamage: 0.3, absoluteDifference: 0, increasePercent: 0 })
  ;[0.1 + 0.2, 0.3, 0.2].forEach((value, index) => { table.points[index].totalDamage = value })
  assert.deepEqual(getSurtrTotalDamageTableWinnerGap(table, 0, 0),
    { runnerUpTotalDamage: 0.3, absoluteDifference: 0, increasePercent: 0 })
})

test('全0なら同率0%、次点0で最大が正なら率を定義せずInfinityも返さない', () => {
  const all = comparisons()
  const table = buildSurtrTotalDamageTable([all[0], all[3], all[6]], [0], [0],
    { ...SURTR_TOTAL_DAMAGE_DEFAULT_ASSUMPTIONS, firstAttackStart: 20 })!
  assert.deepEqual(getSurtrTotalDamageTableWinnerGap(table, 0, 0),
    { runnerUpTotalDamage: 0, absoluteDifference: 0, increasePercent: 0 })
  table.points[1].totalDamage = 100
  assert.deepEqual(getSurtrTotalDamageTableWinnerGap(table, 0, 0),
    { runnerUpTotalDamage: 0, absoluteDifference: 100, increasePercent: null })
  table.points[0].totalDamage = 1
  table.points[1].totalDamage = Number.MAX_VALUE
  assert.deepEqual(getSurtrTotalDamageTableWinnerGap(table, 0, 0),
    { runnerUpTotalDamage: 1, absoluteDifference: Number.MAX_VALUE, increasePercent: null })
})

test('比較対象が不足する場合やセルが不完全・不正な場合は差を確定しない', () => {
  const all = comparisons()
  const single = buildSurtrTotalDamageTable([all[3]], [50], [0])!
  assert.equal(getSurtrTotalDamageTableWinnerGap(single, 0, 0), null)
  assert.equal(getSurtrTotalDamageTableWinnerGap({ ...single, series: [], points: [] }, 0, 0), null)
  const table = buildSurtrTotalDamageTable([all[3], all[6]], [50], [0])!
  for (const invalid of [NaN, Infinity, -Infinity, -1]) {
    const invalidTable = structuredClone(table)
    invalidTable.points[1].totalDamage = invalid
    assert.equal(getSurtrTotalDamageTableWinnerGap(invalidTable, 0, 0), null)
  }
  const missing = structuredClone(table)
  missing.points.pop()
  assert.equal(getSurtrTotalDamageTableWinnerGap(missing, 0, 0), null)
  const mismatched = structuredClone(table)
  mismatched.points[1].seriesId = 'different'
  assert.equal(getSurtrTotalDamageTableWinnerGap(mismatched, 0, 0), null)
  assert.equal(getSurtrTotalDamageTableWinnerGap(table, 1, 0), null)
  assert.equal(getSurtrTotalDamageTableWinnerGap(table, 0, -1), null)
})

test('全段階比較では次点も選択した系列から取り、X3の次点がX2になる場合がある', () => {
  const all = comparisons()
  const table = buildSurtrTotalDamageTable(all, [50], [100])!
  const gap = getSurtrTotalDamageTableWinnerGap(table, 0, 0)!
  assert.equal(getSurtrTotalDamageTableWinners(table, 0, 0)[0].series.id, all[3].id)
  assert.equal(gap.runnerUpTotalDamage, getSurtrTotalDamageTablePoint(table, 0, 0, 2)!.totalDamage)
  assert.equal(gap.runnerUpTotalDamage, 42312)
  assert.ok(gap.increasePercent! < 10)
  const typesOnly = buildSurtrTotalDamageTable([all[0], all[3], all[6]], [50], [100])!
  assert.ok(gap.increasePercent! < getSurtrTotalDamageTableWinnerGap(typesOnly, 0, 0)!.increasePercent!)
})

// Compact fixture matching existing Surtr DPS/Remnant test source data.
function createRecord(): SkillRecord {
  const skillLevels = Array.from({ length: 10 }, () => ({
    name: 'ラグナロク', description: '攻撃力上昇、最大HP+5000、退場まで効果継続',
    duration: -1, durationType: 'NONE', skillType: 'MANUAL', blackboard: [
      { key: 'atk', value: 3.3 }, { key: 'max_hp', value: 5000 }, { key: 'interval', value: 0.2 },
      { key: 'hp_ratio', value: 0.2 }, { key: 'duration', value: 60 },
    ],
  }))
  return {
    id: 'char_350_surtr:skchr_surtr_3', operatorId: 'char_350_surtr', operatorName: 'スルト',
    profession: 'WARRIOR', professionLabel: '前衛', subProfessionId: 'artsfghter', subProfessionName: '術戦士',
    nameInitial: 'S_ROW', rarity: 6, skillIndex: 3, skillId: 'skchr_surtr_3', skillName: 'ラグナロク',
    description: '', duration: -1, durationType: 'NONE', skillType: 'MANUAL', spType: 'INCREASE_WITH_TIME',
    initSp: 0, spCost: 5, classification: classifySkill(skillLevels[9]), skillLevels, raw: skillLevels[9],
    operatorProfile: {
      phases: [{ maxLevel: 50 }, { maxLevel: 80 }, { maxLevel: 90, attributesKeyFrames: [
        { level: 1, data: { maxHp: 2216, atk: 544, attackSpeed: 100, baseAttackTime: 1.25 } },
        { level: 90, data: { maxHp: 2916, atk: 672, attackSpeed: 100, baseAttackTime: 1.25 } },
      ] }],
      favorKeyFrames: [{ level: 0, data: { maxHp: 0, atk: 0 } }, { level: 50, data: { maxHp: 0, atk: 100 } }],
      traitDescription: '敵に術ダメージを与える',
      potentialRanks: [{}, {}, { buff: { attributes: { attributeModifiers: [
        { attributeType: 'ATK', formulaItem: 'ADDITION', value: 28 },
      ] } } }, {}, {}],
      talents: [{ candidates: [0, 4].map(rank => ({ name: '劫火', requiredPotentialRank: rank,
        unlockCondition: { phase: 'PHASE_2', level: 1 },
        blackboard: [{ key: 'magic_resist_penetrate_fixed', value: rank ? 22 : 20 }],
      })) }, { candidates: [0, 2].map(rank => ({
        name: '余燼', requiredPotentialRank: rank, unlockCondition: { phase: 'PHASE_2', level: 1 },
        blackboard: [{ key: 'surtr_t_2[withdraw].interval', value: rank ? 9 : 8 }],
      })) }],
      modules: [module('X'), module('Y')],
    },
  }
}

function module(type: 'X' | 'Y'): RawOperatorModule {
  return {
    uniEquipId: type === 'X' ? xId : yId, uniEquipName: `MOD ${type}`, type: 'ADVANCED', typeName2: type,
    unlockEvolvePhase: 'PHASE_2', unlockLevel: 60,
    phases: [1, 2, 3].map((level, index) => ({
      equipLevel: level,
      attributeBlackboard: type === 'X' ? { atk: [30, 48, 60][index], magic_resistance: 5 }
        : { atk: [45, 55, 60][index], def: [42, 56, 65][index] },
      parts: [
        { overrideTraitDataBundle: { candidates: [{ requiredPotentialRank: 0,
          additionalDescription: type === 'X' ? '未ブロック時、攻撃速度+8' : 'ブロック中の敵に対術脆弱',
          blackboard: type === 'X' ? { attack_speed: 8 } : { damage_scale: 1.1 },
        }] } },
        { addOrOverrideTalentDataBundle: { candidates: type === 'X'
          ? (level === 1 ? [] : [0, 4].map(rank => ({ talentIndex: 0, name: '劫火', requiredPotentialRank: rank,
            blackboard: { magic_resist_penetrate_fixed: [20, 24, 26][index] + (rank ? 2 : 0) },
          })))
          : (level === 1 ? [] : [0, 2].map(rank => ({ talentIndex: 1, name: '余燼', requiredPotentialRank: rank,
            blackboard: { 'surtr_t_2[withdraw].interval': (level === 3 ? 9 : 8) + (rank ? 1 : 0),
              'surtr_t_2[withdraw].attack_speed': level === 3 ? 30 : 20 },
          }))),
        } },
      ],
    })),
  }
}
