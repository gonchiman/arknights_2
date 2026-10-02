import assert from 'node:assert/strict'
import test from 'node:test'
import { classifySkill } from '../src/lib/classifier.ts'
import { SURTR_OPERATOR_ID, type SurtrDpsSettings } from '../src/lib/surtrDps.ts'
import {
  buildSurtrDpsBlockComparison,
  type SurtrDpsBlockComparison,
  type SurtrDpsBlockComparisonModule,
} from '../src/lib/surtrDpsBlockComparison.ts'
import type { OperatorCombatProfile, RawOperatorModule, SkillRecord } from '../src/types/skill.ts'

const defaults: SurtrDpsSettings = { level: 90, trust: 100, potential: 1, skillLevelIndex: 9, blocking: false }
const xId = 'uniequip_002_surtr'
const yId = 'uniequip_003_surtr'
const modules: readonly SurtrDpsBlockComparisonModule[] = [
  { id: '', label: '未装備', color: '#666', level: 0 },
  { id: xId, label: 'MOD X Lv.3', color: '#0cf', level: 3 },
  { id: yId, label: 'MOD Y Lv.3', color: '#f80', level: 3 },
]

function close(actual: number | null, expected: number) {
  assert.notEqual(actual, null)
  assert.ok(Math.abs(actual! - expected) < 1e-8, `${actual} != ${expected}`)
}

function value(panel: SurtrDpsBlockComparison, id: string, resistance = 0): number | null {
  const point = panel.series.find(item => item.id === id)?.points.find(point => point.x === resistance)
  assert.ok(point)
  return point.value
}

test('both block states preserve the selected MOD order and their conditional speed and damage effects', () => {
  const panels = buildSurtrDpsBlockComparison(createRecord(), defaults, modules, 'total', 'none')!
  assert.deepEqual(panels.map(panel => panel.blocking), [false, true])
  for (const panel of panels) {
    assert.deepEqual(panel.series.map(({ id, label, color }) => ({ id, label, color })),
      modules.map(({ id, label, color }) => ({ id: id || 'none', label, color })))
    assert.ok(panel.series.every(item => item.points.length === 101))
    assert.deepEqual(panel.series[0].points.map(point => point.x), Array.from({ length: 101 }, (_, index) => index))
  }
  close(value(panels[0], 'none'), 2655.2)
  close(value(panels[1], 'none'), 2655.2)
  close(value(panels[0], xId), 3090.528)
  close(value(panels[1], xId), 2861.6)
  close(value(panels[0], yId), 2861.6)
  close(value(panels[1], yId), 3147.76)
  for (let resistance = 0; resistance <= 100; resistance += 1) {
    close(value(panels[0], xId, resistance)! / value(panels[1], xId, resistance)!, 1.08)
    close(value(panels[1], yId, resistance)! / value(panels[0], yId, resistance)!, 1.1)
    assert.equal(value(panels[0], 'none', resistance), value(panels[1], 'none', resistance))
  }
  const reversed = buildSurtrDpsBlockComparison(createRecord(), defaults, [...modules].reverse(), 'total', 'none')!
  assert.deepEqual(reversed.map(panel => panel.series.map(item => item.id)), [[yId, xId, 'none'], [yId, xId, 'none']])
})

test('both panels use the chosen level, trust, potential, skill rank and individual MOD levels', () => {
  const settings = { ...defaults, level: 60, trust: 0, potential: 4, skillLevelIndex: 0 }
  const selected = modules.map(module => ({ ...module, level: module.id ? 1 : 0 }))
  const panels = buildSurtrDpsBlockComparison(createRecord(), settings, selected, 'total', 'none')!
  close(value(panels[0], 'none'), 1471.2)
  close(value(panels[1], 'none'), 1471.2)
  close(value(panels[0], xId), 1661.472)
  close(value(panels[1], xId), 1538.4)
  close(value(panels[0], yId), 1572)
  close(value(panels[1], yId), 1729.2)
})

test('percent output uses the same selected baseline MOD from each panel independently', () => {
  const panels = buildSurtrDpsBlockComparison(createRecord(), defaults, modules, 'percent', xId)!
  for (const panel of panels) assert.ok(panel.series.find(item => item.id === xId)!.points.every(point => point.value === 0))
  close(value(panels[0], yId), (1 / 1.08 - 1) * 100)
  close(value(panels[1], yId), 10)
  close(value(panels[0], yId, 60), (0.6 / (0.66 * 1.08) - 1) * 100)
  close(value(panels[1], yId, 60), 0)
  close(value(panels[0], 'none'), (2655.2 / 3090.528 - 1) * 100)
  close(value(panels[1], 'none'), (2655.2 / 2861.6 - 1) * 100)
})

test('difference output and the unequipped baseline are calculated independently for both states', () => {
  const difference = buildSurtrDpsBlockComparison(createRecord(), defaults, modules, 'difference', yId)!
  close(value(difference[0], xId), 228.928)
  close(value(difference[1], xId), -286.16)
  assert.ok(difference.every(panel => panel.series.find(item => item.id === yId)!.points.every(point => point.value === 0)))
  const percent = buildSurtrDpsBlockComparison(createRecord(), defaults, modules, 'percent', 'none')!
  assert.deepEqual(percent, buildSurtrDpsBlockComparison(createRecord(), defaults, modules, 'percent', ''))
  assert.ok(percent.every(panel => panel.series.find(item => item.id === 'none')!.points.every(point => point.value === 0)))
  close(value(percent[0], xId), (3090.528 / 2655.2 - 1) * 100)
  close(value(percent[1], xId), (2861.6 / 2655.2 - 1) * 100)
})

test('comparison does not mutate or share input data or points across the two states', () => {
  const record = createRecord()
  const before = structuredClone(record)
  const settings = Object.freeze({ ...defaults, blocking: true })
  const selected = Object.freeze(modules.map(module => Object.freeze({ ...module })))
  const panels = buildSurtrDpsBlockComparison(record, settings, selected, 'total', 'none')!
  const initial = structuredClone(panels)
  assert.deepEqual(panels, buildSurtrDpsBlockComparison(record, { ...settings, blocking: false }, selected, 'total', 'none'))
  assert.deepEqual(record, before)
  assert.equal(settings.blocking, true)
  assert.notEqual(panels[0].series, panels[1].series)
  assert.notEqual(panels[0].series[0].points, panels[1].series[0].points)
  assert.notEqual(panels[0].series[0].points[0], panels[1].series[0].points[0])
  panels[0].series[0].label = 'changed'
  panels[0].series[0].points[0].value = -999
  assert.deepEqual(panels[1], initial[1])
  assert.equal(selected[0].label, '未装備')
  assert.deepEqual(buildSurtrDpsBlockComparison(record, settings, selected, 'total', 'none'), initial)
})

test('invalid input or an invalid curve in either state prevents a partial comparison', () => {
  const record = createRecord()
  assert.equal(buildSurtrDpsBlockComparison(record, defaults, [], 'total', 'none'), null)
  assert.equal(buildSurtrDpsBlockComparison(record, { ...defaults, level: 59 }, modules, 'total', 'none'), null)
  assert.equal(buildSurtrDpsBlockComparison(record, { ...defaults, trust: NaN }, modules, 'total', 'none'), null)
  assert.equal(buildSurtrDpsBlockComparison(record, defaults, [...modules, { ...modules[0], id: 'missing' }], 'total', 'none'), null)
  assert.equal(buildSurtrDpsBlockComparison(record, defaults, [{ ...modules[1], level: 4 }], 'total', xId), null)
  assert.equal(buildSurtrDpsBlockComparison({ ...record, skillIndex: 2 }, defaults, modules, 'total', 'none'), null)
  // The Y curve overflows only while blocking, after the non-blocking panel is valid.
  record.operatorProfile.modules![1].phases![2].parts![0].overrideTraitDataBundle!.candidates![0].blackboard = {
    damage_scale: Number.MAX_VALUE,
  }
  assert.equal(buildSurtrDpsBlockComparison(record, defaults, modules, 'total', 'none'), null)
})

// Same compact JP fixture as surtrDps.test.ts; the comparison uses the production model.
function createRecord(): SkillRecord {
  const skillLevels = [1.8, 1.9, 2, 2.1, 2.2, 2.3, 2.4, 2.7, 3, 3.3].map(atk => ({
    name: 'ラグナロク', duration: -1, durationType: 'NONE', skillType: 'MANUAL',
    description: '攻撃力上昇、退場まで効果継続', blackboard: [{ key: 'atk', value: atk }],
  }))
  return {
    id: `${SURTR_OPERATOR_ID}:skchr_surtr_3`, operatorId: SURTR_OPERATOR_ID, operatorName: 'スルト',
    profession: 'WARRIOR', professionLabel: '前衛', subProfessionId: 'artsfghter', subProfessionName: '術戦士',
    nameInitial: 'S_ROW', rarity: 6, skillIndex: 3, skillId: 'skchr_surtr_3', skillName: 'ラグナロク',
    description: '', duration: -1, durationType: 'NONE', skillType: 'MANUAL', spType: 'INCREASE_WITH_TIME',
    initSp: 0, spCost: 5, classification: classifySkill(skillLevels[9]), skillLevels,
    operatorProfile: createProfile(), raw: skillLevels[9],
  }
}

function createProfile(): OperatorCombatProfile {
  return {
    phases: [{ maxLevel: 50 }, { maxLevel: 80 }, { maxLevel: 90, attributesKeyFrames: [
      { level: 1, data: { atk: 544, attackSpeed: 100, baseAttackTime: 1.25 } },
      { level: 90, data: { atk: 672, attackSpeed: 100, baseAttackTime: 1.25 } },
    ] }],
    favorKeyFrames: [{ level: 0, data: { atk: 0 } }, { level: 50, data: { atk: 100 } }],
    traitDescription: '敵に術ダメージを与える',
    talents: [
      { candidates: [0, 4].map(rank => ({ name: '劫火', unlockCondition: { phase: 'PHASE_2', level: 1 },
        requiredPotentialRank: rank, blackboard: [{ key: 'magic_resist_penetrate_fixed', value: rank ? 22 : 20 }] })) },
      { candidates: [0, 2].map(rank => ({ name: '余燼', unlockCondition: { phase: 'PHASE_2', level: 1 },
        requiredPotentialRank: rank, blackboard: [{ key: 'surtr_t_2[withdraw].interval', value: rank ? 9 : 8 }] })) },
    ],
    potentialRanks: [{}, {}, { buff: { attributes: { attributeModifiers: [
      { attributeType: 'ATK', formulaItem: 'ADDITION', value: 28 },
    ] } } }, {}, {}],
    modules: [createModule('X'), createModule('Y')],
  }
}

function createModule(type: 'X' | 'Y'): RawOperatorModule {
  return {
    uniEquipId: type === 'X' ? xId : yId, uniEquipName: `MOD ${type}`, type: 'ADVANCED', typeName2: type,
    unlockEvolvePhase: 'PHASE_2', unlockLevel: 60,
    phases: [1, 2, 3].map((level, index) => ({
      equipLevel: level,
      attributeBlackboard: type === 'X' ? { atk: [30, 48, 60][index], magic_resistance: 5 }
        : { atk: [45, 55, 60][index], def: [42, 56, 65][index] },
      parts: [
        { overrideTraitDataBundle: { candidates: [{ requiredPotentialRank: 0,
          additionalDescription: type === 'X' ? '未ブロック時、攻撃速度+8' : '自身がブロックしている敵に10%の対術脆弱',
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
