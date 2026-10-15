import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateSurtrDuration, type SurtrDurationModel } from '../src/lib/surtrDuration.ts'
import {
  calculateSurtrDurationCombat,
  type SurtrDurationExternalAction,
} from '../src/lib/surtrDurationCombat.ts'

const model: SurtrDurationModel = {
  moduleId: '', moduleType: null, moduleLevel: 0,
  skillName: 'ラグナロク', skillLevelIndex: 9, skillLevelLabel: '特化3',
  baseMaxHp: 2916, skillHpBonus: 5000, maxHp: 7916,
  activationDelay: 0.6, drainInterval: 0.2, rampDuration: 60, maxDrainRate: 0.2,
  remnantDuration: 8, calculationKind: 'tick-estimate',
}

function action(patch: Partial<SurtrDurationExternalAction> = {}): SurtrDurationExternalAction {
  return { id: 'enemy', kind: 'damage', amount: 100, interval: 1, firstTime: 1, count: 1, ...patch }
}

test('外部効果なしは従来の25秒・33秒とHPサンプルを維持する', () => {
  const old = calculateSurtrDuration(model)!
  const value = calculateSurtrDurationCombat(model, [])!
  assert.equal(value.outcome, 'retreated')
  assert.equal(value.remnantStart, 25)
  assert.equal(value.retreatTime, 33)
  assert.equal(value.endTime, 33)
  assert.deepEqual(value.points, old.points)
  assert.deepEqual(value.drainSchedule, old.drainSchedule)
  assert.equal(value.events.at(-1)!.kind, 'retreat')
})

test('外部ダメージは余燼を早め、countは同時に攻撃する敵の数となる', () => {
  const one = calculateSurtrDurationCombat(model, [action({ amount: 1000 })])!
  const two = calculateSurtrDurationCombat(model, [action({ amount: 1000, count: 2 })])!
  assert.ok(one.remnantStart! < 25)
  assert.ok(two.remnantStart! < one.remnantStart!)
  assert.equal(two.events.find(event => event.kind === 'damage')!.requestedAmount, 2000)
  assert.equal(two.retreatTime, two.remnantStart! + 8)
})

test('周期回復は余燼を遅らせ、最大HPを超える回復は切り捨てる', () => {
  const value = calculateSurtrDurationCombat(model, [action({ id: 'healer', kind: 'heal', amount: 200 })])!
  assert.ok(value.remnantStart! > 25)
  assert.ok(value.points.every(point => point.hp <= point.maxHp && point.hp > 0))
  const capped = calculateSurtrDurationCombat(model, [action({ kind: 'heal', amount: 1e6 })], 10)!
  const heal = capped.events.find(event => event.kind === 'heal')!
  assert.ok(heal.appliedAmount < heal.requestedAmount)
  assert.equal(heal.hpAfter, model.maxHp)
})

test('強い回復は時間上限で終了し、無限継続とは判断しない', () => {
  const value = calculateSurtrDurationCombat(model, [action({ kind: 'heal', amount: 1e6, interval: 0.1 })], 60)!
  assert.equal(value.outcome, 'limit')
  assert.equal(value.endTime, 60)
  assert.equal(value.remnantStart, null)
  assert.equal(value.retreatTime, null)
  assert.equal(value.points.at(-1)!.time, 60)
  assert.equal(value.events.at(-1)!.kind, 'heal')
})

test('0.6秒の全回復より前にも被ダメージ・余燼が発生し全回復で期限は戻らない', () => {
  const value = calculateSurtrDurationCombat(model, [action({ amount: 5000, firstTime: 0.2, interval: 10 })])!
  assert.equal(value.remnantStart, 0.2)
  assert.equal(value.retreatTime, 8.2)
  assert.equal(value.endTime, 8.2)
  const startup = value.events.find(event => event.kind === 'startup')!
  assert.equal(startup.hpBefore, 1)
  assert.equal(startup.hpAfter, model.maxHp)
  assert.equal(value.points.filter(point => point.time === 0.2).at(-1)!.phase, 'remnant')
  assert.ok(value.points.filter(point => point.time > 0.2).every(point => point.phase === 'remnant'))
})

test('余燼中も回復と自己減少が続くが強制退場はHPに関係なく固定する', () => {
  const value = calculateSurtrDurationCombat(model, [
    action({ amount: 1e6, firstTime: 2, interval: 100 }),
    action({ id: 'healer', kind: 'heal', amount: 5000, firstTime: 2.1, interval: 100 }),
  ])!
  assert.equal(value.remnantStart, 2)
  assert.equal(value.retreatTime, 10)
  const healing = value.events.find(event => event.kind === 'heal')!
  assert.equal(healing.hpBefore, 1)
  assert.equal(healing.hpAfter, 5001)
  const nextDrain = value.events.find(event => event.kind === 'drain' && event.time > 2.1)!
  assert.ok(nextDrain.hpAfter < 5001 && nextDrain.hpAfter >= 1)
  assert.ok(value.events.at(-1)!.hpAfter > 1)
})

test('同時刻は全回復、自己減少、被ダメージ、回復の順で退場が最優先となる', () => {
  const startup = calculateSurtrDurationCombat(model, [
    action({ amount: 3000, firstTime: 0.6, interval: 100 }),
    action({ kind: 'heal', amount: 1000, firstTime: 0.6, interval: 100 }),
  ], 1)!
  assert.deepEqual(startup.events.filter(event => event.time === 0.6).map(event => event.kind),
    ['startup', 'damage', 'heal'])
  assert.equal(startup.events.find(event => event.kind === 'damage')!.hpBefore, 7916)
  const value = calculateSurtrDurationCombat(model, [
    action({ amount: 1e6, firstTime: 0.8, interval: 100 }),
    action({ kind: 'heal', amount: 1e6, firstTime: 0.8, interval: 100 }),
    action({ id: 'expiry-heal', kind: 'heal', amount: 1e6, firstTime: 8.8, interval: 100 }),
  ])!
  assert.deepEqual(value.events.filter(event => event.time === 0.8).map(event => event.kind),
    ['drain', 'damage', 'remnant-start', 'heal'])
  assert.deepEqual(value.events.filter(event => event.time === 8.8).map(event => event.kind), ['retreat'])
})

test('同時回復が自己減少の致死を打ち消すことはなく、余燼は発動済みとなる', () => {
  const value = calculateSurtrDurationCombat(model, [
    action({ kind: 'heal', amount: 1000, firstTime: 25, interval: 100 }),
  ])!
  assert.equal(value.remnantStart, 25)
  assert.equal(value.retreatTime, 33)
  assert.equal(value.events.find(event => event.kind === 'heal')!.hpBefore, 1)
})

test('有効期間は開始を含み終了を含まず、初回からの周期はずらさない', () => {
  const value = calculateSurtrDurationCombat(model, [action({ firstTime: 0.5, interval: 1,
    activeFrom: 1.5, activeUntil: 3.5 })], 5)!
  assert.deepEqual(value.events.filter(event => event.kind === 'damage').map(event => event.time), [1.5, 2.5])
  const narrow = calculateSurtrDurationCombat(model, [action({ firstTime: 0, interval: 0.0001,
    amount: 0, activeFrom: 1, activeUntil: 1.0005 })], 120)!
  assert.ok(narrow)
  assert.equal(narrow.events.filter(event => event.kind === 'damage').length, 5)
})

test('上限までに余燼が発動済みなら上限後の既知の退場時刻を返す', () => {
  const value = calculateSurtrDurationCombat(model, [], 30)!
  assert.equal(value.outcome, 'limit')
  assert.equal(value.remnantStart, 25)
  assert.equal(value.retreatTime, 33)
  assert.equal(value.endTime, 30)
  assert.ok(value.points.every(point => point.time <= 30))
  assert.ok(!value.events.some(event => event.kind === 'retreat'))
})

test('HPが変わる時刻の前後を同じ時刻で記録し、ステップ表示で補間しない', () => {
  const value = calculateSurtrDurationCombat(model, [action({ firstTime: 1, interval: 100 })], 2)!
  const points = value.points.filter(point => point.time === 1)
  assert.ok(points.length >= 2)
  assert.ok(points[0].hp > points.at(-1)!.hp)
  assert.ok(value.points.every((point, index) => index === 0 || point.time >= value.points[index - 1].time))
  assert.equal(value.points.at(-1)!.time, 2)
})

test('起動前の上限と時間0の処理でも終端を保持する', () => {
  const before = calculateSurtrDurationCombat(model, [], 0.3)!
  assert.deepEqual(before.points.map(point => [point.time, point.hp]), [[0, 2916], [0.3, 2916]])
  assert.equal(before.remnantStart, null)
  const zero = calculateSurtrDurationCombat(model, [action({ firstTime: 0, amount: 1e6 })], 0)!
  assert.equal(zero.remnantStart, 0)
  assert.equal(zero.retreatTime, 8)
  assert.equal(zero.endTime, 0)
})

test('不正な値・過大なイベント数を拒否し、未来の有効イベントなしは許容する', () => {
  for (const patch of [
    { amount: NaN }, { amount: -1 }, { amount: Infinity }, { interval: 0 }, { interval: -1 },
    { interval: Infinity }, { firstTime: -1 }, { firstTime: NaN }, { count: 0 }, { count: 1.5 },
    { count: Infinity }, { id: '' }, { activeFrom: -1 }, { activeUntil: Infinity },
    { activeFrom: 10, activeUntil: 5 }, { amount: Number.MAX_VALUE, count: 2 },
  ]) assert.equal(calculateSurtrDurationCombat(model, [action(patch)]), null)
  for (const limit of [-1, NaN, Infinity, 601]) assert.equal(calculateSurtrDurationCombat(model, [], limit), null)
  for (const patch of [{ maxHp: 1 }, { baseMaxHp: 0 }, { activationDelay: -1 }, { rampDuration: NaN },
    { maxDrainRate: 0 }, { drainInterval: 0 }, { remnantDuration: 0 }, { drainInterval: 1e-12 }]) {
    assert.equal(calculateSurtrDurationCombat({ ...model, ...patch }, []), null)
  }
  assert.equal(calculateSurtrDurationCombat(model, [action({ interval: 1e-12 })]), null)
  assert.ok(calculateSurtrDurationCombat(model, [action({ firstTime: 1e100, interval: 1e-12 })]))
})
