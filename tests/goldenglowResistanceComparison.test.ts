import test from 'node:test'
import assert from 'node:assert/strict'
import type { GoldenglowExplosionModel } from '../src/lib/goldenglowExplosion.ts'
import {
  GOLDENGLOW_TARGET_SWITCH_LIMITS,
  type GoldenglowTargetSwitchExecutionOptions,
} from '../src/lib/goldenglowTargetSwitch.ts'
import {
  GOLDENGLOW_TARGET_SWITCH_GRID_LIMITS,
  simulateGoldenglowTargetSwitchGrid,
} from '../src/lib/goldenglowTargetSwitchGrid.ts'
import type { GoldenglowTargetSwitchHpInput } from '../src/lib/goldenglowTargetSwitchHp.ts'
import {
  HP_COMPARISON_LIMITS,
  simulateGoldenglowTargetSwitchHpComparison,
  type HpComparisonBuild,
} from '../src/lib/goldenglowTargetSwitchHpComparison.ts'
import {
  createResistanceComparisonDisplaySeries,
  simulateGoldenglowResistanceComparison,
  validateResistanceComparisonInput,
  type ResistanceComparisonInput,
  type ResistanceComparisonMessage,
  type ResistanceComparisonSeries,
} from '../src/lib/goldenglowResistanceComparison.ts'

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
    id, label: id === 'none' ? '未装備' : `MOD ${id}`, moduleType: id === 'none' ? null : id, potential: 1,
    input: {
      model: { ...model }, skillIndex: 3, effectiveAttack: 703, attackInterval: 1.3, duration: 12,
      enemyHps: [10_000, 1_000, 20_000], enemyResistance: 30, enemyDefense: 0,
      switchDelay: 0.1, retargetRemainingDrones: true, trials: 37, seed: 20260925,
      ...overrides,
    },
  }
}

function independentGridSeries(input: ResistanceComparisonInput): ResistanceComparisonSeries[] {
  return input.builds.map(({ input: setup, ...identity }) => {
    const grid = simulateGoldenglowTargetSwitchGrid({ ...setup, enemyResistances: input.enemyResistances })
    return {
      ...identity,
      points: grid.rows.flatMap((row) => setup.enemyHps.map((enemyHp, index) => ({
        enemyHp, enemyResistance: row.enemyResistance, expectedDamage: row.expectedDamages[index],
        damageBreakdown: row.damageBreakdowns[index],
      }))),
    }
  })
}

function assertRejectedBeforeAllocation(input: ResistanceComparisonInput, message?: RegExp): void {
  const original = globalThis.Uint16Array
  let notified = false
  globalThis.Uint16Array = new Proxy(original, {
    construct() { assert.fail('不正な条件で抽選バッファを確保した') },
  })
  try {
    assert.throws(() => validateResistanceComparisonInput(input), message ?? RangeError)
    assert.throws(() => simulateGoldenglowResistanceComparison(input, () => { notified = true }), message ?? RangeError)
    assert.equal(notified, false)
  } finally {
    globalThis.Uint16Array = original
  }
}

test('S1/S2/S3と両切り替え方式で各MODの独立したHP×術耐性計算と完全一致する', () => {
  for (const skillIndex of [1, 2, 3]) for (const retargetRemainingDrones of [false, true]) {
    const common = { skillIndex, retargetRemainingDrones }
    const setup = { enemyResistances: [70, 0, 100, 30], builds: [
      build('none', common),
      build('X', { ...common, effectiveAttack: 801, model: { ...model, prdStep: 0.025, attackScale: 3.5 } }),
      build('Y', { ...common, effectiveAttack: 752, attackInterval: 1.15,
        model: { ...model, resistanceIgnoreFixed: 25, droneMaxAttackScale: 1.3 } }),
    ] }
    const result = simulateGoldenglowResistanceComparison(setup)
    assert.deepEqual(result, independentGridSeries(setup))
    assert.deepEqual(simulateGoldenglowResistanceComparison(setup), result)
    assert.notDeepEqual(result[0].points, result[1].points)
    assert.notDeepEqual(result[0].points, result[2].points)
  }
})

test('同じ抽選番号でも各MODは自身のPRD条件を使い、抵抗値1件では既存HP比較に一致する', () => {
  const builds = [build('low', { model: { ...model, prdStep: 0 } }),
    build('high', { model: { ...model, prdStep: 1 } })]
  const result = simulateGoldenglowResistanceComparison({ builds, enemyResistances: [30] })
  assert.notDeepEqual(result[0].points, result[1].points)
  assert.deepEqual(result.map((item) => ({
    ...item, points: item.points.map(({ enemyResistance: _resistance, ...point }) => point),
  })), simulateGoldenglowTargetSwitchHpComparison({ builds }))
})

test('進捗はMOD・指定術耐性・指定HPの順で全体点数を返し、コールバックから最終結果を変更できない', () => {
  const setup = { builds: [build('none'), build('X')], enemyResistances: [70, 0] }
  const progress: Extract<ResistanceComparisonMessage, { type: 'point' }>[] = []
  const result = simulateGoldenglowResistanceComparison(setup, (message) => {
    progress.push(structuredClone(message))
    message.point.enemyHp = -1
    message.point.enemyResistance = -1
    message.point.expectedDamage = -1
    message.point.damageBreakdown!.normalDamage = -1
    message.point.damageBreakdown!.explosionDamage = -1
    message.point.damageBreakdown!.bodyDamage = -1
    message.completedPoints = -1
  })
  const expectedOrder = setup.builds.flatMap((item) => setup.enemyResistances.flatMap((resistance) => (
    item.input.enemyHps.map((hp) => [item.id, resistance, hp])
  )))
  assert.deepEqual(progress.map((item) => [item.buildId, item.point.enemyResistance, item.point.enemyHp]), expectedOrder)
  assert.deepEqual(progress.map((item) => item.completedPoints), Array.from({ length: 12 }, (_, index) => index + 1))
  assert.ok(progress.every((item) => item.totalPoints === 12))
  assert.deepEqual(progress.map((item) => item.point), result.flatMap((item) => item.points))
  assert.deepEqual(result, independentGridSeries(setup))
})

test('開始時に全MOD・全術耐性・表示情報を固定し、呼び出し元の途中変更や凍結入力に影響されない', () => {
  const setup = { builds: [build('none'), build('X')], enemyResistances: [0, 70] }
  const original = structuredClone(setup)
  const expected = simulateGoldenglowResistanceComparison(setup)
  const result = simulateGoldenglowResistanceComparison(setup, (message) => {
    if (message.completedPoints !== 1) return
    setup.enemyResistances[1] = 20
    setup.enemyResistances.push(100)
    const next = setup.builds[1]
    next.id = 'changed'
    next.label = 'changed'
    next.moduleType = 'Y'
    next.potential = 6
    next.input.model.prdStep = 1
    next.input.effectiveAttack = 1
    ;(next.input.enemyHps as number[])[0] = 1
    setup.builds.push(build('extra'))
  })
  assert.deepEqual(result, expected)
  for (const item of original.builds) {
    Object.freeze(item.input.model)
    Object.freeze(item.input.enemyHps)
    Object.freeze(item.input)
    Object.freeze(item)
  }
  Object.freeze(original.enemyResistances)
  Object.freeze(original.builds)
  Object.freeze(original)
  assert.deepEqual(simulateGoldenglowResistanceComparison(original), expected)
})

test('元の単一術耐性は無視し、選択した術耐性軸だけを検証して使用する', () => {
  const setup = { builds: [build('none', { enemyResistance: NaN }), build('X', { enemyResistance: 999 })],
    enemyResistances: [0, 23.5, 100] }
  assert.doesNotThrow(() => validateResistanceComparisonInput(setup))
  assert.deepEqual(simulateGoldenglowResistanceComparison(setup), independentGridSeries(setup))
})

test('後続MODの不正条件・不正HPは最初の抽選バッファや進捗より前に拒否する', () => {
  const invalid: Partial<GoldenglowTargetSwitchHpInput>[] = [
    { enemyHps: [] }, { enemyHps: [0] }, { enemyHps: [1.5] }, { enemyHps: [NaN] },
    { enemyHps: [Infinity] }, { enemyHps: [1_000_000_001] }, { enemyHps: [1_000, 1_000] },
    { enemyHps: new Array(2) }, { enemyHps: Array.from({ length: 101 }, (_, index) => index + 1) },
    { effectiveAttack: NaN }, { attackInterval: 0 }, { trials: 0 },
    { model: null as unknown as GoldenglowExplosionModel },
    { retargetRemainingDrones: 'yes' as unknown as boolean },
  ]
  for (const overrides of invalid) {
    assertRejectedBeforeAllocation({ builds: [build('none'), build('X', overrides)], enemyResistances: [0, 70] })
  }
})

test('比較するMODで共有するスキル・HP・計測条件・抽選番号の差を開始前に拒否する', () => {
  const differences: Partial<GoldenglowTargetSwitchHpInput>[] = [
    { skillIndex: 2 }, { duration: 13 }, { enemyDefense: 100 }, { switchDelay: 0 },
    { retargetRemainingDrones: false }, { trials: 38 }, { seed: 123 },
    { enemyHps: [1_000, 10_000, 20_000] },
  ]
  for (const difference of differences) {
    assertRejectedBeforeAllocation({ builds: [build('none'), build('X', difference)], enemyResistances: [0, 70] }, /揃えて/)
  }
  assert.doesNotThrow(() => validateResistanceComparisonInput({
    builds: [build('none', { retargetRemainingDrones: undefined }), build('X', { retargetRemainingDrones: false })],
    enemyResistances: [0],
  }))
})

test('不正なリスト・識別情報・重複ID・重複術耐性を拒否する', () => {
  const setup = { builds: [build('none')], enemyResistances: [0, 70] }
  for (const bad of [null, undefined, {}, { ...setup, builds: null }, { ...setup, builds: [] },
    { ...setup, builds: new Array(2) }, { ...setup, builds: [null] },
    { ...setup, builds: Array.from({ length: 9 }, (_, index) => build(String(index))) },
    { ...setup, builds: [build('X'), build('X')] },
    { ...setup, builds: [{ ...build('X'), id: ' ' }] },
    { ...setup, builds: [{ ...build('X'), label: '' }] },
    { ...setup, builds: [{ ...build('X'), input: null }] },
    ...[undefined, null, [], [0, 0], [-1], [101], [NaN], [Infinity], new Array(2),
      Array.from({ length: 102 }, (_, index) => index / 2),
    ].map((enemyResistances) => ({ ...setup, enemyResistances })),
  ]) assertRejectedBeforeAllocation(bad as ResistanceComparisonInput)
})

test('HP×術耐性のセル数上限と全MODの計算量上限を維持する', () => {
  const hundredHps = Array.from({ length: 100 }, (_, index) => (index + 1) * 100)
  assertRejectedBeforeAllocation({ builds: [build('none', { enemyHps: hundredHps })],
    enemyResistances: Array.from({ length: 11 }, (_, index) => index * 10) }, /1000/)
  const common = { enemyHps: hundredHps, duration: 30, attackInterval: 0.1, trials: 3_000 }
  const setup = { builds: [build('none', common), build('X', common)], enemyResistances: [0, 100] }
  for (const item of setup.builds) {
    assert.doesNotThrow(() => validateResistanceComparisonInput({ builds: [item], enemyResistances: setup.enemyResistances }))
  }
  assertRejectedBeforeAllocation(setup, /MOD比較全体/)
})

test('後続MODの抽選メモリと試行回数上限を維持し、実行方針だけがベンチマークを許可する', () => {
  const limits = structuredClone([GOLDENGLOW_TARGET_SWITCH_LIMITS, GOLDENGLOW_TARGET_SWITCH_GRID_LIMITS, HP_COMPARISON_LIMITS])
  const common = { duration: 300, trials: 1_000, enemyHps: [1_000], model: { ...model, activeDroneCount: 1 } }
  assertRejectedBeforeAllocation({ builds: [build('none', common), build('X', { ...common, attackInterval: 0.05 })],
    enemyResistances: [0, 70] }, /抽選データ/)
  const benchmark = { builds: [build('none', { duration: 1, attackInterval: 1, trials: 20_001 })],
    enemyResistances: [0], trialLimit: 'benchmark' }
  assertRejectedBeforeAllocation(benchmark, /20000/)
  const options: GoldenglowTargetSwitchExecutionOptions = { trialLimit: 'benchmark' }
  assert.doesNotThrow(() => validateResistanceComparisonInput(benchmark, options))
  assert.equal(simulateGoldenglowResistanceComparison(benchmark, undefined, options)[0].points.length, 3)
  assert.deepEqual([GOLDENGLOW_TARGET_SWITCH_LIMITS, GOLDENGLOW_TARGET_SWITCH_GRID_LIMITS, HP_COMPARISON_LIMITS], limits)
})

const totals: ResistanceComparisonSeries[] = [
  { id: 'none', label: '未装備', moduleType: null, potential: 1, points: [
    { enemyHp: 1_000, enemyResistance: 0, expectedDamage: 100.25 },
    { enemyHp: 2_000, enemyResistance: 0, expectedDamage: 200 },
    { enemyHp: 1_000, enemyResistance: 70, expectedDamage: 50 },
    { enemyHp: 2_000, enemyResistance: 70, expectedDamage: 0 },
  ] },
  { id: 'X', label: '表示名から種類を推測しない', moduleType: 'X', potential: 6, points: [
    { enemyHp: 2_000, enemyResistance: 70, expectedDamage: 10 },
    { enemyHp: 1_000, enemyResistance: 70, expectedDamage: 25 },
    { enemyHp: 2_000, enemyResistance: 0, expectedDamage: 100 },
    { enemyHp: 1_000, enemyResistance: 0, expectedDamage: 150.375 },
    { enemyHp: 3_000, enemyResistance: 0, expectedDamage: 400 },
  ] },
]

test('表示値はHPと術耐性の両方を対応づけ、指定軸順に総量・正負の差分・増加率を返す', () => {
  const before = structuredClone(totals)
  const hps = [1_000, 2_000, 3_000]
  const resistances = [70, 0]
  const total = createResistanceComparisonDisplaySeries(totals, hps, resistances, 'total', 'none')
  assert.deepEqual(total[1].points.map((point) => point.value), [25, 10, null, 150.375, 100, 400])
  const difference = createResistanceComparisonDisplaySeries(totals, hps, resistances, 'difference', 'none')
  assert.deepEqual(difference[0].points.map((point) => point.value), [0, 0, null, 0, 0, null])
  assert.deepEqual(difference[1].points.map((point) => point.value), [-25, 10, null, 50.125, -100, null])
  const percent = createResistanceComparisonDisplaySeries(totals, hps, resistances, 'percent', 'none')
  assert.deepEqual(percent[0].points.map((point) => point.value), [0, null, null, 0, 0, null])
  assert.deepEqual(percent[1].points.map((point) => point.value), [-50, null, null, 50, -50, null])
  for (const display of [total, difference, percent]) {
    assert.deepEqual(display[0].points.map((point) => [point.enemyResistance, point.enemyHp]),
      resistances.flatMap((resistance) => hps.map((hp) => [resistance, hp])))
    assert.deepEqual(display.map(({ points: _points, ...identity }) => identity),
      totals.map(({ points: _points, ...identity }) => identity))
  }
  assert.deepEqual(totals, before)
})

test('未計算のHPまたは術耐性は補間せず、基準が欠ける差分も欠損として残す', () => {
  const partial = [{ ...totals[0], points: totals[0].points.filter((point) => point.enemyResistance === 0) }, totals[1]]
  const display = createResistanceComparisonDisplaySeries(partial, [500, 1_000, 1_500], [0, 35, 70], 'difference', 'none')
  assert.deepEqual(display[0].points.map((point) => point.value), [null, 0, null, null, null, null, null, null, null])
  assert.deepEqual(display[1].points.map((point) => point.value), [null, 50.125, null, null, null, null, null, null, null])
  assert.deepEqual(createResistanceComparisonDisplaySeries([], [1_000], [0], 'total', ''), [])
})

test('基準の選択と欠落時の未装備・先頭への復帰は各術耐性で共通し、有限でない値を表示しない', () => {
  assert.deepEqual(createResistanceComparisonDisplaySeries(totals, [1_000], [0, 70], 'difference', 'X')[0]
    .points.map((point) => point.value), [-50.125, 25])
  assert.deepEqual(createResistanceComparisonDisplaySeries([...totals].reverse(), [1_000], [0, 70], 'difference', 'missing')[0]
    .points.map((point) => point.value), [50.125, -25])
  assert.deepEqual(createResistanceComparisonDisplaySeries([totals[1]], [1_000], [0, 70], 'difference', 'missing')[0]
    .points.map((point) => point.value), [0, 0])
  const bad: ResistanceComparisonSeries[] = [{ id: 'X', label: 'X', points: [
    { enemyHp: 1_000, enemyResistance: 0, expectedDamage: NaN },
    { enemyHp: 1_000, enemyResistance: 70, expectedDamage: Infinity },
  ] }]
  for (const metric of ['total', 'difference', 'percent'] as const) {
    assert.ok(createResistanceComparisonDisplaySeries(bad, [1_000], [0, 70], metric, 'X')[0]
      .points.every((point) => point.value === null))
  }
})

test('内訳は有効な総量表示だけに独立したコピーを持ち、表示編集で計算結果を変えない', () => {
  const source: ResistanceComparisonSeries[] = [{ id: 'X', label: 'X', points: [
    { enemyHp: 1_000, enemyResistance: 0, expectedDamage: 100,
      damageBreakdown: { normalDamage: 60, explosionDamage: 30, bodyDamage: 10 } },
    { enemyHp: 1_000, enemyResistance: 70, expectedDamage: NaN,
      damageBreakdown: { normalDamage: 1, explosionDamage: 2, bodyDamage: 3 } },
  ] }]
  const before = structuredClone(source)
  const total = createResistanceComparisonDisplaySeries(source, [1_000, 1_000], [0, 70, 100], 'total', 'X')
  total[0].points[0].damageBreakdown!.normalDamage = -1
  assert.deepEqual(total[0].points[1].damageBreakdown, source[0].points[0].damageBreakdown)
  assert.ok(total[0].points.slice(2).every((point) => !('damageBreakdown' in point)))
  assert.deepEqual(source, before)
  for (const metric of ['difference', 'percent'] as const) {
    assert.ok(createResistanceComparisonDisplaySeries(source, [1_000], [0, 70], metric, 'X')[0]
      .points.every((point) => !('damageBreakdown' in point)))
  }
})

test('Workerは全計算点を順に通知し、後続MODの不正条件では途中結果を送らない', async () => {
  const originalSelf = Object.getOwnPropertyDescriptor(globalThis, 'self')
  const messages: ResistanceComparisonMessage[] = []
  const scope = {
    onmessage: null as ((event: { data: ResistanceComparisonInput }) => void) | null,
    postMessage(message: ResistanceComparisonMessage) { messages.push(structuredClone(message)) },
  }
  Object.defineProperty(globalThis, 'self', { configurable: true, value: scope })
  try {
    await import('../src/lib/goldenglowResistanceComparison.worker.ts')
    const run = scope.onmessage!
    const setup = { builds: [build('none'), build('X')], enemyResistances: [0, 70] }
    run({ data: setup })
    const progress = messages.filter((message) => message.type === 'point')
    assert.deepEqual(progress.map((message) => message.completedPoints), Array.from({ length: 12 }, (_, index) => index + 1))
    assert.ok(progress.every((message) => message.totalPoints === 12))
    assert.equal(messages.at(-1)?.type, 'complete')
    const complete = messages.at(-1) as Extract<ResistanceComparisonMessage, { type: 'complete' }>
    assert.deepEqual(complete.series, independentGridSeries(setup))
    for (const point of progress) {
      assert.deepEqual(complete.series.find((item) => item.id === point.buildId)?.points.find((item) => (
        item.enemyHp === point.point.enemyHp && item.enemyResistance === point.point.enemyResistance
      )), point.point)
    }
    messages.length = 0
    run({ data: { ...setup, builds: [build('none'), build('X', { effectiveAttack: NaN })] } })
    assert.equal(messages.length, 1)
    assert.equal(messages[0].type, 'error')
    messages.length = 0
    run({ data: null as unknown as ResistanceComparisonInput })
    assert.equal(messages.length, 1)
    assert.equal(messages[0].type, 'error')
  } finally {
    if (originalSelf) Object.defineProperty(globalThis, 'self', originalSelf)
    else Reflect.deleteProperty(globalThis, 'self')
  }
})
