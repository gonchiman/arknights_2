import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifySkill } from '../src/lib/classifier.ts'
import { buildDamageCalculatorThreeOutput, getDamageCalculatorThreeStructures,
  type DamageCalculatorThreeInput } from '../src/lib/damageCalculatorThree.ts'
import { buildDamageCalculatorThreeCoverage } from '../src/lib/damageCalculatorThreeCoverage.ts'
import { filterDamageCalculatorThreeCoverage, EMPTY_DAMAGE_THREE_COVERAGE_FILTERS } from '../src/lib/damageCalculatorThreeCoverageFilters.ts'
import { summarizeDamageCalculatorThreeCoverage } from '../src/lib/damageCalculatorThreeCoverageSummary.ts'
import { EXPANDED_OPERATOR_DEFINITIONS } from '../src/lib/expandedCombatRegistry.ts'
import { buildExpandedTalentStructures } from '../src/lib/expandedTalentStructure.ts'
import { mergeGuardInputs, resolveGuardConditions } from '../src/lib/guardCombatValues.ts'
import type { ExpandedOperatorSource } from '../src/lib/expandedCombatTypes.ts'
import type { GuardConditions, GuardStage } from '../src/lib/guardCombatTypes.ts'
import type { SkillRecord } from '../src/types/skill.ts'

// The independent JP snapshots are the expected roster; do not obtain expected
// operator/skill identities from the executable registry under test.
const groups = ['Melee', 'Ranged', 'Arts'].map(group => JSON.parse(readFileSync(
  new URL(`../src/data/expanded${group}Sources.json`, import.meta.url), 'utf8')) as ExpandedOperatorSource[])
const sources = groups.flat()
const sourceMap = new Map(sources.map(source => [source.operatorId, source]))
const identity = (value: { operatorId: string; skillId: string; skillIndex: number }) =>
  `${value.operatorId}/${value.skillId}/${value.skillIndex}`

function record(operatorId: string, skillIndex: number): SkillRecord {
  const source = sourceMap.get(operatorId)!
  const entry = source.skills.find(skill => skill.skillIndex === skillIndex)!
  const raw = structuredClone(entry.raw)
  return { id: identity({ operatorId, skillId: entry.skillId, skillIndex }), operatorId, operatorName: source.operatorName,
    profession: source.profession, professionLabel: source.profession, rarity: source.rarity,
    subProfessionId: source.subProfessionId, subProfessionName: source.subProfessionId, nameInitial: 'OTHER',
    skillIndex, skillId: entry.skillId, skillName: raw.name!, description: raw.description!, duration: raw.duration!,
    durationType: raw.durationType!, skillType: raw.skillType!, spType: raw.spData!.spType!,
    initSp: raw.spData!.initSp!, spCost: raw.spData!.spCost!, classification: classifySkill(raw), raw,
    skillLevels: Array.from({ length: source.skillLevelIndex + 1 }, () => structuredClone(raw)),
    operatorProfile: structuredClone(source.profile) }
}
function input(operatorId: string, skillIndex: number, guard: GuardConditions = {}): DamageCalculatorThreeInput {
  const source = sourceMap.get(operatorId)!, skill = record(operatorId, skillIndex)
  return { operator: skill, skill, phaseIndex: source.phaseIndex,
    operatorLevel: source.profile.phases[source.phaseIndex].maxLevel!, trust: 100,
    skillLevelIndex: source.skillLevelIndex, conditions: { guard } }
}
function calculate(operatorId: string, skillIndex: number, guard: GuardConditions = {}) {
  return buildDamageCalculatorThreeOutput(input(operatorId, skillIndex, guard))
}
function blocked(value: DamageCalculatorThreeInput, label: string) {
  const result = buildDamageCalculatorThreeOutput(value)
  assert.ok(result.unsupportedReasons.length > 0, `${label}: 未確認の条件で数値を返した`)
  assert.deepEqual(result.rows, [], label)
  assert.equal(result.model, null, label)
}
function stageConditions(stage: GuardStage, step = 1): GuardConditions {
  if (!stage.when) return {}
  const { input, value, comparison } = stage.when
  return { [input]: typeof value === 'number' && comparison === 'LT' ? value - step
    : typeof value === 'number' && comparison === 'GT' ? value + step : value }
}
const catalog = sources.flatMap(source => source.skills.map(skill => record(source.operatorId, skill.skillIndex)))
const coverage = buildDamageCalculatorThreeCoverage(catalog)
const structures = getDamageCalculatorThreeStructures().filter(structure => sourceMap.has(structure.basicInfo.operatorId))

test('独立snapshotの110名225スキルが構造・coverage・registryに欠落や重複なく現れる', () => {
  assert.deepEqual(groups.map(group => [group.length, group.reduce((sum, source) => sum + source.skills.length, 0)]),
    [[51, 101], [27, 57], [32, 67]])
  assert.equal(sources.length, 110)
  assert.equal(catalog.length, 225)
  assert.equal(sourceMap.size, sources.length)
  const expectedIds = catalog.map(identity).sort()
  assert.deepEqual(structures.map(structure => identity(structure.basicInfo)).sort(), expectedIds)
  assert.deepEqual(coverage.map(row => identity(row.skill)).sort(), expectedIds)
  assert.deepEqual(EXPANDED_OPERATOR_DEFINITIONS.map(definition => definition.operatorId).sort(), [...sourceMap.keys()].sort())
  for (const source of sources) {
    const definition = EXPANDED_OPERATOR_DEFINITIONS.find(definition => definition.operatorId === source.operatorId)!
    const coveredIndices = [...definition.recipes.map(recipe => recipe.skillIndex), ...(definition.deferredSkills ?? []).map(skill => skill.skillIndex)]
    assert.deepEqual(coveredIndices.sort(), source.skills.map(skill => skill.skillIndex).sort(), source.operatorName)
    assert.equal(new Set(coveredIndices).size, coveredIndices.length)
  }
})

test('追加範囲は対応168・条件付き3・保留54で、保留を未対応や対応へ混ぜない', () => {
  assert.deepEqual(Object.fromEntries(['SUPPORTED', 'CONDITIONAL', 'PENDING', 'UNSUPPORTED'].map(status =>
    [status, coverage.filter(row => row.status === status).length])),
  { SUPPORTED: 168, CONDITIONAL: 3, PENDING: 54, UNSUPPORTED: 0 })
  assert.deepEqual(coverage.filter(row => row.status === 'CONDITIONAL').map(row => `${row.skill.operatorId}/${row.skill.skillIndex}`).sort(),
    ['char_145_prove/2', 'char_218_cuttle/2', 'char_405_absin/2'])
  for (const row of coverage) {
    assert.equal(row.selection?.levelIndex, sourceMap.get(row.skill.operatorId)!.skillLevelIndex)
    if (row.status === 'PENDING') {
      assert.deepEqual(row.calculationScope, [])
      assert.ok(row.deferredReasons.length)
      assert.equal(row.sections.skill, 'PENDING')
    } else assert.ok(row.calculationScope.length)
  }
})

test('coverageの特性区分は、優先対象のみ・計算に使う術属性・未構造化職分を区別する', () => {
  const find = (operatorId: string, skillIndex = 1) => coverage.find(row => row.skill.operatorId === operatorId && row.skill.skillIndex === skillIndex)!
  assert.equal(find('char_124_kroos').sections.trait, 'NOT_APPLICABLE')
  assert.equal(find('char_180_amgoat').sections.trait, 'SUPPORTED')
  const merchant = sources.find(source => source.subProfessionId === 'merchant')!
  assert.equal(find(merchant.operatorId).sections.trait, 'UNSUPPORTED')
  assert.equal(find('char_271_spikes').sections.trait, 'SUPPORTED')
  assert.equal(find('char_271_spikes', 2).sections.trait, 'NOT_APPLICABLE')
})

test('全225スキルの全登録段階で対応状況と実計算が一致し、停止時に部分数値を残さない', () => {
  let supportedSkills = 0, pendingSkills = 0
  for (const row of coverage) {
    const structure = structures.find(structure => identity(structure.basicInfo) === identity(row.skill))!
    let hasResult = false
    for (const stage of structure.guardRecipe!.stages) {
      const definition = EXPANDED_OPERATOR_DEFINITIONS.find(definition => definition.operatorId === row.skill.operatorId)!
      const inputs = mergeGuardInputs(definition.inputs ?? [], structure.guardRecipe!.inputs)
      const step = inputs.find(item => item.key === stage.when?.input)?.step ?? 1
      const result = calculate(row.skill.operatorId, row.skill.skillIndex, stageConditions(stage, step))
      if (stage.unresolved?.length) {
        assert.ok(result.unsupportedReasons.length, row.skill.id)
        assert.deepEqual(result.rows, [], row.skill.id)
        assert.equal(result.model, null)
      } else {
        assert.deepEqual(result.unsupportedReasons, [], row.skill.id)
        assert.ok(result.rows.length, row.skill.id)
        assert.ok(result.guard)
        hasResult = true
        for (const point of result.rows) assert.ok([
          point.axisValue, point.perAttack, point.allTargetsPerAttack, point.dps ?? 0,
          point.allTargetsDps ?? 0, point.damageOverTimeDps ?? 0,
        ].every(Number.isFinite), row.skill.id)
      }
    }
    assert.equal(hasResult, row.status !== 'PENDING', row.skill.id)
    if (hasResult) supportedSkills += 1
    else pendingSkills += 1
  }
  assert.deepEqual([supportedSkills, pendingSkills], [171, 54])
})

test('昇進1/SL7の11名と昇進2/SL10の99名でidentity・素質を混同しない', () => {
  assert.equal(sources.filter(source => source.phaseIndex === 1 && source.skillLevelIndex === 6).length, 11)
  assert.equal(sources.filter(source => source.phaseIndex === 2 && source.skillLevelIndex === 9).length, 99)
  for (const source of sources) {
    const row = record(source.operatorId, 1)
    const talents = buildExpandedTalentStructures([row])
    assert.equal(talents.length, source.profile.talents!.length, source.operatorName)
    for (const talent of talents) {
      assert.equal(talent.basicInfo.phaseIndex, source.phaseIndex)
      assert.deepEqual(talent.issues, [], source.operatorName)
    }
    const supported = EXPANDED_OPERATOR_DEFINITIONS.find(definition => definition.operatorId === source.operatorId)!.recipes[0]
    if (!supported) continue
    const lower = input(source.operatorId, supported.skillIndex)
    lower.skillLevelIndex -= 1
    blocked(lower, `${source.operatorName} 未確認スキルレベル`)
    const wrongPhase = input(source.operatorId, supported.skillIndex)
    wrongPhase.phaseIndex = 0
    wrongPhase.operatorLevel = 1
    blocked(wrongPhase, `${source.operatorName} 未確認昇進段階`)
  }
})

test('職業・レア度・状態の各絞り込み後も集計の母数は独立snapshotの該当スキル数になる', () => {
  for (const profession of new Set(sources.map(source => source.profession))) {
    for (const rarity of [3, 4, 5, 6]) {
      const filtered = filterDamageCalculatorThreeCoverage(coverage, { ...EMPTY_DAMAGE_THREE_COVERAGE_FILTERS, profession, rarity })
      const expected = sources.filter(source => source.profession === profession && source.rarity === rarity)
        .reduce((sum, source) => sum + source.skills.length, 0)
      const summary = summarizeDamageCalculatorThreeCoverage(filtered)
      assert.equal(summary.count, expected, `${profession} ★${rarity}`)
      for (const section of summary.sections) {
        assert.equal(section.buckets.reduce((sum, bucket) => sum + bucket.count, 0), expected)
        assert.ok(section.buckets.every(bucket => Number.isFinite(bucket.proportion)))
      }
    }
  }
  for (const status of ['SUPPORTED', 'CONDITIONAL', 'PENDING'] as const) {
    const filtered = filterDamageCalculatorThreeCoverage(coverage, { ...EMPTY_DAMAGE_THREE_COVERAGE_FILTERS, status })
    assert.ok(filtered.every(row => row.status === status))
  }
})

test('全対応recipeは数値範囲外・非整数・NaN・不正な選択肢から計算しない', () => {
  for (const definition of EXPANDED_OPERATOR_DEFINITIONS) for (const recipe of definition.recipes) {
    for (const actualAttackTargetCount of [0, 10001, 1.5, Number.NaN, Number.POSITIVE_INFINITY])
      blocked(input(definition.operatorId, recipe.skillIndex, { actualAttackTargetCount }), `${definition.operatorId} 対象数${actualAttackTargetCount}`)
    const inputs = mergeGuardInputs(definition.inputs ?? [], recipe.inputs)
    for (const item of inputs) {
      const invalid: (number | string | boolean)[] = item.kind === 'number' ? [Number.NaN, '1',
        ...(item.min !== undefined ? [item.min - 1] : []), ...(item.max !== undefined ? [item.max + 1] : []),
        ...(item.step === 1 ? [Number(item.defaultValue) + 0.5] : [])]
        : item.kind === 'boolean' ? ['true', 1] : ['__unknown_option__']
      for (const value of invalid) blocked(input(definition.operatorId, recipe.skillIndex, { [item.key]: value }), `${definition.operatorId}/${item.key}=${value}`)
      if (item.kind === 'number') for (const boundary of [item.min, item.max]) {
        if (boundary !== undefined) assert.deepEqual(resolveGuardConditions([item], { [item.key]: boundary }).errors, [])
      }
    }
  }
})

test('3種のHP対象制限は境界の直前・一致・直後でcoverageと同じ可否になる', () => {
  for (const [id, skillIndex, boundary, lessThanAllowed] of [
    ['char_405_absin', 2, 50, true], ['char_145_prove', 2, 80, true], ['char_218_cuttle', 2, 50, false],
  ] as const) {
    for (const delta of [-1, 0, 1]) {
      const result = calculate(id, skillIndex, { targetHpPercent: boundary + delta })
      assert.equal(result.rows.length > 0, lessThanAllowed ? delta < 0 : delta > 0, `${id} ${boundary + delta}%`)
      if (!result.rows.length) assert.ok(result.unsupportedReasons.length)
    }
  }
})

test('同じスキルIDでもOP・番号・職分・職業を変えたレコードを流用しない', () => {
  for (const mutate of [
    (value: DamageCalculatorThreeInput) => { value.skill.operatorId = 'char_999_unreviewed' },
    (value: DamageCalculatorThreeInput) => { value.skill.skillIndex = 2 },
    (value: DamageCalculatorThreeInput) => { value.operator.subProfessionId = 'marksman' },
    (value: DamageCalculatorThreeInput) => { value.operator.profession = 'SNIPER' },
  ]) {
    const value = input('char_180_amgoat', 1)
    mutate(value)
    blocked(value, '異なるOP・スキルidentity')
  }
  const unknown = record('char_210_stward', 1)
  unknown.operatorId = 'char_999_unreviewed'
  assert.equal(buildDamageCalculatorThreeCoverage([unknown])[0].status, 'UNSUPPORTED')
})

test('スキル説明・数値・時間・発動設定の改変は構造を再確認するまで拒否する', () => {
  const mutations: [string, (value: DamageCalculatorThreeInput) => void][] = [
    ['name', value => { value.skill.skillLevels[9].name = '別スキル' }],
    ['rangeId', value => { value.skill.skillLevels[9].rangeId = 'unreviewed' }],
    ['description', value => { value.skill.skillLevels[9].description += '追加ダメージ' }],
    ['blackboard value', value => { value.skill.skillLevels[9].blackboard![0].value! += 0.1 }],
    ['blackboard key', value => { value.skill.skillLevels[9].blackboard![0].key = 'unreviewed' }],
    ['blackboard duplicate', value => { value.skill.skillLevels[9].blackboard!.push(structuredClone(value.skill.skillLevels[9].blackboard![0])) }],
    ['duration', value => { value.skill.skillLevels[9].duration! += 1 }],
    ['durationType', value => { value.skill.skillLevels[9].durationType = 'UNREVIEWED' }],
    ['skillType', value => { value.skill.skillLevels[9].skillType = 'PASSIVE' }],
    ['spType', value => { value.skill.skillLevels[9].spData!.spType = 'INCREASE_WHEN_ATTACK' }],
    ['spCost', value => { value.skill.skillLevels[9].spData!.spCost! += 1 }],
    ['initSp', value => { value.skill.skillLevels[9].spData!.initSp! += 1 }],
    ['maxChargeTime', value => { value.skill.skillLevels[9].spData!.maxChargeTime! += 1 }],
  ]
  for (const [label, mutate] of mutations) {
    const value = input('char_180_amgoat', 1)
    mutate(value)
    blocked(value, `スキル ${label}`)
  }
})

test('特性の説明・係数・識別子・開放条件を変えたsourceから旧倍率を計算しない', () => {
  const mutations: [string, (value: DamageCalculatorThreeInput) => void][] = [
    ['description', value => { value.operator.operatorProfile.traitDescription += '追加効果' }],
    ['blackboard value', value => { value.operator.operatorProfile.trait!.candidates![0].blackboard![0].value = 2 }],
    ['blackboard missing', value => { value.operator.operatorProfile.trait!.candidates![0].blackboard = [] }],
    ['blackboard duplicate', value => { const board = value.operator.operatorProfile.trait!.candidates![0].blackboard!; board.push(structuredClone(board[0])) }],
    ['prefabKey', value => { value.operator.operatorProfile.trait!.candidates![0].prefabKey = 'unreviewed' }],
    ['unlock level', value => { value.operator.operatorProfile.trait!.candidates![0].unlockCondition!.level = 2 }],
  ]
  for (const [label, mutate] of mutations) {
    const value = input('char_440_pinecn', 1, { targetInFrontalTiles: true })
    mutate(value)
    blocked(value, `特性 ${label}`)
  }
})

test('素質の名前・説明・候補identity・未知の数値項目・候補欠落を拒否する', () => {
  const mutations: [string, (value: DamageCalculatorThreeInput) => void][] = [
    ['name', value => { value.operator.operatorProfile.talents![0].candidates!.forEach(candidate => { candidate.name = '異なる素質' }) }],
    ['description', value => { value.operator.operatorProfile.talents![0].candidates!.forEach(candidate => { candidate.description += '追加効果' }) }],
    ['prefabKey', value => { value.operator.operatorProfile.talents![0].candidates!.forEach(candidate => { candidate.prefabKey = 'unreviewed' }) }],
    ['tokenKey', value => { value.operator.operatorProfile.talents![0].candidates!.forEach(candidate => { candidate.tokenKey = 'token_unreviewed' }) }],
    ['unlock level', value => { value.operator.operatorProfile.talents![0].candidates!.forEach(candidate => { candidate.unlockCondition!.level = 2 }) }],
    ['unknown field', value => { value.operator.operatorProfile.talents![0].candidates!.forEach(candidate => { candidate.blackboard!.push({ key: 'damage_scale', value: 2 }) }) }],
    ['missing field', value => { value.operator.operatorProfile.talents![0].candidates!.forEach(candidate => { candidate.blackboard = [] }) }],
    ['duplicate field', value => { value.operator.operatorProfile.talents![0].candidates!.forEach(candidate => { candidate.blackboard!.push(structuredClone(candidate.blackboard![0])) }) }],
    ['nonfinite field', value => { value.operator.operatorProfile.talents![0].candidates!.forEach(candidate => { candidate.blackboard![0].value = Number.NaN }) }],
    ['valueStr', value => { value.operator.operatorProfile.talents![0].candidates!.forEach(candidate => { candidate.blackboard![0].valueStr = 'unreviewed' }) }],
    ['missing talent', value => { value.operator.operatorProfile.talents = [] }],
  ]
  for (const [label, mutate] of mutations) {
    const value = input('char_180_amgoat', 1)
    mutate(value)
    blocked(value, `素質 ${label}`)
  }
})

test('別OPの素質・特性を入れたプロフィールは数値や説明が存在していても拒否する', () => {
  const wrongTalent = input('char_180_amgoat', 1)
  wrongTalent.operator.operatorProfile.talents = structuredClone(sourceMap.get('char_291_aglina')!.profile.talents)
  blocked(wrongTalent, 'エイヤフィヤトラへアンジェリーナの素質を流用')
  const wrongTrait = input('char_440_pinecn', 1, { targetInFrontalTiles: true })
  const donor = sourceMap.get('char_180_amgoat')!.profile
  wrongTrait.operator.operatorProfile.trait = structuredClone(donor.trait)
  wrongTrait.operator.operatorProfile.traitDescription = donor.traitDescription
  blocked(wrongTrait, 'パインコーンへ術師の特性を流用')
})

test('blackboardの順番と説明文の装飾・空白だけの変更は計算結果を変えない', () => {
  const baseline = calculate('char_180_amgoat', 1)
  const value = input('char_180_amgoat', 1)
  const skill = value.skill.skillLevels[9]
  skill.blackboard!.reverse()
  skill.description = `<b> ${skill.description} </b>\n`
  for (const talent of value.operator.operatorProfile.talents!) for (const candidate of talent.candidates!) {
    candidate.blackboard!.reverse()
    candidate.description = `<b> ${candidate.description} </b>\n`
  }
  const result = buildDamageCalculatorThreeOutput(value)
  assert.deepEqual(result.unsupportedReasons, [])
  assert.deepEqual(result.rows, baseline.rows)
})

test('同じ構造の素質係数はliveデータを使い、snapshot値への無言の差し戻しをしない', () => {
  const value = input('char_180_amgoat', 1)
  const candidates = value.operator.operatorProfile.talents![0].candidates!
  const source = candidates.find(candidate => candidate.unlockCondition?.phase === 'PHASE_2' && candidate.requiredPotentialRank === 0)!
  source.blackboard!.find(entry => entry.key === 'atk')!.value = 0.2
  const result = buildDamageCalculatorThreeOutput(value)
  assert.deepEqual(result.unsupportedReasons, [])
  const row = result.rows.find(row => row.axisValue === 0)!
  assert.equal(row.perAttack, Math.floor(result.stats.attack * 1.2 + 1e-9))
  assert.notEqual(row.perAttack, calculate('char_180_amgoat', 1).rows.find(row => row.axisValue === 0)!.perAttack)
})

test('liveデータが欠損していてもcoverageは登録範囲を維持し、実計算だけを停止する', () => {
  const value = input('char_180_amgoat', 1)
  value.operator.operatorProfile.talents = []
  value.operator.operatorProfile.trait = null
  value.operator.operatorProfile.traitDescription = ''
  value.operator.operatorProfile.subProfessionTraitDescription = ''
  blocked(value, '取得失敗')
  const row = buildDamageCalculatorThreeCoverage([value.skill])[0]
  assert.equal(row.status, 'SUPPORTED')
  assert.equal(row.sections.talent, 'SUPPORTED')
  assert.equal(row.sections.trait, 'SUPPORTED')
})
