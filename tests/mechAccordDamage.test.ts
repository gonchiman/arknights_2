import { deriveMechAccordSkillOutput } from '../src/lib/mechAccordSkillDamage.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateMechAccordDamageRows,
  calculateMechAccordResistanceTable,
  getMechAccordMultiplierPercent,
  isMechAccordSubProfession,
} from '../src/lib/mechAccordDamage.ts'
import { calculateAttackPipeline, deriveSkillModel } from '../src/lib/damageCalculator.ts'
import { classifySkill } from '../src/lib/classifier.ts'
import type { RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

test('基礎職分特性の倍率を8段階で返す', () => {
  const sequence = calculateMechAccordDamageRows(1000, 0, 0)

  assert.deepEqual(sequence.rows.map((row) => row.attackCountLabel), [
    '1', '2', '3', '4', '5', '6', '7', '8以上',
  ])
  assert.deepEqual(sequence.rows.map((row) => row.multiplierPercent), [
    20, 35, 50, 65, 80, 95, 110, 110,
  ])
})

test('8回以上の攻撃は基礎職分特性の最終倍率で固定する', () => {
  assert.equal(getMechAccordMultiplierPercent(8), 110)
  assert.equal(getMechAccordMultiplierPercent(99), 110)
})

test('浮遊ユニット倍率を軽減前攻撃力へ掛け、術耐性を適用する', () => {
  const sequence = calculateMechAccordDamageRows(1000, 9999, 20)
  const first = sequence.rows[0]
  const eighth = sequence.rows[7]

  assert.equal(sequence.mainDamage.damageType, 'ARTS')
  assert.equal(sequence.mainDamage.result, 800)
  assert.equal(first.rawDroneAttack, 200)
  assert.equal(first.droneDamage, 160)
  assert.equal(eighth.rawDroneAttack, 1100)
  assert.equal(eighth.droneDamage, 880)
})

test('本体100%と浮遊ユニット1体の軽減後ダメージを合算する', () => {
  const sequence = calculateMechAccordDamageRows(1000, 0, 20)
  const first = sequence.rows[0]
  const eighth = sequence.rows[7]

  assert.equal(first.combinedDamage, 960)
  assert.equal(eighth.combinedDamage, 1680)
})

test('本体と浮遊ユニットそれぞれの術最低保証情報を保持する', () => {
  const sequence = calculateMechAccordDamageRows(1000, 0, 100)
  const threshold = calculateMechAccordDamageRows(1000, 0, 95)
  const first = sequence.rows[0]
  const eighth = sequence.rows[7]

  assert.equal(sequence.mainDamage.minimumApplied, true)
  assert.equal(sequence.mainDamage.minimumDamage, 50)
  assert.equal(sequence.mainDamage.result, 50)
  assert.equal(first.minimumReached, true)
  assert.equal(first.droneBreakdown.minimumDamage, 10)
  assert.equal(first.droneDamage, 10)
  assert.equal(eighth.droneBreakdown.minimumDamage, 55)
  assert.equal(eighth.droneDamage, 55)
  assert.equal(threshold.rows[0].droneBreakdown.minimumApplied, false)
  assert.equal(threshold.rows[0].minimumReached, true)
})

test('術耐性固定無視を本体と全ての浮遊ユニット出力へ適用する', () => {
  const sequence = calculateMechAccordDamageRows(1000, 0, 50, {
    resistanceIgnoreFixed: 20,
  })
  const first = sequence.rows[0]

  assert.equal(sequence.mainDamage.appliedResistance, 30)
  assert.equal(sequence.mainDamage.result, 700)
  assert.equal(first.droneBreakdown.appliedResistance, 30)
  assert.equal(first.droneDamage, 140)
  assert.equal(first.combinedDamage, 840)
})

test('選択した攻撃回数について術耐性別の本体・浮遊・合計を返す', () => {
  const table = calculateMechAccordResistanceTable(1000, 9999, 1)
  const values = table.rows.map((row) => [
    row.resistance,
    roundForTest(row.mainDamage),
    roundForTest(row.droneDamage),
    roundForTest(row.combinedDamage),
  ])

  assert.equal(table.attackCount, 1)
  assert.equal(table.attackCountLabel, '1回目')
  assert.equal(table.multiplierPercent, 20)
  assert.deepEqual(values, [
    [0, 1000, 200, 1200],
    [20, 800, 160, 960],
    [40, 600, 120, 720],
    [60, 400, 80, 480],
    [80, 200, 40, 240],
    [95, 50, 10, 60],
    [100, 50, 10, 60],
  ])
  assert.equal(table.rows[5].mainBreakdown.minimumApplied, false)
  assert.equal(table.rows[5].droneBreakdown.minimumApplied, false)
  assert.equal(table.rows[5].mainMinimumReached, true)
  assert.equal(table.rows[5].droneMinimumReached, true)
  assert.equal(table.rows[5].combinedMinimumReached, true)
  assert.equal(table.rows[6].mainBreakdown.minimumApplied, true)
  assert.equal(table.rows[6].droneBreakdown.minimumApplied, true)
})

test('術耐性別出力で選択回数の倍率と8回目以降への正規化を適用する', () => {
  const fourth = calculateMechAccordResistanceTable(1000, 0, 4)
  const eighth = calculateMechAccordResistanceTable(1000, 0, 99)

  assert.equal(fourth.attackCount, 4)
  assert.equal(fourth.attackCountLabel, '4回目')
  assert.equal(fourth.multiplierPercent, 65)
  assert.equal(fourth.rows[0].mainDamage, 1000)
  assert.equal(fourth.rows[0].droneDamage, 650)
  assert.equal(fourth.rows[0].combinedDamage, 1650)
  const ignored = calculateMechAccordResistanceTable(1000, 0, 1, {
    resistanceIgnoreFixed: 20,
  })
  const resistance100 = ignored.rows.at(-1)

  assert.equal(eighth.attackCount, 8)
  assert.equal(eighth.attackCountLabel, '8回目以降')
  assert.equal(eighth.multiplierPercent, 110)
  assert.equal(eighth.rows[0].mainDamage, 1000)
  assert.equal(eighth.rows[0].droneDamage, 1100)
  assert.equal(eighth.rows[0].combinedDamage, 2100)
  assert.equal(calculateMechAccordResistanceTable(1000, 0, Number.NaN).attackCount, 1)
  assert.ok(resistance100)
  assert.equal(resistance100.mainBreakdown.appliedResistance, 80)
  assert.equal(resistance100.droneBreakdown.appliedResistance, 80)
  assert.equal(roundForTest(resistance100.mainDamage), 200)
  assert.equal(roundForTest(resistance100.droneDamage), 40)
  assert.equal(roundForTest(resistance100.combinedDamage), 240)
  assert.equal(resistance100.combinedMinimumReached, false)
})

test('操機術師の実データ職分ID funnelだけを対象とする', () => {
  assert.equal(isMechAccordSubProfession('funnel'), true)
  assert.equal(isMechAccordSubProfession('core_caster'), false)
  assert.equal(isMechAccordSubProfession('mech_accord'), false)
  assert.equal(isMechAccordSubProfession(''), false)
})

test('通常攻撃の初期値を保ち、選択したスキルLvの攻撃力とユニット数を両表へ反映する', () => {
  const maximumLevel: RawSkillLevel = {
    description: '攻撃力+40%、浮遊ユニットの数+1、自動索敵して攻撃する浮遊ユニットを放出する',
    duration: 25,
    blackboard: [{ key: 'atk', value: 0.4 }, { key: 'attack@cnt', value: 1 }],
  }
  const selectedLevel: RawSkillLevel = {
    ...maximumLevel,
    description: '攻撃力+20%、浮遊ユニットの数+1、自動索敵して攻撃する浮遊ユニットを放出する',
    blackboard: [{ key: 'atk', value: 0.2 }, { key: 'attack@cnt', value: 1 }],
  }
  const skill = createMechAccordSkill('char_377_gdglow', 1, maximumLevel)
  const model = deriveSkillModel(selectedLevel, 1.3)
  const options = deriveMechAccordSkillOutput(skill, selectedLevel, model)
  const skillAttack = calculateAttackPipeline(1000, {
    directMultiplierPercent: model.directMultiplierPercent,
  }).finalAttack
  const normal = calculateMechAccordDamageRows(1000, 0, 0)
  const skillRows = calculateMechAccordDamageRows(skillAttack, 0, 0, {}, options)
  const skillTable = calculateMechAccordResistanceTable(skillAttack, 0, 1, {}, options)

  assert.deepEqual(options, { droneCount: 2, mainAttackEnabled: true, unsupportedReasons: [] })
  assert.equal(normal.droneCount, 1)
  assert.equal(normal.mainAttackEnabled, true)
  assert.equal(normal.rows[0].combinedDamage, 1200)
  assert.equal(skillRows.mainDamage.result, 1200)
  assert.equal(skillRows.rows[0].droneBreakdown.result, 240)
  assert.equal(skillRows.rows[0].droneDamage, 480)
  assert.equal(skillRows.rows[0].combinedDamage, 1680)
  assert.equal(skillTable.droneCount, 2)
  assert.equal(skillTable.mainAttackEnabled, true)
  assert.equal(skillTable.rows[1].mainDamage, 960)
  assert.equal(skillTable.rows[1].droneDamage, 384)
  assert.equal(skillTable.rows[1].combinedDamage, 1344)
})

test('本体停止中は本体の最低保証を加えず、浮遊ユニット3体を合算する', () => {
  const level: RawSkillLevel = {
    description: '攻撃しなくなり、攻撃力+80%、浮遊ユニットの数+2、自動索敵して攻撃する浮遊ユニットを放出する',
    duration: 30,
    blackboard: [{ key: 'atk', value: 0.8 }, { key: 'attack@cnt', value: 2 }],
  }
  const skill = createMechAccordSkill('char_377_gdglow', 3, level)
  const options = deriveMechAccordSkillOutput(skill, level, deriveSkillModel(level, 1.3))
  const rows = calculateMechAccordDamageRows(1000, 0, 100, {}, options)
  const table = calculateMechAccordResistanceTable(1000, 0, 1, {}, options)

  assert.deepEqual(options, { droneCount: 3, mainAttackEnabled: false, unsupportedReasons: [] })
  assert.equal(rows.mainAttackEnabled, false)
  assert.equal(rows.mainDamage.result, 0)
  assert.equal(rows.mainDamage.minimumApplied, false)
  assert.equal(rows.rows[0].droneBreakdown.result, 10)
  assert.equal(rows.rows[0].droneDamage, 30)
  assert.equal(rows.rows[0].combinedDamage, 30)
  assert.equal(table.mainAttackEnabled, false)
  assert.equal(table.rows[0].combinedDamage, 600)
  assert.equal(table.rows.at(-1)?.mainMinimumReached, false)
  assert.equal(table.rows.at(-1)?.droneMinimumReached, true)
  assert.equal(table.rows.at(-1)?.combinedDamage, 30)
})

test('追加ユニットがない攻撃強化と追加3体のスキルを扱う', () => {
  const attackOnly: RawSkillLevel = {
    description: '攻撃力+80%',
    duration: 25,
    blackboard: [{ key: 'atk', value: 0.8 }],
  }
  const fourDrones: RawSkillLevel = {
    description: '浮遊ユニットの数+3、攻撃力+120%、浮遊ユニットを放出し、範囲内の敵をランダムに対象として攻撃する',
    duration: 22,
    blackboard: [{ key: 'atk', value: 1.2 }, { key: 'attack@cnt', value: 3 }],
  }

  assert.deepEqual(deriveForLevel('char_328_cammou', 1, attackOnly), {
    droneCount: 1, mainAttackEnabled: true, unsupportedReasons: [],
  })
  assert.deepEqual(deriveForLevel('char_1038_whitw2', 2, fourDrones), {
    droneCount: 4, mainAttackEnabled: true, unsupportedReasons: [],
  })
})

test('段階・切替・連続攻撃・周期ダメージが必要なスキルを通常攻撃表で代用しない', () => {
  const cases: Array<[string, number, RawSkillLevel]> = [
    ['char_4040_rockr', 2, {
      description: '攻撃速度+80、オーバードライブ：浮遊ユニットのダメージ上限が2倍まで上昇し、攻撃力+50%',
      duration: 40,
      blackboard: [{ key: 'atk', value: 0.5 }, { key: 'scale', value: 2 }],
    }],
    ['char_1038_whitw2', 1, {
      description: 'パッシブ：浮遊ユニットの数+1。発動するたび初期状態と次の状態とが切り替わる：攻撃力+35%',
      duration: -1,
      blackboard: [{ key: 'atk', value: 0.35 }, { key: 'attack@cnt', value: 0 }],
    }],
    ['char_4054_malist', 2, {
      description: '次の通常攻撃時、敵に2回連続で攻撃力の200%の術ダメージを与える。3回チャージ可能',
      duration: 0,
      blackboard: [{ key: 'atk_scale', value: 2 }, { key: 'ct', value: 3 }],
    }],
    ['char_1038_whitw2', 3, {
      description: '攻撃力+80%、浮遊ユニット周囲の敵に1秒ごとに攻撃力の120%の術ダメージを与える',
      duration: 40,
      blackboard: [{ key: 'atk', value: 0.8 }, { key: 'attack@cnt', value: 2 }],
    }],
  ]

  for (const [operatorId, skillIndex, level] of cases) {
    assert.ok(deriveForLevel(operatorId, skillIndex, level).unsupportedReasons.length > 0,
      `${operatorId} S${skillIndex} must require its own model`)
  }
})

test('選択Lvの説明と数値を使い、未確認の攻撃停止・独立倍率・不正ユニット数を拒否する', () => {
  const level: RawSkillLevel = {
    description: '攻撃力+80%',
    duration: 25,
    blackboard: [{ key: 'atk', value: 0.8 }],
  }
  const skill = createMechAccordSkill('char_test', 1, level)
  const stoppedLevel = { ...level, description: '攻撃しなくなり、攻撃力+80%、浮遊ユニットが攻撃する' }
  const stopped = deriveMechAccordSkillOutput(skill, stoppedLevel, deriveSkillModel(stoppedLevel, 1.3))
  const independentScale = { ...level, blackboard: [...level.blackboard!, { key: 'damage_scale', value: 1.5 }] }
  const invalidCount = { ...level, blackboard: [...level.blackboard!, { key: 'attack@cnt', value: Number.NaN }] }

  assert.ok(stopped.unsupportedReasons.some((reason) => reason.includes('攻撃停止')))
  assert.ok(deriveForLevel('char_test', 1, independentScale).unsupportedReasons.some((reason) => reason.includes('独立ダメージ倍率')))
  assert.ok(deriveForLevel('char_test', 1, invalidCount).unsupportedReasons.some((reason) => reason.includes('浮遊ユニット数')))
})

function deriveForLevel(operatorId: string, skillIndex: number, level: RawSkillLevel) {
  return deriveMechAccordSkillOutput(
    createMechAccordSkill(operatorId, skillIndex, level),
    level,
    deriveSkillModel(level, 1.3),
  )
}

function createMechAccordSkill(operatorId: string, skillIndex: number, level: RawSkillLevel): SkillRecord {
  const skillId = `skill_${skillIndex}`
  return {
    id: `${operatorId}:${skillId}`,
    operatorId,
    operatorName: operatorId,
    profession: 'CASTER',
    professionLabel: '術師',
    subProfessionId: 'funnel',
    subProfessionName: '操機術師',
    nameInitial: 'OTHER',
    rarity: 5,
    skillIndex,
    skillId,
    skillName: skillId,
    description: level.description ?? '',
    duration: level.duration ?? null,
    durationType: level.durationType ?? 'NONE',
    skillType: 'MANUAL',
    spType: 'INCREASE_WITH_TIME',
    initSp: 0,
    spCost: 30,
    classification: classifySkill(level),
    skillLevels: [level],
    operatorProfile: {
      phases: [],
      favorKeyFrames: [],
      traitDescription: '浮遊ユニットを操作して敵に術ダメージを与える',
    },
    raw: level,
  }
}

function roundForTest(value: number): number {
  return Math.round(value * 1e9) / 1e9
}
