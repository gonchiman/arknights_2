import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getHpDamageBreakdownComponents,
  getHpDamageBreakdownSegments,
  HP_DAMAGE_BREAKDOWN_COMPONENTS,
} from '../src/lib/goldenglowTargetSwitchHpBreakdown.ts'

test('内訳は通常・爆発・本体の順に全精度で積み上げ、入力を変えない', () => {
  const damage = Object.freeze({ normalDamage: 100.125, explosionDamage: 40.375, bodyDamage: 5.5 })
  const segments = getHpDamageBreakdownSegments(damage)!
  assert.deepEqual(segments.map(({ key, damage, start, end }) => ({ key, damage, start, end })), [
    { key: 'normalDamage', damage: 100.125, start: 0, end: 100.125 },
    { key: 'explosionDamage', damage: 40.375, start: 100.125, end: 140.5 },
    { key: 'bodyDamage', damage: 5.5, start: 140.5, end: 146 },
  ])
  assert.equal(segments.at(-1)!.end, Object.values(damage).reduce((sum, value) => sum + value, 0))
  assert.deepEqual(segments.map(({ key, label }) => ({ key, label })), HP_DAMAGE_BREAKDOWN_COMPONENTS)
})

test('割合は同じHPの各MOD自身の合計を分母とし、総量が違っても100%まで積み上げる', () => {
  for (const factor of [1, 7, 1e100]) {
    const segments = getHpDamageBreakdownSegments({
      normalDamage: 60 * factor, explosionDamage: 30 * factor, bodyDamage: 10 * factor,
    }, 'composition')!
    assert.ok(Math.abs(segments[0].end - 60) < 1e-10)
    assert.ok(Math.abs(segments[1].start - 60) < 1e-10)
    assert.ok(Math.abs(segments[1].end - 90) < 1e-10)
    assert.equal(segments[2].end, 100)
    assert.ok(Math.abs(segments.reduce((sum, segment) => sum + segment.percentage, 0) - 100) < 1e-10)
    assert.equal(segments[0].damage, 60 * factor)
  }
})

test('本体がない場合と通常・爆発の一方だけの場合も割合と積み上げ位置が正しい', () => {
  assert.deepEqual(getHpDamageBreakdownSegments({ normalDamage: 20, explosionDamage: 30, bodyDamage: 0 }, 'composition')!
    .map(({ start, end, percentage }) => [start, end, percentage]), [[0, 40, 40], [40, 100, 60], [100, 100, 0]])
  assert.deepEqual(getHpDamageBreakdownSegments({ normalDamage: 0, explosionDamage: 30, bodyDamage: 0 }, 'composition')!
    .map(({ start, end, percentage }) => [start, end, percentage]), [[0, 0, 0], [0, 100, 100], [100, 100, 0]])
})

test('ゼロダメージはどの表示でも全成分をゼロとし、NaNや無限大にしない', () => {
  for (const mode of ['breakdown', 'composition'] as const) {
    const segments = getHpDamageBreakdownSegments({ normalDamage: 0, explosionDamage: 0, bodyDamage: 0 }, mode)!
    assert.equal(segments.length, 3)
    assert.ok(segments.every(({ damage, percentage, start, end }) => [damage, percentage, start, end].every((value) => value === 0)))
  }
})

test('欠損・不正な内訳を総量から捏造せず、描画可能な成分を返さない', () => {
  for (const breakdown of [undefined, null, 10, '10', [], {}, { normalDamage: 10 },
    { normalDamage: 10, explosionDamage: 2 },
    ...[NaN, Infinity, -Infinity, -1, null, '5'].flatMap((invalid) => (
      HP_DAMAGE_BREAKDOWN_COMPONENTS.map(({ key }) => ({ normalDamage: 10, explosionDamage: 2, bodyDamage: 0, [key]: invalid }))
    )), { normalDamage: Number.MAX_VALUE, explosionDamage: Number.MAX_VALUE, bodyDamage: 0 },
  ]) {
    assert.equal(getHpDamageBreakdownSegments(breakdown), null)
    assert.equal(getHpDamageBreakdownSegments(breakdown, 'composition'), null)
  }
})

test('本体の凡例はどれかの有効なHP・MODに本体ダメージがあるときだけ加える', () => {
  const series = [{ points: [{ damageBreakdown: { normalDamage: 1, explosionDamage: 2, bodyDamage: 0 } }] }]
  assert.deepEqual(getHpDamageBreakdownComponents(series).map(({ key }) => key), ['normalDamage', 'explosionDamage'])
  assert.deepEqual(getHpDamageBreakdownComponents([...series, { points: [
    { damageBreakdown: { normalDamage: 0, explosionDamage: 0, bodyDamage: 1 } },
  ] }]), HP_DAMAGE_BREAKDOWN_COMPONENTS)
  assert.equal(getHpDamageBreakdownComponents([{ points: [{ damageBreakdown: { bodyDamage: 1 } }] }]).length, 2)
  assert.equal(getHpDamageBreakdownComponents([{ points: [{}] }]).length, 2)
  assert.equal(getHpDamageBreakdownComponents([]).length, 2)
})
