import test from 'node:test'
import { evaluateGuardTraits } from '../src/lib/guardTraitEvaluation.ts'
import assert from 'node:assert/strict'
import { EXPANDED_OPERATOR_SOURCES, EXPANDED_OPERATOR_DEFINITIONS, getExpandedDefinition } from '../src/lib/expandedCombatRegistry.ts'
import { buildTraitStructures, isTraitStructureOperator, formatTraitStructureEffectValue,
  getTraitStructureEffectDefinitionRows, type TraitStructureEffect } from '../src/lib/traitStructure.ts'
import { buildTraitApplicationRows, getExpandedTraitCoverage } from '../src/lib/traitEffectApplication.ts'
import { buildDamageCalculatorThreeOutput, type DamageCalculatorThreeInput } from '../src/lib/damageCalculatorThree.ts'
import { buildDamageCalculatorThreeCoverage } from '../src/lib/damageCalculatorThreeCoverage.ts'
import { evaluateCombatCondition } from '../src/lib/combatEffectStructure.ts'
import { evaluateTraitStructure } from '../src/lib/traitCombatEvaluation.ts'
import { classifySkill } from '../src/lib/classifier.ts'
import type { GuardConditions } from '../src/lib/guardCombatTypes.ts'
import type { SkillRecord } from '../src/types/skill.ts'

function record(id: string, index = 1): SkillRecord {
  const source = EXPANDED_OPERATOR_SOURCES.find(s => s.operatorId === id)!
  const entry = source.skills.find(s => s.skillIndex === index)!, raw = structuredClone(entry.raw)
  return { id: `${id}/${index}`, operatorId: id, operatorName: source.operatorName, skillId: entry.skillId,
    skillIndex: index, skillName: raw.name!, profession: source.profession, professionLabel: source.profession, rarity: source.rarity,
    subProfessionId: source.subProfessionId, subProfessionName: source.subProfessionId, nameInitial: 'OTHER',
    description: raw.description!, duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
    spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!,
    classification: classifySkill(raw), skillLevels: Array.from({ length: source.skillLevelIndex + 1 }, () => structuredClone(raw)),
    raw, operatorProfile: structuredClone(source.profile) }
}
function structure(id: string) {
  const value = buildTraitStructures([record(id)])[0]
  assert.ok(value, id)
  return value
}
function byJob(job: string) { return EXPANDED_OPERATOR_SOURCES.find(source => source.subProfessionId === job)!.operatorId }
function effect(id: string, item: TraitStructureEffect['item']) {
  const value = structure(id).effects.find(e => e.item === item)
  assert.ok(value, `${id}/${item}`)
  return value
}
function run(id: string, index = 1, guard: GuardConditions = {}) {
  const skill = record(id, index), definition = getExpandedDefinition(id)!
  const input: DamageCalculatorThreeInput = { operator: skill, skill, phaseIndex: definition.phaseIndex,
    operatorLevel: skill.operatorProfile.phases[definition.phaseIndex].maxLevel!, trust: 100,
    skillLevelIndex: definition.skillLevelIndex, conditions: { guard } }
  const output = buildDamageCalculatorThreeOutput(input), before = structuredClone(output)
  const rows = buildTraitApplicationRows(input, output)
  assert.deepEqual(output, before, '特性表示のために計算を再適用しない')
  return { input, output, rows }
}
function appliedItem(result: ReturnType<typeof run>, suffix: string) {
  const value = result.rows.find(row => row.id.endsWith(suffix))
  assert.ok(value, suffix)
  return value
}

test('追加23職分で説明・パラメータを照合し、同じ職分の定義を複数OPに再利用する', () => {
  const additions = ['pioneer', 'protector', 'shotprotector', 'artsprotector', 'unyield',
    'fastshot', 'aoesniper', 'longrange', 'siegesniper', 'reaperrange', 'closerange',
    'corecaster', 'splashcaster', 'blastcaster', 'slower', 'underminer', 'incantationmedic', 'phalanx',
    'agent', 'charger', 'stalker', 'chain', 'duelist']
  for (const job of additions) {
    const sources = EXPANDED_OPERATOR_SOURCES.filter(source => source.subProfessionId === job)
    assert.ok(sources.length, job)
    for (const source of sources) {
      const value = structure(source.operatorId)
      assert.notEqual(value.status, 'UNREVIEWED', source.operatorName)
      assert.deepEqual(value.issues, [], source.operatorName)
      assert.ok(value.effects.length, source.operatorName)
      for (const entry of value.effects) assert.ok(getTraitStructureEffectDefinitionRows(entry).length)
    }
  }
  assert.equal(isTraitStructureOperator({ profession: 'WARRIOR', subProfessionId: 'corecaster' }), false)
  const shared = record(byJob('fastshot'))
  shared.operatorId = 'another-marksman'
  assert.ok(buildTraitStructures([shared])[0].effects.some(value => value.item === 'ATTACK_PRIORITY'))
})

test('偵察兵・突撃兵の再配置とコストを構造化し、ダメージへ追加しない', () => {
  const agent = structure(byJob('agent'))
  assert.equal(agent.effects.find(effect => effect.item === 'REDEPLOY_TIME')?.value, 35)
  const charger = structure(byJob('charger'))
  assert.equal(charger.effects.find(effect => effect.item === 'DP_ON_KILL')?.value, 1)
  assert.equal(charger.effects.find(effect => effect.item === 'RETREAT_COST_REFUND')?.value, 'INITIAL_DEPLOY_COST')
  for (const source of [agent, charger]) {
    const result = evaluateTraitStructure(source, { kind: 'NORMAL', metrics: {} })
    assert.deepEqual(result.blockers, [])
    assert.equal(result.attackScale, 1)
    assert.ok(result.evaluations.every(row => row.status === 'NOT_RELEVANT'))
  }
})

test('決闘者の未ブロック時のSP停止は保持し、発動中の直接ダメージを停止させない', () => {
  const id = byJob('duelist'), source = structure(id)
  const restriction = source.effects.find(entry => entry.item === 'NATURAL_SP_RECOVERY_ENABLED')!
  assert.ok(restriction)
  assert.equal(restriction.value, false)
  assert.equal(restriction.calculationRelevance, 'NOT_RELEVANT')
  assert.equal(evaluateCombatCondition(restriction.condition, { 'source.isBlocking': false }), true)
  assert.equal(evaluateCombatCondition(restriction.condition, { 'source.isBlocking': true }), false)
  assert.equal(evaluateCombatCondition(restriction.condition, {}), null)
  for (const metrics of [{}, { 'source.isBlocking': false }, { 'source.isBlocking': true }]) {
    const result = evaluateTraitStructure(source, { kind: 'NORMAL', metrics })
    assert.deepEqual(result.blockers, [])
    assert.equal(result.attackScale, 1)
    assert.equal(result.attackRatio, 0)
    assert.ok(result.evaluations.every(row => row.status === 'NOT_RELEVANT'))
  }
  const changed = record(id)
  changed.operatorProfile.traitDescription += ' 攻撃力が上昇'
  const unreviewed = buildTraitStructures([changed])[0]
  assert.equal(unreviewed.status, 'UNREVIEWED')
  assert.ok(evaluateTraitStructure(unreviewed, { kind: 'NORMAL', metrics: {} }).blockers.length)
})

test('潜伏者の全体攻撃は回避率と独立し、7対象でも対象数を切り捨てない', () => {
  const id = byJob('stalker'), source = structure(id)
  assert.equal(source.effects.find(effect => effect.item === 'PHYSICAL_DODGE')?.value, 0.5)
  assert.equal(source.effects.find(effect => effect.item === 'ARTS_DODGE')?.value, 0.5)
  const one = run(id, 2, { actualAttackTargetCount: 1 }).output
  const many = run(id, 2, { actualAttackTargetCount: 7 }).output
  assert.deepEqual(many.unsupportedReasons, [])
  assert.equal(many.maxTargetCount, null)
  assert.equal(many.rows[0].perAttack, one.rows[0].perAttack)
  assert.equal(many.rows[0].allTargetsPerAttack, one.rows[0].perAttack * 7)
})

test('連鎖特性の減衰率と上限は検証し、スキル固有動作には通常攻撃の跳躍を追加しない', () => {
  const source = structure(byJob('chain'))
  const metrics = { 'attack.targetCount': 4 }
  const normal = evaluateTraitStructure(source, { kind: 'NORMAL', metrics })
  assert.deepEqual(normal.blockers, [])
  assert.equal(normal.maxTargets, 4)
  assert.equal(normal.chainRetention, 0.85)
  for (const retention of [-0.1, 1.1, NaN]) {
    assert.ok(evaluateTraitStructure(source, { kind: 'NORMAL', metrics, chainDamageRetention: retention }).blockers.length)
  }
  const invalid = { ...source, effects: source.effects.map(effect => effect.item === 'CHAIN_ATTACK'
    ? { ...effect, value: { ...effect.value, maxTargets: 2.5 } } : effect) }
  assert.ok(evaluateTraitStructure(invalid, { kind: 'NORMAL', metrics }).blockers.length)
  const action = evaluateTraitStructure(source, { kind: 'SKILL_ACTION', metrics })
  assert.equal(action.chainRetention, undefined)
  assert.equal(action.damageType, undefined)
})

test('優先対象は飛行・最低防御・最大重量を区別し、指定対象のダメージ倍率にしない', () => {
  for (const [job, expected] of [['fastshot', 'AIRBORNE'], ['longrange', 'LOWEST_DEFENSE'], ['siegesniper', 'HIGHEST_WEIGHT']]) {
    const id = byJob(job), priority = effect(id, 'ATTACK_PRIORITY')
    assert.equal(priority.value, expected)
    assert.equal(priority.calculationRelevance, 'NOT_RELEVANT')
    assert.equal(appliedItem(run(id), 'attack-priority').status, 'NOT_RELEVANT')
  }
})

test('術属性、直線・範囲攻撃、単体攻撃の上書きを実際の攻撃定義と照合する', () => {
  for (const job of ['corecaster', 'splashcaster', 'blastcaster', 'slower', 'underminer', 'incantationmedic', 'phalanx', 'artsprotector']) {
    assert.equal(effect(byJob(job), 'DAMAGE_TYPE').value, 'ARTS')
    assert.equal(appliedItem(run(byJob(job)), 'normal-attack-damage-type').status, 'APPLIED', job)
  }
  const line = effect(byJob('blastcaster'), 'ATTACK_TARGETING')
  assert.equal(formatTraitStructureEffectValue(line), '直線上の範囲攻撃')
  assert.equal(appliedItem(run(byJob('blastcaster')), 'area-attack-targets').status, 'APPLIED')
  assert.equal(effect(byJob('aoesniper'), 'DAMAGE_TYPE').value, 'PHYSICAL')
  assert.equal(appliedItem(run('char_002_amiya', 3), 'normal-attack-damage-type').status, 'NOT_RELEVANT')
  assert.equal(appliedItem(run('char_411_tomimi', 1), 'normal-attack-damage-type').status, 'NOT_RELEVANT')
})

test('散弾射手の1.5倍は正面条件と対応し、範囲外・不正データでは適用済みにしない', () => {
  const id = 'char_440_pinecn', scale = effect(id, 'ATTACK_SCALE')
  assert.equal(scale.value, 1.5)
  assert.equal(evaluateCombatCondition(scale.condition, { 'target.inFrontalTiles': true }), true)
  const inside = run(id, 1, { targetInFrontalTiles: true })
  assert.equal(appliedItem(inside, 'frontal-attack-scale').status, 'APPLIED')
  assert.equal(appliedItem(run(id, 2, { targetInFrontalTiles: false }), 'frontal-attack-scale').status, 'CONDITION_FALSE')
  const changed = structuredClone(inside.input)
  changed.operator.operatorProfile.trait!.candidates![0].rangeId = 'unknown-frontal-range'
  assert.deepEqual(buildTraitApplicationRows(changed, inside.output).map(row => row.status), ['UNVERIFIED'])
})

test('緩速師の足止め時間と呪癒師の回復率をダメージ項目から分離する', () => {
  const slow = effect(byJob('slower'), 'STATUS')
  assert.equal(slow.value, 'SLUGGISH')
  assert.deepEqual(slow.lifetime, { type: 'FIXED_SECONDS', seconds: 0.8 })
  assert.equal(appliedItem(run(byJob('slower')), 'attack-sluggish').status, 'NOT_RELEVANT')
  const heal = effect(byJob('incantationmedic'), 'DAMAGE_TO_HEAL_RATIO')
  assert.equal(heal.value, 0.5)
  assert.deepEqual(heal.target.selection, { type: 'COUNT', count: 1 })
  assert.equal(heal.target.scope, 'ATTACK_RANGE')
  assert.equal(appliedItem(run(byJob('incantationmedic')), 'damage-to-heal').status, 'NOT_RELEVANT')
})

test('法陣術師の待機・発動条件と先鋒・重装の基本ブロック数を独立して保持する', () => {
  const value = structure(byJob('phalanx'))
  const inactive = value.effects.find(e => e.id === 'inactive-normal-attack')!
  assert.equal(evaluateCombatCondition(inactive.condition, { 'source.skillActive': false }), true)
  assert.equal(effect(byJob('phalanx'), 'DEFENSE_BUFF_RATIO').value, 2)
  assert.equal(effect(byJob('phalanx'), 'MAGIC_RESISTANCE').value, 20)
  assert.equal(effect(byJob('pioneer'), 'BLOCK_COUNT').value, 2)
  assert.equal(effect(byJob('protector'), 'BLOCK_COUNT').value, 3)
  assert.equal(effect(byJob('shotprotector'), 'RANGED_ATTACK_ENABLED').value, true)
  assert.equal(effect(byJob('unyield'), 'ALLY_HEALING_ENABLED').value, false)
})

test('新規領主・教官も条件倍率を攻撃定義から確認し、再乗算しない', () => {
  const midn = EXPANDED_OPERATOR_SOURCES.find(o => o.operatorId.endsWith('_midn'))!.operatorId
  const doberm = EXPANDED_OPERATOR_SOURCES.find(o => o.operatorId.endsWith('_doberm'))!.operatorId
  assert.equal(appliedItem(run(midn, 1, { attackDistanceType: 'RANGED' }), 'ranged-attack-scale').status, 'APPLIED')
  assert.equal(appliedItem(run(midn, 1), 'ranged-attack-scale').status, 'CONDITION_FALSE')
  assert.equal(appliedItem(run(doberm, 1), 'unblocked-by-source-scale').status, 'APPLIED')
  assert.equal(appliedItem(run(doberm, 1, { targetBlockedBySelf: true }), 'unblocked-by-source-scale').status, 'CONDITION_FALSE')
})

test('領主の固定攻撃扱いを表示・対応範囲で区別し、遠距離倍率を二重適用しない', () => {
  const idFor = (suffix: string) => EXPANDED_OPERATOR_SOURCES.find(o => o.operatorId.endsWith(`_${suffix}`))!.operatorId
  const arene = idFor('spikes'), ranged = run(arene, 1, { attackDistanceType: 'MELEE' })
  assert.equal(ranged.output.attackDistanceType, 'RANGED')
  assert.equal(appliedItem(ranged, 'ranged-attack-scale').status, 'APPLIED')
  assert.equal(getExpandedTraitCoverage(arene, getExpandedDefinition(arene)!.recipes[0].stages[0]), 'SUPPORTED')
  const scale = ranged.input.skill.raw.blackboard!.find(entry => entry.key === 'attack@atk_scale')!.value!
  assert.ok(Math.abs(ranged.output.rows[0].perAttack! - ranged.output.stats.attack * scale * 0.8 * 2) < 1e-8,
    '防御0でスキル倍率×特性0.8×2ヒット。特性0.8の再乗算はない')
  assert.ok(Math.abs(ranged.output.effectiveAttack! - ranged.output.stats.attack * 0.8) < 1e-8,
    '軽減前の値にも実際に適用した特性倍率を含める')
  for (const suffix of ['spikes', 'whitew', 'leto']) {
    const id = idFor(suffix), result = run(id, 2, { attackDistanceType: 'RANGED' })
    const stage = getExpandedDefinition(id)!.recipes.find(recipe => recipe.skillIndex === 2)!.stages[0]
    assert.equal(result.output.attackDistanceType, 'MELEE', suffix)
    assert.equal(appliedItem(result, 'ranged-attack-scale').status, 'NOT_RELEVANT', suffix)
    assert.equal(getExpandedTraitCoverage(id, stage), 'NOT_APPLICABLE', suffix)
    const skillScale = suffix === 'spikes' ? result.input.skill.raw.blackboard!.find(entry => entry.key === 'attack@atk_scale')!.value! : 1
    assert.ok(Math.abs(result.output.rows[0].perAttack! - result.output.effectiveAttack! * skillScale) < 1e-8, suffix)
  }
})

test('未確認職分や説明の追加を黙って対応済みにせず、全追加技能の計算保留時にAPPLIEDを出さない', () => {
  const pending = run(byJob('merchant'))
  pending.input.operator.subProfessionId = 'future-unreviewed-job'
  assert.deepEqual(buildTraitStructures([pending.input.operator]), [])
  assert.equal(buildTraitApplicationRows(pending.input, pending.output)[0].status, 'UNVERIFIED')
  const changed = record(byJob('fastshot'))
  changed.operatorProfile.traitDescription += '追加で2回攻撃'
  assert.equal(buildTraitStructures([changed])[0].status, 'UNREVIEWED')
  const tagged = record(byJob('corecaster'))
  tagged.operatorProfile.traitDescription += '<追加効果>'
  assert.equal(buildTraitStructures([tagged])[0].status, 'UNREVIEWED')
  for (const definition of EXPANDED_OPERATOR_DEFINITIONS) {
    const indexes = [...definition.recipes.map(r => r.skillIndex), ...(definition.deferredSkills ?? []).map(s => s.skillIndex)]
    for (const index of indexes) {
      const result = run(definition.operatorId, index)
      assert.ok(result.rows.length, `${definition.operatorId}/${index}`)
      if (!result.output.rows.length) assert.ok(result.rows.every(row => row.status !== 'APPLIED'), `${definition.operatorId}/${index}`)
    }
  }
})

test('登録範囲では優先対象・治療可否・ブロック・射程だけの特性を対象外にする', () => {
  for (const job of ['fastshot', 'longrange', 'siegesniper', 'closerange', 'pioneer', 'protector', 'shotprotector', 'unyield', 'fearless', 'fighter', 'musha', 'merchant', 'loopshooter']) {
    const id = byJob(job), stage = getExpandedDefinition(id)!.recipes[0].stages[0]
    assert.equal(getExpandedTraitCoverage(id, stage), 'NOT_APPLICABLE', job)
  }
  assert.equal(run(byJob('loopshooter'), 2).rows[0].status, 'NOT_RELEVANT')
})

test('登録範囲は攻撃属性・全対象・ブロック連動対象数・条件倍率の使用をstageから判定する', () => {
  for (const job of ['corecaster', 'splashcaster', 'blastcaster', 'slower', 'underminer', 'incantationmedic',
    'phalanx', 'artsprotector', 'aoesniper', 'reaperrange', 'centurion', 'crusher', 'reaper', 'artsfghter', 'instructor', 'lord']) {
    const id = byJob(job), definition = getExpandedDefinition(id)!
    assert.equal(getExpandedTraitCoverage(id, definition.recipes[0].stages[0]), 'SUPPORTED', job)
  }
  for (const [id, index] of [['char_002_amiya', 3], ['char_411_tomimi', 1]] as const) {
    const stage = getExpandedDefinition(id)!.recipes.find(recipe => recipe.skillIndex === index)!.stages[0]
    assert.equal(getExpandedTraitCoverage(id, stage), 'NOT_APPLICABLE', id)
  }
  const sword = byJob('sword')
  for (const recipe of getExpandedDefinition(sword)!.recipes) {
    assert.equal(getExpandedTraitCoverage(sword, recipe.stages[0]), 'NOT_APPLICABLE', '剣豪の固有動作に通常攻撃2ヒットを加算しない')
  }
})

test('未登録職分・保留技能・変更された攻撃定義をtraitログなしという理由で対応済みにしない', () => {
  const aoe = byJob('splashcaster'), stage = getExpandedDefinition(aoe)!.recipes[0].stages[0]
  assert.equal(getExpandedTraitCoverage(aoe, { id: 'pending', label: '保留', kind: 'SKILL_ACTION', actions: [] }), 'UNSUPPORTED')
  assert.equal(getExpandedTraitCoverage(aoe, { ...stage, actions: [{ label: '変更', damageType: 'TRUE', scale: 100 }] }), 'UNSUPPORTED')
  assert.equal(getExpandedTraitCoverage('unknown', stage), 'UNSUPPORTED')
})

test('損傷のみ・保留段階・召喚物の攻撃を本人の特性未対応として集計しない', () => {
  const [virtuosa, tomimi, blacknight, mitm] = buildDamageCalculatorThreeCoverage([
    record('char_245_cello', 1), record('char_411_tomimi', 2), record('char_476_blkngt', 2), record('char_4147_mitm', 1),
  ])
  assert.equal(virtuosa.sections.trait, 'NOT_APPLICABLE')
  assert.equal(tomimi.sections.trait, 'NOT_APPLICABLE')
  assert.equal(tomimi.status, 'CONDITIONAL')
  assert.ok(tomimi.deferredReasons.length > 0)
  assert.equal(blacknight.sections.trait, 'NOT_APPLICABLE')
  assert.equal(mitm.sections.trait, 'SUPPORTED', '本人が援軍のブロック対象を攻撃する段階には特性を使う')
})


test('吟遊者・祈祷師・鬼才の非攻撃効果をダメージ倍率へ混ぜない', () => {
  const bard = structure('char_1012_skadi2')
  assert.equal(bard.status, 'STRUCTURED')
  assert.equal(bard.effects.find(effect => effect.item === 'NORMAL_ATTACK_ENABLED')?.value, false)
  assert.equal(bard.effects.find(effect => effect.item === 'HP_RECOVERY_ATK_RATIO_PER_SECOND')?.value, 0.1)
  assert.equal(bard.effects.find(effect => effect.item === 'INSPIRATION_ENABLED')?.value, false)
  const geek = structure('char_225_haak')
  assert.equal(geek.effects.find(effect => effect.item === 'HP_LOSS_RATIO_PER_SECOND')?.value, 0.01)
  const healer = structure('char_4202_haruka')
  assert.equal(evaluateTraitStructure(healer, { kind: 'NORMAL', metrics: { 'source.skillActive': false } }).damageType, 'ARTS')
  assert.ok(evaluateTraitStructure(healer, { kind: 'NORMAL', metrics: { 'source.skillActive': true } }).blockers.length)
  assert.deepEqual(evaluateTraitStructure(healer, { kind: 'SKILL_ACTION', metrics: { 'source.skillActive': true } }).blockers, [])
})

test('ヴィーイの転置エネルギーを通常貯蔵9発と誤認せず、確認済みの技能定義を要求する', () => {
  const operator = record('char_4226_veen')
  const trait = structure(operator.operatorId)
  assert.equal(trait.status, 'STRUCTURED')
  assert.equal(trait.effects.find(effect => effect.item === 'STORED_CHARGES')?.value, 9)
  assert.equal(trait.effects.find(effect => effect.item === 'STORED_CHARGE_MERGE_COUNT')?.value, 3)
  const stage = { id: 'normal', label: '通常攻撃', kind: 'NORMAL' as const,
    actions: [{ label: '通常', role: 'MAIN' as const, damageType: 'ARTS' as const, scale: 1 }] }
  const growth = { phaseIndex: 2, operatorLevel: 70 }
  assert.ok(evaluateGuardTraits(operator, stage, {}, new Map(), growth).evaluation.blockers.length)
  const explicit = evaluateGuardTraits(operator, { ...stage, traitOverrides: ['STORED_CHARGES'] }, {}, new Map(), growth)
  assert.deepEqual(explicit.evaluation.blockers, [])
  assert.equal(explicit.actions.length, 1)
  const changed = structuredClone(operator)
  changed.operatorProfile.trait!.candidates![0].blackboard!.find(item => item.key === 'merge_cnt')!.value = 4
  assert.equal(buildTraitStructures([changed])[0].status, 'PARTIAL')
})
