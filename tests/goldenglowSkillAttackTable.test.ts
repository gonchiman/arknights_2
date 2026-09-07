import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildGoldenglowSkillAttackTable,
  MAX_GOLDENGLOW_SKILL_ATTACK_ROWS,
  type GoldenglowSkillAttackTableInput,
} from '../src/lib/goldenglowSkillAttackTable.ts'

const example: GoldenglowSkillAttackTableInput = {
  model: { prdStep: 0.015, prdMaxStack: 40 },
  attackInterval: 1.3,
  duration: 30,
  explosionDamage: 1173,
}

test('30秒・1.3秒間隔の表は初回1.3秒から23回分を表示する', () => {
  const rows = buildGoldenglowSkillAttackTable(example)
  assert.equal(rows.length, 23)
  assert.equal(rows[0].attackNumber, 1)
  assert.equal(rows[0].elapsedSeconds, 1.3)
  assertClose(rows[0].explosionChancePercent, 1.5)
  assertClose(rows[0].expectedExplosionCount, 0.015)
  assertClose(rows[0].expectedExplosionDamage, 17.595)
  assert.equal(rows[22].attackNumber, 23)
  assertClose(rows[22].elapsedSeconds, 29.9)
  assertClose(rows[22].explosionChancePercent, 10.048307430950606)
  assertClose(rows[22].expectedExplosionCount, 1.9991622022478368)
  assertClose(rows[22].expectedExplosionDamage, 2345.0172632367126)
})

test('2回目の確率は初回爆発後のリセットも含む', () => {
  const second = buildGoldenglowSkillAttackTable(example)[1]
  // 1回目に爆発した枝: 0.015 × 0.015、しなかった枝: 0.985 × 0.03。
  assertClose(second.explosionChancePercent, 2.9775)
  assertClose(second.expectedExplosionCount, 0.044775)
  assertClose(second.expectedExplosionDamage, 52.521075)
})

test('すべての爆発・不発の分岐を列挙した確率と各行が一致する', () => {
  const rows = buildGoldenglowSkillAttackTable({
    ...example,
    model: { prdStep: 0.2, prdMaxStack: 2 },
    attackInterval: 1,
    duration: 8,
  })
  let branches = [{ probability: 1, misses: 0, explosions: 0 }]
  for (const row of rows) {
    let currentExplosionProbability = 0
    branches = branches.flatMap((branch) => {
      const chance = branch.misses >= 2 ? 1 : 0.2 * (branch.misses + 1)
      const explosionProbability = branch.probability * chance
      currentExplosionProbability += explosionProbability
      return [
        { probability: explosionProbability, misses: 0, explosions: branch.explosions + 1 },
        { probability: branch.probability * (1 - chance), misses: branch.misses + 1, explosions: branch.explosions },
      ].filter((next) => next.probability > 0)
    })
    const expectedCount = branches.reduce((sum, branch) => sum + branch.probability * branch.explosions, 0)
    assertClose(row.explosionChancePercent, currentExplosionProbability * 100)
    assertClose(row.expectedExplosionCount, expectedCount)
    assertClose(row.expectedExplosionDamage, expectedCount * example.explosionDamage)
  }
})

test('確定爆発だけのモデルは3・6・9回目に爆発してリセットする', () => {
  const rows = buildGoldenglowSkillAttackTable({
    ...example,
    model: { prdStep: 0, prdMaxStack: 2 },
    attackInterval: 1,
    duration: 10,
    explosionDamage: 100,
  })
  assert.deepEqual(rows.map((row) => row.explosionChancePercent), [0, 0, 100, 0, 0, 100, 0, 0, 100, 0])
  assert.deepEqual(rows.map((row) => row.expectedExplosionCount), [0, 0, 1, 1, 1, 2, 2, 2, 3, 3])
  assert.deepEqual(rows.map((row) => row.expectedExplosionDamage), [0, 0, 100, 100, 100, 200, 200, 200, 300, 300])
})

test('毎回確定爆発なら攻撃回数と期待爆発回数が一致する', () => {
  const rows = buildGoldenglowSkillAttackTable({ ...example, model: { prdStep: 1, prdMaxStack: 40 } })
  for (const row of rows) {
    assert.equal(row.explosionChancePercent, 100)
    assert.equal(row.expectedExplosionCount, row.attackNumber)
    assert.equal(row.expectedExplosionDamage, row.attackNumber * example.explosionDamage)
  }
})

test('期間末尾の端数攻撃は計上せず、終了時刻ちょうどの攻撃は含む', () => {
  const partial = buildGoldenglowSkillAttackTable({ ...example, attackInterval: 1, duration: 1.9 })
  const exact = buildGoldenglowSkillAttackTable({ ...example, attackInterval: 1, duration: 2 })
  assert.equal(partial.length, 1)
  assert.equal(exact.length, 2)
  assert.equal(exact[1].elapsedSeconds, 2)
  assert.deepEqual(buildGoldenglowSkillAttackTable({ ...example, duration: 1 }), [])
})

test('小数境界の誤差で攻撃を失わず、実際に終了後の攻撃は含めない', () => {
  const exact = buildGoldenglowSkillAttackTable({ ...example, attackInterval: 0.1, duration: 0.3 })
  assert.equal(exact.length, 3)
  assert.equal(exact[2].elapsedSeconds, 0.3)
  const before = buildGoldenglowSkillAttackTable({ ...example, attackInterval: 0.1, duration: 0.3 - 1e-12 })
  assert.equal(before.length, 2)
})

test('攻撃数が極端に多い場合も最大1000行で止める', () => {
  for (const attackInterval of [1, Number.MIN_VALUE]) {
    const rows = buildGoldenglowSkillAttackTable({ ...example, attackInterval, duration: 2000 })
    assert.equal(rows.length, MAX_GOLDENGLOW_SKILL_ATTACK_ROWS)
    assert.equal(rows.at(-1)?.attackNumber, 1000)
    assert.ok(rows.every((row) => row.elapsedSeconds <= 2000))
  }
})

test('不正な攻撃間隔・時間は空の表を返す', () => {
  for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.deepEqual(buildGoldenglowSkillAttackTable({ ...example, attackInterval: invalid }), [])
    assert.deepEqual(buildGoldenglowSkillAttackTable({ ...example, duration: invalid }), [])
  }
})

test('不正な単発ダメージは0にし、爆発確率と回数は計算する', () => {
  for (const invalid of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const rows = buildGoldenglowSkillAttackTable({ ...example, explosionDamage: invalid })
    assert.equal(rows.length, 23)
    assert.ok(rows.every((row) => row.expectedExplosionDamage === 0))
    assertClose(rows[22].expectedExplosionCount, 1.9991622022478368)
  }
})

test('不正なPRDモデルを拒否して無制限の計算を防ぐ', () => {
  for (const model of [
    { prdStep: -1, prdMaxStack: 40 },
    { prdStep: Number.NaN, prdMaxStack: 40 },
    { prdStep: Number.POSITIVE_INFINITY, prdMaxStack: 40 },
    { prdStep: 0.015, prdMaxStack: 0 },
    { prdStep: 0.015, prdMaxStack: 1.5 },
    { prdStep: 0.015, prdMaxStack: 1001 },
    { prdStep: 0.015, prdMaxStack: Number.POSITIVE_INFINITY },
  ]) {
    assert.deepEqual(buildGoldenglowSkillAttackTable({ ...example, model }), [])
  }
})

function assertClose(actual: number, expected: number): void {
  const tolerance = 1e-11 * Math.max(1, Math.abs(expected))
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be close to ${expected}`)
}
