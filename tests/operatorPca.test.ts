import test from 'node:test'
import assert from 'node:assert/strict'
import type { OperatorDatabaseRecord, OperatorDatabaseStats } from '../src/lib/operatorDatabase.ts'
import { OPERATOR_PCA_METRICS, runOperatorPca, findOperatorPcaNeighbors, type OperatorPcaPoint } from '../src/lib/operatorPca.ts'

function createOperator(id: string, overrides: Partial<OperatorDatabaseStats> = {}): OperatorDatabaseRecord {
  return {
    operatorId: id, name: id, nameInitial: 'OTHER', affiliation: null, rarity: 6,
    profession: 'WARRIOR', professionLabel: '前衛', subProfessionId: 'artsfghter', subProfessionName: '術戦士',
    stats: { maxHp: 1000, attack: 300, defense: 200, magicResistance: 10, deploymentCost: 20,
      blockCount: 1, redeployTime: 70, attackSpeed: 100, attackInterval: 1.25, ...overrides },
    statsCondition: '昇進2 Lv.90・信頼度100（潜在能力／モジュール補正なし）',
    traitDescription: '', potentials: [], talents: [], skills: [], modules: [],
  }
}

test('既存ステータスを8項目で利用し、攻撃速度は二重計上しない', () => {
  assert.deepEqual(OPERATOR_PCA_METRICS.map(({ key }) => key), [
    'maxHp', 'attack', 'defense', 'magicResistance', 'deploymentCost', 'blockCount', 'redeployTime', 'attackInterval',
  ])
  const rows = [createOperator('a'), createOperator('b', { maxHp: 2000, attackSpeed: null })]
  const result = runOperatorPca(rows)
  assert.equal(result.points.length, 2)
  assert.deepEqual(result.points[0].values, [1000, 300, 200, 10, 20, 1, 70, 1.25])
  assert.equal(result.points[0].operator, rows[0])
  assert.equal(result.points[0].x, -1)
  assert.equal(result.points[1].x, 1)
  assert.equal(result.points[0].y, 0)
  assert.equal(result.points[1].y, 0)
})

test('敵と同様にIDを1票とし、欠損・非有限値を除いた件数を返す', () => {
  const result = runOperatorPca([
    createOperator('a'), createOperator('a', { maxHp: 9999 }), createOperator('b', { maxHp: 2000 }),
    createOperator('missing', { attack: null }), createOperator('invalid', { defense: Infinity }),
  ])
  assert.equal(result.targetCount, 4)
  assert.equal(result.duplicateCount, 1)
  assert.equal(result.excludedCount, 2)
  assert.deepEqual(result.points.map(point => point.operator.operatorId), ['a', 'b'])
  assert.deepEqual(result.fit.means.slice(0, 2), [1500, 300])
})

test('対象不足と変動のない母集団は安全なエラーになる', () => {
  assert.throws(() => runOperatorPca([]), /2件以上/)
  assert.throws(() => runOperatorPca([createOperator('a'), createOperator('missing', { maxHp: null })]), /2件以上/)
  assert.throws(() => runOperatorPca([createOperator('a'), createOperator('b')]), /同じ値/)
})

function point(id: string, standardized: number[], x: number, y: number): OperatorPcaPoint {
  return { operator: createOperator(id), values: [], standardized, scores: [x, y], x, y }
}

test('近傍は散布図の近さではなく、標準化した元の全項目の距離で選ぶ', () => {
  const selected = point('selected', [0, 0, 0], 0, 0)
  const visuallyNear = point('visually-near', [0, 0, 10], 0, 0)
  const actuallyNear = point('actually-near', [1, 0, 0], 5, 5)
  const result = findOperatorPcaNeighbors([selected, visuallyNear, actuallyNear], 'selected')
  assert.deepEqual(result.map(({ point }) => point.operator.operatorId), ['actually-near', 'visually-near'])
  assert.deepEqual(result.map(({ distance }) => distance), [1, 10])
})

test('候補の絞り込み後も座標を変えず、選択を除く最大3名と同距離の安定順を返す', () => {
  const selected = point('selected', [0], 0, 0)
  const candidates = [point('c', [1], 1, 0), point('b', [-1], -1, 0), point('a', [1], 1, 0), point('d', [2], 2, 0)]
  const all = [selected, ...candidates]
  assert.deepEqual(findOperatorPcaNeighbors(all, 'selected').map(({ point }) => point.operator.name), ['a', 'b', 'c'])
  const filtered = [selected, candidates[3]]
  const neighbors = findOperatorPcaNeighbors(filtered, 'selected')
  assert.equal(neighbors.length, 1)
  assert.equal(neighbors[0].point, candidates[3])
  assert.deepEqual(findOperatorPcaNeighbors(all, 'absent'), [])
  assert.deepEqual(findOperatorPcaNeighbors([selected], 'selected'), [])
  assert.deepEqual(findOperatorPcaNeighbors(all, 'selected', 0), [])
})
