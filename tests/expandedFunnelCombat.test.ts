import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { SkillRecord } from '../src/types/skill.ts'
import type { ExpandedOperatorSource } from '../src/lib/expandedCombatTypes.ts'
import type { GuardConditions, GuardStage } from '../src/lib/guardCombatTypes.ts'
import { EXPANDED_ARTS_DEFINITIONS } from '../src/lib/expandedArtsDefinitions.ts'
import { buildDamageCalculatorThreeOutput, type DamageCalculatorThreeInput } from '../src/lib/damageCalculatorThree.ts'
import { calculateDamageThreePeriodTotal } from '../src/lib/damageCalculatorThreePeriodTotal.ts'
import { buildTraitStructures, getTraitStructureEffectValueRows } from '../src/lib/traitStructure.ts'
import { evaluateTraitStructure } from '../src/lib/traitCombatEvaluation.ts'
import { evaluateGuardTraits } from '../src/lib/guardTraitEvaluation.ts'
import { classifySkill } from '../src/lib/classifier.ts'
import { calculateMechAccordCurrentScale, getMechAccordMultiplierPercent } from '../src/lib/mechAccordDamage.ts'
import { buildDamageCalculatorThreeCoverage } from '../src/lib/damageCalculatorThreeCoverage.ts'

const sources = JSON.parse(readFileSync(new URL('../src/data/expandedArtsSources.json', import.meta.url), 'utf8')) as ExpandedOperatorSource[]
const ids = ['char_328_cammou', 'char_4013_kjera', 'char_4054_malist', 'char_4040_rockr', 'char_1038_whitw2', 'char_377_gdglow']
function record(id: string, index: number): SkillRecord {
  const source = sources.find(source => source.operatorId === id)!
  const skill = source.skills.find(skill => skill.skillIndex === index)!
  const raw = structuredClone(skill.raw)
  return { id: `${id}/${index}`, operatorId: id, operatorName: source.operatorName, skillId: skill.skillId,
    skillIndex: index, skillName: raw.name!, profession: source.profession, professionLabel: source.profession,
    rarity: source.rarity, subProfessionId: source.subProfessionId, subProfessionName: source.subProfessionId, nameInitial: 'OTHER',
    description: raw.description!, duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
    spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!, classification: classifySkill(raw),
    skillLevels: Array.from({ length: source.skillLevelIndex + 1 }, () => structuredClone(raw)), raw,
    operatorProfile: structuredClone(source.profile) }
}
function output(id: string, index: number, guard: GuardConditions = {}, change?: (record: SkillRecord) => void,
  options: Partial<DamageCalculatorThreeInput> = {}) {
  const skill = record(id, index), source = sources.find(source => source.operatorId === id)!
  change?.(skill)
  return buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: source.phaseIndex,
    operatorLevel: source.profile.phases[source.phaseIndex].maxLevel!, trust: 100,
    skillLevelIndex: source.skillLevelIndex, conditions: { guard }, ...options })
}
function at(id: string, index: number, guard: GuardConditions = {}, resistance = 0) {
  const result = output(id, index, guard)
  assert.deepEqual(result.unsupportedReasons, [], `${id} S${index}`)
  return { result, row: result.rows.find(row => row.axisValue === resistance)! }
}
function close(actual: number | null, expected: number) {
  assert.ok(actual !== null && Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`)
}
const buffed = (base: number, ratio: number) => Math.floor(base * (1 + ratio) + 1e-9)
const physical = (attack: number, defense: number) => Math.max(attack * 0.05, attack - defense)
const arts = (attack: number, resistance: number) => attack * Math.max(0.05, 1 - resistance / 100)
const profile = { initialScale: 0.2, increment: 0.15, maximumScale: 1.1, baseMaximumStacks: 6 }

test('操機術師14技能の確認済み状態は1回分だけを計算し、未確認状態・DPS・有限総量を推定しない', () => {
  let count = 0
  for (const definition of EXPANDED_ARTS_DEFINITIONS.filter(definition => ids.includes(definition.operatorId))) {
    for (const recipe of definition.recipes) {
      count++
      for (const stage of recipe.stages) for (const droneState of ['FIRST', 'CAPPED']) {
        const guard = { droneState, ...(stage.when ? { [stage.when.input]: stage.when.value } : {}) }
        const result = output(definition.operatorId, recipe.skillIndex, guard)
        if (stage.unresolved?.length) {
          assert.deepEqual(result.rows, [])
          assert.ok(result.unsupportedReasons.length)
          continue
        }
        assert.deepEqual(result.unsupportedReasons, [], `${definition.operatorId} S${recipe.skillIndex} ${stage.id}`)
        assert.ok(result.rows.length)
        assert.equal(result.attackInterval, null)
        assert.equal(result.canShowDps, false)
        assert.ok(result.rows.every(row => row.dps === null && row.combinedDps === null && row.allTargetsDps === null))
        assert.equal(calculateDamageThreePeriodTotal({ stage, attackKind: result.attackKind,
          combinedDps: result.rows[0].combinedDps, allTargetsCombinedDps: result.rows[0].allTargetsCombinedDps }).totalDamage, null)
      }
    }
  }
  assert.equal(count, 14)
})

test('共通倍率関数は既存20～110%を維持し、上限変更を全攻撃倍率へ掛けない', () => {
  assert.deepEqual(Array.from({ length: 8 }, (_, i) => getMechAccordMultiplierPercent(i + 1)), [20, 35, 50, 65, 80, 95, 110, 110])
  close(calculateMechAccordCurrentScale(profile, 1, 2), 0.2)
  close(calculateMechAccordCurrentScale(profile, 1, 2, true), 2.2)
  close(calculateMechAccordCurrentScale(profile, 1, 1.1, true), 1.21)
  close(calculateMechAccordCurrentScale(profile, 4), 0.65)
  for (const args of [
    [profile, 0], [profile, 1.5], [profile, 2, 2], [profile, 1, Infinity],
    [{ ...profile, increment: NaN }, 1], [{ ...profile, baseMaximumStacks: 5 }, 1],
  ] as Parameters<typeof calculateMechAccordCurrentScale>[]) assert.throws(() => calculateMechAccordCurrentScale(...args))
})

test('カシャは本体と浮遊を別々に軽減し、放出前後で攻撃の出自を保持する', () => {
  for (const index of [1, 2]) for (const [droneState, scale] of [['FIRST', 0.2], ['CAPPED', 1.1]] as const) {
    const attack = buffed(375, index === 1 ? 0.8 : 0.7)
    const { result, row } = at('char_328_cammou', index, { droneState }, 80)
    close(row.perAttack, arts(attack, 80) + arts(attack * scale, 80))
    assert.equal(result.attackSpeed, 112)
    assert.equal(row.attackComponents?.length, 2)
    assert.deepEqual(row.attackComponents?.map(component => component.role), ['MAIN', index === 1 ? 'ADDITIONAL' : 'MAIN'])
    close(row.attackComponents![0].attackScale, 1)
    close(row.attackComponents![1].attackScale, scale)
  }
})

test('イェラの地面条件は2マスで10%、3マスで16%となり、本体と浮遊に同じATK加算を適用する', () => {
  for (const groundTilesInRange of [0, 2, 3, 4]) {
    const attack = buffed(354, 1 + (groundTilesInRange >= 3 ? 0.16 : 0.1))
    close(at('char_4013_kjera', 1, { groundTilesInRange, droneState: 'CAPPED' }, 60).row.perAttack, attack * 2.1 * 0.4)
  }
})

test('ミニマリストの会心は軽減後の枝期待値を合算し、物理化した本体と術の付随浮遊を分離する', () => {
  const attack = buffed(360, 0.45)
  for (const [droneState, scale] of [['FIRST', 0.2], ['CAPPED', 1.1]] as const) {
    close(at('char_4054_malist', 1, { droneState }, 40).row.perAttack, attack * (0.75 + 0.25 * 1.5) * (1 + scale) * 0.6)
    const result = output('char_4054_malist', 1, { droneState, enemyResistance: 40 }, undefined, { virtualMainAttackType: 'PHYSICAL' })
    assert.deepEqual(result.unsupportedReasons, [])
    const row = result.rows.find(row => row.axisValue === 500)!
    close(row.perAttack, physical(attack, 500) * 0.75 + physical(attack * 1.5, 500) * 0.25
      + arts(attack * scale, 40) * 0.75 + arts(attack * scale * 1.5, 40) * 0.25)
    assert.deepEqual(row.attackComponents?.map(component => component.damageType), ['PHYSICAL', 'ARTS'])
  }
})

test('ロックロックは素質のATK加算、前半、OD上限220%を独立に適用する', () => {
  for (const index of [1, 2]) for (const rockrockPhase of ['NORMAL', 'OVERDRIVE']) {
    for (const rockrockTalentStacks of [0, 4]) for (const [droneState, ramp] of [['FIRST', 0.2], ['CAPPED', 1.1]] as const) {
      const overdrive = index === 2 && rockrockPhase === 'OVERDRIVE'
      const attack = buffed(380, rockrockTalentStacks * 0.04 + (overdrive ? 0.5 : 0))
      const scale = droneState === 'CAPPED' && overdrive ? 2.2 : ramp
      const { result, row } = at('char_4040_rockr', index, { rockrockPhase, rockrockTalentStacks, droneState }, 60)
      close(row.perAttack, attack * (1 + scale) * 0.4)
      assert.equal(result.attackSpeed, index === 1 ? 190 : 180)
    }
  }
})

test('荒蕪ラップランドは常時追加・素質追加・上限補正を分離し、S1初期状態にも常時追加を残す', () => {
  for (const index of [1, 2]) for (const lapplandS1State of ['INITIAL', 'ACTIVE']) {
    for (const lapplandTalentStage of [0, 1, 2, 3]) for (const [droneState, ramp] of [['FIRST', 0.2], ['CAPPED', 1.1]] as const) {
      const attack = buffed(402, index === 2 ? 1.2 : lapplandS1State === 'ACTIVE' ? 0.35 : 0)
      const count = (index === 1 ? 2 : 4) + (lapplandTalentStage === 3 ? 1 : 0)
      const scale = droneState === 'CAPPED' && lapplandTalentStage >= 1 ? 1.21 : ramp
      const { result, row } = at('char_1038_whitw2', index, { lapplandS1State, lapplandTalentStage, droneState }, 40)
      close(row.perAttack, attack * (1 + count * scale) * 0.6)
      close(row.attackComponents![1].count, count)
      close(row.attackComponents![1].attackScale, scale)
      assert.equal(result.guard!.evaluations.find(effect => effect.item === '追加浮遊ユニット数')!.status,
        lapplandTalentStage === 3 ? 'APPLIED' : 'CONDITION_FALSE')
    }
  }
})

test('全14技能の同属性選択は通常計算と一致し、仮想物理はMAINだけを変える', () => {
  for (const definition of EXPANDED_ARTS_DEFINITIONS.filter(definition => ids.includes(definition.operatorId))) {
    for (const recipe of definition.recipes) for (const stage of recipe.stages) {
      if (stage.unresolved?.length) continue
      const guard = { droneState: 'CAPPED', lapplandTalentStage: 3, enemyResistance: 40,
        ...(stage.when ? { [stage.when.input]: stage.when.value } : {}) }
      const native = output(definition.operatorId, recipe.skillIndex, guard)
      const same = output(definition.operatorId, recipe.skillIndex, guard, undefined, { virtualMainAttackType: 'ARTS' })
      assert.deepEqual(same.rows, native.rows)
      const virtual = output(definition.operatorId, recipe.skillIndex, guard, undefined, { virtualMainAttackType: 'PHYSICAL' })
      assert.deepEqual(virtual.unsupportedReasons, [])
      const row = virtual.rows.find(row => row.axisValue === 1000)!
      const components = native.rows[0].attackComponents!
      const expected = components.reduce((sum, component) => sum + component.branches.reduce((subtotal, branch) => {
        const amount = branch.mitigation.attack
        return subtotal + (component.role === 'MAIN' ? physical(amount, 1000) : arts(amount, Math.max(0, 40 - native.resistanceIgnoreFixed)))
          * component.expectedHitCount * branch.probability
      }, 0), 0)
      close(row.perAttack, expected)
      assert.deepEqual(row.attackComponents?.map(component => component.damageType), components.map(component => component.role === 'MAIN' ? 'PHYSICAL' : 'ARTS'))
    }
  }
})

test('イェラS2は凍結無効の対象に本体1発と独立した放出2ユニットを計算する', () => {
  for (const groundTilesInRange of [0, 2, 3]) for (const [droneState, ramp] of [['FIRST', 0.2], ['CAPPED', 1.1]] as const) {
    const { row } = at('char_4013_kjera', 2, { groundTilesInRange, droneState }, 60)
    const attack = buffed(354, 0.55 + (groundTilesInRange >= 3 ? 0.16 : 0.1))
    close(row.perAttack, arts(attack, 60) + 2 * arts(attack * ramp, 60))
    assert.deepEqual(row.attackComponents!.map(part => [part.role, part.count]), [['MAIN', 1], ['MAIN', 2]])
  }
  assert.deepEqual(output('char_4013_kjera', 2, { kjeraFreezeState: 'CHANGING' }).rows, [])
  const changed = output('char_4013_kjera', 2, {}, row => {
    row.skillLevels[9].blackboard!.find(entry => entry.key === 'attack@prob')!.value = 0.3
  })
  assert.deepEqual(changed.rows, [])
})

test('ミニマリストS2は上限到達済みの本体2発・浮遊2発に200%と会心を一度ずつ掛ける', () => {
  const attack = 360
  const native = at('char_4054_malist', 2, {}, 60)
  close(native.row.perAttack, 2 * (arts(attack * 2, 60) + arts(attack * 2 * 1.1, 60)) * (0.75 + 0.25 * 1.5))
  assert.equal(native.result.attackKind, 'NEXT_ATTACK')
  assert.equal(native.result.attackInterval, null)
  assert.deepEqual(native.row.attackComponents!.map(part => part.count), [2, 2])
  const virtual = output('char_4054_malist', 2, { enemyResistance: 60 }, undefined, { virtualMainAttackType: 'PHYSICAL' })
  const row = virtual.rows.find(row => row.axisValue === 1000)!
  close(row.perAttack, 2 * (0.75 * physical(attack * 2, 1000) + 0.25 * physical(attack * 2 * 1.5, 1000)
    + 0.75 * arts(attack * 2 * 1.1, 60) + 0.25 * arts(attack * 2 * 1.1 * 1.5, 60)))
  assert.deepEqual(output('char_4054_malist', 2, { droneState: 'FIRST' }).rows, [])
})

test('荒蕪ラップランドS3は特殊ユニット3/4体と重複しない120%毎秒を独立させる', () => {
  const attack = buffed(402, 0.8)
  for (const lapplandTalentStage of [0, 1, 2, 3]) for (const [droneState, firstScale] of [['FIRST', 0.2], ['CAPPED', 1.1]] as const) {
    const scale = droneState === 'CAPPED' && lapplandTalentStage >= 1 ? 1.21 : firstScale
    const count = lapplandTalentStage === 3 ? 4 : 3
    const { result, row } = at('char_1038_whitw2', 3, { lapplandTalentStage, droneState }, 60)
    close(row.perAttack, arts(attack, 60) + count * arts(attack * scale, 60))
    close(row.damageOverTimeDps!, arts(attack * 1.2, 60))
    assert.equal(row.combinedDps, null)
    assert.equal(result.attackInterval, null)
    assert.deepEqual(row.attackComponents!.map(part => [part.role, part.count]), [['MAIN', 1], ['ADDITIONAL', count]])
    const virtual = output('char_1038_whitw2', 3, { lapplandTalentStage, droneState, enemyResistance: 60 }, undefined,
      { virtualMainAttackType: 'PHYSICAL' })
    const vrow = virtual.rows.find(row => row.axisValue === 1000)!
    close(vrow.perAttack, physical(attack, 1000) + count * arts(attack * scale, 60))
    close(vrow.damageOverTimeDps!, arts(attack * 1.2, 60))
  }
})

test('GGはPRD不発回数と特性倍率を独立させ、通常弾か自爆の排他的な期待値だけを求める', () => {
  for (const index of [1, 2, 3]) for (const misses of [0, 1, 10, 38]) {
    for (const [droneState, ramp] of [['FIRST', 0.2], ['CAPPED', 1.1]] as const) {
      const attack = buffed(391, index === 1 ? 0.4 : index === 2 ? 0.6 : 0.8)
      const count = index === 3 ? 3 : 2, chance = 0.015 * (misses + 1)
      const { result, row } = at('char_377_gdglow', index, { droneState, goldenglowExplosionMisses: misses }, 60)
      const normal = count * (1 - chance) * arts(attack * ramp, 45)
      const explosion = count * chance * arts(attack * 3, 45)
      close(row.perAttack, (index === 3 ? 0 : arts(attack, 45)) + normal + explosion)
      const parts = row.attackComponents!
      const exploding = parts.find(part => part.label === '浮遊ユニットの自爆')!
      const drone = parts.find(part => part.label === '放出した浮遊ユニット')!
      close(exploding.expectedDamage, explosion)
      close(exploding.attackScale, 3)
      close(drone.expectedDamage, normal)
      close(exploding.expectedHitCount + drone.expectedHitCount, count)
      assert.equal(exploding.role, 'ADDITIONAL')
      assert.equal(result.attackInterval, null)
      assert.equal(row.dps, null)
      assert.equal(row.combinedDps, null)
      assert.equal(parts.some(part => part.label === '本体の術攻撃'), index !== 3)
    }
  }
})

test('GGの仮想属性は本体・放出通常弾だけを変え、自爆の術属性とRES15無視を維持する', () => {
  for (const index of [1, 2, 3]) for (const defense of [0, 1000, 10000]) {
    const attack = buffed(391, index === 1 ? 0.4 : index === 2 ? 0.6 : 0.8)
    const count = index === 3 ? 3 : 2, chance = 0.165
    const result = output('char_377_gdglow', index, { droneState: 'CAPPED', goldenglowExplosionMisses: 10 }, undefined,
      { enemy: { defense, resistance: 60 }, virtualMainAttackType: 'PHYSICAL' })
    assert.deepEqual(result.unsupportedReasons, [])
    close(result.rows[0].perAttack, (index === 3 ? 0 : physical(attack, defense))
      + count * (1 - chance) * physical(attack * 1.1, defense) + count * chance * arts(attack * 3, 45))
    assert.equal(result.rows[0].attackComponents!.find(part => part.label === '浮遊ユニットの自爆')!.damageType, 'ARTS')
  }
})

test('GGの確定自爆境界は素質の保留として表示し、確率元の欠落・変更や範囲外条件を拒否する', () => {
  for (const index of [1, 2, 3]) {
    for (const goldenglowExplosionMisses of [-1, 0.5, 39, 40, 41]) {
      const result = output('char_377_gdglow', index, { goldenglowExplosionMisses })
      assert.deepEqual(result.rows, [])
      assert.ok(result.unsupportedReasons.length)
    }
    for (const key of ['attack@prob', 'attack@atk_scale_2', 'attack@max_stack_cnt']) {
      const result = output('char_377_gdglow', index, {}, skill => {
        for (const candidate of skill.operatorProfile.talents![0].candidates ?? [])
          candidate.blackboard = candidate.blackboard?.filter(entry => entry.key !== key)
      })
      assert.deepEqual(result.rows, [])
    }
    for (const [key, value] of [['attack@prob', 0.02], ['attack@max_stack_cnt', 41]] as const) {
      const changed = output('char_377_gdglow', index, {}, skill => {
        for (const candidate of skill.operatorProfile.talents![0].candidates ?? [])
          candidate.blackboard!.find(entry => entry.key === key)!.value = value
      })
      assert.equal(changed.rows.length, 0)
      assert.ok(changed.unsupportedReasons.some(reason => reason.includes(key)))
    }
    assert.deepEqual(output('char_377_gdglow', index, { actualAttackTargetCount: 2 }).rows, [])
    const coverage = buildDamageCalculatorThreeCoverage([record('char_377_gdglow', index)])[0]
    assert.equal(coverage.status, 'CONDITIONAL')
    assert.ok(coverage.issues.some(issue => issue.id.includes('goldenglow-explosion-prd-boundary') && issue.relatedSections.includes('素質1')))
    assert.ok(coverage.deferredReasons.some(reason => reason.includes('39〜40')))
  }
})

test('特性の出自を保持し、ドローン欠落・不正指定・変更された原文/数値は計算を停止する', () => {
  const operator = record('char_328_cammou', 1)
  const structure = buildTraitStructures([operator])[0]
  assert.equal(structure.status, 'STRUCTURED')
  const effect = structure.effects.find(effect => effect.item === 'DRONE_ATTACK')!
  assert.ok(effect.sourceBinding?.includes('max_atk_scale'))
  assert.ok(getTraitStructureEffectValueRows(effect).some(([label]) => label === '基本倍率の上限'))
  const stage: GuardStage = { id: 'test', label: 'test', kind: 'NORMAL', actions: [{ label: '本体', role: 'MAIN', damageType: 'ARTS', scale: 1 }] }
  assert.match(evaluateGuardTraits(operator, stage, {}, new Map(), { phaseIndex: 2, operatorLevel: 60 }).evaluation.blockers.join(' '), /浮遊ユニット/)
  stage.actions = [{ label: '浮遊', role: 'MAIN', damageType: 'ARTS', scale: 1, drone: { sameTargetAttack: 1, atMaximum: 2 } }]
  assert.throws(() => evaluateGuardTraits(operator, stage, {}, new Map(), { phaseIndex: 2, operatorLevel: 60 }), /上限到達/)
  for (const id of ids) {
    for (const change of [
      (skill: SkillRecord) => { skill.skillLevels[9].description += '未確認の効果' },
      (skill: SkillRecord) => { skill.operatorProfile.trait!.candidates![0].blackboard![0].value = 0.9 },
      (skill: SkillRecord) => { for (const candidate of skill.operatorProfile.talents![0].candidates ?? []) candidate.description += '未確認の効果' },
    ]) assert.equal(output(id, 1, {}, change).rows.length, 0, id)
  }
  for (const guard of [{ droneState: 'UNKNOWN' }, { actualAttackTargetCount: 2 }, { lapplandTalentStage: 4 }])
    assert.equal(output('char_1038_whitw2', 2, guard).rows.length, 0)
})

test('イネスの既知初回配置metadataを保持し、他オペレーターや変更された内部値へ拡大しない', () => {
  const operator = record('char_328_cammou', 1)
  operator.operatorId = 'char_4087_ines'; operator.subProfessionId = 'agent'; operator.profession = 'PIONEER'
  operator.operatorProfile.traitDescription = '再配置までの時間が<@ba.kw>短い</>、遠距離攻撃も行える'
  operator.operatorProfile.trait = { candidates: [{ unlockCondition: { phase: 'PHASE_2', level: 1 }, requiredPotentialRank: 0,
    blackboard: [{ key: 'runtime_cost', value: -9999, valueStr: null }], overrideDescripton: null, prefabKey: '-1', rangeId: null }] }
  for (const phase of operator.operatorProfile.phases) for (const frame of phase.attributesKeyFrames ?? []) frame.data!.respawnTime = 35
  const structure = buildTraitStructures([operator])[0]
  assert.equal(structure.status, 'STRUCTURED')
  const marker = structure.effects.find(effect => effect.item === 'INITIAL_DEPLOYMENT_RUNTIME_COST')!
  assert.equal(marker.value, -9999)
  assert.equal(marker.calculationRelevance, 'NOT_RELEVANT')
  assert.deepEqual(evaluateTraitStructure(structure, { kind: 'NORMAL', metrics: {} }).blockers, [])
  for (const change of [
    (row: SkillRecord) => { row.operatorId = 'char_unreviewed_agent' },
    (row: SkillRecord) => { row.operatorProfile.trait!.candidates![0].blackboard![0].value = -9998 },
    (row: SkillRecord) => { row.operatorProfile.trait!.candidates![0].prefabKey = null },
    (row: SkillRecord) => { row.operatorProfile.trait!.candidates![0].blackboard!.push({ key: 'atk', value: 1 }) },
  ]) { const changed = structuredClone(operator); change(changed); assert.equal(buildTraitStructures([changed])[0].status, 'UNREVIEWED') }
})

test('アステジーニの確認済み連鎖キーを元のまま保持し、別キーの混在や上限変更は拒否する', () => {
  const operator = record('char_328_cammou', 1)
  operator.operatorId = 'char_135_halo'; operator.subProfessionId = 'chain'
  const description = '<@ba.kw>{attack@chain.max_target}</>体目まで跳躍していく<@ba.kw>術ダメージ</>を敵に与え、跳躍するたびダメージが15%減衰し、敵を一瞬<$ba.sluggish>足止め</>'
  operator.operatorProfile.trait = { candidates: [{ unlockCondition: { phase: 'PHASE_2', level: 1 }, requiredPotentialRank: 0,
    blackboard: [{ key: 'attack@chain.max_target', value: 4 }, { key: 'attack@sluggish', value: 0.5 }],
    overrideDescripton: description, prefabKey: '-1', rangeId: null }] }
  const structure = buildTraitStructures([operator])[0]
  assert.equal(structure.status, 'STRUCTURED')
  assert.equal(structure.effects.find(effect => effect.item === 'CHAIN_ATTACK')!.sourceBinding, 'attack@chain.max_target')
  const evaluated = evaluateTraitStructure(structure, { kind: 'NORMAL', metrics: {} })
  assert.deepEqual(evaluated.blockers, [])
  assert.equal(evaluated.maxTargets, 4)
  assert.equal(evaluated.chainRetention, 0.85)
  for (const change of [
    (row: SkillRecord) => { row.operatorId = 'char_unreviewed_chain' },
    (row: SkillRecord) => { row.operatorProfile.trait!.candidates![0].blackboard!.push({ key: 'attack@max_target', value: 4 }) },
  ]) { const changed = structuredClone(operator); change(changed); assert.equal(buildTraitStructures([changed])[0].status, 'UNREVIEWED') }
  operator.operatorProfile.trait!.candidates![0].blackboard![0].value = 5
  assert.ok(evaluateTraitStructure(buildTraitStructures([operator])[0], { kind: 'NORMAL', metrics: {} }).blockers.length)
})
