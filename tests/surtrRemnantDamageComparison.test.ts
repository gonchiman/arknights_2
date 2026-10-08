import assert from 'node:assert/strict'
import test from 'node:test'
import { classifySkill } from '../src/lib/classifier.ts'
import { getSelectedSurtrModuleStages, getSurtrModuleChoices } from '../src/lib/surtrModuleComparison.ts'
import type { SurtrDpsSettings } from '../src/lib/surtrDps.ts'
import type { SurtrDpsOutputSeries } from '../src/lib/surtrDpsOutput.ts'
import { deriveSurtrRemnantAttackModel, type SurtrRemnantAttackAssumptions } from '../src/lib/surtrRemnantAttacks.ts'
import { buildSurtrRemnantDamageComparison } from '../src/lib/surtrRemnantDamageComparison.ts'
import { buildSurtrUnequippedComparisonSeries, getSurtrStageComparisonBaseline } from '../src/lib/surtrUnequippedComparison.ts'
import type { RawOperatorModule, SkillRecord } from '../src/types/skill.ts'

const defaults: SurtrDpsSettings = { level: 90, trust: 100, potential: 1, skillLevelIndex: 9, blocking: false }
const assumptions: SurtrRemnantAttackAssumptions = { windup: 0.2, ctCarry: 'time', includeRetreatHit: false }
const xId = 'uniequip_002_surtr'
const yId = 'uniequip_003_surtr'

function selected(record: SkillRecord, levels: Record<string, number[]> = { [xId]: [3], [yId]: [3] }) {
  return getSelectedSurtrModuleStages(getSurtrModuleChoices(record.operatorProfile, defaults.level), [''], levels)
}

function value(series: readonly SurtrDpsOutputSeries[], id: string, resistance = 60): number | null {
  const point = series.find(item => item.id === id)?.points.find(point => point.x === resistance)
  assert.ok(point, `${id} at ${resistance}`)
  return point.value
}

function close(actual: number | null, expected: number) {
  assert.notEqual(actual, null)
  assert.ok(Math.abs(actual! - expected) < 1e-8, `${actual} != ${expected}`)
}

test('未装備が未選択でも両条件の全CT期待ダメージを計算し、表示順・色・線種・術耐性順を維持する', () => {
  const record = createRecord()
  const stages = selected(record).reverse()
  const resistances = [60, 0, 100]
  for (const blocking of [false, true]) {
    const output = buildSurtrRemnantDamageComparison(record, { ...defaults, blocking }, stages, assumptions, 'unequipped', resistances)
    assert.ok(output)
    assert.deepEqual(output.blockingComparison.map(group => group.blocking), [false, true])
    assert.deepEqual(output.series, output.blockingComparison[blocking ? 1 : 0].series)
    assert.equal(output.baseline, output.blockingComparison[blocking ? 1 : 0].baseline)
    for (const group of output.blockingComparison) {
      assert.deepEqual(group.series.map(item => item.id), ['none', `${yId}:lv3`, `${xId}:lv3`])
      assert.deepEqual(group.series.slice(1).map(({ id, label, color, lineStyle }) => ({ id, label, color, lineStyle })),
        stages.map(({ id, label, color, lineStyle }) => ({ id, label, color, lineStyle })))
      assert.deepEqual(group.referenceSeries, group.series)
      assert.equal(group.baseline, group.series[0])
      assert.ok(group.series.every(item => item.points.map(point => point.x).join(',') === '60,0,100'))
      close(value(group.series, 'none'), 1991.4 * 6.24)
      close(value(group.series, `${xId}:lv3`), 2360.82 * (group.blocking ? 6.24 : 6.7392))
      close(value(group.series, `${yId}:lv3`), 2146.2 * (2926 / 325) * (group.blocking ? 1.1 : 1))
    }
    close(value(output.series, `${xId}:lv3`, 100), 3577 * 0.26 * (blocking ? 6.24 : 6.7392))
  }
})

test('非表示の同MOD前段階を両条件で追加し、Yの期間と余燼攻速の段階差まで比較する', () => {
  const record = createRecord()
  const stages = selected(record)
  const output = buildSurtrRemnantDamageComparison(record, defaults, stages, assumptions, 'previous', [60])
  assert.ok(output)
  const y2 = deriveSurtrRemnantAttackModel(record, defaults, yId, 2)!
  const y3 = deriveSurtrRemnantAttackModel(record, defaults, yId, 3)!
  assert.deepEqual([y2.remnantDuration, y2.attackSpeedAfter, y3.remnantDuration, y3.attackSpeedAfter], [8, 120, 9, 130])
  for (const group of output.blockingComparison) {
    assert.deepEqual(group.series.map(item => item.id), ['none', `${xId}:lv3`, `${yId}:lv3`])
    assert.deepEqual(group.referenceSeries!.map(item => item.id), ['none', `${xId}:lv3`, `${yId}:lv3`, `${xId}:lv2`, `${yId}:lv2`])
    const yReference = getSurtrStageComparisonBaseline(stages[1], group.baseline, 'previous', group.referenceSeries)
    assert.ok(yReference)
    assert.equal(yReference.label, 'MOD Y Lv.2')
    const xBase = 2256.64 * (group.blocking ? 6.24 : 6.7392)
    const yBase = 2133.6 * (1111 / 150) * (group.blocking ? 1.1 : 1)
    close(value(group.referenceSeries!, `${xId}:lv2`), xBase)
    close(yReference.points[0].value, yBase)
    for (const metric of ['difference', 'ratio', 'percent'] as const) {
      const comparisons = buildSurtrUnequippedComparisonSeries(group.series, group.baseline, metric, 'previous', group.referenceSeries)
      for (const [id, base] of [[`${xId}:lv3`, xBase], [`${yId}:lv3`, yBase]] as const) {
        const total = value(group.series, id)!
        close(value(comparisons, id), metric === 'difference' ? total - base : metric === 'ratio' ? total / base * 100 : (total / base - 1) * 100)
      }
    }
  }
})

test('Lv.1は独立未装備を基準にし、表示済みの前段階の色・線種をhidden参照で上書きしない', () => {
  const record = createRecord()
  const stages = selected(record, { [xId]: [1, 2, 3], [yId]: [1, 2, 3] })
    .map((stage, index) => ({ ...stage, color: `selected-${index}` }))
  const visibleNone = getSelectedSurtrModuleStages(getSurtrModuleChoices(record.operatorProfile, 90)).find(stage => stage.id === 'none')!
  visibleNone.color = 'selected-none'
  const output = buildSurtrRemnantDamageComparison(record, defaults, [...stages, visibleNone], assumptions, 'previous', [60])
  assert.ok(output)
  for (const group of output.blockingComparison) {
    assert.equal(group.baseline.color, 'selected-none')
    assert.equal(group.referenceSeries!.length, 7)
    assert.deepEqual(group.series.slice(1).map(({ id, color, lineStyle }) => ({ id, color, lineStyle })),
      stages.map(({ id, color, lineStyle }) => ({ id, color, lineStyle })))
    for (const stage of stages.filter(item => item.level === 1)) {
      assert.equal(getSurtrStageComparisonBaseline(stage, group.baseline, 'previous', group.referenceSeries), group.baseline)
    }
    const differences = buildSurtrUnequippedComparisonSeries(group.series, group.baseline, 'difference', 'previous', group.referenceSeries)
    close(value(differences, `${xId}:lv1`), 2068.8 * (group.blocking ? 6.24 : 6.7392) - 1991.4 * 6.24)
    close(value(differences, `${yId}:lv1`), 2107.8 * 6.24 * (group.blocking ? 1.1 : 1) - 1991.4 * 6.24)
  }
})

test('命中準備時間・CT引継ぎ・潜在延長を各モデルに反映し、同時退場の孤立端点は平均を変えない', () => {
  const record = createRecord()
  const stages = selected(record)
  const expected = { time: [6.84, 7.3872, 9.716923076923077], ratio: [6.84, 7.3872, 9.932] }
  for (const ctCarry of ['time', 'ratio'] as const) {
    const settings = { ...defaults, potential: 3, blocking: true }
    const options = { ...assumptions, windup: 0.45, ctCarry }
    const output = buildSurtrRemnantDamageComparison(record, settings, stages, options, 'previous', [60])
    assert.ok(output)
    for (const group of output.blockingComparison) {
      close(value(group.series, 'none'), 1991.4 * expected[ctCarry][0])
      close(value(group.series, `${xId}:lv3`), 2360.82 * expected[ctCarry][group.blocking ? 0 : 1])
      close(value(group.series, `${yId}:lv3`), 2146.2 * expected[ctCarry][2] * (group.blocking ? 1.1 : 1))
    }
    assert.deepEqual(buildSurtrRemnantDamageComparison(record, settings, stages, { ...options, includeRetreatHit: true }, 'previous', [60]), output)
  }
  const attackPotential = buildSurtrRemnantDamageComparison(record, { ...defaults, potential: 4 }, stages, assumptions, 'unequipped', [60])!
  close(value(attackPotential.series, 'none'), 2064 * 7.04)
  close(value(attackPotential.series, `${xId}:lv3`), 2440.68 * 7.6032)
  close(value(attackPotential.series, `${yId}:lv3`), 2218.8 * 10.064615384615385)
})

test('有効な期待ダメージ0と不正な術耐性のnullを区別して保存する', () => {
  const record = createRecord()
  for (const candidate of record.operatorProfile.talents![1].candidates!) candidate.blackboard![0].value = 0.1
  const stages = selected(record, { [xId]: [1], [yId]: [1] })
  const output = buildSurtrRemnantDamageComparison(record, defaults, stages, assumptions, 'previous', [60, -1, 101, 0])
  assert.ok(output)
  for (const group of output.blockingComparison) {
    assert.ok(group.series.every(item => item.points.map(point => point.value).join(',') === '0,,,0'))
    assert.ok(group.series.every(item => item.points[1].value === null && item.points[2].value === null))
    const difference = buildSurtrUnequippedComparisonSeries(group.series, group.baseline, 'difference', 'previous', group.referenceSeries)
    assert.ok(difference.every(item => item.points[0].value === 0))
    const ratio = buildSurtrUnequippedComparisonSeries(group.series, group.baseline, 'ratio', 'previous', group.referenceSeries)
    assert.ok(ratio.every(item => item.points[0].value === null))
  }
})

test('無効な計算条件は欠損値だけの比較を返さず、どちらかのブロック条件の命中準備時間超過も拒否する', () => {
  const record = createRecord()
  const stages = selected(record)
  const invalid = [
    ...[-1, 2, Number.NaN, Number.POSITIVE_INFINITY].map(windup => ({ ...assumptions, windup })),
    { ...assumptions, ctCarry: 'unknown' },
    { ...assumptions, includeRetreatHit: null },
  ] as SurtrRemnantAttackAssumptions[]
  for (const options of invalid) {
    assert.equal(buildSurtrRemnantDamageComparison(record, defaults, stages, options, 'previous', [0, 60]), null)
  }
  const xOnly = selected(record, { [xId]: [3], [yId]: [] })
  for (const blocking of [false, true]) {
    // 1.2 s fits unequipped/blocked X, but exceeds unblocked X's 1.1574… s interval.
    assert.equal(buildSurtrRemnantDamageComparison(record, { ...defaults, blocking }, xOnly,
      { ...assumptions, windup: 1.2 }, 'unequipped', [60]), null)
  }
  const yOnly = selected(record, { [xId]: [], [yId]: [3] })
  // 1 s fits Y's pre-activation CT but exceeds its 0.9615… s Remnant interval.
  assert.equal(buildSurtrRemnantDamageComparison(record, defaults, yOnly,
    { ...assumptions, windup: 1 }, 'previous', [60]), null)
  const noneOnly = getSelectedSurtrModuleStages(getSurtrModuleChoices(record.operatorProfile, 90), [xId, yId])
  assert.ok(buildSurtrRemnantDamageComparison(record, defaults, noneOnly,
    { ...assumptions, windup: 1.25 }, 'unequipped', [60]))
})

test('全スキルランク・潜在と育成設定を独立式で照合し、全術耐性で両条件の前段階比較まで一致する', () => {
  const record = createRecord()
  const skillBonuses = [1.8, 1.9, 2, 2.1, 2.2, 2.3, 2.4, 2.8, 3.1, 3.3]
  for (const [index, skill] of record.skillLevels.entries()) skill.blackboard![0].value = skillBonuses[index]
  // Display Lv.1 and Lv.3; Lv.2 must still feed the latter's comparison.
  const stages = selected(record, { [xId]: [1, 3], [yId]: [1, 3] })
  const resistances = Array.from({ length: 101 }, (_, index) => index)
  for (const skillLevelIndex of skillBonuses.keys()) {
    for (const potential of [1, 2, 3, 4, 5, 6]) {
      const settings = {
        ...defaults, skillLevelIndex, potential,
        level: [60, 73, 90][skillLevelIndex % 3],
        trust: [0, 37.5, 100][skillLevelIndex % 3],
      }
      for (const ctCarry of ['time', 'ratio'] as const) {
        const options = { ...assumptions, ctCarry, windup: skillLevelIndex % 2 ? 0.45 : 0.2 }
        const output = buildSurtrRemnantDamageComparison(record, settings, stages, options, 'previous', resistances)
        assert.ok(output)
        for (const group of output.blockingComparison) {
          const expected = new Map<string, number[]>()
          for (const reference of group.referenceSeries!) {
            const [moduleId, stageLabel] = reference.id.split(':lv')
            const level = Number(stageLabel ?? 0)
            const isX = moduleId === xId
            const isY = moduleId === yId
            const moduleAttack = isX ? [30, 48, 60][level - 1] : isY ? [45, 55, 60][level - 1] : 0
            const baseAttack = Math.round(544 + (settings.level - 1) / 89 * 128 + settings.trust
              + (potential >= 4 ? 28 : 0) + moduleAttack)
            const effectiveAttack = Math.floor(baseAttack * (1 + skillBonuses[skillLevelIndex]) + 1e-9)
            const ignore = (isX && level >= 2 ? level === 3 ? 26 : 24 : 20) + (potential >= 5 ? 2 : 0)
            const before = 1.25 / (isX && !group.blocking ? 1.08 : 1)
            const after = isY && level >= 2 ? 1.25 / (level === 3 ? 1.3 : 1.2) : before
            const duration = 8 + (potential >= 3 ? 1 : 0) + (isY && level === 3 ? 1 : 0)
            const carriedCtRange = ctCarry === 'ratio' ? after : before
            // Each attack contributes the fraction of the uniform CT domain
            // that lets its impact land. This avoids the production interval builder.
            let expectedCount = 0
            for (let hit = 0; hit * after < duration; hit += 1) {
              expectedCount += Math.min(1, Math.max(0, (duration - options.windup - hit * after) / carriedCtRange))
            }
            const totals = resistances.map(resistance => effectiveAttack
              * Math.max(0.05, 1 - Math.max(0, resistance - ignore) / 100)
              * (isY && group.blocking ? 1.1 : 1) * expectedCount)
            expected.set(reference.id, totals)
            for (const point of reference.points) close(point.value, totals[point.x])
          }
          for (const metric of ['difference', 'ratio', 'percent'] as const) {
            const comparisons = buildSurtrUnequippedComparisonSeries(group.series, group.baseline, metric, 'previous', group.referenceSeries)
            assert.deepEqual(comparisons.map(item => item.id), stages.map(item => item.id))
            for (const comparison of comparisons) {
              const baselineId = comparison.id.endsWith(':lv1') ? 'none' : comparison.id.replace(/:lv3$/, ':lv2')
              for (const point of comparison.points) {
                const raw = expected.get(comparison.id)![point.x]
                const base = expected.get(baselineId)![point.x]
                close(point.value, metric === 'difference' ? raw - base : metric === 'ratio' ? raw / base * 100 : (raw / base - 1) * 100)
              }
            }
          }
        }
      }
    }
  }
})

test('S3の余燼中設定を渡してもYの各段階とhidden前段階の期待総ダメージを二重反映しない', () => {
  const record = createRecord()
  const resistances = [0, 60, 100, -1]
  for (const levels of [[1, 2, 3], [3]]) {
    const stages = selected(record, { [xId]: [], [yId]: levels })
    for (const potential of [1, 3]) {
      for (const blocking of [false, true]) {
        const settings = { ...defaults, potential, blocking }
        const activeSettings = Object.freeze({ ...settings, remnantActive: true })
        for (const ctCarry of ['time', 'ratio'] as const) {
          const options = { ...assumptions, ctCarry, windup: 0.45 }
          for (const base of ['unequipped', 'previous'] as const) {
            const normal = buildSurtrRemnantDamageComparison(record, settings, stages, options, base, resistances)
            const active = buildSurtrRemnantDamageComparison(record, activeSettings, stages, options, base, resistances)
            assert.ok(normal)
            assert.ok(active)
            assert.deepEqual(active, normal, `Y ${levels}, 潜在${potential}, blocking ${blocking}, ${ctCarry}, ${base}`)
            assert.deepEqual(buildSurtrRemnantDamageComparison(record, { ...settings, remnantActive: false }, stages,
              options, base, resistances), normal)
            assert.equal(activeSettings.remnantActive, true)
            for (const group of active.blockingComparison) {
              for (const reference of group.referenceSeries!) {
                const level = reference.id === 'none' ? 0 : Number(reference.id.split(':lv')[1])
                const after = 1.25 / (level === 3 ? 1.3 : level === 2 ? 1.2 : 1)
                const duration = 8 + (potential >= 3 ? 1 : 0) + (level === 3 ? 1 : 0)
                const ctRange = ctCarry === 'ratio' ? after : 1.25
                let count = 0
                for (let hit = 0; hit * after < duration; hit += 1) {
                  count += Math.min(1, Math.max(0, (duration - options.windup - hit * after) / ctRange))
                }
                const attack = [3319, 3513, 3556, 3577][level]
                for (const resistance of resistances.slice(0, 3)) {
                  const perHit = attack * Math.max(0.05, 1 - Math.max(0, resistance - 20) / 100)
                    * (level && group.blocking ? 1.1 : 1)
                  close(value(group.referenceSeries!, reference.id, resistance), perHit * count)
                }
                assert.equal(value(group.referenceSeries!, reference.id, -1), null)
              }
            }
          }
        }
      }
    }
  }
})

test('無効な選択モデル・hidden前段階の欠落をnullにし、比較に不要な段階は導出しない', () => {
  const record = createRecord()
  const stages = selected(record)
  assert.equal(buildSurtrRemnantDamageComparison({ ...record, skillIndex: 2 }, defaults, stages, assumptions, 'unequipped', [60]), null)
  assert.equal(buildSurtrRemnantDamageComparison(record, { ...defaults, level: 59 }, stages, assumptions, 'unequipped', [60]), null)
  assert.equal(buildSurtrRemnantDamageComparison(record, defaults, [{ ...stages[0], moduleId: 'missing' }], assumptions, 'unequipped', [60]), null)
  assert.equal(buildSurtrRemnantDamageComparison(record, defaults, [], assumptions, 'unequipped', [60]), null)
  const missing = createRecord()
  const y2 = missing.operatorProfile.modules![1].phases![1].parts![1].addOrOverrideTalentDataBundle!.candidates![0].blackboard as Record<string, number>
  delete y2['surtr_t_2[withdraw].attack_speed']
  assert.ok(buildSurtrRemnantDamageComparison(missing, defaults, stages, assumptions, 'unequipped', [60]))
  assert.equal(buildSurtrRemnantDamageComparison(missing, defaults, stages, assumptions, 'previous', [60]), null)
  const none = getSelectedSurtrModuleStages(getSurtrModuleChoices(record.operatorProfile, 90)).filter(stage => stage.id === 'none')
  assert.deepEqual(buildSurtrRemnantDamageComparison(record, defaults, none, assumptions, 'previous', [60])!.series.map(item => item.id), ['none'])
})

test('入力を変更せず、両ブロック条件の系列や点を共有しない', () => {
  const record = createRecord()
  const stages = selected(record)
  const before = structuredClone({ record, stages, defaults, assumptions })
  const output = buildSurtrRemnantDamageComparison(record, defaults, stages, assumptions, 'previous', [0, 60])!
  const blocked = structuredClone(output.blockingComparison[1])
  assert.notEqual(output.blockingComparison[0].series, output.blockingComparison[1].series)
  assert.notEqual(output.blockingComparison[0].baseline.points, output.blockingComparison[1].baseline.points)
  output.blockingComparison[0].baseline.points[0].value = 9999
  output.blockingComparison[0].series[1].color = 'changed'
  assert.deepEqual(output.blockingComparison[1], blocked)
  assert.deepEqual({ record, stages, defaults, assumptions }, before)
})

// Compact JP S3 data with all module stages, following the existing Remnant model fixtures.
function createRecord(): SkillRecord {
  const skillLevels = Array.from({ length: 10 }, () => ({
    name: 'ラグナロク', description: '攻撃力上昇、最大HP+5000、退場まで効果継続',
    duration: -1, durationType: 'NONE', skillType: 'MANUAL', blackboard: [
      { key: 'atk', value: 3.3 }, { key: 'max_hp', value: 5000 }, { key: 'interval', value: 0.2 },
      { key: 'hp_ratio', value: 0.2 }, { key: 'duration', value: 60 },
    ],
  }))
  return {
    id: 'char_350_surtr:skchr_surtr_3', operatorId: 'char_350_surtr', operatorName: 'スルト',
    profession: 'WARRIOR', professionLabel: '前衛', subProfessionId: 'artsfghter', subProfessionName: '術戦士',
    nameInitial: 'S_ROW', rarity: 6, skillIndex: 3, skillId: 'skchr_surtr_3', skillName: 'ラグナロク',
    description: '', duration: -1, durationType: 'NONE', skillType: 'MANUAL', spType: 'INCREASE_WITH_TIME',
    initSp: 0, spCost: 5, classification: classifySkill(skillLevels[9]), skillLevels, raw: skillLevels[9],
    operatorProfile: {
      phases: [{ maxLevel: 50 }, { maxLevel: 80 }, { maxLevel: 90, attributesKeyFrames: [
        { level: 1, data: { maxHp: 2216, atk: 544, attackSpeed: 100, baseAttackTime: 1.25 } },
        { level: 90, data: { maxHp: 2916, atk: 672, attackSpeed: 100, baseAttackTime: 1.25 } },
      ] }],
      favorKeyFrames: [{ level: 0, data: { maxHp: 0, atk: 0 } }, { level: 50, data: { maxHp: 0, atk: 100 } }],
      traitDescription: '敵に術ダメージを与える',
      potentialRanks: [{}, {}, { buff: { attributes: { attributeModifiers: [
        { attributeType: 'ATK', formulaItem: 'ADDITION', value: 28 },
      ] } } }, {}, {}],
      talents: [{ candidates: [0, 4].map(rank => ({ name: '劫火', requiredPotentialRank: rank,
        unlockCondition: { phase: 'PHASE_2', level: 1 },
        blackboard: [{ key: 'magic_resist_penetrate_fixed', value: rank ? 22 : 20 }],
      })) }, { candidates: [0, 2].map(rank => ({
        name: '余燼', requiredPotentialRank: rank, unlockCondition: { phase: 'PHASE_2', level: 1 },
        blackboard: [{ key: 'surtr_t_2[withdraw].interval', value: rank ? 9 : 8 }],
      })) }],
      modules: [module('X'), module('Y')],
    },
  }
}

function module(type: 'X' | 'Y'): RawOperatorModule {
  return {
    uniEquipId: type === 'X' ? xId : yId, uniEquipName: `MOD ${type}`, type: 'ADVANCED', typeName2: type,
    unlockEvolvePhase: 'PHASE_2', unlockLevel: 60,
    phases: [1, 2, 3].map((level, index) => ({
      equipLevel: level,
      attributeBlackboard: type === 'X' ? { atk: [30, 48, 60][index], magic_resistance: 5 }
        : { atk: [45, 55, 60][index], def: [42, 56, 65][index] },
      parts: [
        { overrideTraitDataBundle: { candidates: [{ requiredPotentialRank: 0,
          additionalDescription: type === 'X' ? '未ブロック時、攻撃速度+8' : 'ブロック中の敵に対術脆弱',
          blackboard: type === 'X' ? { attack_speed: 8 } : { damage_scale: 1.1 },
        }] } },
        { addOrOverrideTalentDataBundle: { candidates: level === 1 ? []
          : type === 'X' ? [0, 4].map(rank => ({ talentIndex: 0, name: '劫火', requiredPotentialRank: rank,
            blackboard: { magic_resist_penetrate_fixed: (level === 3 ? 26 : 24) + (rank ? 2 : 0) },
          })) : [0, 2].map(rank => ({ talentIndex: 1, name: '余燼', requiredPotentialRank: rank,
            blackboard: { 'surtr_t_2[withdraw].interval': (level === 3 ? 9 : 8) + (rank ? 1 : 0),
              'surtr_t_2[withdraw].attack_speed': level === 3 ? 30 : 20 },
          })),
        } },
      ],
    })),
  }
}
