import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifySkill } from '../src/lib/classifier.ts'
import { buildDamageCalculatorThreeOutput, type DamageCalculatorThreeInput } from '../src/lib/damageCalculatorThree.ts'
import { findSkillStructure, type SkillStructure, type SkillStructureEffect } from '../src/lib/skillStructure.ts'
import type { OperatorCombatProfile, RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/ireneS1.json', import.meta.url), 'utf8')) as {
  operator: { operatorId: string; operatorName: string }
  operatorProfile: OperatorCombatProfile; skill: { skillId: string; skillIndex: number; levels: RawSkillLevel[] }
}
function record(): SkillRecord {
  const raw = structuredClone(fixture.skill.levels[9])
  return { id: 'irene-s1', operatorId: fixture.operator.operatorId, operatorName: fixture.operator.operatorName,
    profession: 'WARRIOR', professionLabel: '前衛', rarity: 6, subProfessionId: 'sword', subProfessionName: '剣豪',
    nameInitial: 'A_ROW', skillId: fixture.skill.skillId, skillIndex: 1, skillName: raw.name!, description: raw.description!,
    duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!, spType: 'INCREASE_WHEN_ATTACK',
    initSp: 0, spCost: 3, classification: classifySkill(raw), skillLevels: structuredClone(fixture.skill.levels),
    raw, operatorProfile: structuredClone(fixture.operatorProfile) }
}
function output(skill = record(), patch: Partial<DamageCalculatorThreeInput> = {}) {
  return buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: 2, operatorLevel: 90,
    trust: 100, skillLevelIndex: 9, ...patch })
}
function at(result: ReturnType<typeof output>, defense: number) {
  const row = result.rows.find(entry => entry.axisValue === defense)
  assert.ok(row, `DEF=${defense}`)
  return row
}
function close(actual: number | null | undefined, expected: number) {
  assert.ok(actual !== null && actual !== undefined && Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`)
}
function candidate(skill: SkillRecord, talentIndex: number) {
  const value = skill.operatorProfile.talents![talentIndex].candidates!
    .find(entry => entry.unlockCondition?.phase === 'PHASE_2' && entry.requiredPotentialRank === 0)
  assert.ok(value)
  return value
}
function setTalent(skill: SkillRecord, talentIndex: number, key: string, value: number) {
  const entry = candidate(skill, talentIndex).blackboard!.find(entry => entry.key === key)
  assert.ok(entry)
  entry.value = value
}

test('浮遊可能なS1は両打撃を浮遊後として処理し、特性2hitを重ねず200%を2回だけ与える', () => {
  const skill = record(), before = structuredClone(skill)
  const result = output(skill)
  assert.deepEqual(result.unsupportedReasons, [])
  assert.equal(result.stats.attack, 701)
  assert.equal(result.damageType, 'PHYSICAL')
  assert.equal(result.axisLabel, '敵の防御力')
  assert.equal(result.attackKind, 'NEXT_ATTACK')
  assert.equal(result.hasAttackSequence, true)
  assert.equal(result.hasProbabilisticDamage, false)
  assert.equal(result.maxTargetCount, 1)
  close(at(result, 0).perAttack, 2804)
  close(at(result, 1000).perAttack, 1804)
  const components = at(result, 1000).attackComponents
  assert.equal(components.length, 2)
  assert.ok(components[0].order < components[1].order)
  for (const component of components) {
    assert.equal(component.targetAirborne, true)
    assert.equal(component.count, 1)
    assert.equal(component.damageType, 'PHYSICAL')
    assert.equal(component.attackScale, 2)
    assert.equal(component.defenseIgnoreChance, 1)
    assert.equal(component.defenseIgnoreRatio, 0.5)
    close(component.expectedDamage, 902)
  }
  assert.deepEqual(skill, before)
})

test('浮遊無効の地上敵は両打撃とも50%の防御無視を評価し、1撃目や2撃目だけを確定扱いしない', () => {
  const result = output(record(), { conditions: { targetCanBeLevitated: false } })
  assert.deepEqual(result.unsupportedReasons, [])
  assert.equal(result.hasProbabilisticDamage, true)
  close(at(result, 0).perAttack, 2804)
  close(at(result, 1000).perAttack, 1304)
  for (const component of at(result, 1000).attackComponents) {
    assert.equal(component.targetAirborne, false)
    assert.equal(component.defenseIgnoreChance, 0.5)
    const normal = component.branches.find(branch => branch.id === 'NORMAL')!
    const ignore = component.branches.find(branch => branch.id === 'IGNORE')!
    assert.ok(normal && ignore)
    assert.equal(normal.probability, 0.5)
    assert.equal(ignore.probability, 0.5)
    close(normal.damage, 402)
    close(ignore.damage, 902)
    close(component.expectedDamage, 0.5 * 402 + 0.5 * 902)
  }
})

test('最低保証が片側分岐に働く領域では、平均防御力へ置換せず軽減後ダメージを確率加重する', () => {
  const result = output(record(), { conditions: { targetCanBeLevitated: false } })
  const row = at(result, 1500)
  // A=701*2. No-ignore branch reaches A*5%=70.1; ignore branch gives A-750=652.
  close(row.perAttack, 2 * (70.1 * 0.5 + 652 * 0.5))
  assert.notEqual(row.perAttack, 2 * (1402 - 1500 * 0.75), 'averaging DEF before the minimum is incorrect')
  for (const component of row.attackComponents) {
    const normal = component.branches.find(branch => branch.id === 'NORMAL')!
    const ignore = component.branches.find(branch => branch.id === 'IGNORE')!
    assert.equal(normal.mitigation.minimumApplied, true)
    assert.equal(ignore.mitigation.minimumApplied, false)
    close(component.expectedDamage, 361.05)
  }
})

test('行の合計は各打撃の期待値の和であり、全対象倍率や回数を二重に掛けない', () => {
  for (const targetCanBeLevitated of [true, false]) {
    const result = output(record(), { conditions: { targetCanBeLevitated } })
    for (const row of result.rows) {
      close(row.perAttack, row.attackComponents.reduce((sum, component) => sum + component.expectedDamage, 0))
      close(row.allTargetsPerAttack, row.perAttack)
      for (const component of row.attackComponents) {
        close(component.branches.reduce((sum, branch) => sum + branch.probability, 0), 1)
        close(component.expectedDamage, component.branches.reduce((sum, branch) => sum + branch.probability * branch.damage, 0))
      }
    }
  }
})

test('海の怪物の存在はASPDを18から36へ変えるが、強化攻撃1回の総量やDPSの扱いを変えない', () => {
  for (const seaMonsterPresent of [false, true]) {
    const result = output(record(), { conditions: { seaMonsterPresent } })
    assert.deepEqual(result.unsupportedReasons, [])
    assert.equal(result.attackSpeed, seaMonsterPresent ? 136 : 118)
    close(result.attackInterval, 1.3 * 100 / (seaMonsterPresent ? 136 : 118))
    close(at(result, 1000).perAttack, 1804)
    assert.equal(result.canShowDps, false)
    assert.ok(result.dpsReason)
    assert.equal(result.damageOverTime, null)
    for (const row of result.rows) {
      assert.equal(row.dps, null)
      assert.equal(row.allTargetsDps, null)
      assert.equal(row.combinedDps, null)
      assert.equal(row.allTargetsCombinedDps, null)
    }
  }
})

test('原典の防御無視率・確率・攻撃速度の変更を共通効果として反映する', () => {
  const skill = record()
  setTalent(skill, 0, 'prob', 0.2)
  setTalent(skill, 0, 'def_penetrate', 0.3)
  setTalent(skill, 1, 'attack_speed', 27)
  const grounded = output(skill, { conditions: { targetCanBeLevitated: false, seaMonsterPresent: false } })
  assert.deepEqual(grounded.unsupportedReasons, [])
  close(at(grounded, 1000).perAttack, 2 * ((1402 - 700) * 0.2 + (1402 - 1000) * 0.8))
  assert.equal(grounded.attackSpeed, 127)
  const airborne = output(skill, { conditions: { targetCanBeLevitated: true, seaMonsterPresent: true } })
  close(at(airborne, 1000).perAttack, 1404)
  assert.equal(airborne.attackSpeed, 154)
  assert.equal(airborne.hasProbabilisticDamage, false)
})

test('確率0を未取得扱いせず、浮遊無効時には防御無視なしの二打撃を得る', () => {
  const skill = record()
  setTalent(skill, 0, 'prob', 0)
  const result = output(skill, { conditions: { targetCanBeLevitated: false } })
  assert.deepEqual(result.unsupportedReasons, [])
  close(at(result, 1000).perAttack, 804)
  assert.equal(result.hasProbabilisticDamage, false)
})

test('E2Lv1で解放済み素質を用い、潜在5のASPDや潜在ATKを潜在1へ混入させない', () => {
  const skill = record()
  const result = output(skill, { operatorLevel: 1, trust: 0 })
  assert.deepEqual(result.unsupportedReasons, [])
  assert.equal(result.stats.attack, 484)
  assert.equal(result.attackSpeed, 118)
  close(at(result, 0).perAttack, 1936)
  assert.equal(result.stats.baseAttackBreakdown.potentialAttack, 0)
  assert.equal(result.stats.baseAttackBreakdown.moduleAttack, 0)
  assert.ok(result.talentEffects.every(entry => entry.operatorId === 'char_4009_irene'))
  assert.equal(new Set(result.talentEffects.map(entry => entry.talentIndex)).size, 2)
})

test('必要な素質candidateが未確認なら別の素質や潜在強化候補から補わず計算を保留する', () => {
  for (const talentIndex of [0, 1]) {
    const skill = record()
    skill.operatorProfile.talents![talentIndex] = { candidates: [] }
    const result = output(skill)
    assert.deepEqual(result.rows, [])
    assert.ok(result.unsupportedReasons.length > 0)
    assert.ok(result.talentEffects.some(entry => entry.talentIndex === talentIndex && entry.status === 'UNVERIFIED'))
  }
})

test('使用する素質値が欠落・非数値・確率範囲外なら固定50%や18へ置き換えない', () => {
  for (const [talentIndex, key, mutation] of [
    [0, 'prob', 'missing'], [0, 'def_penetrate', 'missing'], [1, 'attack_speed', 'missing'],
    [0, 'prob', -0.1], [0, 'prob', 1.1], [0, 'prob', NaN], [0, 'def_penetrate', NaN],
  ] as const) {
    const skill = record()
    const entries = candidate(skill, talentIndex).blackboard!
    const index = entries.findIndex(entry => entry.key === key)
    if (mutation === 'missing') entries.splice(index, 1)
    else entries[index].value = mutation
    const result = output(skill, { conditions: { targetCanBeLevitated: false } })
    assert.deepEqual(result.rows, [], `${key}/${mutation}`)
    assert.ok(result.unsupportedReasons.length > 0, `${key}/${mutation}`)
  }
})

test('真偽条件へ文字列・数値を渡した場合や対象数超過・未対応段階を暗黙に既定条件へ戻さない', () => {
  for (const conditions of [
    { targetCanBeLevitated: 'false' }, { targetCanBeLevitated: 0 },
    { seaMonsterPresent: 'true' }, { seaMonsterPresent: 1 }, { actualAttackTargetCount: 2 },
  ]) {
    const result = output(record(), { conditions: conditions as DamageCalculatorThreeInput['conditions'] })
    assert.deepEqual(result.rows, [])
    assert.ok(result.unsupportedReasons.length > 0)
  }
  const invalidLevel = output(record(), { skillLevelIndex: 8 })
  assert.deepEqual(invalidLevel.rows, [])
  assert.ok(invalidLevel.unsupportedReasons.length > 0)
})

/** The registry is static in production. Each synchronous probe restores its exact original reference. */
function withStructure(
  transform: (value: SkillStructure['effectStructure']) => SkillStructure['effectStructure'],
  check: () => void,
) {
  const structure = findSkillStructure({ operatorId: 'char_4009_irene', skillId: 'skchr_irene_1', skillIndex: 1, levelIndex: 9 })
  assert.ok(structure)
  const mutable = structure as { effectStructure: SkillStructure['effectStructure'] }
  const original = mutable.effectStructure
  try {
    mutable.effectStructure = transform(structuredClone(original))
    check()
  } finally {
    mutable.effectStructure = original
  }
}
function stageEffects(
  value: SkillStructure['effectStructure'],
  transform: (effects: readonly SkillStructureEffect[]) => readonly SkillStructureEffect[],
): SkillStructure['effectStructure'] {
  return { ...value, stages: value.stages.map((stage, index) => index === 0 ? { ...stage, effects: transform(stage.effects) } : stage) }
}

test('配列の表示順を逆転しても、依存関係の浮遊→初撃→追撃で実行する', { concurrency: false }, () => {
  withStructure(value => stageEffects(value, effects => [...effects].reverse()), () => {
    const lifted = output()
    assert.deepEqual(lifted.unsupportedReasons, [])
    close(at(lifted, 1000).perAttack, 1804)
    assert.deepEqual(at(lifted, 1000).attackComponents.map(component => component.id), ['damage-1', 'damage-2'])
    assert.ok(at(lifted, 1000).attackComponents.every(component => component.targetAirborne))
    const immune = output(record(), { conditions: { targetCanBeLevitated: false } })
    assert.deepEqual(immune.unsupportedReasons, [])
    close(at(immune, 1000).perAttack, 1304)
    assert.ok(at(immune, 1000).attackComponents.every(component => !component.targetAirborne))
  })
})

test('依存先が存在しなければ、宣言を黙殺して配列順で計算しない', { concurrency: false }, () => {
  withStructure(value => stageEffects(value, effects => effects.map(effect => effect.id === 'damage-1'
    ? { ...effect, afterEffects: ['missing-status-effect'] } : effect)), () => {
    const result = output()
    assert.deepEqual(result.rows, [])
    assert.ok(result.unsupportedReasons.some(reason => /依存先/.test(reason)))
  })
})

test('依存関係が循環していれば、途中の打撃や浮遊状態で部分計算しない', { concurrency: false }, () => {
  withStructure(value => stageEffects(value, effects => effects.map(effect => effect.id === 'damage-1'
    ? { ...effect, afterEffects: ['damage-2'] } : effect)), () => {
    const result = output()
    assert.deepEqual(result.rows, [])
    assert.ok(result.unsupportedReasons.some(reason => /循環/.test(reason)))
  })
})

test('効果IDが重複していれば、依存関係や打撃の数を曖昧にしたまま計算しない', { concurrency: false }, () => {
  withStructure(value => stageEffects(value, effects => effects.map(effect => effect.id === 'damage-2'
    ? { ...effect, id: 'damage-1' } : effect)), () => {
    const result = output()
    assert.deepEqual(result.rows, [])
    assert.ok(result.unsupportedReasons.some(reason => /ID.*重複/.test(reason)))
  })
})

test('初期対象の地上限定宣言がなければ、全ての連続攻撃を地上始まりと推定しない', { concurrency: false }, () => {
  withStructure(value => {
    const { targetSelection: _omitted, ...withoutSelection } = value
    return withoutSelection
  }, () => {
    const result = output()
    assert.deepEqual(result.rows, [])
    assert.ok(result.unsupportedReasons.some(reason => /初期.*対象|対象.*初期/.test(reason)))
  })
})
