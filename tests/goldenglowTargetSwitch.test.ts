import test from 'node:test'
import assert from 'node:assert/strict'
import {
  GOLDENGLOW_TARGET_SWITCH_LIMITS,
  prepareGoldenglowTargetSwitchSimulation,
  runGoldenglowRetargetingTrial,
  simulateGoldenglowTargetSwitch,
  simulateGoldenglowTargetSwitchTrial,
  type GoldenglowTargetSwitchInput,
} from '../src/lib/goldenglowTargetSwitch.ts'
import type { GoldenglowExplosionModel } from '../src/lib/goldenglowExplosion.ts'

const model: GoldenglowExplosionModel = {
  talentName: '電流暴走',
  talentDescription: '',
  damageType: 'ARTS',
  attackScale: 3,
  attackScalePercent: 300,
  nominalChancePercent: 10,
  prdStep: 0,
  prdMaxStack: 1_000,
  additionalDroneCount: 0,
  activeDroneCount: 1,
  resistanceIgnoreFixed: 0,
  droneInitialAttackScale: 0.2,
  droneInitialAttackScalePercent: 20,
  droneAttackScaleStep: 0.15,
  droneAttackScaleStepPercent: 15,
  droneMaxAttackScale: 1.1,
  droneMaxAttackScalePercent: 110,
  droneMaxStack: 6,
}

function input(overrides: Partial<GoldenglowTargetSwitchInput> = {}): GoldenglowTargetSwitchInput {
  return {
    model,
    skillIndex: 3,
    effectiveAttack: 100,
    attackInterval: 1,
    duration: 5,
    enemyHp: 60,
    enemyDefense: 0,
    enemyResistance: 0,
    switchDelay: 0,
    trials: 10,
    seed: 42,
    ...overrides,
  }
}

function close(actual: number, expected: number, tolerance = 1e-9): void {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
    `expected ${expected}, received ${actual}`)
}

function sequence(values: number[]): () => number {
  let index = 0
  return () => {
    assert.ok(index < values.length, 'RNG sequence exhausted')
    return values[index++]
  }
}

test('撃破で通常倍率を初期化し、残りHPを超えたダメージは次の敵へ渡さない', () => {
  const result = simulateGoldenglowTargetSwitch(input())
  assert.deepEqual(result.sample.trace.map((row) => row.targetNumber), [1, 1, 1, 2, 2])
  assert.deepEqual(result.sample.trace.map((row) => row.hpBefore), [60, 40, 5, 60, 40])
  assert.deepEqual(result.sample.trace.map((row) => row.hpAfter), [40, 5, 0, 40, 5])
  result.sample.trace.forEach((row, index) => close(row.rawDamage, [20, 35, 50, 20, 35][index]))
  close(result.mean.rawDamage, 160)
  close(result.mean.effectiveDamage, 115)
  close(result.mean.overkillDamage, 45)
  close(result.mean.effectiveDps, 23)
  assert.equal(result.mean.kills, 1)
  assert.equal(result.mean.explosions, 0)
  assert.equal(result.dpsStandardError, 0)
  assert.deepEqual(result.dpsConfidence95, { lower: 23, upper: 23 })
  assert.deepEqual(result.dpsPercentiles, { p10: 23, p50: 23, p90: 23 })
  close(result.baseline.rawDamage, 250)
})

test('小数の丸め誤差だけが残る同値ダメージでは撃破し、実際に不足するダメージでは撃破しない', () => {
  for (const scale of [1e-6, 1, 1_000]) {
    const setup = input({
      model: { ...model, activeDroneCount: 2, prdStep: 0.015, prdMaxStack: 40 },
      effectiveAttack: 547 * scale, enemyHp: 601.7 * scale, duration: 2,
    })
    const trial = simulateGoldenglowTargetSwitchTrial(setup, () => 0.999999)
    assert.equal(trial.totals.kills, 1)
    assert.equal(trial.trace[0].killed, false)
    assert.equal(trial.trace[1].killed, true)
    assert.equal(trial.trace[1].hpAfter, 0)
    for (const row of trial.trace) {
      assert.ok(row.effectiveDamage <= row.rawDamage)
      assert.equal(row.effectiveDamage + row.overkillDamage, row.rawDamage)
      assert.ok(row.overkillDamage >= 0)
      assert.ok(Math.abs(row.hpBefore - row.hpAfter - row.effectiveDamage)
        <= Number.EPSILON * Math.max(row.hpBefore, row.rawDamage) * 4)
    }
  }
  const shortfall = simulateGoldenglowTargetSwitchTrial(input({
    model: { ...model, activeDroneCount: 2 }, effectiveAttack: 547,
    enemyHp: 601.7 + 1e-12, duration: 2,
  }))
  assert.equal(shortfall.totals.kills, 0)
  assert.ok(shortfall.trace[1].hpAfter > 0)
  const zeroDamage = simulateGoldenglowTargetSwitchTrial(input({ effectiveAttack: 0, enemyHp: Number.MIN_VALUE }))
  assert.equal(zeroDamage.totals.kills, 0)
  assert.ok(zeroDamage.trace.every((row) => row.hpAfter === Number.MIN_VALUE))
})

test('確定爆発はPRDだけを初期化し、同一目標の通常倍率を進めたり戻したりしない', () => {
  const result = simulateGoldenglowTargetSwitch(input({
    model: { ...model, prdMaxStack: 2 }, duration: 7, enemyHp: 1_000_000,
  }))
  assert.deepEqual(result.sample.trace.map((row) => row.explosions), [0, 0, 1, 0, 0, 1, 0])
  result.sample.trace.forEach((row, index) => close(row.normalDamage, [20, 35, 0, 50, 65, 0, 80][index]))
  assert.deepEqual(result.sample.trace.map((row) => row.drones[0].normalStackBefore), [0, 1, 2, 2, 3, 4, 4])
  assert.deepEqual(result.sample.trace.map((row) => row.drones[0].normalStackAfter), [1, 2, 2, 3, 4, 4, 5])
  assert.deepEqual(result.sample.trace.map((row) => row.drones[0].missesBefore), [0, 1, 2, 0, 1, 2, 0])
  assert.deepEqual(result.sample.trace.map((row) => row.drones[0].missesAfter), [1, 2, 0, 1, 2, 0, 1])
  assert.deepEqual(result.sample.trace.map((row) => row.drones[0].explosionChancePercent), [0, 0, 100, 0, 0, 100, 0])
  close(result.mean.normalDamage, 250)
  close(result.mean.explosionDamage, 600)
  close(result.mean.rawDamage, 850)
  close(result.baseline.rawDamage, 850)
})

test('撃破による目標変更をまたいでもPRDの不発回数を保持する', () => {
  const trial = simulateGoldenglowTargetSwitchTrial(input({
    model: { ...model, prdMaxStack: 2 }, enemyHp: 10, duration: 3,
  }))
  assert.deepEqual(trial.trace.map((row) => row.explosions), [0, 0, 1])
  assert.deepEqual(trial.trace.map((row) => row.rawDamage), [20, 20, 300])
  assert.equal(trial.totals.kills, 3)
  close(trial.totals.effectiveDamage, 30)
  close(trial.totals.overkillDamage, 310)
})

test('浮遊ごとにPRDと通常倍率を独立して保持する', () => {
  const rolls = [0.1, 0.9, 0.3, 0.3, 0.9, 0.9]
  let randomCalls = 0
  const trial = simulateGoldenglowTargetSwitchTrial(input({
    model: { ...model, prdStep: 0.25, activeDroneCount: 2 }, enemyHp: 1_000_000, duration: 3,
  }), () => rolls[randomCalls++])
  assert.deepEqual(trial.trace.map((row) => row.explosions), [1, 1, 0])
  trial.trace.forEach((row, index) => close(row.normalDamage, [20, 20, 70][index]))
  close(trial.totals.rawDamage, 710)
  assert.equal(randomCalls, 6, 'one RNG call per drone attack, including recorded attacks')
  const drones = trial.trace.flatMap((row) => row.drones)
  assert.deepEqual(drones.map((drone) => drone.droneNumber), [1, 2, 1, 2, 1, 2])
  assert.deepEqual(drones.map((drone) => drone.rollPercent), [10, 90, 30, 30, 90, 90])
  assert.deepEqual(drones.map((drone) => drone.explosionChancePercent), [25, 25, 25, 50, 50, 25])
  assert.deepEqual(drones.map((drone) => drone.exploded), [true, false, false, true, false, false])
  assert.deepEqual(drones.map((drone) => drone.normalStackBefore), [0, 0, 0, 1, 1, 1])
  assert.deepEqual(drones.map((drone) => drone.normalStackAfter), [0, 1, 1, 1, 2, 2])
  assert.deepEqual(drones.map((drone) => drone.missesBefore), [0, 0, 0, 1, 1, 0])
  assert.deepEqual(drones.map((drone) => drone.missesAfter), [0, 1, 1, 0, 2, 1])
  drones.forEach((drone, index) => {
    close(drone.normalScalePercent, [20, 20, 20, 35, 35, 35][index])
    close(drone.damage, [300, 20, 20, 300, 35, 35][index])
  })
})

test('爆発判定と同じ乱数を記録し、発動確率と同値の乱数では爆発しない', () => {
  const trial = simulateGoldenglowTargetSwitchTrial(input({
    model: { ...model, prdStep: 0.25, activeDroneCount: 2 }, enemyHp: 1_000_000, duration: 2,
  }), sequence([0.25, 0.249999, 0.5, 0.25]))
  const drones = trial.trace.flatMap((row) => row.drones)
  assert.deepEqual(drones.map((drone) => drone.exploded), [false, true, false, false])
  for (const drone of drones) {
    assert.equal(drone.exploded, drone.rollPercent < drone.explosionChancePercent)
  }
})

test('ひとつの浮遊が撃破しても次の目標では全浮遊の通常倍率を初期化する', () => {
  const trial = simulateGoldenglowTargetSwitchTrial(input({
    model: { ...model, prdStep: 0.25, activeDroneCount: 2 }, enemyHp: 100, duration: 2,
  }), sequence([0.1, 0.9, 0.9, 0.9]))
  assert.equal(trial.trace[0].killed, true)
  close(trial.trace[1].normalDamage, 40)
  assert.equal(trial.trace[1].targetNumber, 2)
  assert.deepEqual(trial.trace[0].drones.map((drone) => drone.normalStackAfter), [0, 0])
  assert.deepEqual(trial.trace[1].drones.map((drone) => drone.normalStackBefore), [0, 0])
  assert.deepEqual(trial.trace[0].drones.map((drone) => drone.missesAfter), [0, 1])
  assert.deepEqual(trial.trace[1].drones.map((drone) => drone.missesBefore), [0, 1])
  assert.deepEqual(trial.trace[1].drones.map((drone) => drone.explosionChancePercent), [25, 50])
})

test('同じ一斉攻撃の本体と浮遊を合算し、一度に複数の敵は倒さない', () => {
  for (const skillIndex of [1, 2]) {
    const trial = simulateGoldenglowTargetSwitchTrial(input({
      skillIndex, model: { ...model, activeDroneCount: 2, prdStep: 1 }, enemyHp: 80, duration: 2,
    }))
    assert.equal(trial.totals.volleys, 2)
    assert.equal(trial.totals.kills, 2)
    assert.equal(trial.totals.explosions, 4)
    close(trial.totals.rawDamage, 1_400)
    close(trial.totals.effectiveDamage, 160)
    close(trial.totals.bodyDamage, 200)
    close(trial.totals.overkillDamage, 1_240)
    assert.deepEqual(trial.trace.map((row) => row.targetNumber), [1, 2])
  }
  const skill3 = simulateGoldenglowTargetSwitchTrial(input({ duration: 1, skillIndex: 3 }))
  assert.equal(skill3.totals.bodyDamage, 0)
})

test('初撃は攻撃間隔後で、短い窓には端数攻撃を加えない', () => {
  const result = simulateGoldenglowTargetSwitch(input({ duration: 0.99 }))
  assert.equal(result.mean.rawDamage, 0)
  assert.equal(result.mean.effectiveDps, 0)
  assert.equal(result.baseline.rawDamage, 0)
  assert.deepEqual(result.sample.trace, [])
  assert.equal(result.timeline[0].time, 0)
  assert.equal(result.timeline.at(-1)!.time, 0.99)
})

test('終了時刻と一致した攻撃を数え、端数と浮動小数点の境界を区別する', () => {
  const exact = simulateGoldenglowTargetSwitchTrial(input({ attackInterval: 0.1, duration: 0.3 }))
  assert.equal(exact.totals.volleys, 3)
  assert.equal(exact.trace.at(-1)!.time, 0.3)
  const fractional = simulateGoldenglowTargetSwitchTrial(input({ attackInterval: 0.1, duration: 0.299999 }))
  assert.equal(fractional.totals.volleys, 2)
  const long = simulateGoldenglowTargetSwitchTrial(input({
    attackInterval: 0.05, duration: 300, enemyHp: 1_000_000, trials: 1,
  }))
  assert.equal(long.totals.volleys, 6_000)
  assert.equal(long.trace.at(-1)!.time, 300)
})

test('切替待ち時間は撃破後の次の攻撃にだけ加算する', () => {
  const result = simulateGoldenglowTargetSwitch(input({ enemyHp: 10, switchDelay: 0.5, duration: 4 }))
  assert.deepEqual(result.sample.trace.map((row) => row.time), [1, 2.5, 4])
  assert.equal(result.mean.kills, 3)
  close(result.mean.effectiveDamage, 30)
  close(result.baseline.rawDamage, 170)
  close(result.timeline[1].effectiveDamage, 10)
  close(result.timeline[2].effectiveDamage, 10)
  close(result.timeline[3].effectiveDamage, 20)
  close(result.timeline[4].effectiveDamage, 30)
  const notKilled = simulateGoldenglowTargetSwitchTrial(input({ enemyHp: 1_000_000, switchDelay: 5, duration: 3 }))
  assert.deepEqual(notKilled.trace.map((row) => row.time), [1, 2, 3])
})

test('術攻撃は防御を無視し、耐性無視と5%の最低保証を全成分へ適用する', () => {
  const setup = input({
    skillIndex: 1, model: { ...model, prdMaxStack: 1, resistanceIgnoreFixed: 15 },
    enemyHp: 1_000_000, duration: 2,
  })
  const base = simulateGoldenglowTargetSwitchTrial(setup)
  close(base.totals.normalDamage, 20)
  close(base.totals.explosionDamage, 300)
  close(base.totals.bodyDamage, 200)
  assert.deepEqual(simulateGoldenglowTargetSwitchTrial({ ...setup, enemyDefense: 1_000_000 }), base)
  const mitigated = simulateGoldenglowTargetSwitchTrial({ ...setup, enemyResistance: 40 })
  close(mitigated.totals.normalDamage, 15)
  close(mitigated.totals.explosionDamage, 225)
  close(mitigated.totals.bodyDamage, 150)
  const ignoredAtCap = simulateGoldenglowTargetSwitchTrial({ ...setup, enemyResistance: 100 })
  close(ignoredAtCap.totals.normalDamage, 3)
  close(ignoredAtCap.totals.explosionDamage, 45)
  close(ignoredAtCap.totals.bodyDamage, 30)
  const minimum = simulateGoldenglowTargetSwitchTrial({
    ...setup, model: { ...setup.model, resistanceIgnoreFixed: 0 }, enemyResistance: 100,
  })
  close(minimum.totals.normalDamage, 1)
  close(minimum.totals.explosionDamage, 15)
  close(minimum.totals.bodyDamage, 10)
})

test('通常倍率は上限で停止する', () => {
  const trial = simulateGoldenglowTargetSwitchTrial(input({ enemyHp: 1_000_000, duration: 10 }))
  trial.trace.forEach((row, index) => {
    const expectedScale = [20, 35, 50, 65, 80, 95, 110, 110, 110, 110][index]
    close(row.normalDamage, expectedScale)
    close(row.drones[0].normalScalePercent, expectedScale)
    assert.equal(row.drones[0].normalStackBefore, Math.min(index, 6))
    assert.equal(row.drones[0].normalStackAfter, Math.min(index + 1, 6))
  })
})

test('乱数シードで全結果を再現でき、試行数を変えても最初の実行例は変わらない', () => {
  const setup = input({ model: { ...model, prdStep: 0.15, activeDroneCount: 3 }, duration: 30, enemyHp: 500, trials: 100 })
  const first = simulateGoldenglowTargetSwitch(setup)
  assert.deepEqual(simulateGoldenglowTargetSwitch(setup), first)
  assert.deepEqual(simulateGoldenglowTargetSwitch({ ...setup, trials: 101 }).sample, first.sample)
  assert.deepEqual(simulateGoldenglowTargetSwitchTrial(setup), first.sample)
  assert.notDeepEqual(simulateGoldenglowTargetSwitch({ ...setup, seed: 43 }).sample, first.sample)
  assert.ok(first.dpsStandardError! > 0)
  assert.ok(first.dpsConfidence95!.lower < first.mean.effectiveDps)
  assert.ok(first.dpsConfidence95!.upper > first.mean.effectiveDps)
  assert.ok(first.dpsPercentiles.p10 <= first.dpsPercentiles.p50)
  assert.ok(first.dpsPercentiles.p50 <= first.dpsPercentiles.p90)
})

test('HP制限と撃破を試行ごとに処理してから平均し、平均ダメージから撃破判定しない', () => {
  const setup = input({ model: { ...model, prdStep: 0.5 }, duration: 1, enemyHp: 100, trials: 100 })
  const result = simulateGoldenglowTargetSwitch(setup)
  assert.ok(result.mean.kills > 0 && result.mean.kills < 1)
  close(result.mean.effectiveDamage, 20 + 80 * result.mean.kills)
  close(result.mean.rawDamage, 20 + 280 * result.mean.kills)
  assert.ok(Math.min(result.mean.rawDamage, setup.enemyHp) > result.mean.effectiveDamage)
  const probability = result.mean.kills
  const expectedStandardError = Math.sqrt(80 ** 2 * probability * (1 - probability) / (setup.trials - 1))
  close(result.dpsStandardError!, expectedStandardError)
})

test('平均・実行例・時間推移でダメージ保存則と終端の一致を満たす', () => {
  const result = simulateGoldenglowTargetSwitch(input({
    skillIndex: 1, model: { ...model, prdStep: 0.015, prdMaxStack: 40, activeDroneCount: 2 },
    duration: 127.5, enemyHp: 900, trials: 50, attackInterval: 0.867, switchDelay: 0.15,
  }))
  for (const totals of [result.mean, result.sample.totals]) {
    close(totals.effectiveDamage + totals.overkillDamage, totals.rawDamage)
    close(totals.normalDamage + totals.explosionDamage + totals.bodyDamage, totals.rawDamage)
    close(totals.effectiveDps * result.duration, totals.effectiveDamage)
    assert.ok(totals.kills <= totals.volleys)
  }
  assert.equal(result.timeline.length, 121)
  assert.equal(result.timeline[0].effectiveDamage, 0)
  result.timeline.forEach((point, index) => {
    assert.ok(point.effectiveDamage <= point.rawDamage + 1e-8)
    if (index > 0) assert.ok(point.effectiveDamage >= result.timeline[index - 1].effectiveDamage)
  })
  const endpoint = result.timeline.at(-1)!
  assert.equal(endpoint.time, 127.5)
  close(endpoint.effectiveDamage, result.mean.effectiveDamage)
  close(endpoint.rawDamage, result.mean.rawDamage)
  close(endpoint.baselineRawDamage, result.baseline.rawDamage)
  close(endpoint.kills, result.mean.kills)
  close(result.sample.trace.reduce((sum, row) => sum + row.effectiveDamage, 0), result.sample.totals.effectiveDamage)
  result.sample.trace.forEach((row, rowIndex) => {
    assert.equal(row.drones.length, 2)
    close(row.drones.filter((drone) => !drone.exploded).reduce((sum, drone) => sum + drone.damage, 0), row.normalDamage)
    close(row.drones.filter((drone) => drone.exploded).reduce((sum, drone) => sum + drone.damage, 0), row.explosionDamage)
    close(row.drones.reduce((sum, drone) => sum + drone.damage, row.bodyDamage), row.rawDamage)
    assert.equal(row.drones.filter((drone) => drone.exploded).length, row.explosions)
    for (const [droneIndex, drone] of row.drones.entries()) {
      if (row.killed) assert.equal(drone.normalStackAfter, 0)
      const nextDrone = result.sample.trace[rowIndex + 1]?.drones[droneIndex]
      if (nextDrone) {
        assert.equal(nextDrone.normalStackBefore, drone.normalStackAfter)
        assert.equal(nextDrone.missesBefore, drone.missesAfter)
      }
    }
  })
})

test('単一試行では標準誤差を算出せず、攻撃力0でもHPを減らさない', () => {
  const result = simulateGoldenglowTargetSwitch(input({ trials: 1, effectiveAttack: 0 }))
  assert.equal(result.dpsStandardError, null)
  assert.equal(result.dpsConfidence95, null)
  assert.equal(result.mean.effectiveDamage, 0)
  assert.equal(result.mean.kills, 0)
  assert.ok(result.sample.trace.every((row) => row.hpBefore === 60 && row.hpAfter === 60))
})

test('不正な入力と過大な計算量をRangeErrorで拒否する', () => {
  const invalid: Partial<GoldenglowTargetSwitchInput>[] = [
    { enemyHp: 0 }, { enemyHp: Infinity }, { enemyHp: 1_000_000_001 },
    { effectiveAttack: -1 }, { effectiveAttack: NaN }, { enemyDefense: -1 },
    { enemyResistance: Infinity }, { enemyResistance: 101 }, { duration: 0 }, { duration: 301 },
    { attackInterval: 0.049 }, { attackInterval: 301 },
    { switchDelay: -0.1 }, { switchDelay: 5.01 }, { trials: 0 }, { trials: 1.5 },
    { trials: GOLDENGLOW_TARGET_SWITCH_LIMITS.maxTrials + 1 }, { seed: -1 },
    { seed: 0x100000000 }, { skillIndex: 0 }, { skillIndex: 1.5 },
    { model: { ...model, activeDroneCount: 0 } },
    { model: { ...model, activeDroneCount: 17 } },
    { model: { ...model, prdStep: NaN } },
    { model: { ...model, prdMaxStack: 1_001 } },
    { model: { ...model, droneMaxStack: 1.1 } },
    { model: { ...model, droneMaxAttackScale: 0.1 } },
    { duration: 300, attackInterval: 0.05, trials: 20_000 },
  ]
  for (const override of invalid) assert.throws(() => simulateGoldenglowTargetSwitch(input(override)), RangeError)
  assert.throws(() => simulateGoldenglowTargetSwitchTrial(input(), () => 1), /random/)
  assert.throws(() => simulateGoldenglowTargetSwitchTrial(input(), () => NaN), /random/)
})

test('残り浮遊の切り替えを省略した入力は明示的な無効指定と完全に一致する', () => {
  const setup = input({
    skillIndex: 1, model: { ...model, activeDroneCount: 3, prdStep: 0.2 },
    duration: 12, enemyHp: 80, switchDelay: 0.15,
  })
  const defaultResult = simulateGoldenglowTargetSwitch(setup)
  assert.deepEqual(simulateGoldenglowTargetSwitch({ ...setup, retargetRemainingDrones: false }), defaultResult)
  assert.ok(defaultResult.sample.trace.every((row) => row.attacks === undefined))
  assert.ok(defaultResult.sample.trace.every((row) => row.kills <= 1))
  for (const row of defaultResult.sample.trace) {
    assert.equal(row.nextTargetNumber, row.targetNumber + row.kills)
    assert.equal(row.nextTargetHp, row.killed ? setup.enemyHp : row.hpAfter)
  }
})

test('有効時は先行1機の撃破直後に後続2機だけが次の敵を攻撃し、超過ダメージを引き継がない', () => {
  const trial = simulateGoldenglowTargetSwitchTrial(input({
    model: { ...model, activeDroneCount: 3 }, enemyHp: 80, duration: 2,
    retargetRemainingDrones: true,
  }), sequence([0.9, 0.9, 0.9, 0.9, 0.9, 0.9]))
  const first = trial.trace[0]
  const split = trial.trace[1]
  assert.deepEqual(first.attacks!.map((attack) => attack.targetNumber), [1, 1, 1])
  assert.equal(first.nextTargetHp, 20)
  assert.equal(split.targetNumber, 1)
  assert.equal(split.hpBefore, 20)
  assert.equal(split.kills, 1)
  assert.equal(split.killed, true)
  assert.equal(split.hpAfter, 40)
  assert.equal(split.nextTargetNumber, 2)
  assert.equal(split.nextTargetHp, 40)
  assert.deepEqual(split.attacks!.map((attack) => [attack.actor, attack.droneNumber, attack.targetNumber]), [
    ['drone', 1, 1], ['drone', 2, 2], ['drone', 3, 2],
  ])
  assert.deepEqual(split.attacks!.map((attack) => [attack.hpBefore, attack.hpAfter, attack.killed]), [
    [20, 0, true], [80, 60, false], [60, 40, false],
  ])
  split.attacks!.forEach((attack, index) => {
    close(attack.damage, [35, 20, 20][index])
    close(attack.effectiveDamage, 20)
    close(attack.overkillDamage, [15, 0, 0][index])
  })
  assert.deepEqual(split.drones.map((drone) => drone.normalStackBefore), [1, 0, 0])
  assert.deepEqual(split.drones.map((drone) => drone.normalStackAfter), [0, 1, 1])
  close(trial.totals.rawDamage, 135)
  close(trial.totals.effectiveDamage, 120)
  close(trial.totals.overkillDamage, 15)
})

test('同一攻撃中の撃破で全機の通常倍率を初期化してもPRDを維持し、爆発した機体だけPRDを初期化する', () => {
  const trial = simulateGoldenglowTargetSwitchTrial(input({
    model: { ...model, activeDroneCount: 3, prdStep: 0.25 },
    enemyHp: 80, duration: 2, retargetRemainingDrones: true,
  }), sequence([0.9, 0.9, 0.9, 0.3, 0.9, 0.9]))
  const split = trial.trace[1]
  assert.deepEqual(split.attacks!.map((attack) => attack.targetNumber), [1, 2, 2])
  assert.deepEqual(split.drones.map((drone) => drone.exploded), [true, false, false])
  assert.deepEqual(split.drones.map((drone) => drone.explosionChancePercent), [50, 50, 50])
  assert.deepEqual(split.drones.map((drone) => drone.missesBefore), [1, 1, 1])
  assert.deepEqual(split.drones.map((drone) => drone.missesAfter), [0, 2, 2])
  assert.deepEqual(split.drones.map((drone) => drone.normalStackBefore), [1, 0, 0])
  assert.deepEqual(split.drones.map((drone) => drone.normalStackAfter), [0, 1, 1])
  close(split.explosionDamage, 300)
  close(split.normalDamage, 40)
  close(split.overkillDamage, 280)
})

test('後続機が撃破した場合も先行機の攻撃終了後の通常倍率を初期化する', () => {
  const trial = simulateGoldenglowTargetSwitchTrial(input({
    model: { ...model, activeDroneCount: 3 }, enemyHp: 80, duration: 3,
    retargetRemainingDrones: true,
  }), () => 0.9)
  const third = trial.trace[2]
  assert.deepEqual(third.attacks!.map((attack) => attack.targetNumber), [2, 2, 3])
  assert.deepEqual(third.drones.map((drone) => drone.normalStackBefore), [0, 1, 0])
  assert.deepEqual(third.drones.map((drone) => drone.normalStackAfter), [0, 0, 1])
  assert.deepEqual(third.drones.map((drone) => drone.missesAfter), [3, 3, 3])
  assert.equal(third.nextTargetNumber, 3)
  assert.equal(third.nextTargetHp, 60)
})

test('S1・S2では本体を先に処理し、本体の撃破後に浮遊が次の敵へ向かう', () => {
  for (const skillIndex of [1, 2]) {
    const trial = simulateGoldenglowTargetSwitchTrial(input({
      skillIndex, model: { ...model, activeDroneCount: 3 },
      enemyHp: 80, duration: 1, retargetRemainingDrones: true,
    }), sequence([0.9, 0.9, 0.9]))
    const row = trial.trace[0]
    assert.deepEqual(row.attacks!.map((attack) => [attack.actor, attack.droneNumber, attack.targetNumber]), [
      ['body', undefined, 1], ['drone', 1, 2], ['drone', 2, 2], ['drone', 3, 2],
    ])
    assert.equal(row.attacks![0].killed, true)
    assert.equal(row.nextTargetNumber, 2)
    assert.equal(row.nextTargetHp, 20)
    close(row.bodyDamage, 100)
    close(row.effectiveDamage, 140)
    close(row.overkillDamage, 20)
  }
})

test('遅延0では同時刻に複数撃破しても各攻撃者は1回ずつ攻撃し元の攻撃間隔を維持する', () => {
  for (const skillIndex of [1, 2, 3]) {
    const actors = skillIndex === 3 ? 3 : 4
    const setup = input({
      skillIndex, model: { ...model, activeDroneCount: 3, prdStep: 1 },
      enemyHp: 80, duration: 3, switchDelay: 0, retargetRemainingDrones: true,
    })
    const result = simulateGoldenglowTargetSwitch(setup)
    assert.deepEqual(result.sample.trace.map((row) => row.time), [1, 2, 3])
    assert.equal(result.mean.volleys, 3)
    assert.equal(result.mean.kills, 3 * actors)
    assert.equal(result.mean.explosions, 9)
    assert.deepEqual(result.sample.trace.map((row) => row.kills), [actors, actors, actors])
    for (const [index, row] of result.sample.trace.entries()) {
      assert.equal(row.attacks!.length, actors)
      assert.deepEqual(row.attacks!.map((attack) => attack.targetNumber),
        Array.from({ length: actors }, (_, actor) => index * actors + actor + 1))
      assert.ok(row.attacks!.every((attack) => attack.killed && attack.hpAfter === 0))
      assert.equal(row.hpAfter, 0)
      assert.equal(row.nextTargetHp, 80)
      assert.equal(row.nextTargetNumber, (index + 1) * actors + 1)
      assert.ok(row.drones.every((drone) => drone.normalStackAfter === 0 && drone.missesAfter === 0))
    }
    close(result.mean.effectiveDamage, 80 * 3 * actors)
    close(result.mean.rawDamage, (skillIndex === 3 ? 900 : 1_000) * 3)
    assert.equal(simulateGoldenglowTargetSwitchTrial({ ...setup, duration: 2.99999 }).totals.volleys, 2)
    assert.equal(result.mean.bodyAttacks, skillIndex === 3 ? 0 : 3)
    assert.equal(result.mean.droneAttacks, 9)
    close(result.timeline.at(-1)!.kills, result.mean.kills)
  }
})

test('撃破がなければ切り替えの有無でダメージ・抽選・基準値・攻撃時刻が変わらない', () => {
  const setup = input({
    skillIndex: 1, model: { ...model, activeDroneCount: 3, prdStep: 0.2 },
    enemyHp: 1_000_000, duration: 15, switchDelay: 5,
  })
  const off = simulateGoldenglowTargetSwitch(setup)
  const on = simulateGoldenglowTargetSwitch({ ...setup, retargetRemainingDrones: true })
  for (const key of Object.keys(off.mean) as (keyof typeof off.mean)[]) close(on.mean[key], off.mean[key])
  close(on.baseline.rawDamage, off.baseline.rawDamage)
  for (const [index, row] of on.sample.trace.entries()) {
    assert.equal(row.time, off.sample.trace[index].time)
    assert.deepEqual(row.drones, off.sample.trace[index].drones)
    assert.equal(row.kills, 0)
    assert.ok(row.attacks!.every((attack) => attack.targetNumber === 1))
  }
  for (const [index, point] of on.timeline.entries()) {
    close(point.rawDamage, off.timeline[index].rawDamage)
    close(point.effectiveDamage, off.timeline[index].effectiveDamage)
    close(point.baselineRawDamage, off.timeline[index].baselineRawDamage)
  }
})

test('先行機が1秒で撃破すると残り2機は1.1秒へ移り、その後も2秒と2.1秒に分かれる', () => {
  const setup = input({
    model: { ...model, activeDroneCount: 3, prdStep: 0.25 },
    enemyHp: 300, duration: 2.1, switchDelay: 0.1, retargetRemainingDrones: true,
  })
  const trial = simulateGoldenglowTargetSwitchTrial(setup, sequence([0, 0.9, 0.9, 0.9, 0.9, 0.9]))
  assert.deepEqual(trial.trace.map((row) => row.time), [1, 1.1, 2, 2.1])
  assert.deepEqual(trial.trace.map((row) => row.drones.map((drone) => drone.droneNumber)), [[1], [2, 3], [1], [2, 3]])
  assert.deepEqual(trial.trace.map((row) => row.attacks!.map((attack) => attack.targetNumber)), [[1], [2, 2], [2], [2, 2]])
  assert.deepEqual(trial.trace.map((row) => row.drones.map((drone) => drone.normalStackBefore)), [[0], [0, 0], [0], [1, 1]])
  assert.equal(trial.totals.droneAttacks, 6)
  assert.equal(trial.totals.bodyAttacks, 0)
  assert.equal(trial.totals.volleys, 4)
  close(trial.totals.rawDamage, 430)
  close(trial.totals.effectiveDamage, 430)

  const calls: number[][] = []
  const endpoint = runGoldenglowRetargetingTrial(
    prepareGoldenglowTargetSwitchSimulation({ ...setup, duration: 2.05 }),
    (droneIndex, attackIndex, misses) => {
      calls.push([droneIndex, attackIndex, misses])
      return droneIndex === 0 && attackIndex === 0 ? 0 : 0.9
    }, true,
  )
  assert.deepEqual(endpoint.trace.map((row) => row.time), [1, 1.1, 2])
  assert.equal(endpoint.totals.droneAttacks, 4)
  assert.deepEqual(calls, [[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 1, 0]])
  close(endpoint.totals.rawDamage, 360)
})

test('切替待ちが攻撃間隔より長ければ撃破した機体も待ち、待機後の実際の攻撃時刻から再開する', () => {
  const setup = input({
    model: { ...model, activeDroneCount: 3, prdStep: 0.25 },
    enemyHp: 300, duration: 3.5, switchDelay: 1.5, retargetRemainingDrones: true,
  })
  const trial = runGoldenglowRetargetingTrial(prepareGoldenglowTargetSwitchSimulation(setup),
    (droneIndex, attackIndex) => droneIndex === 0 && attackIndex === 0 ? 0 : 0.99, true)
  assert.deepEqual(trial.trace.map((row) => row.time), [1, 2.5, 3.5])
  assert.deepEqual(trial.trace.map((row) => row.drones.map((drone) => drone.droneNumber)), [[1], [1, 2, 3], [1, 2, 3]])
  assert.equal(trial.totals.droneAttacks, 7)
  assert.equal(trial.totals.kills, 1)
  close(trial.totals.rawDamage, 465)
})

test('待機中に別の機体が再び撃破すると未攻撃機は最新目標の切替時刻まで待つ', () => {
  const calls: number[][] = []
  const trial = runGoldenglowRetargetingTrial(prepareGoldenglowTargetSwitchSimulation(input({
    model: { ...model, activeDroneCount: 3, prdStep: 0.25 },
    enemyHp: 80, duration: 2.1, switchDelay: 0.4, retargetRemainingDrones: true,
  })), (droneIndex, attackIndex, misses) => {
    calls.push([droneIndex, attackIndex, misses])
    return droneIndex < 2 && attackIndex === 0 ? 0 : 0.9
  }, true)
  trial.trace.forEach((row, index) => close(row.time, [1, 1.4, 1.8, 2][index]))
  assert.deepEqual(trial.trace.map((row) => row.drones.map((drone) => drone.droneNumber)), [[1], [2], [3], [1]])
  assert.deepEqual(trial.trace.map((row) => row.attacks![0].targetNumber), [1, 2, 3, 3])
  assert.deepEqual(calls, [[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 1, 0]])
  assert.equal(trial.totals.kills, 2)
  assert.equal(trial.totals.droneAttacks, calls.length)
  assert.equal(trial.trace.at(-1)!.drones[0].missesAfter, 1)
})

test('S1・S2の本体も独立した攻撃時刻を保ち、残り浮遊のみが撃破直後の待機に入る', () => {
  for (const skillIndex of [1, 2]) {
    const trial = simulateGoldenglowTargetSwitchTrial(input({
      skillIndex, model: { ...model, activeDroneCount: 3 },
      enemyHp: 80, duration: 2.05, switchDelay: 0.1, retargetRemainingDrones: true,
    }))
    assert.deepEqual(trial.trace.map((row) => row.time), [1, 1.1, 2])
    assert.deepEqual(trial.trace.map((row) => row.attacks!.map((attack) => attack.actor)), [
      ['body'], ['drone', 'drone', 'drone'], ['body'],
    ])
    assert.deepEqual(trial.trace.map((row) => row.bodyDamage), [100, 0, 100])
    assert.equal(trial.totals.bodyAttacks, 2)
    assert.equal(trial.totals.droneAttacks, 3)
    close(trial.totals.rawDamage, 260)
    close(trial.totals.effectiveDamage, 160)
  }
})

test('遅れて攻撃する機体は目標変更で通常倍率だけを戻し、待機前のPRD不発回数を維持する', () => {
  const trial = simulateGoldenglowTargetSwitchTrial(input({
    model: { ...model, activeDroneCount: 3, prdStep: 0.25 },
    enemyHp: 80, duration: 2.1, switchDelay: 0.1, retargetRemainingDrones: true,
  }), sequence([0.9, 0.9, 0.9, 0.3, 0.9, 0.9]))
  assert.deepEqual(trial.trace.map((row) => row.time), [1, 2, 2.1])
  assert.deepEqual(trial.trace[1].drones.map((drone) => [drone.droneNumber, drone.missesBefore, drone.missesAfter]), [[1, 1, 0]])
  assert.deepEqual(trial.trace[2].drones.map((drone) => [drone.droneNumber, drone.normalStackBefore, drone.missesBefore, drone.missesAfter]), [
    [2, 0, 1, 2], [3, 0, 1, 2],
  ])
})

test('先行機の次の攻撃が未攻撃機を追い越してもシード抽選を機体と攻撃序数の対応で維持する', () => {
  const setup = input({
    model: { ...model, activeDroneCount: 3, prdStep: 1 },
    enemyHp: 80, duration: 3.5, switchDelay: 0.75, retargetRemainingDrones: true,
  })
  const trial = simulateGoldenglowTargetSwitchTrial(setup)
  const synchronous = simulateGoldenglowTargetSwitchTrial({
    ...setup, enemyHp: 1_000_000, switchDelay: 0, retargetRemainingDrones: false,
  })
  assert.deepEqual(trial.trace.map((row) => row.drones.map((drone) => drone.droneNumber)), [[1], [2], [1], [2]])
  const ordinals = [0, 0, 0]
  for (const drone of trial.trace.flatMap((row) => row.drones)) {
    const droneIndex = drone.droneNumber - 1
    assert.equal(drone.rollPercent, synchronous.trace[ordinals[droneIndex]++].drones[droneIndex].rollPercent)
  }
  assert.deepEqual(ordinals, [2, 2, 0])
})

test('1機でも切替待ちは攻撃後の待ち時間と重なり、遅延0なら従来結果を保つ', () => {
  for (const switchDelay of [0, 0.1, 1, 1.5]) {
    const setup = input({ enemyHp: 10, duration: 4, switchDelay, retargetRemainingDrones: true })
    const trial = simulateGoldenglowTargetSwitchTrial(setup)
    const times = switchDelay <= 1 ? [1, 2, 3, 4] : [1, 2.5, 4]
    assert.deepEqual(trial.trace.map((row) => row.time), times)
    assert.equal(trial.totals.droneAttacks, times.length)
    assert.equal(trial.totals.kills, times.length)
    if (switchDelay === 0) {
      const legacy = simulateGoldenglowTargetSwitchTrial({ ...setup, retargetRemainingDrones: false })
      assert.deepEqual(trial.totals, legacy.totals)
      assert.deepEqual(trial.trace.map(({ attacks: _attacks, ...row }) => row), legacy.trace)
    }
  }
})

test('長時間の撃破待ちを反復しても小数誤差を累積せず、終端の攻撃だけを正しく数える', () => {
  for (const attackInterval of [0.05, 0.1, 0.137, 0.25, 0.867]) {
    for (const switchDelay of [0.051, 0.07, 0.1, 0.137, 0.2, 0.3, 0.7, 1.3]) {
      const cadence = Math.max(attackInterval, switchDelay)
      const expectedAttacks = Math.floor((300 - attackInterval) / cadence) + 1
      const duration = Math.min(300, attackInterval + (expectedAttacks - 1) * cadence)
      const setup = input({
        model: { ...model, prdStep: 1 }, enemyHp: 1, attackInterval, switchDelay,
        duration, trials: 1, retargetRemainingDrones: true,
      })
      const prepared = prepareGoldenglowTargetSwitchSimulation(setup)
      const exact = runGoldenglowRetargetingTrial(prepared, () => 0)
      assert.equal(exact.totals.droneAttacks, expectedAttacks, `interval=${attackInterval}, delay=${switchDelay}`)
      assert.equal(exact.totals.kills, expectedAttacks)
      const before = runGoldenglowRetargetingTrial(prepareGoldenglowTargetSwitchSimulation({
        ...setup, duration: duration - prepared.timeTolerance * 8,
      }), () => 0)
      assert.equal(before.totals.droneAttacks, expectedAttacks - 1, `before endpoint: interval=${attackInterval}, delay=${switchDelay}`)
    }
  }

  for (const [attackInterval, switchDelay, duration, expectedAttacks] of [
    [0.05, 0.3, 299.75, 1000], [0.1, 0.1, 299.9, 2999],
  ]) {
    const result = simulateGoldenglowTargetSwitch(input({
      model: { ...model, prdStep: 1 }, enemyHp: 1,
      attackInterval, switchDelay, duration, trials: 1, retargetRemainingDrones: true,
    }))
    assert.equal(result.mean.droneAttacks, expectedAttacks)
    assert.equal(result.sample.trace.length, expectedAttacks)
    assert.equal(result.sample.trace.at(-1)!.time, duration)
    assert.equal(result.timeline.at(-1)!.kills, expectedAttacks)
    assert.equal(result.timeline.at(-1)!.rawDamage, result.mean.rawDamage)
  }
})

test('別機体の撃破が連鎖する長い観測窓でも切替時刻の整数成分を維持する', () => {
  const setup = input({
    model: { ...model, activeDroneCount: 3, prdStep: 1 }, enemyHp: 1,
    attackInterval: 0.05, switchDelay: 0.03, duration: 299.99,
    trials: 1, retargetRemainingDrones: true,
  })
  const prepared = prepareGoldenglowTargetSwitchSimulation(setup)
  const exact = runGoldenglowRetargetingTrial(prepared, () => 0)
  assert.equal(exact.totals.droneAttacks, 9999)
  assert.equal(exact.totals.kills, 9999)
  const before = runGoldenglowRetargetingTrial(prepareGoldenglowTargetSwitchSimulation({
    ...setup, duration: setup.duration - prepared.timeTolerance * 8,
  }), () => 0)
  assert.equal(before.totals.droneAttacks, 9998)
})

test('攻撃序数ごとの抽選は非同期の攻撃時刻でも再現でき、トレース有無と終端集計に影響されない', () => {
  const setup = input({
    skillIndex: 2, model: { ...model, activeDroneCount: 3, prdStep: 0.2 },
    enemyHp: 180, duration: 25.7, attackInterval: 0.867, switchDelay: 0.15,
    retargetRemainingDrones: true,
  })
  const full = simulateGoldenglowTargetSwitch(setup)
  assert.deepEqual(simulateGoldenglowTargetSwitch(setup), full)
  assert.deepEqual(simulateGoldenglowTargetSwitchTrial(setup), full.sample)
  const recordedDraws: number[][] = [[], [], []]
  for (const drone of full.sample.trace.flatMap((row) => row.drones)) recordedDraws[drone.droneNumber - 1].push(drone.rollPercent / 100)
  const timeline = full.timeline.map(({ time }) => ({ time, effectiveDamage: 0, rawDamage: 0, baselineRawDamage: 0, kills: 0 }))
  const replay = runGoldenglowRetargetingTrial(prepareGoldenglowTargetSwitchSimulation(setup),
    (droneIndex, attackIndex) => recordedDraws[droneIndex][attackIndex], false, timeline)
  assert.deepEqual(replay.totals, full.sample.totals)
  assert.deepEqual(replay.trace, [])
  for (const point of timeline) {
    const landed = full.sample.trace.filter((row) => row.time <= point.time + 1e-12)
    close(point.rawDamage, landed.reduce((sum, row) => sum + row.rawDamage, 0))
    close(point.effectiveDamage, landed.reduce((sum, row) => sum + row.effectiveDamage, 0))
    assert.equal(point.kills, landed.reduce((sum, row) => sum + row.kills, 0))
  }
  const previousTime = new Map<string, number>()
  for (const row of full.sample.trace) {
    for (const attack of row.attacks!) {
      const actor = `${attack.actor}:${attack.droneNumber ?? 0}`
      const previous = previousTime.get(actor)
      if (previous !== undefined) assert.ok(row.time - previous >= setup.attackInterval - 1e-12)
      previousTime.set(actor, row.time)
    }
  }
  assert.deepEqual(full.baseline, simulateGoldenglowTargetSwitch({ ...setup, retargetRemainingDrones: false }).baseline)
})

test('即時切り替えの小数同値撃破・実際の不足・微小HPと攻撃力0を区別する', () => {
  for (const scale of [1e-6, 1, 1_000]) {
    const setup = input({
      model: { ...model, activeDroneCount: 2 }, effectiveAttack: 547 * scale,
      enemyHp: 601.7 * scale, duration: 2, retargetRemainingDrones: true,
    })
    const exact = simulateGoldenglowTargetSwitchTrial(setup)
    assert.equal(exact.totals.kills, 1)
    assert.equal(exact.trace[1].attacks![1].killed, true)
    assert.equal(exact.trace[1].hpAfter, 0)
    const shortfall = simulateGoldenglowTargetSwitchTrial({ ...setup, enemyHp: (601.7 + 1e-10) * scale })
    assert.equal(shortfall.totals.kills, 0)
    assert.ok(shortfall.trace[1].hpAfter > 0)
  }
  const zero = simulateGoldenglowTargetSwitchTrial(input({
    skillIndex: 1, model: { ...model, activeDroneCount: 3 }, effectiveAttack: 0,
    enemyHp: Number.MIN_VALUE, retargetRemainingDrones: true,
  }))
  assert.equal(zero.totals.kills, 0)
  assert.equal(zero.totals.effectiveDamage, 0)
  assert.ok(zero.trace.every((row) => row.attacks!.every((attack) => attack.hpAfter === Number.MIN_VALUE)))
  const tiny = simulateGoldenglowTargetSwitchTrial(input({
    model: { ...model, activeDroneCount: 3 }, enemyHp: Number.MIN_VALUE,
    duration: 1, retargetRemainingDrones: true,
  }))
  assert.equal(tiny.totals.kills, 3)
  assert.equal(tiny.totals.effectiveDamage, Number.MIN_VALUE * 3)
  assert.equal(tiny.trace[0].nextTargetHp, Number.MIN_VALUE)
})

test('本体・通常攻撃・爆発の小数加算順が異なっても有効ダメージが総ダメージを超えない', () => {
  const trial = simulateGoldenglowTargetSwitchTrial(input({
    skillIndex: 1, model: { ...model, activeDroneCount: 3, prdStep: 0.5 },
    effectiveAttack: 0.9, enemyHp: 100_000, duration: 1, retargetRemainingDrones: true,
  }), sequence([0.99, 0, 0.99]))
  const row = trial.trace[0]
  assert.equal(row.kills, 0)
  close(row.rawDamage, 3.96)
  assert.equal(row.effectiveDamage, row.rawDamage)
  assert.equal(row.overkillDamage, 0)
  assert.equal(trial.totals.effectiveDamage, trial.totals.rawDamage)
  assert.equal(trial.totals.overkillDamage, 0)
  close(row.attacks!.reduce((sum, attack) => sum + attack.effectiveDamage, 0), row.effectiveDamage)
})

test('個別切り替えの攻撃明細・時刻グループ・集計・時間推移は同じダメージと目標状態を表す', () => {
  const result = simulateGoldenglowTargetSwitch(input({
    skillIndex: 1, model: { ...model, activeDroneCount: 3, prdStep: 0.2 },
    enemyHp: 180, enemyResistance: 37.5, duration: 16.25, attackInterval: 0.867,
    switchDelay: 0.15, retargetRemainingDrones: true,
  }))
  for (const [index, row] of result.sample.trace.entries()) {
    const attacks = row.attacks!
    assert.ok(attacks.length >= 1 && attacks.length <= 4)
    assert.equal(row.drones.length, attacks.filter((attack) => attack.actor === 'drone').length)
    assert.ok(attacks.filter((attack) => attack.actor === 'body').length <= 1)
    assert.equal(row.targetNumber, attacks[0].targetNumber)
    close(row.hpBefore, attacks[0].hpBefore)
    close(row.hpAfter, attacks.at(-1)!.hpAfter)
    assert.equal(row.kills, attacks.filter((attack) => attack.killed).length)
    assert.equal(row.killed, row.kills > 0)
    assert.equal(row.nextTargetNumber, row.targetNumber + row.kills)
    close(attacks.reduce((sum, attack) => sum + attack.damage, 0), row.rawDamage)
    close(attacks.reduce((sum, attack) => sum + attack.effectiveDamage, 0), row.effectiveDamage)
    close(attacks.reduce((sum, attack) => sum + attack.overkillDamage, 0), row.overkillDamage)
    for (const [attackIndex, attack] of attacks.entries()) {
      close(attack.effectiveDamage + attack.overkillDamage, attack.damage)
      assert.ok(attack.effectiveDamage >= 0 && attack.effectiveDamage <= attack.damage)
      const next = attacks[attackIndex + 1]
      if (next) {
        assert.equal(next.targetNumber, attack.targetNumber + Number(attack.killed))
        close(next.hpBefore, attack.killed ? 180 : attack.hpAfter)
      }
    }
    const nextRow = result.sample.trace[index + 1]
    if (nextRow) {
      assert.equal(nextRow.targetNumber, row.nextTargetNumber)
      close(nextRow.hpBefore, row.nextTargetHp)
    }
  }
  for (const totals of [result.mean, result.sample.totals]) {
    close(totals.effectiveDamage + totals.overkillDamage, totals.rawDamage)
    close(totals.normalDamage + totals.explosionDamage + totals.bodyDamage, totals.rawDamage)
    assert.ok(totals.kills <= totals.bodyAttacks + totals.droneAttacks)
  }
  const allAttacks = result.sample.trace.flatMap((row) => row.attacks!)
  assert.equal(result.sample.totals.volleys, result.sample.trace.length)
  assert.equal(result.sample.totals.bodyAttacks, allAttacks.filter((attack) => attack.actor === 'body').length)
  assert.equal(result.sample.totals.droneAttacks, allAttacks.filter((attack) => attack.actor === 'drone').length)
  const previousMisses = [0, 0, 0]
  for (const drone of result.sample.trace.flatMap((row) => row.drones)) {
    assert.equal(drone.missesBefore, previousMisses[drone.droneNumber - 1])
    previousMisses[drone.droneNumber - 1] = drone.missesAfter
  }
  for (const point of result.timeline) {
    assert.ok(point.effectiveDamage <= point.rawDamage + 1e-8)
  }
  close(result.sample.trace.reduce((sum, row) => sum + row.kills, 0), result.sample.totals.kills)
  close(result.sample.trace.reduce((sum, row) => sum + row.effectiveDamage, 0), result.sample.totals.effectiveDamage)
  close(result.timeline.at(-1)!.rawDamage, result.mean.rawDamage)
  close(result.timeline.at(-1)!.effectiveDamage, result.mean.effectiveDamage)
  close(result.timeline.at(-1)!.kills, result.mean.kills)
})

test('残り浮遊の切り替えは真偽値以外を受け付けない', () => {
  for (const value of [null, 0, 1, 'false', 'true', {}, []]) {
    const setup = input({ retargetRemainingDrones: value as unknown as boolean })
    assert.throws(() => simulateGoldenglowTargetSwitch(setup), RangeError)
    assert.throws(() => simulateGoldenglowTargetSwitchTrial(setup), RangeError)
  }
})

test('撃破で実際に予定が遅れた後続機だけを記録し、通常CDで待てる機体は延期に含めない', () => {
  const trial = runGoldenglowRetargetingTrial(prepareGoldenglowTargetSwitchSimulation(input({
    model: { ...model, activeDroneCount: 3, prdStep: 0.25 },
    enemyHp: 300, duration: 2.1, switchDelay: 0.1, retargetRemainingDrones: true,
  })), (droneIndex, attackIndex) => droneIndex === 0 && attackIndex === 0 ? 0 : 0.99, true)
  const delays = trial.trace[0].delays!
  assert.equal(delays.length, 2)
  assert.deepEqual(delays.map((delay) => [delay.actor, delay.droneNumber, delay.causeActor, delay.causeDroneNumber, delay.causeAttackIndex]), [
    ['drone', 2, 'drone', 1, 0], ['drone', 3, 'drone', 1, 0],
  ])
  for (const delay of delays) {
    assert.equal(delay.targetNumber, 1)
    assert.equal(delay.nextTargetNumber, 2)
    assert.equal(delay.previousAttackTime, 1)
    assert.equal(delay.nextAttackTime, 1.1)
    close(delay.addedDelay, 0.1)
  }
  assert.ok(trial.trace.slice(1).every((row) => row.delays === undefined))
  assert.deepEqual(trial.trace.map((row) => row.time), [1, 1.1, 2, 2.1])
})

test('延期原因は浮遊番号や個体攻撃序数ではなく同じ行の実攻撃indexを参照する', () => {
  const trial = simulateGoldenglowTargetSwitchTrial(input({
    skillIndex: 1, model: { ...model, activeDroneCount: 3 },
    enemyHp: 130, duration: 1.1, switchDelay: 0.1, retargetRemainingDrones: true,
  }))
  const row = trial.trace[0]
  assert.deepEqual(row.attacks!.map((attack) => [attack.actor, attack.droneNumber, attack.killed]), [
    ['body', undefined, false], ['drone', 1, false], ['drone', 2, true],
  ])
  assert.equal(row.delays!.length, 1)
  const delay = row.delays![0]
  assert.equal(delay.causeAttackIndex, 2)
  assert.equal(delay.causeActor, 'drone')
  assert.equal(delay.causeDroneNumber, 2)
  assert.equal(delay.droneNumber, 3)
  assert.equal(delay.targetNumber, row.attacks![delay.causeAttackIndex].targetNumber)
  assert.equal(delay.nextTargetNumber, 2)
  assert.equal(trial.trace[1].drones[0].droneNumber, 3)
})

test('待機が通常CDより長ければ攻撃済みの本体や機体も延期し、観測終端後の予定を残す', () => {
  for (const skillIndex of [1, 2, 3]) {
    const trial = simulateGoldenglowTargetSwitchTrial(input({
      skillIndex, model: { ...model, activeDroneCount: 3, prdStep: 1 },
      enemyHp: 80, duration: 1, switchDelay: 1.5, retargetRemainingDrones: true,
    }))
    assert.equal(trial.trace.length, 1)
    const row = trial.trace[0]
    assert.equal(row.attacks!.length, 1)
    const delays = row.delays!
    assert.equal(delays.length, skillIndex === 3 ? 3 : 4)
    const killer = row.attacks![0]
    const ownDelay = delays[0]
    assert.equal(ownDelay.actor, killer.actor)
    assert.equal(ownDelay.droneNumber, killer.droneNumber)
    assert.equal(ownDelay.previousAttackTime, 2)
    assert.equal(ownDelay.nextAttackTime, 2.5)
    assert.equal(ownDelay.addedDelay, 0.5)
    for (const delay of delays) {
      assert.equal(delay.causeActor, killer.actor)
      assert.equal(delay.causeDroneNumber, killer.droneNumber)
      assert.equal(delay.causeAttackIndex, 0)
      assert.equal(delay.targetNumber, 1)
      assert.equal(delay.nextTargetNumber, 2)
      assert.equal(delay.nextAttackTime, 2.5)
      assert.ok(delay.nextAttackTime > row.time)
    }
    for (const delay of delays.slice(1)) {
      assert.equal(delay.previousAttackTime, 1)
      assert.equal(delay.addedDelay, 1.5)
    }
  }
})

test('同じ未攻撃機の再延期は直前の予定と新しい撃破原因を別々に記録する', () => {
  const trial = runGoldenglowRetargetingTrial(prepareGoldenglowTargetSwitchSimulation(input({
    model: { ...model, activeDroneCount: 3, prdStep: 0.25 },
    enemyHp: 80, duration: 1.5, switchDelay: 0.4, retargetRemainingDrones: true,
  })), (droneIndex, attackIndex) => droneIndex < 2 && attackIndex === 0 ? 0 : 0.99, true)
  assert.deepEqual(trial.trace.map((row) => row.time), [1, 1.4])
  const first = trial.trace[0].delays!.find((delay) => delay.droneNumber === 3)!
  const second = trial.trace[1].delays![0]
  assert.equal(trial.trace[1].delays!.length, 1)
  assert.equal(second.droneNumber, 3)
  assert.equal(first.causeDroneNumber, 1)
  assert.equal(second.causeDroneNumber, 2)
  assert.equal(second.previousAttackTime, first.nextAttackTime)
  close(second.nextAttackTime, 1.8)
  close(second.addedDelay, 0.4)
  assert.equal(first.targetNumber, 1)
  assert.equal(first.nextTargetNumber, 2)
  assert.equal(second.targetNumber, 2)
  assert.equal(second.nextTargetNumber, 3)
  assert.ok(trial.trace.every((row) => row.attacks!.every((attack) => attack.droneNumber !== 3)))
})

test('遅延0・通常CD内の待機・撃破なし・従来モードは延期明細を生成しない', () => {
  for (const switchDelay of [0, 0.1, 1]) {
    const trial = simulateGoldenglowTargetSwitchTrial(input({
      enemyHp: 1, duration: 4, switchDelay, retargetRemainingDrones: true,
    }))
    assert.equal(trial.totals.kills, 4)
    assert.ok(trial.trace.every((row) => row.delays === undefined))
  }
  const multipleKills = simulateGoldenglowTargetSwitchTrial(input({
    skillIndex: 1, model: { ...model, activeDroneCount: 3, prdStep: 1 },
    enemyHp: 1, switchDelay: 0, retargetRemainingDrones: true,
  }))
  assert.ok(multipleKills.trace.every((row) => row.kills === 4 && row.delays === undefined))
  const noKills = simulateGoldenglowTargetSwitchTrial(input({
    enemyHp: 1_000_000, switchDelay: 5, retargetRemainingDrones: true,
  }))
  const legacy = simulateGoldenglowTargetSwitchTrial(input({ enemyHp: 1, switchDelay: 1 }))
  for (const trial of [noKills, legacy]) assert.ok(trial.trace.every((row) => row.delays === undefined))
})

test('延期トレースの有無で抽選回数・攻撃序数・ダメージ・時間推移を変えない', () => {
  const setup = input({
    skillIndex: 2, model: { ...model, activeDroneCount: 3, prdStep: 0.2 },
    enemyHp: 150, duration: 13.7, attackInterval: 0.137,
    switchDelay: 0.3, retargetRemainingDrones: true,
  })
  const prepared = prepareGoldenglowTargetSwitchSimulation(setup)
  const runs = [true, false].map((recordTrace) => {
    const calls: number[][] = []
    const timeline = [0, 3, setup.duration].map((time) => ({
      time, effectiveDamage: 0, rawDamage: 0, baselineRawDamage: 0, kills: 0,
    }))
    const trial = runGoldenglowRetargetingTrial(prepared, (droneIndex, attackIndex, misses) => {
      calls.push([droneIndex, attackIndex, misses])
      return (droneIndex + attackIndex) % 7 === 0 ? 0 : 0.99
    }, recordTrace, timeline)
    return { trial, calls, timeline }
  })
  assert.ok(runs[0].trial.trace.some((row) => row.delays?.length))
  assert.deepEqual(runs[1].trial.trace, [])
  assert.deepEqual(runs[0].calls, runs[1].calls)
  assert.deepEqual(runs[0].trial.totals, runs[1].trial.totals)
  assert.deepEqual(runs[0].timeline, runs[1].timeline)
  assert.equal(runs[0].calls.length, runs[0].trial.totals.droneAttacks)
  for (const row of runs[0].trial.trace) {
    for (const delay of row.delays ?? []) {
      const cause = row.attacks![delay.causeAttackIndex]
      assert.equal(cause.killed, true)
      assert.equal(delay.causeActor, cause.actor)
      assert.equal(delay.causeDroneNumber, cause.droneNumber)
      assert.equal(delay.targetNumber, cause.targetNumber)
      assert.equal(delay.nextTargetNumber, cause.targetNumber + 1)
      assert.ok(delay.addedDelay > prepared.timeTolerance)
      assert.equal(delay.addedDelay, delay.nextAttackTime - delay.previousAttackTime)
      close(delay.nextAttackTime, row.time + setup.switchDelay)
    }
  }
})
