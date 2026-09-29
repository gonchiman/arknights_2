import test from 'node:test'
import assert from 'node:assert/strict'
import { parseComparisonValues, getResistanceComparisonImageFilename } from '../src/lib/goldenglowResistanceComparisonSettings.ts'
import type { ResistanceComparisonInput } from '../src/lib/goldenglowResistanceComparison.ts'
import type { ResistanceChartImageSnapshot } from '../src/components/saveGoldenglowResistanceComparisonImage.tsx'
import { getGoldenglowHpComparisonImageFilename } from '../src/lib/goldenglowChartImageFilename.ts'
import type { HpChartImageSnapshot } from '../src/components/saveGoldenglowTargetSwitchHpChartImage.tsx'

test('comparison axes accept Japanese input and sort without silently dropping invalid values', () => {
  assert.deepEqual(parseComparisonValues('１００、0 ２０', '術耐性', 0, 100, 101), { values: [0, 20, 100], error: null })
  for (const text of ['', '0, 0', '0, 101', '20.5', '20,abc', '20,', 'Infinity']) {
    assert.ok(parseComparisonValues(text, '術耐性', 0, 100, 101).error, text)
  }
  assert.ok(parseComparisonValues('1,2,3', 'HP', 1, 30000, 2).error)
  assert.ok(parseComparisonValues('0,1000', 'HP', 1, 30000, 100).error)
})

function fixture() {
  // Filename generation only reads identities/settings; no simulation is performed here.
  const input = { builds: [
    { id: 'n', label: '未装備', moduleType: null, potential: 1, input: { enemyHps: [5000], enemyResistance: 0, trials: 10000, seed: 12, duration: 30 } },
    { id: 'x', label: 'MOD X Lv.3', moduleType: 'X', potential: 1, input: { enemyHps: [5000], enemyResistance: 0, trials: 10000, seed: 12, duration: 30 } },
  ], enemyResistances: [0, 20] } as ResistanceComparisonInput
  const snapshot: ResistanceChartImageSnapshot = {
    series: input.builds.map(build => ({ id: build.id, label: build.label, moduleType: build.moduleType, potential: 1,
      points: [{ enemyHp: 5000, enemyResistance: 0, value: 100 }, { enemyHp: 5000, enemyResistance: 20, value: null }] })),
    enemyHps: [5000], enemyResistances: [0, 20], metric: 'total', baselineId: 'n', hideBaseline: false,
    digits: 0, title: 'スキル総ダメージ期待値', conditions: 'S3 特化3', showHpRanks: true, gridStyle: 'none',
  }
  return { input, snapshot }
}

test('image names ignore inactive fixed RES, internal IDs, and total-mode baseline', async () => {
  const { input, snapshot } = fixture()
  const name = await getResistanceComparisonImageFilename(input, snapshot)
  input.builds[0].input.enemyResistance = 100
  input.builds[0].id = 'renamed'
  snapshot.series[0].id = 'renamed'
  snapshot.baselineId = 'x'
  assert.equal(await getResistanceComparisonImageFilename(input, snapshot), name)
  assert.match(name, /^GG_S3特化3_総ダメージ_MODなし-X3_HP5000_術耐性0-20_集合棒/)
  assert.doesNotMatch(name, /[a-f0-9]{64}/)
})

test('image names distinguish effective axes, ordering, partial results, metric, and display settings', async () => {
  const initial = fixture()
  const name = await getResistanceComparisonImageFilename(initial.input, initial.snapshot)
  for (const change of [
    ({ snapshot }: ReturnType<typeof fixture>) => { snapshot.enemyResistances = [0, 40] },
    ({ snapshot }: ReturnType<typeof fixture>) => { snapshot.enemyHps = [1000, 5000] },
    ({ snapshot }: ReturnType<typeof fixture>) => { snapshot.series = [...snapshot.series].reverse() },
    ({ snapshot }: ReturnType<typeof fixture>) => { snapshot.notice = '途中結果' },
    ({ snapshot }: ReturnType<typeof fixture>) => { snapshot.metric = 'difference' },
    ({ snapshot }: ReturnType<typeof fixture>) => { snapshot.gridStyle = 'dashed' },
    ({ snapshot }: ReturnType<typeof fixture>) => { snapshot.digits = 2 },
    ({ snapshot }: ReturnType<typeof fixture>) => { snapshot.showHpRanks = false },
    ({ snapshot }: ReturnType<typeof fixture>) => { snapshot.series[1].label = 'MOD X Lv.2' },
    ({ input }: ReturnType<typeof fixture>) => { input.builds[0].input.duration = 60 },
    ({ input }: ReturnType<typeof fixture>) => { input.builds[0].input.trials = 20000 },
    ({ input }: ReturnType<typeof fixture>) => { input.builds[0].input.seed = 25 },
  ]) {
    const changed = fixture(); change(changed)
    assert.notEqual(await getResistanceComparisonImageFilename(changed.input, changed.snapshot), name)
  }
})

test('calculated result arrays do not become filename identifiers', () => {
  const { input, snapshot } = fixture()
  const name = getResistanceComparisonImageFilename(input, snapshot)
  snapshot.series[0].points[1].value = 987654
  assert.equal(getResistanceComparisonImageFilename(input, snapshot), name)
})

test('a compact multi-resistance name keeps all main conditions readable', () => {
  const { input, snapshot } = fixture()
  snapshot.enemyHps = [500, 2000, 4000, 6000, 10000, 20000]
  snapshot.enemyResistances = [0, 10, 20, 30, 40, 50]
  snapshot.series.push({ id: 'y', label: 'MOD Y Lv.3', moduleType: 'Y', potential: 1, points: [] })
  const name = getResistanceComparisonImageFilename(input, snapshot)
  assert.match(name, /^GG_S3特化3_総ダメージ_MODなし-X3-Y3_HP500-2000-4000-6000-10000-20000_術耐性0-50刻み10_集合棒/)
  assert.doesNotMatch(name, /[a-f0-9]{64}/)
})

function hpFixture() {
  const { input, snapshot: multi } = fixture()
  const snapshot: HpChartImageSnapshot = {
    series: multi.series.map(series => ({ ...series, points: series.points.map(point => ({ enemyHp: point.enemyHp, value: point.value })) })),
    minHp: 5000, maxHp: 5000, conditions: 'S3 特化3・術耐性 0', title: '総ダメージ',
    chartKind: 'line', metric: 'total', baselineId: 'n', digits: 0, barMode: 'total',
    showHpRanks: true, gridStyle: 'none', yAxisMode: 'auto', manualYAxisRange: { min: 0, max: 100 },
    barHps: [5000],
  }
  return { input, snapshot }
}

test('HP image names distinguish effective conditions and options', () => {
  const initial = hpFixture()
  const original = getGoldenglowHpComparisonImageFilename(initial.input, initial.snapshot)
  assert.match(original, /^GG_S3特化3_総ダメージ_MODなし-X3_HP5000_術耐性0_折れ線/)
  for (const change of [
    ({ input }: ReturnType<typeof hpFixture>) => { input.builds[0].input.enemyResistance = 20 },
    ({ input }: ReturnType<typeof hpFixture>) => { input.builds[0].input.enemyHps = [1000, 2000, 3000] },
    ({ input }: ReturnType<typeof hpFixture>) => { input.builds[0].input.switchDelay = 0.2 },
    ({ snapshot }: ReturnType<typeof hpFixture>) => { snapshot.conditions = 'S3 特化2・術耐性 0' },
    ({ snapshot }: ReturnType<typeof hpFixture>) => { snapshot.series = [...snapshot.series].reverse() },
    ({ snapshot }: ReturnType<typeof hpFixture>) => { snapshot.chartKind = 'bar' },
    ({ snapshot }: ReturnType<typeof hpFixture>) => { snapshot.metric = 'percent' },
    ({ snapshot }: ReturnType<typeof hpFixture>) => { snapshot.digits = 2 },
    ({ snapshot }: ReturnType<typeof hpFixture>) => { snapshot.showHpRanks = false },
    ({ snapshot }: ReturnType<typeof hpFixture>) => { snapshot.gridStyle = 'solid' },
    ({ snapshot }: ReturnType<typeof hpFixture>) => { snapshot.yAxisMode = 'zero' },
    ({ snapshot }: ReturnType<typeof hpFixture>) => { snapshot.yAxisMode = 'manual' },
    ({ snapshot }: ReturnType<typeof hpFixture>) => { snapshot.minHp = 0 },
    ({ snapshot }: ReturnType<typeof hpFixture>) => { snapshot.notice = '途中結果：2 / 4点' },
  ]) {
    const changed = hpFixture(); change(changed)
    assert.notEqual(getGoldenglowHpComparisonImageFilename(changed.input, changed.snapshot), original)
  }
})

test('zero-origin HP sweeps keep their exact first sample without expanding the full list', () => {
  const { input, snapshot } = hpFixture()
  input.builds[0].input.enemyHps = [1, 1000, 2000, 3000, 4000]
  snapshot.minHp = 0; snapshot.maxHp = 4000
  const name = getGoldenglowHpComparisonImageFilename(input, snapshot)
  assert.match(name, /HP1と1000-4000刻み1000/)
  assert.match(name, /X軸0-4000/)
})

test('HP image names ignore inactive settings and use the displayed bar HP values', () => {
  const { input, snapshot } = hpFixture()
  const line = getGoldenglowHpComparisonImageFilename(input, snapshot)
  snapshot.barMode = 'composition'; snapshot.barHps = [1000, 2000]; snapshot.baselineId = 'x'
  snapshot.manualYAxisRange = { min: 5, max: 999 }; snapshot.hideBaseline = true
  assert.equal(getGoldenglowHpComparisonImageFilename(input, snapshot), line)
  snapshot.chartKind = 'bar'
  const bar = getGoldenglowHpComparisonImageFilename(input, snapshot)
  assert.match(bar, /HP1000-2000_術耐性0_構成比棒/)
  snapshot.yAxisMode = 'manual'; snapshot.manualYAxisRange = { min: 100, max: 500 }
  assert.equal(getGoldenglowHpComparisonImageFilename(input, snapshot), bar)
  snapshot.barMode = 'breakdown'
  assert.notEqual(getGoldenglowHpComparisonImageFilename(input, snapshot), bar)
})

test('relative HP images name the selected baseline and manual range', () => {
  const { input, snapshot } = hpFixture()
  snapshot.metric = 'difference'; snapshot.yAxisMode = 'manual'
  const name = getGoldenglowHpComparisonImageFilename(input, snapshot)
  assert.match(name, /基準なし/)
  assert.match(name, /Y軸0-100/)
  snapshot.baselineId = 'x'
  assert.match(getGoldenglowHpComparisonImageFilename(input, snapshot), /基準X3/)
  snapshot.manualYAxisRange = { min: -200, max: 1000 }
  assert.match(getGoldenglowHpComparisonImageFilename(input, snapshot), /Y軸-200-1000/)
})
