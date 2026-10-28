import test from 'node:test'
import assert from 'node:assert/strict'
import sourcesJson from '../src/data/expandedMeleeSources.json' with { type: 'json' }
import { EXPANDED_MELEE_DEFINITIONS } from '../src/lib/expandedMeleeDefinitions.ts'
import { buildDamageCalculatorThreeOutput } from '../src/lib/damageCalculatorThree.ts'
import { classifySkill } from '../src/lib/classifier.ts'
import type { ExpandedOperatorSource } from '../src/lib/expandedCombatTypes.ts'
import type { GuardConditions } from '../src/lib/guardCombatTypes.ts'
import type { SkillRecord } from '../src/types/skill.ts'

const sources = sourcesJson as unknown as ExpandedOperatorSource[]
function record(suffix: string, skillIndex: number): SkillRecord {
  const source = sources.find(source => source.operatorId.endsWith(`_${suffix}`))!
  const entry = source.skills.find(skill => skill.skillIndex === skillIndex)!, raw = structuredClone(entry.raw)
  return { id: `${source.operatorId}/${skillIndex}`, operatorId: source.operatorId, operatorName: source.operatorName,
    skillId: entry.skillId, skillIndex, skillName: raw.name!, profession: source.profession, professionLabel: source.profession,
    rarity: source.rarity, subProfessionId: source.subProfessionId, subProfessionName: source.subProfessionId,
    nameInitial: 'OTHER', description: raw.description!, duration: raw.duration!, durationType: raw.durationType!,
    skillType: raw.skillType!, spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!,
    classification: classifySkill(raw), skillLevels: Array.from({ length: source.skillLevelIndex + 1 }, () => structuredClone(raw)),
    raw, operatorProfile: structuredClone(source.profile) }
}
function output(suffix: string, skillIndex: number, guard: GuardConditions = {}) {
  return outputRecord(record(suffix, skillIndex), guard)
}
function outputRecord(skill: SkillRecord, guard: GuardConditions = {}) {
  const source = sources.find(source => source.operatorId === skill.operatorId)!
  return buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: source.phaseIndex,
    operatorLevel: source.profile.phases[source.phaseIndex].maxLevel!, trust: 100,
    skillLevelIndex: source.skillLevelIndex, conditions: { guard } })
}
function at(suffix: string, skillIndex: number, axis = 0, conditions: GuardConditions = {}) {
  const result = output(suffix, skillIndex, conditions)
  assert.deepEqual(result.unsupportedReasons, [], `${suffix} S${skillIndex}`)
  const row = result.rows.find(row => row.axisValue === axis)!
  assert.ok(row, `${suffix} S${skillIndex} axis ${axis}`)
  return { result, row }
}
function close(actual: number | null, expected: number) {
  assert.ok(actual !== null && Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`)
}
const buffed = (attack: number, ratio: number) => Math.floor(attack * (1 + ratio) + 1e-9)
const physical = (attack: number, defense: number) => Math.max(attack - defense, attack * 0.05)

test('近接追加51人の79技能が実データから有限結果を返し、残り22技能は理由付き保留', () => {
  assert.equal(sources.length, 51)
  assert.equal(EXPANDED_MELEE_DEFINITIONS.reduce((sum, definition) => sum + definition.recipes.length, 0), 79)
  for (const definition of EXPANDED_MELEE_DEFINITIONS) {
    const source = sources.find(source => source.operatorId === definition.operatorId)!
    assert.equal(definition.recipes.length + (definition.deferredSkills?.length ?? 0), source.skills.length)
    for (const recipe of definition.recipes) {
      const result = output(definition.operatorId.split('_').at(-1)!, recipe.skillIndex)
      assert.deepEqual(result.unsupportedReasons, [], `${source.operatorName} S${recipe.skillIndex}`)
      assert.ok(result.rows.length > 0)
      for (const row of result.rows) assert.ok([row.perAttack, row.allTargetsPerAttack, row.dps ?? 0].every(Number.isFinite))
    }
    for (const deferred of definition.deferredSkills ?? []) assert.ok(deferred.reason.length > 0)
  }
})

test('星3は昇進1・SL7で素質とスキルのATKを加算する', () => {
  for (const [id, ratio] of [['melan', 0.58], ['popka', 0.56], ['wyvern', 0.43], ['falco', 0.33]] as const) {
    const { result, row } = at(id, 1)
    close(row.perAttack, buffed(result.stats.attack, ratio))
  }
  const plume = at('falco', 1)
  close(plume.result.attackInterval, plume.result.stats.baseAttackTime / 1.25)
  assert.ok(output('popka', 1, { actualAttackTargetCount: 3 }).unsupportedReasons.length)
})

test('ミッドナイトの術変換・遠距離倍率・20%会心を一度ずつ適用する', () => {
  const { result, row } = at('midn', 1, 60, { attackDistanceType: 'RANGED' })
  close(row.perAttack, buffed(result.stats.attack, 0.35) * 0.8 * (0.8 + 0.2 * 1.5) * 0.4)
})

test('カッターS1は4投を敵数で配分し、S2は飛行2倍を防御軽減前に適用する', () => {
  const first = at('cutter', 1, 1000, { actualAttackTargetCount: 4 })
  close(first.row.perAttack, physical(first.result.stats.attack * 3.4, 1000))
  close(first.row.allTargetsPerAttack, first.row.perAttack * 4)
  assert.equal(first.row.dps, null)
  const second = at('cutter', 2, 1000, { targetAirborne: true, actualAttackTargetCount: 6 })
  close(second.row.perAttack, physical(second.result.stats.attack * 9, 1000))
  close(second.row.allTargetsPerAttack, second.row.perAttack * 6)
})

test('アレーンはS1遠距離減衰・2連撃、S2減衰なし・2対象に分ける', () => {
  const first = at('spikes', 1, 1000, { targetDrone: true })
  close(first.row.perAttack, physical(first.result.stats.attack * 1.5 * 0.8 * 1.4, 1000) * 2)
  const second = at('spikes', 2, 60, { targetDrone: true, actualAttackTargetCount: 2 })
  close(second.row.perAttack, second.result.stats.attack * 1.6 * 1.4 * 0.4)
  close(second.row.allTargetsPerAttack, second.row.perAttack * 2)
})

test('ドーベルマンは星3向け素質を自己に加算せず、教官特性のみ乗算する', () => {
  const free = at('doberm', 2, 1000), blocked = at('doberm', 2, 1000, { targetBlockedBySelf: true })
  const attack = buffed(free.result.stats.attack, 0.8)
  close(free.row.perAttack, physical(attack * 1.2, 1000))
  close(blocked.row.perAttack, physical(attack, 1000))
})

test('不屈・累積ASPD・勇猛HP境界を指定条件で反映する', () => {
  for (const id of ['utage', 'akafyu']) {
    const low = at(id, 2, 0, { selfHpPercent: 30 }), full = at(id, 2, 0, { selfHpPercent: 100 })
    close(low.result.attackInterval, low.result.stats.baseAttackTime / 2)
    close(full.result.attackInterval, full.result.stats.baseAttackTime)
  }
  const astesia = at('astesi', 2, 0, { talentStacks: 5, actualAttackTargetCount: 2 })
  close(astesia.result.attackInterval, astesia.result.stats.baseAttackTime / 1.25)
  for (const [selfHpPercent, ratio] of [[49.9, 0], [50, 0.45], [79.9, 0.45], [80, 0.9]]) {
    const { result, row } = at('humus', 2, 0, { selfHpPercent })
    close(row.perAttack, buffed(result.stats.attack, ratio))
  }
})

test('ラ・プルマの低HP増加は50%未満、ハイモアの統合戦略ASPDは条件付き', () => {
  const low = at('crow', 2, 0, { targetHpPercent: 49.9, killStacks: 12 })
  const half = at('crow', 2, 0, { targetHpPercent: 50 })
  close(low.row.perAttack, buffed(low.result.stats.attack, 1.2))
  close(half.row.perAttack, buffed(half.result.stats.attack, 0.7))
  close(low.result.attackInterval, (low.result.stats.baseAttackTime - 0.5) / 1.36)
  const highmore = at('highmo', 2, 0, { mizukiMode: true })
  close(highmore.result.attackInterval, highmore.result.stats.baseAttackTime / 1.25)
})

test('フリントS2のブロック0は素質を必ず有効化し、インドラは回避後ATKを加算する', () => {
  const flint = at('flint', 2, 1000, { targetBlockedBySelf: true })
  close(flint.row.perAttack, physical(buffed(flint.result.stats.attack, 0.55), 1000) * 1.4)
  const indra = at('tiger', 1, 1000, { dodgeAttackReady: true })
  close(indra.row.perAttack, physical(buffed(indra.result.stats.attack, 2.4), 400))
})

test('テキサス2連術・シージATK素質・リード追加術を別軽減で計算する', () => {
  const texas = at('texas', 2, 60, { actualAttackTargetCount: 5 })
  close(texas.row.perAttack, texas.result.stats.attack * 1.7 * 2 * 0.4)
  close(texas.row.allTargetsPerAttack, texas.row.perAttack * 5)
  const siege = at('siege', 3, 1000)
  close(siege.row.perAttack, physical(buffed(siege.result.stats.attack, 0.08) * 3.8, 1000))
  close(siege.result.attackInterval, siege.result.stats.baseAttackTime + 1)
  const reed = at('sddrag', 2, 1000, { enemyResistance: 60 })
  const attack = buffed(reed.result.stats.attack, 0.8)
  close(reed.row.perAttack, physical(attack, 1000) + attack * 0.35 * 0.4)
})

test('カンタービレは未ブロックASPDとブロックATKを排他的に反映する', () => {
  const free = at('ctable', 2), blocked = at('ctable', 2, 0, { selfBlocking: true })
  close(free.row.perAttack, buffed(free.result.stats.attack, 0.4))
  close(free.result.attackInterval, free.result.stats.baseAttackTime / 1.62)
  close(blocked.row.perAttack, buffed(blocked.result.stats.attack, 0.52))
  close(blocked.result.attackInterval, blocked.result.stats.baseAttackTime / 1.5)
})

test('重装のスキル術変換・多対象化・間隔増減を重複なく反映する', () => {
  const durnar = at('durnar', 2, 60, { actualAttackTargetCount: 3 })
  close(durnar.row.perAttack, buffed(durnar.result.stats.attack, 0.87) * 0.4)
  const mudrock = at('mudrok', 3, 1000, { actualAttackTargetCount: 3 })
  close(mudrock.row.perAttack, physical(buffed(mudrock.result.stats.attack, 1.4), 1000))
  close(mudrock.result.attackInterval, mudrock.result.stats.baseAttackTime - 0.3)
  const liskarm = at('liskam', 2, 60, { actualAttackTargetCount: 4 })
  close(liskarm.row.perAttack, buffed(liskarm.result.stats.attack, 2) * 0.4)
  close(liskarm.result.attackInterval, liskarm.result.stats.baseAttackTime + 0.7)
  assert.ok(output('hpsts', 2, { actualAttackTargetCount: 3 }).unsupportedReasons.length)
})

test('特殊の確定ダメージ・感染生物倍率・確率会心を別々に扱う', () => {
  const cliff = at('slchan', 2, 0, { selfBlocking: false, actualAttackTargetCount: 3 })
  close(cliff.row.perAttack, buffed(cliff.result.stats.attack, 0.12) * 2)
  close(cliff.row.allTargetsPerAttack, cliff.row.perAttack * 3)
  const jaye = at('strong', 2, 1000, { targetInfectedCreature: true })
  close(jaye.row.perAttack, physical(buffed(jaye.result.stats.attack, 0.6) * 1.45, 1000))
  const waai = at('waaifu', 1, 1000), attack = buffed(waai.result.stats.attack, 0.7)
  close(waai.row.perAttack, physical(attack, 1000) * 0.8 + physical(attack * 1.5, 1000) * 0.2)
})

test('特性・技能・素質のliveデータが欠落または変更された場合にsnapshotで補完しない', () => {
  const mutations: ((skill: SkillRecord) => void)[] = [
    skill => { skill.operatorProfile.traitDescription += '攻撃時に追加の確定ダメージを与える' },
    skill => { skill.operatorProfile.talents = [] },
    skill => { skill.skillLevels[6].blackboard![0].value = 99 },
    skill => { skill.skillLevels[6].description += '追加の確定ダメージを与える' },
    skill => {
      for (const talent of skill.operatorProfile.talents ?? []) for (const candidate of talent.candidates ?? []) {
        candidate.description += '攻撃時に追加の確定ダメージを与える'
      }
    },
    skill => {
      for (const talent of skill.operatorProfile.talents ?? []) for (const candidate of talent.candidates ?? []) {
        candidate.blackboard = []
      }
    },
  ]
  for (const mutate of mutations) {
    const skill = record('melan', 1)
    mutate(skill)
    const result = outputRecord(skill)
    assert.ok(result.unsupportedReasons.length > 0)
    assert.deepEqual(result.rows, [])
  }
})

test('会心キー重複や条件上限を越える値は結果を出さず、低レアも未確認昇進を拒否する', () => {
  const skill = record('midn', 1)
  for (const talent of skill.operatorProfile.talents ?? []) for (const candidate of talent.candidates ?? []) {
    const entry = candidate.blackboard?.find(entry => entry.key === 'prob')
    if (entry) candidate.blackboard!.push({ ...entry })
  }
  assert.deepEqual(outputRecord(skill).rows, [])
  for (const [suffix, index, condition] of [
    ['astesi', 2, { talentStacks: 6 }], ['broca', 2, { blockedEnemyCount: 4 }],
    ['crow', 2, { killStacks: 13 }], ['utage', 2, { selfHpPercent: -1 }],
    ['ctable', 2, { selfBlocking: 'true' }], ['highmo', 2, { mizukiMode: 'true' }],
  ] as const) {
    const result = output(suffix, index, condition)
    assert.ok(result.unsupportedReasons.length > 0)
    assert.deepEqual(result.rows, [])
  }
  const melon = record('melan', 1)
  const result = buildDamageCalculatorThreeOutput({ operator: melon, skill: melon, phaseIndex: 0,
    operatorLevel: 30, trust: 100, skillLevelIndex: 6 })
  assert.ok(result.unsupportedReasons.length > 0)
  assert.deepEqual(result.rows, [])
})
