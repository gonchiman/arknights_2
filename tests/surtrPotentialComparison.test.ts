import assert from 'node:assert/strict'
import test from 'node:test'
import { classifySkill } from '../src/lib/classifier.ts'
import { calculateSurtrDps, deriveSurtrDpsModel, type SurtrDpsSettings } from '../src/lib/surtrDps.ts'
import { getModuleComparisonColors } from '../src/lib/moduleColors.ts'
import { getSelectedSurtrModuleStages, getSurtrModuleChoices } from '../src/lib/surtrModuleComparison.ts'
import { buildSurtrPotentialComparison, normalizeSurtrComparisonPotentials } from '../src/lib/surtrPotentialComparison.ts'
import { buildSurtrUnequippedComparisonSeries, getSurtrStageComparisonBaseline } from '../src/lib/surtrUnequippedComparison.ts'
import type { SkillRecord, RawOperatorModule } from '../src/types/skill.ts'

const defaults: SurtrDpsSettings = { level: 90, trust: 100, potential: 1, skillLevelIndex: 0, blocking: false }
const xId = 'surtr-x'
const yId = 'surtr-y'

function selected(record: SkillRecord, levels = { [xId]: [1, 2, 3], [yId]: [1, 2, 3] }, includeNone = true) {
  return getSelectedSurtrModuleStages(getSurtrModuleChoices(record.operatorProfile, 90), includeNone ? [] : [''], levels)
}

test('選択した全潜在を段階順に計算し、画面モデルと両ブロック条件の値が一致する', () => {
  const record = createRecord()
  const stages = selected(record)
  const potentials = [1, 2, 3, 4, 5, 6]
  for (const blocking of [false, true]) {
    const result = buildSurtrPotentialComparison(record, { ...defaults, blocking }, stages, potentials, 'unequipped')
    assert.ok(result)
    const expectedIds = stages.flatMap(stage => potentials.map(potential => `${stage.id}:pot${potential}`))
    assert.deepEqual(result.series.map(item => item.id), expectedIds)
    assert.deepEqual(result.entries.map(item => item.id), expectedIds)
    assert.deepEqual(result.series, result.blockingComparison[blocking ? 1 : 0].series)
    assert.equal(result.baseline.id, 'none:pot1')
    for (const entry of result.entries) {
      assert.equal(entry.id, `${entry.moduleStageId}:pot${entry.potential}`)
      assert.ok(entry.label.endsWith(`潜在${entry.potential}`))
      assert.deepEqual(entry.points, result.series.find(item => item.id === entry.id)!.points)
      assert.deepEqual(entry.model, deriveSurtrDpsModel(record, { ...defaults, blocking, potential: entry.potential }, entry.moduleId, entry.level))
    }
    assert.deepEqual(result.blockingComparison.map(group => group.blocking), [false, true])
    for (const group of result.blockingComparison) {
      for (const stage of stages) {
        for (const potential of potentials) {
          const model = deriveSurtrDpsModel(record, { ...defaults, blocking: group.blocking, potential }, stage.moduleId, stage.level)!
          const actual = group.series.find(item => item.id === `${stage.id}:pot${potential}`)!
          assert.equal(actual.points.length, 101)
          for (const resistance of [0, 20, 22, 26, 28, 60, 100]) {
            assert.equal(actual.points[resistance].value, calculateSurtrDps(model, resistance))
          }
        }
      }
    }
  }
})

test('前段階と同潜在未装備を非表示でも両条件で計算し、表示順は選択のまま保つ', () => {
  const record = createRecord()
  const stages = selected(record, { [xId]: [1, 3], [yId]: [3] }, false).reverse()
  const potentials = [6, 1]
  const result = buildSurtrPotentialComparison(record, defaults, stages, potentials, 'previous')!
  assert.ok(result)
  const visibleIds = stages.flatMap(stage => potentials.map(potential => `${stage.id}:pot${potential}`))
  assert.deepEqual(result.series.map(item => item.id), visibleIds)
  assert.ok(result.referenceSeries.some(item => item.id === `${xId}:lv2:pot6`))
  assert.ok(result.referenceSeries.some(item => item.id === `${yId}:lv2:pot1`))
  assert.ok(result.referenceSeries.some(item => item.id === 'none:pot6'))
  assert.ok(!result.series.some(item => item.moduleStageId === 'none' || item.moduleStageId?.endsWith(':lv2')))
  for (const group of result.blockingComparison) {
    for (const item of group.series) {
      const baseline = getSurtrStageComparisonBaseline(item, group.baseline, 'previous', group.referenceSeries)!
      assert.equal(baseline.potential, item.potential)
      assert.equal(baseline.moduleStageId, item.moduleStageId === `${xId}:lv1` ? 'none' : item.moduleStageId!.replace(':lv3', ':lv2'))
    }
    const comparisons = buildSurtrUnequippedComparisonSeries(group.series, group.baseline, 'difference', 'previous', group.referenceSeries)
    for (const item of comparisons) {
      const raw = group.series.find(candidate => candidate.id === item.id)!
      const baseline = getSurtrStageComparisonBaseline(raw, group.baseline, 'previous', group.referenceSeries)!
      assert.equal(item.points[60].value, raw.points[60].value! - baseline.points[60].value!)
    }
  }
})

test('非選択の固定潜在は各MOD段階の参照だけを追加し、選択済み未装備も比較できる', () => {
  const record = createRecord()
  const stages = selected(record, { [xId]: [1, 3], [yId]: [2] })
  const result = buildSurtrPotentialComparison(record, defaults, stages, [6], 'potential-1')!
  assert.ok(result)
  assert.ok(result.series.every(item => item.potential === 6))
  for (const group of result.blockingComparison) {
    const comparison = buildSurtrUnequippedComparisonSeries(group.series, group.baseline, 'percent', 'potential-1', group.referenceSeries)
    assert.equal(comparison.length, stages.length)
    for (const item of group.series) {
      const baseline = getSurtrStageComparisonBaseline(item, group.baseline, 'potential-1', group.referenceSeries)!
      assert.equal(baseline.potential, 1)
      assert.equal(baseline.moduleStageId, item.moduleStageId)
      assert.ok(!group.series.includes(baseline))
      assert.equal(comparison.find(target => target.id === item.id)!.points[60].value, (item.points[60].value! / baseline.points[60].value! - 1) * 100)
    }
  }
  const same = buildSurtrPotentialComparison(record, defaults, stages, [6], 'potential-6')!
  assert.deepEqual(buildSurtrUnequippedComparisonSeries(same.series, same.baseline, 'ratio', 'potential-6', same.referenceSeries)
    .flatMap(item => item.points.map(point => point.value)), Array(stages.length * 101).fill(100))
})

test('複数潜在は共通潜在配色、単一潜在は既存段階配色を使い、hidden基準で表示色を変えない', () => {
  const record = createRecord()
  const stages = selected(record)
  for (const base of ['unequipped', 'previous', 'potential-1'] as const) {
    const multi = buildSurtrPotentialComparison(record, defaults, stages, [1, 6], base)!
    assert.deepEqual(multi.series.map(item => item.color), getModuleComparisonColors(stages.flatMap(stage => [1, 6]
      .map(potential => ({ moduleType: stage.type, moduleLevel: stage.level, potential })))) )
    const single = buildSurtrPotentialComparison(record, defaults, stages, [6], base)!
    assert.deepEqual(single.series.map(item => item.color), stages.map(item => item.color))
    assert.deepEqual(single.series.map(item => item.lineStyle), stages.map(item => item.lineStyle))
  }
})

test('潜在を正規化して重複を除き、空選択や無効な表示・hidden計算をnullにする', () => {
  const record = createRecord()
  const stages = selected(record, { [xId]: [3], [yId]: [] }, false)
  assert.deepEqual(normalizeSurtrComparisonPotentials([6, 6, 4, 0, 7, 1.5, NaN, Infinity, 1]), [6, 4, 1])
  assert.equal(buildSurtrPotentialComparison(record, defaults, stages, [], 'unequipped'), null)
  assert.equal(buildSurtrPotentialComparison(record, defaults, [], [1], 'unequipped'), null)
  assert.equal(buildSurtrPotentialComparison(record, { ...defaults, level: 59 }, stages, [1], 'unequipped'), null)
  assert.equal(buildSurtrPotentialComparison(record, { ...defaults, blocking: undefined as unknown as boolean }, stages, [1], 'unequipped'), null)
  assert.equal(buildSurtrPotentialComparison(record, defaults, [{ ...stages[0], id: 'wrong-stage' }], [1], 'unequipped'), null)
  assert.equal(buildSurtrPotentialComparison(record, defaults, stages, [1], 'potential-7' as never), null)
  assert.equal(buildSurtrPotentialComparison(record, defaults, [...stages, { ...stages[0], moduleId: 'missing', id: 'missing:lv3' }], [1], 'unequipped'), null)
  const normalized = buildSurtrPotentialComparison(record, defaults, [...stages, ...stages], [6, 6, 0], 'unequipped')!
  assert.deepEqual(normalized.series.map(item => item.id), [`${xId}:lv3:pot6`, `${xId}:lv3:pot1`])
  const missingPrevious = createRecord()
  missingPrevious.operatorProfile.modules![0].phases = missingPrevious.operatorProfile.modules![0].phases!.filter(phase => phase.equipLevel !== 2)
  assert.ok(buildSurtrPotentialComparison(missingPrevious, defaults, stages, [1], 'unequipped'))
  assert.equal(buildSurtrPotentialComparison(missingPrevious, defaults, stages, [1], 'previous'), null)
  const unsupportedFixed = createRecord()
  unsupportedFixed.operatorProfile.potentialRanks![0] = { buff: { attributes: { attributeModifiers: [{ attributeType: 'ATK', formulaItem: 'MULTIPLICATION', value: 0.1 }] } } }
  assert.ok(buildSurtrPotentialComparison(unsupportedFixed, defaults, stages, [1], 'unequipped'))
  assert.equal(buildSurtrPotentialComparison(unsupportedFixed, defaults, stages, [1], 'potential-2'), null)
})

test('hiddenを含めた両条件のモデルを独立計算し、入力や他条件の点を変更しない', () => {
  const record = createRecord()
  const stages = selected(record, { [xId]: [3], [yId]: [3] }, false)
  const settings = { ...defaults, remnantActive: true }
  const potentials = [1, 6]
  const before = structuredClone({ record, stages, settings, potentials })
  const result = buildSurtrPotentialComparison(record, settings, stages, potentials, 'previous')!
  assert.ok(result)
  assert.deepEqual({ record, stages, settings, potentials }, before)
  const free = result.blockingComparison[0].referenceSeries!
  const blocked = result.blockingComparison[1].referenceSeries!
  for (const item of free) {
    const other = blocked.find(candidate => candidate.id === item.id)!
    assert.notEqual(item, other)
    assert.notEqual(item.points, other.points)
    assert.notEqual(item.points[0], other.points[0])
    if (item.moduleStageId?.startsWith(yId)) {
      const level = Number(item.moduleStageId.slice(-1))
      const expected = deriveSurtrDpsModel(record, { ...settings, blocking: false, potential: item.potential! }, yId, level)!
      assert.ok(expected.remnantActive)
      assert.equal(item.points[60].value, calculateSurtrDps(expected, 60))
    }
  }
  const blockedBefore = structuredClone(blocked)
  free[0].points[0].value = -1
  assert.deepEqual(blocked, blockedBefore)
  assert.deepEqual({ record, stages, settings, potentials }, before)
})

function createRecord(): SkillRecord {
  const skill = { name: 'ラグナロク', duration: -1, durationType: 'NONE', skillType: 'MANUAL', blackboard: [{ key: 'atk', value: 3.3 }] }
  return {
    id: 'surtr-s3', operatorId: 'char_350_surtr', operatorName: 'スルト', profession: 'WARRIOR', professionLabel: '前衛',
    subProfessionId: 'artsfghter', subProfessionName: '術戦士', nameInitial: 'S_ROW', rarity: 6, skillIndex: 3,
    skillId: 'skchr_surtr_3', skillName: 'ラグナロク', description: '', duration: -1, durationType: 'NONE',
    skillType: 'MANUAL', spType: 'INCREASE_WITH_TIME', initSp: 0, spCost: 5, classification: classifySkill(skill),
    skillLevels: [skill], raw: skill,
    operatorProfile: {
      phases: [{ maxLevel: 50 }, { maxLevel: 80 }, { maxLevel: 90, attributesKeyFrames: [
        { level: 1, data: { atk: 544, attackSpeed: 100, baseAttackTime: 1.25 } },
        { level: 90, data: { atk: 672, attackSpeed: 100, baseAttackTime: 1.25 } },
      ] }],
      favorKeyFrames: [{ level: 0, data: { atk: 0 } }, { level: 50, data: { atk: 100 } }], traitDescription: '敵に術ダメージを与える',
      talents: [
        { candidates: [0, 4].map(rank => ({ name: '劫火', unlockCondition: { phase: 'PHASE_2', level: 1 }, requiredPotentialRank: rank,
          blackboard: [{ key: 'magic_resist_penetrate_fixed', value: rank ? 22 : 20 }] })) },
        { candidates: [0, 2].map(rank => ({ name: '余燼', unlockCondition: { phase: 'PHASE_2', level: 1 }, requiredPotentialRank: rank,
          blackboard: [{ key: 'surtr_t_2[withdraw].interval', value: rank ? 9 : 8 }] })) },
      ],
      potentialRanks: [{}, {}, { buff: { attributes: { attributeModifiers: [{ attributeType: 'ATK', formulaItem: 'ADDITION', value: 28 }] } } }, {}, {}],
      modules: [createModule('X'), createModule('Y')],
    },
  }
}

function createModule(type: 'X' | 'Y'): RawOperatorModule {
  return {
    uniEquipId: type === 'X' ? xId : yId, uniEquipName: `MOD ${type}`, type: 'ADVANCED', typeName2: type,
    unlockEvolvePhase: 'PHASE_2', unlockLevel: 60,
    phases: [1, 2, 3].map((level, index) => ({
      equipLevel: level, attributeBlackboard: { atk: type === 'X' ? [30, 48, 60][index] : [45, 55, 60][index] },
      parts: [
        { overrideTraitDataBundle: { candidates: [{ requiredPotentialRank: 0,
          blackboard: type === 'X' ? { attack_speed: 8 } : { damage_scale: 1.1 },
        }] } },
        { addOrOverrideTalentDataBundle: { candidates: type === 'X'
          ? (level === 1 ? [] : [0, 4].map(rank => ({ talentIndex: 0, name: '劫火', requiredPotentialRank: rank,
            blackboard: { magic_resist_penetrate_fixed: [20, 24, 26][index] + (rank ? 2 : 0) },
          })))
          : [0, 2].map(rank => ({ talentIndex: 1, name: '余燼', requiredPotentialRank: rank,
            blackboard: { 'surtr_t_2[withdraw].interval': (level === 3 ? 9 : 8) + (rank ? 1 : 0),
              'surtr_t_2[withdraw].attack_speed': level === 3 ? 30 : level === 2 ? 20 : 0 },
          })),
        } },
      ],
    })),
  }
}
