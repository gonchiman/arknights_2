import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateSurtrDuration, type SurtrDurationModel, type SurtrDurationResult } from '../src/lib/surtrDuration.ts'
import { buildSurtrDurationTimeline } from '../src/lib/surtrDurationTimeline.ts'

const model: SurtrDurationModel = {
  moduleId: 'uniequip_003_surtr', moduleType: 'Y', moduleLevel: 3,
  skillName: 'ラグナロク', skillLevelIndex: 9, skillLevelLabel: '特化3',
  baseMaxHp: 2916, skillHpBonus: 5000, maxHp: 7916,
  activationDelay: 0.6, drainInterval: 0.2, rampDuration: 60, maxDrainRate: 0.2,
  remnantDuration: 9, calculationKind: 'tick-estimate',
}

function result(): SurtrDurationResult {
  const value = calculateSurtrDuration(model)
  assert.ok(value)
  return value
}

test('毎秒に効果開始行を加え、準備中とHP全回復を区別する', () => {
  const rows = buildSurtrDurationTimeline(model, result())
  assert.equal(rows.length, 36)
  assert.deepEqual(rows.slice(0, 2), [
    { time: 0, hp: 2916, hpPercent: 100, status: 'activation' },
    { time: 0.6, hp: 7916, hpPercent: 100, status: 'full-heal' },
  ])
  const atOne = rows.find(row => row.time === 1)!
  assert.equal(atOne.status, 'drain')
  assert.ok(Math.abs(atOne.hp! - 7912.8336) < 1e-9)
  assert.ok(Math.abs(atOne.hpPercent! - 99.96) < 1e-9)
  assert.notEqual(atOne.hp, Math.round(atOne.hp!))
})

test('同時刻の減少処理後を読み、余燼開始と退場を毎秒行に統合する', () => {
  const rows = buildSurtrDurationTimeline(model, result())
  assert.equal(rows.filter(row => row.time === 25).length, 1)
  assert.equal(rows.filter(row => row.time === 34).length, 1)
  assert.deepEqual(rows.find(row => row.time === 25), {
    time: 25, hp: 1, hpPercent: 1 / 7916 * 100, status: 'remnant-start',
  })
  assert.equal(rows.find(row => row.time === 33)!.status, 'remnant')
  assert.equal(rows.find(row => row.time === 33)!.hp, 1)
  assert.deepEqual(rows.at(-1), { time: 34, hp: null, hpPercent: null, status: 'retreated' })
})

test('5秒刻みでも0.6秒と退場時刻を残し、節目と刻みの重複を除く', () => {
  const rows = buildSurtrDurationTimeline(model, result(), 5)
  assert.deepEqual(rows.map(row => row.time), [0, 0.6, 5, 10, 15, 20, 25, 30, 34])
  assert.equal(rows[6].status, 'remnant-start')
  assert.equal(rows[7].status, 'remnant')
  assert.equal(rows[8].status, 'retreated')
})

test('減少tickの間にある秒は直前のHPを保持して補間しない', () => {
  const shifted = { ...model, activationDelay: 0.7 }
  const value = calculateSurtrDuration(shifted)!
  const rows = buildSurtrDurationTimeline(shifted, value)
  const previous = value.points.find(point => point.time === 0.9)!
  const next = value.points.find(point => point.time === 1.1)!
  const atOne = rows.find(row => row.time === 1)!
  assert.equal(atOne.hp, previous.hp)
  assert.equal(atOne.hpPercent, previous.hpPercent)
  assert.notEqual(atOne.hp, (previous.hp + next.hp) / 2)
  assert.deepEqual(rows.at(-1), { time: 34.1, hp: null, hpPercent: null, status: 'retreated' })
  assert.equal(rows.find(row => row.time === 34)!.hp, 1)
})

test('整数でない余燼開始・退場を5秒刻みでもすべて追加する', () => {
  const shifted = { ...model, activationDelay: 0.7, remnantDuration: 8.35 }
  const value = calculateSurtrDuration(shifted)!
  const rows = buildSurtrDurationTimeline(shifted, value, 5)
  assert.deepEqual(rows.map(row => row.time), [0, 0.7, 5, 10, 15, 20, 25, 25.1, 30, 33.45])
  assert.equal(rows.find(row => row.time === 25)!.status, 'drain')
  assert.equal(rows.find(row => row.time === 25.1)!.status, 'remnant-start')
  assert.equal(rows.at(-1)!.status, 'retreated')
})

test('同じ時刻のpointが複数あれば最新の処理後を採用し、元配列を変えない', () => {
  const value = result()
  value.points.splice(1, 0, { time: 0.6, hp: 2916, maxHp: 2916, hpPercent: 100, phase: 'activation' })
  const snapshot = structuredClone(value)
  const rows = buildSurtrDurationTimeline(model, value)
  assert.equal(rows.find(row => row.time === 0.6)!.hp, 7916)
  assert.deepEqual(value, snapshot)
})

test('効果開始が整数秒でも行が重複せず、時刻0の同時イベントは処理後になる', () => {
  const delayed = { ...model, activationDelay: 1 }
  const rows = buildSurtrDurationTimeline(delayed, calculateSurtrDuration(delayed)!)
  assert.equal(rows.filter(row => row.time === 1).length, 1)
  assert.equal(rows.find(row => row.time === 1)!.status, 'full-heal')
  const immediate = { ...model, activationDelay: 0 }
  const immediateRows = buildSurtrDurationTimeline(immediate, calculateSurtrDuration(immediate)!)
  assert.deepEqual(immediateRows[0], { time: 0, hp: 7916, hpPercent: 100, status: 'full-heal' })
})

test('不正な時間軸・刻み・過大な行数は空配列にして停止する', () => {
  const value = result()
  for (const step of [0, -1, 2, Infinity, NaN]) {
    assert.deepEqual(buildSurtrDurationTimeline(model, value, step as 1), [])
  }
  for (const patch of [
    { retreatTime: Infinity }, { retreatTime: -1 }, { retreatTime: 20 }, { retreatTime: 1e9 },
    { remnantStart: NaN }, { remnantStart: -1 }, { remnantStart: 0.5 }, { points: [] },
  ]) assert.deepEqual(buildSurtrDurationTimeline(model, { ...value, ...patch }), [])
  assert.deepEqual(buildSurtrDurationTimeline({ ...model, activationDelay: NaN }, value), [])
  const badPoints = structuredClone(value)
  badPoints.points[1].hp = NaN
  assert.deepEqual(buildSurtrDurationTimeline(model, badPoints), [])
  const reversed = { ...value, points: [...value.points].reverse() }
  assert.deepEqual(buildSurtrDurationTimeline(model, reversed), [])
})
