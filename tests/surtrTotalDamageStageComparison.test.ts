import assert from 'node:assert/strict'
import test from 'node:test'
import { classifySkill } from '../src/lib/classifier.ts'
import { getModuleComparisonColors } from '../src/lib/moduleColors.ts'
import type { SurtrDpsSettings } from '../src/lib/surtrDps.ts'
import {
  calculateSurtrTotalDamage,
  deriveSurtrTotalDamageModel,
  SURTR_TOTAL_DAMAGE_DEFAULT_ASSUMPTIONS,
  type SurtrTotalDamageAssumptions,
} from '../src/lib/surtrTotalDamage.ts'
import { buildSurtrStageMetricComparison, buildSurtrStageResistanceComparison, buildSurtrTotalDamageStageComparison,
  type SurtrStageMetric } from '../src/lib/surtrTotalDamageStageComparison.ts'
import type { RawOperatorModule, SkillRecord } from '../src/types/skill.ts'

const settings: SurtrDpsSettings = { level: 90, trust: 100, potential: 1, skillLevelIndex: 9, blocking: false }
const assumptions = SURTR_TOTAL_DAMAGE_DEFAULT_ASSUMPTIONS
const xId = 'uniequip_002_surtr'
const yId = 'uniequip_003_surtr'

test('未装備は一つの棒とし、全MOD段階をLv順・X/Y順で比較する', () => {
  const groups = buildSurtrTotalDamageStageComparison(createRecord(), settings, 25, 0, assumptions)
  assert.deepEqual(groups.map(group => [group.label, group.moduleLevel, group.bars.length]),
    [['未装備', 0, 1], ['Lv.1', 1, 2], ['Lv.2', 2, 2], ['Lv.3', 3, 2]])
  const bars = groups.flatMap(group => group.bars)
  assert.equal(bars.filter(bar => bar.moduleType === null).length, 1)
  assert.deepEqual(bars.map(bar => bar.id), [
    'none', `${xId}:lv1`, `${yId}:lv1`, `${xId}:lv2`, `${yId}:lv2`, `${xId}:lv3`, `${yId}:lv3`,
  ])
  assert.ok(bars.every(bar => bar.result !== null))
  assert.deepEqual(bars.map(bar => bar.color), getModuleComparisonColors(bars))
  for (const moduleType of ['X', 'Y']) {
    assert.equal(new Set(bars.filter(bar => bar.moduleType === moduleType).map(bar => bar.color)).size, 1)
  }
})

test('全段階の棒は既存エンジンの発動前・余燼中の実命中数と総ダメージに一致する', () => {
  const record = createRecord()
  for (const blocking of [false, true]) {
    for (const potential of [1, 3, 5]) {
      for (const ctCarry of ['time', 'ratio'] as const) {
        const activeSettings = { ...settings, blocking, potential }
        const timing = { ...assumptions, ctCarry, includeRetreatHit: true }
        for (const time of [0, 10.7, 25]) {
          const bars = buildSurtrTotalDamageStageComparison(record, activeSettings, time, 60, timing)
            .flatMap(group => group.bars)
          for (const bar of bars) {
            const model = deriveSurtrTotalDamageModel(record, activeSettings, bar.moduleId, bar.moduleLevel)!
            assert.ok(model)
            assert.deepEqual(bar.result, calculateSurtrTotalDamage(model, time, 60, timing, { includeAttacks: false }))
          }
        }
      }
    }
  }
})

test('YのLv2は攻撃速度、Lv3は攻撃速度と余燼の延長を総ダメージへ反映する', () => {
  const groups = buildSurtrTotalDamageStageComparison(createRecord(), settings, 10, 0, assumptions)
  const results = groups.slice(1).map(group => group.bars.find(bar => bar.moduleType === 'Y')!.result!)
  assert.deepEqual(results.map(result => result.retreatTime), [18, 18, 19])
  assert.deepEqual(results.map(result => result.totalHits), [14, 15, 17])
  assert.deepEqual(results.map(result => result.hitsBefore), [8, 8, 8])
  assert.ok(results[0].totalDamage < results[1].totalDamage)
  assert.ok(results[1].totalDamage < results[2].totalDamage)
})

test('術耐性は単発ダメージに、発動までの時間は攻撃回数に反映する', () => {
  const record = createRecord()
  const calculate = (time: number, resistance: number) =>
    buildSurtrTotalDamageStageComparison(record, settings, time, resistance, assumptions).flatMap(group => group.bars)
  const base = calculate(10, 0)
  const resistant = calculate(10, 60)
  const later = calculate(20, 0)
  base.forEach((bar, index) => {
    assert.equal(resistant[index].result!.totalHits, bar.result!.totalHits)
    assert.ok(resistant[index].result!.totalDamage < bar.result!.totalDamage)
    assert.ok(later[index].result!.totalHits > bar.result!.totalHits)
    assert.ok(later[index].result!.totalDamage > bar.result!.totalDamage)
  })
})

test('未解放や欠けたMOD段階は0とせずnullにし、他の段階の位置・色を保持する', () => {
  const record = createRecord()
  const initial = buildSurtrTotalDamageStageComparison(record, settings, 25, 0, assumptions)
  const locked = buildSurtrTotalDamageStageComparison(record, { ...settings, level: 59 }, 25, 0, assumptions)
  assert.ok(locked[0].bars[0].result)
  assert.ok(locked.slice(1).flatMap(group => group.bars).every(bar => bar.result === null))
  assert.ok(locked.slice(1).flatMap(group => group.bars).every(bar => bar.hitDelayLimit === null))
  record.operatorProfile.modules![0].phases = record.operatorProfile.modules![0].phases!.filter(phase => phase.equipLevel !== 2)
  record.operatorProfile.modules!.pop()
  const missing = buildSurtrTotalDamageStageComparison(record, settings, 25, 0, assumptions)
  assert.equal(missing[2].bars[0].result, null)
  assert.equal(missing[2].bars[0].hitDelayLimit, null)
  assert.ok(missing[1].bars[0].result)
  assert.ok(missing[3].bars[0].result)
  assert.ok(missing.slice(1).every(group => group.bars[1].result === null))
  assert.deepEqual(missing.flatMap(group => group.bars).map(bar => bar.color),
    initial.flatMap(group => group.bars).map(bar => bar.color))
})

test('命中遅延が長すぎても開放済み段階の上限を保持し、欠損データと区別できる', () => {
  const groups = buildSurtrTotalDamageStageComparison(createRecord(), settings, 25, 0, { ...assumptions, hitDelay: 1.1 })
  const y1 = groups[1].bars[1]
  const y2 = groups[2].bars[1]
  const y3 = groups[3].bars[1]
  assert.ok(y1.result)
  assert.equal(y1.hitDelayLimit, 1.25)
  assert.equal(y2.result, null)
  assert.equal(y3.result, null)
  assert.ok(Math.abs(y2.hitDelayLimit! - 1.25 / 1.2) < 1e-9)
  assert.ok(Math.abs(y3.hitDelayLimit! - 1.25 / 1.3) < 1e-9)
  assert.ok(groups.flatMap(group => group.bars).every(bar => bar.hitDelayLimit !== null))
})

test('無効入力は数値を返さず、有効な0命中は0ダメージとして保持する', () => {
  const record = createRecord()
  for (const [time, resistance] of [[-1, 0], [3601, 0], [25, -1], [25, 101], [Number.NaN, 0]]) {
    assert.ok(buildSurtrTotalDamageStageComparison(record, settings, time, resistance, assumptions)
      .flatMap(group => group.bars).every(bar => bar.result === null))
  }
  assert.ok(buildSurtrTotalDamageStageComparison(record, settings, 25, 0, { ...assumptions, hitDelay: 99 })
    .flatMap(group => group.bars).every(bar => bar.result === null))
  const zero = buildSurtrTotalDamageStageComparison(record, settings, 0, 0, { ...assumptions, firstAttackStart: 20 })
  assert.ok(zero.flatMap(group => group.bars).every(bar => bar.result?.totalHits === 0 && bar.result.totalDamage === 0))
  const wrongSkill = { ...record, skillIndex: 2 }
  assert.ok(buildSurtrTotalDamageStageComparison(wrongSkill, settings, 25, 0, assumptions)
    .flatMap(group => group.bars).every(bar => bar.result === null))
})

test('プロファイル・条件を変更せず、結果オブジェクトを使い回さない', () => {
  const record = createRecord()
  const originalRecord = structuredClone(record)
  const originalSettings = { ...settings }
  const first = buildSurtrTotalDamageStageComparison(record, settings, 25, 0, assumptions)
  first[0].bars[0].result!.totalDamage = 999
  const second = buildSurtrTotalDamageStageComparison(record, settings, 25, 0, assumptions)
  assert.notEqual(second[0].bars[0].result!.totalDamage, 999)
  assert.deepEqual(record, originalRecord)
  assert.deepEqual(settings, originalSettings)
})

const metrics: readonly SurtrStageMetric[] = ['before-dps', 'remnant-expected-damage']
const close = (actual: number | null, expected: number) => {
  assert.notEqual(actual, null)
  assert.ok(Math.abs(actual! - expected) < 1e-8, `${actual} != ${expected}`)
}

test('前DPS・余燼期待値は全期間と同じ全段階・3色を使い、標準条件の7値を返す', () => {
  const record = createRecord()
  const total = buildSurtrTotalDamageStageComparison(record, settings, 25, 0, assumptions)
  const expected = {
    'before-dps': [2655.2, 2979.072, 2810.4, 3046.464, 2844.8, 3090.528, 2861.6],
    'remnant-expected-damage': [20445.04, 22938.8544, 21640.08, 23457.7728, 26053.62666666667, 23797.0656, 31631.68615384615],
  }
  for (const metric of metrics) {
    const groups = buildSurtrStageMetricComparison(record, settings, 0, assumptions, metric)
    assert.deepEqual(groups.map(({ bars, ...group }) => ({ ...group,
      bars: bars.map(({ value, hitDelayLimit, ...bar }) => bar) })),
    total.map(({ bars, ...group }) => ({ ...group,
      bars: bars.map(({ result, hitDelayLimit, ...bar }) => bar) })))
    groups.flatMap(group => group.bars).forEach((bar, index) => {
      close(bar.value, expected[metric][index])
      assert.equal('result' in bar, false)
      assert.equal(bar.hitDelayLimit === null, metric === 'before-dps')
    })
  }
})

test('育成・スキル・ブロック・術耐性を両指標へ反映し、CT維持と命中遅延の期待値を解析式と照合する', () => {
  const record = createRecord()
  record.skillLevels[6].blackboard!.find(entry => entry.key === 'atk')!.value = 2.4
  const cases = [
    { ...settings, resistance: 0 },
    { ...settings, level: 60, trust: 0, skillLevelIndex: 6, resistance: 100 },
    { ...settings, level: 75, trust: 50, potential: 3, blocking: true, resistance: 60 },
    { ...settings, potential: 5, resistance: 90 },
  ]
  for (const active of cases) for (const ctCarry of ['time', 'ratio'] as const) for (const hitDelay of [0, 0.3, 0.9]) {
    const timing = { ...assumptions, ctCarry, hitDelay }
    const dps = buildSurtrStageMetricComparison(record, active, active.resistance, timing, 'before-dps').flatMap(group => group.bars)
    const damage = buildSurtrStageMetricComparison(record, active, active.resistance, timing, 'remnant-expected-damage').flatMap(group => group.bars)
    for (const [index, bar] of dps.entries()) {
      const isX = bar.moduleType === 'X'
      const isY = bar.moduleType === 'Y'
      const level = bar.moduleLevel
      const moduleAttack = level ? (isX ? [30, 48, 60] : [45, 55, 60])[level - 1] : 0
      const base = Math.round(544 + 128 * (active.level - 1) / 89 + active.trust + moduleAttack + (active.potential >= 4 ? 28 : 0))
      const attack = Math.floor(base * (active.skillLevelIndex === 6 ? 3.4 : 4.3) + 1e-9)
      const ignore = (isX ? [20, 20, 24, 26][level] : 20) + (active.potential >= 5 ? 2 : 0)
      const perHit = attack * Math.max(0.05, 1 - Math.max(0, active.resistance - ignore) / 100)
        * (isY && active.blocking ? 1.1 : 1)
      const beforeInterval = 1.25 / (isX && !active.blocking ? 1.08 : 1)
      const afterInterval = isY && level >= 2 ? 1.25 / (level === 3 ? 1.3 : 1.2) : beforeInterval
      const duration = 8 + (active.potential >= 3 ? 1 : 0) + (isY && level === 3 ? 1 : 0)
      const carriedCtRange = ctCarry === 'time' ? beforeInterval : afterInterval
      // Every possible attack contributes the fraction of CTs with an impact before retreat.
      let expectedHits = 0
      for (let hit = 0; hit * afterInterval < duration; hit += 1) {
        expectedHits += Math.min(1, Math.max(0, (duration - hitDelay - hit * afterInterval) / carriedCtRange))
      }
      close(bar.value, perHit / beforeInterval)
      close(damage[index].value, perHit * expectedHits)
      close(damage[index].hitDelayLimit, afterInterval)
    }
  }
})

test('前DPSは無関係な時間・余燼設定に阻害されず、期待値も初撃開始時刻を参照しない', () => {
  const record = createRecord()
  const before = buildSurtrStageMetricComparison(record, settings, 0, assumptions, 'before-dps')
  const invalidTiming = { firstAttackStart: Number.NaN, hitDelay: -1,
    ctCarry: 'invalid', includeRetreatHit: undefined } as unknown as SurtrTotalDamageAssumptions
  assert.deepEqual(buildSurtrStageMetricComparison(record, { ...settings, remnantActive: true }, 0, invalidTiming, 'before-dps'), before)
  const expected = buildSurtrStageMetricComparison(record, settings, 0, assumptions, 'remnant-expected-damage')
  for (const firstAttackStart of [-1, 3601, Number.NaN, Number.POSITIVE_INFINITY]) {
    const timing = { ...assumptions, firstAttackStart, activationTime: Number.NaN }
    assert.deepEqual(buildSurtrStageMetricComparison(record, { ...settings, remnantActive: true }, 0, timing, 'remnant-expected-damage'), expected)
  }
  // DPS needs no HP-drain or Remnant-duration data.
  record.skillLevels[9].blackboard = record.skillLevels[9].blackboard!.filter(entry => entry.key === 'atk')
  assert.deepEqual(buildSurtrStageMetricComparison(record, settings, 0, assumptions, 'before-dps'), before)
  assert.ok(buildSurtrStageMetricComparison(record, settings, 0, assumptions, 'remnant-expected-damage')
    .flatMap(group => group.bars).every(bar => bar.value === null && bar.hitDelayLimit === null))
})

test('新指標も未解放・欠損段階をnullにし、残りの位置・配色を保つ', () => {
  for (const metric of metrics) {
    const record = createRecord()
    const initial = buildSurtrStageMetricComparison(record, settings, 0, assumptions, metric)
    const locked = buildSurtrStageMetricComparison(record, { ...settings, level: 59 }, 0, assumptions, metric)
    assert.notEqual(locked[0].bars[0].value, null)
    assert.ok(locked.slice(1).flatMap(group => group.bars).every(bar => bar.value === null && bar.hitDelayLimit === null))
    record.operatorProfile.modules![0].phases = record.operatorProfile.modules![0].phases!.filter(phase => phase.equipLevel !== 2)
    record.operatorProfile.modules!.pop()
    const missing = buildSurtrStageMetricComparison(record, settings, 0, assumptions, metric)
    assert.equal(missing[2].bars[0].value, null)
    assert.equal(missing[2].bars[0].hitDelayLimit, null)
    assert.notEqual(missing[1].bars[0].value, null)
    assert.notEqual(missing[3].bars[0].value, null)
    assert.ok(missing.slice(1).every(group => group.bars[1].value === null && group.bars[1].hitDelayLimit === null))
    assert.deepEqual(missing.flatMap(group => group.bars).map(bar => [bar.moduleType, bar.moduleLevel, bar.color]),
      initial.flatMap(group => group.bars).map(bar => [bar.moduleType, bar.moduleLevel, bar.color]))
  }
})

test('関連する無効入力はnullとし、期待値の遅延上限と有効な0を保持する', () => {
  const record = createRecord()
  for (const metric of metrics) {
    for (const resistance of [-1, 101, Number.NaN]) {
      assert.ok(buildSurtrStageMetricComparison(record, settings, resistance, assumptions, metric)
        .flatMap(group => group.bars).every(bar => bar.value === null))
    }
    for (const changes of [{ level: 0 }, { trust: 101 }, { potential: 7 }, { skillLevelIndex: -1 }]) {
      assert.ok(buildSurtrStageMetricComparison(record, { ...settings, ...changes }, 0, assumptions, metric)
        .flatMap(group => group.bars).every(bar => bar.value === null))
    }
    assert.ok(buildSurtrStageMetricComparison({ ...record, skillIndex: 2 }, settings, 0, assumptions, metric)
      .flatMap(group => group.bars).every(bar => bar.value === null))
  }
  for (const changes of [{ hitDelay: -1 }, { hitDelay: Number.NaN }, { ctCarry: 'invalid' }, { includeRetreatHit: undefined }]) {
    const timing = { ...assumptions, ...changes } as SurtrTotalDamageAssumptions
    const bars = buildSurtrStageMetricComparison(record, settings, 0, timing, 'remnant-expected-damage').flatMap(group => group.bars)
    assert.ok(bars.every(bar => bar.value === null && bar.hitDelayLimit !== null))
  }
  const delayed = buildSurtrStageMetricComparison(record, settings, 0, { ...assumptions, hitDelay: 1.1 }, 'remnant-expected-damage')
  assert.notEqual(delayed[1].bars[1].value, null)
  assert.equal(delayed[2].bars[1].value, null)
  assert.equal(delayed[3].bars[1].value, null)
  close(delayed[3].bars[1].hitDelayLimit, 1.25 / 1.3)
  record.operatorProfile.talents[1].candidates![0].blackboard![0].value = 0.1
  assert.equal(buildSurtrStageMetricComparison(record, settings, 0, assumptions, 'remnant-expected-damage')[0].bars[0].value, 0)
})

test('連続一様CTでは退場同時命中の設定に期待値は変わらず、入力と出力を使い回さない', () => {
  const record = createRecord()
  const original = structuredClone({ record, settings, assumptions })
  for (const metric of metrics) {
    const first = buildSurtrStageMetricComparison(record, settings, 0, assumptions, metric)
    assert.deepEqual(buildSurtrStageMetricComparison(record, settings, 0, { ...assumptions, includeRetreatHit: true }, metric), first)
    first[0].bars[0].value = 999
    assert.notEqual(buildSurtrStageMetricComparison(record, settings, 0, assumptions, metric)[0].bars[0].value, 999)
  }
  assert.deepEqual({ record, settings, assumptions }, original)
})

const resistanceMetrics = [...metrics, 'total-damage'] as const

test('段階×術耐性の3指標は全セルが既存の単一術耐性計算と一致し、段階・術耐性・X/Yの順序を保持する', () => {
  const record = createRecord()
  const resistances = [60, 0, 100, 20, 60] as const
  for (const metric of resistanceMetrics) for (const blocking of [false, true]) for (const ctCarry of ['time', 'ratio'] as const) {
    const active = { ...settings, blocking, potential: 5 }
    const timing = { ...assumptions, hitDelay: 0.45, ctCarry }
    const groups = buildSurtrStageResistanceComparison(record, active, resistances, timing, metric, 10.7)
    assert.deepEqual(groups.map(({ id, label, moduleLevel }) => [id, label, moduleLevel]),
      [['none', '未装備', 0], ['lv1', 'Lv.1', 1], ['lv2', 'Lv.2', 2], ['lv3', 'Lv.3', 3]])
    groups.forEach(group => assert.deepEqual(group.resistanceGroups.map(item => item.resistance), resistances))
    resistances.forEach((resistance, resistanceIndex) => {
      const expected = metric === 'total-damage'
        ? buildSurtrTotalDamageStageComparison(record, active, 10.7, resistance, timing)
          .map(group => ({ ...group, bars: group.bars.map(({ result, ...bar }) => ({ ...bar, value: result?.totalDamage ?? null })) }))
        : buildSurtrStageMetricComparison(record, active, resistance, timing, metric)
      groups.forEach((group, stageIndex) => {
        assert.deepEqual(group.resistanceGroups[resistanceIndex].bars, expected[stageIndex].bars)
        assert.deepEqual(group.resistanceGroups[resistanceIndex].bars.map(bar => bar.moduleType), stageIndex === 0 ? [null] : ['X', 'Y'])
      })
    })
  }
})

test('空入力・部分範囲・両端を含む101点で入力数に応じた段階別セルを返す', () => {
  const record = createRecord()
  for (const metric of resistanceMetrics) for (const resistances of [[], [50], [20, 40, 60], Array.from({ length: 101 }, (_, index) => index)]) {
    const groups = buildSurtrStageResistanceComparison(record, settings, resistances, assumptions, metric)
    assert.equal(groups.length, 4)
    groups.forEach((group, index) => {
      assert.equal(group.resistanceGroups.length, resistances.length)
      assert.deepEqual(group.resistanceGroups.map(item => item.resistance), resistances)
      assert.ok(group.resistanceGroups.every(item => item.bars.length === (index === 0 ? 1 : 2)))
    })
    const bars = groups.flatMap(group => group.resistanceGroups.flatMap(item => item.bars))
    assert.equal(bars.length, 7 * resistances.length)
    assert.ok(bars.every(bar => bar.value !== null))
    for (const type of [null, 'X', 'Y']) {
      assert.equal(new Set(bars.filter(bar => bar.moduleType === type).map(bar => bar.color)).size, resistances.length ? 1 : 0)
    }
  }
  assert.deepEqual(buildSurtrStageResistanceComparison(record, settings, [0, 100], assumptions, 'total-damage'),
    buildSurtrStageResistanceComparison(record, settings, [0, 100], assumptions, 'total-damage', 25))
})

test('段階×術耐性は無効術耐性と未解放・欠損段階を省略せずnullで保持する', () => {
  for (const metric of resistanceMetrics) {
    const record = createRecord()
    const resistances = [0, -1, 100, 101, Number.NaN, Number.POSITIVE_INFINITY]
    const initial = buildSurtrStageResistanceComparison(record, settings, resistances, assumptions, metric)
    initial.forEach(group => group.resistanceGroups.forEach((item, index) => {
      assert.ok(item.bars.every(bar => (bar.value === null) === ![0, 2].includes(index)))
      assert.ok(item.bars.every(bar => metric === 'before-dps' || bar.hitDelayLimit !== null))
    }))
    const locked = buildSurtrStageResistanceComparison(record, { ...settings, level: 59 }, [0, 100], assumptions, metric)
    assert.ok(locked[0].resistanceGroups.every(item => item.bars[0].value !== null))
    assert.ok(locked.slice(1).flatMap(group => group.resistanceGroups.flatMap(item => item.bars))
      .every(bar => bar.value === null && bar.hitDelayLimit === null))
    record.operatorProfile.modules![0].phases = record.operatorProfile.modules![0].phases!.filter(phase => phase.equipLevel !== 2)
    record.operatorProfile.modules!.pop()
    const missing = buildSurtrStageResistanceComparison(record, settings, [0, 100], assumptions, metric)
    missing.slice(1).forEach(group => group.resistanceGroups.forEach(item => {
      assert.equal(item.bars[1].value, null)
      assert.equal(item.bars[1].hitDelayLimit, null)
      assert.equal(item.bars[0].value === null, group.moduleLevel === 2)
    }))
    assert.deepEqual(missing.flatMap(group => group.resistanceGroups[0].bars.map(bar => bar.color)),
      initial.flatMap(group => group.resistanceGroups[0].bars.map(bar => bar.color)))
  }
})

test('段階×術耐性でも無関係な時刻設定を無視し、全期間の時刻と期待値の命中遅延は反映する', () => {
  const record = createRecord()
  const resistances = [0, 60, 100]
  const invalidTiming = { firstAttackStart: Number.NaN, hitDelay: -1, ctCarry: 'invalid',
    includeRetreatHit: undefined } as unknown as SurtrTotalDamageAssumptions
  assert.deepEqual(buildSurtrStageResistanceComparison(record, settings, resistances, invalidTiming, 'before-dps', Number.NaN),
    buildSurtrStageResistanceComparison(record, settings, resistances, assumptions, 'before-dps'))
  assert.deepEqual(buildSurtrStageResistanceComparison(record, settings, resistances,
    { ...assumptions, firstAttackStart: Number.NaN }, 'remnant-expected-damage', -1),
  buildSurtrStageResistanceComparison(record, settings, resistances, assumptions, 'remnant-expected-damage'))
  const invalidTime = buildSurtrStageResistanceComparison(record, settings, resistances, assumptions, 'total-damage', -1)
  assert.ok(invalidTime.flatMap(group => group.resistanceGroups.flatMap(item => item.bars)).every(bar => bar.value === null))
  for (const metric of ['total-damage', 'remnant-expected-damage'] as const) {
    const delayed = buildSurtrStageResistanceComparison(record, settings, resistances, { ...assumptions, hitDelay: 1.1 }, metric)
    assert.ok(delayed[1].resistanceGroups.every(item => item.bars[1].value !== null))
    assert.ok(delayed.slice(2).every(group => group.resistanceGroups.every(item => item.bars[1].value === null && item.bars[1].hitDelayLimit !== null)))
  }
})

test('段階×術耐性の有効な0ダメージを欠損値へ変換しない', () => {
  const record = createRecord()
  const resistances = [0, 100, -1]
  const zero = buildSurtrStageResistanceComparison(record, settings, resistances,
    { ...assumptions, firstAttackStart: 20 }, 'total-damage', 0)
  zero.forEach(group => group.resistanceGroups.forEach((item, index) => {
    assert.ok(item.bars.every(bar => bar.value === (index === 2 ? null : 0)))
  }))
  record.operatorProfile.talents[1].candidates![0].blackboard![0].value = 0.1
  const short = buildSurtrStageResistanceComparison(record, settings, resistances, assumptions, 'remnant-expected-damage')
  assert.deepEqual(short[0].resistanceGroups.map(item => item.bars[0].value), [0, 0, null])
})

test('重複術耐性の出力を独立させ、元データ・条件・入力配列を変更しない', () => {
  const record = createRecord()
  const resistances = Object.freeze([60, 0, 60])
  const original = structuredClone({ record, settings, assumptions, resistances })
  for (const metric of resistanceMetrics) {
    const first = buildSurtrStageResistanceComparison(record, settings, resistances, assumptions, metric)
    first.forEach(group => {
      assert.deepEqual(group.resistanceGroups[0], group.resistanceGroups[2])
      assert.notEqual(group.resistanceGroups[0].bars, group.resistanceGroups[2].bars)
      assert.notEqual(group.resistanceGroups[0].bars[0], group.resistanceGroups[2].bars[0])
    })
    const expected = first[0].resistanceGroups[2].bars[0].value
    first[0].resistanceGroups[0].bars[0].value = 999
    assert.equal(first[0].resistanceGroups[2].bars[0].value, expected)
    assert.equal(buildSurtrStageResistanceComparison(record, settings, resistances, assumptions, metric)[0].resistanceGroups[0].bars[0].value, expected)
  }
  assert.deepEqual({ record, settings, assumptions, resistances }, original)
})

// Compact fixture matching the total-damage engine's existing source-data tests.
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
