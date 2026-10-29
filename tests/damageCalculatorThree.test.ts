import { reviewedTraitProfile } from './legacyTraitFixture.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifySkill } from '../src/lib/classifier.ts'
import {
  buildDamageCalculatorThreeOutput,
  DAMAGE_CALCULATOR_THREE_SELECTIONS,
  getDamageCalculatorThreeInputs,
  getDamageCalculatorThreeStructures,
  type DamageCalculatorThreeInput,
} from '../src/lib/damageCalculatorThree.ts'
import { findSkillStructure, type SkillStructure } from '../src/lib/skillStructure.ts'
import type { OperatorCombatProfile, RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

const source = JSON.parse(readFileSync(new URL('./fixtures/skillStructureFourOperators.json', import.meta.url), 'utf8')) as {
  operatorId: string; operatorName: string; skills: (RawSkillLevel & { skillId: string; skillIndex: number })[]
}[]
const talentSource = JSON.parse(readFileSync(new URL('./fixtures/talentStructureFourOperators.json', import.meta.url), 'utf8')) as {
  operatorId: string; operatorProfile: OperatorCombatProfile
}[]
// Reviewed JP growth values. Skill effects come independently from the saved source fixture.
const profiles: Record<string, { low: number; high: number; trust: number; interval: number; subclass: string }> = {
  char_350_surtr: { low: 544, high: 672, trust: 100, interval: 1.25, subclass: 'artsfghter' },
  char_263_skadi: { low: 842, high: 1015, trust: 80, interval: 1.5, subclass: 'fearless' },
  char_172_svrash: { low: 577, high: 713, trust: 50, interval: 1.3, subclass: 'lord' },
  char_293_thorns: { low: 575, high: 711, trust: 30, interval: 1.3, subclass: 'lord' },
}

function record(selectionIndex = 0): SkillRecord {
  return selectionIndex === 0 ? sourceRecord('char_350_surtr', 2) : sourceRecord('char_263_skadi', 1)
}

function sourceRecord(operatorId: string, skillIndex: number): SkillRecord {
  const operator = source.find(entry => entry.operatorId === operatorId)!
  const entry = operator.skills.find(skill => skill.skillIndex === skillIndex)!
  const raw: RawSkillLevel = structuredClone(entry)
  const profile = profiles[operatorId]
  const arts = operatorId === 'char_350_surtr'
  return {
    id: `${operatorId}:${entry.skillId}`, operatorId,
    operatorName: operator.operatorName, profession: 'WARRIOR', professionLabel: '前衛',
    subProfessionId: profile.subclass, subProfessionName: arts ? '術戦士' : '試験職分',
    nameInitial: 'S_ROW', rarity: 6, skillIndex, skillId: entry.skillId,
    skillName: raw.name!, description: raw.description!, duration: raw.duration!,
    durationType: raw.durationType!, skillType: raw.skillType!, spType: 'INCREASE_WITH_TIME', initSp: 0, spCost: 10,
    classification: classifySkill(raw), skillLevels: Array.from({ length: 10 }, () => structuredClone(raw)), raw,
    operatorProfile: {
      ...structuredClone(talentSource.find(candidate => candidate.operatorId === operatorId)!.operatorProfile),
      // Raw JP affiliation IDs are separate from the translated display name.
      affiliationIds: { nationId: null, groupId: operatorId === 'char_263_skadi' ? 'abyssal' : null, teamId: null },
      phases: [{ maxLevel: 50 }, { maxLevel: 80 }, { maxLevel: 90, attributesKeyFrames: [
        { level: 1, data: { atk: profile.low, baseAttackTime: profile.interval, attackSpeed: 100 } },
        { level: 90, data: { atk: profile.high, baseAttackTime: profile.interval, attackSpeed: 100 } },
      ] }],
      favorKeyFrames: [{ level: 0, data: { atk: 0 } }, { level: 50, data: { atk: profile.trust } }],
      ...reviewedTraitProfile(operatorId),
      potentialRanks: [{ buff: { attributes: { attributeModifiers: [{ attributeType: 'ATK', value: 28 }] } } }],
      modules: [{ uniEquipId: 'test_module', phases: [{ equipLevel: 3, attributeBlackboard: { atk: 60, attack_speed: 30 } }] }],
    },
  }
}

function output(skill = record(), patch: Partial<DamageCalculatorThreeInput> = {}) {
  return buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: 2,
    operatorLevel: 90, trust: 100, skillLevelIndex: 9, ...patch })
}

function close(actual: number | null | undefined, expected: number) {
  assert.ok(actual !== null && actual !== undefined && Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`)
}

test('既存4人の12技能とアイリーニ3技能の特化3に同じ構造化レコードを使う', () => {
  const allStructures = getDamageCalculatorThreeStructures()
  const structures = allStructures.filter(value => !value.guardRecipe)
  const key = (value: { operatorId: string; skillId: string; skillIndex: number }) => `${value.operatorId}/${value.skillId}/${value.skillIndex}`
  const expected = [...source.flatMap(operator => operator.skills.map(skill => key({ ...skill, operatorId: operator.operatorId }))),
    ...[1, 2, 3].map(index => `char_4009_irene/skchr_irene_${index}/${index}`)].sort()
  assert.equal(structures.length, 15)
  assert.deepEqual(structures.map(value => key(value.basicInfo)).sort(), expected)
  assert.equal(new Set(allStructures.map(value => key(value.basicInfo))).size, allStructures.length)
  assert.deepEqual(DAMAGE_CALCULATOR_THREE_SELECTIONS.filter(value => expected.includes(key(value))).map(key).sort(), expected)
  for (const selection of DAMAGE_CALCULATOR_THREE_SELECTIONS) {
    const structure = findSkillStructure(selection)!
    assert.ok(allStructures.includes(structure))
    assert.equal(selection.levelIndex, structure.basicInfo.levelIndex)
    if (expected.includes(key(selection))) assert.equal(selection.levelIndex, 9)
  }
})

test('スルトS2の対象入力を効果の条件式から抽出し、上限2体と実際の対象数を区別する', () => {
  const structure = findSkillStructure({ operatorId: 'char_350_surtr', skillId: 'skchr_surtr_2', skillIndex: 2, levelIndex: 9 })!
  assert.equal(structure.effectStructure.inputRequirements, undefined)
  assert.deepEqual(getDamageCalculatorThreeInputs(structure), [{
    kind: 'number', metric: 'actualAttackTargetCount', label: '実際の攻撃対象数', min: 1, max: 2, defaultValue: 1,
  }])
  assert.deepEqual(getDamageCalculatorThreeInputs(findSkillStructure({ operatorId: 'char_263_skadi', skillId: 'skcom_quickattack[3]', skillIndex: 1, levelIndex: 9 })!), [])
  const result = output()
  assert.equal(result.actualTargetCount, 1)
  assert.equal(result.maxTargetCount, 2)
})

test('スルトS2単体時: 攻撃力120%加算の後で1.6倍し、術属性・DPSへ反映する', () => {
  const result = output()
  assert.deepEqual(result.unsupportedReasons, [])
  assert.equal(result.stats.attack, 772)
  assert.equal(result.damageType, 'ARTS')
  assert.equal(result.axisLabel, '敵の術耐性')
  assert.equal(result.model?.directMultiplierPercent, 120)
  assert.equal(result.model?.attackScalePercent, 160)
  const row = result.rows[0]
  assert.equal(row.breakdown.attackPipeline.afterDirectMultiplier, 1698.4)
  assert.equal(row.breakdown.attackPipeline.afterFinalMultiplier, 1698)
  close(row.perAttack, 2716.8)
  close(row.dps, 2173.44)
  close(row.allTargetsPerAttack, row.perAttack)
  close(row.allTargetsDps, row.dps!)
  assert.equal(result.effects.find(entry => entry.effect.id === 'single_target')?.applied, true)
})

test('スルトS2二体時: 単体倍率を除き、対象ごとの術耐性軽減後に二体分を合計する', () => {
  const result = output(record(), { conditions: { actualAttackTargetCount: 2 } })
  assert.deepEqual(result.unsupportedReasons, [])
  assert.equal(result.model?.attackScalePercent, 100)
  const row = result.rows.find(entry => entry.axisValue === 60)!
  close(row.perAttack, 1018.8)
  close(row.dps, 815.04)
  close(row.allTargetsPerAttack, 2037.6)
  close(row.allTargetsDps, 1630.08)
  const conditional = result.effects.find(entry => entry.effect.id === 'single_target')!
  assert.equal(conditional.applied, false)
  assert.equal(conditional.status, 'CONDITION_FALSE')
  assert.match(conditional.reason, /条件不成立/)
})

test('スカジS1: 攻撃力・攻撃速度を同じ共通処理で適用し、途中で間隔を丸めない', () => {
  const result = output(record(1))
  assert.deepEqual(result.unsupportedReasons, [])
  assert.equal(result.stats.attack, 1095)
  assert.equal(result.damageType, 'PHYSICAL')
  assert.equal(result.attackSpeed, 145)
  assert.equal(result.model?.attackInterval, 150 / 145)
  assert.equal(result.effectiveAttack, 1741)
  close(result.rows[0].dps, 1741 * 145 / 150)
  const armor = result.rows.find(entry => entry.axisValue === 1000)!
  assert.equal(armor.perAttack, 741)
  close(armor.dps, 741 * 145 / 150)
  close(result.rows.at(-1)?.perAttack, 1741 * 0.05)
  assert.ok(result.rows.every(row => row.perAttack === row.allTargetsPerAttack && row.dps === row.allTargetsDps))
})

test('育成と信頼は変更でき、原典の素質を適用しながら潜在・MODの補正を除外する', () => {
  const skill = record()
  const before = structuredClone(skill)
  const result = output(skill)
  assert.equal(result.stats.baseAttackBreakdown.potentialAttack, 0)
  assert.equal(result.stats.baseAttackBreakdown.moduleAttack, 0)
  assert.equal(result.rows[0].breakdown.mitigation.resistanceIgnoreFixed, 20)
  close(result.rows.find(row => row.axisValue === 20)?.perAttack, 2716.8)
  const low = output(skill, { operatorLevel: 1, trust: 0 })
  assert.equal(low.stats.attack, 544)
  close(low.rows[0].perAttack, Math.floor(544 * 2.2) * 1.6)
  assert.deepEqual(skill, before)
})

test('範囲変更はダメージ・DPSを止めず、退場までの総ダメージを仮定で出さない', () => {
  const result = output()
  const range = result.effects.find(entry => entry.effect.item === 'ATTACK_RANGE')!
  assert.equal(range.applied, false)
  assert.equal(range.status, 'NOT_RELEVANT')
  assert.match(range.reason, /計算には使用しません/)
  assert.ok(result.rows.length > 0)
  assert.ok(result.rows.every(row => row.breakdown.total === null && row.breakdown.totalMode === 'NONE'))
})

test('説明文・blackboardの代表値を再推測せず、登録済み構造の効果を評価する', () => {
  const skill = record()
  skill.skillLevels[9].description = '曖昧な説明'
  skill.skillLevels[9].blackboard = [{ key: 'atk', value: 99 }, { key: 'atk_scale', value: 99 }]
  const result = output(skill)
  assert.deepEqual(result.unsupportedReasons, [])
  assert.equal(result.model?.directMultiplierPercent, 120)
  assert.equal(result.model?.attackScalePercent, 160)
})

test('未対応スキル・未対応レベル・選択キーの不一致を特化3で代用しない', () => {
  const skill = record()
  const invalid = [
    { skillLevelIndex: 8 }, { skillLevelIndex: 9.1 },
    { skill: { ...skill, skillIndex: 3 } },
    { skill: { ...skill, skillId: 'skchr_missing', skillIndex: 3 } },
    { operator: { ...skill, operatorId: 'char_263_skadi' } },
    { skill: { ...skill, skillLevels: [] } },
  ]
  for (const patch of invalid) {
    const result = output(skill, patch)
    assert.ok(result.unsupportedReasons.length > 0, JSON.stringify(patch))
    assert.deepEqual(result.rows, [])
    assert.equal(result.model, null)
    assert.equal(result.effectiveAttack, null)
  }
})

test('対象数の範囲外・小数・非数値を切り詰めて別条件の結果へ置き換えない', () => {
  for (const count of [0, -1, 1.5, 3, NaN, Infinity]) {
    const result = output(record(), { conditions: { actualAttackTargetCount: count } })
    assert.ok(result.unsupportedReasons.some(reason => reason.includes('攻撃対象数')))
    assert.deepEqual(result.rows, [])
  }
  assert.deepEqual(output(record(1), { conditions: { actualAttackTargetCount: 2 } }).rows, [])
})

test('未対応の条件項目はinputRequirements・段階・効果のいずれでも黙殺しない', () => {
  const base = getDamageCalculatorThreeStructures()[0]
  const stage = base.effectStructure.stages[0]
  const variations = [
    { ...base, effectStructure: { ...base.effectStructure, inputRequirements: ['unknownCondition'] } },
    { ...base, effectStructure: { ...base.effectStructure, stages: [{ ...stage,
      applicability: { metric: 'unknownCondition', comparison: 'EQ', value: 1 } }] } },
    { ...base, effectStructure: { ...base.effectStructure, stages: [{ ...stage,
      effects: [{ ...stage.effects[0], condition: { metric: 'unknownCondition', comparison: 'EQ', value: 1 } }] }] } },
  ] as unknown as SkillStructure[]
  for (const structure of variations) assert.throws(() => getDamageCalculatorThreeInputs(structure), /まだ対応していません/)
})

test('欠損した基礎攻撃データと不正な育成条件を既定値で計算しない', () => {
  const skill = record()
  const incomplete = structuredClone(skill)
  delete incomplete.operatorProfile.phases[2].attributesKeyFrames![0].data!.baseAttackTime
  delete incomplete.operatorProfile.phases[2].attributesKeyFrames![1].data!.baseAttackTime
  for (const patch of [{ operator: incomplete }, { phaseIndex: 99 }, { operatorLevel: 91 }, { trust: NaN }]) {
    const result = output(skill, patch)
    assert.ok(result.unsupportedReasons.length > 0)
    assert.deepEqual(result.rows, [])
  }
})

test('基礎攻撃データが揃っていても、未昇進のS2と昇進1以下の特化3を計算しない', () => {
  for (const selectionIndex of [0, 1]) {
    const skill = record(selectionIndex)
    // Every promotion has valid numeric data, so failure must come from the
    // shared skill-unlock constraints rather than missing attack attributes.
    for (const phaseIndex of [0, 1]) {
      skill.operatorProfile.phases[phaseIndex] = {
        maxLevel: phaseIndex === 0 ? 50 : 80,
        attributesKeyFrames: [
          { level: 1, data: { atk: 500, baseAttackTime: 1.25, attackSpeed: 100 } },
          { level: phaseIndex === 0 ? 50 : 80, data: { atk: 600, baseAttackTime: 1.25, attackSpeed: 100 } },
        ],
      }
      const result = output(skill, { phaseIndex, operatorLevel: 30 })
      assert.ok(result.unsupportedReasons.includes('選択した昇進段階では、このスキルレベルを使用できません。'))
      assert.equal(result.unsupportedReasons.includes('選択した昇進段階では、このスキルは解放されていません。'),
        selectionIndex === 0 && phaseIndex === 0)
      assert.deepEqual(result.rows, [])
      assert.equal(result.model, null)
    }
    const promoted = output(skill, { phaseIndex: 2, operatorLevel: 1 })
    assert.deepEqual(promoted.unsupportedReasons, [])
    assert.ok(promoted.rows.length > 0)
  }
})

test('独立したJPスキルfixtureの全12技能について1回のダメージとDPSを計算する', () => {
  const cases: [string, number, number, number | null][] = [
    ['char_263_skadi', 1, 1741, 1741 * 145 / 150],
    ['char_263_skadi', 2, 3109, 3109 / 1.5],
    ['char_263_skadi', 3, 2671, 2671 / 1.5],
    ['char_350_surtr', 1, 2393.2, null],
    ['char_350_surtr', 2, 2716.8, 2173.44],
    ['char_350_surtr', 3, 3319, 2655.2],
    ['char_172_svrash', 1, 2433.1, null],
    ['char_172_svrash', 2, 839, 839 / 1.3],
    ['char_172_svrash', 3, 2365, 2365 / 1.3],
    ['char_293_thorns', 1, 1482, 1482 / 1.3],
    ['char_293_thorns', 2, 948, null],
    ['char_293_thorns', 3, 1185, 1185 * 125 / 130],
  ]
  for (const [operatorId, skillIndex, perAttack, dps] of cases) {
    const result = output(sourceRecord(operatorId, skillIndex))
    assert.deepEqual(result.unsupportedReasons, [], `${operatorId}/S${skillIndex}`)
    assert.ok(result.rows.length > 0, `${operatorId}/S${skillIndex}`)
    close(result.rows[0].perAttack, perAttack)
    close(result.rows[0].allTargetsPerAttack, perAttack)
    if (dps === null) {
      assert.equal(result.canShowDps, false)
      assert.ok(result.rows.every(row => row.dps === null && row.allTargetsDps === null))
      assert.ok(result.dpsReason)
    } else {
      assert.equal(result.canShowDps, true)
      close(result.rows[0].dps, dps)
    }
    // Lifetime and SP-cycle totals are outside this calculation's scope.
    assert.ok(result.rows.every(row => row.breakdown.total === null && row.breakdown.totalMode === 'NONE'))
  }
})

test('次回攻撃スキルは撃破時SPやSP回復周期を毎攻撃のDPSへ混ぜない', () => {
  for (const [operatorId, multiplier] of [['char_350_surtr', 3.1], ['char_172_svrash', 2.9]] as const) {
    const result = output(sourceRecord(operatorId, 1))
    assert.equal(result.attackKind, 'NEXT_ATTACK')
    close(result.model?.attackScalePercent, multiplier * 100)
    assert.ok(result.rows.every(row => row.dps === null && row.allTargetsDps === null))
    assert.match(result.dpsReason!, /通常攻撃1回|次.*攻撃|強化攻撃/)
    const sp = result.effects.find(entry => entry.effect.item === 'SP')
    if (sp) {
      assert.equal(sp.status, 'NOT_RELEVANT')
      assert.equal(sp.applied, false)
    }
  }
})

test('シルバーアッシュS2は選んだモードの効果だけを使い、初期状態も攻撃を計算する', () => {
  const skill = sourceRecord('char_172_svrash', 2)
  for (const [mode, label] of [['INITIAL', '初期状態'], ['ALTERNATE', '切替後']] as const) {
    const result = output(skill, { conditions: { skillMode: mode } })
    assert.deepEqual(result.unsupportedReasons, [])
    assert.equal(result.activeStageLabel, label)
    assert.equal(result.model?.directMultiplierPercent, 0)
    assert.equal(result.rows[0].perAttack, 839)
    close(result.rows[0].dps, 839 / 1.3)
    const passive = result.effects.filter(entry => entry.effect.item === 'DEF_BUFF_RATIO' || entry.effect.item === 'HP_RESTORE_RATIO')
    assert.equal(passive.length, 2)
    assert.ok(passive.every(entry => entry.status === (mode === 'INITIAL' ? 'INACTIVE_STAGE' : 'NOT_RELEVANT')))
  }
})

test('ソーンズS3は1回目と2回目以降の値を選び、段階の加算と関係倍率の二重適用をしない', () => {
  const skill = sourceRecord('char_293_thorns', 3)
  for (const [count, attack, speed, ratio, label] of [
    [1, 1185, 125, 60, '初回'],
    [2, 1630, 150, 120, '2回目以降'],
    [3, 1630, 150, 120, '2回目以降'],
  ] as const) {
    const result = output(skill, { conditions: { skillActivationCount: count, attackDistanceType: 'RANGED' } })
    assert.deepEqual(result.unsupportedReasons, [])
    assert.equal(result.activeStageLabel, label)
    assert.equal(result.effectiveAttack, attack)
    assert.equal(result.attackSpeed, speed)
    assert.equal(result.model?.directMultiplierPercent, ratio)
    assert.equal(result.rangePenaltyMultiplier, 1)
    close(result.rows[0].dps, attack * speed / 130)
    const attackEffects = result.effects.filter(entry => entry.effect.item === 'ATK_BUFF_RATIO')
    assert.equal(attackEffects.filter(entry => entry.applied).length, 1)
    assert.equal(attackEffects.filter(entry => entry.status === 'INACTIVE_STAGE').length, 1)
  }
})

test('領主の遠距離減衰を軽減前に一度だけ掛け、SAS3とソーンズS3の無効化を反映する', () => {
  for (const [operatorId, skillIndex, ranged] of [
    ['char_172_svrash', 1, 1946.48],
    ['char_172_svrash', 2, 671.2],
    ['char_293_thorns', 1, 1185.6],
  ] as const) {
    const skill = sourceRecord(operatorId, skillIndex)
    const closeAttack = output(skill, { conditions: { attackDistanceType: 'MELEE' } })
    const rangedAttack = output(skill, { conditions: { attackDistanceType: 'RANGED' } })
    assert.deepEqual(rangedAttack.unsupportedReasons, [])
    assert.equal(closeAttack.rangePenaltyMultiplier, 1)
    assert.equal(rangedAttack.rangePenaltyMultiplier, 0.8)
    close(rangedAttack.rows[0].perAttack, ranged)
    close(rangedAttack.rows.find(row => row.axisValue === 500)?.perAttack, ranged - 500)
  }
  const silverash = output(sourceRecord('char_172_svrash', 3), { conditions: { attackDistanceType: 'RANGED', actualAttackTargetCount: 6 } })
  assert.deepEqual(silverash.unsupportedReasons, [])
  assert.equal(silverash.rangePenaltyMultiplier, 1)
  assert.equal(silverash.rows[0].perAttack, 2365)
  assert.equal(silverash.rows[0].allTargetsPerAttack, 14190)
})

test('ソーンズS2は遠距離減衰を反映した反撃1回で、0.6秒CDや通常攻撃間隔からDPSを作らない', () => {
  const skill = sourceRecord('char_293_thorns', 2)
  for (const distance of ['MELEE', 'RANGED'] as const) {
    const result = output(skill, { conditions: { attackDistanceType: distance, actualAttackTargetCount: 4 } })
    assert.deepEqual(result.unsupportedReasons, [])
    assert.equal(result.attackKind, 'COUNTER')
    assert.equal(result.rangePenaltyMultiplier, 0.8)
    assert.equal(result.maxTargetCount, 4)
    close(result.rows[0].perAttack, 948)
    close(result.rows[0].allTargetsPerAttack, 3792)
    assert.equal(result.canShowDps, false)
    assert.ok(result.rows.every(row => row.dps === null && row.allTargetsDps === null))
    assert.match(result.dpsReason!, /反撃|攻撃頻度|攻撃.*受け/)
    assert.ok(result.effects.find(entry => entry.effect.item === 'TRIGGERED_ATTACK')?.applied)
  }
})

test('発動回数・モード・距離の不正値を別の段階や通常攻撃へ代用しない', () => {
  const thorns = sourceRecord('char_293_thorns', 3)
  for (const count of [0, -1, 1.5, NaN, Infinity]) {
    const result = output(thorns, { conditions: { skillActivationCount: count } })
    assert.ok(result.unsupportedReasons.length > 0)
    assert.deepEqual(result.rows, [])
  }
  for (const [skill, conditions] of [
    [sourceRecord('char_172_svrash', 2), { skillMode: 'OTHER' }],
    [sourceRecord('char_293_thorns', 1), { attackDistanceType: 'AIR' }],
  ] as unknown as [SkillRecord, NonNullable<DamageCalculatorThreeInput['conditions']>][]) {
    const result = output(skill, { conditions })
    assert.ok(result.unsupportedReasons.length > 0)
    assert.deepEqual(result.rows, [])
  }
})

test('複数対象スキルは対応する対象数上限まで計算し、上限超過は拒否する', () => {
  for (const [operatorId, skillIndex, maximum] of [
    ['char_350_surtr', 2, 2], ['char_350_surtr', 3, 4],
    ['char_172_svrash', 3, 6], ['char_293_thorns', 2, 4],
  ] as const) {
    const skill = sourceRecord(operatorId, skillIndex)
    const result = output(skill, { conditions: { actualAttackTargetCount: maximum } })
    assert.deepEqual(result.unsupportedReasons, [])
    assert.equal(result.maxTargetCount, maximum)
    close(result.rows[0].allTargetsPerAttack, result.rows[0].perAttack * maximum)
    assert.deepEqual(output(skill, { conditions: { actualAttackTargetCount: maximum + 1 } }).rows, [])
  }
})


test('スルトの術属性は特性構造の適用記録から計算へ反映される', () => {
  const result = output(sourceRecord('char_350_surtr', 2))
  assert.equal(result.damageType, 'ARTS')
  assert.equal(result.traitEvaluation?.damageType, 'ARTS')
  assert.equal(result.traitEvaluation?.evaluations.find(row => row.effectId === 'normal-attack-damage-type')?.status, 'APPLIED')
})

test('遠距離特性の参照値が欠落した場合は以前の0.8へフォールバックしない', () => {
  const skill = sourceRecord('char_293_thorns', 1)
  const candidate = skill.operatorProfile.trait?.candidates?.[0]
  assert.ok(candidate)
  candidate.blackboard = []
  const result = output(skill, { conditions: { attackDistanceType: 'RANGED' } })
  assert.equal(result.rows.length, 0)
  assert.ok(result.unsupportedReasons.some(reason => /攻撃力倍率/.test(reason)))
})

test('特性説明文の意味が変わった場合は既存の職分倍率で計算を継続しない', () => {
  const skill = sourceRecord('char_350_surtr', 2)
  skill.operatorProfile.traitDescription = '敵に物理ダメージを与える'
  const result = output(skill)
  assert.equal(result.rows.length, 0)
  assert.ok(result.unsupportedReasons.some(reason => /特性の説明文/.test(reason)))
})

test('ソーンズS2の遠距離反撃にも構造化された特性の倍率を一度だけ適用する', () => {
  const result = output(sourceRecord('char_293_thorns', 2))
  assert.deepEqual(result.unsupportedReasons, [])
  assert.equal(result.attackKind, 'COUNTER')
  assert.equal(result.traitEvaluation?.attackScale, 0.8)
  assert.equal(result.rangePenaltyMultiplier, result.traitEvaluation?.attackScale)
  assert.equal(result.traitEvaluation?.evaluations.find(row => row.effectId === 'ranged-attack-scale')?.status, 'APPLIED')
})

test('スキルが遠距離減衰を解除した場合と近接扱いに変えた場合を適用記録に区別する', () => {
  const silver = output(sourceRecord('char_172_svrash', 3), { conditions: { attackDistanceType: 'RANGED' } })
  const thorns = output(sourceRecord('char_293_thorns', 3), { conditions: { attackDistanceType: 'RANGED' } })
  assert.deepEqual(silver.unsupportedReasons, [])
  assert.deepEqual(thorns.unsupportedReasons, [])
  assert.equal(silver.traitEvaluation?.attackScale, 1)
  assert.equal(thorns.traitEvaluation?.attackScale, 1)
  assert.equal(silver.traitEvaluation?.evaluations.find(row => row.effectId === 'ranged-attack-scale')?.status, 'CONDITION_FALSE')
  assert.equal(thorns.traitEvaluation?.evaluations.find(row => row.effectId === 'ranged-attack-scale')?.status, 'NOT_RELEVANT')
})
