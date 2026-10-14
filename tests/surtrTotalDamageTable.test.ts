import assert from 'node:assert/strict'
import test from 'node:test'
import { classifySkill } from '../src/lib/classifier.ts'
import type { SurtrDpsSettings } from '../src/lib/surtrDps.ts'
import {
  calculateSurtrTotalDamage,
  deriveSurtrTotalDamageModel,
  SURTR_TOTAL_DAMAGE_DEFAULT_ASSUMPTIONS,
  type SurtrTotalDamageAssumptions,
} from '../src/lib/surtrTotalDamage.ts'
import {
  buildSurtrTotalDamageTable,
  buildSurtrTotalDamageTableTsv,
  formatSurtrTotalDamageTableValue,
  getSurtrTotalDamageTablePoint,
  SURTR_TOTAL_DAMAGE_TABLE_MAXIMUM_CELLS,
  type SurtrTotalDamageTableComparison,
} from '../src/lib/surtrTotalDamageTable.ts'
import type { RawOperatorModule, SkillRecord } from '../src/types/skill.ts'

const settings: SurtrDpsSettings = { level: 90, trust: 100, potential: 1, skillLevelIndex: 9, blocking: false }
const xId = 'uniequip_002_surtr'
const yId = 'uniequip_003_surtr'

function comparisons(changes: Partial<SurtrDpsSettings> = {}): SurtrTotalDamageTableComparison[] {
  return ['', xId, yId].flatMap(moduleId => (moduleId ? [1, 2, 3] : [0]).map(moduleLevel => {
    const model = deriveSurtrTotalDamageModel(createRecord(), { ...settings, ...changes }, moduleId, moduleLevel)
    assert.ok(model)
    const id = moduleId ? `${moduleId}:lv${moduleLevel}` : 'none'
    return { id, label: moduleId ? `${moduleId === xId ? 'X' : 'Y'} Lv.${moduleLevel}` : '未装備', color: '#737982', model }
  }))
}

test('全段階・潜在・ブロック・時刻・術耐性の各セルは単点エンジンと完全一致する', () => {
  const times = [0, 0.6, 10.7, 25]
  const resistances = [0, 20, 40, 60, 80, 100]
  for (const potential of [1, 3, 5]) {
    for (const blocking of [false, true]) {
      const series = comparisons({ potential, blocking })
      for (const ctCarry of ['time', 'ratio'] as const) {
        const assumptions = { ...SURTR_TOTAL_DAMAGE_DEFAULT_ASSUMPTIONS, ctCarry }
        const matrix = buildSurtrTotalDamageTable(series, times, resistances, assumptions)!
        assert.ok(matrix)
        assert.equal(matrix.points.length, times.length * resistances.length * series.length)
        times.forEach((time, timeIndex) => resistances.forEach((resistance, resistanceIndex) => series.forEach((item, seriesIndex) => {
          const result = calculateSurtrTotalDamage(item.model, time, resistance, assumptions, { includeAttacks: false })!
          const { attacks: _attacks, ...expected } = result
          assert.deepEqual(getSurtrTotalDamageTablePoint(matrix, timeIndex, resistanceIndex, seriesIndex),
            { ...expected, time, resistance, seriesId: item.id })
        })))
        assert.equal(matrix.maximumTotalDamage, Math.max(...matrix.points.map(point => point.totalDamage)))
      }
    }
  }
})

test('素質2をまたぐ進行中の攻撃と退場同時の命中境界を術耐性全列で維持する', () => {
  const series = comparisons().slice(0, 1)
  const carried = buildSurtrTotalDamageTable(series, [10.7], [0, 60, 100])!
  assert.ok(carried.points.every(point => point.hitsBefore === 8 && point.hitsRemnant === 7 && point.totalHits === 15))
  const source = series[0].model
  const model = { before: { ...source.before, attackInterval: 1 }, after: { ...source.after, attackInterval: 1 },
    timing: { ...source.timing, attackIntervalBefore: 1, attackIntervalAfter: 1, remnantDuration: 2 } }
  const boundarySeries = [{ ...series[0], model }]
  const assumptions = { ...SURTR_TOTAL_DAMAGE_DEFAULT_ASSUMPTIONS, firstAttackStart: 0, hitDelay: 1 }
  const excluded = buildSurtrTotalDamageTable(boundarySeries, [0], [0, 60, 100], assumptions)!
  const included = buildSurtrTotalDamageTable(boundarySeries, [0], [0, 60, 100], { ...assumptions, includeRetreatHit: true })!
  assert.ok(excluded.points.every(point => point.totalHits === 1))
  assert.ok(included.points.every(point => point.totalHits === 2))
  assert.ok(included.points.every(point => point.totalDamage === 2 * point.perHitRemnant))
})

test('攻撃開始が退場より後なら全セル0で最大値も0になり、入力配列を変更しない', () => {
  const series = comparisons().slice(0, 1)
  const times = [0]
  const resistances = [0, 100]
  const originalSeries = structuredClone(series)
  const assumptions = { ...SURTR_TOTAL_DAMAGE_DEFAULT_ASSUMPTIONS, firstAttackStart: 20 }
  const result = buildSurtrTotalDamageTable(series, times, resistances, assumptions)!
  assert.equal(result.maximumTotalDamage, 0)
  assert.ok(result.points.every(point => point.totalHits === 0 && point.totalDamage === 0 && point.lastHitTime === null))
  result.times.push(1)
  result.resistances.push(101)
  result.series[0].label = 'changed'
  assert.deepEqual(times, [0])
  assert.deepEqual(resistances, [0, 100])
  assert.deepEqual(series, originalSeries)
})

test('順序不正・重複・非有限値・範囲外・サンプル数・セル数上限は無言で切り詰めず未計算にする', () => {
  const series = comparisons()
  for (const times of [[], [1, 0], [0, 0], [-1], [NaN], [Infinity], [3600.1], Array.from({ length: 202 }, (_, index) => index)]) {
    assert.equal(buildSurtrTotalDamageTable(series, times, [0]), null)
  }
  for (const resistances of [[], [20, 0], [0, 0], [-1], [101], [0.5], [NaN], [Infinity]]) {
    assert.equal(buildSurtrTotalDamageTable(series, [25], resistances), null)
  }
  assert.equal(buildSurtrTotalDamageTable([], [25], [0]), null)
  assert.equal(buildSurtrTotalDamageTable([series[0], series[0]], [25], [0]), null)
  assert.equal(buildSurtrTotalDamageTable([{ ...series[0], id: ' ' }], [25], [0]), null)
  assert.equal(buildSurtrTotalDamageTable(series, [25], [0], { ...SURTR_TOTAL_DAMAGE_DEFAULT_ASSUMPTIONS, hitDelay: -1 }), null)
  assert.equal(buildSurtrTotalDamageTable([{ ...series[0], model: { ...series[0].model,
    timing: { ...series[0].model.timing, moduleId: 'different' } } }], [25], [0]), null)
  const times = Array.from({ length: 201 }, (_, index) => index)
  const resistances = Array.from({ length: 101 }, (_, index) => index)
  assert.ok(times.length * resistances.length * 3 > SURTR_TOTAL_DAMAGE_TABLE_MAXIMUM_CELLS)
  assert.equal(buildSurtrTotalDamageTable(series.slice(0, 3), times, resistances), null)
  const maximumSamples = buildSurtrTotalDamageTable(series.slice(0, 1), times, [0])!
  assert.equal(maximumSamples.times.length, 201)
  for (const indices of [[-1, 0, 0], [0, -1, 0], [0, 0, -1], [201, 0, 0], [0, 1, 0], [0, 0, 1], [0.5, 0, 0]]) {
    assert.equal(getSurtrTotalDamageTablePoint(maximumSamples, indices[0], indices[1], indices[2]), null)
  }
})

test('TSVの3配置は同じ未丸めの数値を対応する順序で出力し、表示用精度だけを変える', () => {
  const selected = [comparisons()[6], comparisons()[0]]
  const result = buildSurtrTotalDamageTable(selected, [10.7, 25], [0, 60])!
  const before = structuredClone(result)
  const v = (time: number, resistance: number, series: number) =>
    getSurtrTotalDamageTablePoint(result, time, resistance, series)!.totalDamage.toFixed(2)
  const timeRows = buildSurtrTotalDamageTableTsv(result, 'time', 2).split('\r\n').map(row => row.split('\t'))
  assert.deepEqual(timeRows[0], ['素質2発動まで（秒）', 'MOD', '術耐性0', '術耐性60'])
  assert.deepEqual(timeRows[1], ['10.7', 'Y Lv.3', v(0, 0, 0), v(0, 1, 0)])
  assert.deepEqual(timeRows[2], ['10.7', '未装備', v(0, 0, 1), v(0, 1, 1)])
  const moduleRows = buildSurtrTotalDamageTableTsv(result, 'module', 2).split('\r\n').map(row => row.split('\t'))
  assert.deepEqual(moduleRows[0], ['MOD', '素質2発動まで（秒）', '術耐性0', '術耐性60'])
  assert.deepEqual(moduleRows[1], ['Y Lv.3', '10.7', v(0, 0, 0), v(0, 1, 0)])
  assert.deepEqual(moduleRows[2], ['Y Lv.3', '25', v(1, 0, 0), v(1, 1, 0)])
  const resistanceRows = buildSurtrTotalDamageTableTsv(result, 'resistance', 2).split('\r\n').map(row => row.split('\t'))
  assert.deepEqual(resistanceRows[0], ['術耐性', '10.7秒 Y Lv.3', '10.7秒 未装備', '25秒 Y Lv.3', '25秒 未装備'])
  assert.deepEqual(resistanceRows[1], ['0', v(0, 0, 0), v(0, 0, 1), v(1, 0, 0), v(1, 0, 1)])
  assert.deepEqual(resistanceRows[2], ['60', v(0, 1, 0), v(0, 1, 1), v(1, 1, 0), v(1, 1, 1)])
  assert.deepEqual(result, before)
})

test('TSVラベルは改行とタブを除き、表計算数式として評価されないようにする', () => {
  const item = { ...comparisons()[0], label: '=1\t+2\n' }
  const result = buildSurtrTotalDamageTable([item], [25], [0])!
  assert.ok(buildSurtrTotalDamageTableTsv(result, 'time').includes("\t'=1 +2\t"))
  assert.equal(formatSurtrTotalDamageTableValue(null, 1), '—')
  assert.equal(formatSurtrTotalDamageTableValue(Infinity, 1), '—')
  assert.equal(formatSurtrTotalDamageTableValue(1234.56, 1), '1,234.6')
  assert.equal(formatSurtrTotalDamageTableValue(1234.56, 1, false), '1234.6')
  assert.equal(formatSurtrTotalDamageTableValue(-0, 1), '0.0')
  assert.equal(formatSurtrTotalDamageTableValue(1.5, 5), '2')
})

// Compact fixture matching existing Surtr DPS/Remnant test source data.
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
        { addOrOverrideTalentDataBundle: { candidates: type === 'X'
          ? (level === 1 ? [] : [0, 4].map(rank => ({ talentIndex: 0, name: '劫火', requiredPotentialRank: rank,
            blackboard: { magic_resist_penetrate_fixed: [20, 24, 26][index] + (rank ? 2 : 0) },
          })))
          : (level === 1 ? [] : [0, 2].map(rank => ({ talentIndex: 1, name: '余燼', requiredPotentialRank: rank,
            blackboard: { 'surtr_t_2[withdraw].interval': (level === 3 ? 9 : 8) + (rank ? 1 : 0),
              'surtr_t_2[withdraw].attack_speed': level === 3 ? 30 : 20 },
          }))),
        } },
      ],
    })),
  }
}
