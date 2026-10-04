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
