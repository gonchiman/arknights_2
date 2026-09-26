import test from 'node:test'
import assert from 'node:assert/strict'
import { parseComparisonValues, getResistanceComparisonImageFilename } from '../src/lib/goldenglowResistanceComparisonSettings.ts'
import type { ResistanceComparisonInput } from '../src/lib/goldenglowResistanceComparison.ts'
import type { ResistanceChartImageSnapshot } from '../src/components/saveGoldenglowResistanceComparisonImage.tsx'

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
  assert.match(name, /[a-f0-9]{64}\.png$/)
})

test('image names distinguish effective axes, ordering, partial results, metric, and display settings', async () => {
  const initial = fixture()
  const name = await getResistanceComparisonImageFilename(initial.input, initial.snapshot)
  for (const change of [
    ({ input }: ReturnType<typeof fixture>) => { input.enemyResistances = [0, 40] },
    ({ input }: ReturnType<typeof fixture>) => { input.builds = [...input.builds].reverse() },
    ({ snapshot }: ReturnType<typeof fixture>) => { snapshot.series[0].points[1].value = 90 },
    ({ snapshot }: ReturnType<typeof fixture>) => { snapshot.metric = 'difference' },
    ({ snapshot }: ReturnType<typeof fixture>) => { snapshot.gridStyle = 'dashed' },
    ({ snapshot }: ReturnType<typeof fixture>) => { snapshot.digits = 2 },
  ]) {
    const changed = fixture(); change(changed)
    assert.notEqual(await getResistanceComparisonImageFilename(changed.input, changed.snapshot), name)
  }
})
