import test from 'node:test'
import assert from 'node:assert/strict'
import sourcesJson from '../src/data/expandedMeleeSources.json' with { type: 'json' }
import { EXPANDED_MELEE_DEFINITIONS } from '../src/lib/expandedMeleeDefinitions.ts'
import { buildDamageCalculatorThreeOutput } from '../src/lib/damageCalculatorThree.ts'
import { getDamageThreeComparisonEntries, evaluateDamageThreeComparisonEntry } from '../src/lib/damageCalculatorThreeComparison.ts'
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

test('近接追加66人の102技能が実データから有限結果を返し、残り29技能は理由付き保留', () => {
  assert.equal(sources.length, 66)
  assert.equal(EXPANDED_MELEE_DEFINITIONS.reduce((sum, definition) => sum + definition.recipes.length, 0), 102)
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

test('スネグーラチカは配置後未被弾時だけ速度10を加算し、S1の280%を1回に適用する', () => {
  const fresh = at('wintim', 2), damaged = at('wintim', 2, 0, { hasTakenDamage: true })
  close(fresh.result.attackInterval, fresh.result.stats.baseAttackTime / 1.5)
  close(damaged.result.attackInterval, damaged.result.stats.baseAttackTime / 1.4)
  const first = at('wintim', 1, 1000)
  close(first.row.perAttack, physical(first.result.stats.attack * 2.8, 1000))
  assert.equal(first.row.dps, null)
})

test('フロストリーフは素質の0.15秒を速度補正前に足し、遠距離80%を一度だけ適用する', () => {
  const ranged = at('frostl', 2, 500, { attackDistanceType: 'RANGED' })
  close(ranged.result.attackInterval, (ranged.result.stats.baseAttackTime + 0.15) / 1.5)
  close(ranged.row.perAttack, physical(ranged.result.stats.attack * 0.8, 500))
  const melee = at('frostl', 1, 500), first = at('frostl', 1, 500, { attackDistanceType: 'RANGED' })
  close(melee.row.perAttack, physical(melee.result.stats.attack * 1.5, 500))
  close(first.row.perAttack, physical(first.result.stats.attack * 1.5 * 0.8, 500))
})

test('ヴィグナの30%発動は攻撃力加算枠を分岐し、防御軽減後に期待値を求める', () => {
  for (const [index, ratio] of [[1, 0.8], [2, 2]] as const) {
    const { result, row } = at('vigna', index, 1000)
    const ordinary = buffed(result.stats.attack, ratio), proc = buffed(result.stats.attack, ratio + 1)
    close(row.perAttack, physical(ordinary, 1000) * 0.7 + physical(proc, 1000) * 0.3)
    close(result.attackInterval, result.stats.baseAttackTime + (index === 2 ? 0.5 : 0))
    assert.ok(result.hasProbabilisticDamage)
  }
})

test('ムースS2の素質は20%の追加術攻撃で、未確定のS1では部分結果を出さない', () => {
  const { result, row } = at('frncat', 2, 60)
  close(row.perAttack, buffed(result.stats.attack, 0.75) * 0.4 * 1.2)
  const pending = output('frncat', 1)
  assert.deepEqual(pending.rows, [])
  assert.ok(pending.unsupportedReasons.some(reason => reason.includes('2撃目')))
})

test('コンビクションはS1の200%と800%を別軽減し、S2は成功率50%を反映する', () => {
  const first = at('peacok', 1, 1000)
  close(first.row.perAttack, physical(first.result.stats.attack * 2, 1000) * 0.95
    + physical(first.result.stats.attack * 8, 1000) * 0.05)
  assert.equal(first.row.dps, null)
  const second = at('peacok', 2, 60, { actualAttackTargetCount: 3 })
  close(second.row.perAttack, second.result.stats.attack * 3.5 * 0.4 * 0.5)
  close(second.row.allTargetsPerAttack, second.row.perAttack * 3)
  assert.equal(second.row.dps, null)
})

test('歴陣鋭槍フェンの2連撃と2体攻撃を区別し、ブライオファイタの教官特性を適用する', () => {
  const first = at('fang2', 1, 1000)
  close(first.row.perAttack, physical(first.result.stats.attack * 1.8, 1000) * 2)
  const second = at('fang2', 2, 1000, { actualAttackTargetCount: 2 })
  close(second.row.perAttack, physical(buffed(second.result.stats.attack, 1.2), 1000))
  close(second.row.allTargetsPerAttack, second.row.perAttack * 2)
  assert.deepEqual(output('fang2', 2, { actualAttackTargetCount: 3 }).rows, [])
  const free = at('bryota', 2, 1000), blocked = at('bryota', 2, 1000, { targetBlockedBySelf: true })
  close(free.row.perAttack, physical(buffed(free.result.stats.attack, 0.8) * 1.2, 1000))
  close(blocked.row.perAttack, physical(buffed(blocked.result.stats.attack, 0.8), 1000))
})

test('ケストレルS2は素質発動率を20%から50%へ上げ、攻撃力と速度を一度ずつ反映する', () => {
  const { result, row } = at('rfalcn', 2, 1000)
  const attack = buffed(result.stats.attack, 0.4)
  close(row.perAttack, physical(attack, 1000) * 0.5 + physical(attack * 1.4, 1000) * 0.5)
  close(result.attackInterval, result.stats.baseAttackTime / 1.4)
})

test('ポンシラスS2は初回15秒と2回目以降の永続を別段階で登録する', () => {
  const first = at('buildr', 2), permanent = at('buildr', 2, 0, { skillActivationCount: 2 })
  assert.equal(first.result.activeStageLabel, '初回')
  assert.equal(first.result.model?.duration, 15)
  assert.equal(permanent.result.activeStageLabel, '2回目以降')
  assert.equal(permanent.result.model?.duration, 0)
  close(first.row.perAttack, buffed(first.result.stats.attack, 0.35))
  close(permanent.row.perAttack, first.row.perAttack)
  assert.deepEqual(output('buildr', 2, { skillActivationCount: 0 }).rows, [])
})

test('ルトナダとジャッキーの強化攻撃倍率、回避後速度条件を保持する', () => {
  const luton = at('luton', 1, 1000), jackie = at('jaksel', 1, 1000, { dodgeSpeedActive: true })
  close(luton.row.perAttack, physical(luton.result.stats.attack * 2.3, 1000))
  close(jackie.row.perAttack, physical(jackie.result.stats.attack * 2.5, 1000))
  close(jackie.result.attackSpeed, jackie.result.stats.attackSpeed + 12)
  assert.equal(jackie.row.dps, null)
  assert.deepEqual(output('luton', 2).rows, [])
  assert.deepEqual(output('jaksel', 2).rows, [])
})

test('イーサンは全対象への物理攻撃と付与中の毎秒100術ダメージを分離する', () => {
  const { result, row } = at('ethan', 1, 500, { actualAttackTargetCount: 4, enemyResistance: 60 })
  close(row.perAttack, physical(result.stats.attack, 500))
  close(row.allTargetsPerAttack, row.perAttack * 4)
  close(row.damageOverTimeDps, 40)
  close(row.combinedDps, row.perAttack / result.attackInterval! + 40)
  close(row.allTargetsCombinedDps, row.combinedDps! * 4)
  const absent = at('ethan', 1, 500, { poisonActive: false, enemyResistance: 60 })
  close(absent.row.damageOverTimeDps, 0)
  const second = at('ethan', 2, 500, { actualAttackTargetCount: 5 })
  close(second.row.perAttack, physical(buffed(second.result.stats.attack, 0.7), 500))
  close(second.row.allTargetsPerAttack, second.row.perAttack * 5)
})

test('追加オペレーターの素質値欠落・未確認入力・技能データ変更でも停止する', () => {
  const frost = record('frostl', 2)
  for (const talent of frost.operatorProfile.talents ?? []) for (const candidate of talent.candidates ?? []) {
    candidate.blackboard = []
  }
  assert.deepEqual(outputRecord(frost).rows, [])
  for (const [suffix, index, inputs] of [
    ['wintim', 2, { hasTakenDamage: 'false' }], ['jaksel', 1, { dodgeSpeedActive: 1 }],
    ['ethan', 1, { poisonActive: 'true' }], ['frostl', 2, { attackDistanceType: 'UNKNOWN' }],
  ] as const) assert.deepEqual(output(suffix, index, inputs).rows, [])
  const altered = record('peacok', 1)
  altered.skillLevels[9].blackboard!.find(entry => entry.key === 'peacok_s_1[crit].prob')!.value = 0.8
  assert.deepEqual(outputRecord(altered).rows, [])
})

test('エンカクは強撃220%と永続ATK70%・速度45、サーファーは配置後ATK100%を反映する', () => {
  const first = at('flameb', 1, 1000), permanent = at('flameb', 2, 1000), surfer = at('surfer', 1, 1000)
  close(first.row.perAttack, physical(first.result.stats.attack * 2.2, 1000))
  close(permanent.row.perAttack, physical(buffed(permanent.result.stats.attack, 0.7), 1000))
  close(permanent.result.attackInterval, permanent.result.stats.baseAttackTime / 1.45)
  assert.equal(permanent.result.model?.duration, 0)
  close(surfer.row.perAttack, physical(buffed(surfer.result.stats.attack, 1), 1000))
  assert.deepEqual(output('surfer', 2).rows, [])
})

test('ウィンドチャイムはHP50%以上で20%を加算し、破壊者のブロック対象数を使う', () => {
  const low = at('chimes', 1, 1000, { selfHpPercent: 49.9, actualAttackTargetCount: 2 })
  const half = at('chimes', 1, 1000, { selfHpPercent: 50, actualAttackTargetCount: 2 })
  close(low.row.perAttack, physical(buffed(low.result.stats.attack, 1), 1000))
  close(half.row.perAttack, physical(buffed(half.result.stats.attack, 1.2), 1000))
  close(half.row.allTargetsPerAttack, half.row.perAttack * 2)
  assert.deepEqual(output('chimes', 1, { actualAttackTargetCount: 3 }).rows, [])
  assert.deepEqual(output('chimes', 2).rows, [])
})

test('追加の固定期間10技能のみ期間総ダメージを返し、被弾・HP変化・永続・DOTを区別する', () => {
  const finite = [
    ['frostl', 2, 25], ['vigna', 1, 25], ['vigna', 2, 30], ['frncat', 2, 40], ['fang2', 2, 20],
    ['bryota', 2, 30], ['rfalcn', 2, 15], ['buildr', 2, 15], ['ethan', 2, 30], ['surfer', 1, 20],
  ] as const
  for (const [suffix, index, seconds] of finite) {
    const entry = getDamageThreeComparisonEntries([record(suffix, index)])[0]
    const result = evaluateDamageThreeComparisonEntry(entry, { defense: 500, resistance: 60, enemyCount: 1 })
    assert.deepEqual(result.errors, [], suffix)
    assert.equal(result.durationSeconds, seconds, suffix)
    assert.equal(result.totalDamageReason, null, suffix)
    close(result.totalDamage, result.combinedDps! * seconds)
  }
  for (const [suffix, index] of [['wintim', 2], ['ethan', 1], ['flameb', 2], ['chimes', 1]] as const) {
    const entry = getDamageThreeComparisonEntries([record(suffix, index)])[0]
    const result = evaluateDamageThreeComparisonEntry(entry, { defense: 0, resistance: 0, enemyCount: 1 })
    assert.deepEqual(result.errors, [], suffix)
    assert.equal(result.totalDamage, null, suffix)
    assert.ok(result.totalDamageReason, suffix)
  }
  const permanent = getDamageThreeComparisonEntries([record('buildr', 2)]).find(entry => entry.stageId === 'permanent')!
  assert.equal(evaluateDamageThreeComparisonEntry(permanent, { defense: 0, resistance: 0, enemyCount: 1 }).totalDamage, null)
})
