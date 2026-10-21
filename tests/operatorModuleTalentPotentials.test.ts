import test from 'node:test'
import assert from 'node:assert/strict'
import { getOperatorModuleTalentPotentialRanks } from '../src/lib/operatorModuleTalentPotentials.ts'
import type { OperatorCombatProfile, RawOperatorModule, RawOperatorModuleTalentCandidate } from '../src/types/skill.ts'

test('スルトの素質解放条件から潜在1・3・5を返し、攻撃力・コスト・再配置の段階を含めない', () => {
  const profile = surtr()
  const original = structuredClone(profile)
  assert.deepEqual(getOperatorModuleTalentPotentialRanks(profile), [1, 3, 5])
  assert.deepEqual(profile, original)
})

test('表示文の言語や潜在説明の文字列を使わず、素質の構造化候補を判定する', () => {
  const profile = base()
  profile.potentialRanks![0] = { description: '第一素質強化' }
  assert.deepEqual(getOperatorModuleTalentPotentialRanks(profile), [1])
  profile.talents![0].candidates!.push({ name: 'Talent', description: 'Resistance ignore 22', requiredPotentialRank: 3 })
  profile.potentialRanks![2] = { description: 'Arbitrary localized description' }
  assert.deepEqual(getOperatorModuleTalentPotentialRanks(profile), [1, 4])
})

test('全MODと全実在段階の素質上書きから潜在強化の段階を合成する', () => {
  const profile = base()
  profile.modules = [
    module('x', [[candidate(0, 20), candidate(1, 21)], [candidate(0, 20), candidate(3, 22)]]),
    module('y', [[candidate(0, 20), candidate(5, 23)]]),
  ]
  const original = structuredClone(profile)
  assert.deepEqual(getOperatorModuleTalentPotentialRanks(profile), [1, 2, 4, 6])
  assert.deepEqual(profile, original)
})

test('非表示素質・MOD追加効果・召喚物・特性だけの変化は潜在候補を増やさない', () => {
  const profile = base()
  profile.talents!.push({ candidates: [
    { name: 'Hidden', description: '10', isHideTalent: true },
    { name: 'Hidden', description: '20', requiredPotentialRank: 1, isHideTalent: true },
  ] })
  profile.trait = { candidates: [{ overrideDescription: 'trait' }, { overrideDescription: 'upgraded trait', requiredPotentialRank: 2 }] }
  const equipped = module('x', [[candidate(0, 20)]])
  equipped.phases![0].parts!.push(
    { addOrOverrideTalentDataBundle: { candidates: [{ ...candidate(3, 30), isHideTalent: true }] } },
    { addOrOverrideTalentDataBundle: { candidates: [{ ...candidate(4, 30), talentIndex: 99, name: 'New addition' }] } },
    { isToken: true, addOrOverrideTalentDataBundle: { candidates: [candidate(5, 30)] } },
    { overrideTraitDataBundle: { candidates: [{ additionalDescription: 'ASPD+8', requiredPotentialRank: 3 }] } },
  )
  profile.modules = [equipped]
  assert.deepEqual(getOperatorModuleTalentPotentialRanks(profile), [1])
})

test('同じ効果の重複候補とblackboardの並び替えだけでは強化段階としない', () => {
  const profile = base()
  profile.talents![0].candidates = [
    { name: 'Talent', description: '20', blackboard: [{ key: 'a', value: 10 }, { key: 'b', value: 20 }] },
    { name: 'Talent', description: '20', requiredPotentialRank: 1, prefabKey: 'cosmetic', blackboard: [{ key: 'b', value: 20 }, { key: 'A', value: 10 }] },
    { name: 'Talent', description: '20(+0)', requiredPotentialRank: 2, blackboard: [{ key: 'a', value: 10 }, { key: 'b', value: 20 }] },
  ]
  assert.deepEqual(getOperatorModuleTalentPotentialRanks(profile), [1])
  profile.modules = [module('x', [[candidate(0, 20), candidate(4, 20)]])]
  assert.deepEqual(getOperatorModuleTalentPotentialRanks(profile), [1])
})

test('同じ表示文でも素質の元のblackboard数値が変わる潜在を残す', () => {
  const profile = base()
  const old = { name: 'Talent', description: 'same prose', blackboard: [{ key: 'value', value: 10.00001 }] }
  profile.talents![0].candidates = [old, { ...old, requiredPotentialRank: 1, blackboard: [{ key: 'value', value: 10.00002 }] }]
  assert.deepEqual(getOperatorModuleTalentPotentialRanks(profile), [1, 2])
  profile.talents![0].candidates = [old]
  const before = { ...candidate(0, 20), blackboard: { value: 10.00001 } }
  profile.modules = [module('x', [[before, { ...before, requiredPotentialRank: 3, blackboard: { value: 10.00002 } }]])]
  assert.deepEqual(getOperatorModuleTalentPotentialRanks(profile), [1, 4])
})

test('潜在上限・整数閾値・最終昇進の解放条件を満たす素質だけを使う', () => {
  const profile = base()
  profile.potentialRanks = [{}, {}, {}]
  profile.talents![0].candidates!.push(
    { name: 'Talent', description: 'invalid fraction', requiredPotentialRank: 0.5 },
    { name: 'Talent', description: 'beyond max', requiredPotentialRank: 5 },
    { name: 'Talent', description: 'future promotion', requiredPotentialRank: 1, unlockCondition: { phase: 'PHASE_3', level: 1 } },
    { name: 'Talent', description: 'future level', requiredPotentialRank: 2, unlockCondition: { phase: 'PHASE_2', level: 100 } },
  )
  assert.deepEqual(getOperatorModuleTalentPotentialRanks(profile), [1])
  profile.talents![0].candidates!.push({ name: 'Talent', description: 'actual upgrade', requiredPotentialRank: 3 })
  assert.deepEqual(getOperatorModuleTalentPotentialRanks(profile), [1, 4])
})

test('非表示の素質スロットが先行してもMODが上書きする元素質の番号を維持する', () => {
  const profile = base()
  profile.talents!.unshift({ candidates: [{ name: 'hidden slot', isHideTalent: true, description: 'hidden' }] })
  profile.modules = [module('x', [[{ ...candidate(0, 20), talentIndex: 1 }, { ...candidate(2, 22), talentIndex: 1 }]])]
  assert.deepEqual(getOperatorModuleTalentPotentialRanks(profile), [1, 3])
})

test('潜在が存在しない・素質が存在しない・強化がない場合にも基準の潜在1を返す', () => {
  assert.deepEqual(getOperatorModuleTalentPotentialRanks({ phases: [], favorKeyFrames: [] }), [1])
  const profile = base()
  profile.talents = []
  profile.modules = [module('x', [[candidate(2, 22)]])]
  assert.deepEqual(getOperatorModuleTalentPotentialRanks(profile), [1])
  profile.potentialRanks = []
  assert.deepEqual(getOperatorModuleTalentPotentialRanks(profile), [1])
})

function base(): OperatorCombatProfile {
  return {
    phases: [{ maxLevel: 50 }, { maxLevel: 80 }, { maxLevel: 90 }], favorKeyFrames: [],
    potentialRanks: [{}, {}, {}, {}, {}],
    talents: [{ candidates: [{ name: 'Talent', description: 'Resistance ignore 20', requiredPotentialRank: 0, prefabKey: '1' }] }],
  }
}

function surtr(): OperatorCombatProfile {
  const profile = base()
  profile.potentialRanks = [
    { description: 'コスト-1', buff: { attributes: { attributeModifiers: [{ attributeType: 'COST', formulaItem: 'ADDITION', value: -1 }] } } },
    { description: '素質2強化' },
    { description: '攻撃力+28', buff: { attributes: { attributeModifiers: [{ attributeType: 'ATK', formulaItem: 'ADDITION', value: 28 }] } } },
    { description: '素質1強化' },
    { description: 'コスト-1', buff: { attributes: { attributeModifiers: [{ attributeType: 'COST', formulaItem: 'ADDITION', value: -1 }] } } },
  ]
  profile.talents = [
    { candidates: [{ name: '劫火', description: '術耐性を20無視' }, { name: '劫火', description: '術耐性を22無視', requiredPotentialRank: 4 }] },
    { candidates: [{ name: '余燼', description: '8秒後退場' }, { name: '余燼', description: '9秒後退場', requiredPotentialRank: 2 }] },
  ]
  return profile
}

function candidate(requiredPotentialRank: number, value: number): RawOperatorModuleTalentCandidate {
  return { talentIndex: 0, name: 'Talent', upgradeDescription: `Resistance ignore ${value}`, requiredPotentialRank }
}

function module(id: string, levels: RawOperatorModuleTalentCandidate[][]): RawOperatorModule {
  return { uniEquipId: id, uniEquipName: `MOD ${id}`, type: 'ADVANCED', phases: levels.map((candidates, index) => ({
    equipLevel: index + 1, attributeBlackboard: { atk: 20 }, parts: [{ addOrOverrideTalentDataBundle: { candidates } }],
  })) }
}
