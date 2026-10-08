import test from 'node:test'
import assert from 'node:assert/strict'
import { classifySkill } from '../src/lib/classifier.ts'
import { buildDamageCalculatorTwoOutput } from '../src/lib/damageCalculatorTwo.ts'
import type { RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

// Compact JP Surtr fixture; basic growth/skill values match the fixtures used by
// surtrDps.test.ts. Passive/module values are included to test their exclusion.
function surtr(): SkillRecord {
  return record({
    name: 'ラグナロク', description: '攻撃力+{atk:0%}、退場まで効果継続',
    skillType: 'MANUAL', duration: -1, durationType: 'NONE',
    blackboard: [{ key: 'atk', value: 3.3 }],
  }, { operatorId: 'char_350_surtr', operatorName: 'スルト', subProfessionId: 'artsfghter', skillIndex: 3 })
}

function record(raw: RawSkillLevel, patch: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: 'test:skill', operatorId: 'test', operatorName: 'テスト', profession: 'WARRIOR',
    professionLabel: '前衛', subProfessionId: 'artsfghter', subProfessionName: '術戦士', nameInitial: 'S_ROW',
    rarity: 6, skillIndex: 1, skillId: 'test_skill', skillName: raw.name ?? 'スキル',
    description: raw.description ?? '', duration: raw.duration ?? null, durationType: raw.durationType ?? 'NONE',
    skillType: raw.skillType ?? 'MANUAL', spType: 'INCREASE_WITH_TIME', initSp: 0, spCost: 5,
    classification: classifySkill(raw), skillLevels: [raw], raw,
    operatorProfile: {
      phases: [{ maxLevel: 50 }, { maxLevel: 80 }, { maxLevel: 90, attributesKeyFrames: [
        { level: 1, data: { atk: 544, baseAttackTime: 1.25, attackSpeed: 100 } },
        { level: 90, data: { atk: 672, baseAttackTime: 1.25, attackSpeed: 100 } },
      ] }],
      favorKeyFrames: [{ level: 0, data: { atk: 0 } }, { level: 50, data: { atk: 100 } }],
      traitDescription: '敵に術ダメージを与える',
      talents: [{ candidates: [{ description: '対象の術耐性を20無視', blackboard: [
        { key: 'magic_resist_penetrate_fixed', value: 20 }, { key: 'attack_speed', value: 999 },
      ] }] }],
      potentialRanks: [{ buff: { attributes: { attributeModifiers: [{ attributeType: 'ATK', value: 28 }] } } }],
      modules: [{ uniEquipId: 'module', phases: [{ equipLevel: 3, attributeBlackboard: { atk: 60, attack_speed: 30 } }] }],
    },
    ...patch,
  }
}

function output(operator: SkillRecord, skill: SkillRecord | null = operator, patch = {}) {
  return buildDamageCalculatorTwoOutput({
    operator, skill, phaseIndex: 2, operatorLevel: 90, trust: 100, skillLevelIndex: 0, ...patch,
  })
}

function close(actual: number | null | undefined, expected: number) {
  assert.ok(actual !== null && actual !== undefined && Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`)
}

test('スルトS3: 基礎ATK・スキルだけを反映し、素質・特性補正・MOD・潜在を加算しない', () => {
  const skill = surtr()
  const before = structuredClone(skill)
  const result = output(skill)
  assert.deepEqual(result.unsupportedReasons, [])
  assert.equal(result.stats.attack, 772)
  assert.equal(result.stats.baseAttackBreakdown.potentialAttack, 0)
  assert.equal(result.stats.baseAttackBreakdown.moduleAttack, 0)
  assert.equal(result.effectiveAttack, 3319)
  assert.equal(result.damageType, 'ARTS')
  assert.equal(result.axisLabel, '敵の術耐性')
  assert.deepEqual(result.rows.map(row => row.axisValue), [0, 20, 40, 60, 80, 95, 100])
  close(result.rows[0].dps, 2655.2)
  close(result.rows.find(row => row.axisValue === 20)?.perHit, 2655.2)
  assert.equal(result.rows[1].breakdown.mitigation.resistanceIgnoreFixed, 0)
  assert.deepEqual(skill, before)
})

test('スルト通常攻撃: スキル補正を除外し、育成・信頼の変更に追従する', () => {
  const skill = surtr()
  const normal = output(skill, null)
  assert.equal(normal.effectiveAttack, 772)
  close(normal.rows[0].dps, 617.6)
  const low = output(skill, null, { operatorLevel: 1, trust: 0 })
  assert.equal(low.stats.attack, 544)
  assert.equal(low.rows[0].perHit, 544)
})

test('攻撃力と+の間にマークアップがあっても、自身のHP回復を主目的の回復スキルと誤判定しない', () => {
  const skill = surtr()
  // JP skchr_surtr_3, including ancillary self-healing and its markup.
  skill.skillLevels[0].description = '自身のHPを最大値まで回復\n攻撃力<@ba.vup>+{atk:0%}</>、攻撃範囲<@ba.vup>+{ability_range_forward_extend}</>マス、攻撃対象数<@ba.vup>+3</>、最大HP<@ba.vup>+{max_hp}</>、HPが徐々に減少（減少割合は時間と共に増加し、<@ba.vup>{duration}</>秒後に最大HPの{hp_ratio:0%}/秒になる）\n<@ba.rem>退場まで効果継続</>'
  const result = output(skill)
  assert.deepEqual(result.unsupportedReasons, [])
  assert.equal(result.effectiveAttack, 3319)
  close(result.rows[0].dps, 2655.2)
})

test('物理攻撃: シルバーアッシュS3型の攻撃力と防御力別・最低保証を計算する', () => {
  const skill = record({ description: '攻撃力+200%、攻撃する', skillType: 'MANUAL', duration: 30,
    blackboard: [{ key: 'atk', value: 2 }] }, { subProfessionId: 'lord' })
  skill.operatorProfile.phases[2].attributesKeyFrames![1].data!.atk = 763
  skill.operatorProfile.favorKeyFrames = []
  skill.operatorProfile.traitDescription = '80%の攻撃力で遠距離攻撃も行える'
  const result = output(skill)
  assert.equal(result.stats.attack, 763)
  assert.equal(result.effectiveAttack, 2289)
  assert.equal(result.damageType, 'PHYSICAL')
  assert.equal(result.axisLabel, '敵の防御力')
  assert.equal(result.rows[0].perHit, 2289)
  close(result.rows.find(row => row.axisValue === 1000)?.perHit, 1289)
  close(result.rows.find(row => row.axisValue === 3000)?.perHit, 114.45)
})

test('術攻撃の95・100では最低保証、確定攻撃では敵条件によらない1行を返す', () => {
  const arts = output(surtr())
  close(arts.rows.at(-2)?.perHit, 165.95)
  close(arts.rows.at(-1)?.perHit, 165.95)
  const skill = record({ description: '攻撃力+100%、攻撃が確定ダメージになる', skillType: 'MANUAL', duration: 20,
    blackboard: [{ key: 'atk', value: 1 }] })
  const result = output(skill)
  assert.deepEqual(result.unsupportedReasons, [])
  assert.equal(result.damageType, 'TRUE')
  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0].perHit, 1544)
  assert.equal(result.rows[0].breakdown.mitigation.minimumDamage, null)
})

test('連撃・スキル攻撃速度・攻撃間隔を反映し、1ヒットと1攻撃を区別する', () => {
  const skill = record({ description: '通常攻撃が3回攻撃になり、攻撃速度+25、攻撃間隔-0.25秒',
    skillType: 'MANUAL', duration: 20, blackboard: [
      { key: 'attack@times', value: 3 }, { key: 'attack@atk_scale', value: 0.5 },
      { key: 'attack_speed', value: 25 }, { key: 'base_attack_time', value: -0.25 },
    ] })
  const result = output(skill)
  assert.deepEqual(result.unsupportedReasons, [])
  assert.equal(result.model?.attackInterval, 0.8)
  assert.equal(result.rows[0].perHit, 386)
  assert.equal(result.rows[0].perAttack, 1158)
  close(result.rows[0].dps, 1447.5)
})

test('次回攻撃スキルは1攻撃を計算しても、毎回発動するDPSに置き換えない', () => {
  const skill = record({ description: '次の通常攻撃時、攻撃力の200%の術ダメージを与える',
    skillType: 'AUTO', duration: 0, blackboard: [{ key: 'atk_scale', value: 2 }] })
  const result = output(skill)
  assert.deepEqual(result.unsupportedReasons, [])
  assert.equal(result.rows[0].perAttack, 1544)
  assert.equal(result.canShowDps, false)
  assert.ok(result.dpsReason?.includes('次回攻撃'))
  assert.ok(result.rows.every(row => row.dps === null))
})

test('独立した瞬間攻撃は倍率を読める場合だけ計算し、連続DPSにしない', () => {
  const skill = record({ description: '範囲内の敵に攻撃力の300%の術ダメージを与える',
    skillType: 'MANUAL', duration: 0, blackboard: [{ key: 'atk_scale', value: 3 }] })
  const result = output(skill)
  assert.deepEqual(result.unsupportedReasons, [])
  assert.equal(result.rows[0].perAttack, 2316)
  assert.equal(result.rows[0].dps, null)
  skill.skillLevels[0].blackboard = []
  assert.ok(output(skill).unsupportedReasons.some(reason => reason.includes('倍率')))
})

test('召喚・周期・モード・条件・独立倍率・複数倍率は簡易数値を捏造しない', () => {
  const unsupported: RawSkillLevel[] = [
    { description: '召喚ユニットを召喚し、攻撃力+100%' },
    { description: '毎秒敵に術ダメージを与える' },
    { description: 'モードを切り替え、攻撃力+100%' },
    { description: '凍結状態の敵を攻撃する時、攻撃力+100%' },
    { description: '攻撃力+100%、ダメージを与える', blackboard: [{ key: 'damage_scale', value: 2 }] },
    { description: '攻撃力+100%', blackboard: [{ key: 'atk_scale', value: 2 }, { key: 'attack@atk_scale', value: 3 }] },
    { description: '攻撃力+100%', blackboard: [{ key: 'conditional.atk', value: 2 }] },
    { description: '通常攻撃が3回攻撃になる', blackboard: [{ key: 'times', value: 3 }] },
    { description: '攻撃力+100%', blackboard: [] },
    { description: '通常攻撃が3回攻撃になる', blackboard: [{ key: 'attack@times', value: 0 }] },
  ]
  for (const raw of unsupported) {
    const result = output(record({ skillType: 'MANUAL', duration: 20, ...raw }))
    assert.ok(result.unsupportedReasons.length > 0, raw.description)
    assert.deepEqual(result.rows, [])
    assert.equal(result.effectiveAttack, null)
  }
})

test('回復・非攻撃オペレーターおよび浮遊ユニットは通常攻撃を推測しない', () => {
  for (const patch of [{ profession: 'MEDIC' }, { subProfessionId: 'funnel' }]) {
    const skill = record({ description: '味方のHPを回復', skillType: 'MANUAL', duration: 20 }, patch)
    if (patch.profession === 'MEDIC') skill.operatorProfile.traitDescription = '味方のHPを回復する'
    const result = output(skill, null)
    assert.ok(result.unsupportedReasons.length > 0)
    assert.deepEqual(result.rows, [])
  }
  const skill = record({ description: '攻撃力+100%', skillType: 'MANUAL', duration: 20 })
  skill.operatorProfile.traitDescription = '敵を攻撃しない'
  assert.deepEqual(output(skill, null).rows, [])
})

test('2回攻撃・5回連続攻撃を明示するスキルを1ヒットへ黙って縮めない', () => {
  for (const phrase of ['攻撃対象に2回攻撃', '2回連続攻撃', '5回連続攻撃', '{times}回連続攻撃']) {
    const skill = record({
      description: `次の通常攻撃時、${phrase}を行い、攻撃力の135%の術ダメージを与える`,
      skillType: 'AUTO', duration: 0, blackboard: [{ key: 'atk_scale', value: 1.35 }, { key: 'times', value: 2 }],
    })
    const result = output(skill)
    assert.ok(result.unsupportedReasons.some(reason => reason.includes('ヒット数')), phrase)
    assert.deepEqual(result.rows, [])
  }
  const modeled = record({
    description: '次の通常攻撃時、攻撃対象に2回攻撃を行い、攻撃力の135%の術ダメージを与える',
    skillType: 'AUTO', duration: 0,
    blackboard: [{ key: 'atk_scale', value: 1.35 }, { key: 'attack@times', value: 2 }],
  })
  const result = output(modeled)
  assert.deepEqual(result.unsupportedReasons, [])
  close(result.rows[0].perHit, 1042.2)
  close(result.rows[0].perAttack, 2084.4)
})

test('スキルの貫通・敵への速度変更・曖昧な間隔倍率・発動回数補正を除外した数値は出さない', () => {
  const cases: Array<[RawSkillLevel, string]> = [
    [{ description: '次の通常攻撃時、攻撃力+100%、防御力の60%を無視', blackboard: [
      { key: 'atk', value: 1 }, { key: 'def_penetrate', value: 0.6 },
    ] }, '被ダメージ補正'],
    [{ description: '攻撃力+100%、防御力400を無視', blackboard: [
      { key: 'atk', value: 1 }, { key: 'def_penetrate_fixed', value: 400 },
    ] }, '被ダメージ補正'],
    [{ description: '攻撃力+100%、攻撃対象の攻撃速度を20低下させる', blackboard: [
      { key: 'atk', value: 1 }, { key: 'attack@attack_speed', value: -20 },
    ] }, '攻撃対象への速度補正'],
    [{ description: '攻撃力+100%、攻撃間隔を超大幅に短縮', blackboard: [
      { key: 'atk', value: 1 }, { key: 'base_attack_time', value: 0.17 },
    ] }, '倍率・置き換え'],
    [{ description: '攻撃速度+40。発動するたびに、その次に発動するスキルの攻撃速度+40', blackboard: [
      { key: 'attack_speed', value: 40 }, { key: 'attack_speed_extra', value: 40 },
    ] }, '条件'],
    [{ description: '攻撃力+100%、HPが50%以上の敵に追加で攻撃を行う', blackboard: [
      { key: 'atk', value: 1 },
    ] }, '追加攻撃'],
  ]
  for (const [raw, reason] of cases) {
    const result = output(record({ skillType: 'MANUAL', duration: 20, ...raw }))
    assert.ok(result.unsupportedReasons.some(value => value.includes(reason)), raw.description)
    assert.deepEqual(result.rows, [])
  }
})

test('スキルレベルの数値を選び、別OPのスキル・空のスキルデータを拒否する', () => {
  const skill = surtr()
  skill.skillLevels.unshift({ ...skill.raw, blackboard: [{ key: 'atk', value: 1.8 }] })
  assert.equal(output(skill).effectiveAttack, 2161)
  assert.equal(output(skill, skill, { skillLevelIndex: 1 }).effectiveAttack, 3319)
  assert.ok(output(skill, { ...skill, operatorId: 'different' }).unsupportedReasons.some(reason => reason.includes('一致')))
  assert.ok(output(skill, { ...skill, skillLevels: [] }).unsupportedReasons.some(reason => reason.includes('データ')))
})
