import assert from 'node:assert/strict'
import test from 'node:test'
import type { SurtrDurationModel } from '../src/lib/surtrDuration.ts'
import {
  calculateSurtrDurationCombat,
  type SurtrDurationExternalAction,
} from '../src/lib/surtrDurationCombat.ts'
import { buildSurtrDurationTimeline } from '../src/lib/surtrDurationTimeline.ts'

const model: SurtrDurationModel = {
  moduleId: '', moduleType: null, moduleLevel: 0,
  skillName: 'ラグナロク', skillLevelIndex: 9, skillLevelLabel: '特化3',
  baseMaxHp: 100, skillHpBonus: 100, maxHp: 200,
  activationDelay: 0.6, drainInterval: 0.2, rampDuration: 60, maxDrainRate: 0.2,
  remnantDuration: 8, calculationKind: 'tick-estimate',
}

function action(patch: Partial<SurtrDurationExternalAction> = {}): SurtrDurationExternalAction {
  return { id: 'enemy', kind: 'damage', amount: 1000, interval: 100, firstTime: 2, count: 1, ...patch }
}

test('準備0.6秒より前に余燼が発動しても表を作成し、全回復後も余燼として表示する', () => {
  const result = calculateSurtrDurationCombat(model, [action({ firstTime: 0.2 })])!
  const rows = buildSurtrDurationTimeline(model, result)
  assert.ok(rows.length)
  assert.deepEqual(rows.find(row => row.time === 0.2),
    { time: 0.2, hp: 1, hpPercent: 1, status: 'remnant-start' })
  assert.deepEqual(rows.find(row => row.time === 0.6),
    { time: 0.6, hp: 200, hpPercent: 100, status: 'remnant' })
  assert.deepEqual(rows.at(-1), { time: 8.2, hp: null, hpPercent: null, status: 'retreated' })
})

test('余燼が発動しないまま上限に達した場合はHPを残して上限と表示する', () => {
  const result = calculateSurtrDurationCombat(model, [action({ kind: 'heal', amount: 1e6,
    firstTime: 1, interval: 0.1 })], 12.5)!
  const rows = buildSurtrDurationTimeline(model, result, 5)
  assert.deepEqual(rows.map(row => row.time), [0, 0.6, 5, 10, 12.5])
  assert.equal(rows.at(-1)!.status, 'limit')
  assert.equal(rows.at(-1)!.hp, 200)
  assert.ok(rows.every(row => row.status !== 'retreated' && row.status !== 'remnant-start'))
})

test('余燼発動後の上限では既知の退場時刻を行に追加せず上限時点のHPを表示する', () => {
  const result = calculateSurtrDurationCombat(model, [], 30)!
  assert.equal(result.remnantStart, 25)
  assert.equal(result.retreatTime, 33)
  const rows = buildSurtrDurationTimeline(model, result, 5)
  assert.deepEqual(rows.at(-1), { time: 30, hp: 1, hpPercent: 0.5, status: 'limit' })
  assert.equal(rows.find(row => row.time === 25)!.status, 'remnant-start')
  assert.ok(rows.every(row => row.time <= 30 && row.status !== 'retreated'))
})

test('外部命中と表示時刻が一致したときは命中後のHPを使う', () => {
  const result = calculateSurtrDurationCombat(model, [action({ firstTime: 5, amount: 20 })], 6)!
  const rows = buildSurtrDurationTimeline(model, result, 5)
  const damage = result.events.find(event => event.kind === 'damage')!
  assert.equal(damage.time, 5)
  assert.equal(rows.find(row => row.time === 5)!.hp, damage.hpAfter)
  assert.equal(rows.find(row => row.time === 5)!.hpPercent, damage.hpAfter / model.maxHp * 100)
  assert.ok(damage.hpAfter < damage.hpBefore)
})

test('同じ時刻に複数のHP変更がある場合は最後の回復後を採用する', () => {
  const result = calculateSurtrDurationCombat(model, [
    action({ firstTime: 1 }),
    action({ id: 'healer', kind: 'heal', amount: 50, firstTime: 1 }),
  ], 2)!
  const rows = buildSurtrDurationTimeline(model, result)
  assert.deepEqual(result.events.filter(event => event.time === 1).map(event => event.kind),
    ['drain', 'damage', 'remnant-start', 'heal'])
  assert.deepEqual(rows.find(row => row.time === 1),
    { time: 1, hp: 51, hpPercent: 25.5, status: 'remnant-start' })
  assert.ok(result.points.filter(point => point.time === 1).length >= 3)
})

test('余燼中に回復した実HPを維持し、余燼だからとHP1に置き換えない', () => {
  const result = calculateSurtrDurationCombat(model, [
    action(), action({ id: 'healer', kind: 'heal', amount: 100, firstTime: 2.1 }),
  ])!
  const rows = buildSurtrDurationTimeline(model, result)
  const recovered = rows.find(row => row.time === 3)!
  assert.equal(recovered.status, 'remnant')
  assert.ok(recovered.hp! > 1 && recovered.hp! < 101)
  const point = result.points.filter(point => point.time <= 3).at(-1)!
  assert.equal(recovered.hp, point.hp)
  assert.equal(recovered.hpPercent, point.hpPercent)
  assert.deepEqual(rows.at(-1), { time: 10, hp: null, hpPercent: null, status: 'retreated' })
})

test('上限が発動準備より前でも範囲外の全回復行を追加しない', () => {
  const result = calculateSurtrDurationCombat(model, [], 0.3)!
  assert.deepEqual(buildSurtrDurationTimeline(model, result), [
    { time: 0, hp: 100, hpPercent: 100, status: 'activation' },
    { time: 0.3, hp: 100, hpPercent: 100, status: 'limit' },
  ])
})

test('退場と同じ時刻の回復を表に残さず不在として表示する', () => {
  const result = calculateSurtrDurationCombat(model, [action(),
    action({ id: 'healer', kind: 'heal', amount: 200, firstTime: 10 })])!
  assert.ok(!result.events.some(event => event.kind === 'heal'))
  const rows = buildSurtrDurationTimeline(model, result, 5)
  assert.deepEqual(rows.at(-1), { time: 10, hp: null, hpPercent: null, status: 'retreated' })
})
