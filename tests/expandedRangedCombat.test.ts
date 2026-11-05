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
import { evaluateDamageThreeComparisonEntry, getDamageThreeComparisonEntries } from '../src/lib/damageCalculatorThreeComparison.ts'
import { buildDamageCalculatorThreeCoverage } from '../src/lib/damageCalculatorThreeCoverage.ts'
import { getOperatorPassives } from '../src/lib/operatorProfile.ts'

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
function output(id: string, index: number, guard: GuardConditions = {}, transform?: (skill: SkillRecord) => void,
  virtualMainAttackType?: 'PHYSICAL' | 'ARTS') {
  const skill = record(id, index), source = sources.find(s => s.operatorId === id)!
  transform?.(skill)
  return buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: source.phaseIndex,
    operatorLevel: source.profile.phases[source.phaseIndex].maxLevel!, trust: 100,
    skillLevelIndex: source.skillLevelIndex, conditions: { guard }, virtualMainAttackType })
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
  assert.equal(EXPANDED_RANGED_DEFINITIONS.length, 49)
  for (const definition of EXPANDED_RANGED_DEFINITIONS) {
    const source = sources.find(s => s.operatorId === definition.operatorId)!
    assert.deepEqual([...definition.recipes.map(r => r.skillIndex), ...(definition.deferredSkills ?? []).map(s => s.skillIndex)].sort(),
      source.skills.map(s => s.skillIndex).sort())
    const talents = buildExpandedTalentStructures([record(source.operatorId, 1)])
    assert.equal(talents.length, getOperatorPassives(source.profile, source.phaseIndex,
      source.profile.phases[source.phaseIndex].maxLevel!, 1).sources.filter(source => source.sourceKind === 'TALENT').length,
    source.operatorName)
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

test('アルケットS2の連鎖は5から1連撃へ減り、対象ごとに軽減して合計する', () => {
  for (const [targets, hits] of [[1, 5], [2, 9], [3, 12], [4, 14], [5, 15]]) {
    const { result, row } = at('char_332_archet', 2, 500, { actualAttackTargetCount: targets })
    close(row.allTargetsPerAttack, physical(result.stats.attack * 1.4, 500) * hits)
    close(row.perAttack, row.allTargetsPerAttack! / targets)
    assert.deepEqual(row.attackComponents!.map(component => component.count), Array.from({ length: targets }, (_, i) => 5 - i))
    assert.equal(row.dps, null)
  }
  assert.ok(output('char_332_archet', 2, { actualAttackTargetCount: 6 }).unsupportedReasons.length)
})

test('アズリウスS2は主対象2回・追加対象各1回に毒を1つずつ計算する', () => {
  for (const targets of [1, 2, 3]) {
    const { result, row } = at('char_129_bluep', 2, 500, { actualAttackTargetCount: targets, enemyResistance: 40 })
    const hit = physical(buff(result.stats.attack, 0.5), 500)
    close(row.allTargetsPerAttack, hit * (targets + 1))
    close(row.damageOverTimeDps, 75 * 0.6)
    close(row.allTargetsCombinedDps, hit * (targets + 1) / result.attackInterval! + 75 * 0.6 * targets)
  }
  assert.ok(output('char_129_bluep', 2, { actualAttackTargetCount: 4 }).unsupportedReasons.length)
})

test('ファートゥースS3は射程外140%を防御軽減後に掛け、素質ATK15%はスキルと加算する', () => {
  for (const outside of [false, true]) for (const noDamage of [false, true]) for (const defense of [0, 1000, 2000]) {
    const { result, row } = at('char_430_fartth', 3, defense,
      { targetOutsideBaseRange: outside, noDamageForTenSeconds: noDamage })
    const attack = buff(result.stats.attack, 1.4 + (noDamage ? 0.15 : 0))
    close(row.perAttack, physical(attack, defense) * (outside ? 1.4 : 1))
    close(result.attackInterval, result.stats.baseAttackTime)
  }
})

test('ティフォンS1は防御無視0〜5累積と対象への初回160%を区別する', () => {
  for (const stacks of [0, 1, 5]) for (const first of [false, true]) {
    const { result, row } = at('char_2012_typhon', 1, 1000,
      { defenseIgnoreStacks: stacks, firstSkillHitOnTarget: first })
    const attack = buff(result.stats.attack, 0.45) * (first ? 1.6 : 1)
    close(row.perAttack, physical(attack, 1000 * (1 - stacks * 0.1)))
    close(result.attackInterval, result.stats.baseAttackTime / 1.45)
  }
  for (const stacks of [-1, 6, 1.5]) {
    assert.ok(output('char_2012_typhon', 1, { defenseIgnoreStacks: stacks }).unsupportedReasons.length)
  }
})

test('レミュアンS1は配置20秒の境界、指名手配15%と2対象210%を反映する', () => {
  for (const seconds of [19.9, 20]) for (const wanted of [false, true]) {
    const { result, row } = at('char_4193_lemuen', 1, 1000,
      { deploymentSeconds: seconds, targetWanted: wanted, actualAttackTargetCount: 2 })
    const attack = buff(result.stats.attack, seconds >= 20 ? 0.1 : 0)
    close(row.perAttack, physical(attack * 2.1, 1000) * (wanted ? 1.15 : 1))
    close(row.allTargetsPerAttack, row.perAttack * 2)
  }
  assert.ok(output('char_4193_lemuen', 1, { actualAttackTargetCount: 3 }).unsupportedReasons.length)
})

test('トギフォンスS1のマークは防御30%低下、サルカズ補正は攻撃倍率145%となる', () => {
  for (const marked of [false, true]) for (const sarkaz of [false, true]) {
    const { result, row } = at('char_363_toddi', 1, 1000, { targetMarked: marked, targetSarkaz: sarkaz })
    close(row.perAttack, physical(result.stats.attack * 1.8 * (sarkaz ? 1.45 : 1), marked ? 700 : 1000))
    close(row.dps, row.perAttack / result.attackInterval!)
  }
})

test('トギフォンスS2は主対象の竜矢240%と全対象の遅延爆発80%を個別に軽減する', () => {
  for (const targets of [1, 3]) for (const sarkaz of [false, true]) {
    const { result, row } = at('char_363_toddi', 2, 500, { actualAttackTargetCount: targets, targetSarkaz: sarkaz })
    const attack = result.stats.attack * (sarkaz ? 1.45 : 1)
    close(row.allTargetsPerAttack, physical(attack * 2.4, 500) + physical(attack * 0.8, 500) * targets)
    close(result.attackInterval, result.stats.baseAttackTime + 0.3)
    assert.deepEqual(row.attackComponents!.map(component => component.role), ['MAIN', 'ADDITIONAL'])
  }
})

test('アオスタの流血は未重複のATK比率毎秒ダメージで、正面150%は直接攻撃だけに適用する', () => {
  for (const index of [1, 2]) for (const frontal of [false, true]) {
    const { result, row } = at('char_346_aosta', index, 500,
      { targetInFrontalTiles: frontal, actualAttackTargetCount: 3, enemyResistance: 40 })
    const attack = buff(result.stats.attack, index === 1 ? 0.45 : 0.7)
    const dot = attack * 0.18 * (index === 2 ? 2 : 1) * 0.6
    close(row.perAttack, physical(attack * (frontal ? 1.5 : 1), 500))
    close(row.damageOverTimeDps, dot)
    close(result.attackInterval, index === 1 ? result.stats.baseAttackTime / 1.45 : result.stats.baseAttackTime + 0.5)
    close(row.allTargetsCombinedDps, (row.perAttack / result.attackInterval! + dot) * 3)
  }
  const inactive = at('char_346_aosta', 2, 500, { bleedingActive: false })
  assert.equal(inactive.row.damageOverTimeDps, null)
  const dot = buildExpandedTalentStructures([record('char_346_aosta', 1)])[0].effects[0]
  assert.equal(dot.item, 'DAMAGE_OVER_TIME')
  if (dot.item !== 'DAMAGE_OVER_TIME') return
  assert.equal(dot.damage.amount.basis, 'ATK_RATIO')
  assert.deepEqual(dot.damage.stacking, { mode: 'REPLACE', maxStacks: 1 })
})

test('新規狙撃の仮想攻撃属性は主攻撃のみ変更し、遅延爆発と流血の属性・倍率を保つ', () => {
  const tod = output('char_363_toddi', 2, { actualAttackTargetCount: 2, enemyResistance: 40 }, undefined, 'ARTS')
  assert.deepEqual(tod.unsupportedReasons, [])
  const todRow = tod.rows.find(row => row.axisValue === 500)!
  close(todRow.allTargetsPerAttack, tod.stats.attack * 2.4 * 0.6 + physical(tod.stats.attack * 0.8, 500) * 2)
  assert.deepEqual(todRow.attackComponents!.map(component => [component.role, component.damageType]),
    [['MAIN', 'ARTS'], ['ADDITIONAL', 'PHYSICAL']])
  const aosta = output('char_346_aosta', 2, { targetInFrontalTiles: true }, undefined, 'ARTS')
  assert.deepEqual(aosta.unsupportedReasons, [])
  const aostaRow = aosta.rows.find(row => row.axisValue === 40)!
  const attack = buff(aosta.stats.attack, 0.7)
  close(aostaRow.perAttack, attack * 1.5 * 0.6)
  close(aostaRow.damageOverTimeDps, attack * 0.18 * 2 * 0.6)
})

test('新規狙撃は未確認の素質数値や特性への変更を検出し、古い定義で計算を続けない', () => {
  for (const id of ['char_2012_typhon', 'char_4193_lemuen', 'char_363_toddi', 'char_346_aosta']) {
    const changed = output(id, 1, {}, skill => {
      for (const candidate of skill.operatorProfile.talents[0].candidates ?? []) candidate.blackboard = []
    })
    assert.ok(changed.unsupportedReasons.length, id)
    assert.deepEqual(changed.rows, [])
  }
})

test('パゼオンカ本体は会心の軽減後期待値、3連撃、正面倍率とタイプライター防御低下を区別する', () => {
  for (const [state, reduction] of [['NONE', 0], ['NORMAL', 0.18], ['ADJACENT', 0.23]] as const) {
    const { result, row } = at('char_4055_bgsnow', 1, 1000, { typewriterDefenseReduction: state })
    const attack = buff(result.stats.attack, 0.6), defense = 1000 * (1 - reduction)
    close(row.perAttack, physical(attack, defense) * 0.6 + physical(attack * 2.25, defense) * 0.4)
    const s2 = at('char_4055_bgsnow', 2, 1000, { typewriterDefenseReduction: state })
    close(s2.row.perAttack, physical(s2.result.stats.attack * 2.3, defense) * 3)
    assert.equal(s2.row.dps, null)
    for (const forward of [false, true]) {
      const s3 = at('char_4055_bgsnow', 3, 1000, { typewriterDefenseReduction: state, targetInForwardThreeTiles: forward })
      close(s3.row.perAttack, physical(s3.result.stats.attack * (forward ? 2.55 : 2), defense))
      close(s3.result.attackInterval, s3.result.stats.baseAttackTime - 0.6)
    }
  }
  assert.ok(output('char_4055_bgsnow', 1, { typewriterDefenseReduction: 'UNKNOWN' }).unsupportedReasons.length)
})

test('ケイパーの確率150%と追加投擲、ブリギッドの追加4回を各軽減し帰還周期は計算しない', () => {
  for (const index of [1, 2]) {
    const { result, row } = at('char_4100_caper', index, 500)
    const attack = buff(result.stats.attack, index === 1 ? 0 : 0.6) * (index === 1 ? 2.3 : 1)
    close(row.perAttack, (physical(attack, 500) * 0.75 + physical(attack * 1.5, 500) * 0.25) * (index === 1 ? 1 : 2))
    assert.equal(row.dps, null)
    assert.equal(result.attackInterval, null)
  }
  const { result, row } = at('char_4177_brigid', 2, 500)
  close(row.perAttack, physical(buff(result.stats.attack, 0.5), 500) * 5)
  assert.equal(row.dps, null)
  assert.deepEqual(row.attackComponents!.map(component => [component.role, component.count]), [['MAIN', 1], ['ADDITIONAL', 4]])
})

test('コールドショットは装填済み120%と通常攻撃から2秒の境界130%を一度ずつ反映する', () => {
  for (const index of [1, 2]) for (const seconds of [0, 1.9, 2, 10]) {
    const { result, row } = at('char_4104_coldst', index, 1000, { secondsSinceNormalAttack: seconds })
    const attack = buff(result.stats.attack, index === 1 ? 1 : 1.4) * 1.2 * (seconds >= 2 ? 1.3 : 1)
    close(row.perAttack, physical(attack, 1000))
    assert.equal(row.dps, null)
    assert.equal(row.combinedDps, null)
    assert.equal(result.attackInterval, null)
  }
})

test('レイは同一対象の累積、装填倍率とサンドビースト範囲の物理限定倍率を合成する', () => {
  for (const index of [2, 3]) for (const stacks of [0, 3]) for (const inArea of [false, true]) {
    const { result, row } = at('char_4117_ray', index, 1000, { sameTargetAttackStacks: stacks, targetInSandbeastArea: inArea })
    const attack = buff(result.stats.attack, (index === 2 ? 1.2 : 0) + stacks * 0.08) * 1.2 * (index === 3 ? 3.3 : 1)
    close(row.perAttack, physical(attack, 1000) * (inArea ? 1.15 : 1))
    assert.equal(row.dps, null)
  }
  const arts = output('char_4117_ray', 3, { targetInSandbeastArea: true, sameTargetAttackStacks: 3 }, undefined, 'ARTS')
  assert.deepEqual(arts.unsupportedReasons, [])
  close(arts.rows.find(row => row.axisValue === 40)!.perAttack, buff(arts.stats.attack, 0.24) * 1.2 * 3.3 * 0.6)
  assert.ok(output('char_4117_ray', 2, { sameTargetAttackStacks: 4 }).unsupportedReasons.length)
})

test('スノーハンターのスキル開始素質は1回だけ加算し、裂雲獣には弾薬120%を乗せない', () => {
  const s1 = at('char_4211_snhunt', 1, 500)
  close(s1.row.perAttack, physical(s1.result.stats.attack * 2.3 * 1.2, 500) + physical(s1.result.stats.attack * 1.8, 500))
  assert.equal(s1.row.dps, null)
  for (const stationary of [false, true]) {
    const { result, row } = at('char_4211_snhunt', 2, 500, { targetStationary: stationary })
    close(row.perAttack, physical(result.stats.attack * (stationary ? 2.6 : 2.2), 500) * 2 + physical(result.stats.attack * 1.8, 500))
    assert.deepEqual(row.attackComponents!.map(component => [component.role, component.count]), [['MAIN', 2], ['ADDITIONAL', 1]])
  }
  const arts = output('char_4211_snhunt', 1, { enemyResistance: 40 }, undefined, 'ARTS')
  assert.deepEqual(arts.unsupportedReasons, [])
  close(arts.rows.find(row => row.axisValue === 500)!.perAttack,
    arts.stats.attack * 2.3 * 1.2 * 0.6 + physical(arts.stats.attack * 1.8, 500))
})

test('ロスモンティスは余震と追加術を別々に軽減し、S2の余震を合計3回に置換する', () => {
  for (const active of [false, true]) {
    const s1 = at('char_391_rosmon', 1, 500, { thoughtMaintenanceActive: active, enemyResistance: 40, actualAttackTargetCount: 3 })
    const attack = buff(s1.result.stats.attack, active ? 0.08 : 0)
    close(s1.row.perAttack, physical(attack, 340) + physical(attack * 0.5, 340) + attack * 1.8 * 0.6)
    close(s1.row.allTargetsPerAttack, s1.row.perAttack * 3)
    assert.deepEqual(s1.row.attackComponents!.map(component => component.damageType), ['PHYSICAL', 'PHYSICAL', 'ARTS'])
    const s2 = at('char_391_rosmon', 2, 500, { thoughtMaintenanceActive: active })
    const attack2 = buff(s2.result.stats.attack, 0.55 + (active ? 0.08 : 0))
    close(s2.row.perAttack, physical(attack2, 340) + physical(attack2 * 0.5, 340) * 3)
    close(s2.result.attackInterval, s2.result.stats.baseAttackTime + 0.5)
  }
  const arts = output('char_391_rosmon', 2, {}, undefined, 'ARTS')
  assert.deepEqual(arts.unsupportedReasons, [])
  close(arts.rows.find(row => row.axisValue === 40)!.perAttack, buff(arts.stats.attack, 0.63) * (1 + 0.5 * 3) * 0.6)
})

test('承曦グレイは50%余震と1.5秒周期の球を分離し、通常攻撃ASPDで球の周期を変えない', () => {
  const s1 = at('char_1027_greyy2', 1, 500)
  const attack = buff(s1.result.stats.attack, 0.45)
  close(s1.row.perAttack, physical(attack, 500) + physical(attack * 0.5, 500))
  close(s1.result.attackInterval, s1.result.stats.baseAttackTime / 1.45)
  for (const balls of [0, 1, 2]) {
    const { result, row } = at('char_1027_greyy2', 2, 500, { activeLightningBalls: balls, enemyResistance: 40, actualAttackTargetCount: 3 })
    close(row.perAttack, physical(result.stats.attack, 500) + physical(result.stats.attack * 0.5, 500))
    close(row.damageOverTimeDps, result.stats.attack * 1.3 * 0.6 / 1.5 * balls)
    close(row.allTargetsCombinedDps, (row.perAttack / result.stats.baseAttackTime + result.stats.attack * 1.3 * 0.6 / 1.5 * balls) * 3)
  }
  assert.ok(output('char_1027_greyy2', 2, { activeLightningBalls: 3 }).unsupportedReasons.length)
})

test('スカイボックスの降下攻撃は選択した全対象にS1の300%・S2の240%を与える', () => {
  for (const index of [1, 2]) {
    const { result, row } = at('char_4213_skybx', index, 500, { actualAttackTargetCount: 4 })
    close(row.perAttack, physical(result.stats.attack * (index === 1 ? 3 : 2.4), 500))
    close(row.allTargetsPerAttack, row.perAttack * 4)
  }
})

test('アンブリエルS2は攻撃力のみ正確に計算し、予備動作が未確定のDPSを出さない', () => {
  const { result, row } = at('char_302_glaze', 2, 1000, { targetOutsideBaseRange: true })
  close(row.perAttack, physical(buff(result.stats.attack, 1), 1000))
  assert.equal(row.dps, null)
  assert.equal(result.attackInterval, null)
})

test('ロサS3とジエユンS2は通常攻撃間隔に依存せず、停止後の1秒周期で評価する', () => {
  const rosa = at('char_197_poca', 3, 1000, { targetWeight: 3, actualAttackTargetCount: 4 })
  close(rosa.row.perAttack, physical(buff(rosa.result.stats.attack, 0.25 + 0.08), 400))
  close(rosa.result.attackInterval, 1)
  close(rosa.row.dps, rosa.row.perAttack)
  close(rosa.row.allTargetsDps, rosa.row.perAttack * 4)
  for (const first of [false, true]) {
    const { result, row } = at('char_4078_bdhkgt', 2, 500, { firstDeployment: first, actualAttackTargetCount: 3 })
    close(row.perAttack, physical(buff(result.stats.attack, first ? 0.13 : 0) * 1.35, 500))
    close(result.attackInterval, 1)
    close(row.dps, row.perAttack)
  }
})

test('レミュアンS2は通常弾と指名手配対象への照準0/7/14段階を区別しDPSを推定しない', () => {
  for (const wanted of [false, true]) for (const steps of [0, 7, 14]) {
    const { result, row } = at('char_4193_lemuen', 2, 1000, { targetWanted: wanted, aimSteps: steps })
    const attack = buff(result.stats.attack, 0.7 + 0.1) * (wanted ? 1.8 + steps * 0.175 : 1)
    close(row.perAttack, physical(attack, 1000) * (wanted ? 1.15 : 1))
    assert.equal(row.dps, null)
    assert.equal(result.attackInterval, null)
  }
  assert.ok(output('char_4193_lemuen', 2, { aimSteps: 15 }).unsupportedReasons.length)
})

test('レミュアンS3は爆撃1発の爆心450%/外側300%を選択し、範囲内の各対象を評価する', () => {
  for (const center of [false, true]) for (const wanted of [false, true]) {
    const { result, row } = at('char_4193_lemuen', 3, 1000,
      { targetInBlastCenter: center, targetWanted: wanted, actualAttackTargetCount: 4 })
    close(row.perAttack, physical(buff(result.stats.attack, 0.1) * (center ? 4.5 : 3), 1000) * (wanted ? 1.15 : 1))
    close(row.allTargetsPerAttack, row.perAttack * 4)
    assert.equal(row.attackComponents![0].count, 1)
    assert.equal(row.dps, null)
  }
})

test('Wは各爆発1個を評価し、悪巧みの18%を範囲内でスタン中の物理ダメージだけへ適用する', () => {
  for (const index of [1, 2, 3]) for (const stunned of [false, true]) for (const inRange of [false, true]) {
    const { result, row } = at('char_113_cqbw', index, 1000,
      { targetStunnedAtDamage: stunned, targetInAttackRange: inRange, actualAttackTargetCount: 4 })
    close(row.perAttack, physical(result.stats.attack * [0, 3.5, 2.8, 3.1][index], 1000) * (stunned && inRange ? 1.18 : 1))
    close(row.allTargetsPerAttack, row.perAttack * 4)
    assert.equal(row.attackComponents![0].count, 1)
    assert.equal(row.dps, null)
  }
  const arts = output('char_113_cqbw', 3, { targetStunnedAtDamage: true, targetInAttackRange: true }, undefined, 'ARTS')
  assert.deepEqual(arts.unsupportedReasons, [])
  close(arts.rows.find(row => row.axisValue === 40)!.perAttack, arts.stats.attack * 3.1 * 0.6)
})

test('シュヴァルツは付与済み防御20%低下と80/50/100%の会心を軽減後に合成する', () => {
  for (const index of [1, 2, 3]) for (const anotherSniper of [false, true]) for (const defense of [0, 1000, 2000]) {
    const { result, row } = at('char_340_shwaz', index, defense, { anotherSniperDeployed: anotherSniper })
    const attack = buff(result.stats.attack, [0, 0, 1.3, 1.8][index] + (anotherSniper ? 0.08 : 0)) * (index === 1 ? 2.2 : 1)
    const chance = [0, 0.8, 0.5, 1][index]
    close(row.perAttack, physical(attack, defense * 0.8) * (1 - chance) + physical(attack * 1.6, defense * 0.8) * chance)
    if (index > 1) close(result.attackInterval, result.stats.baseAttackTime + (index === 3 ? 0.4 : 0))
  }
  for (const index of [1, 2, 3]) {
    const unknown = output('char_340_shwaz', index, { lethalArrowDefenseDownActive: false })
    assert.ok(unknown.unsupportedReasons.some(reason => reason.includes('初回の付与')))
    assert.deepEqual(unknown.rows, [])
  }
  const arts = output('char_340_shwaz', 3, {}, undefined, 'ARTS')
  assert.deepEqual(arts.unsupportedReasons, [])
  close(arts.rows.find(row => row.axisValue === 40)!.perAttack, buff(arts.stats.attack, 1.8) * 1.6 * 0.6)
})

test('ロスモンティスS3は戦術装備の固定低下160と素質の無視160を別々に適用する', () => {
  for (const equipment of [false, true]) for (const defense of [0, 500, 1000]) {
    const { result, row } = at('char_391_rosmon', 3, defense, { targetBlockedByEquipment: equipment })
    const attack = buff(result.stats.attack, 0.75 + 0.08)
    const effectiveDefense = Math.max(0, defense - 160 - (equipment ? 160 : 0))
    close(row.perAttack, physical(attack, effectiveDefense) + physical(attack * 0.5, effectiveDefense))
    close(result.attackInterval, result.stats.baseAttackTime - 0.5)
    close(row.dps, row.perAttack / result.attackInterval!)
  }
  assert.ok(output('char_391_rosmon', 3, { actualAttackTargetCount: 2 }).unsupportedReasons.length)
})

test('シェーシャのブロック対象への物理被ダメージ増加は仮想術攻撃へ適用しない', () => {
  const arts = output('char_379_sesa', 2, { targetBlocked: true }, undefined, 'ARTS')
  assert.deepEqual(arts.unsupportedReasons, [])
  const rawScale = record('char_379_sesa', 2).raw.blackboard!.find(value => value.key === 'attack@atk_scale')!.value!
  close(arts.rows.find(row => row.axisValue === 40)!.perAttack, arts.stats.attack * rawScale * 0.6)
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

test('アシッドドロップの最低ダメージ25/40%を強化後の攻撃力と各連撃に適用する', () => {
  for (const index of [1, 2]) for (const frontal of [false, true]) for (const defense of [0, 1000, 2000]) {
    const { result, row } = at('char_366_acdrop', index, defense, { targetInForwardTwoTiles: frontal })
    const attack = buff(result.stats.attack, index === 2 ? 0.4 : 0)
    const expected = Math.max(attack - defense, attack * (frontal ? 0.4 : 0.25)) * (index === 2 ? 2 : 1)
    close(row.perAttack, expected)
    close(result.attackInterval, result.stats.baseAttackTime / (index === 1 ? 1.7 : 1))
    close(row.dps, expected / result.attackInterval!)
  }
})

test('イグゼキュターの防御無視160とS1全範囲倍率・S2正面倍率を一度ずつ適用する', () => {
  for (const frontal of [false, true]) for (const index of [1, 2]) {
    const { result, row } = at('char_279_excu', index, 1000, { targetInFrontalTiles: frontal, actualAttackTargetCount: 3 })
    const attack = buff(result.stats.attack, index === 1 ? 0.7 : 0)
    const scale = index === 1 || frontal ? 1.5 : 1
    close(row.perAttack, physical(attack * scale, 840) * (index === 2 ? 2 : 1))
    close(row.allTargetsPerAttack, row.perAttack * 3)
    close(result.attackInterval, result.stats.baseAttackTime - (index === 2 ? 0.9 : 0))
  }
  const { result, row } = at('char_279_excu', 1, 0, { targetInFrontalTiles: false })
  close(row.perAttack, buff(result.stats.attack, 0.7) * 1.5)
})

test('ルナカブの素質はスキル中の基礎間隔から0.15秒を引き、S2速度140と合成する', () => {
  for (const index of [1, 2]) {
    const { result, row } = at('char_4014_lunacu', index, 500)
    close(row.perAttack, physical(buff(result.stats.attack, index === 1 ? 1 : 0), 500))
    close(result.attackInterval, (result.stats.baseAttackTime - 0.15) / (index === 2 ? 2.4 : 1))
    close(row.dps, row.perAttack / result.attackInterval!)
  }
})

test('キチセイは攻撃力の累積と撃破種類による減算後倍率を分けて計算する', () => {
  for (const stacks of [0, 4]) for (const defeated of [0, 3]) for (const frontal of [false, true]) {
    const { result, row } = at('char_4203_kichi', 1, 1000,
      { attackBuffStacks: stacks, defeatedEnemyTypes: defeated, targetInFrontalTiles: frontal, actualAttackTargetCount: 2 })
    const attack = buff(result.stats.attack, stacks * 0.25) * (frontal ? 1.5 : 1)
    close(row.perAttack, physical(attack, 1000) * (1 + defeated * 0.06))
    close(row.allTargetsPerAttack, row.perAttack * 2)
    close(result.attackInterval, result.stats.baseAttackTime + 0.5)
  }
  const { result, row } = at('char_4203_kichi', 2, 1000, { defeatedEnemyTypes: 2, targetInFrontalTiles: true })
  close(row.perAttack, physical(buff(result.stats.attack, 0.8) * 1.5, 1000) * 1.12)
  close(result.attackInterval, result.stats.baseAttackTime + 0.7)
  for (const conditions of [{ attackBuffStacks: 5 }, { attackBuffStacks: -1 }, { defeatedEnemyTypes: 4 }]) {
    const invalid = output('char_4203_kichi', 1, conditions)
    assert.ok(invalid.unsupportedReasons.length)
    assert.deepEqual(invalid.rows, [])
  }
})

test('シラユキS1は大型手裏剣の攻撃力20%と間隔0.2秒を反映する', () => {
  const { result, row } = at('char_118_yuki', 1, 1000, { actualAttackTargetCount: 4 })
  close(row.perAttack, physical(buff(result.stats.attack, 0.2), 1000))
  close(row.allTargetsPerAttack, row.perAttack * 4)
  close(result.attackInterval, result.stats.baseAttackTime + 0.2)
})

test('メテオリーテS1は30%の攻撃力加算を各防御軽減後に平均する', () => {
  for (const defense of [0, 1000, 2000]) {
    const { result, row } = at('char_219_meteo', 1, defense, { actualAttackTargetCount: 3 })
    const normalDamage = physical(result.stats.attack * 2.15, defense)
    const talentDamage = physical(buff(result.stats.attack, 0.6) * 2.15, defense)
    close(row.perAttack, normalDamage * 0.7 + talentDamage * 0.3)
    close(row.allTargetsPerAttack, row.perAttack * 3)
    assert.equal(row.dps, null)
  }
})

test('遊龍チェンS1は全範囲150%と水場の攻撃速度を計算し弾薬確率をDPSへ掛けない', () => {
  for (const water of [false, true]) {
    const { result, row } = at('char_1013_chen2', 1, 1000, { mapHasWater: water, actualAttackTargetCount: 4 })
    close(row.perAttack, physical(buff(result.stats.attack, 1) * 1.5, 1000))
    close(row.allTargetsPerAttack, row.perAttack * 4)
    close(result.attackInterval, result.stats.baseAttackTime / (water ? 1.12 : 1.08))
    close(row.dps, row.perAttack / result.attackInterval!)
  }
})

test('追加狙撃7名15スキルの11対応と4保留が比較ページと実装状況へ一致して反映される', () => {
  const ids = ['char_366_acdrop', 'char_279_excu', 'char_4014_lunacu', 'char_4203_kichi', 'char_118_yuki', 'char_219_meteo', 'char_1013_chen2']
  const records = sources.filter(source => ids.includes(source.operatorId)).flatMap(source => source.skills.map(skill => record(source.operatorId, skill.skillIndex)))
  const coverage = buildDamageCalculatorThreeCoverage(records)
  assert.equal(coverage.length, 15)
  assert.equal(coverage.filter(row => row.status === 'SUPPORTED').length, 11)
  assert.equal(coverage.filter(row => row.status === 'PENDING').length, 4)
  const entries = getDamageThreeComparisonEntries(records)
  assert.equal(entries.length, 15)
  for (const entry of entries) {
    const result = evaluateDamageThreeComparisonEntry(entry, { defense: 500, resistance: 0, enemyCount: 1 })
    const pending = coverage.find(row => row.skill.operatorId === entry.skill.operatorId && row.skill.skillIndex === entry.skill.skillIndex)!.status === 'PENDING'
    assert.equal(result.errors.length > 0, pending)
    if (pending) assert.equal(result.perAttack, null)
    else assert.ok(result.perAttack !== null && result.perAttack > 0)
    const constant = ['char_366_acdrop', 'char_279_excu', 'char_4014_lunacu', 'char_118_yuki'].includes(entry.skill.operatorId) && !pending
    if (constant) close(result.totalDamage, result.combinedDps! * result.durationSeconds!)
    else assert.equal(result.totalDamage, null)
  }
})

test('追加狙撃の素質欠落・特性変更・未知の条件で部分的な値を返さない', () => {
  for (const id of ['char_366_acdrop', 'char_279_excu', 'char_4014_lunacu', 'char_219_meteo']) {
    const result = output(id, 1, {}, skill => {
      for (const candidate of skill.operatorProfile.talents[0].candidates ?? []) candidate.blackboard = []
    })
    assert.ok(result.unsupportedReasons.length, id)
    assert.deepEqual(result.rows, [], id)
  }
  const traitChanged = output('char_279_excu', 1, {}, skill => { skill.operatorProfile.traitDescription += '追加攻撃' })
  assert.ok(traitChanged.unsupportedReasons.length)
  assert.deepEqual(traitChanged.rows, [])
  const invalid = output('char_366_acdrop', 1, { targetInForwardTwoTiles: 'maybe' })
  assert.ok(invalid.unsupportedReasons.length)
  assert.deepEqual(invalid.rows, [])
})
