import test from 'node:test'
import assert from 'node:assert/strict'
import type { GoldenglowExplosionModel } from '../src/lib/goldenglowExplosion.ts'
import {
  simulateGoldenglowTargetSwitchHp,
  type GoldenglowTargetSwitchHpInput,
} from '../src/lib/goldenglowTargetSwitchHp.ts'
import {
  chooseHpComparisonBaseline,
  createHpComparisonDisplaySeries,
  createHpComparisonUnequippedDifferenceSeries,
  getHpComparisonAutoBarCount,
  selectHpComparisonBarHps,
  simulateGoldenglowTargetSwitchHpComparison,
  validateHpComparisonInput,
  type HpComparisonBuild,
  type HpComparisonInput,
  type HpComparisonMessage,
  type HpComparisonSeries,
} from '../src/lib/goldenglowTargetSwitchHpComparison.ts'

const model: GoldenglowExplosionModel = {
  talentName: '電流暴走', talentDescription: '', damageType: 'ARTS',
  attackScale: 3, attackScalePercent: 300, nominalChancePercent: 10,
  prdStep: 0.015, prdMaxStack: 40, additionalDroneCount: 0, activeDroneCount: 3,
  resistanceIgnoreFixed: 15, droneInitialAttackScale: 0.2, droneInitialAttackScalePercent: 20,
  droneAttackScaleStep: 0.15, droneAttackScaleStepPercent: 15,
  droneMaxAttackScale: 1.1, droneMaxAttackScalePercent: 110, droneMaxStack: 6,
}

function build(id: string, overrides: Partial<GoldenglowTargetSwitchHpInput> = {}): HpComparisonBuild {
  return {
    id, label: id === 'none' ? '未装備' : `MOD ${id} Lv.3`,
    input: {
      model: { ...model }, skillIndex: 3, effectiveAttack: 703, attackInterval: 1.3, duration: 30,
      enemyHps: [1_000, 10_000, 20_000], enemyResistance: 30, enemyDefense: 0,
      switchDelay: 0.1, retargetRemainingDrones: true, trials: 37, seed: 20260908,
      ...overrides,
    },
  }
}

test('比較結果は各MODの独立したHP計算に一致し、同じ条件なら再現する', () => {
  const builds = [
    build('none'),
    build('X', { effectiveAttack: 801, model: { ...model, attackScale: 3.5, prdStep: 0.025 } }),
    build('Y', { effectiveAttack: 752, attackInterval: 1.15,
      model: { ...model, resistanceIgnoreFixed: 25, droneMaxAttackScale: 1.3 } }),
  ]
  const result = simulateGoldenglowTargetSwitchHpComparison({ builds })
  assert.deepEqual(result, builds.map((item) => ({
    id: item.id, label: item.label, points: simulateGoldenglowTargetSwitchHp(item.input).points,
  })))
  assert.deepEqual(simulateGoldenglowTargetSwitchHpComparison({ builds }), result)
  assert.notDeepEqual(result[0].points, result[1].points)
  assert.notDeepEqual(result[0].points, result[2].points)
})

test('MODごとのPRD抽選を使い、先のMODの爆発パターンを使い回さない', () => {
  const builds = [build('low', { model: { ...model, prdStep: 0 } }),
    build('high', { model: { ...model, prdStep: 1 } })]
  const result = simulateGoldenglowTargetSwitchHpComparison({ builds })
  assert.notDeepEqual(result[0].points, result[1].points)
  assert.deepEqual(result[1].points, simulateGoldenglowTargetSwitchHp(builds[1].input).points)
})

test('進捗はMOD順・HP順に通知し、全MODに通じた点数を返す', () => {
  const builds = [build('none'), build('X')]
  const progress: Extract<HpComparisonMessage, { type: 'point' }>[] = []
  const result = simulateGoldenglowTargetSwitchHpComparison({ builds }, (message) => {
    progress.push(structuredClone(message))
    message.point.expectedDamage = -1
    message.point.enemyHp = -1
  })
  assert.deepEqual(progress.map((message) => [message.buildId, message.point.enemyHp, message.completedPoints, message.totalPoints]), [
    ['none', 1_000, 1, 6], ['none', 10_000, 2, 6], ['none', 20_000, 3, 6],
    ['X', 1_000, 4, 6], ['X', 10_000, 5, 6], ['X', 20_000, 6, 6],
  ])
  assert.deepEqual(progress.map((message) => message.point), result.flatMap((item) => item.points))
})

test('全MODの条件は開始時に固定し、途中の呼び出し元の変更を混ぜない', () => {
  const setup = { builds: [build('none'), build('X')] }
  setup.builds[0].moduleType = null
  setup.builds[0].potential = 1
  setup.builds[1].moduleType = 'X'
  setup.builds[1].potential = 4
  const expected = simulateGoldenglowTargetSwitchHpComparison(setup)
  const result = simulateGoldenglowTargetSwitchHpComparison(setup, (message) => {
    if (message.completedPoints !== 1) return
    setup.builds[1].id = 'changed'
    setup.builds[1].moduleType = 'Y'
    setup.builds[1].potential = 6
    setup.builds[1].input.model.prdStep = 1
    ;(setup.builds[1].input.enemyHps as number[])[0] = 1
    setup.builds[1].input.effectiveAttack = 1
  })
  assert.deepEqual(result, expected)
  const frozen = { builds: [build('none'), build('X')] }
  const before = structuredClone(frozen)
  for (const item of frozen.builds) {
    Object.freeze(item.input.model)
    Object.freeze(item.input.enemyHps)
    Object.freeze(item.input)
    Object.freeze(item)
  }
  Object.freeze(frozen.builds)
  Object.freeze(frozen)
  simulateGoldenglowTargetSwitchHpComparison(frozen)
  assert.deepEqual(frozen, before)
})

test('MODの種類と潜在は表示名や系列順から推測せず、計算と全表示形式へ引き継ぐ', () => {
  const builds: HpComparisonBuild[] = [
    { ...build('opaque-y'), label: '表示名を変更した装備', moduleType: 'Y', potential: 2 },
    { ...build('opaque-none'), label: 'MOD Xという名前でも未装備', moduleType: null, potential: 1 },
    { ...build('opaque-x'), label: '別名の装備 Lv.1', moduleType: 'X', potential: 6 },
    { ...build('opaque-unknown'), label: 'MOD Y', potential: 3 },
  ]
  const result = simulateGoldenglowTargetSwitchHpComparison({ builds })
  const identity = (item: { id: string; moduleType?: string | null; potential?: number }) => (
    [item.id, item.moduleType, item.potential]
  )
  assert.deepEqual(result.map(identity), builds.map(identity))
  const reordered = [...result].reverse().map((item) => ({ ...item, label: '同じ表示名' }))
  for (const metric of ['total', 'difference', 'percent'] as const) {
    const display = createHpComparisonDisplaySeries(reordered, [1_000, 10_000], metric, 'opaque-none')
    assert.deepEqual(display.map(identity), [...builds].reverse().map(identity))
    assert.equal(display[0].moduleType, undefined)
    assert.equal(display[2].moduleType, null)
  }
  const partial = result.map((item, index) => ({ ...item, points: index === 0 ? item.points : [] }))
  const partialDisplay = createHpComparisonDisplaySeries(partial, [1_000], 'total', 'opaque-none')
  assert.deepEqual(partialDisplay.map(identity), builds.map(identity))
  assert.equal(partialDisplay[1].points[0].value, null)
})

test('後ろのMODの不正な条件も最初の進捗通知前に拒否する', () => {
  const invalid: Partial<GoldenglowTargetSwitchHpInput>[] = [
    { enemyHps: [] }, { enemyHps: [1_000, 0] }, { enemyHps: [1.5] },
    { enemyHps: [Infinity] }, { enemyHps: [1_000_000_001] },
    { enemyHps: Array.from({ length: 101 }, (_, index) => index + 1) },
    { enemyResistance: NaN }, { effectiveAttack: NaN }, { attackInterval: 0 },
    { model: null as unknown as GoldenglowExplosionModel }, { trials: 0 },
    { retargetRemainingDrones: 'yes' as unknown as boolean },
  ]
  for (const overrides of invalid) {
    let notified = false
    assert.throws(() => simulateGoldenglowTargetSwitchHpComparison({ builds: [build('none'), build('X', overrides)] },
      () => { notified = true }), RangeError)
    assert.equal(notified, false)
  }
})

test('比較で固定する条件が異なるMODを拒否する', () => {
  const differences: Partial<GoldenglowTargetSwitchHpInput>[] = [
    { skillIndex: 2 }, { duration: 40 }, { enemyDefense: 100 }, { enemyResistance: 35 },
    { switchDelay: 0 }, { retargetRemainingDrones: false }, { trials: 38 }, { seed: 123 },
    { enemyHps: [10_000, 1_000, 20_000] },
  ]
  for (const difference of differences) {
    assert.throws(() => validateHpComparisonInput({ builds: [build('none'), build('X', difference)] }), /揃えて/)
  }
})

test('不正な比較リスト・名前・重複IDを拒否する', () => {
  for (const bad of [null, undefined, {}, { builds: null }, { builds: [] },
    { builds: Array.from({ length: 9 }, (_, index) => build(String(index))) },
    { builds: [build('X'), build('X')] }, { builds: [null] },
    { builds: [{ ...build('X'), id: '' }] }, { builds: [{ ...build('X'), label: '' }] },
    { builds: [{ ...build('X'), input: null }] },
  ]) {
    assert.throws(() => validateHpComparisonInput(bad as HpComparisonInput), RangeError)
  }
})

test('各MODが上限以内でも比較全体の計算量が大きい場合は開始前に拒否する', () => {
  const common = { duration: 30, attackInterval: 0.1, trials: 3_000,
    enemyHps: Array.from({ length: 100 }, (_, index) => (index + 1) * 100) }
  const builds = [build('none', common), build('X', common), build('Y', common)]
  for (const item of builds) assert.doesNotThrow(() => validateHpComparisonInput({ builds: [item] }))
  let notified = false
  assert.throws(() => simulateGoldenglowTargetSwitchHpComparison({ builds }, () => { notified = true }), /MOD比較全体/)
  assert.equal(notified, false)
})

test('後ろのMODの抽選データ容量も開始前に検証する', () => {
  const common = { duration: 300, trials: 1_000, enemyHps: [1_000], model: { ...model, activeDroneCount: 1 } }
  let notified = false
  assert.throws(() => simulateGoldenglowTargetSwitchHpComparison({
    builds: [build('none', common), build('X', { ...common, attackInterval: 0.05 })],
  }, () => { notified = true }), /抽選データ/)
  assert.equal(notified, false)
})

const totals: HpComparisonSeries[] = [
  { id: 'none', label: '未装備', points: [
    { enemyHp: 1_000, expectedDamage: 100.25 }, { enemyHp: 2_000, expectedDamage: 200 },
    { enemyHp: 3_000, expectedDamage: 0 },
  ] },
  { id: 'X', label: 'MOD X', points: [
    { enemyHp: 2_000, expectedDamage: 100 }, { enemyHp: 1_000, expectedDamage: 150.375 },
    { enemyHp: 4_000, expectedDamage: 400 }, { enemyHp: 3_000, expectedDamage: 10 },
  ] },
]

test('表示値はHPで対応づけ、全精度の総量・正負の差・増加率を生成する', () => {
  const hps = [1_000, 2_000, 3_000, 4_000]
  const before = structuredClone(totals)
  const total = createHpComparisonDisplaySeries(totals, hps, 'total', 'none')
  assert.deepEqual(total[1].points.map((point) => point.value), [150.375, 100, 10, 400])
  const diff = createHpComparisonDisplaySeries(totals, hps, 'difference', 'none')
  assert.deepEqual(diff[0].points.map((point) => point.value), [0, 0, 0, null])
  assert.deepEqual(diff[1].points.map((point) => point.value), [50.125, -100, 10, null])
  const percent = createHpComparisonDisplaySeries(totals, hps, 'percent', 'none')
  assert.deepEqual(percent[0].points.map((point) => point.value), [0, 0, null, null])
  assert.deepEqual(percent[1].points.map((point) => point.value), [50, -50, null, null])
  assert.deepEqual(totals, before)
})

test('基準を変更すると同じ計算結果から差分を作り直せる', () => {
  const display = createHpComparisonDisplaySeries(totals, [1_000, 2_000], 'difference', 'X')
  assert.deepEqual(display[0].points.map((point) => point.value), [-50.125, 100])
  assert.deepEqual(display[1].points.map((point) => point.value), [0, 0])
})

test('基準または比較値が未計算のHPは補間せず欠損として残す', () => {
  const partial: HpComparisonSeries[] = [totals[0], { id: 'X', label: 'MOD X', points: [] }]
  const display = createHpComparisonDisplaySeries(partial, [500, 1_000, 1_500], 'difference', 'none')
  assert.deepEqual(display[0].points.map((point) => point.value), [null, 0, null])
  assert.deepEqual(display[1].points.map((point) => point.value), [null, null, null])
  assert.deepEqual(createHpComparisonDisplaySeries([], [1_000], 'total', ''), [])
})

test('存在しない基準は未装備、次に先頭へ戻し、有限でない値は表示しない', () => {
  assert.equal(chooseHpComparisonBaseline(totals, 'X'), 'X')
  assert.equal(chooseHpComparisonBaseline([...totals].reverse(), 'missing'), 'none')
  assert.equal(chooseHpComparisonBaseline([{ id: 'Y' }, { id: 'X' }], 'missing'), 'Y')
  assert.equal(chooseHpComparisonBaseline([], 'none'), '')
  assert.deepEqual(createHpComparisonDisplaySeries(totals, [1_000], 'difference', 'missing')[1].points,
    [{ enemyHp: 1_000, value: 50.125 }])
  const bad = [{ id: 'X', label: 'X', points: [{ enemyHp: 1_000, expectedDamage: NaN }] }]
  assert.deepEqual(createHpComparisonDisplaySeries(bad, [1_000], 'total', 'X')[0].points,
    [{ enemyHp: 1_000, value: null }])
})

test('棒グラフの代表HPは全範囲から均等に5点を選び、最小・最大HPを含める', () => {
  const hps = Object.freeze(Array.from({ length: 20 }, (_, index) => (index + 1) * 1_000))
  assert.deepEqual(selectHpComparisonBarHps(hps), [1_000, 6_000, 11_000, 15_000, 20_000])
  assert.deepEqual(selectHpComparisonBarHps([30_000, 900, 50, 8_000, 400, 15_000, 1_300]),
    [50, 900, 1_300, 15_000, 30_000])
  assert.deepEqual(hps, Array.from({ length: 20 }, (_, index) => (index + 1) * 1_000))
})

test('5点以下のHPは全点を残し、重複・非正数・有限でない値だけを除く', () => {
  const hps = Object.freeze([3_000, 0, 1_000, 2_000, 1_000, -1, NaN, Infinity, -Infinity])
  assert.deepEqual(selectHpComparisonBarHps(hps), [1_000, 2_000, 3_000])
  assert.deepEqual(selectHpComparisonBarHps([0, NaN, -1]), [])
  assert.deepEqual(selectHpComparisonBarHps([5, 4, 3, 2, 1], 3), [1, 2, 3, 4, 5])
})

test('選択したHPは両端以外の一番近い代表点と入れ替え、等距離では小さい代表点を使う', () => {
  const hps = Array.from({ length: 20 }, (_, index) => (index + 1) * 1_000)
  assert.deepEqual(selectHpComparisonBarHps(hps, 2_000), [1_000, 2_000, 11_000, 15_000, 20_000])
  assert.deepEqual(selectHpComparisonBarHps(hps, 19_000), [1_000, 6_000, 11_000, 19_000, 20_000])
  assert.deepEqual(selectHpComparisonBarHps(hps, 13_000), [1_000, 6_000, 13_000, 15_000, 20_000])
  for (const selected of [1_000, 20_000, 6_000, 1_500, NaN, Infinity, null]) {
    assert.deepEqual(selectHpComparisonBarHps(hps, selected), [1_000, 6_000, 11_000, 15_000, 20_000])
  }
})

test('棒グラフの手動点数と全点指定は、重複なしで指定数と全範囲を保つ', () => {
  const hps = Object.freeze(Array.from({ length: 100 }, (_, index) => (index + 1) * 1_000))
  for (const count of [3, 5, 10, 15, 99, 100, 120]) {
    for (const selectedHp of [null, ...hps]) {
      const sampled = selectHpComparisonBarHps(hps, selectedHp, count)
      assert.equal(sampled.length, Math.min(count, hps.length))
      assert.equal(new Set(sampled).size, sampled.length)
      assert.equal(sampled[0], hps[0])
      assert.equal(sampled.at(-1), hps.at(-1))
      assert.deepEqual(sampled, [...sampled].sort((left, right) => left - right))
      assert.ok(sampled.every((hp) => hps.includes(hp)))
      if (selectedHp !== null) assert.ok(sampled.includes(selectedHp))
    }
  }
  assert.deepEqual(selectHpComparisonBarHps(hps, 7_000, 'all'), hps)
  assert.deepEqual(selectHpComparisonBarHps([3, NaN, 1, 2, 2, 0, -1, Infinity], 2, 'all'), [1, 2, 3])
  assert.deepEqual(selectHpComparisonBarHps([], null, 'all'), [])
})

test('小さい点数は選択HPを優先し、小数・不正な点数・空配列も安全に扱う', () => {
  const hps = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  assert.deepEqual(selectHpComparisonBarHps(hps, null, 1), [1])
  assert.deepEqual(selectHpComparisonBarHps(hps, 7, 1), [7])
  assert.deepEqual(selectHpComparisonBarHps(hps, null, 2), [1, 9])
  assert.deepEqual(selectHpComparisonBarHps(hps, 2, 2), [2, 9])
  assert.deepEqual(selectHpComparisonBarHps(hps, null, 3.9), [1, 5, 9])
  for (const count of [0, -1, 0.5]) {
    assert.deepEqual(selectHpComparisonBarHps(hps, null, count), [1])
    assert.deepEqual(selectHpComparisonBarHps(hps, 7, count), [7])
  }
  for (const count of [NaN, Infinity, -Infinity]) {
    assert.deepEqual(selectHpComparisonBarHps(hps, null, count), [1, 3, 5, 7, 9])
  }
  for (const count of [0, 1, 2, 5, 100, NaN, Infinity]) {
    assert.deepEqual(selectHpComparisonBarHps([], 1, count), [])
    assert.deepEqual(selectHpComparisonBarHps([0, NaN, -1], 1, count), [])
  }
})

test('自動の棒グラフ点数は描画幅に応じて5〜15点で単調に増える', () => {
  assert.equal(getHpComparisonAutoBarCount(310, 3), 5)
  assert.equal(getHpComparisonAutoBarCount(620, 3), 10)
  assert.equal(getHpComparisonAutoBarCount(930, 3), 15)
  let previous = 5
  for (let width = 1; width <= 2_000; width += 17) {
    const count = getHpComparisonAutoBarCount(width, 3)
    assert.ok(Number.isInteger(count) && count >= 5 && count <= 15)
    assert.ok(count >= previous)
    previous = count
  }
})

test('自動の棒グラフ点数は系列が多いほど減らし、少ない系列も間隔を確保する', () => {
  assert.equal(getHpComparisonAutoBarCount(620, 1), 10)
  assert.equal(getHpComparisonAutoBarCount(620, 2), 10)
  assert.equal(getHpComparisonAutoBarCount(620, 4), 7)
  assert.equal(getHpComparisonAutoBarCount(620, 8), 5)
  for (const width of [310, 620, 930, 1_240, 2_000]) {
    let previous = 15
    for (let series = 1; series <= 8; series += 1) {
      const count = getHpComparisonAutoBarCount(width, series)
      assert.ok(count <= previous)
      previous = count
    }
  }
})

test('自動の棒グラフ点数は未測定・不正な幅や系列数でも有限の整数を返す', () => {
  for (const width of [0, -1, NaN, Infinity, -Infinity]) {
    assert.equal(getHpComparisonAutoBarCount(width, 3), 5)
  }
  for (const series of [0, -1, NaN, Infinity, -Infinity]) {
    assert.equal(getHpComparisonAutoBarCount(620, series), 10)
  }
  assert.equal(getHpComparisonAutoBarCount(620, 3.1), 7)
  assert.equal(getHpComparisonAutoBarCount(Number.MAX_VALUE, 3), 15)
  assert.equal(getHpComparisonAutoBarCount(620, Number.MAX_VALUE), 5)
})

test('未装備との差は全精度の正負の差とゼロ基準を保ち、入力と装備情報を変えない', () => {
  const series: HpComparisonSeries[] = [
    { ...totals[1], moduleType: 'X', potential: 4 },
    { ...totals[0], moduleType: null, potential: 1 },
  ]
  const before = structuredClone(series)
  for (const item of series) {
    item.points.forEach(Object.freeze)
    Object.freeze(item.points)
    Object.freeze(item)
  }
  Object.freeze(series)
  const result = createHpComparisonUnequippedDifferenceSeries(series, [1_000, 2_000, 3_000, 4_000])
  assert.deepEqual(result[0], { id: 'X', label: 'MOD X', moduleType: 'X', potential: 4, points: [
    { enemyHp: 1_000, value: 50.125 }, { enemyHp: 2_000, value: -100 },
    { enemyHp: 3_000, value: 10 }, { enemyHp: 4_000, value: null },
  ] })
  assert.deepEqual(result[1], { id: 'none', label: '未装備', moduleType: null, potential: 1, points: [
    { enemyHp: 1_000, value: 0 }, { enemyHp: 2_000, value: 0 },
    { enemyHp: 3_000, value: 0 }, { enemyHp: 4_000, value: null },
  ] })
  assert.deepEqual(series, before)
})

test('未装備がない差分では他の装備を基準にせず、全点を未計算にする', () => {
  const series: HpComparisonSeries[] = [
    { ...totals[1], moduleType: 'X', potential: 4 },
    { ...totals[0], id: 'opaque-none', moduleType: null, potential: 1 },
  ]
  const result = createHpComparisonUnequippedDifferenceSeries(series, [1_000, 2_000])
  assert.deepEqual(result, series.map(({ points: _points, ...identity }) => ({
    ...identity,
    points: [{ enemyHp: 1_000, value: null }, { enemyHp: 2_000, value: null }],
  })))
  assert.deepEqual(createHpComparisonUnequippedDifferenceSeries([], [1_000]), [])
})

test('未装備との差は途中結果と不正値を補間したりゼロ扱いしたりしない', () => {
  const result = createHpComparisonUnequippedDifferenceSeries([
    { id: 'none', label: '未装備', points: [
      { enemyHp: 1_000, expectedDamage: 100 }, { enemyHp: 2_000, expectedDamage: Infinity },
    ] },
    { id: 'X', label: 'MOD X', points: [
      { enemyHp: 1_000, expectedDamage: NaN }, { enemyHp: 2_000, expectedDamage: 200 },
      { enemyHp: 3_000, expectedDamage: 300 },
    ] },
    { id: 'Y', label: 'MOD Y', points: [] },
  ], [1_000, 2_000, 3_000])
  assert.deepEqual(result[0].points.map(({ value }) => value), [0, null, null])
  assert.deepEqual(result[1].points.map(({ value }) => value), [null, null, null])
  assert.deepEqual(result[2].points.map(({ value }) => value), [null, null, null])
})
