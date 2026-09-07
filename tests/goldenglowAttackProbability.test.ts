import test from 'node:test'
import assert from 'node:assert/strict'
import { buildGoldenglowAttackProbabilityDetail } from '../src/lib/goldenglowAttackProbability.ts'
import { buildGoldenglowSkillAttackTable } from '../src/lib/goldenglowSkillAttackTable.ts'

const model = { prdStep: 0.015, prdMaxStack: 40 }

test('1回目は過去の爆発がない初期状態だけで1.5%になる', () => {
  assert.deepEqual(buildGoldenglowAttackProbabilityDetail(model, 1), {
    attackNumber: 1,
    states: [{
      consecutiveMisses: 0,
      lastExplosionAttackNumber: null,
      stateProbability: 1,
      explosionChancePercent: 1.5,
      contributionProbability: 0.015,
    }],
    explosionChancePercent: 1.5,
  })
})

test('2回目は初回爆発した1.5%と不発だった98.5%を分ける', () => {
  const detail = requireDetail(2)
  assert.equal(detail.states.length, 2)
  assert.deepEqual(detail.states.map((state) => state.consecutiveMisses), [0, 1])
  assert.deepEqual(detail.states.map((state) => state.lastExplosionAttackNumber), [1, null])
  assertClose(detail.states[0].stateProbability, 0.015)
  assertClose(detail.states[0].explosionChancePercent, 1.5)
  assertClose(detail.states[0].contributionProbability, 0.000225)
  assertClose(detail.states[1].stateProbability, 0.985)
  assertClose(detail.states[1].explosionChancePercent, 3)
  assertClose(detail.states[1].contributionProbability, 0.02955)
  assertClose(detail.explosionChancePercent, 2.9775)
})

test('3回目は同じ直近爆発回を持つ複数の履歴をまとめる', () => {
  const detail = requireDetail(3)
  assert.deepEqual(detail.states.map((state) => state.lastExplosionAttackNumber), [2, 1, null])
  // 2回目に爆発する履歴は「爆発→爆発」と「不発→爆発」の2通り。
  assertClose(detail.states[0].stateProbability, 0.015 * 0.015 + 0.985 * 0.03)
  assertClose(detail.states[1].stateProbability, 0.015 * 0.985)
  assertClose(detail.states[2].stateProbability, 0.985 * 0.97)
  assertClose(detail.states[0].contributionProbability, 0.000446625)
  assertClose(detail.states[1].contributionProbability, 0.00044325)
  assertClose(detail.states[2].contributionProbability, 0.04299525)
  assertClose(detail.explosionChancePercent, 4.3885125)
})

test('28回目の全28状態を合算すると10.092141426420435%になる', () => {
  const detail = requireDetail(28)
  assert.equal(detail.states.length, 28)
  assert.equal(detail.states[0].lastExplosionAttackNumber, 27)
  assert.equal(detail.states.at(-1)?.lastExplosionAttackNumber, null)
  assertClose(detail.states.reduce((sum, state) => sum + state.stateProbability, 0), 1)
  assertClose(detail.explosionChancePercent, 10.092141426420435)
})

test('詳細の状態確率を保存し、1000回目まで攻撃テーブルの確率と一致する', () => {
  const rows = buildGoldenglowSkillAttackTable({ model, attackInterval: 1, duration: 1000, explosionDamage: 1 })
  const selectedAttacks = [...Array.from({ length: 100 }, (_, index) => index + 1), 500, 1000]
  for (const attackNumber of selectedAttacks) {
    const detail = requireDetail(attackNumber)
    assertClose(detail.states.reduce((sum, state) => sum + state.stateProbability, 0), 1)
    assertClose(detail.explosionChancePercent, rows[attackNumber - 1].explosionChancePercent)
    assertClose(detail.states.reduce((sum, state) => sum + state.contributionProbability, 0) * 100, detail.explosionChancePercent)
    assert.ok(detail.states.every((state) => state.stateProbability > 0 && state.stateProbability <= 1))
    assert.ok(detail.states.every((state) => state.consecutiveMisses <= Math.min(40, attackNumber - 1)))
    assert.deepEqual(detail.states.map((state) => state.consecutiveMisses), detail.states.map((_, index) => index))
  }
})

test('41回目の確定爆発を超えて一度も爆発しない状態は存在しない', () => {
  const beforeGuarantee = requireDetail(41)
  const neverExploded = beforeGuarantee.states.find((state) => state.lastExplosionAttackNumber === null)
  assert.ok(neverExploded)
  assert.equal(neverExploded.consecutiveMisses, 40)
  assert.equal(neverExploded.explosionChancePercent, 100)
  assert.equal(neverExploded.contributionProbability, neverExploded.stateProbability)

  const afterGuarantee = requireDetail(42)
  assert.ok(afterGuarantee.states.every((state) => state.lastExplosionAttackNumber !== null))
  assert.equal(afterGuarantee.states.at(-1)?.lastExplosionAttackNumber, 1)
  assert.equal(afterGuarantee.states.at(-1)?.consecutiveMisses, 40)
})

test('確定爆発だけのモデルは到達できる単一状態と直近爆発回を返す', () => {
  const deterministic = { prdStep: 0, prdMaxStack: 2 }
  for (let attackNumber = 1; attackNumber <= 10; attackNumber += 1) {
    const detail = buildGoldenglowAttackProbabilityDetail(deterministic, attackNumber)
    assert.ok(detail)
    const lastExplosion = Math.floor((attackNumber - 1) / 3) * 3
    const chance = attackNumber % 3 === 0 ? 100 : 0
    assert.deepEqual(detail.states, [{
      consecutiveMisses: (attackNumber - 1) % 3,
      lastExplosionAttackNumber: lastExplosion || null,
      stateProbability: 1,
      explosionChancePercent: chance,
      contributionProbability: chance / 100,
    }])
    assert.equal(detail.explosionChancePercent, chance)
  }
})

test('毎回確定爆発する場合は不発状態を表示しない', () => {
  const detail = buildGoldenglowAttackProbabilityDetail({ prdStep: 1, prdMaxStack: 40 }, 1000)
  assert.ok(detail)
  assert.deepEqual(detail.states, [{
    consecutiveMisses: 0,
    lastExplosionAttackNumber: 999,
    stateProbability: 1,
    explosionChancePercent: 100,
    contributionProbability: 1,
  }])
  assert.equal(detail.explosionChancePercent, 100)
})

test('選択回数が整数1〜1000の範囲外なら詳細を返さない', () => {
  for (const attackNumber of [0, -1, 1.5, 1001, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.equal(buildGoldenglowAttackProbabilityDetail(model, attackNumber), null)
  }
})

test('不正なPRDモデルを拒否する', () => {
  for (const invalid of [
    { prdStep: -1, prdMaxStack: 40 },
    { prdStep: Number.NaN, prdMaxStack: 40 },
    { prdStep: Number.POSITIVE_INFINITY, prdMaxStack: 40 },
    { prdStep: 0.015, prdMaxStack: 0 },
    { prdStep: 0.015, prdMaxStack: 1.5 },
    { prdStep: 0.015, prdMaxStack: 1001 },
    { prdStep: 0.015, prdMaxStack: Number.NaN },
  ]) {
    assert.equal(buildGoldenglowAttackProbabilityDetail(invalid, 28), null)
  }
})

function requireDetail(attackNumber: number) {
  const detail = buildGoldenglowAttackProbabilityDetail(model, attackNumber)
  assert.ok(detail)
  return detail
}

function assertClose(actual: number, expected: number): void {
  const tolerance = 1e-11 * Math.max(1, Math.abs(expected))
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be close to ${expected}`)
}
