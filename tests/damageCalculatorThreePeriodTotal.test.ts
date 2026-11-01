import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateDamageThreePeriodTotal, resolveDamageThreeStageDuration,
  type DamageThreePeriodTotalInput } from '../src/lib/damageCalculatorThreePeriodTotal.ts'
import type { GuardStage } from '../src/lib/guardCombatTypes.ts'
import type { SkillStructureStage } from '../src/lib/skillStructure.ts'

const stage: GuardStage = {
  id: 'active', label: '通常', kind: 'NORMAL', duration: 12.5,
  actions: [{ label: '攻撃', damageType: 'PHYSICAL', scale: 1 }],
  periodTotal: { kind: 'CONSTANT_RATE' },
}
const input: DamageThreePeriodTotalInput = {
  stage, attackKind: 'NORMAL', combinedDps: 123.456, allTargetsCombinedDps: 370.368,
}

test('段階の持続時間は小数を保持し、スキルの共通持続時間で上書きしない', () => {
  assert.equal(resolveDamageThreeStageDuration(stage, { sourceDuration: 30 }), 12.5)
  const legacy: SkillStructureStage = {
    id: 'active', label: '通常', applicability: null, effects: [],
    duration: { type: 'FIXED_SECONDS', seconds: 18 }, endCondition: { type: 'SECONDS_ELAPSED', seconds: 18 },
  }
  assert.equal(resolveDamageThreeStageDuration(legacy, { sourceDuration: 999 }), 18)
  const conditional: GuardStage = { ...stage, duration: {
    op: 'if', input: 'skillActivationCount', comparison: 'GTE', value: 2,
    yes: { key: 'enhance_duration' }, no: 15,
  } }
  const blackboard = [{ key: 'enhance_duration', value: 25 }]
  assert.equal(resolveDamageThreeStageDuration(conditional, { blackboard, conditions: { skillActivationCount: 1 } }), 15)
  assert.equal(resolveDamageThreeStageDuration(conditional, { blackboard, conditions: { skillActivationCount: 2 } }), 25)
  assert.equal(resolveDamageThreeStageDuration(conditional, { conditions: { skillActivationCount: 2 } }), null)
})

test('非有限期間・弾薬数・欠落値を秒へ変換しない', () => {
  for (const duration of [-1, 0, NaN, Infinity, 'UNTIL_EXIT'] as const) {
    assert.equal(resolveDamageThreeStageDuration({ ...stage, duration }, { sourceDuration: 30 }), null)
  }
  const fallback = { ...stage, duration: undefined }
  assert.equal(resolveDamageThreeStageDuration(fallback, { sourceDuration: 8.5 }), 8.5)
  assert.equal(resolveDamageThreeStageDuration(fallback, { sourceDuration: -1 }), null)
  assert.equal(resolveDamageThreeStageDuration(undefined, { sourceDuration: 30 }), null)
  const ammo: GuardStage = { ...stage, periodTotal: { kind: 'UNSUPPORTED', reason: '弾薬制', duration: 'AMMO' } }
  assert.equal(resolveDamageThreeStageDuration(ammo, { sourceDuration: 30 }), null)
  assert.equal(calculateDamageThreePeriodTotal({ ...input, stage: ammo }).totalDamageReason, '弾薬制')
})

test('未丸めの率を期間に掛け、1体と全対象をそれぞれ計算する', () => {
  const result = calculateDamageThreePeriodTotal(input)
  assert.equal(result.durationSeconds, 12.5)
  assert.equal(result.totalDamage, 123.456 * 12.5)
  assert.equal(result.allTargetsTotalDamage, 370.368 * 12.5)
  assert.equal(result.totalDamageReason, null)
  assert.equal(calculateDamageThreePeriodTotal({ ...input, combinedDps: 0, allTargetsCombinedDps: 0 }).totalDamage, 0)
})

test('明示した対応能力がなければ、正の持続時間とDPSだけで総量を作らない', () => {
  for (const patch of [
    { stage: { ...stage, periodTotal: undefined } },
    { stage: { ...stage, periodTotal: { kind: 'UNSUPPORTED' as const, reason: '攻撃力が上昇する' } } },
    { attackKind: 'NEXT_ATTACK' as const },
    { attackKind: 'COUNTER' as const },
    { attackKind: 'SKILL_ACTION' as const },
    { hasUnsupportedTalentDamage: true },
    { hasCalculationErrors: true },
  ]) {
    const result = calculateDamageThreePeriodTotal({ ...input, ...patch })
    assert.equal(result.totalDamage, null)
    assert.equal(result.allTargetsTotalDamage, null)
    assert.ok(result.totalDamageReason)
  }
})

test('継続ダメージの率だけでは期間合計を算出しない', () => {
  // A numeric periodic rate (even zero) represents a source whose timeline is still unreviewed.
  for (const damageOverTimeDps of [0, 125]) {
    const result = calculateDamageThreePeriodTotal({ ...input, damageOverTimeDps })
    assert.equal(result.durationSeconds, 12.5)
    assert.equal(result.totalDamage, null)
    assert.match(result.totalDamageReason!, /継続ダメージ/)
  }
})

test('欠落・不正・オーバーフローした数値を0やInfinityで表示しない', () => {
  for (const key of ['combinedDps', 'allTargetsCombinedDps'] as const) {
    for (const value of [null, NaN, Infinity, -1, Number.MAX_VALUE]) {
      const result = calculateDamageThreePeriodTotal({ ...input, [key]: value })
      assert.equal(result.totalDamage, null)
      assert.equal(result.allTargetsTotalDamage, null)
      assert.ok(result.totalDamageReason)
    }
  }
})
