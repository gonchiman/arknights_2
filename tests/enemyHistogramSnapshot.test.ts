import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateWeightedHistogram } from '../src/lib/enemyWeightedHistogram.ts'
import { buildEnemyRatingHistogramBins } from '../src/lib/enemyRatingHistogram.ts'
import { ENEMY_LEVEL_TYPES, type EnemyLevelType } from '../src/types/enemy.ts'
import {
  createEnemyHistogramSnapshot, parseEnemyHistogramSnapshot, readEnemyHistogramSnapshot, writeEnemyHistogramSnapshot,
  ENEMY_HISTOGRAM_SNAPSHOT_KEY, type EnemyHistogramSnapshotInput,
} from '../src/lib/enemyHistogramSnapshot.ts'

const observations = [{ value: 0, weight: 12 }, { value: 25, weight: 6 }, { value: 100, weight: 2 }, { value: null, weight: 3 }]
function input(): EnemyHistogramSnapshotInput {
  return {
    metric: 'magicResistance', source: { scopeLabel: '全敵 · 地上', enemyIds: ['enemy_a', 'enemy_b', 'enemy_c'], countGeneratedAt: '2026-09-30' },
    countMode: 'SPAWNS', coverage: { mapCount: 5, missingMapCount: 1, spawnMapCount: 4, spawnExcludedMapCount: 1 },
    scale: 'LINEAR', statistics: calculateWeightedHistogram(observations, { scale: 'LINEAR', customLinearBinWidth: 10, minimumLinearUpperBound: 100 }),
    ratingBins: null, customLinearUpperBound: null, showPercentages: true, showBinRanges: true,
    referenceVisibility: { mean: false, median: true },
  }
}
function memoryStorage() {
  const data = new Map<string, string>()
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
}

test('登録後の元データ・設定変更から独立し、計算結果と範囲・割合・補助線を保存する', () => {
  const source = input()
  const snapshot = createEnemyHistogramSnapshot(source)
  source.source.enemyIds.push('later')
  source.source.scopeLabel = '別の条件'
  source.statistics.bins[0].count = 0
  source.referenceVisibility.median = false
  assert.equal(snapshot.statistics.count, 20)
  assert.equal(snapshot.statistics.bins[0].count, 12)
  assert.deepEqual(snapshot.source.enemyIds, ['enemy_a', 'enemy_b', 'enemy_c'])
  assert.equal(snapshot.referenceVisibility.median, true)
  assert.equal(snapshot.showPercentages, true)
  assert.equal(snapshot.showBinRanges, true)
  assert.equal(snapshot.source.scopeLabel, '全敵 · 地上')
  assert.ok(Object.isFrozen(snapshot.statistics.bins[0]))
  assert.ok(Object.isFrozen(snapshot.source.enemyIds))
  assert.throws(() => { snapshot.statistics.bins[0].count = 99 }, TypeError)
  assert.match(snapshot.filename, /出現回数_全敵_地上_線形_幅10_上限自動100_割合表示_階級範囲表示_中央値/)
  assert.match(snapshot.summary, /値なし 3体を除外/)
})

test('ページ移動・再読み込み用ストレージを経由して同じ分布と識別子を復元する', () => {
  const snapshot = createEnemyHistogramSnapshot(input())
  const storage = memoryStorage()
  assert.equal(writeEnemyHistogramSnapshot(snapshot, storage), true)
  const restored = readEnemyHistogramSnapshot(storage)
  assert.deepEqual(restored, snapshot)
  assert.ok(Object.isFrozen(restored!.statistics))
  assert.equal(createEnemyHistogramSnapshot(input()).id, snapshot.id)
  const changed = input()
  changed.showPercentages = false
  assert.notEqual(createEnemyHistogramSnapshot(changed).id, snapshot.id)
})

test('累積割合を省略した旧v1はOFFとして復元し、既存の識別子と保存名を保つ', () => {
  const omitted = createEnemyHistogramSnapshot(input())
  const explicitOff = createEnemyHistogramSnapshot({ ...input(), showCumulative: false })
  assert.equal(omitted.showCumulative, false)
  assert.deepEqual(explicitOff, omitted)
  assert.equal(omitted.id, 'resistance-histogram-bacf1e83cafbeb64')
  assert.doesNotMatch(omitted.filename, /累積割合表示/)
  const { showCumulative: _overlay, ...legacy } = omitted
  const storage = memoryStorage()
  storage.setItem(ENEMY_HISTOGRAM_SNAPSHOT_KEY, JSON.stringify(legacy))
  assert.deepEqual(readEnemyHistogramSnapshot(storage), omitted)
  assert.deepEqual(parseEnemyHistogramSnapshot(legacy), omitted)
})

test('累積割合ONを複製・凍結・保存・復元し、値を再集計せず識別子と画像名に反映する', () => {
  const source = { ...input(), showCumulative: true }
  const snapshot = createEnemyHistogramSnapshot(source)
  const off = createEnemyHistogramSnapshot({ ...source, showCumulative: false })
  source.showCumulative = false
  assert.equal(snapshot.showCumulative, true)
  assert.ok(Object.isFrozen(snapshot))
  assert.notEqual(snapshot.id, off.id)
  assert.notEqual(snapshot.filename, off.filename)
  assert.match(snapshot.filename, /_割合表示_累積割合表示_階級範囲表示_/)
  assert.deepEqual(snapshot.statistics, off.statistics)
  assert.deepEqual(snapshot.source, off.source)
  const storage = memoryStorage()
  assert.equal(writeEnemyHistogramSnapshot(snapshot, storage), true)
  assert.deepEqual(readEnemyHistogramSnapshot(storage), snapshot)
  assert.deepEqual(parseEnemyHistogramSnapshot(JSON.parse(JSON.stringify(snapshot))), snapshot)
  assert.equal(createEnemyHistogramSnapshot({ ...input(), showCumulative: true }).id, snapshot.id)
})

test('累積割合の不正な型を拒否し、保存済みの有効な分布を上書きしない', () => {
  const snapshot = createEnemyHistogramSnapshot({ ...input(), showCumulative: true })
  const storage = memoryStorage()
  assert.equal(writeEnemyHistogramSnapshot(snapshot, storage), true)
  for (const showCumulative of [null, 0, 1, 'true', [], {}]) {
    const invalid = { ...snapshot, showCumulative }
    assert.equal(parseEnemyHistogramSnapshot(invalid), null)
    assert.throws(() => createEnemyHistogramSnapshot(invalid as unknown as EnemyHistogramSnapshotInput))
    assert.equal(writeEnemyHistogramSnapshot(invalid as unknown as typeof snapshot, storage), false)
  }
  assert.deepEqual(readEnemyHistogramSnapshot(storage), snapshot)
})

test('累積表示方式の省略は折れ線として復元し、従来のON/OFFの識別子を維持する', () => {
  for (const showCumulative of [false, true]) {
    const omitted = createEnemyHistogramSnapshot({ ...input(), showCumulative })
    const line = createEnemyHistogramSnapshot({ ...input(), showCumulative, cumulativeDisplay: 'line' })
    assert.equal(omitted.cumulativeDisplay, 'line')
    assert.deepEqual(line, omitted)
    assert.equal(line.id, showCumulative ? 'resistance-histogram-f4a7949b4023b524' : 'resistance-histogram-bacf1e83cafbeb64')
    const { cumulativeDisplay: _display, ...legacy } = line
    assert.deepEqual(parseEnemyHistogramSnapshot(legacy), line)
    const storage = memoryStorage()
    storage.setItem(ENEMY_HISTOGRAM_SNAPSHOT_KEY, JSON.stringify(legacy))
    assert.deepEqual(readEnemyHistogramSnapshot(storage), line)
  }
})

test('累積割合帯を複製・保存・復元し、有効な場合だけ画像の識別子と名前を変える', () => {
  const source: EnemyHistogramSnapshotInput = { ...input(), showCumulative: true, cumulativeDisplay: 'strip' }
  const strip = createEnemyHistogramSnapshot(source)
  const line = createEnemyHistogramSnapshot({ ...source, cumulativeDisplay: 'line' })
  source.cumulativeDisplay = 'line'
  assert.equal(strip.cumulativeDisplay, 'strip')
  assert.equal(strip.id, 'resistance-histogram-c38fdf2d65d97905')
  assert.ok(Object.isFrozen(strip))
  assert.notEqual(strip.id, line.id)
  assert.notEqual(strip.filename, line.filename)
  assert.match(strip.filename, /_割合表示_累積割合帯_階級範囲表示_/)
  assert.doesNotMatch(strip.filename, /累積割合表示/)
  assert.deepEqual(strip.statistics, line.statistics)
  assert.deepEqual(strip.source, line.source)
  const storage = memoryStorage()
  assert.equal(writeEnemyHistogramSnapshot(strip, storage), true)
  assert.deepEqual(readEnemyHistogramSnapshot(storage), strip)
  assert.deepEqual(parseEnemyHistogramSnapshot(JSON.parse(JSON.stringify(strip))), strip)

  const off = createEnemyHistogramSnapshot(input())
  const inactiveStrip = createEnemyHistogramSnapshot({ ...input(), showCumulative: false, cumulativeDisplay: 'strip' })
  assert.equal(inactiveStrip.cumulativeDisplay, 'strip')
  assert.equal(inactiveStrip.id, off.id)
  assert.equal(inactiveStrip.filename, off.filename)
})

test('折れ線と帯の併用を保存・復元し、有効時だけ単独表示と識別する', () => {
  const source: EnemyHistogramSnapshotInput = { ...input(), showCumulative: true, cumulativeDisplay: 'both' }
  const both = createEnemyHistogramSnapshot(source)
  source.cumulativeDisplay = 'line'
  assert.equal(both.cumulativeDisplay, 'both')
  assert.ok(Object.isFrozen(both))
  assert.match(both.filename, /_割合表示_累積割合線＋帯_階級範囲表示_/)
  for (const cumulativeDisplay of ['line', 'strip'] as const) {
    const single = createEnemyHistogramSnapshot({ ...input(), showCumulative: true, cumulativeDisplay })
    assert.notEqual(both.id, single.id)
    assert.notEqual(both.filename, single.filename)
    assert.deepEqual(both.statistics, single.statistics)
  }
  const storage = memoryStorage()
  assert.equal(writeEnemyHistogramSnapshot(both, storage), true)
  assert.deepEqual(readEnemyHistogramSnapshot(storage), both)
  assert.deepEqual(parseEnemyHistogramSnapshot(JSON.parse(JSON.stringify(both))), both)
  assert.equal(createEnemyHistogramSnapshot({ ...input(), showCumulative: true, cumulativeDisplay: 'both' }).id, both.id)

  const off = createEnemyHistogramSnapshot(input())
  for (const showCumulative of [undefined, false]) {
    const inactive = createEnemyHistogramSnapshot({ ...input(), showCumulative, cumulativeDisplay: 'both' })
    assert.equal(inactive.cumulativeDisplay, 'both')
    assert.equal(inactive.id, off.id)
    assert.equal(inactive.filename, off.filename)
    assert.equal(writeEnemyHistogramSnapshot(inactive, storage), true)
    assert.deepEqual(readEnemyHistogramSnapshot(storage), inactive)
  }
})

test('累積表示方式の不正値を拒否し、非表示の場合も保存済みの分布を保つ', () => {
  const snapshot = createEnemyHistogramSnapshot({ ...input(), showCumulative: true, cumulativeDisplay: 'strip' })
  const storage = memoryStorage()
  assert.equal(writeEnemyHistogramSnapshot(snapshot, storage), true)
  for (const cumulativeDisplay of [null, '', 'LINE', 'bars', true, 0, [], {}]) {
    for (const showCumulative of [false, true]) {
      const invalid = { ...snapshot, showCumulative, cumulativeDisplay }
      assert.equal(parseEnemyHistogramSnapshot(invalid), null)
      assert.throws(() => createEnemyHistogramSnapshot(invalid as unknown as EnemyHistogramSnapshotInput))
      assert.equal(writeEnemyHistogramSnapshot(invalid as unknown as typeof snapshot, storage), false)
    }
  }
  assert.deepEqual(readEnemyHistogramSnapshot(storage), snapshot)
})

test('集計方法・対象・有効な表示設定から条件と名前を再生成する', () => {
  for (const mode of ['TYPES', 'MAPS', 'SPAWNS'] as const) {
    const source = input()
    source.countMode = mode
    if (mode === 'TYPES') source.coverage = null
    const snapshot = createEnemyHistogramSnapshot(source)
    const restored = parseEnemyHistogramSnapshot({ ...snapshot, filename: 'stale.png', summary: 'old', conditions: 'old' })!
    assert.equal(restored.filename, snapshot.filename)
    assert.equal(restored.conditions, snapshot.conditions)
    assert.equal(restored.summary, snapshot.summary)
  }
})

test('ゲーム内評価別の階級と件数をそのまま保持する', () => {
  const source = input()
  source.ratingBins = buildEnemyRatingHistogramBins(observations, 'magicResistance')
  const snapshot = createEnemyHistogramSnapshot(source)
  assert.deepEqual(snapshot.ratingBins, source.ratingBins)
  assert.equal(snapshot.axisTitle, '術耐性（ゲーム内評価）')
  assert.match(snapshot.filename, /ゲーム内評価/)
  assert.ok(!snapshot.filename.includes('幅10'))
  assert.deepEqual(parseEnemyHistogramSnapshot(JSON.parse(JSON.stringify(snapshot))), snapshot)
})

test('対数設定も元の計算済み階級・統計量を保持し再集計しない', () => {
  const source = input()
  source.scale = 'LOG'
  source.statistics = calculateWeightedHistogram(observations, { scale: 'LOG' })
  const snapshot = createEnemyHistogramSnapshot(source)
  assert.deepEqual(snapshot.statistics, source.statistics)
  assert.match(snapshot.filename, /対数/)
})

test('HP・空分布・未取得の出現データ・不正な階級を受け付けない', () => {
  const snapshot = createEnemyHistogramSnapshot(input())
  const invalid = [
    null, {}, { ...snapshot, schemaVersion: 2 }, { ...snapshot, metric: 'maxHp' },
    { ...snapshot, statistics: { ...snapshot.statistics, count: 0 } },
    { ...snapshot, statistics: { ...snapshot.statistics, bins: [] } },
    { ...snapshot, statistics: { ...snapshot.statistics, count: 99 } },
    { ...snapshot, statistics: { ...snapshot.statistics, mean: Infinity } },
    { ...snapshot, coverage: null },
    { ...snapshot, showBinRanges: 'true' },
    { ...snapshot, referenceVisibility: { mean: false } },
    { ...snapshot, source: { ...snapshot.source, enemyIds: [] } },
    { ...snapshot, ratingBins: [{ rating: 'E', count: 20 }] },
    { ...snapshot, statistics: { ...snapshot.statistics, bins: snapshot.statistics.bins.map((bin,index) => index ? bin : {...bin,end:-1}) } },
  ]
  for (const value of invalid) assert.equal(parseEnemyHistogramSnapshot(value), null)
  assert.throws(() => createEnemyHistogramSnapshot({ ...input(), metric: 'maxHp' } as unknown as EnemyHistogramSnapshotInput))
})

test('ストレージ未登録・破損・アクセス拒否・容量不足で例外を漏らさない', () => {
  const snapshot = createEnemyHistogramSnapshot(input())
  const storage = memoryStorage()
  assert.equal(readEnemyHistogramSnapshot(storage), null)
  storage.setItem(ENEMY_HISTOGRAM_SNAPSHOT_KEY, '{broken')
  assert.equal(readEnemyHistogramSnapshot(storage), null)
  const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('full') } }
  assert.equal(readEnemyHistogramSnapshot(blocked), null)
  assert.equal(writeEnemyHistogramSnapshot(snapshot, blocked), false)
  assert.equal(writeEnemyHistogramSnapshot({ ...snapshot, metric: 'maxHp' } as unknown as typeof snapshot, storage), false)
})

test('保存失敗時に以前登録した有効な分布を上書きしない', () => {
  const storage = memoryStorage()
  const previous = createEnemyHistogramSnapshot(input())
  assert.equal(writeEnemyHistogramSnapshot(previous, storage), true)
  assert.equal(writeEnemyHistogramSnapshot({ ...previous, statistics: { ...previous.statistics, bins: [] } }, storage), false)
  assert.deepEqual(readEnemyHistogramSnapshot(storage), previous)
})

test('編集設定を持たない既存v1をそのまま復元する', () => {
  const legacy = createEnemyHistogramSnapshot(input())
  assert.equal(Object.hasOwn(legacy, 'editorSettings'), false)
  const restored = parseEnemyHistogramSnapshot(JSON.parse(JSON.stringify(legacy)))!
  assert.deepEqual(restored, legacy)
  assert.equal(restored.editorSettings, undefined)
})

test('編集設定の対象・数値条件・自動階級入力を複製して復元する', () => {
  const source = input()
  const conditions = [{ id: 1, field: 'maxHp' as const, operator: 'gte' as const, value: '1e3' },
    { id: 2, field: 'magicResistance' as const, operator: 'lte' as const, value: '' }]
  source.editorSettings = { levelType: 'ELITE', numericConditions: conditions,
    linearBinWidthInput: '', linearUpperBoundInput: '100' }
  const snapshot = createEnemyHistogramSnapshot(source)
  conditions[0].value = '5000'
  source.editorSettings.linearBinWidthInput = '5'
  assert.equal(snapshot.editorSettings!.numericConditions[0].value, '1e3')
  assert.equal(snapshot.editorSettings!.linearBinWidthInput, '')
  assert.ok(Object.isFrozen(snapshot.editorSettings))
  assert.ok(Object.isFrozen(snapshot.editorSettings!.numericConditions[0]))
  const storage = memoryStorage()
  assert.equal(writeEnemyHistogramSnapshot(snapshot, storage), true)
  assert.deepEqual(readEnemyHistogramSnapshot(storage), snapshot)
})

test('既存v1の単一対象を保存・復元してもscalarのまま維持する', () => {
  for (const levelType of ['ALL', ...ENEMY_LEVEL_TYPES] as const) {
    const source = input()
    source.editorSettings = { levelType, numericConditions: [],
      linearBinWidthInput: '', linearUpperBoundInput: '' }
    const snapshot = createEnemyHistogramSnapshot(source)
    const storage = memoryStorage()
    assert.equal(snapshot.schemaVersion, 1)
    assert.equal(snapshot.editorSettings!.levelType, levelType)
    assert.equal(writeEnemyHistogramSnapshot(snapshot, storage), true)
    assert.deepEqual(readEnemyHistogramSnapshot(storage), snapshot)
    assert.equal(readEnemyHistogramSnapshot(storage)!.editorSettings!.levelType, levelType)
  }
})

test('複数対象の配列を深く複製・凍結し、保存後も選択を復元する', () => {
  const source = input()
  const levels: EnemyLevelType[] = ['NORMAL', 'ELITE']
  source.source.scopeLabel = '通常＋エリート'
  source.editorSettings = { levelType: levels, numericConditions: [],
    linearBinWidthInput: '10', linearUpperBoundInput: '100' }
  const snapshot = createEnemyHistogramSnapshot(source)
  const storage = memoryStorage()
  levels.push('BOSS')
  assert.deepEqual(snapshot.editorSettings!.levelType, ['NORMAL', 'ELITE'])
  assert.notEqual(snapshot.editorSettings!.levelType, levels)
  assert.ok(Object.isFrozen(snapshot.editorSettings!.levelType))
  assert.throws(() => { (snapshot.editorSettings!.levelType as EnemyLevelType[]).push('BOSS') }, TypeError)
  assert.equal(writeEnemyHistogramSnapshot(snapshot, storage), true)
  const restored = readEnemyHistogramSnapshot(storage)!
  assert.deepEqual(restored, snapshot)
  assert.ok(Object.isFrozen(restored.editorSettings!.levelType))
  assert.match(restored.conditions, /通常＋エリート/)
  assert.match(restored.filename, /通常＋エリート/)
})

test('複数対象は単一要素から全4区分まで保存でき、選択変更を画像キーに反映する', () => {
  const source = input()
  source.editorSettings = { levelType: ['NORMAL'], numericConditions: [],
    linearBinWidthInput: '', linearUpperBoundInput: '' }
  const single = createEnemyHistogramSnapshot(source)
  const multiple = createEnemyHistogramSnapshot({ ...source,
    editorSettings: { ...source.editorSettings, levelType: ['NORMAL', 'ELITE'] } })
  const all = createEnemyHistogramSnapshot({ ...source,
    editorSettings: { ...source.editorSettings, levelType: [...ENEMY_LEVEL_TYPES] } })
  assert.deepEqual(single.editorSettings!.levelType, ['NORMAL'])
  assert.deepEqual(multiple.editorSettings!.levelType, ['NORMAL', 'ELITE'])
  assert.deepEqual(all.editorSettings!.levelType, ENEMY_LEVEL_TYPES)
  assert.notEqual(single.id, multiple.id)
  assert.notEqual(multiple.id, all.id)
  assert.deepEqual(single.statistics, multiple.statistics)
  assert.equal(single.filename, multiple.filename)
})

test('旧分布の対象IDを編集中も保持でき、編集設定変更は画像キーだけに反映する', () => {
  const source = input()
  const enemyIds = ['enemy_a', 'enemy_b']
  source.editorSettings = { levelType: 'ALL', numericConditions: [],
    linearBinWidthInput: '10', linearUpperBoundInput: '', sourceEnemyIds: enemyIds }
  const snapshot = createEnemyHistogramSnapshot(source)
  enemyIds.push('enemy_later')
  assert.deepEqual(snapshot.editorSettings!.sourceEnemyIds, ['enemy_a', 'enemy_b'])
  assert.ok(Object.isFrozen(snapshot.editorSettings!.sourceEnemyIds))
  const changed = createEnemyHistogramSnapshot({ ...source,
    editorSettings: { ...source.editorSettings, linearBinWidthInput: '' } })
  assert.notEqual(changed.id, snapshot.id)
  assert.equal(changed.filename, snapshot.filename)
  assert.deepEqual(changed.statistics, snapshot.statistics)
})

test('編集設定の未知フィールドは保持せず、既知フィールドだけを検証する', () => {
  const snapshot = createEnemyHistogramSnapshot(input())
  const parsed = parseEnemyHistogramSnapshot({ ...snapshot, unknown: true, editorSettings: {
    levelType: 'BOSS', numericConditions: [{ id: 7, field: 'defense', operator: 'gt', value: '-1.5', unknown: 'ignored' }],
    linearBinWidthInput: '2.5', linearUpperBoundInput: '1e2', unknown: { arbitrary: true },
  } })!
  assert.deepEqual(parsed.editorSettings, {
    levelType: 'BOSS', numericConditions: [{ id: 7, field: 'defense', operator: 'gt', value: '-1.5' }],
    linearBinWidthInput: '2.5', linearUpperBoundInput: '1e2',
  })
  assert.equal(Object.hasOwn(parsed, 'unknown'), false)
})

test('不正な編集条件・数値入力・旧分布IDは受け付けない', () => {
  const snapshot = createEnemyHistogramSnapshot(input())
  const editorSettings = { levelType: 'ALL', numericConditions: [], linearBinWidthInput: '', linearUpperBoundInput: '' }
  const condition = { id: 1, field: 'maxHp', operator: 'gte', value: '1000' }
  const invalid = [null, [], {}, { ...editorSettings, levelType: 'OTHER' },
    ...[[], ['ALL'], ['NORMAL', 'ALL'], ['NORMAL', 'OTHER'], ['NORMAL', 'NORMAL'],
      ['NORMAL', 'ELITE', 'BOSS', 'UNKNOWN', 'NORMAL'], [1], [null], null, {}]
      .map(levelType => ({ ...editorSettings, levelType })),
    { ...editorSettings, numericConditions: [ { ...condition, field: 'anything' } ] },
    { ...editorSettings, numericConditions: [ { ...condition, operator: 'neq' } ] },
    { ...editorSettings, numericConditions: [ { ...condition, value: 'Infinity' } ] },
    { ...editorSettings, numericConditions: [ { ...condition, id: -1 } ] },
    { ...editorSettings, numericConditions: [condition, condition] },
    { ...editorSettings, linearBinWidthInput: 10 }, { ...editorSettings, linearBinWidthInput: '0' },
    { ...editorSettings, linearUpperBoundInput: '1e' }, { ...editorSettings, linearUpperBoundInput: '-1' },
    { ...editorSettings, sourceEnemyIds: [] }, { ...editorSettings, sourceEnemyIds: ['enemy_a', 'enemy_a'] },
    { ...editorSettings, sourceEnemyIds: [1] }, { ...editorSettings, sourceEnemyIds: [''] },
  ]
  for (const value of invalid) assert.equal(parseEnemyHistogramSnapshot({ ...snapshot, editorSettings: value }), null)
})
