import test from 'node:test'
import assert from 'node:assert/strict'
import { createCrossoverAxes, findCrossoverBoundaries, simulateGoldenglowCrossover, type CrossoverInput, type CrossoverMessage } from '../src/lib/goldenglowCrossover.ts'
import { simulateGoldenglowTargetSwitchGrid } from '../src/lib/goldenglowTargetSwitchGrid.ts'
import type { GoldenglowExplosionModel } from '../src/lib/goldenglowExplosion.ts'

const model: GoldenglowExplosionModel = {
  talentName: '電流暴走', talentDescription: '', damageType: 'ARTS', attackScale: 3, attackScalePercent: 300,
  nominalChancePercent: 10, prdStep: 0.015, prdMaxStack: 40, additionalDroneCount: 0, activeDroneCount: 3,
  resistanceIgnoreFixed: 15, droneInitialAttackScale: 0.2, droneInitialAttackScalePercent: 20,
  droneAttackScaleStep: 0.15, droneAttackScaleStepPercent: 15, droneMaxAttackScale: 1.1, droneMaxAttackScalePercent: 110, droneMaxStack: 6,
}
function input(): CrossoverInput {
  const setup = { model, skillIndex: 3, effectiveAttack: 703, attackInterval: 1.3, duration: 10,
    enemyDefense: 0, switchDelay: 0.1, retargetRemainingDrones: true }
  return { x: { label: 'MOD X', input: setup }, y: { label: 'MOD Y', input: { ...setup, effectiveAttack: 784, attackInterval: 1.215 } },
    startResistance: 0, endResistance: 100, resistanceStep: 20, startHp: 1, endHp: 3000, hpStep: 1000, trials: 13, seed: 20260908 }
}
test('複数回逆転しても最初と最後の逆転を区別し、同値は優勢にしない', () => {
  const result = findCrossoverBoundaries([100, 200, 300, 400, 500, 600], [-1, 2, -3, 0, 1, 4])
  assert.deepEqual(result.first, { kind: 'found', hp: 200, previousHp: 100 })
  assert.deepEqual(result.sustained, { kind: 'found', hp: 500, previousHp: 400 })
})
test('開始から優勢・未検出・最後だけ優勢を数値0と区別する', () => {
  assert.deepEqual(findCrossoverBoundaries([1, 2], [1, 2]), {
    first: { kind: 'from-start', hp: 1, previousHp: null }, sustained: { kind: 'from-start', hp: 1, previousHp: null },
  })
  assert.equal(findCrossoverBoundaries([1, 2], [0, -1]).first.hp, null)
  assert.equal(findCrossoverBoundaries([1, 2], [1, -1]).sustained.kind, 'not-found')
  assert.equal(findCrossoverBoundaries([1, 2], [-1, 1]).sustained.hp, 2)
  assert.equal(findCrossoverBoundaries([1], [1]).sustained.kind, 'from-start')
})
test('開始と終了を含み、刻みと端数の区間を保持する', () => {
  const { hps, resistances } = createCrossoverAxes({ ...input(), startResistance: 5, endResistance: 26, resistanceStep: 10 })
  assert.deepEqual(hps, [1, 1001, 2001, 3000])
  assert.deepEqual(resistances, [5, 15, 25, 26])
  assert.deepEqual(createCrossoverAxes({ ...input(), endHp: 1 }).hps, [1])
  for (const change of [{ hpStep: 0 }, { startHp: 0 }, { startResistance: -1 }, { resistanceStep: NaN }, { endHp: 3000000, hpStep: 1 }, { trials: 20001 }]) {
    assert.throws(() => createCrossoverAxes({ ...input(), ...change }), RangeError)
  }
})
test('既存のHPシミュレーションと各術耐性で一致し、同じ抽選番号なら再現する', () => {
  const source = input()
  const axes = createCrossoverAxes(source)
  const expected = axes.resistances.map(resistance => {
    const means = [source.x, source.y].map(build => simulateGoldenglowTargetSwitchGrid({
      ...build.input, trials: source.trials, seed: source.seed, enemyHps: axes.hps, enemyResistances: [resistance],
    }).rows[0].expectedDamages)
    return { resistance, ...findCrossoverBoundaries(axes.hps, means[1].map((n, i) => n - means[0][i])) }
  })
  assert.deepEqual(simulateGoldenglowCrossover(source), expected)
  assert.deepEqual(simulateGoldenglowCrossover(source), expected)
})
test('100HP点を超える探索でも欠落せず、進捗・元入力・結果が独立する', () => {
  const source = { ...input(), endResistance: 0, endHp: 102, hpStep: 1 }
  const expected = simulateGoldenglowCrossover(source)
  const messages: CrossoverMessage[] = []
  const result = simulateGoldenglowCrossover(source, message => {
    messages.push(structuredClone(message))
    source.y.input.effectiveAttack = 1
    if (message.type === 'row') message.point.first.hp = -999
  })
  assert.deepEqual(result, expected)
  const progress = messages.filter(message => message.type === 'progress')
  assert.equal(progress.length, 204)
  assert.deepEqual(progress.at(-1), { type: 'progress', completed: 204, total: 204 })
  assert.equal(messages.filter(message => message.type === 'row').length, 1)
})
test('不正な後半のMODでも部分結果を出す前に拒否する', () => {
  const source = input()
  source.y.input.attackInterval = 0
  const messages: CrossoverMessage[] = []
  assert.throws(() => simulateGoldenglowCrossover(source, message => messages.push(message)), RangeError)
  assert.deepEqual(messages, [])
  assert.throws(() => findCrossoverBoundaries([1, 2], [1, NaN]), RangeError)
  assert.throws(() => findCrossoverBoundaries([2, 1], [1, 2]), RangeError)
})
