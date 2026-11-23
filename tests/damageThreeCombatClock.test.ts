import test from 'node:test'
import assert from 'node:assert/strict'
import {
  simulateDamageThreeCombat, type CombatSkillProfile, type TimedHit,
} from '../src/lib/damageThreeCombatClock.ts'

const physical: TimedHit = { damage: 10, attribute: 'PHYSICAL' }
const arts: TimedHit = { damage: 50, attribute: 'ARTS' }
const normal = { interval: 1, hit: physical }
const profile: CombatSkillProfile = {
  normal, recovery: 'AUTO', initialSp: 0, cost: 5,
  skill: { kind: 'DURATION', duration: 1, attack: normal, scheduledHits: [{ offset: 0, hit: arts }] },
}

test('配置からの自然回復と初期SP。期間の終了時刻の発動は含めない', () => {
  assert.deepEqual(simulateDamageThreeCombat(profile, 5, null), {
    total: 40, baseline: 40, gain: 0, attribute: 'PHYSICAL',
  })
  // Initial skill at 5; after 1 s of lock and 5 s recovery, next skill at 11.
  assert.deepEqual(simulateDamageThreeCombat(profile, 12, null), {
    total: 210, baseline: 110, gain: 100, attribute: 'OTHER',
  })
  assert.equal(simulateDamageThreeCombat({ ...profile, initialSp: 5 }, 1, null).total, 50)
  assert.equal(simulateDamageThreeCombat({ ...profile, initialSp: 5 }, 0, null).total, 0)
})

test('攻撃回復の次撃強化は回復完了後の攻撃を置き換え、その強化攻撃ではSPを回復しない', () => {
  const next: CombatSkillProfile = { ...profile, recovery: 'ATTACK', cost: 2, skill: { kind: 'NEXT_ATTACK', hit: arts } }
  // Ordinary at 1, 2, 4, 5; empowered at 3, 6.
  assert.deepEqual(simulateDamageThreeCombat(next, 7, null), {
    total: 140, baseline: 60, gain: 80, attribute: 'OTHER',
  })
  assert.equal(simulateDamageThreeCombat({ ...next, initialSp: 2 }, 2, null).total, 50)
})

test('複数チャージ時は次撃待ちの端数SPを保持し、満タンでのみ回復を止める', () => {
  const stored: CombatSkillProfile = {
    ...profile, normal: { ...normal, interval: 3 }, cost: 4, initialSp: 4, maxCharges: 2,
    skill: { kind: 'NEXT_ATTACK', hit: arts },
  }
  // Hits at 3, 6, 9 spend charge 1 on 7, 6, 5 SP respectively.
  assert.equal(simulateDamageThreeCombat(stored, 10, null).total, 150)
  assert.equal(simulateDamageThreeCombat({ ...stored, maxCharges: 1 }, 10, null).total, 110)
  const defensive: CombatSkillProfile = {
    ...stored, initialSp: 0, cost: 2, recovery: 'DEFENSE', normal: { ...normal, interval: 5 },
  }
  // Incoming hits at 1–4 store two charges before the first outgoing hit.
  assert.equal(simulateDamageThreeCombat(defensive, 6, 1).total, 50)
  // With no further incoming hits, 100 initial SP caps at two stored hits.
  assert.equal(simulateDamageThreeCombat({ ...defensive, initialSp: 100 }, 16, null).total, 110)
  assert.equal(simulateDamageThreeCombat({ ...defensive, initialSp: 3 }, 11, null).total, 60)
  // Three stored hits cover 2, 4 and 6 s. At 8 s the second incoming hit is still pending.
  const fast = { ...defensive, normal: { ...normal, interval: 2 }, initialSp: 6, maxCharges: 3 }
  assert.equal(simulateDamageThreeCombat(fast, 9, 4).total, 160)
})

test('スキル効果時間にSPを回復せず、終了時にだけ終撃を加える', () => {
  const lasting: CombatSkillProfile = { ...profile, initialSp: 2, cost: 2, skill: {
    kind: 'DURATION', duration: 3, attack: { interval: 1, hit: { damage: 20, attribute: 'PHYSICAL' } }, final: arts,
  } }
  assert.deepEqual(simulateDamageThreeCombat(lasting, 3, null), {
    total: 40, baseline: 20, gain: 20, attribute: 'PHYSICAL',
  })
  // 20 × 2, final 50 and ordinary 10 at 3, ordinary 10 at 4, then active hits at 5, 6 and 7.
  assert.equal(simulateDamageThreeCombat(lasting, 8, null).total, 170)
})

test('被撃回復と反撃は独立し、発動に使った被撃では反撃しない', () => {
  const counter: CombatSkillProfile = { ...profile, recovery: 'DEFENSE', cost: 1, skill: {
    kind: 'DURATION', duration: 5, attack: null, counter: arts, counterCooldown: 2,
  } }
  assert.equal(simulateDamageThreeCombat(counter, 6, null).total, 50)
  // Ordinary at 1, activation after that incoming hit, counters at 2 and 4.
  assert.deepEqual(simulateDamageThreeCombat(counter, 6, 1), {
    total: 110, baseline: 50, gain: 60, attribute: 'OTHER',
  })
  assert.equal(simulateDamageThreeCombat(counter, 5, 2).total, 70)
})

test('常時反撃と攻撃停止による負の差分を含む', () => {
  const passive: CombatSkillProfile = {
    ...profile, cost: 0, skill: { kind: 'PASSIVE', attack: null, counter: arts, counterCooldown: 3 },
  }
  assert.deepEqual(simulateDamageThreeCombat(passive, 6, null), {
    total: 0, baseline: 50, gain: -50, attribute: 'OTHER',
  })
  assert.equal(simulateDamageThreeCombat(passive, 6, 2).total, 50)
})

test('スキル動作の連撃と爆発を発動時刻に合わせ、期限後の攻撃を数えない', () => {
  const casting: CombatSkillProfile = { ...profile, initialSp: 2, cost: 2, skill: {
    kind: 'DURATION', duration: 4, attack: null, scheduledHits: [
      { offset: 0, hit: physical }, { offset: 1, hit: physical }, { offset: 1, hit: physical }, { offset: 3, hit: arts },
    ],
  } }
  // First cast starts on deployment; the second starts at 6 after its SP lock ends at 4.
  assert.equal(simulateDamageThreeCombat(casting, 0, null).total, 0)
  assert.equal(simulateDamageThreeCombat(casting, 1, null).total, 10)
  assert.equal(simulateDamageThreeCombat(casting, 3, null).total, 30)
  assert.equal(simulateDamageThreeCombat(casting, 4, null).total, 80)
  assert.equal(simulateDamageThreeCombat(casting, 6, null).total, 90)
  assert.equal(simulateDamageThreeCombat(casting, 9, null).total, 120)
  assert.equal(simulateDamageThreeCombat(casting, 10, null).total, 170)
})

test('スキル動作の時刻が範囲外または逆順なら除外できる', () => {
  for (const offsets of [[-1], [4], [5], [Infinity], [NaN], [2, 1]]) {
    const skill: CombatSkillProfile['skill'] = {
      kind: 'DURATION', duration: 4, attack: null,
      scheduledHits: offsets.map(offset => ({ offset, hit: arts })),
    }
    assert.throws(() => simulateDamageThreeCombat({ ...profile, skill }, 30, null), RangeError)
  }
})

test('配置時発動は効果が終われば通常攻撃に戻り、再発動しない', () => {
  const deployed: CombatSkillProfile = { ...profile, initialSp: 0, cost: 0, skill: {
    kind: 'DURATION', onDeployOnly: true, duration: 3, attack: { ...normal, hit: arts },
  } }
  // Active hits at 1 and 2; ordinary hits at 3–6.
  assert.deepEqual(simulateDamageThreeCombat(deployed, 7, 1), {
    total: 140, baseline: 60, gain: 80, attribute: 'OTHER',
  })
})

test('攻撃間隔変更で進捗を保ち、小数間隔の端数で期間末の攻撃を拾わない', () => {
  const speed: CombatSkillProfile = {
    ...profile, normal: { ...normal, interval: 2 }, cost: 1,
    skill: { kind: 'DURATION', duration: Infinity, attack: { ...normal, interval: 1 } },
  }
  // Halfway to its ordinary hit at 1 s, then another 0.5 s at the new interval.
  assert.equal(simulateDamageThreeCombat(speed, 1.5, null).total, 0)
  assert.equal(simulateDamageThreeCombat(speed, 1.6, null).total, 10)
  const thirds = { ...profile, normal: { ...normal, interval: 1 / 3 }, cost: 1000 }
  assert.deepEqual(simulateDamageThreeCombat(thirds, 30, null), {
    total: 890, baseline: 890, gain: 0, attribute: 'PHYSICAL',
  })
})

test('無効な時計条件は集計に使わない', () => {
  assert.throws(() => simulateDamageThreeCombat(profile, Infinity, null), RangeError)
  assert.throws(() => simulateDamageThreeCombat(profile, 30, 0), RangeError)
  assert.throws(() => simulateDamageThreeCombat({ ...profile, cost: 0 }, 30, 2), RangeError)
  assert.throws(() => simulateDamageThreeCombat({ ...profile, normal: { ...normal, interval: 0 } }, 30, null), RangeError)
})
