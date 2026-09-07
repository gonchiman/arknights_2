import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildGoldenglowNormalAttackTable,
  type GoldenglowNormalAttackTableInput,
} from '../src/lib/goldenglowNormalAttackTable.ts'
import { buildGoldenglowSkillAttackTable, MAX_GOLDENGLOW_SKILL_ATTACK_ROWS } from '../src/lib/goldenglowSkillAttackTable.ts'

const example: GoldenglowNormalAttackTableInput = {
  model: {
    prdStep: 0.015,
    prdMaxStack: 40,
    droneInitialAttackScale: 0.2,
    droneAttackScaleStep: 0.15,
    droneMaxAttackScale: 1.1,
    droneMaxStack: 6,
  },
  attack: 703,
  attackInterval: 1.3,
  duration: 30,
  resistance: 0,
  resistanceIgnore: 15,
}

test('S3の条件では23回分を作り、初回20%の通常攻撃を不発確率98.5%で重み付けする', () => {
  const before = structuredClone(example)
  const rows = buildGoldenglowNormalAttackTable(example)
  assert.equal(rows.length, 23)
  assert.equal(rows[0].attackNumber, 1)
  assert.equal(rows[0].elapsedSeconds, 1.3)
  assertClose(rows[0].attackScalePercent, 20)
  assertClose(rows[0].damage.result, 140.6)
  assertClose(rows[0].normalChancePercent, 98.5)
  assertClose(rows[0].expectedNormalDamage, 138.491)
  assertClose(rows[0].cumulativeExpectedNormalDamage, 138.491)
  assertClose(rows.at(-1)!.elapsedSeconds, 29.9)
  for (const [index, row] of rows.entries()) {
    assertClose(row.attackScalePercent, index < 6 ? 20 + index * 15 : 110)
  }
  assert.deepEqual(example, before)
})

test('通常攻撃確率は爆発テーブルの補数で、各行の期待ダメージを丸めずに累積する', () => {
  const input = { ...example, duration: 130 }
  const rows = buildGoldenglowNormalAttackTable(input)
  const explosions = buildGoldenglowSkillAttackTable({ ...input, explosionDamage: 0 })
  let sum = 0
  for (const [index, row] of rows.entries()) {
    assert.equal(row.explosionChancePercent, explosions[index].explosionChancePercent)
    assertClose(row.normalChancePercent + row.explosionChancePercent, 100)
    assertClose(row.expectedNormalDamage, row.damage.result * (1 - explosions[index].explosionChancePercent / 100))
    sum += row.expectedNormalDamage
    assert.equal(row.cumulativeExpectedNormalDamage, sum)
  }
})

test('3回目の確定爆発後も4回目は特性65%となり、特性倍率をリセットしない', () => {
  const rows = buildGoldenglowNormalAttackTable({
    ...example,
    model: { ...example.model, prdStep: 0, prdMaxStack: 2 },
    attackInterval: 1,
    duration: 10,
  })
  assert.deepEqual(rows.map((row) => row.normalChancePercent), [100, 100, 0, 100, 100, 0, 100, 100, 0, 100])
  assert.equal(rows[2].expectedNormalDamage, 0)
  assertClose(rows[3].attackScalePercent, 65)
  assertClose(rows[3].expectedNormalDamage, 456.95)
  assertClose(rows[6].attackScalePercent, 110)
  assert.equal(rows[2].cumulativeExpectedNormalDamage, rows[1].cumulativeExpectedNormalDamage)
})

test('毎回爆発する場合は通常攻撃ダメージと累計がすべて0になる', () => {
  const rows = buildGoldenglowNormalAttackTable({ ...example, model: { ...example.model, prdStep: 1 } })
  assert.equal(rows.length, 23)
  assert.ok(rows.every((row) => row.normalChancePercent === 0
    && row.expectedNormalDamage === 0 && row.cumulativeExpectedNormalDamage === 0))
  assertClose(rows[6].attackScalePercent, 110)
})

test('爆発・不発の全履歴を独立に列挙した8回分の期待通常ダメージと一致する', () => {
  const rows = buildGoldenglowNormalAttackTable({
    ...example,
    model: { ...example.model, prdStep: 0.2, prdMaxStack: 2 },
    attack: 100,
    attackInterval: 1,
    duration: 8,
    resistance: 60,
    resistanceIgnore: 15,
  })
  let branches = [{ probability: 1, misses: 0, totalDamage: 0 }]
  let previousExpectedTotal = 0
  for (const [index, row] of rows.entries()) {
    const normalDamage = Math.min(110, 20 + index * 15) * 0.55
    branches = branches.flatMap((branch) => {
      const chance = branch.misses >= 2 ? 1 : 0.2 * (branch.misses + 1)
      return [
        { probability: branch.probability * chance, misses: 0, totalDamage: branch.totalDamage },
        { probability: branch.probability * (1 - chance), misses: branch.misses + 1, totalDamage: branch.totalDamage + normalDamage },
      ].filter((branch) => branch.probability > 0)
    })
    const expectedTotal = branches.reduce((sum, branch) => sum + branch.probability * branch.totalDamage, 0)
    assertClose(row.expectedNormalDamage, expectedTotal - previousExpectedTotal)
    assertClose(row.cumulativeExpectedNormalDamage, expectedTotal)
    previousExpectedTotal = expectedTotal
  }
})

test('術耐性・術耐性無視・最低保証を適用し、攻撃力0も有効な入力として扱う', () => {
  const resisted = buildGoldenglowNormalAttackTable({ ...example, resistance: 60 })[0]
  assert.equal(resisted.damage.appliedResistance, 45)
  assertClose(resisted.damage.result, 140.6 * 0.55)
  assertClose(resisted.expectedNormalDamage, 140.6 * 0.55 * 0.985)
  const minimum = buildGoldenglowNormalAttackTable({ ...example, resistance: 100, resistanceIgnore: 0 })[0]
  assert.equal(minimum.damage.minimumApplied, true)
  assertClose(minimum.damage.result, 140.6 * 0.05)
  assertClose(minimum.expectedNormalDamage, 140.6 * 0.05 * 0.985)
  const zero = buildGoldenglowNormalAttackTable({ ...example, attack: 0 })
  assert.equal(zero.length, 23)
  assert.ok(zero.every((row) => row.damage.result === 0 && row.cumulativeExpectedNormalDamage === 0))
})

test('特性の初期値・増分・上限・最大スタックは渡されたモデルから読む', () => {
  const rows = buildGoldenglowNormalAttackTable({
    ...example,
    model: { ...example.model, droneInitialAttackScale: 0.3, droneAttackScaleStep: 0.25, droneMaxAttackScale: 1.2, droneMaxStack: 2 },
    attackInterval: 1,
    duration: 4,
  })
  for (const [index, row] of rows.entries()) assertClose(row.attackScalePercent, [30, 55, 80, 80][index])
})

test('共通の攻撃テーブルと同じ終了時刻・小数境界・最大行数の条件を使う', () => {
  assert.equal(buildGoldenglowNormalAttackTable({ ...example, attackInterval: 1, duration: 1.9 }).length, 1)
  assert.equal(buildGoldenglowNormalAttackTable({ ...example, attackInterval: 1, duration: 2 }).length, 2)
  assert.equal(buildGoldenglowNormalAttackTable({ ...example, duration: 1 }).length, 0)
  const exact = buildGoldenglowNormalAttackTable({ ...example, attackInterval: 0.1, duration: 0.3 })
  assert.equal(exact.length, 3)
  assert.equal(exact[2].elapsedSeconds, 0.3)
  assert.equal(buildGoldenglowNormalAttackTable({ ...example, attackInterval: 0.1, duration: 0.3 - 1e-12 }).length, 2)
  const capped = buildGoldenglowNormalAttackTable({ ...example, attackInterval: Number.MIN_VALUE, duration: 2000 })
  assert.equal(capped.length, MAX_GOLDENGLOW_SKILL_ATTACK_ROWS)
  assert.ok(capped.every((row) => Number.isFinite(row.cumulativeExpectedNormalDamage)))
})

test('不正な時間・数値条件・PRD・特性設定を拒否する', () => {
  for (const invalid of [0, -1, NaN, Infinity]) {
    assert.deepEqual(buildGoldenglowNormalAttackTable({ ...example, attackInterval: invalid }), [])
    assert.deepEqual(buildGoldenglowNormalAttackTable({ ...example, duration: invalid }), [])
  }
  for (const key of ['attack', 'resistance', 'resistanceIgnore'] as const) {
    for (const invalid of [-1, NaN, Infinity]) {
      assert.deepEqual(buildGoldenglowNormalAttackTable({ ...example, [key]: invalid }), [])
    }
  }
  for (const model of [
    { ...example.model, prdStep: -1 },
    { ...example.model, prdMaxStack: 1001 },
    { ...example.model, droneInitialAttackScale: NaN },
    { ...example.model, droneInitialAttackScale: 2 },
    { ...example.model, droneAttackScaleStep: -1 },
    { ...example.model, droneMaxAttackScale: Infinity },
    { ...example.model, droneMaxStack: -1 },
    { ...example.model, droneMaxStack: 1.5 },
  ]) assert.deepEqual(buildGoldenglowNormalAttackTable({ ...example, model }), [])
})

function assertClose(actual: number, expected: number): void {
  const tolerance = 1e-11 * Math.max(1, Math.abs(expected))
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be close to ${expected}`)
}
