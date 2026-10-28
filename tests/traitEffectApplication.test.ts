import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifySkill } from '../src/lib/classifier.ts'
import { buildDamageCalculatorThreeOutput, type DamageCalculatorThreeInput } from '../src/lib/damageCalculatorThree.ts'
import { buildTraitApplicationRows } from '../src/lib/traitEffectApplication.ts'
import type { OperatorCombatProfile, RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'))
const traits = fixture('traitStructureGuardJobs').rows as SkillRecord[]
const guards = fixture('sixStarGuardSources').guards as { id: string; skills: { skillId: string; skillIndex: number; raw: RawSkillLevel }[] }[]
const guardProfiles = fixture('sixStarGuardProfiles') as { operatorId: string; operatorProfile: OperatorCombatProfile }[]
const legacy = fixture('skillStructureFourOperators') as { operatorId: string; skills: (RawSkillLevel & { skillId: string; skillIndex: number })[] }[]
const legacyProfiles = fixture('talentStructureFourOperators') as { operatorId: string; operatorProfile: OperatorCombatProfile }[]
const irene = fixture('ireneS1')
const ireneMore = fixture('ireneS2S3')

function record(id: string, index: number): SkillRecord {
  const trait = structuredClone(traits.find(row => row.operatorId === id)!)
  const guard = guards.find(row => row.id === id)?.skills.find(skill => skill.skillIndex === index)
  const old = legacy.find(row => row.operatorId === id)?.skills.find(skill => skill.skillIndex === index)
  const ireneSkill = id === 'char_4009_irene' ? index === 1 ? irene.skill : ireneMore.skills.find((skill: { skillIndex: number }) => skill.skillIndex === index) : null
  const raw: RawSkillLevel = structuredClone(guard?.raw ?? old ?? ireneSkill?.levels[9])
  const skillId = guard?.skillId ?? old?.skillId ?? ireneSkill.skillId
  const profile = structuredClone(guardProfiles.find(row => row.operatorId === id)?.operatorProfile
    ?? legacyProfiles.find(row => row.operatorId === id)?.operatorProfile ?? irene.operatorProfile) as OperatorCombatProfile
  profile.trait = trait.operatorProfile.trait
  profile.traitDescription = trait.operatorProfile.traitDescription
  // The trait fixture preserves live block/range data; legacy fixtures focus on
  // passives, so give those records finite, deliberately neutral attack stats.
  profile.phases = profile.phases.map((phase, phaseIndex) => ({ ...phase,
    rangeId: trait.operatorProfile.phases[phaseIndex]?.rangeId,
    attributesKeyFrames: (phase.attributesKeyFrames ?? trait.operatorProfile.phases[phaseIndex].attributesKeyFrames)!.map(frame => ({ ...frame,
      data: { atk: 600, attackSpeed: 100, baseAttackTime: 1.3, ...frame.data,
        blockCnt: trait.operatorProfile.phases[phaseIndex].attributesKeyFrames![0].data!.blockCnt } })) }))
  return { ...trait, id: `${id}/${index}`, skillId, skillIndex: index, skillName: raw.name!,
    nameInitial: 'OTHER', description: raw.description!, duration: raw.duration!, durationType: raw.durationType!,
    skillType: raw.skillType!, spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!,
    raw, classification: classifySkill(raw), skillLevels: Array.from({ length: 10 }, () => structuredClone(raw)), operatorProfile: profile }
}
function run(id: string, index: number, conditions: DamageCalculatorThreeInput['conditions'] = {}) {
  const skill = record(id, index)
  const input: DamageCalculatorThreeInput = { operator: skill, skill, phaseIndex: 2,
    operatorLevel: skill.operatorProfile.phases[2].maxLevel!, trust: 100, skillLevelIndex: 9, conditions }
  const output = buildDamageCalculatorThreeOutput(input)
  const before = structuredClone(output)
  const rows = buildTraitApplicationRows(input, output)
  assert.deepEqual(output, before, '表示行を作る際に計算結果を変更しない')
  return { input, output, rows }
}
const item = (result: ReturnType<typeof run>, suffix: string) => {
  const row = result.rows.find(row => row.id.endsWith(suffix))
  assert.ok(row, suffix)
  return row
}

test('スルトの術属性は実際の攻撃種別と照合し、計算を変更しない', () => {
  const result = run('char_350_surtr', 2)
  assert.deepEqual(result.output.unsupportedReasons, [])
  assert.equal(item(result, 'normal-attack-damage-type').status, 'APPLIED')
  assert.equal(item(result, 'normal-attack-damage-type').value, '術')
  assert.ok(result.rows.every(row => row.category === 'TRAIT'))
})

test('領主の近接・遠距離・減衰無効化・反撃を区別する', () => {
  assert.equal(item(run('char_293_thorns', 1), 'ranged-attack-scale').status, 'CONDITION_FALSE')
  assert.equal(item(run('char_293_thorns', 1, { attackDistanceType: 'RANGED' }), 'ranged-attack-scale').status, 'APPLIED')
  assert.equal(item(run('char_293_thorns', 3, { attackDistanceType: 'RANGED' }), 'ranged-attack-scale').status, 'NOT_RELEVANT')
  assert.equal(item(run('char_293_thorns', 2), 'ranged-attack-scale').status, 'APPLIED')
  assert.equal(item(run('char_4082_qiubai', 2, { guard: { attackDistanceType: 'RANGED' } }), 'ranged-attack-scale').status, 'APPLIED')
  assert.equal(item(run('char_4082_qiubai', 3, { guard: { attackDistanceType: 'RANGED' } }), 'ranged-attack-scale').status, 'NOT_RELEVANT')
})

test('アイリーニとチェンの攻撃列に通常攻撃2ヒットを追加適用しない', () => {
  for (const index of [1, 2, 3]) {
    const result = run('char_4009_irene', index)
    assert.deepEqual(result.output.unsupportedReasons, [])
    assert.equal(item(result, 'normal-attack-hit-count').status, 'NOT_RELEVANT')
  }
  assert.equal(item(run('char_010_chen', 1), 'normal-attack-hit-count').status, 'NOT_RELEVANT')
  assert.equal(item(run('char_010_chen', 2), 'normal-attack-hit-count').status, 'NOT_RELEVANT')
  assert.equal(item(run('char_4116_blkkgt', 1, { guard: { targetTrembling: true } }), 'normal-attack-hit-count').status, 'APPLIED')
})

test('教官のブロック条件、対象数上限、スキルによる対象選択の上書きを示す', () => {
  assert.equal(item(run('char_485_pallas', 1), 'unblocked-by-source-scale').status, 'APPLIED')
  assert.equal(item(run('char_485_pallas', 1, { guard: { targetBlockedBySelf: true } }), 'unblocked-by-source-scale').status, 'CONDITION_FALSE')
  assert.equal(item(run('char_017_huang', 2), 'block-count-target-limit').value, '3体')
  assert.equal(item(run('char_1026_gvial2', 3), 'block-count-target-limit').value, '5体')
  assert.equal(item(run('char_017_huang', 3), 'block-count-target-limit').status, 'NOT_RELEVANT')
  assert.equal(item(run('char_017_huang', 3, { guard: { phase: 'end' } }), 'block-count-target-limit').status, 'NOT_RELEVANT')
})

test('破壊者の周囲ダメージは実際の周囲対象成分を根拠にする', () => {
  assert.equal(item(run('char_4058_pepe', 2), 'surrounding-splash').status, 'CONDITION_FALSE')
  const result = run('char_4058_pepe', 2, { guard: { actualAttackTargetCount: 3 } })
  assert.deepEqual(result.output.unsupportedReasons, [])
  assert.equal(item(result, 'surrounding-splash').status, 'APPLIED')
})

test('鎌撃士の範囲物理攻撃と、計算対象外の回復を分離する', () => {
  const result = run('char_1032_excu2', 1)
  assert.equal(item(result, 'normal-attack-damage-type').status, 'APPLIED')
  assert.equal(item(result, 'area-attack-targets').status, 'APPLIED')
  assert.equal(item(result, 'attack-heal').status, 'NOT_RELEVANT')
  assert.equal(item(result, 'ally-healing-restriction').status, 'NOT_RELEVANT')
})

test('解放者は固定蓄積量の適用と未確認の増加曲線を混同しない', () => {
  const result = run('char_4064_mlynar', 1, { guard: { traitChargePercent: 50 } })
  const fixed = item(result, 'idle-attack-charge')
  assert.equal(fixed.status, 'APPLIED')
  assert.equal(fixed.value, '＋100％')
  assert.equal(item(result, 'idle-attack-charge:progression').status, 'UNVERIFIED')
  assert.equal(item(result, 'reset-attack-charge').status, 'NOT_RELEVANT')
})

test('入力エラー・未確認データから適用済みを作らない', () => {
  const invalid = run('char_350_surtr', 2, { actualAttackTargetCount: -1 })
  assert.ok(invalid.output.unsupportedReasons.length)
  assert.equal(item(invalid, 'normal-attack-damage-type').status, 'UNSUPPORTED')
  const result = run('char_350_surtr', 2)
  const changed = structuredClone(result.input)
  changed.operator.operatorProfile.traitDescription = '未確認の追加挙動'
  changed.operator.operatorProfile.trait = { candidates: [] }
  const rows = buildTraitApplicationRows(changed, result.output)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].status, 'UNVERIFIED')
})

test('DC3の30人90スキルで特性行を取得し、計算保留時に適用済みを表示しない', () => {
  const ids = [...guards.map(operator => operator.id), ...legacy.map(operator => operator.operatorId), 'char_4009_irene']
  assert.equal(new Set(ids).size, 30)
  for (const id of ids) for (const index of [1, 2, 3]) {
    const result = run(id, index)
    assert.ok(result.rows.length, `${id} S${index}`)
    assert.equal(new Set(result.rows.map(row => row.id)).size, result.rows.length)
    if (!result.output.rows.length) assert.ok(result.rows.every(row => row.status !== 'APPLIED'), `${id} S${index}`)
  }
})
