import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_ENEMY_REGRESSION_CONFIG, ENEMY_REGRESSION_METRICS, runEnemyRegression } from '../src/lib/enemyRegression.ts'
import type { EnemyLevelType, EnemyRecord } from '../src/types/enemy.ts'

function enemy(id: string, stats: Partial<EnemyRecord['stats']> = {}, levelType: EnemyLevelType = 'NORMAL'): EnemyRecord {
  return { id, index: id, sortId: 0, name: id, levelType, description: '', abilities: [], damageTypes: [],
    attackWay: null, lifePointReduce: null, databaseLevel: 0, databaseLevelCount: 1,
    stageAppearanceCount: null, statusImmunities: [],
    ratings: { endurance: null, attack: null, defense: null, resistance: null },
    stats: { maxHp: null, attack: null, defense: null, magicResistance: null, moveSpeed: null,
      attackSpeed: null, baseAttackTime: null, massLevel: null, ...stats } }
}

function close(actual: number, expected: number, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should be close to ${expected}`)
}

function numericRows() {
  return Array.from({ length: 12 }, (_, index) => {
    const maxHp = index * 1_000
    const defense = (index % 4) * 100
    return enemy(`enemy-${index}`, { maxHp, defense, attack: 50 + maxHp * 0.02 + defense * 0.3 })
  })
}

test('初期設定と係数の表示単位に、既存の敵数値項目名・単位を使う', () => {
  assert.deepEqual(DEFAULT_ENEMY_REGRESSION_CONFIG, {
    outcome: 'attack', predictors: ['maxHp', 'defense', 'magicResistance', 'levelType'],
  })
  assert.deepEqual(ENEMY_REGRESSION_METRICS.map(({ key }) => key), [
    'maxHp', 'attack', 'defense', 'magicResistance', 'moveSpeed', 'baseAttackTime',
  ])
  assert.equal(ENEMY_REGRESSION_METRICS.find(({ key }) => key === 'baseAttackTime')?.unit, '秒')
})

test('数値係数と表示ステップを対応させ、0を有効な観測として残す', () => {
  const result = runEnemyRegression(numericRows(), { outcome: 'attack', predictors: ['maxHp', 'defense'] })
  assert.equal(result.fit.observationCount, 12)
  assert.equal(result.targetCount, 12)
  assert.equal(result.excludedCount, 0)
  assert.equal(result.observations[0].enemy.stats.maxHp, 0)
  assert.equal(result.observations[0].enemy.stats.defense, 0)
  close(result.fit.intercept, 50)
  close(result.fit.coefficients[0], 0.02)
  close(result.fit.coefficients[1], 0.3)
  assert.deepEqual(result.columns.map(({ key, changeStep }) => [key, changeStep]), [['maxHp', 1_000], ['defense', 100]])
  close(result.fit.coefficients[0] * result.columns[0].changeStep, 20)
  close(result.fit.coefficients[1] * result.columns[1].changeStep, 30)
  assert.equal(result.referenceLevelType, null)
  result.observations.forEach(({ actual, fitted, residual }) => {
    close(fitted, actual)
    close(residual, actual - fitted)
  })
})

test('選択した全変数に有限値が揃う敵だけを使い、未選択項目の欠損は除外理由にしない', () => {
  const rows = [...numericRows(),
    enemy('missing-outcome', { maxHp: 100, defense: 0 }),
    enemy('missing-predictor', { attack: 100, defense: 0 }),
    enemy('nan-predictor', { attack: 100, maxHp: Number.NaN, defense: 0 }),
    enemy('infinite-outcome', { attack: Number.POSITIVE_INFINITY, maxHp: 0, defense: 0 }),
    enemy('infinite-predictor', { attack: 100, maxHp: 0, defense: Number.NEGATIVE_INFINITY }),
  ]
  const result = runEnemyRegression(rows, { outcome: 'attack', predictors: ['maxHp', 'defense'] })
  assert.equal(result.targetCount, 17)
  assert.equal(result.excludedCount, 5)
  assert.equal(result.observations.length, 12)
  assert.ok(result.observations.every(({ enemy }) => enemy.stats.magicResistance === null))
})

test('目的変数が0の観測も欠損扱いにしない', () => {
  const result = runEnemyRegression(Array.from({ length: 5 }, (_, index) => (
    enemy(String(index), { maxHp: index, attack: index * 2 })
  )), { outcome: 'attack', predictors: ['maxHp'] })
  assert.equal(result.observations[0].actual, 0)
  assert.equal(result.excludedCount, 0)
  close(result.fit.coefficients[0], 2)
})

function groupedRows() {
  const increments: Record<EnemyLevelType, number> = { NORMAL: 0, ELITE: 100, BOSS: 300, UNKNOWN: -20 }
  return (['NORMAL', 'ELITE', 'BOSS', 'UNKNOWN'] as const).flatMap((level, group) => (
    Array.from({ length: 5 }, (_, index) => {
      const maxHp = index * 1_000 + group * 200
      return enemy(`${level}-${index}`, { maxHp, attack: 50 + 0.02 * maxHp + increments[level] }, level)
    })
  ))
}

test('通常を基準として敵区分をダミー変数にし、未分類も独立した区分として扱う', () => {
  const result = runEnemyRegression(groupedRows(), { outcome: 'attack', predictors: ['maxHp', 'levelType'] })
  assert.equal(result.referenceLevelType, 'NORMAL')
  assert.deepEqual(result.columns.map(({ key }) => key), ['maxHp', 'levelType:ELITE', 'levelType:BOSS', 'levelType:UNKNOWN'])
  assert.equal(result.columns[3].label, '未分類（通常基準）')
  close(result.fit.intercept, 50)
  result.fit.coefficients.forEach((coefficient, index) => close(coefficient, [0.02, 100, 300, -20][index]))
})

test('通常がなければ共有定義順の先頭区分を基準にし、入力の並びには依存しない', () => {
  const rows = groupedRows().filter(({ levelType }) => levelType !== 'NORMAL').reverse()
  const result = runEnemyRegression(rows, { outcome: 'attack', predictors: ['levelType', 'maxHp'] })
  assert.equal(result.referenceLevelType, 'ELITE')
  assert.deepEqual(result.columns.map(({ key }) => key), ['levelType:BOSS', 'levelType:UNKNOWN', 'maxHp'])
  close(result.fit.intercept, 150)
  result.fit.coefficients.forEach((coefficient, index) => close(coefficient, [200, -120, 0.02][index]))
})

test('基準区分を変えても当てはめ値・残差・R²は変わらない', () => {
  const rows = groupedRows().map((row, index) => ({ ...row, stats: { ...row.stats, attack: row.stats.attack! + (index % 3) * 7 } }))
  const normal = runEnemyRegression(rows, { outcome: 'attack', predictors: ['maxHp', 'levelType'] })
  const elite = runEnemyRegression(rows, { outcome: 'attack', predictors: ['maxHp', 'levelType'], referenceLevelType: 'ELITE' })
  assert.equal(elite.referenceLevelType, 'ELITE')
  assert.deepEqual(elite.columns.map(({ key }) => key), ['maxHp', 'levelType:NORMAL', 'levelType:BOSS', 'levelType:UNKNOWN'])
  normal.observations.forEach((row, index) => {
    close(row.fitted, elite.observations[index].fitted)
    close(row.residual, elite.observations[index].residual)
  })
  close(normal.fit.rSquared, elite.fit.rSquared)
})

test('選択項目の欠損を除いた後の区分から基準を決める', () => {
  const rows = groupedRows().map((row) => row.levelType === 'NORMAL' ? { ...row, stats: { ...row.stats, attack: null } } : row)
  const result = runEnemyRegression(rows, { outcome: 'attack', predictors: ['maxHp', 'levelType'] })
  assert.equal(result.referenceLevelType, 'ELITE')
  assert.equal(result.excludedCount, 5)
})

test('有効な区分が1種類なら区分列を省略して理由を示し、数値変数による分析を続ける', () => {
  const result = runEnemyRegression(numericRows(), { outcome: 'attack', predictors: ['maxHp', 'defense', 'levelType'] })
  assert.deepEqual(result.columns.map(({ key }) => key), ['maxHp', 'defense'])
  assert.equal(result.referenceLevelType, 'NORMAL')
  assert.match(result.notes.join(' '), /通常.*のみ.*省略/)
  close(result.fit.coefficients[0], 0.02)
})

test('区分のみ選択して有効な区分が1種類のときは、切片のみの結果を表示しない', () => {
  assert.throws(() => runEnemyRegression(numericRows(), { outcome: 'attack', predictors: ['levelType'] }), /敵区分が1種類.*数値の説明変数を追加/)
})

test('定数の数値説明変数を黙って除外せず、モデルのエラーを返す', () => {
  const rows = numericRows().map((row) => ({ ...row, stats: { ...row.stats, magicResistance: 10 } }))
  assert.throws(() => runEnemyRegression(rows, { outcome: 'attack', predictors: ['maxHp', 'magicResistance'] }), /術耐性.*すべて同じ値/)
})

test('同じ敵IDを二重に重み付けせず、最初の観測を保持する', () => {
  const rows = numericRows()
  const result = runEnemyRegression([...rows, { ...rows[0], stats: { ...rows[0].stats, attack: 99999 } }], {
    outcome: 'attack', predictors: ['maxHp', 'defense'],
  })
  assert.equal(result.targetCount, 12)
  assert.equal(result.fit.observationCount, 12)
  assert.equal(result.excludedCount, 0)
  assert.equal(result.observations[0].actual, rows[0].stats.attack)
  assert.match(result.notes.join(' '), /重複する敵ID/)
})

test('目的変数との重複・説明変数の重複・空選択を拒否する', () => {
  assert.throws(() => runEnemyRegression(numericRows(), { outcome: 'attack', predictors: ['attack', 'maxHp'] }), /目的変数と同じ/)
  assert.throws(() => runEnemyRegression(numericRows(), { outcome: 'attack', predictors: ['maxHp', 'maxHp'] }), /重複/)
  assert.throws(() => runEnemyRegression(numericRows(), { outcome: 'attack', predictors: [] }), /説明変数を1つ以上/)
})

test('完全ケースがない場合や利用できない基準区分を、理由付きで拒否する', () => {
  assert.throws(() => runEnemyRegression([enemy('missing')], { outcome: 'attack', predictors: ['maxHp'] }), /すべて揃う敵がいません/)
  assert.throws(() => runEnemyRegression(numericRows(), {
    outcome: 'attack', predictors: ['maxHp', 'levelType'], referenceLevelType: 'BOSS',
  }), /基準の敵区分.*有効なデータがありません/)
})
