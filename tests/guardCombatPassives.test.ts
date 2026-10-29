import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { evaluateGuardPassives, getGuardPassiveInputs } from '../src/lib/guardCombatPassives.ts'
import { evaluateGuardTraits } from '../src/lib/guardTraitEvaluation.ts'
import { findGuardSkillRecipe } from '../src/lib/guardSkillRecipes.ts'
import { mergeGuardInputs, resolveGuardConditions } from '../src/lib/guardCombatValues.ts'
import type { SkillRecord, RawCharacterTalent, RawSkillLevel } from '../src/types/skill.ts'
import type { GuardConditions } from '../src/lib/guardCombatTypes.ts'

interface Source {
  id: string; name: string; trait: string; subProfessionId: string; talents: RawCharacterTalent[]
  skills: { skillIndex: number; skillId: string; supported: boolean; raw: RawSkillLevel }[]
}
const sources = (JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardSources.json', import.meta.url), 'utf8')) as { guards: Source[] }).guards
const profiles = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardProfiles.json', import.meta.url), 'utf8')) as {
  operatorId: string; operatorProfile: SkillRecord['operatorProfile']
}[]
function record(id: string, skillIndex = 1): SkillRecord {
  const source = sources.find(source => source.id === id)!
  const skill = source.skills.find(skill => skill.skillIndex === skillIndex)!
  return {
    operatorId: id, operatorName: source.name, profession: 'WARRIOR', rarity: 6, skillIndex,
    skillId: skill.skillId, raw: structuredClone(skill.raw),
    skillLevels: Array.from({ length: 10 }, () => structuredClone(skill.raw)),
    operatorProfile: { phases: [{}, {}, { maxLevel: 90 }], favorKeyFrames: [],
      affiliationIds: structuredClone(profiles.find(profile => profile.operatorId === id)?.operatorProfile.affiliationIds),
      traitDescription: source.trait, talents: structuredClone(source.talents) },
    subProfessionId: source.subProfessionId,
  } as SkillRecord
}
function evaluate(id: string, conditions: GuardConditions = {}, skillIndex = 1,
  kind: 'NORMAL' | 'NEXT_ATTACK' | 'SKILL_ACTION' = 'NORMAL') {
  return evaluateGuardPassives(record(id, skillIndex), conditions, { kind, skillIndex, stageId: 'active' })
}
function close(actual: number, expected: number) { assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`) }
function traitRecord(id: string, skillIndex = 1): SkillRecord {
  return { ...record(id, skillIndex), operatorProfile: structuredClone(profiles.find(profile => profile.operatorId === id)!.operatorProfile) }
}
function traits(operator: SkillRecord, conditions: GuardConditions = {}, stageId?: string) {
  const recipe = findGuardSkillRecipe(operator.operatorId, operator.skillIndex)!
  const stage = stageId ? recipe.stages.find(stage => stage.id === stageId)! : recipe.stages[0]
  const resolved = resolveGuardConditions(mergeGuardInputs(getGuardPassiveInputs(operator.operatorId), recipe.inputs), conditions)
  assert.deepEqual(resolved.errors, [])
  const board = new Map(operator.raw.blackboard!.map(entry => [entry.key!, entry.value!] as const))
  return evaluateGuardTraits(operator, stage, resolved.values, board, { phaseIndex: 2, operatorLevel: 90 }).evaluation
}

test('追加25人の両素質を必ず評価行または阻害理由に残し、特性は共通構造評価で扱う', () => {
  const unimplemented = sources.filter(source => source.skills.some(skill => !skill.supported))
  assert.equal(unimplemented.length, 25)
  for (const source of unimplemented) {
    const result = evaluate(source.id)
    assert.ok(result.evaluations.every(row => row.sourceKind !== 'TRAIT'), source.name)
    assert.ok(traits(traitRecord(source.id)).evaluations.length > 0, source.name)
    const names = source.talents.flatMap(talent => talent.candidates?.filter(candidate => candidate.name && !candidate.isHideTalent
      && (candidate.requiredPotentialRank ?? 0) === 0).at(-1)?.name ?? [])
    for (const name of names) assert.ok(result.evaluations.some(row => row.source === name), `${source.name}: ${name}`)
    assert.ok([result.attackRatio, result.attackFlat, result.attackSpeed, result.attackScale,
      result.damageScale, result.critChance, result.critScale].every(Number.isFinite), source.name)
  }
})

test('未登録オペレーターと欠けた潜在1素質を黙って無視しない', () => {
  const unknown = record('char_017_huang')
  unknown.operatorId = 'unknown'
  assert.match(evaluateGuardPassives(unknown, {}, { kind: 'NORMAL', skillIndex: 1, stageId: 'active' }).blockers.join(' '), /定義/)
  const missing = record('char_010_chen')
  missing.operatorProfile.talents = []
  const output = evaluateGuardPassives(missing, {}, { kind: 'NORMAL', skillIndex: 1, stageId: 'active' })
  assert.equal(output.blockers.length, 2)
})

test('素質の別prefabや潜在強化限定候補を同じ数値の代用品にしない', () => {
  const changed = record('char_010_chen')
  for (const candidate of changed.operatorProfile.talents![1].candidates ?? [])
    if (candidate.requiredPotentialRank === 0 && candidate.unlockCondition?.phase === 'PHASE_2') candidate.prefabKey = 'different'
  const changedResult = evaluateGuardPassives(changed, {}, { kind: 'NORMAL', skillIndex: 1, stageId: 'active' })
  close(changedResult.attackRatio, 0)
  assert.ok(changedResult.blockers.some(value => value.includes('識別子')))
  const potentialOnly = record('char_010_chen')
  potentialOnly.operatorProfile.talents![1].candidates = potentialOnly.operatorProfile.talents![1].candidates!.filter(candidate =>
    (candidate.requiredPotentialRank ?? 0) > 0 || candidate.unlockCondition?.phase !== 'PHASE_2')
  const result = evaluateGuardPassives(potentialOnly, {}, { kind: 'NORMAL', skillIndex: 1, stageId: 'active' })
  close(result.attackRatio, 0)
  assert.ok(result.blockers.some(value => /素質を取得|解放条件/.test(value)))
})

test('潜在強化の候補を採用せずチェンの攻撃力5%を適用する', () => {
  const result = evaluate('char_010_chen')
  close(result.attackRatio, 0.05)
  assert.equal(result.blockers.length, 0)
  assert.ok(result.evaluations.some(row => row.source === '発破' && row.status === 'NOT_RELEVANT'))
})

test('マウンテンの攻撃倍率と確率を期待値化前の枝として保持する', () => {
  const normal = evaluate('char_264_f12yin')
  close(normal.critChance, 0.2)
  close(normal.critScale, 1.6)
  close(normal.attackScale, 1)
  const skill = evaluate('char_264_f12yin', {}, 3)
  close(skill.critChance, 0.75)
})

test('HP比例攻撃速度は上限・中間値・境界を共有計算する', () => {
  close(evaluate('char_188_helage', { selfHpPercent: 100 }).attackSpeed, 0)
  close(evaluate('char_188_helage', { selfHpPercent: 65 }).attackSpeed, 50)
  close(evaluate('char_188_helage', { selfHpPercent: 30 }).attackSpeed, 100)
  close(evaluate('char_188_helage', { selfHpPercent: 0 }).attackSpeed, 100)
  close(evaluate('char_4121_zuole', { selfHpPercent: 30 }).attackSpeed, 50)
})

test('百錬ガヴィルはブロック数に応じて加算しスキル別上限を確認する', () => {
  close(evaluate('char_1026_gvial2', { blockedEnemyCount: 0 }).attackRatio, 0.1)
  close(evaluate('char_1026_gvial2', { blockedEnemyCount: 3 }).attackRatio, 0.22)
  close(evaluate('char_1026_gvial2', { blockedEnemyCount: 5 }, 3).attackRatio, 0.3)
  assert.ok(evaluate('char_1026_gvial2', { blockedEnemyCount: 5 }, 2).blockers.length)
})

test('ウルピアヌスの固定攻撃力とヘドリーの状態倍率を割合増加と混同しない', () => {
  close(evaluate('char_4145_ulpia', { killStacks: 9 }).attackFlat, 270)
  close(evaluate('char_4145_ulpia', { killStacks: 9 }).attackRatio, 0)
  close(evaluate('char_4088_hodrer', { targetStunnedOrBound: false }).attackScale, 1.1)
  close(evaluate('char_4088_hodrer', { targetStunnedOrBound: true }).attackScale, 1.4)
})

test('レッシングの被ダメージ履歴とパラスのHP素質・ブロック特性を別々に評価する', () => {
  close(evaluate('char_4011_lessng').attackRatio, 0)
  close(evaluate('char_4011_lessng', { recentDamageTaken: true }).attackRatio, 0.12)
  close(evaluate('char_485_pallas', { selfHpPercent: 79.9 }).attackRatio, 0)
  close(evaluate('char_485_pallas', { selfHpPercent: 80 }).attackRatio, 0.25)
  close(evaluate('char_485_pallas', { targetBlockedBySelf: false }).attackScale, 1)
  close(evaluate('char_485_pallas', { targetBlockedBySelf: true }).attackScale, 1)
  close(traits(traitRecord('char_485_pallas'), { targetBlockedBySelf: false }).attackScale, 1.2)
  close(traits(traitRecord('char_485_pallas'), { targetBlockedBySelf: true }).attackScale, 1)
})

test('耀騎士ニアールの防御無視は確率補正や配置時ダメージと区別する', () => {
  const result = evaluate('char_1014_nearl2')
  close(result.defenseIgnoreRatio, 0.2)
  assert.equal(result.additionalActions.length, 0)
  assert.ok(result.evaluations.some(row => row.status === 'NOT_RELEVANT' && row.reason.includes('配置時')))
})

test('チューバイは状態条件に対応した追加術を出し遠距離倍率をスキル動作へ掛けない', () => {
  assert.equal(evaluate('char_4082_qiubai').additionalActions.length, 0)
  const normal = evaluate('char_4082_qiubai', { targetSlowedOrBound: true, attackDistanceType: 'RANGED' })
  assert.equal(normal.additionalActions.length, 1)
  assert.equal(normal.additionalActions[0].damageType, 'ARTS')
  assert.equal(normal.additionalActions[0].scale, 0.4)
  close(normal.attackScale, 1)
  close(traits(traitRecord('char_4082_qiubai', 2), { attackDistanceType: 'RANGED' }, 'normal').attackScale, 0.8)
  close(traits(traitRecord('char_4082_qiubai', 2), { attackDistanceType: 'RANGED' }, 'start').attackScale, 1)
  close(traits(traitRecord('char_4082_qiubai', 3), { attackDistanceType: 'RANGED' }).attackScale, 1)
  close(evaluate('char_4082_qiubai', { attackDistanceType: 'RANGED' }, 2, 'SKILL_ACTION').attackScale, 1)
  const s3 = evaluate('char_4082_qiubai', { targetSlowedOrBound: true, attackDistanceType: 'RANGED' }, 3)
  assert.equal(s3.additionalActions[0].scale, 0.8)
  close(s3.attackScale, 1)
})

test('ベッローネの未知の中間曲線と途中の蓄積変化は数値を捏造せず停止する', () => {
  assert.ok(evaluate('char_4037_demetr', { targetHpPercent: 60, defenseDebuffStacks: 5 }).blockers.some(value => value.includes('曲線')))
  const maximum = evaluate('char_4037_demetr', { targetHpPercent: 20, defenseDebuffStacks: 5 })
  close(maximum.damageScale, 1.28)
  close(maximum.defenseReductionRatio, 0.35)
  assert.equal(maximum.blockers.length, 0)
  assert.ok(evaluate('char_4037_demetr', { targetHpPercent: 20, defenseDebuffStacks: 0 }).blockers.some(value => value.includes('新規付与')))
})

test('豊川祥子は音符数から割合無視を計算し攻撃速度対象を明示する', () => {
  const result = evaluate('char_4182_oblvns', { noteCount: 10, selfInTalentRange: true })
  close(result.defenseIgnoreRatio, 0.3)
  close(result.resistanceIgnoreRatio, 0.2)
  close(result.attackSpeed, 12)
  assert.equal(result.blockers.length, 0)
})

test('デーゲンS2は他の味方によるブロックでも素質発動率を上げる', () => {
  const result = evaluate('char_4116_blkkgt', { targetBlocked: true, targetTrembling: true }, 2, 'SKILL_ACTION')
  close(result.critChance, 1)
  close(result.defenseIgnoreRatio, 0.25)
  assert.equal(result.blockers.length, 0)
  close(evaluate('char_4116_blkkgt', { targetBlocked: false, targetTrembling: true }, 2, 'SKILL_ACTION').critChance, 0.1)
})

test('聖約イグゼキュターの追加攻撃は別枝で保持して100%を上限とする', () => {
  const initial = evaluate('char_1032_excu2')
  assert.equal(initial.additionalActions[0].probability, 0.2)
  close(initial.critChance, 0)
  close(Number(evaluate('char_1032_excu2', { ammoSpent: 8 }).additionalActions[0].probability), 0.6)
  assert.equal(evaluate('char_1032_excu2', { ammoSpent: 100 }).additionalActions[0].probability, 1)
  assert.equal(evaluate('char_1032_excu2', { ammoSpent: 10 }, 3, 'SKILL_ACTION').additionalActions.length, 0)
})

test('エンテレケイアの術DOTは毎攻撃に加算する瞬間ダメージとして返さない', () => {
  const result = evaluate('char_4010_etlchi', { dotActive: true })
  assert.equal(result.additionalActions[0].timing, 'PER_SECOND')
  assert.equal(result.additionalActions[0].flatDamage, 200)
  assert.equal(evaluate('char_4010_etlchi', { dotActive: false }).additionalActions.length, 0)
})

test('怒潮ズィマーは範囲対象の倍率だけを分離し主対象へ1.24を乗算しない', () => {
  const result = evaluate('char_1051_headb2', { terrainHitCount: 2 })
  close(result.splashDamageScale!, 1.24)
  close(result.damageScale, 1)
  close(result.attackRatio, 0.28)
  assert.equal(result.additionalActions[0].hits, 2)
  assert.equal(result.additionalActions[0].scale, 0.24)
  assert.equal(result.blockers.length, 0)
})

test('libratorの特性値はruntime sourceから取得し不明な値を200%と仮定しない', () => {
  const missing = traitRecord('char_4064_mlynar')
  missing.operatorProfile.trait!.candidates![0].blackboard = missing.operatorProfile.trait!.candidates![0].blackboard!.filter(entry => entry.key !== 'atk')
  assert.ok(traits(missing).blockers.length > 0)
  const op = traitRecord('char_4064_mlynar')
  const result = evaluateGuardPassives(op, { traitChargePercent: 50, nearbyEnemyCount: 3 }, { kind: 'NORMAL', skillIndex: 1, stageId: 'active' })
  close(result.attackRatio, 0)
  close(result.attackScale, 1.15)
  assert.equal(result.blockers.length, 0)
  const trait = traits(op, { traitChargePercent: 50, nearbyEnemyCount: 3 })
  close(trait.attackRatio, 1)
  assert.equal(trait.blockers.length, 0)
})

test('ムリナールS3は負の撃破補正を加算し撃破数が増えると特性が減少する', () => {
  const op = traitRecord('char_4064_mlynar', 3)
  const before = traits(op, { traitChargePercent: 100, skillKillCount: 0 })
  const after = traits(op, { traitChargePercent: 100, skillKillCount: 5 })
  close(before.attackRatio, 4)
  close(after.attackRatio, 3)
  assert.ok(after.attackRatio < before.attackRatio)
})

test('入力のNaN・範囲外・小数スタック・偽のbooleanを拒否する', () => {
  for (const conditions of [{ selfHpPercent: NaN }, { selfHpPercent: -1 }, { selfHpPercent: 101 }])
    assert.ok(evaluate('char_188_helage', conditions).blockers.length)
  assert.ok(evaluate('char_4145_ulpia', { killStacks: 1.5 }).blockers.length)
  assert.ok(evaluate('char_4011_lessng', { recentDamageTaken: 'true' }).blockers.length)
  const input = getGuardPassiveInputs('char_188_helage')[0]
  assert.equal(input.key, 'selfHpPercent')
})

test('同じ素質識別子でも発動確率が有効範囲外なら補正値を丸めて採用しない', () => {
  const op = record('char_264_f12yin')
  for (const candidate of op.operatorProfile.talents![0].candidates ?? []) {
    if (candidate.requiredPotentialRank === 0 && candidate.unlockCondition?.phase === 'PHASE_2')
      candidate.blackboard!.find(entry => entry.key === 'prob')!.value = 2
  }
  const result = evaluateGuardPassives(op, {}, { kind: 'NORMAL', skillIndex: 1, stageId: 'active' })
  assert.ok(result.blockers.some(value => value.includes('有効範囲外')))
})
