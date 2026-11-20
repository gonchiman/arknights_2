import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildEnemyBoxplotImageVariants,
  getEnemyBoxplotArchiveFilename,
  getEnemyBoxplotVariantFilename,
  type EnemyBoxplotImageSelection,
} from '../src/lib/enemyBoxplotImageBatch.ts'
import {
  getEnemyBoxplotComparisonImageFilename,
  type EnemyBoxplotComparisonImageSnapshot,
} from '../src/lib/enemyBoxplotImage.ts'

function fixture(): EnemyBoxplotComparisonImageSnapshot {
  return {
    data: {
      hasData: true,
      series: [{
        key: 'defense', label: '防御力', validCount: 12.5, missingCount: 1.5,
        statistics: {
          minimum: 0, firstQuartile: 85, median: 120, thirdQuartile: 220, maximum: 4000,
          lowerWhisker: 0, upperWhisker: 400, mean: 238,
          outliers: [{ value: 4000, count: 0.5 }], outlierCount: 0.5,
        },
      }, { key: 'magicResistance', label: '術耐性', validCount: 0, missingCount: 14, statistics: null }],
    },
    scale: 'RAW', range: 'ALL', showOutlierInfo: true,
    scopeLabel: 'メインストーリー · 全敵', countMode: 'SPAWNS',
    aggregationVersion: { id: 'v12', label: '集計版 v12', sourceRevision: 'source', ruleVersion: 'rules' },
    coverage: { mapCount: 268, missingMapCount: 0, spawnMapCount: 268, spawnExcludedMapCount: 0, lowerBoundMapCount: 35 },
  }
}

const all: EnemyBoxplotImageSelection = { scales: ['RAW', 'MEDIAN'], ranges: ['ALL', 'WHISKERS'], outlierInfo: [true, false] }

test('selects the canonical Cartesian product without duplicates, including 8/4/2/1/0 outputs', () => {
  const source = fixture()
  const variants = buildEnemyBoxplotImageVariants(source, {
    scales: ['MEDIAN', 'RAW', 'RAW'], ranges: ['WHISKERS', 'ALL', 'WHISKERS'], outlierInfo: [false, true, false],
  })
  assert.equal(variants.length, 8)
  assert.deepEqual(variants.map(({ key }) => key), [
    'RAW-ALL-with-outliers', 'RAW-ALL-without-outliers', 'RAW-WHISKERS-with-outliers', 'RAW-WHISKERS-without-outliers',
    'MEDIAN-ALL-with-outliers', 'MEDIAN-ALL-without-outliers', 'MEDIAN-WHISKERS-with-outliers', 'MEDIAN-WHISKERS-without-outliers',
  ])
  assert.equal(buildEnemyBoxplotImageVariants(source, { ...all, outlierInfo: [true] }).length, 4)
  assert.equal(buildEnemyBoxplotImageVariants(source, { ...all, scales: ['MEDIAN'], ranges: ['WHISKERS'] }).length, 2)
  assert.equal(buildEnemyBoxplotImageVariants(source, { scales: ['RAW'], ranges: ['ALL'], outlierInfo: [false] }).length, 1)
  for (const empty of [{ scales: [] }, { ranges: [] }, { outlierInfo: [] }]) {
    assert.deepEqual(buildEnemyBoxplotImageVariants(source, { ...all, ...empty }), [])
  }
  assert.equal(variants[7].label, '中央値＝1 ／ 箱とひげ ／ 外れ値情報なし')
})

test('freezes independently cloned outputs without freezing or changing the live source', () => {
  const source = fixture()
  const before = structuredClone(source)
  const variants = buildEnemyBoxplotImageVariants(source, all)
  assert.deepEqual(source, before)
  assert.equal(Object.isFrozen(source), false)
  for (const variant of variants) {
    assert.equal(Object.isFrozen(variant), true)
    assert.equal(Object.isFrozen(variant.snapshot), true)
    assert.equal(Object.isFrozen(variant.snapshot.data.series), true)
    assert.equal(Object.isFrozen(variant.snapshot.data.series[0].statistics!.outliers[0]), true)
    assert.equal(variant.snapshot.data.series[0].validCount, 12.5)
    assert.equal(variant.snapshot.data.series[1].statistics, null)
  }
  assert.notEqual(variants[0].snapshot.data, variants[1].snapshot.data)
  assert.notEqual(variants[0].snapshot.coverage, variants[1].snapshot.coverage)
  source.data.series[0].statistics!.outliers[0].count = 999
  source.data.series[0].validCount = 100
  source.aggregationVersion!.id = 'v99'
  source.coverage!.mapCount = 1
  assert.equal(variants[0].snapshot.data.series[0].statistics!.outliers[0].count, 0.5)
  assert.equal(variants[0].snapshot.data.series[0].validCount, 12.5)
  assert.equal(variants[0].snapshot.aggregationVersion!.id, 'v12')
  assert.equal(variants[0].snapshot.coverage!.mapCount, 268)
  assert.throws(() => { variants[0].snapshot.scopeLabel = '変更' }, TypeError)
})

test('keeps selected outputs when the source contains a zero median or no valid series', () => {
  const source = fixture()
  source.data.series[0].statistics!.median = 0
  assert.equal(buildEnemyBoxplotImageVariants(source, all).length, 8)
  source.data.hasData = false
  source.data.series[0].statistics = null
  source.data.series[0].validCount = 0
  const empty = buildEnemyBoxplotImageVariants(source, all)
  assert.equal(empty.length, 8)
  assert.ok(empty.every(({ snapshot }) => snapshot.data.hasData === false && snapshot.data.series.every(({ statistics }) => statistics === null)))
})

test('names all eight PNGs distinctly while keeping ordinary single-image names unchanged', () => {
  const source = fixture()
  const variants = buildEnemyBoxplotImageVariants(source, all)
  const names = variants.map(({ snapshot }) => getEnemyBoxplotVariantFilename(snapshot, 16 / 9))
  assert.equal(new Set(names).size, 8)
  assert.equal(names[0], '敵_集計v12_防御力・術耐性の箱ひげ図_出現回数_メインストーリー·全敵_元の値_全範囲_外れ値情報あり_比率16x9.png')
  assert.match(names[1], /外れ値情報なし_比率16x9\.png$/)
  assert.match(names[7], /中央値＝1_箱とひげ_外れ値情報なし_比率16x9\.png$/)
  assert.match(getEnemyBoxplotVariantFilename(source), /_比率自動\.png$/)
  assert.equal(getEnemyBoxplotVariantFilename(source, 32 / 18), names[0])
  assert.equal(getEnemyBoxplotComparisonImageFilename(source), '敵_集計v12_防御力・術耐性の箱ひげ図_出現回数_メインストーリー·全敵_元の値_全範囲_外れ値情報.png')
  assert.doesNotMatch(getEnemyBoxplotComparisonImageFilename({ ...source, showOutlierInfo: false }), /外れ値情報/)
})

test('long Unicode scopes cannot collapse different PNG settings into duplicate ZIP names', () => {
  const source = fixture()
  source.scopeLabel = '長い条件・🐻‍❄️'.repeat(100)
  const variants = buildEnemyBoxplotImageVariants(source, all)
  const names = variants.map(({ snapshot }) => getEnemyBoxplotVariantFilename(snapshot, 16 / 7))
  assert.equal(new Set(names).size, 8)
  for (const name of names) {
    assert.ok(new TextEncoder().encode(name).length <= 240)
    assert.doesNotMatch(name, /\uFFFD|[<>:"/\\|?*]/u)
    assert.match(name, /ほか\d+項目_比率16x7\.png$/)
    assert.match(name, /外れ値情報(?:あり|なし)/)
  }
})

test('ZIP names describe selected conditions and respect the shared aspect and byte limits', () => {
  const source = fixture()
  const variants = buildEnemyBoxplotImageVariants(source, all)
  const archive = getEnemyBoxplotArchiveFilename(source, variants, 16 / 9)
  assert.match(archive, /^敵_集計v12_防御力・術耐性の箱ひげ図_出現回数_メインストーリー·全敵_/)
  assert.match(archive, /_8枚_/)
  assert.match(archive, /_比率16x9\.zip$/)
  assert.notEqual(getEnemyBoxplotArchiveFilename(source, variants.slice(0, 1), 16 / 9), archive)
  assert.notEqual(getEnemyBoxplotArchiveFilename(source, variants, 16 / 7), archive)
  assert.match(getEnemyBoxplotArchiveFilename(source, []), /_0枚_比率自動\.zip$/)
  source.scopeLabel = 'Unicode🐻‍❄️'.repeat(100)
  const longArchive = getEnemyBoxplotArchiveFilename(source, variants, 16 / 9)
  assert.ok(new TextEncoder().encode(longArchive).length <= 240)
  assert.doesNotMatch(longArchive, /\uFFFD/u)
  assert.match(longArchive, /_8枚_元の値・中央値＝1_全範囲・箱とひげ_外れ値情報あり・なし_/)
  assert.notEqual(getEnemyBoxplotArchiveFilename(source, variants.filter(({ snapshot }) => snapshot.showOutlierInfo), 16 / 9),
    getEnemyBoxplotArchiveFilename(source, variants.filter(({ snapshot }) => !snapshot.showOutlierInfo), 16 / 9))
})
