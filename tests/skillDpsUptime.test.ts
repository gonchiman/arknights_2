import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifySkill } from '../src/lib/classifier.ts'
import { evaluateDamageThreeComparisonEntry, getDamageThreeComparisonEntries } from '../src/lib/damageCalculatorThreeComparison.ts'
import { EXPANDED_OPERATOR_SOURCES } from '../src/lib/expandedCombatRegistry.ts'
import { resolveSkillDpsUptime, type SkillDpsUptimeInput } from '../src/lib/skillDpsUptime.ts'
import type { OperatorCombatProfile, RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

const guards = (JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardSources.json', import.meta.url), 'utf8')) as {
  guards: { id: string; name: string; subProfessionId: string;
    skills: { skillId: string; skillIndex: number; raw: RawSkillLevel }[] }[]
}).guards
const profiles = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardProfiles.json', import.meta.url), 'utf8')) as {
  operatorId: string; operatorProfile: OperatorCombatProfile
}[]

function record(operatorId: string, skillIndex: number): SkillRecord {
  const expanded = EXPANDED_OPERATOR_SOURCES.find(source => source.operatorId === operatorId)
  const guard = guards.find(source => source.id === operatorId)
  const source = (expanded?.skills ?? guard!.skills).find(skill => skill.skillIndex === skillIndex)!
  const raw = structuredClone(source.raw)
  return { id: `${operatorId}/${skillIndex}`, operatorId, operatorName: expanded?.operatorName ?? guard!.name,
    skillId: source.skillId, skillIndex, skillName: raw.name!, profession: expanded?.profession ?? 'WARRIOR',
    professionLabel: expanded?.profession ?? '前衛', rarity: expanded?.rarity ?? 6,
    subProfessionId: expanded?.subProfessionId ?? guard!.subProfessionId,
    subProfessionName: expanded?.subProfessionId ?? guard!.subProfessionId, nameInitial: 'OTHER',
    description: raw.description!, duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
    spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!, classification: classifySkill(raw),
    skillLevels: Array.from({ length: (expanded?.skillLevelIndex ?? 9) + 1 }, () => structuredClone(raw)), raw,
    operatorProfile: structuredClone(expanded?.profile ?? profiles.find(profile => profile.operatorId === operatorId)!.operatorProfile) }
}

function evaluated(operatorId: string, skillIndex: number, stageId?: string): SkillDpsUptimeInput {
  const skill = record(operatorId, skillIndex)
  const entry = getDamageThreeComparisonEntries([skill]).find(entry => entry.kind === 'NORMAL'
    && (stageId === undefined || entry.stageId === stageId))!
  assert.ok(entry, `${operatorId} S${skillIndex} normal stage`)
  const result = evaluateDamageThreeComparisonEntry(entry, { defense: 0, resistance: 0, enemyCount: 1 })
  assert.ok(result.output, `${operatorId} S${skillIndex} evaluated output`)
  return { entry, output: result.output, skill, durationSeconds: result.durationSeconds,
    spCost: entry.structure.activationSettings.spCost }
}

function close(actual: number | null, expected: number) {
  assert.notEqual(actual, null)
  assert.ok(Math.abs(actual! - expected) < 1e-9, `${actual} should equal ${expected}`)
}

test('reviewed timed cycles recharge the whole SP cost, independent of initial SP and DPS/periodTotal', () => {
  const input = evaluated('char_264_f12yin', 3)
  input.skill.initSp = 999
  const result = resolveSkillDpsUptime(input)
  assert.equal(result.reason, null)
  close(result.percentage, 30 / (30 + 40) * 100)
  assert.notEqual(result.percentage, 30 / (30 + 40 - 25) * 100)
  // Blaze S3's ramping DPS/terminal burst prevent a constant-rate period total;
  // they do not prevent the separately reviewed 10-second attack-capable cycle.
  const ramp = evaluated('char_017_huang', 3, 'normal')
  assert.notEqual(ramp.entry.structure.guardRecipe!.stages.find(stage => stage.id === 'normal')!.periodTotal?.kind, 'CONSTANT_RATE')
  close(resolveSkillDpsUptime(ramp).percentage, 10 / (10 + 35) * 100)
})

test('Mudrock S3 includes its non-attacking startup in the full SP lock only', () => {
  const input = evaluated('char_311_mudrok', 3)
  assert.equal(input.durationSeconds, 20)
  assert.equal(input.entry.structure.source.duration, 30)
  const result = resolveSkillDpsUptime(input)
  assert.equal(result.reason, null)
  close(result.percentage, 20 / (10 + 20 + 25) * 100)
  assert.notEqual(result.percentage, 20 / (20 + 25) * 100)
  assert.equal(resolveSkillDpsUptime({ ...input, durationSeconds: 30 }).percentage, null)
})

test('non-natural recovery, permanent, ammunition, forced retreat and self-SP sources never become zero uptime', () => {
  for (const [operatorId, skillIndex] of [
    ['char_140_whitew', 2], ['char_1032_excu2', 2], ['char_017_huang', 2], ['char_1032_excu2', 1],
    ['char_002_amiya', 3], ['char_350_surtr', 3], ['char_002_amiya', 1],
    ['char_134_ifrit', 1], ['char_213_mostma', 1],
  ] as const) {
    const result = resolveSkillDpsUptime(evaluated(operatorId, skillIndex))
    assert.equal(result.percentage, null, `${operatorId} S${skillIndex}`)
    assert.ok(result.reason, `${operatorId} S${skillIndex} exclusion reason`)
  }
  assert.equal(resolveSkillDpsUptime(evaluated('char_140_whitew', 2)).reason, '自然回復以外')
  assert.equal(resolveSkillDpsUptime(evaluated('char_1032_excu2', 2)).reason, '弾薬制の周期未確認')
  assert.equal(resolveSkillDpsUptime(evaluated('char_002_amiya', 3)).reason, '退場後の反復不可')
  assert.equal(resolveSkillDpsUptime(evaluated('char_213_mostma', 1)).reason, '自己SP回復を含む周期未確認')
})

test('a finite NORMAL stage and CONSTANT_RATE tag do not grant unaudited repeatability', () => {
  const input = evaluated('char_4058_pepe', 3)
  const structure = { ...input.entry.structure, guardRecipe: { ...input.entry.structure.guardRecipe!,
    stages: input.entry.structure.guardRecipe!.stages.map(stage => ({ ...stage, periodTotal: { kind: 'CONSTANT_RATE' as const } })) } }
  const result = resolveSkillDpsUptime({ ...input, entry: { ...input.entry, structure }, output: { ...input.output, structure } })
  assert.equal(result.percentage, null)
  assert.equal(result.reason, '反復周期の確認なし')
})

test('source/stage mismatches, unreviewed charges and invalid caller values stay missing', () => {
  const input = evaluated('char_264_f12yin', 3)
  const changed = structuredClone(input.skill)
  changed.skillLevels[input.entry.levelIndex].description += '\n効果時間終了後強制退場'
  assert.equal(resolveSkillDpsUptime({ ...input, skill: changed }).reason, '確認済みソース不一致')
  const changedDurationType = structuredClone(input.skill)
  changedDurationType.skillLevels[input.entry.levelIndex].durationType = 'UNREVIEWED'
  assert.equal(resolveSkillDpsUptime({ ...input, skill: changedDurationType }).reason, '確認済みソース不一致')
  assert.equal(resolveSkillDpsUptime({ ...input, output: { ...input.output, activeStageLabel: '別の段階' } }).reason, '選択段階不一致')
  assert.equal(resolveSkillDpsUptime({ ...input, entry: { ...input.entry, stageId: 'unknown' } }).percentage, null)
  assert.equal(resolveSkillDpsUptime({ ...input, durationSeconds: 29 }).reason, 'スキル拘束時間未確認')
  assert.equal(resolveSkillDpsUptime({ ...input, spCost: 39 }).reason, 'スキル拘束時間未確認')
  for (const value of [null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(resolveSkillDpsUptime({ ...input, durationSeconds: value }).percentage, null)
    assert.equal(resolveSkillDpsUptime({ ...input, spCost: value }).percentage, null)
  }
  const charged = structuredClone(input.skill)
  charged.skillLevels[input.entry.levelIndex].spData!.maxChargeTime = 2
  const structure = { ...input.entry.structure, activationSettings: { ...input.entry.structure.activationSettings, maxCharges: 2 } }
  assert.equal(resolveSkillDpsUptime({ ...input, skill: charged,
    entry: { ...input.entry, structure }, output: { ...input.output, structure } }).reason, 'チャージ周期未確認')
})

test('reviewed coverage includes guard, ranged/caster, low-rarity and initial-only SP talents', () => {
  const examples = [
    ['char_350_surtr', 2], ['char_4082_qiubai', 3], ['char_485_pallas', 2], ['char_1026_gvial2', 2],
    ['char_188_helage', 3], ['char_4064_mlynar', 2], ['char_208_melan', 1], ['char_2014_nian', 3],
    ['char_163_hpsts', 2], ['char_4087_ines', 2], ['char_271_spikes', 2], ['char_274_astesi', 2],
    ['char_355_ethan', 2], ['char_222_bpipe', 3], ['char_103_angel', 3], ['char_197_poca', 2],
    ['char_180_amgoat', 3], ['char_2013_cerber', 2], ['char_306_leizi', 2], ['char_1011_lava2', 1],
    ['char_2015_dusk', 2], ['char_4004_pudd', 2], ['char_472_pasngr', 2], ['char_141_nights', 2],
    ['char_328_cammou', 2], ['char_377_gdglow', 3],
  ] as const
  for (const [operatorId, skillIndex] of examples) {
    const input = evaluated(operatorId, skillIndex)
    const result = resolveSkillDpsUptime(input)
    assert.equal(result.reason, null, `${operatorId} S${skillIndex}: ${result.reason}`)
    close(result.percentage, input.durationSeconds! / (input.entry.structure.source.duration + input.spCost!) * 100)
  }
})
