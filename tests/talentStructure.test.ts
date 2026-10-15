import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildTalentStructures, findTalentStructure, isTalentStructureSelection, TALENT_STRUCTURE_OPERATOR_IDS,
  formatTalentStructureCondition, formatTalentStructureTiming, formatTalentStructureTarget,
  formatTalentStructureEffectItem, formatTalentStructureEffectOperation, formatTalentStructureEffectValue,
  getTalentStructureEffectValueRows, getTalentStructureEffectDefinitionRows,
} from '../src/lib/talentStructure.ts'
import { evaluateCombatCondition } from '../src/lib/combatEffectStructure.ts'
import { SKILL_STRUCTURES, formatSkillStructureEffectItem, formatSkillStructureEffectValue } from '../src/lib/skillStructure.ts'
import type { OperatorCombatProfile, SkillRecord } from '../src/types/skill.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/talentStructureFourOperators.json', import.meta.url), 'utf8')) as {
  operatorId: string; operatorName: string; profession: string; professionLabel: string; rarity: number;
  subProfessionName: string; operatorProfile: OperatorCombatProfile
}[]

function records(): SkillRecord[] {
  return structuredClone(fixture).map(operator => ({
    ...operator, id: `${operator.operatorId}:skill`, skillId: 'test_skill', skillIndex: 1,
    skillName: 'スキルとは独立', description: 'スキルの攻撃力+999%', subProfessionId: 'test', nameInitial: 'S_ROW',
    duration: 10, durationType: 'NONE', skillType: 'MANUAL', spType: 'INCREASE_WITH_TIME', initSp: 0, spCost: 10,
    skillLevels: [], raw: {}, classification: {} as SkillRecord['classification'],
  }))
}
const find = (operatorId: string, talentIndex: number, rows = records()) => {
  const structure = findTalentStructure({ operatorId, talentIndex }, buildTalentStructures(rows))
  assert.ok(structure, `${operatorId}/${talentIndex}`)
  return structure
}

test('独立したJP原典8素質を潜在1・最大昇進・最大レベル・MODなしで構造化する', () => {
  const rows = records()
  const structures = buildTalentStructures(rows)
  assert.equal(structures.length, 8)
  for (const operator of fixture) for (const [talentIndex, talent] of operator.operatorProfile.talents!.entries()) {
    const structure = findTalentStructure({ operatorId: operator.operatorId, talentIndex }, structures)
    assert.ok(structure)
    assert.equal(structure.basicInfo.talentName, talent.candidates![0].name)
    assert.equal(structure.basicInfo.phaseIndex, 2)
    assert.equal(structure.basicInfo.operatorLevel, 90)
    assert.equal(structure.basicInfo.potentialRank, 1)
    assert.equal(structure.basicInfo.module, 'NONE')
    assert.equal(structure.source.requiredPotentialRank, 0)
    assert.deepEqual(structure.issues, [])
    assert.ok(structure.effects.length > 0)
    assert.ok(structure.effects.every(effect => effect.sourceBinding))
  }
})

test('素質の4OP集合をスキル構造の対応OP集合に揃え、対応範囲は明示された8枠に限る', () => {
  assert.deepEqual([...TALENT_STRUCTURE_OPERATOR_IDS].sort(), [...new Set(SKILL_STRUCTURES.map(structure => structure.basicInfo.operatorId))].sort())
  for (const operatorId of TALENT_STRUCTURE_OPERATOR_IDS) for (const talentIndex of [0, 1]) {
    assert.ok(isTalentStructureSelection({ operatorId, talentIndex }))
  }
  for (const selection of [
    { operatorId: 'char_4009_irene', talentIndex: 0 },
    { operatorId: 'char_350_surtr', talentIndex: 2 },
    { operatorId: 'char_350_surtr', talentIndex: -1 },
    { operatorId: 'char_350_surtr', talentIndex: 0.5 },
    { operatorId: 'char_350_surtr', talentIndex: NaN },
  ]) {
    assert.equal(isTalentStructureSelection(selection), false)
    assert.equal(findTalentStructure(selection, buildTalentStructures(records())), null)
  }
})

test('シルバーアッシュは自身ATKと編成全員の再配置割合を別効果にし、ステルスの範囲条件も保持する', () => {
  const charisma = find('char_172_svrash', 0)
  assert.equal(charisma.effects.length, 2)
  const [attack, redeploy] = charisma.effects
  assert.deepEqual([attack.item, attack.operation, attack.value, attack.unit, attack.target.side, attack.target.scope, attack.timing],
    ['ATK_BUFF_RATIO', 'ADD_RATIO', 0.1, 'RATIO', 'SELF', 'SELF', { type: 'CONTINUOUS', while: 'DEPLOYED' }])
  assert.deepEqual([redeploy.item, redeploy.operation, redeploy.value, redeploy.unit, redeploy.timing],
    ['REDEPLOY_TIME', 'ADD_RATIO', -0.1, 'RATIO', { type: 'CONTINUOUS', while: 'IN_SQUAD' }])
  assert.deepEqual(redeploy.target, { type: 'RECIPIENTS', side: 'ALLY', entity: 'UNIT', scope: 'SQUAD', factionIds: [], tagIds: [], includeSelf: true, selection: { type: 'ALL' } })
  const reveal = find('char_172_svrash', 1).effects[0]
  assert.equal(reveal.item, 'STEALTH')
  assert.equal(reveal.value, false)
  assert.equal(reveal.target.side, 'ENEMY')
  assert.equal(reveal.target.scope, 'ATTACK_RANGE')
  assert.equal(reveal.condition?.type === 'COMPARE' && reveal.condition.metric, 'target.inAttackRange')
})

test('スカジは陣営への編成ATKと自身の再配置秒数を分離し、自己専用や割合へ書き換えない', () => {
  const attack = find('char_263_skadi', 0).effects[0]
  assert.equal(attack.value, 0.14)
  assert.deepEqual(attack.timing, { type: 'CONTINUOUS', while: 'IN_SQUAD' })
  assert.equal(attack.target.side, 'ALLY')
  assert.equal(attack.target.scope, 'SQUAD')
  assert.equal(attack.target.includeSelf, true)
  assert.deepEqual(attack.target.factionIds, ['abyssal'])
  assert.deepEqual(attack.target.tagIds, [])
  const redeploy = find('char_263_skadi', 1).effects[0]
  assert.deepEqual([redeploy.item, redeploy.operation, redeploy.unit, redeploy.value, redeploy.target.side],
    ['REDEPLOY_TIME', 'ADD_VALUE', 'SECOND', -10, 'SELF'])
  assert.equal(formatTalentStructureEffectValue(redeploy), '－10秒')
})

test('スルトは攻撃の術耐性固定無視と致命HP・遅延退場を保持し、敵の耐性低下へ変換しない', () => {
  const ignore = find('char_350_surtr', 0).effects[0]
  assert.deepEqual([ignore.item, ignore.operation, ignore.value, ignore.unit, ignore.target.side, ignore.target.entity, ignore.timing, ignore.lifetime],
    ['RESISTANCE_IGNORE_FIXED', 'IGNORE_FIXED', 20, 'POINT', 'SELF', 'ATTACK', { type: 'EVENT', event: 'ATTACK' }, { type: 'CURRENT_EVENT' }])
  const remnant = find('char_350_surtr', 1)
  const hp = remnant.effects.find(effect => effect.item === 'HP')!
  const retreat = remnant.effects.find(effect => effect.item === 'FORCED_RETREAT')!
  assert.equal(hp.value, 1)
  assert.deepEqual(hp.timing, { type: 'EVENT', event: 'LETHAL_DAMAGE' })
  assert.deepEqual(retreat.timing, { type: 'AFTER_EVENT', event: 'LETHAL_DAMAGE', delaySeconds: 8 })
  assert.deepEqual(retreat.afterEffects, [hp.id])
  assert.deepEqual(hp.restrictions, [{ type: 'APPLICATION_LIMIT', count: null, scope: 'SOURCE_LIFETIME', reset: 'UNSPECIFIED' }])
  assert.deepEqual(hp.probability, { chance: 1, rollScope: 'APPLICATION' })
  assert.equal(remnant.deferred.length, 1)
  assert.match(remnant.deferred[0].unresolved, /再起動|タイマー/)
})

test('ソーンズの毒は敵属性の排他的な125/250毎秒で、持続3秒と術属性を別に保持する', () => {
  const poison = find('char_293_thorns', 0)
  assert.equal(poison.effects.length, 2)
  assert.deepEqual(poison.effects.map(effect => effect.item === 'DAMAGE_OVER_TIME' && effect.damage.amount.basis === 'FIXED' ? effect.damage.amount.value : null), [125, 250])
  assert.deepEqual(poison.effects.map(effect => effect.condition && 'value' in effect.condition ? effect.condition.value : null), [false, true])
  for (const effect of poison.effects) {
    assert.equal(effect.item, 'DAMAGE_OVER_TIME')
    assert.equal(effect.condition?.type === 'COMPARE' && effect.condition.metric, 'target.canUseRangedAttack')
    assert.equal(effect.target.side, 'ENEMY')
    assert.equal(effect.target.scope, 'ATTACK_TARGET')
    assert.deepEqual(effect.timing, { type: 'EVENT', event: 'ATTACK' })
    assert.equal('value' in effect, false)
    assert.equal('unit' in effect, false)
    assert.equal('duration' in effect, false)
    assert.deepEqual(effect.lifetime, { type: 'CURRENT_EVENT' })
    if (effect.item === 'DAMAGE_OVER_TIME') {
      assert.deepEqual(effect.damage.kind, { type: 'ORDINARY', damageType: 'ARTS' })
      assert.equal(effect.damage.amount.referenceTime, 'NOT_APPLICABLE')
      assert.equal(effect.damage.rate, 'PER_SECOND')
      assert.deepEqual(effect.damage.duration, { type: 'FIXED_SECONDS', seconds: 3 })
      assert.deepEqual(effect.damage.cadence, { intervalSeconds: null, firstTickSeconds: null })
      assert.deepEqual(effect.damage.stacking, { mode: 'UNSPECIFIED', maxStacks: null })
      assert.equal(effect.damage.refresh, 'UNSPECIFIED')
    }
    assert.ok(getTalentStructureEffectValueRows(effect).some(([label, value]) => label === '持続時間（秒）' && value === 3))
  }
  assert.match(poison.deferred[0].unresolved, /重複|更新/)
  for (const canUseRangedAttack of [false, true]) {
    assert.equal(poison.effects.filter(effect => evaluateCombatCondition(effect.condition, { 'target.canUseRangedAttack': canUseRangedAttack })).length, 1)
  }
  assert.ok(poison.effects.every(effect => evaluateCombatCondition(effect.condition, {}) === null))
})

test('ソーンズの回復は無通常攻撃2秒と1秒周期・HP3.5%を分離し、反撃判定や初回時刻は保留する', () => {
  const regen = find('char_293_thorns', 1)
  const effect = regen.effects[0]
  assert.equal(effect.item, 'HP_RESTORE_RATIO')
  assert.equal(effect.operation, 'RESTORE')
  assert.equal(effect.value, 0.035)
  assert.equal(effect.unit, 'MAX_HP_RATIO')
  assert.deepEqual(effect.timing, { type: 'PERIODIC', intervalSeconds: 1, firstTickSeconds: null })
  assert.deepEqual(effect.condition, { type: 'COMPARE', metric: 'source.secondsSinceLastNormalAttack', comparison: 'GTE', value: 2, sourceBinding: 'delay' })
  assert.equal(formatTalentStructureCondition(effect.condition), '通常攻撃せずに2秒以上経過')
  assert.equal(formatTalentStructureEffectValue(effect), '最大HPの3.5％')
  assert.match(regen.deferred[0].unresolved, /反撃/)
  assert.equal(evaluateCombatCondition(effect.condition, { 'source.secondsSinceLastNormalAttack': 1.999 }), false)
  assert.equal(evaluateCombatCondition(effect.condition, { 'source.secondsSinceLastNormalAttack': 2 }), true)
})

test('BBの値をliveで読み直し、欠損・不正値・重複キーを固定値や0で埋めない', () => {
  const rows = records()
  const surtr = rows.find(row => row.operatorId === 'char_350_surtr')!
  surtr.operatorProfile.talents![0].candidates![0].blackboard![0].value = 23
  assert.equal(find('char_350_surtr', 0, rows).effects[0].value, 23)
  for (const value of [undefined, NaN, Infinity]) {
    const changed = records()
    changed.find(row => row.operatorId === 'char_350_surtr')!.operatorProfile.talents![0].candidates![0].blackboard![0].value = value
    const structure = find('char_350_surtr', 0, changed)
    assert.equal(structure.effects[0].value, null)
    assert.match(structure.issues[0], /magic_resist_penetrate_fixed/)
    assert.equal(formatTalentStructureEffectValue(structure.effects[0]), '未確認')
  }
  const duplicate = records()
  const source = duplicate.find(row => row.operatorId === 'char_263_skadi')!.operatorProfile.talents![0].candidates![0]
  source.blackboard!.push({ key: 'atk', value: 99 })
  assert.equal(find('char_263_skadi', 0, duplicate).effects[0].value, null)
})

test('欠けた秒数や説明文由来の値も不明として残し、毒や回復の数値を別の値で代用しない', () => {
  const rows = records()
  rows.find(row => row.operatorId === 'char_293_thorns')!.operatorProfile.talents![0].candidates![0].blackboard = [{ key: 'damage[normal]', value: 125 }]
  const poison = find('char_293_thorns', 0, rows)
  assert.deepEqual(poison.effects.map(effect => effect.item === 'DAMAGE_OVER_TIME' && effect.damage.amount.basis === 'FIXED' ? effect.damage.amount.value : 'wrong basis'), [125, null])
  assert.ok(poison.effects.every(effect => effect.item === 'DAMAGE_OVER_TIME' && effect.damage.duration.type === 'FIXED_SECONDS' && effect.damage.duration.seconds === null))
  const regenSource = rows.find(row => row.operatorId === 'char_293_thorns')!.operatorProfile.talents![1].candidates![0]
  regenSource.description = '通常攻撃をしないとHPが回復する'
  const regen = find('char_293_thorns', 1, rows)
  assert.deepEqual(regen.effects[0].timing, { type: 'PERIODIC', intervalSeconds: null, firstTickSeconds: null })
  assert.ok(regen.issues.length > 0)
})

test('別OP・別slot・別の素質名・潜在専用・下位昇進候補を対応済みへすり替えない', () => {
  assert.deepEqual(buildTalentStructures(records().map(row => ({ ...row, operatorId: 'char_unknown' }))), [])
  for (const change of ['slot', 'name', 'potential', 'promotion', 'hidden'] as const) {
    const rows = records()
    const operator = rows.find(row => row.operatorId === 'char_350_surtr')!
    const candidate = operator.operatorProfile.talents![0].candidates![0]
    if (change === 'slot') candidate.prefabKey = '2'
    if (change === 'name') candidate.name = '別の素質'
    if (change === 'potential') candidate.requiredPotentialRank = 4
    if (change === 'promotion') candidate.unlockCondition!.phase = 'PHASE_1'
    if (change === 'hidden') candidate.isHideTalent = true
    assert.equal(findTalentStructure({ operatorId: 'char_350_surtr', talentIndex: 0 }, buildTalentStructures(rows)), null, change)
  }
})

test('潜在強化候補・MOD候補・重複するスキル行を混ぜず元データも変更しない', () => {
  const rows = records()
  const operator = rows.find(row => row.operatorId === 'char_263_skadi')!
  const base = operator.operatorProfile.talents![0].candidates![0]
  operator.operatorProfile.talents![0].candidates!.push({ ...structuredClone(base), requiredPotentialRank: 4, blackboard: [{ key: 'atk', value: 0.99 }] })
  operator.operatorProfile.modules = [{ uniEquipId: 'test_mod', phases: [{ equipLevel: 3, attributeBlackboard: [{ key: 'atk', value: 999 }] }] }]
  rows.push({ ...operator, id: 'second-skill', skillIndex: 2 })
  const before = structuredClone(rows)
  const result = buildTalentStructures(rows)
  assert.equal(result.length, 8)
  assert.equal(findTalentStructure({ operatorId: 'char_263_skadi', talentIndex: 0 }, result)!.effects[0].value, 0.14)
  assert.deepEqual(rows, before)
})

test('共通の攻撃力割合・HP回復はスキルのitem/operation/unit/valueと表記を実際に共有する', () => {
  const talent = find('char_263_skadi', 0).effects[0]
  const skill = SKILL_STRUCTURES.flatMap(structure => structure.effectStructure.stages.flatMap(stage => stage.effects)).find(effect => effect.item === 'ATK_BUFF_RATIO')!
  assert.deepEqual([talent.item, talent.operation, talent.unit], [skill.item, skill.operation, skill.unit])
  assert.equal(formatTalentStructureEffectItem(talent.item), formatSkillStructureEffectItem(skill.item))
  if (skill.item === 'ATK_BUFF_RATIO') assert.equal(formatTalentStructureEffectValue(talent), formatSkillStructureEffectValue({ ...skill, value: 0.14 }))
  const healing = find('char_293_thorns', 1).effects[0]
  const skillHealing = SKILL_STRUCTURES.flatMap(structure => structure.effectStructure.stages.flatMap(stage => stage.effects)).find(effect => effect.item === 'HP_RESTORE_RATIO')!
  assert.deepEqual([healing.item, healing.operation, healing.unit], [skillHealing.item, skillHealing.operation, skillHealing.unit])
  assert.equal(formatTalentStructureEffectItem(healing.item), formatSkillStructureEffectItem(skillHealing.item))
  if (skillHealing.item === 'HP_RESTORE_RATIO') assert.equal(formatTalentStructureEffectValue(healing), formatSkillStructureEffectValue({ ...skillHealing, value: 0.035 }))
  assert.equal(formatTalentStructureEffectOperation(talent), '割合加算')
  assert.equal(formatTalentStructureTiming({ type: 'CONTINUOUS', while: 'IN_SQUAD' }), '編成中')
  assert.match(formatTalentStructureTarget(talent.target), /アビサルハンター/)
  assert.ok(getTalentStructureEffectDefinitionRows(talent).some(([label, value]) => label === '参照キー' && value === 'atk'))
})
