import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getGoldenglowPerformanceImageFilename,
  type GoldenglowPerformanceImageFilenameOptions,
} from '../src/lib/goldenglowPerformanceImageFilename.ts'

const defaults: GoldenglowPerformanceImageFilenameOptions = {
  skillIndex: 3,
  skillLevelIndex: 9,
  skillLevelLabel: '特化3',
  duration: 30,
  builds: [
    { id: 'default-off', moduleId: '', moduleLevel: 3, potential: 1 },
    { id: 'default-x', moduleId: 'module-x', moduleLevel: 3, potential: 1 },
    { id: 'default-y', moduleId: 'module-y', moduleLevel: 3, potential: 1 },
  ],
  baselineId: 'default-off',
  chartType: 'line',
  chartMetric: 'total',
  chartDigits: 0,
  lineStyle: 'solid',
  showLineEndLabels: false,
  yAxisFromZero: false,
  barMode: 'single',
  showGroupedBarValues: false,
  groupedResistanceStep: 20,
  stackedBars: false,
  barOrientation: 'vertical',
  barVariant: 'axis',
  chartResistance: 0,
}

type Changes = Partial<GoldenglowPerformanceImageFilenameOptions>
const filename = (changes: Changes = {}) => getGoldenglowPerformanceImageFilename({ ...defaults, ...changes })

async function assertDistinctOptions(base: Changes, changes: readonly Changes[]) {
  const names = await Promise.all([filename(base), ...changes.map((change) => filename({ ...base, ...change }))])
  assert.equal(new Set(names).size, names.length)
}

test('すべてのグラフで共通の計算条件・比較列・表示値・桁数を区別する', async () => {
  const changes: Changes[] = [
    { skillIndex: 2 },
    { skillLevelIndex: 8 },
    { skillLevelLabel: '特化2' },
    { duration: 31 },
    { chartMetric: 'difference' },
    { chartMetric: 'ratio' },
    { chartMetric: 'growth' },
    { chartDigits: 1 },
    { chartDigits: 2 },
    { chartDigits: 3 },
    { builds: defaults.builds.slice(0, 2) },
    { builds: [...defaults.builds].reverse() },
    { builds: defaults.builds.map((build, index) => index === 1 ? { ...build, moduleId: 'module-z' } : build) },
    { builds: defaults.builds.map((build, index) => index === 1 ? { ...build, moduleLevel: 2 } : build) },
    { builds: defaults.builds.map((build, index) => index === 1 ? { ...build, potential: 2 } : build) },
  ]
  for (const base of [{}, { chartType: 'bar' }, { chartType: 'bar', barMode: 'grouped' }] satisfies Changes[]) {
    await assertDistinctOptions(base, changes)
  }
})

test('折れ線・単一棒・集合棒の有効なオプションをそれぞれ区別する', async () => {
  await assertDistinctOptions({}, [
    { chartType: 'bar' },
    { chartType: 'bar', barMode: 'grouped' },
    { lineStyle: 'dashed' },
    { showLineEndLabels: true },
  ])
  for (const chartMetric of ['ratio', 'growth'] as const) {
    await assertDistinctOptions({ chartMetric }, [{ yAxisFromZero: true }])
  }
  await assertDistinctOptions({ chartType: 'bar' }, [
    { chartResistance: 1 },
    { stackedBars: true },
    { barOrientation: 'horizontal' },
    { barVariant: 'label' },
    { barVariant: 'detail' },
  ])
  await assertDistinctOptions({ chartType: 'bar', barMode: 'grouped' }, [
    { groupedResistanceStep: 10 },
    { showGroupedBarValues: true },
  ])
})

test('非表示の形式別設定と総ダメージの基準列はファイル名に影響しない', async () => {
  const line = await filename()
  assert.equal(await filename({
    barMode: 'grouped', showGroupedBarValues: true, groupedResistanceStep: 10,
    stackedBars: true, barOrientation: 'horizontal', barVariant: 'detail', chartResistance: 99,
    baselineId: 'default-y', yAxisFromZero: true,
  }), line)
  assert.equal(await filename({ chartMetric: 'difference', yAxisFromZero: true }),
    await filename({ chartMetric: 'difference' }))
  const single: Changes = { chartType: 'bar' }
  assert.equal(await filename({
    ...single, lineStyle: 'dashed', showLineEndLabels: true, yAxisFromZero: true,
    showGroupedBarValues: true, groupedResistanceStep: 5,
  }), await filename(single))
  const grouped: Changes = { chartType: 'bar', barMode: 'grouped' }
  assert.equal(await filename({
    ...grouped, lineStyle: 'dashed', showLineEndLabels: true, yAxisFromZero: true,
    stackedBars: true, barOrientation: 'horizontal', barVariant: 'detail', chartResistance: 99,
  }), await filename(grouped))
})

test('内部IDや未装備のモジュールレベルが違っても同じ比較条件なら同じ名前になる', async () => {
  const builds = defaults.builds.map((build, index) => ({
    ...build, id: `comparison-${index + 42}`, moduleLevel: build.moduleId ? build.moduleLevel : 1,
  }))
  for (const chartMetric of ['total', 'difference', 'ratio', 'growth'] as const) {
    assert.equal(await filename({ builds, baselineId: 'comparison-43', chartMetric }),
      await filename({ baselineId: 'default-x', chartMetric }))
  }
})

test('相対値では有効な基準列を区別し、見つからない基準IDは先頭の列に戻す', async () => {
  for (const chartMetric of ['difference', 'ratio', 'growth'] as const) {
    await assertDistinctOptions({ chartMetric }, [
      { baselineId: 'default-x' }, { baselineId: 'default-y' },
    ])
    assert.equal(await filename({ chartMetric, baselineId: 'removed-column' }), await filename({ chartMetric }))
    assert.equal(await filename({ chartMetric, builds: [], baselineId: 'removed-column' }),
      await filename({ chartMetric, builds: [], baselineId: 'another-removed-column' }))
  }
})

test('同じ条件の重複列でも基準として選択した位置を区別する', async () => {
  const builds = [defaults.builds[0], defaults.builds[1], { ...defaults.builds[0], id: 'duplicate-off' }]
  assert.notEqual(await filename({ builds, chartMetric: 'difference' }),
    await filename({ builds, chartMetric: 'difference', baselineId: 'duplicate-off' }))
})

test('集計時間は表示用の小数丸めで失われず、わずかに異なるS2条件を区別する', async () => {
  await assertDistinctOptions({ skillIndex: 2, duration: 30.0001 }, [{ duration: 30.0002 }])
})

test('読みやすい主要条件に続く識別子で、繰り返し保存しても同じ名前になる', async () => {
  const options: Changes = { chartType: 'bar', barMode: 'grouped', showGroupedBarValues: true }
  const result = await filename(options)
  assert.match(result, /^goldenglow-S3-特化3-30s-grouped-bar-step20-value-labels-/)
  assert.match(result, /[a-f0-9]{64}\.png$/)
  assert.equal(await filename(options), result)
})
