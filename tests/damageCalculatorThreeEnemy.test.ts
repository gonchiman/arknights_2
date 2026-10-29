import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildDamageCalculatorThreeOutput, type DamageCalculatorThreeInput } from '../src/lib/damageCalculatorThree.ts'
import { classifySkill } from '../src/lib/classifier.ts'
import type { OperatorCombatProfile, RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

const source = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardSources.json', import.meta.url), 'utf8')) as {
  guards: { id: string; name: string; subProfessionId: string; skills: { skillId: string; skillIndex: number; raw: RawSkillLevel }[] }[]
}
const profiles = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardProfiles.json', import.meta.url), 'utf8')) as {
  operatorId: string; operatorProfile: OperatorCombatProfile
}[]

function input(operatorId: string, skillIndex: number, patch: Partial<DamageCalculatorThreeInput> = {}): DamageCalculatorThreeInput {
  const operator = source.guards.find(value => value.id === operatorId)!
  const entry = operator.skills.find(value => value.skillIndex === skillIndex)!
  const raw = structuredClone(entry.raw)
  const skill: SkillRecord = { id: `${operatorId}/${skillIndex}`, operatorId, operatorName: operator.name,
    skillId: entry.skillId, skillIndex, skillName: raw.name!, profession: 'WARRIOR', professionLabel: '前衛', rarity: 6,
    subProfessionId: operator.subProfessionId, subProfessionName: operator.subProfessionId, nameInitial: 'OTHER',
    description: raw.description!, duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
    spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!, classification: classifySkill(raw),
    skillLevels: Array.from({ length: 10 }, () => structuredClone(raw)), raw,
    operatorProfile: structuredClone(profiles.find(value => value.operatorId === operatorId)!.operatorProfile) }
  return { operator: skill, skill, phaseIndex: 2, operatorLevel: 90, trust: 100, skillLevelIndex: 9, ...patch }
}

function result(operatorId: string, skillIndex: number, patch: Partial<DamageCalculatorThreeInput> = {}) {
  const output = buildDamageCalculatorThreeOutput(input(operatorId, skillIndex,
    { enemy: { defense: 123, resistance: 37 }, ...patch }))
  assert.deepEqual(output.unsupportedReasons, [])
  assert.equal(output.rows.length, 1)
  return { output, row: output.rows[0] }
}

function close(actual: number | null, expected: number) {
  assert.ok(actual !== null && Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`)
}

test('任意の敵1体を術・物理それぞれの軽減式で直接計算する', () => {
  const arts = result('char_350_surtr', 3)
  close(arts.row.perAttack, Math.floor(arts.output.stats.attack * 4.3 + 1e-9) * 0.83)
  close(arts.row.dps, arts.row.perAttack / 1.25)
  assert.equal(arts.row.axisValue, 37)
  assert.equal(arts.row.breakdown!.mitigation.inputDefense, 123)
  assert.equal(arts.row.breakdown!.mitigation.inputResistance, 37)

  const physical = result('char_017_huang', 2)
  close(physical.row.perAttack, physical.output.stats.attack * 2 - 123)
  assert.equal(physical.row.axisValue, 123)
})

test('チェンS2の物理・術混合攻撃に同じ敵のDEF123とRES37を適用する', () => {
  const { output, row } = result('char_010_chen', 2,
    { conditions: { guard: { enemyResistance: 80, actualAttackTargetCount: 7 } } })
  const attack = Math.floor(output.stats.attack * 1.05 + 1e-9) * 5
  close(row.perAttack, attack - 123 + attack * 0.63)
  close(row.allTargetsPerAttack, row.perAttack * 7)
  assert.deepEqual(row.attackComponents.map(component => component.damageType), ['PHYSICAL', 'ARTS'])
  assert.equal(output.guard!.conditions.enemyResistance, 37, '個別の旧術耐性条件より共通の敵条件を優先する')
  for (const component of row.attackComponents) {
    assert.equal(component.branches[0].mitigation.inputDefense, 123)
    assert.equal(component.branches[0].mitigation.inputResistance, 37)
  }
})

test('アイリーニの確率防御無視も任意DEFで各分岐を軽減してから合算する', () => {
  const { output, row } = result('char_4009_irene', 1, { conditions: { targetCanBeLevitated: false } })
  const attack = output.stats.attack * 2
  close(row.perAttack, 2 * ((attack - 123) * 0.5 + (attack - 61.5) * 0.5))
  assert.equal(output.hasProbabilisticDamage, true)
  for (const component of row.attackComponents) {
    assert.equal(component.branches[0].mitigation.inputDefense, 123)
    assert.equal(component.branches[1].mitigation.appliedDefense, 61.5)
  }
  const minimum = result('char_4009_irene', 1, {
    enemy: { defense: 1537, resistance: 37 }, conditions: { targetCanBeLevitated: false },
  })
  close(minimum.row.perAttack, 2 * (attack * 0.05 * 0.5 + (attack - 1537 * 0.5) * 0.5))
})

test('ソーンズの通常攻撃と維持毒DPSに同じ敵条件を使う', () => {
  const { output, row } = result('char_293_thorns', 3, {
    conditions: { skillActivationCount: 2, enemyResistance: 80 },
  })
  const direct = Math.floor(output.stats.attack * 2.2 + 1e-9) - 123
  close(row.perAttack, direct)
  close(row.damageOverTimeDps, 125 * 0.63)
  close(row.combinedDps, direct / output.attackInterval! + 125 * 0.63)
})

test('司霆レイズの物理攻撃と周期術ダメージも共通の敵条件で計算する', () => {
  const { output, row } = result('char_1043_leizi2', 2,
    { conditions: { guard: { enemyResistance: 80 } } })
  close(row.dps, 1564.875 - 123 / output.attackInterval!)
  close(row.damageOverTimeDps, 125.19 * 0.63)
  close(row.combinedDps, row.dps! + row.damageOverTimeDps!)
})

test('防御力・術耐性が不正なら旧・新両計算経路で数値結果を返さない', () => {
  const invalid = [
    { defense: NaN, resistance: 37 }, { defense: Infinity, resistance: 37 }, { defense: -1, resistance: 37 },
    { defense: 123, resistance: NaN }, { defense: 123, resistance: Infinity },
    { defense: 123, resistance: -1 }, { defense: 123, resistance: 101 },
  ]
  for (const [operatorId, skillIndex] of [['char_350_surtr', 3], ['char_010_chen', 2]] as const) {
    for (const enemy of invalid) {
      const output = buildDamageCalculatorThreeOutput(input(operatorId, skillIndex, { enemy }))
      assert.ok(output.unsupportedReasons.some(reason => /敵の防御力|敵の術耐性/.test(reason)))
      assert.deepEqual(output.rows, [])
      assert.equal(output.model, null)
      assert.equal(output.effectiveAttack, null)
      assert.equal(output.canShowDps, false)
    }
  }
})

test('小数の敵条件を丸めず、術耐性の上下限も有効な条件として扱う', () => {
  for (const resistance of [0, 37.5, 100]) {
    const { output, row } = result('char_010_chen', 2, { enemy: { defense: 123.5, resistance } })
    const attack = Math.floor(output.stats.attack * 1.05 + 1e-9) * 5
    close(row.perAttack, attack - 123.5 + attack * Math.max(0.05, 1 - resistance / 100))
  }
})

test('敵の指定を省略した従来表と、同条件の1点計算の数値が一致する', () => {
  for (const [operatorId, skillIndex] of [
    ['char_350_surtr', 3], ['char_293_thorns', 3], ['char_4009_irene', 1],
    ['char_017_huang', 2], ['char_010_chen', 2], ['char_1043_leizi2', 2],
  ] as const) {
    const value = input(operatorId, skillIndex, {
      conditions: { enemyResistance: 37, skillActivationCount: 2, guard: { enemyResistance: 37 } },
    })
    const sweep = buildDamageCalculatorThreeOutput(value)
    assert.deepEqual(sweep.unsupportedReasons, [])
    assert.ok(sweep.rows.length > 1)
    for (const row of sweep.rows) {
      const isArts = sweep.axisLabel === '敵の術耐性'
      const exact = buildDamageCalculatorThreeOutput({ ...value,
        enemy: { defense: isArts ? 0 : row.axisValue, resistance: isArts ? row.axisValue : 37 } })
      assert.deepEqual(exact.unsupportedReasons, [])
      assert.equal(exact.rows.length, 1)
      for (const key of ['perAttack', 'dps', 'allTargetsPerAttack', 'allTargetsDps', 'damageOverTimeDps',
        'combinedDps', 'allTargetsCombinedDps'] as const) {
        assert.equal(exact.rows[0][key], row[key], `${operatorId}/${skillIndex}: ${key}, axis=${row.axisValue}`)
      }
    }
  }
})
