import test from 'node:test'
import assert from 'node:assert/strict'
import {
  prepareGoldenglowTargetSwitchSimulation,
  runGoldenglowRetargetingTrial,
  simulateGoldenglowTargetSwitchTrial,
  type GoldenglowTargetSwitchDelayTrace,
  type GoldenglowTargetSwitchInput,
} from '../src/lib/goldenglowTargetSwitch.ts'
import {
  buildGoldenglowTargetSwitchHistory,
  buildGoldenglowTargetSwitchHistoryRows,
  groupGoldenglowTargetSwitchHistoryTargets,
  type GoldenglowTargetSwitchHistoryEvent,
} from '../src/lib/goldenglowTargetSwitchHistory.ts'
import type { GoldenglowExplosionModel } from '../src/lib/goldenglowExplosion.ts'

const model: GoldenglowExplosionModel = {
  talentName: '電流暴走', talentDescription: '', damageType: 'ARTS',
  attackScale: 3, attackScalePercent: 300, nominalChancePercent: 10,
  prdStep: 0.25, prdMaxStack: 1_000,
  additionalDroneCount: 0, activeDroneCount: 3, resistanceIgnoreFixed: 0,
  droneInitialAttackScale: 0.2, droneInitialAttackScalePercent: 20,
  droneAttackScaleStep: 0.15, droneAttackScaleStepPercent: 15,
  droneMaxAttackScale: 1.1, droneMaxAttackScalePercent: 110, droneMaxStack: 6,
}

function input(overrides: Partial<GoldenglowTargetSwitchInput> = {}): GoldenglowTargetSwitchInput {
  return {
    model, skillIndex: 3, effectiveAttack: 100, attackInterval: 1,
    duration: 2.1, enemyHp: 300, enemyDefense: 0, enemyResistance: 0,
    switchDelay: 0.1, retargetRemainingDrones: true, trials: 1, seed: 42,
    ...overrides,
  }
}

function delayedTrial(overrides: Partial<GoldenglowTargetSwitchInput> = {}) {
  return runGoldenglowRetargetingTrial(prepareGoldenglowTargetSwitchSimulation(input(overrides)),
    (droneIndex, attackIndex) => droneIndex === 0 && attackIndex === 0 ? 0 : 0.99, true)
}

function deepFreeze(value: object): void {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === 'object') deepFreeze(child)
  }
  Object.freeze(value)
}

function eventLabel(event: GoldenglowTargetSwitchHistoryEvent): string {
  const actor = event.kind === 'attack' ? event.entry.attack : event.delay
  return `${event.kind}:${actor.actor === 'body' ? 'body' : `drone${actor.droneNumber}`}`
}

test('1秒・1.1秒・2秒・2.1秒の実攻撃を展開し、浮遊ごとの前後時刻と連番を保つ', () => {
  const trial = delayedTrial()
  const history = buildGoldenglowTargetSwitchHistory(trial)
  assert.deepEqual(history.map((entry) => [entry.traceIndex, entry.attackIndex, entry.time, entry.attack.droneNumber]), [
    [0, 0, 1, 1], [1, 0, 1.1, 2], [1, 1, 1.1, 3],
    [2, 0, 2, 1], [3, 0, 2.1, 2], [3, 1, 2.1, 3],
  ])
  assert.deepEqual(history.map((entry) => [entry.actorAttackNumber, entry.previousAttackTime, entry.nextAttackTime]), [
    [1, null, 2], [1, null, 2.1], [1, null, 2.1],
    [2, 1, null], [2, 1.1, null], [2, 1.1, null],
  ])
  for (const entry of history) {
    assert.equal(entry.attack, trial.trace[entry.traceIndex].attacks![entry.attackIndex])
    assert.equal(entry.drone?.droneNumber, entry.attack.droneNumber)
  }
  assert.equal(history[1].drone, trial.trace[1].drones[0])
  assert.equal(history[2].drone, trial.trace[1].drones[1])
  assert.equal(history.length, trial.totals.droneAttacks)
})

test('浮遊記録の配列位置が変わっても機体番号で通常倍率・PRDの記録を結び付ける', () => {
  const trial = delayedTrial()
  for (const row of trial.trace) row.drones.reverse()
  const history = buildGoldenglowTargetSwitchHistory(trial)
  assert.deepEqual(history.map((entry) => entry.drone!.droneNumber), [1, 2, 3, 1, 2, 3])
  assert.deepEqual(history.map((entry) => entry.drone!.normalStackBefore), [0, 0, 0, 0, 1, 1])
  assert.deepEqual(history.map((entry) => entry.drone!.missesBefore), [0, 0, 0, 0, 1, 1])
  assert.equal(history[1].drone, trial.trace[1].drones[1])
  assert.equal(history[2].drone, trial.trace[1].drones[0])
})

test('S1・S2は着弾した本体だけを含み、S3では本体を生成しない', () => {
  for (const skillIndex of [1, 2]) {
    const trial = delayedTrial({ skillIndex, enemyHp: 80, duration: 2.05 })
    const history = buildGoldenglowTargetSwitchHistory(trial)
    const body = history.filter((entry) => entry.attack.actor === 'body')
    assert.deepEqual(body.map((entry) => [entry.time, entry.actorAttackNumber, entry.previousAttackTime, entry.nextAttackTime]), [
      [1, 1, null, 2], [2, 2, 1, null],
    ])
    assert.ok(body.every((entry) => entry.drone === null))
    assert.equal(body.length, trial.totals.bodyAttacks)
    assert.equal(history.length, trial.totals.bodyAttacks + trial.totals.droneAttacks)
  }
  const s3 = buildGoldenglowTargetSwitchHistory(delayedTrial())
  assert.ok(s3.every((entry) => entry.attack.actor === 'drone'))
})

test('同時刻の本体・浮遊番号順と各攻撃の目標を元の記録どおり維持する', () => {
  const trial = delayedTrial({ skillIndex: 2, enemyHp: 80, duration: 1, switchDelay: 0 })
  const history = buildGoldenglowTargetSwitchHistory(trial)
  assert.deepEqual(history.map((entry) => [entry.time, entry.attack.actor, entry.attack.droneNumber, entry.attack.targetNumber]), [
    [1, 'body', undefined, 1], [1, 'drone', 1, 2], [1, 'drone', 2, 3], [1, 'drone', 3, 3],
  ])
  assert.ok(history.every((entry) => entry.actorAttackNumber === 1 && entry.previousAttackTime === null && entry.nextAttackTime === null))
})

test('2.05秒の終端では未着弾の後続機を追加せず、次回時刻を推測しない', () => {
  const trial = delayedTrial({ duration: 2.05 })
  const history = buildGoldenglowTargetSwitchHistory(trial)
  assert.deepEqual(history.map((entry) => [entry.time, entry.attack.droneNumber, entry.nextAttackTime]), [
    [1, 1, 2], [1.1, 2, null], [1.1, 3, null], [2, 1, null],
  ])
  assert.equal(history.length, 4)
  assert.equal(history.reduce((sum, entry) => sum + entry.attack.damage, 0), trial.totals.rawDamage)
})

test('トレースなし・初撃前・従来の合算記録から実攻撃を作り出さない', () => {
  const withoutTrace = runGoldenglowRetargetingTrial(prepareGoldenglowTargetSwitchSimulation(input()), () => 0.99)
  assert.ok(withoutTrace.totals.droneAttacks > 0)
  const beforeFirst = delayedTrial({ duration: 0.9 })
  const legacy = simulateGoldenglowTargetSwitchTrial(input({ retargetRemainingDrones: false }))
  assert.ok(legacy.trace.length > 0)
  for (const trial of [withoutTrace, beforeFirst, legacy]) {
    assert.deepEqual(buildGoldenglowTargetSwitchHistory(trial), [])
  }
})

test('ダメージ0でも記録された攻撃を含め、対応する浮遊明細がない場合だけnullにする', () => {
  const trial = delayedTrial({ effectiveAttack: 0, skillIndex: 1, duration: 2 })
  const full = buildGoldenglowTargetSwitchHistory(trial)
  assert.equal(full.length, 8)
  assert.ok(full.every((entry) => entry.attack.damage === 0))
  assert.equal(full.filter((entry) => entry.attack.actor === 'body').length, 2)
  trial.trace[0].drones = trial.trace[0].drones.filter((drone) => drone.droneNumber !== 2)
  const missing = buildGoldenglowTargetSwitchHistory(trial)
  assert.equal(missing.length, 8)
  assert.equal(missing[2].attack.droneNumber, 2)
  assert.equal(missing[2].drone, null)
  assert.equal(missing[6].drone?.droneNumber, 2)
})

test('100行を超える履歴でも個体の前後時刻を全体から求め、凍結した入力を変更しない', () => {
  const trial = delayedTrial({
    skillIndex: 1, duration: 110, enemyHp: 1_000_000_000,
    model: { ...model, prdStep: 0 },
  })
  assert.equal(trial.trace.length, 110)
  const snapshot = structuredClone(trial)
  deepFreeze(trial)
  const history = buildGoldenglowTargetSwitchHistory(trial)
  assert.equal(history.length, 440)
  for (const entry of history) {
    assert.equal(entry.actorAttackNumber, entry.traceIndex + 1)
    assert.equal(entry.previousAttackTime, entry.time === 1 ? null : entry.time - 1)
    assert.equal(entry.nextAttackTime, entry.time === 110 ? null : entry.time + 1)
  }
  // A visible page still knows the actor's adjacent attacks on other pages.
  const secondPage = history.slice(100, 200)
  assert.equal(secondPage[0].previousAttackTime, 25)
  assert.equal(secondPage.at(-1)!.nextAttackTime, 51)
  assert.deepEqual(trial, snapshot)
  assert.deepEqual(buildGoldenglowTargetSwitchHistory(trial), history)
})

test('時刻行は撃破攻撃の直後に実際の延期を並べ、後続機の着弾行と区別する', () => {
  const trial = delayedTrial()
  const rows = buildGoldenglowTargetSwitchHistoryRows(trial)
  assert.deepEqual(rows.map((row) => [row.traceIndex, row.time, row.events.map(eventLabel)]), [
    [0, 1, ['attack:drone1', 'delay:drone2', 'delay:drone3']],
    [1, 1.1, ['attack:drone2', 'attack:drone3']],
    [2, 2, ['attack:drone1']],
    [3, 2.1, ['attack:drone2', 'attack:drone3']],
  ])
  const delays = rows[0].events.filter((event) => event.kind === 'delay')
  assert.equal(delays.length, 2)
  for (const [index, event] of delays.entries()) {
    assert.equal(event.traceIndex, 0)
    assert.equal(event.delayIndex, index)
    assert.equal(event.time, 1)
    assert.equal(event.delay, trial.trace[0].delays![index])
    assert.equal(event.delay.causeAttackIndex, 0)
    assert.equal(event.delay.previousAttackTime, 1)
    assert.equal(event.delay.nextAttackTime, 1.1)
  }
  assert.deepEqual(rows.flatMap((row) => row.events.flatMap((event) => event.kind === 'attack' ? [event.entry] : [])),
    buildGoldenglowTargetSwitchHistory(trial))
})

test('撃破した機体の攻撃と延期を同じセル用に両方残し、終了後の予定から実攻撃を作らない', () => {
  const trial = delayedTrial({ switchDelay: 1.5, duration: 1 })
  const rows = buildGoldenglowTargetSwitchHistoryRows(trial)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].time, 1)
  assert.deepEqual(rows[0].events.map(eventLabel), ['attack:drone1', 'delay:drone1', 'delay:drone2', 'delay:drone3'])
  const firstActor = rows[0].events.filter((event) => (
    event.kind === 'attack' ? event.entry.attack.droneNumber : event.delay.droneNumber
  ) === 1)
  assert.equal(firstActor.length, 2)
  const [attack, delay] = firstActor
  assert.equal(attack.kind, 'attack')
  assert.equal(delay.kind, 'delay')
  if (attack.kind !== 'attack' || delay.kind !== 'delay') assert.fail('expected an attack and its schedule change')
  assert.equal(attack.entry.nextAttackTime, null)
  assert.equal(delay.delay.previousAttackTime, 2)
  assert.equal(delay.delay.nextAttackTime, 2.5)
  assert.equal(delay.delay.addedDelay, 0.5)
  assert.equal(rows.flatMap((row) => row.events).filter((event) => event.kind === 'attack').length, 1)
})

test('同時刻の同じ機体に複数の延期記録があっても原因攻撃の順と各記録を落とさない', () => {
  const trial = delayedTrial({ skillIndex: 1, enemyHp: 80, duration: 1, switchDelay: 0 })
  const first: GoldenglowTargetSwitchDelayTrace = {
    actor: 'drone', droneNumber: 2, targetNumber: 1, nextTargetNumber: 2,
    causeActor: 'body', causeAttackIndex: 0,
    previousAttackTime: 1, nextAttackTime: 1.1, addedDelay: 0.1,
  }
  const second: GoldenglowTargetSwitchDelayTrace = {
    actor: 'drone', droneNumber: 2, targetNumber: 2, nextTargetNumber: 3,
    causeActor: 'drone', causeDroneNumber: 1, causeAttackIndex: 1,
    previousAttackTime: 1.1, nextAttackTime: 1.2, addedDelay: 0.1,
  }
  trial.trace[0].delays = [first, second]
  const rows = buildGoldenglowTargetSwitchHistoryRows(trial)
  assert.deepEqual(rows[0].events.map(eventLabel), [
    'attack:body', 'delay:drone2', 'attack:drone1', 'delay:drone2', 'attack:drone2', 'attack:drone3',
  ])
  const delays = rows[0].events.filter((event) => event.kind === 'delay')
  assert.deepEqual(delays.map((event) => event.delayIndex), [0, 1])
  assert.equal(delays[0].delay, first)
  assert.equal(delays[1].delay, second)
})

test('延期0の複数撃破でも延期イベントを推測せず、未記録の実攻撃も補わない', () => {
  const zeroDelay = delayedTrial({ skillIndex: 2, enemyHp: 80, duration: 1, switchDelay: 0 })
  const rows = buildGoldenglowTargetSwitchHistoryRows(zeroDelay)
  assert.deepEqual(rows[0].events.map(eventLabel), ['attack:body', 'attack:drone1', 'attack:drone2', 'attack:drone3'])
  for (const trial of [
    delayedTrial({ duration: 0.9 }),
    simulateGoldenglowTargetSwitchTrial(input({ retargetRemainingDrones: false })),
    runGoldenglowRetargetingTrial(prepareGoldenglowTargetSwitchSimulation(input()), () => 0.99),
  ]) assert.deepEqual(buildGoldenglowTargetSwitchHistoryRows(trial), [])
})

test('時刻100行の境界を越えても実攻撃の前後を結び、延期を含む凍結入力を変更しない', () => {
  const trial = delayedTrial({ duration: 110, enemyHp: 300 })
  const snapshot = structuredClone(trial)
  deepFreeze(trial)
  const rows = buildGoldenglowTargetSwitchHistoryRows(trial)
  assert.ok(rows.length > 100)
  const expected = buildGoldenglowTargetSwitchHistory(trial)
  const firstPage = rows.slice(0, 100)
  const secondPage = rows.slice(100, 200)
  assert.equal(firstPage.length, 100)
  assert.equal(secondPage[0].traceIndex, 100)
  const previousByActor = new Map<string, number>()
  for (const row of firstPage) {
    for (const event of row.events) {
      if (event.kind === 'attack') previousByActor.set(eventLabel(event), event.entry.time)
    }
  }
  const firstOnSecondPage = secondPage[0].events.find((event) => event.kind === 'attack')!
  assert.equal(firstOnSecondPage.entry.previousAttackTime, previousByActor.get(eventLabel(firstOnSecondPage)))
  assert.deepEqual(rows.flatMap((row) => row.events.flatMap((event) => event.kind === 'attack' ? [event.entry] : [])), expected)
  assert.deepEqual(buildGoldenglowTargetSwitchHistoryRows(trial), rows)
  assert.deepEqual(trial, snapshot)
})

test('切り替え0秒の本体と浮遊による複数敵への攻撃を、敵ごとの最初と最後のHPでまとめる', () => {
  const trial = delayedTrial({ skillIndex: 1, enemyHp: 80, duration: 1, switchDelay: 0 })
  const [row] = buildGoldenglowTargetSwitchHistoryRows(trial)
  const targets = groupGoldenglowTargetSwitchHistoryTargets(row)
  assert.deepEqual(targets.map((target) => [target.traceIndex, target.time, target.targetNumber, target.hpBefore, target.hpAfter, target.killed]), [
    [0, 1, 1, 80, 0, true], [0, 1, 2, 80, 0, true], [0, 1, 3, 80, 40, false],
  ])
  assert.deepEqual(targets.map((target) => target.attacks.map((entry) => entry.attack.actor === 'body' ? 'body' : entry.attack.droneNumber)), [
    ['body'], [1], [2, 3],
  ])
  assert.equal(targets[2].attacks[0].attack.hpAfter, 60)
  assert.equal(targets[2].attacks[1].attack.hpBefore, 60)
  assert.equal(targets[2].hpBefore - targets[2].hpAfter,
    targets[2].attacks.reduce((sum, entry) => sum + entry.attack.effectiveDamage, 0))
})

test('切り替え0.1秒の敵HPは実際にその敵へ着弾した時刻にだけ現れる', () => {
  const trial = delayedTrial({ skillIndex: 1, enemyHp: 80, duration: 1.2, switchDelay: 0.1 })
  const rows = buildGoldenglowTargetSwitchHistoryRows(trial)
  assert.deepEqual(rows.map((row) => groupGoldenglowTargetSwitchHistoryTargets(row)
    .map((target) => [target.time, target.targetNumber, target.hpBefore, target.hpAfter, target.killed])), [
    [[1, 1, 80, 0, true]], [[1.1, 2, 80, 0, true]], [[1.2, 3, 80, 40, false]],
  ])
  assert.ok(rows[0].events.some((event) => event.kind === 'delay' && event.delay.nextTargetNumber === 2))
  assert.ok(rows[1].events.some((event) => event.kind === 'delay' && event.delay.nextTargetNumber === 3))
  assert.equal(groupGoldenglowTargetSwitchHistoryTargets(rows[0])[0].attacks.length, 1)
  assert.equal(groupGoldenglowTargetSwitchHistoryTargets(rows[2])[0].attacks.length, 2)
})

test('丸めると0になる正の残HPと本当の撃破を区別し、ダメージ0の実攻撃も残す', () => {
  const onlyNormal = { ...model, activeDroneCount: 1, prdStep: 0 }
  const survivor = delayedTrial({ model: onlyNormal, enemyHp: 20.0001, duration: 1 })
  const [target] = groupGoldenglowTargetSwitchHistoryTargets(buildGoldenglowTargetSwitchHistoryRows(survivor)[0])
  assert.ok(target.hpAfter > 0)
  assert.equal(new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 }).format(target.hpAfter), '0')
  assert.equal(target.killed, false)
  assert.equal(target.hpAfter, target.attacks[0].attack.hpAfter)

  const killed = delayedTrial({ model: onlyNormal, enemyHp: 20, duration: 1 })
  const [defeated] = groupGoldenglowTargetSwitchHistoryTargets(buildGoldenglowTargetSwitchHistoryRows(killed)[0])
  assert.equal(defeated.hpAfter, 0)
  assert.equal(defeated.killed, true)

  const zeroDamage = delayedTrial({ effectiveAttack: 0, enemyHp: 0.0001, skillIndex: 1, duration: 1 })
  const [unchanged] = groupGoldenglowTargetSwitchHistoryTargets(buildGoldenglowTargetSwitchHistoryRows(zeroDamage)[0])
  assert.equal(unchanged.attacks.length, 4)
  assert.equal(unchanged.hpBefore, 0.0001)
  assert.equal(unchanged.hpAfter, 0.0001)
  assert.equal(unchanged.killed, false)
})

test('延期だけの部分履歴や空の行から未攻撃の敵を作り出さない', () => {
  const trial = delayedTrial({ duration: 1 })
  const [row] = buildGoldenglowTargetSwitchHistoryRows(trial)
  const onlyDelays = { ...row, events: row.events.filter((event) => event.kind === 'delay') }
  assert.ok(onlyDelays.events.length > 0)
  deepFreeze(onlyDelays)
  assert.deepEqual(groupGoldenglowTargetSwitchHistoryTargets(onlyDelays), [])
  assert.deepEqual(groupGoldenglowTargetSwitchHistoryTargets({ ...row, events: [] }), [])
})

test('敵の初出順・実攻撃の参照順を保ち、凍結した行と元トレースを変更しない', () => {
  const trial = delayedTrial({ skillIndex: 1, enemyHp: 80, duration: 1, switchDelay: 0 })
  const [row] = buildGoldenglowTargetSwitchHistoryRows(trial)
  // Encounter order is authoritative even when imported target numbers are not sorted.
  const targetNumbers = [9, 3, 7]
  for (const event of row.events) {
    if (event.kind === 'attack') event.entry.attack.targetNumber = targetNumbers[event.entry.attack.targetNumber - 1]
  }
  const snapshot = structuredClone({ trial, row })
  deepFreeze(trial)
  deepFreeze(row)
  const targets = groupGoldenglowTargetSwitchHistoryTargets(row)
  assert.deepEqual(targets.map((target) => target.targetNumber), [9, 3, 7])
  const attacks = row.events.flatMap((event) => event.kind === 'attack' ? [event.entry] : [])
  assert.deepEqual(targets.flatMap((target) => target.attacks), attacks)
  assert.equal(targets[0].attacks[0], attacks[0])
  assert.equal(targets[2].attacks[0], attacks[2])
  assert.equal(targets[2].attacks[1], attacks[3])
  targets[0].hpAfter = 999
  targets[0].attacks.length = 0
  assert.deepEqual({ trial, row }, snapshot)
  assert.equal(groupGoldenglowTargetSwitchHistoryTargets(row)[0].hpAfter, 0)
})
