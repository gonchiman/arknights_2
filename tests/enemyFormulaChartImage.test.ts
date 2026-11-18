import assert from 'node:assert/strict'
import test from 'node:test'
import { fitCorrespondenceModel, type CorrespondenceMethod } from '../src/lib/enemyDefenseResistanceFormula.ts'
import {
  getEnemyFormulaChartImageConditions,
  getEnemyFormulaChartImageFilename,
  type EnemyFormulaChartImageSnapshot,
} from '../src/lib/enemyFormulaChartImage.ts'

const points = [
  { x: 0, y: 100, percentage: 10 },
  { x: 20, y: 150, percentage: 30 },
  { x: 40, y: 300, percentage: 60 },
  { x: 50, y: 1200, percentage: 80 },
  { x: 75, y: 2000, percentage: 95 },
  { x: 90, y: 4000, percentage: 100 },
]
const labels: Record<CorrespondenceMethod, string> = {
  exact: '累積割合', linear: '一次式', piecewise: '区分一次式', polynomial: '多項式', spline: '単調スプライン',
}
function snapshot(method: CorrespondenceMethod = 'exact', degree: 2 | 3 = 2, breakpoints: readonly number[] = [30, 50, 75]): EnemyFormulaChartImageSnapshot {
  const result = fitCorrespondenceModel(points, method, { degree, breakpoints })
  assert.ok(result.model, result.error ?? '')
  return { points, model: result.model, probe: 50, versionId: 'v12', scopeLabel: 'メインストーリー',
    total: 11409, methodLabel: labels[method] }
}

test('保存名に集計版・範囲・方式・強調する術耐性・画像の比率を含める', () => {
  const source = snapshot()
  assert.equal(getEnemyFormulaChartImageFilename(source),
    '敵_集計v12_防御力・術耐性の対応式_メインストーリー_出現回数_累積割合_術耐性50強調_比率自動.png')
  assert.match(getEnemyFormulaChartImageFilename(source, 16 / 9), /_比率16x9\.png$/)
  assert.equal(getEnemyFormulaChartImageFilename(source, 32 / 18), getEnemyFormulaChartImageFilename(source, 16 / 9))
  assert.notEqual(getEnemyFormulaChartImageFilename(source), getEnemyFormulaChartImageFilename({ ...source, scopeLabel: '全体' }))
  assert.notEqual(getEnemyFormulaChartImageFilename(source), getEnemyFormulaChartImageFilename({ ...source, versionId: 'v11' }))
  assert.notEqual(getEnemyFormulaChartImageFilename(source), getEnemyFormulaChartImageFilename({ ...source, probe: 20 }))
  assert.match(getEnemyFormulaChartImageFilename({ ...source, probe: 0 }), /術耐性0強調/)
})

test('選択中の方式にだけ次数・区分の境界を含める', () => {
  const quadratic = getEnemyFormulaChartImageFilename(snapshot('polynomial', 2))
  const cubic = getEnemyFormulaChartImageFilename(snapshot('polynomial', 3))
  assert.match(quadratic, /多項式_2次_/)
  assert.match(cubic, /多項式_3次_/)
  assert.notEqual(quadratic, cubic)
  assert.match(getEnemyFormulaChartImageFilename(snapshot('piecewise')), /区分一次式_区切り30-50-75_/)
  assert.match(getEnemyFormulaChartImageFilename(snapshot('piecewise', 2, [20, 40, 60])), /区切り20-60刻み20_/)
  for (const method of ['exact', 'linear', 'spline'] as const) {
    const filename = getEnemyFormulaChartImageFilename(snapshot(method))
    assert.doesNotMatch(filename, /2次|3次|区切り/)
  }
})

test('有効な強調点だけを条件に記録し、集計結果を画像名の識別子にしない', () => {
  const source = snapshot('linear')
  assert.equal(getEnemyFormulaChartImageConditions(source),
    '集計版 v12・メインストーリー・出現回数 11,409体・術耐性50強調')
  for (const probe of [null, 91, NaN, Infinity]) {
    const withoutProbe = { ...source, probe }
    assert.doesNotMatch(getEnemyFormulaChartImageFilename(withoutProbe), /術耐性.*強調/)
    assert.doesNotMatch(getEnemyFormulaChartImageConditions(withoutProbe), /術耐性.*強調/)
  }
  const refreshed = { ...source, total: 12345, points: points.map(point => ({ ...point, y: point.y + 10 })) }
  assert.equal(getEnemyFormulaChartImageFilename(source), getEnemyFormulaChartImageFilename(refreshed))
  assert.match(getEnemyFormulaChartImageConditions(refreshed), /12,345体/)
})
