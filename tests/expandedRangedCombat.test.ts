import test from 'node:test'
import assert from 'node:assert/strict'
import rawSources from '../src/data/expandedRangedSources.json' with { type: 'json' }
import { EXPANDED_RANGED_DEFINITIONS } from '../src/lib/expandedRangedDefinitions.ts'
import { buildDamageCalculatorThreeOutput } from '../src/lib/damageCalculatorThree.ts'
import { buildExpandedTalentStructures } from '../src/lib/expandedTalentStructure.ts'
import { classifySkill } from '../src/lib/classifier.ts'
import type { ExpandedOperatorSource } from '../src/lib/expandedCombatTypes.ts'
import type { SkillRecord } from '../src/types/skill.ts'
import type { GuardConditions } from '../src/lib/guardCombatTypes.ts'

const sources = rawSources as unknown as ExpandedOperatorSource[]
function record(id: string, index: number): SkillRecord {
  const source = sources.find(s => s.operatorId === id)!
  const skill = source.skills.find(s => s.skillIndex === index)!
  const raw = structuredClone(skill.raw)
  return { id: `${id}/${index}`, operatorId: id, operatorName: source.operatorName, skillId: skill.skillId,
    skillIndex: index, skillName: raw.name!, profession: source.profession, professionLabel: '狙撃', rarity: source.rarity,
    subProfessionId: source.subProfessionId, subProfessionName: source.subProfessionId, nameInitial: 'OTHER',
    description: raw.description!, duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
    spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!,
    classification: classifySkill(raw), skillLevels: Array.from({ length: source.skillLevelIndex + 1 }, () => structuredClone(raw)),
    raw, operatorProfile: structuredClone(source.profile) }
}
function output(id: string, index: number, guard: GuardConditions = {}, transform?: (skill: SkillRecord) => void) {
  const skill = record(id, index), source = sources.find(s => s.operatorId === id)!
  transform?.(skill)
  return buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: source.phaseIndex,
    operatorLevel: source.profile.phases[source.phaseIndex].maxLevel!, trust: 100,
    skillLevelIndex: source.skillLevelIndex, conditions: { guard } })
}
function at(id: string, index: number, axis = 0, guard: GuardConditions = {}) {
  const result = output(id, index, guard)
  assert.deepEqual(result.unsupportedReasons, [], `${id} S${index}: ${result.unsupportedReasons.join(' / ')}`)
  const row = result.rows.find(r => r.axisValue === axis)
  assert.ok(row, `${id} S${index} missing ${axis}`)
  return { result, row }
}
function close(actual: number | null, expected: number) {
  assert.ok(actual !== null && Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`)
}
const physical = (attack: number, defense: number) => Math.max(attack - defense, attack * 0.05)
const buff = (attack: number, ratio: number) => Math.floor(attack * (1 + ratio) + 1e-9)

test('追加狙撃の全技能を計算対応または具体的な保留理由に分け、全素質を欠落なく構造化する', () => {
  assert.equal(EXPANDED_RANGED_DEFINITIONS.length, 27)
  for (const definition of EXPANDED_RANGED_DEFINITIONS) {
    const source = sources.find(s => s.operatorId === definition.operatorId)!
    assert.deepEqual([...definition.recipes.map(r => r.skillIndex), ...(definition.deferredSkills ?? []).map(s => s.skillIndex)].sort(),
      source.skills.map(s => s.skillIndex).sort())
    const talents = buildExpandedTalentStructures([record(source.operatorId, 1)])
    assert.equal(talents.length, source.profile.talents.length)
    for (const talent of talents) assert.deepEqual(talent.issues, [], `${source.operatorName} ${talent.basicInfo.talentName}`)
    for (const recipe of definition.recipes) {
      const result = output(definition.operatorId, recipe.skillIndex)
      assert.deepEqual(result.unsupportedReasons, [], `${source.operatorName} S${recipe.skillIndex}`)
      assert.ok(result.rows.length)
      for (const row of result.rows) assert.ok([row.perAttack, row.allTargetsPerAttack, row.dps ?? 0].every(Number.isFinite))
    }
    for (const skill of definition.deferredSkills ?? []) {
      const result = output(definition.operatorId, skill.skillIndex)
      assert.ok(result.unsupportedReasons.some(r => r.includes(skill.reason)))
      assert.deepEqual(result.rows, [])
    }
  }
})

test('クルースSL7は2連撃と各防御軽減後の20%会心期待値を計算し周期DPSを出さない', () => {
  const { result, row } = at('char_124_kroos', 1, 1000)
  const attack = result.stats.attack * 1.4
  close(row.perAttack, (physical(attack, 1000) * 0.8 + physical(attack * 1.5, 1000) * 0.2) * 2)
  assert.equal(row.dps, null)
})

test('エクシアS3は天使の祝福6%・速度12・5連撃・間隔-0.11秒を一度ずつ適用する', () => {
  const { result, row } = at('char_103_angel', 3, 500)
  const attack = buff(result.stats.attack, 0.06) * 1.1
  close(row.perAttack, physical(attack, 500) * 5)
  close(result.attackInterval, (result.stats.baseAttackTime - 0.11) / 1.12)
  close(row.dps, row.perAttack / result.attackInterval!)
})

test('トターS2は単体の225%と3体攻撃を区別し、範囲内ステルスでATK17%が加わる', () => {
  const single = at('char_4062_totter', 2, 0)
  const multiple = at('char_4062_totter', 2, 0, { actualAttackTargetCount: 3, stealthedEnemyInRange: true })
  close(single.row.perAttack, single.result.stats.attack * 2.25)
  close(multiple.row.perAttack, buff(multiple.result.stats.attack, 0.17))
  close(multiple.row.allTargetsPerAttack, multiple.row.perAttack * 3)
  assert.ok(output('char_4062_totter', 2, { actualAttackTargetCount: 4 }).unsupportedReasons.length)
})

test('パインコーンS1は正面150%を攻撃倍率へ、固定防御無視250を防御力へ適用する', () => {
  const { result, row } = at('char_440_pinecn', 1, 1000, { targetInFrontalTiles: true, actualAttackTargetCount: 4 })
  close(row.perAttack, physical(result.stats.attack * 2 * 1.5, 750))
  close(row.allTargetsPerAttack, row.perAttack * 4)
  assert.equal(row.dps, null)
})

test('アンドレアナS2とプロヴァンスS2のHP制限を境界で止める', () => {
  const { result } = at('char_218_cuttle', 2, 0, { targetHpPercent: 50.1 })
  close(result.attackInterval, result.stats.baseAttackTime / 1.12)
  assert.deepEqual(output('char_218_cuttle', 2, { targetHpPercent: 50 }).rows, [])
  at('char_145_prove', 2, 0, { targetHpPercent: 79.9 })
  assert.deepEqual(output('char_145_prove', 2, { targetHpPercent: 80 }).rows, [])
})

test('プロヴァンスS2の正面会心50%は減算後に加重し、単純なATK期待値に置換しない', () => {
  const { result, row } = at('char_145_prove', 2, 1000, { targetImmediatelyAhead: true })
  const attack = buff(result.stats.attack, 2.2)
  close(row.perAttack, physical(attack, 1000) * 0.5 + physical(attack * 1.8, 1000) * 0.5)
})

test('フィアメッタS3のHP50/80境界と爆心地倍率を区別し未発動時ASPDを加えない', () => {
  for (const [hp, ratio] of [[49.9, 0], [50, 0.25], [79.9, 0.25], [80, 0.5]]) {
    const { result, row } = at('char_300_phenxi', 3, 0, { selfHpPercent: hp })
    close(row.perAttack, buff(result.stats.attack, ratio) * 2.2)
    close(result.attackInterval, result.stats.baseAttackTime)
  }
  const outer = at('char_300_phenxi', 3, 0, { targetInBlastCenter: false })
  close(outer.row.perAttack, buff(outer.result.stats.attack, 0.5) * 1.25)
})

test('ロサは学生の鑑8%と重量3以上の防御60%無視を合成する', () => {
  for (const weight of [2, 3]) {
    const { result, row } = at('char_197_poca', 1, 1000, { targetWeight: weight })
    close(row.perAttack, physical(buff(result.stats.attack, 1.08), weight >= 3 ? 400 : 1000))
  }
})

test('アルケットS1は主対象230%と追加3体180%を別々に防御軽減する', () => {
  const { result, row } = at('char_332_archet', 1, 1000, { actualAttackTargetCount: 4 })
  const total = physical(result.stats.attack * 2.3, 1000) + physical(result.stats.attack * 1.8, 1000) * 3
  close(row.allTargetsPerAttack, total)
  close(row.perAttack, total / 4)
})

test('Ash S2はスタン状態で250%、非スタンで100%とし弾薬の総ダメージを捏造しない', () => {
  for (const stunned of [false, true]) {
    const { result, row } = at('char_456_ash', 2, 1000, { targetStunned: stunned })
    close(row.perAttack, physical(result.stats.attack * (stunned ? 2.5 : 1), 1000))
    close(result.attackInterval, 0.2)
    assert.ok(result.scopeNotes.some(note => note.includes('弾薬')))
  }
})

test('ファイヤーウォッチS2は3爆弾の各命中と遠距離対象補正を明示条件で計算する', () => {
  const { result, row } = at('char_158_milu', 2, 1000, { bombHits: 3, targetRanged: true, actualAttackTargetCount: 2 })
  close(row.perAttack, physical(result.stats.attack * 3 * 1.4, 1000) * 3)
  close(row.allTargetsPerAttack, row.perAttack * 2)
  assert.equal(row.dps, null)
})

test('パインコーンS2の発動回数と寒芒クルースS2の命中後強化は選択した段階だけを評価する', () => {
  for (const [count, ratio] of [[1, 0.6], [2, 0.8], [3, 1], [4, 1.2], [100, 1.2]]) {
    const { result, row } = at('char_440_pinecn', 2, 0, { skillActivationCount: count })
    close(row.perAttack, buff(result.stats.attack, ratio))
  }
  const two = at('char_1021_kroos2', 2), four = at('char_1021_kroos2', 2, 0, { fourHitMode: true })
  close(four.row.perAttack, two.row.perAttack * 2)
  close(four.result.attackInterval, two.result.attackInterval!)
})

test('条件付き被ダメージ倍率は防御減算後、防御無視は減算前に適用する', () => {
  const sesa = at('char_379_sesa', 2, 1000, { targetBlocked: true })
  close(sesa.row.perAttack, physical(sesa.result.stats.attack * 2.4, 1000) * 1.14)
  const mel = at('char_4006_melnte', 1, 1000, { skillActivationCount: 2 })
  close(mel.row.perAttack, physical(buff(mel.result.stats.attack, 1.8), 1000) * 1.15)
  const erato = at('char_4043_erato', 2, 1000, { targetSleeping: true })
  close(erato.row.perAttack, physical(buff(erato.result.stats.attack, 0.5), 500))
})

test('Ash S3の接触と高台衝突爆発は別々に軽減する', () => {
  const { result, row } = at('char_456_ash', 3, 1000, { hitHighGround: true })
  close(row.perAttack, physical(result.stats.attack * 3, 1000) + physical(result.stats.attack * 8, 1000))
  const blast = at('char_456_ash', 3, 1000, { contactHit: false })
  close(blast.row.perAttack, physical(result.stats.attack * 4, 1000))
})

test('アズリウスの毒は通常攻撃の物理ダメージと混ぜず固定術ダメージの毎秒値を返す', () => {
  const { result, row } = at('char_129_bluep', 1, 1000, { actualAttackTargetCount: 2, enemyResistance: 40 })
  close(row.perAttack, physical(result.stats.attack * 2, 1000))
  close(row.damageOverTimeDps, 75 * 0.6)
  assert.equal(row.dps, null)
  const inactive = at('char_129_bluep', 1, 1000, { poisonActive: false })
  assert.equal(inactive.row.damageOverTimeDps, null)
})

test('素質数値の欠落と説明変更は、既定値や部分的な計算結果へ落とさず停止する', () => {
  const missing = output('char_103_angel', 3, {}, skill => {
    for (const candidate of skill.operatorProfile.talents[0].candidates ?? []) candidate.blackboard = []
  })
  assert.ok(missing.unsupportedReasons.length)
  assert.deepEqual(missing.rows, [])
  const changed = output('char_124_kroos', 1, {}, skill => { skill.skillLevels[6].description += '追加効果' })
  assert.ok(changed.unsupportedReasons.length)
  assert.deepEqual(changed.rows, [])
})
