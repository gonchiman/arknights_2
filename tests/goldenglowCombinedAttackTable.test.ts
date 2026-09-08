import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildGoldenglowCombinedAttackTable,
  summarizeGoldenglowCombinedAttackTable,
  type GoldenglowCombinedAttackTableInput,
} from '../src/lib/goldenglowCombinedAttackTable.ts'
import { MAX_GOLDENGLOW_SKILL_ATTACK_ROWS } from '../src/lib/goldenglowSkillAttackTable.ts'

const example: GoldenglowCombinedAttackTableInput = {
  model: {
    prdStep: 0.015,
    prdMaxStack: 40,
    droneInitialAttackScale: 0.2,
    droneAttackScaleStep: 0.15,
    droneMaxAttackScale: 1.1,
    droneMaxStack: 6,
    activeDroneCount: 3,
  },
  skillIndex: 3,
  attack: 703,
  attackInterval: 1.3,
  duration: 30,
  resistance: 0,
  resistanceIgnore: 15,
  explosionDamage: 2109,
}

test('S3は本体の攻撃を加えず、浮遊ユニット3体の通常攻撃と爆発を合計する', () => {
  const before = structuredClone(example)
  const rows = buildGoldenglowCombinedAttackTable(example)
  const first = rows[0]
  assert.equal(rows.length, 23)
  assert.equal(first.bodyAttackEnabled, false)
  assert.equal(first.bodyDamage.result, 703)
  assert.equal(first.expectedBodyDamage, 0)
  assert.equal(first.droneCount, 3)
  assertClose(first.expectedDroneNormalDamage, 415.473)
  assertClose(first.expectedExplosionDamage, 94.905)
  assertClose(first.expectedTotalDamage, 510.378)
  assertClose(first.cumulativeExpectedTotalDamage, 510.378)
  assertClose(rows.at(-1)!.elapsedSeconds, 29.9)
  assert.deepEqual(example, before)
})

test('S1・S2は浮遊ユニットの爆発とは独立に本体の通常攻撃を毎回加える', () => {
  for (const preset of [
    { skillIndex: 1, attack: 547, attackInterval: 0.867, duration: 25, explosionDamage: 1641, count: 28, firstTotal: 811.748 },
    { skillIndex: 2, attack: 625, attackInterval: 1.3, duration: 30, explosionDamage: 1875, count: 23, firstTotal: 927.5 },
  ]) {
    const rows = buildGoldenglowCombinedAttackTable({ ...example, ...preset, model: { ...example.model, activeDroneCount: 2 } })
    assert.equal(rows.length, preset.count)
    assert.ok(rows.every((row) => row.bodyAttackEnabled && row.expectedBodyDamage === preset.attack))
    assertClose(rows[0].expectedTotalDamage, preset.firstTotal)
  }
})

test('使用する浮遊ユニット数はスキル番号に固定せず渡された数値を使う', () => {
  const one = buildGoldenglowCombinedAttackTable({ ...example, skillIndex: 1, model: { ...example.model, activeDroneCount: 1 } })
  const four = buildGoldenglowCombinedAttackTable({ ...example, skillIndex: 1, model: { ...example.model, activeDroneCount: 4 } })
  for (const [index, row] of four.entries()) {
    assert.equal(row.droneCount, 4)
    assert.equal(row.expectedBodyDamage, one[index].expectedBodyDamage)
    assertClose(row.expectedDroneNormalDamage, one[index].expectedDroneNormalDamage * 4)
    assertClose(row.expectedExplosionDamage, one[index].expectedExplosionDamage * 4)
    assertClose(row.expectedTotalDamage, one[index].expectedBodyDamage + (one[index].expectedTotalDamage - one[index].expectedBodyDamage) * 4)
  }
})

test('2体の爆発・不発履歴を独立に全列挙した6回分の累計と一致する', () => {
  const rows = buildGoldenglowCombinedAttackTable({
    ...example,
    model: { ...example.model, prdStep: 0.2, prdMaxStack: 2, activeDroneCount: 2 },
    skillIndex: 1,
    attack: 100,
    attackInterval: 1,
    duration: 6,
    resistance: 60,
    resistanceIgnore: 15,
    explosionDamage: 165,
  })
  let branches = [{ probability: 1, misses: [0, 0], totalDamage: 0 }]
  let previousExpectedTotal = 0
  for (const [index, row] of rows.entries()) {
    const normalDamage = Math.min(110, 20 + index * 15) * 0.55
    branches = branches.flatMap((branch) => {
      const chanceA = branch.misses[0] >= 2 ? 1 : 0.2 * (branch.misses[0] + 1)
      const chanceB = branch.misses[1] >= 2 ? 1 : 0.2 * (branch.misses[1] + 1)
      return [false, true].flatMap((explodeA) => [false, true].map((explodeB) => ({
        probability: branch.probability * (explodeA ? chanceA : 1 - chanceA) * (explodeB ? chanceB : 1 - chanceB),
        misses: [explodeA ? 0 : branch.misses[0] + 1, explodeB ? 0 : branch.misses[1] + 1],
        totalDamage: branch.totalDamage + 55 + (explodeA ? 165 : normalDamage) + (explodeB ? 165 : normalDamage),
      }))).filter((branch) => branch.probability > 0)
    })
    const expectedTotal = branches.reduce((sum, branch) => sum + branch.probability * branch.totalDamage, 0)
    assertClose(row.expectedTotalDamage, expectedTotal - previousExpectedTotal)
    assertClose(row.cumulativeExpectedTotalDamage, expectedTotal)
    previousExpectedTotal = expectedTotal
  }
})

test('確定爆発の回に通常攻撃を二重計上せず、次回の特性倍率と本体攻撃を維持する', () => {
  const rows = buildGoldenglowCombinedAttackTable({
    ...example,
    model: { ...example.model, prdStep: 0, prdMaxStack: 2, activeDroneCount: 2 },
    skillIndex: 1,
    attack: 100,
    attackInterval: 1,
    duration: 4,
    explosionDamage: 300,
  })
  assert.equal(rows[2].expectedDroneNormalDamage, 0)
  assert.equal(rows[2].expectedExplosionDamage, 600)
  assert.equal(rows[2].expectedBodyDamage, 100)
  assert.equal(rows[2].expectedTotalDamage, 700)
  assertClose(rows[3].normalAttack.attackScalePercent, 65)
  assertClose(rows[3].expectedDroneNormalDamage, 130)
  assertClose(rows[3].expectedTotalDamage, 230)
})

test('本体・通常攻撃は術耐性と最低保証を適用し、渡された爆発ダメージを再軽減しない', () => {
  const resisted = buildGoldenglowCombinedAttackTable({
    ...example, skillIndex: 1, resistance: 60, explosionDamage: 7.125,
  })[0]
  assert.equal(resisted.bodyDamage.appliedResistance, 45)
  assertClose(resisted.expectedBodyDamage, 703 * 0.55)
  assertClose(resisted.expectedDroneNormalDamage, 415.473 * 0.55)
  assertClose(resisted.expectedExplosionDamage, 7.125 * 0.015 * 3)
  const minimum = buildGoldenglowCombinedAttackTable({
    ...example, skillIndex: 2, resistance: 100, resistanceIgnore: 0, explosionDamage: 0,
  })[0]
  assert.equal(minimum.bodyDamage.minimumApplied, true)
  assertClose(minimum.expectedBodyDamage, 703 * 0.05)
  assertClose(minimum.expectedDroneNormalDamage, 415.473 * 0.05)
  assert.equal(minimum.expectedExplosionDamage, 0)
})

test('明示した攻撃力と爆発ダメージをそれぞれ使い、攻撃力0も受け付ける', () => {
  const first = buildGoldenglowCombinedAttackTable({ ...example, skillIndex: 1, attack: 100.25, explosionDamage: 123.456 })[0]
  assert.equal(first.expectedBodyDamage, 100.25)
  assertClose(first.expectedDroneNormalDamage, 100.25 * 0.2 * 0.985 * 3)
  assertClose(first.expectedExplosionDamage, 123.456 * 0.015 * 3)
  const zero = buildGoldenglowCombinedAttackTable({ ...example, attack: 0, explosionDamage: 0 })
  assert.equal(zero.length, 23)
  assert.ok(zero.every((row) => row.expectedTotalDamage === 0 && row.cumulativeExpectedTotalDamage === 0))
})

test('合計と累計を丸めず、表示用の丸めを各攻撃の計算に持ち込まない', () => {
  const rows = buildGoldenglowCombinedAttackTable({ ...example, attack: 701.1234567, explosionDamage: 2001.7654321 })
  let sum = 0
  for (const row of rows) {
    assert.equal(row.expectedTotalDamage, row.expectedBodyDamage + row.expectedDroneNormalDamage + row.expectedExplosionDamage)
    sum += row.expectedTotalDamage
    assert.equal(row.cumulativeExpectedTotalDamage, sum)
  }
  assert.notEqual(sum, rows.reduce((total, row) => total + Math.round(row.expectedTotalDamage * 1000) / 1000, 0))
})

test('期間末尾の端数を含めず、小数境界と最大行数を通常攻撃表と共有する', () => {
  assert.equal(buildGoldenglowCombinedAttackTable({ ...example, duration: 1 }).length, 0)
  assert.equal(buildGoldenglowCombinedAttackTable({ ...example, attackInterval: 1, duration: 1.9 }).length, 1)
  const exact = buildGoldenglowCombinedAttackTable({ ...example, attackInterval: 0.1, duration: 0.3 })
  assert.equal(exact.length, 3)
  assert.equal(exact[2].elapsedSeconds, 0.3)
  assert.equal(buildGoldenglowCombinedAttackTable({ ...example, attackInterval: 0.1, duration: 0.3 - 1e-12 }).length, 2)
  assert.equal(buildGoldenglowCombinedAttackTable({ ...example, attackInterval: Number.MIN_VALUE }).length, MAX_GOLDENGLOW_SKILL_ATTACK_ROWS)
})

test('不正なスキル・浮遊ユニット数・爆発ダメージと継承した入力条件を拒否する', () => {
  for (const skillIndex of [0, 4, 1.5, NaN, Infinity]) {
    assert.deepEqual(buildGoldenglowCombinedAttackTable({ ...example, skillIndex }), [])
  }
  for (const activeDroneCount of [0, -1, 1.5, NaN, Infinity]) {
    assert.deepEqual(buildGoldenglowCombinedAttackTable({ ...example, model: { ...example.model, activeDroneCount } }), [])
  }
  for (const explosionDamage of [-1, NaN, Infinity]) {
    assert.deepEqual(buildGoldenglowCombinedAttackTable({ ...example, explosionDamage }), [])
  }
  for (const patch of [
    { attack: -1 }, { resistance: NaN }, { resistanceIgnore: Infinity }, { attackInterval: 0 }, { duration: -1 },
    { model: { ...example.model, prdStep: -1 } },
    { model: { ...example.model, droneMaxStack: 1.5 } },
  ]) assert.deepEqual(buildGoldenglowCombinedAttackTable({ ...example, ...patch }), [])
})

test('S3の集計結果は各ダメージの内訳と最終行の累計を保ち、30秒全体でDPSを求める', () => {
  const rows = buildGoldenglowCombinedAttackTable(example)
  const before = structuredClone(rows)
  const summary = summarizeGoldenglowCombinedAttackTable(rows, 30)
  assert.equal(summary.expectedBodyDamage, 0)
  assertClose(summary.expectedDroneNormalDamage, 42329.87855787044)
  assertClose(summary.expectedExplosionDamage, 12648.69925362206)
  assert.equal(summary.expectedTotalDamage, rows.at(-1)!.cumulativeExpectedTotalDamage)
  assertClose(summary.expectedTotalDamage, 54978.577811492505)
  assertClose(summary.expectedDps!, 1832.6192603830834)
  assert.equal(summary.expectedDps, summary.expectedTotalDamage / 30)
  assert.notEqual(summary.expectedDps, summary.expectedTotalDamage / rows.at(-1)!.elapsedSeconds)
  assert.deepEqual(rows, before)
})

test('S1の集計に本体28回分を含め、各ダメージの内訳と合計を対応させる', () => {
  const input = {
    ...example,
    model: { ...example.model, activeDroneCount: 2 },
    skillIndex: 1, attack: 547, attackInterval: 0.867, duration: 25, explosionDamage: 1641,
  }
  const rows = buildGoldenglowCombinedAttackTable(input)
  const summary = summarizeGoldenglowCombinedAttackTable(rows, input.duration)
  assert.equal(summary.expectedBodyDamage, 15316)
  assertClose(summary.expectedDroneNormalDamage, 27368.399685469056)
  assertClose(summary.expectedExplosionDamage, 8214.923185817017)
  assert.equal(summary.expectedTotalDamage, rows.at(-1)!.cumulativeExpectedTotalDamage)
  assertClose(summary.expectedTotalDamage, 50899.322871286065)
  assertClose(summary.expectedDps!, 2035.9729148514425)
})

test('S2の短い表示時間でもその時間内の攻撃だけを集計し、指定した表示時間で割る', () => {
  const input = {
    ...example,
    model: { ...example.model, activeDroneCount: 2 },
    skillIndex: 2, attack: 625, duration: 3, explosionDamage: 1875,
  }
  const rows = buildGoldenglowCombinedAttackTable(input)
  assert.equal(rows.length, 2)
  const summary = summarizeGoldenglowCombinedAttackTable(rows, input.duration)
  assert.equal(summary.expectedBodyDamage, 1250)
  assertClose(summary.expectedDroneNormalDamage, 670.7234375)
  assertClose(summary.expectedExplosionDamage, 167.90625)
  assertClose(summary.expectedTotalDamage, 2088.6296875)
  assert.equal(summary.expectedTotalDamage, rows.at(-1)!.cumulativeExpectedTotalDamage)
  assertClose(summary.expectedDps!, 696.2098958333334)
})

test('空の表は合計0となり、0秒や不正な時間ではDPSを算出しない', () => {
  assert.deepEqual(summarizeGoldenglowCombinedAttackTable([], 1), {
    expectedBodyDamage: 0,
    expectedDroneNormalDamage: 0,
    expectedExplosionDamage: 0,
    expectedTotalDamage: 0,
    expectedDps: 0,
  })
  const rows = buildGoldenglowCombinedAttackTable(example)
  for (const duration of [0, -1, NaN, Infinity, -Infinity]) {
    const empty = summarizeGoldenglowCombinedAttackTable([], duration)
    assert.equal(empty.expectedTotalDamage, 0)
    assert.equal(empty.expectedDps, null)
    const populated = summarizeGoldenglowCombinedAttackTable(rows, duration)
    assert.equal(populated.expectedTotalDamage, rows.at(-1)!.cumulativeExpectedTotalDamage)
    assert.equal(populated.expectedDps, null)
  }
})

function assertClose(actual: number, expected: number): void {
  const tolerance = 1e-11 * Math.max(1, Math.abs(expected))
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be close to ${expected}`)
}
