import assert from 'node:assert/strict'
import test from 'node:test'
import type { EnemyRecord } from '../src/types/enemy.ts'
import type { OperatorCombatProfile, RawSkillLevel, SkillRecord } from '../src/types/skill.ts'
import { classifySkill } from '../src/lib/classifier.ts'
import { createSurtrDurationInitialLines } from '../src/lib/surtrDurationComparison.ts'
import { deriveSurtrDurationModel } from '../src/lib/surtrDuration.ts'
import { calculateSurtrDurationCombat } from '../src/lib/surtrDurationCombat.ts'
import {
  createSurtrDurationCondition,
  createSurtrDurationEnemyParticipant,
  createSurtrDurationHealerParticipant,
  deriveSurtrDurationParticipants,
  getSurtrDurationEnemySupportReason,
  getSurtrDurationHealerOptions,
  getSurtrDurationHealerSkillOptions,
} from '../src/lib/surtrDurationParticipants.ts'

test('初期条件は従来の育成条件で、外部ダメージ・回復なし', () => {
  const condition = createSurtrDurationCondition(surtr())
  assert.deepEqual(condition.settings, { level: 90, trust: 100, potential: 1, skillLevelIndex: 9 })
  const derived = deriveSurtrDurationParticipants(surtr(), condition, [], [])
  assert.deepEqual(derived.unsupportedReasons, [])
  assert.deepEqual(derived.actions, [])
  assert.equal(derived.defense, 414)
  assert.equal(derived.magicResistance, 15)
})

test('初期比較は外部作用なし・サルカズ大剣士・アンセル通常回復を独立した3本で用意する', () => {
  const record = surtr()
  const records = healers()
  const foe = enemy('enemy_1010_demon', 'PHYSIC', 600)
  foe.stats.attackSpeed = 100
  const original = structuredClone({ record, records, foe })
  const lines = createSurtrDurationInitialLines(record, records)
  assert.deepEqual(lines.map(line => line.id), ['baseline', 'default-sarkaz', 'default-ansel'])
  assert.ok(lines.every(line => line.visible && line.timeLimit === 120 && !line.condition.moduleId))
  assert.ok(lines.every(line => !/^line-\d+$/.test(line.id)))
  assert.equal(lines[0].condition.healers.length + lines[0].condition.enemies.length, 0)
  assert.deepEqual(lines[2].condition.healers[0], {
    id: 'default-ansel-healer', operatorId: 'char_212_ansel', phaseIndex: 1, level: 55,
    trust: 100, potential: 1, skillId: '', skillLevelIndex: 6, firstTime: 2.85, skillStart: 0,
  })
  assert.equal(lines[2].condition.enemies.length, 0)
  assert.deepEqual(lines[1].condition.enemies[0], {
    id: 'default-sarkaz-enemy', enemyId: 'enemy_1010_demon', count: 1, firstTime: 2,
  })
  assert.equal(lines[1].condition.healers.length, 0)
  const triggers = lines.map(line => {
    const participants = deriveSurtrDurationParticipants(record, line.condition, [foe], records)
    assert.deepEqual(participants.unsupportedReasons, [])
    const model = deriveSurtrDurationModel(record, line.condition.settings, line.condition.moduleId, line.condition.moduleLevel)!
    return calculateSurtrDurationCombat(model, participants.actions, line.timeLimit)?.remnantStart
  })
  assert.deepEqual(triggers, [25, 22, 30.2])
  lines[2].condition.settings.level = 60
  assert.equal(lines[0].condition.settings.level, 90)
  assert.equal(lines[1].condition.settings.level, 90)
  assert.deepEqual({ record, records, foe }, original)
})

test('初期線は敵カタログを待たず固定IDを持ち、アンセル欠落時は別の回復役へ置き換えない', () => {
  const record = surtr()
  const unrelatedHealers = healers().filter(item => item.operatorId !== 'char_212_ansel')
  const first = createSurtrDurationInitialLines(record, unrelatedHealers)
  const again = createSurtrDurationInitialLines(record, unrelatedHealers)
  assert.deepEqual(first.map(line => line.id), ['baseline', 'default-sarkaz'])
  assert.deepEqual(first, again)
  assert.ok(first.every(line => line.condition.healers.length === 0))
  assert.equal(first[1].condition.enemies[0].enemyId, 'enemy_1010_demon')
  first.splice(1, 1)
  assert.equal(again.length, 2)
})

test('通常攻撃は物理防御・術耐性・最低保証・速度と体数を別々に反映', () => {
  const record = surtr()
  const condition = createSurtrDurationCondition(record)
  const enemies = [enemy('physical', 'PHYSIC', 500), enemy('arts', 'MAGIC', 500), enemy('true', 'TRUE', 500), enemy('low', 'PHYSIC', 100)]
  condition.enemies = enemies.map(value => createSurtrDurationEnemyParticipant(value, value.id))
  condition.enemies[0].count = 3
  condition.enemies[0].firstTime = 1.5
  const derived = deriveSurtrDurationParticipants(record, condition, enemies, [])
  assert.deepEqual(derived.unsupportedReasons, [])
  assert.deepEqual(derived.enemies.map(value => value.amount), [86, 425, 500, 5])
  assert.equal(derived.actions[0].count, 3)
  assert.equal(derived.actions[0].firstTime, 1.5)
  assert.equal(derived.actions[0].interval, 4)
})

test('MOD段階の防御力・術耐性を軽減計算へ反映', () => {
  const record = surtr()
  const condition = createSurtrDurationCondition(record)
  condition.moduleId = 'module-y'
  const foe = enemy('foe', 'PHYSIC', 700)
  condition.enemies = [createSurtrDurationEnemyParticipant(foe, 'foe')]
  const y = deriveSurtrDurationParticipants(record, condition, [foe], [])
  assert.deepEqual(y.unsupportedReasons, [])
  assert.equal(y.defense, 479)
  assert.equal(y.actions[0].amount, 221)
  condition.moduleId = 'module-x'
  const x = deriveSurtrDurationParticipants(record, condition, [foe], [])
  assert.equal(x.defense, 414)
  assert.equal(x.magicResistance, 20)
})

test('通常攻撃以外の特殊能力は混ぜず、混合種別や不足データは拒否', () => {
  const foe = enemy('foe', 'MAGIC', 500)
  foe.abilities = ['攻撃時に特殊効果']
  assert.equal(getSurtrDurationEnemySupportReason(foe), null)
  foe.damageTypes = ['PHYSIC', 'MAGIC']
  assert.match(getSurtrDurationEnemySupportReason(foe)!, /複数/)
  foe.damageTypes = ['MAGIC']
  foe.stats.attackSpeed = 0
  assert.match(getSurtrDurationEnemySupportReason(foe)!, /間隔/)
})

test('対応回復役だけを提示し、未対応スキルを選択可能として扱わない', () => {
  const records = healers()
  const unsupported = { ...records[0], operatorId: 'unknown', operatorName: '未対応' }
  assert.deepEqual(getSurtrDurationHealerOptions([...records, unsupported]).map(value => value.operatorId), ['char_212_ansel', 'char_120_hibisc', 'char_298_susuro'])
  assert.equal(createSurtrDurationHealerParticipant([]), null)
  const futureSkill = { ...records[0], skillId: 'future', skillIndex: 2 }
  assert.equal(getSurtrDurationHealerSkillOptions([futureSkill], futureSkill.operatorId)[0].supported, false)
})

test('アンセルは追加対象素質で単体への回復量を増やさず、潜在ATKは反映', () => {
  const records = healers()
  const condition = createSurtrDurationCondition(surtr())
  const healer = createSurtrDurationHealerParticipant(records, 'char_212_ansel', 'healer')!
  assert.equal(healer.phaseIndex, 1)
  assert.equal(healer.level, 55)
  assert.equal(healer.skillLevelIndex, 6)
  condition.healers = [healer]
  const derived = deriveSurtrDurationParticipants(surtr(), condition, [], records)
  assert.deepEqual(derived.unsupportedReasons, [])
  assert.equal(derived.actions[0].amount, 407)
  assert.equal(derived.actions[0].interval, 2.85)
  condition.healers[0].potential = 4
  assert.equal(deriveSurtrDurationParticipants(surtr(), condition, [], records).actions[0].amount, 427)
})

test('ハイビスカスの素質とS1は同一加算枠、信頼と潜在を含む基礎ATKに適用', () => {
  const records = healers()
  const condition = createSurtrDurationCondition(surtr())
  const healer = createSurtrDurationHealerParticipant(records, 'char_120_hibisc', 'healer')!
  healer.skillId = 'skcom_heal_up[1]'
  healer.skillStart = 10
  condition.healers = [healer]
  const derived = deriveSurtrDurationParticipants(surtr(), condition, [], records)
  assert.deepEqual(derived.unsupportedReasons, [])
  assert.equal(derived.healers[0].amount, Math.floor(390 * 1.08))
  assert.equal(derived.healers[0].skillAmount, Math.floor(390 * 1.58))
  assert.equal(derived.healers[0].skillDuration, 20)
  assert.equal(derived.actions.find(value => value.id === 'healer:skill')!.firstTime, 12.85)
  assert.equal(derived.actions.find(value => value.id === 'healer:after')!.firstTime, 32.85)
})

test('ススーロS2は攻撃速度と攻撃力を反映、低コスト限定素質はスルトに乗らない', () => {
  const records = healers()
  const condition = createSurtrDurationCondition(surtr())
  const healer = createSurtrDurationHealerParticipant(records, 'char_298_susuro', 'healer')!
  healer.skillId = 'skchr_susuro_2'
  healer.skillStart = 5
  healer.skillFirstTime = 5.3
  condition.healers = [healer]
  const derived = deriveSurtrDurationParticipants(surtr(), condition, [], records)
  assert.deepEqual(derived.unsupportedReasons, [])
  assert.equal(derived.healers[0].amount, 548)
  assert.equal(derived.healers[0].skillAmount, 1096)
  assert.equal(derived.healers[0].skillInterval, 1.425)
  assert.equal(derived.actions.find(value => value.id === 'healer:skill')!.firstTime, 5.3)
  assert.equal(derived.actions.find(value => value.id === 'healer:skill')!.activeUntil, 35)
})

test('スキル未解放・不正な最初の命中・未知の素質は部分計算を出さない', () => {
  const records = healers()
  const condition = createSurtrDurationCondition(surtr())
  const healer = createSurtrDurationHealerParticipant(records, 'char_298_susuro', 'healer')!
  healer.skillId = 'skchr_susuro_2'
  condition.healers = [healer]
  for (const patch of [{ phaseIndex: 0, level: 45 }, { skillFirstTime: -1 }, { skillFirstTime: 30 }, { trust: 101 }, { potential: 7 }]) {
    condition.healers = [{ ...healer, ...patch }]
    const derived = deriveSurtrDurationParticipants(surtr(), condition, [], records)
    assert.ok(derived.unsupportedReasons.length)
    assert.deepEqual(derived.actions, [])
  }
  condition.healers = [healer]
  const susuro = records.find(value => value.operatorId === healer.operatorId)!
  susuro.operatorProfile.talents!.push({ candidates: [{ name: '未対応', blackboard: [{ key: 'unknown_heal_scale', value: 2 }] }] })
  assert.match(deriveSurtrDurationParticipants(surtr(), condition, [], records).unsupportedReasons[0], /素質/)
})

test('異なる敵・回復役の識別子重複や不正体数も拒否', () => {
  const records = healers()
  const condition = createSurtrDurationCondition(surtr())
  const foe = enemy('foe', 'PHYSIC', 500)
  condition.enemies = [createSurtrDurationEnemyParticipant(foe, 'same')]
  condition.healers = [createSurtrDurationHealerParticipant(records, 'char_212_ansel', 'same')!]
  assert.match(deriveSurtrDurationParticipants(surtr(), condition, [foe], records).unsupportedReasons[0], /重複/)
  condition.healers = []
  condition.enemies[0].count = 1.5
  assert.match(deriveSurtrDurationParticipants(surtr(), condition, [foe], records).unsupportedReasons[0], /体数/)
})

function enemy(id: string, type: string, attack: number): EnemyRecord {
  return {
    id, index: '', sortId: 0, name: id, levelType: 'NORMAL', description: '', abilities: [], damageTypes: [type],
    attackWay: null, lifePointReduce: 1, databaseLevel: 0, databaseLevelCount: 1, stageAppearanceCount: 1, statusImmunities: [],
    ratings: { endurance: null, attack: null, defense: null, resistance: null },
    stats: { maxHp: 1000, attack, defense: 0, magicResistance: 0, moveSpeed: 1, attackSpeed: 50, baseAttackTime: 2, massLevel: 1 },
  }
}

// Compact numerical fixtures from JP character_table and skill_table, checked
// 2026-10-15. The tests are offline and retain each relevant passive/skill key.
function healers(): SkillRecord[] {
  const makeProfile = (phaseMax: number[], atk: number, trust: number): OperatorCombatProfile => ({
    phases: phaseMax.map(maxLevel => ({ maxLevel, attributesKeyFrames: [
      { level: 1, data: { atk: atk - 100, attackSpeed: 100, baseAttackTime: 2.85 } },
      { level: maxLevel, data: { atk, attackSpeed: 100, baseAttackTime: 2.85 } },
    ] })),
    favorKeyFrames: [{ level: 0, data: { atk: 0 } }, { level: 50, data: { atk: trust } }],
    potentialRanks: [{}, {}, { buff: { attributes: { attributeModifiers: [{ attributeType: 'ATK', formulaItem: 'ADDITION', value: 20 }] } } }, {}, {}],
  })
  const ansel = makeProfile([40, 55], 362, 45)
  ansel.talents = [{ candidates: [{ name: '追加回復', unlockCondition: { phase: 'PHASE_1', level: 55 }, blackboard: [{ key: 'attack@prob', value: 0.15 }] }] }]
  const hibisc = makeProfile([40, 55], 345, 45)
  hibisc.talents = [{ candidates: [{ name: '回復力上昇', unlockCondition: { phase: 'PHASE_1', level: 55 }, blackboard: [{ key: 'atk', value: 0.08 }] }] }]
  const susuro = makeProfile([45, 60, 70], 488, 60)
  susuro.talents = [{ candidates: [{ name: '低侵襲治療', unlockCondition: { phase: 'PHASE_2', level: 1 }, blackboard: [{ key: 'cost', value: 10 }, { key: 'heal_scale', value: 1.2 }] }] }]
  const skill = (duration: number, atk: number, speed = 0): RawSkillLevel => ({ name: '回復強化', duration, blackboard: [{ key: 'atk', value: atk }, ...(speed ? [{ key: 'attack_speed', value: speed }, { key: 'skill_max_trigger_time', value: 2 }] : [])] })
  return [
    record('char_212_ansel', 'アンセル', 'skcom_range_extend', 1, ansel, Array.from({ length: 7 }, () => skill(25, 0.4))),
    record('char_120_hibisc', 'ハイビスカス', 'skcom_heal_up[1]', 1, hibisc, Array.from({ length: 7 }, () => skill(20, 0.5))),
    record('char_298_susuro', 'ススーロ', 'skcom_heal_up[2]', 1, susuro, Array.from({ length: 10 }, () => skill(25, 0.7))),
    record('char_298_susuro', 'ススーロ', 'skchr_susuro_2', 2, susuro, Array.from({ length: 10 }, () => skill(30, 1, 100))),
  ]
}

function surtr(): SkillRecord {
  const profile: OperatorCombatProfile = {
    phases: [{ maxLevel: 50 }, { maxLevel: 80 }, { maxLevel: 90, attributesKeyFrames: [
      { level: 1, data: { maxHp: 2216, def: 343, magicResistance: 15, cost: 21 } },
      { level: 90, data: { maxHp: 2916, def: 414, magicResistance: 15, cost: 21 } },
    ] }],
    favorKeyFrames: [{ level: 0, data: { maxHp: 0, def: 0, magicResistance: 0 } }, { level: 50, data: { maxHp: 0, def: 0, magicResistance: 0 } }],
    talents: [{ candidates: [{ name: '劫火', blackboard: [{ key: 'magic_resist_penetrate_fixed', value: 20 }] }] },
      { candidates: [{ name: '余燼', blackboard: [{ key: 'surtr_t_2[withdraw].interval', value: 8 }] }] }],
    modules: ['X', 'Y'].map(type => ({ type: 'ADVANCED', uniEquipName: type, uniEquipId: `module-${type.toLowerCase()}`, typeName2: type, unlockEvolvePhase: 'PHASE_2', unlockLevel: 60,
      phases: [{ equipLevel: 3, attributeBlackboard: type === 'X' ? { atk: 60, magic_resistance: 5 } : { atk: 60, def: 65 }, parts: [] }] })),
  }
  return record('char_350_surtr', 'スルト', 'skchr_surtr_3', 3, profile, Array.from({ length: 10 }, () => ({
    name: 'ラグナロク', duration: -1, blackboard: [{ key: 'max_hp', value: 5000 }, { key: 'interval', value: 0.2 }, { key: 'hp_ratio', value: 0.2 }, { key: 'duration', value: 60 }],
  })))
}

function record(operatorId: string, operatorName: string, skillId: string, skillIndex: number, operatorProfile: OperatorCombatProfile, skillLevels: RawSkillLevel[]): SkillRecord {
  const raw = skillLevels.at(-1)!
  return {
    id: `${operatorId}:${skillId}`, operatorId, operatorName, skillId, skillIndex, operatorProfile, skillLevels,
    profession: 'MEDIC', professionLabel: '医療', subProfessionId: 'medic', subProfessionName: '医師', nameInitial: 'A_ROW', rarity: 4,
    skillName: raw.name!, description: '', duration: raw.duration!, durationType: 'NONE', skillType: 'MANUAL', spType: 'INCREASE_WITH_TIME', initSp: 0, spCost: 10,
    classification: classifySkill(raw), raw,
  }
}
