import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateSurtrDuration, type SurtrDurationModel } from '../src/lib/surtrDuration.ts'
import { calculateSurtrDurationCombat } from '../src/lib/surtrDurationCombat.ts'
import {
  prepareSurtrDurationChartSeries,
  type SurtrDurationChartViewSeries,
} from '../src/lib/surtrDurationChartView.ts'

const model: SurtrDurationModel = {
  moduleId: '', moduleType: null, moduleLevel: 0,
  skillName: 'ラグナロク', skillLevelIndex: 9, skillLevelLabel: '特化3',
  baseMaxHp: 2916, skillHpBonus: 5000, maxHp: 7916,
  activationDelay: 0.6, drainInterval: 0.2, rampDuration: 60, maxDrainRate: 0.2,
  remnantDuration: 8, calculationKind: 'tick-estimate',
}

function fixture(patch: Partial<SurtrDurationChartViewSeries> = {}) {
  return { id: 'sample', label: '未装備', color: '#777',
    remnantStart: 25, remnantDuration: 8, retreatTime: 33,
    points: [{ time: 0, hpPercent: 100 }, { time: 25, hpPercent: 0.01, phase: 'remnant' },
      { time: 33, hpPercent: 0.01, phase: 'remnant' }], ...patch }
}

test('余燼発動までの表示は既存計算の発動点で止まり、元の結果とメタデータを維持する', () => {
  const result = calculateSurtrDuration(model)!
  const input = { id: 'baseline', label: '未装備', ...result }
  const original = structuredClone(input)
  const [prepared] = prepareSurtrDurationChartSeries([input], 'remnant')
  assert.equal(prepared.displayEnd, 25)
  assert.equal(prepared.points.at(-1)!.time, 25)
  assert.equal(prepared.triggerHp, 1 / model.maxHp * 100)
  assert.equal(prepared.retreatTime, 33)
  assert.equal(prepared.label, '未装備')
  assert.deepEqual(input, original)
  assert.notEqual(prepared.points, input.points)
  assert.notEqual(prepared.points[0], input.points[0])
  assert.equal(prepared.drainSchedule, input.drainSchedule)
})

test('同時刻の致死ダメージ後の回復を余燼発動前の線へ混ぜない', () => {
  const result = calculateSurtrDurationCombat(model, [
    { id: 'enemy', kind: 'damage', amount: 1e6, interval: 100, firstTime: 0.8, count: 1 },
    { id: 'healer', kind: 'heal', amount: 1e6, interval: 100, firstTime: 0.8, count: 1 },
  ])!
  const sameTime = result.points.filter(point => point.time === 0.8)
  assert.ok(sameTime.length >= 3)
  assert.equal(sameTime.at(-1)!.hpPercent, 100)
  for (const range of ['remnant', 'retreat'] as const) {
    const [prepared] = prepareSurtrDurationChartSeries([result], range)
    assert.equal(prepared.triggerHp, 1 / model.maxHp * 100)
    if (range === 'remnant') {
      assert.equal(prepared.displayEnd, 0.8)
      assert.equal(prepared.points.at(-1)!.hpPercent, 1 / model.maxHp * 100)
      assert.equal(prepared.points.filter(point => point.time === 0.8 && point.phase === 'remnant').length, 1)
    } else {
      assert.equal(prepared.displayEnd, 8.8)
      assert.equal(prepared.points.filter(point => point.time === 0.8).at(-1)!.hpPercent, 100)
    }
  }
})

test('phaseを持たない旧データでも発動時刻の最初の最低HPで切り止める', () => {
  const input = fixture({ points: [
    { time: 0, hpPercent: 100 }, { time: 25, hpPercent: 2 },
    { time: 25, hpPercent: 0.01 }, { time: 25, hpPercent: 80 },
    { time: 25, hpPercent: 0.01 }, { time: 33, hpPercent: 5 },
  ] })
  const [prepared] = prepareSurtrDurationChartSeries([input], 'remnant')
  assert.equal(prepared.points.length, 3)
  assert.equal(prepared.triggerHp, 0.01)
  assert.equal(prepareSurtrDurationChartSeries([input], 'retreat')[0].triggerHp, 0.01)
  const legacyHealing = fixture({ points: input.points.slice(0, 4) })
  assert.equal(prepareSurtrDurationChartSeries([legacyHealing], 'retreat')[0].triggerHp, 80)
})

test('未サンプリングの発動時刻は元の折れ線上へ終点を追加する', () => {
  const [prepared] = prepareSurtrDurationChartSeries([fixture({ remnantStart: 5, retreatTime: 13,
    points: [{ time: 0, hpPercent: 100 }, { time: 4, hpPercent: 40 }, { time: 8, hpPercent: 0 }] })], 'remnant')
  assert.equal(prepared.displayEnd, 5)
  assert.deepEqual(prepared.points.at(-1), { time: 5, hpPercent: 30, phase: 'remnant' })
  assert.equal(prepared.triggerHp, 30)
})

test('片側だけのHPサンプルは既知のHPを維持し、空データから0HPを捏造しない', () => {
  const inputs = [fixture({ points: [{ time: 0, hpPercent: 70 }] }),
    fixture({ points: [{ time: 30, hpPercent: 40 }] }), fixture({ points: [] })]
  const prepared = prepareSurtrDurationChartSeries(inputs, 'remnant')
  assert.equal(prepared[0].points.at(-1)!.hpPercent, 70)
  assert.deepEqual(prepared[1].points, [{ time: 25, hpPercent: 40, phase: 'remnant' }])
  assert.deepEqual(prepared[2].points, [])
  assert.equal(prepared[2].triggerHp, null)
  assert.equal(prepared[2].displayEnd, 25)
})

test('余燼未発動の線は計算上限まで維持し、系列ごとに表示終了を計算する', () => {
  const mixed = [fixture(), fixture({ remnantStart: null, retreatTime: null, endTime: 120,
    points: [{ time: 0, hpPercent: 100 }, { time: 120, hpPercent: 50 }] })]
  const prepared = prepareSurtrDurationChartSeries(mixed, 'remnant')
  assert.deepEqual(prepared.map(item => item.displayEnd), [25, 120])
  assert.equal(prepared[1].triggerHp, null)
  assert.deepEqual(prepared[1].points, mixed[1].points)
})

test('計算上限を超える発動は描画せず、ちょうど上限なら発動点まで含める', () => {
  const inputs = [fixture({ endTime: 10 }), fixture({ endTime: 25,
    points: [{ time: 0, hpPercent: 100 }, { time: 25, hpPercent: 0.1, phase: 'remnant' },
      { time: 25, hpPercent: 80, phase: 'remnant' }] })]
  const prepared = prepareSurtrDurationChartSeries(inputs, 'remnant')
  assert.equal(prepared[0].displayEnd, 10)
  assert.equal(prepared[0].triggerHp, null)
  assert.deepEqual(prepared[0].points, [{ time: 0, hpPercent: 100 }])
  assert.equal(prepared[1].displayEnd, 25)
  assert.equal(prepared[1].triggerHp, 0.1)
  assert.equal(prepared[1].points.length, 2)
})

test('時刻0の余燼発動と計算上限0を有効に扱う', () => {
  const inputs = [fixture({ remnantStart: 0, retreatTime: 8, points: [
    { time: 0, hpPercent: 100, phase: 'activation' },
    { time: 0, hpPercent: 0.1, phase: 'remnant' },
    { time: 0, hpPercent: 80, phase: 'remnant' },
  ] }), fixture({ remnantStart: null, retreatTime: null, endTime: 0 })]
  const prepared = prepareSurtrDurationChartSeries(inputs, 'remnant')
  assert.equal(prepared[0].displayEnd, 0)
  assert.equal(prepared[0].triggerHp, 0.1)
  assert.equal(prepared[0].points.length, 2)
  assert.equal(prepared[1].displayEnd, 0)
  assert.equal(prepared[1].triggerHp, null)
  assert.deepEqual(prepared[1].points, [{ time: 0, hpPercent: 100 }])
})

test('退場まで表示では従来の全サンプル・上限・安定した同時刻順を維持する', () => {
  const input = fixture({ endTime: 30, points: [
    { time: 30, hpPercent: 140 }, { time: 0, hpPercent: -20 },
    { time: 25, hpPercent: 1, phase: 'remnant' }, { time: 25, hpPercent: 60, phase: 'remnant' },
    { time: 31, hpPercent: 10 }, { time: NaN, hpPercent: 10 },
    { time: 10, hpPercent: Infinity }, { time: -1, hpPercent: 50 },
  ] })
  const original = structuredClone(input)
  Object.freeze(input.points)
  input.points.forEach(Object.freeze)
  Object.freeze(input)
  const [prepared] = prepareSurtrDurationChartSeries([input], 'retreat')
  assert.equal(prepared.displayEnd, 30)
  assert.deepEqual(prepared.points, [
    { time: 0, hpPercent: 0 }, { time: 25, hpPercent: 1, phase: 'remnant' },
    { time: 25, hpPercent: 60, phase: 'remnant' }, { time: 30, hpPercent: 100 },
  ])
  assert.equal(prepared.triggerHp, 1)
  assert.deepEqual(input, original)
})

test('不正な時刻メタデータは従来の正規化と同じく系列から除外する', () => {
  const inputs = [fixture({ remnantStart: NaN }), fixture({ remnantStart: Infinity }),
    fixture({ remnantStart: -1 }), fixture({ remnantDuration: -1 }), fixture({ remnantDuration: Infinity }),
    fixture({ retreatTime: 24 }), fixture({ retreatTime: NaN }), fixture({ endTime: NaN }),
    fixture({ endTime: -1 }), fixture({ endTime: Infinity }),
    fixture({ remnantStart: null, retreatTime: null }), fixture()]
  for (const range of ['remnant', 'retreat'] as const) {
    assert.equal(prepareSurtrDurationChartSeries(inputs, range).length, 1)
  }
})

test('空の系列配列には空配列を返す', () => {
  assert.deepEqual(prepareSurtrDurationChartSeries([], 'remnant'), [])
  assert.deepEqual(prepareSurtrDurationChartSeries([], 'retreat'), [])
})

test('自傷の直前の点だけを除き、同時刻や非同期の被ダメージ・回復は垂直な段差として残す', () => {
  const result = calculateSurtrDurationCombat(model, [
    { id: 'enemy', kind: 'damage', amount: 186, interval: 2, firstTime: 2, count: 1 },
    { id: 'healer', kind: 'heal', amount: 407, interval: 2.85, firstTime: 2, count: 1 },
  ])!
  const original = structuredClone(result)
  for (const range of ['remnant', 'retreat'] as const) {
    const [prepared] = prepareSurtrDurationChartSeries([result], range)
    const samples = (time: number) => prepared.points.filter(point => point.time === time)
    assert.deepEqual(samples(0.8), result.points.filter(point => point.time === 0.8).slice(1))
    assert.deepEqual(samples(2), result.points.filter(point => point.time === 2).slice(1))
    assert.equal(samples(2).length, 3, 'self-drain result, enemy hit, then heal all remain')
    assert.ok(samples(2)[1].hpPercent < samples(2)[0].hpPercent)
    assert.ok(samples(2)[2].hpPercent > samples(2)[1].hpPercent)
    assert.deepEqual(samples(4.85), result.points.filter(point => point.time === 4.85))
    assert.equal(samples(4.85).length, 2, 'non-tick healing keeps its before/after pair')
    assert.equal(prepared.remnantStart, result.remnantStart)
    assert.equal(prepared.retreatTime, result.retreatTime)
    assert.equal(prepared.events, result.events)
    assert.equal(prepared.triggerHp, 1 / model.maxHp * 100)
  }
  assert.deepEqual(result, original, 'calculation points, events, and table inputs are untouched')
})

test('初期3条件の発動時刻と終点を維持し、灰色の既存描画データは変えない', () => {
  const results = [calculateSurtrDurationCombat(model, [])!,
    calculateSurtrDurationCombat(model, [{ id: 'enemy', kind: 'damage', amount: 186, interval: 2, firstTime: 2, count: 1 }])!,
    calculateSurtrDurationCombat(model, [{ id: 'healer', kind: 'heal', amount: 407, interval: 2.85, firstTime: 2.85, count: 1 }])!]
  const originals = structuredClone(results)
  const prepared = prepareSurtrDurationChartSeries(results, 'remnant')
  assert.deepEqual(prepared.map(item => item.displayEnd), [25, 22, 30.2])
  assert.deepEqual(prepared.map(item => item.points.at(-1)?.time), [25, 22, 30.2])
  assert.deepEqual(prepared[0].points, results[0].points.filter(point => point.time <= 25))
  assert.deepEqual(prepareSurtrDurationChartSeries([results[0]], 'retreat')[0].points, results[0].points)
  assert.ok(prepared[1].points.length < results[1].points.filter(point => point.time <= 22).length)
  assert.ok(prepared[2].points.length < results[2].points.filter(point => point.time <= 30.2).length)
  assert.deepEqual(results, originals)
})

test('イベント情報のない旧データや一致しない情報から自傷を推測して点を削らない', () => {
  const points = [{ time: 0, hpPercent: 100 }, { time: 2, hpPercent: 100 },
    { time: 2, hpPercent: 90 }, { time: 4, hpPercent: 90 }]
  const base = fixture({ remnantStart: null, retreatTime: null, endTime: 4, points })
  const event = { time: 2, kind: 'drain', hpBefore: 100, hpAfter: 90, maxHp: 100 } as const
  for (const events of [undefined, [{ ...event, kind: 'damage' as const }],
    [{ ...event, hpBefore: 95 }], [{ ...event, hpAfter: NaN }], [{ ...event, maxHp: 0 }],
    [{ ...event, kind: 'heal' as const }, event]]) {
    const [prepared] = prepareSurtrDurationChartSeries([{ ...base, events }], 'retreat')
    assert.deepEqual(prepared.points, points)
  }
})
