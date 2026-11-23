import test from 'node:test'
import assert from 'node:assert/strict'
import { sortSkillDamageMatrixEntries } from '../src/components/useSkillDamageMatrixSort.ts'
import type { DamageThreeAttributeEntry } from '../src/lib/damageCalculatorThreeAttributeComparison.ts'
import type { DamageCell } from '../src/lib/damageThreeSkillRankMatrix.ts'

function entry(operatorName: string, skillIndex: number, skillName: string, stageLabel?: string) {
  return {
    skill: { operatorName, skillIndex, skillName },
    structure: { effectStructure: { stages: stageLabel ? [{}, {}] : [{}] } },
    stageLabel: stageLabel ?? '発動中',
  } as DamageThreeAttributeEntry
}

test('スキル比較の表示列で並べ替え、非表示の単独段階は降順でも最後に置く', () => {
  const a = entry('ア', 1, '攻撃10')
  const b = entry('ア', 3, '攻撃2', '発動10回目')
  const c = entry('イ', 2, '攻撃2', '発動2回目')
  const rows = [a, b, c]
  assert.equal(sortSkillDamageMatrixEntries(rows, 'operator', 'asc'), rows)
  assert.deepEqual(sortSkillDamageMatrixEntries(rows, 'operator', 'desc'), [c, a, b])
  assert.deepEqual(sortSkillDamageMatrixEntries(rows, 'skillIndex', 'asc'), [a, c, b])
  assert.deepEqual(sortSkillDamageMatrixEntries(rows, 'skillName', 'asc'), [b, c, a])
  assert.deepEqual(sortSkillDamageMatrixEntries(rows, 'stage', 'asc'), [c, b, a])
  assert.deepEqual(sortSkillDamageMatrixEntries(rows, 'stage', 'desc'), [b, c, a])
})

test('ダメージは未丸めの値・符号付き差で比較し、同値の順序と欠損値末尾を保つ', () => {
  const rows = Array.from({ length: 6 }, (_, index) => entry(String(index), 1, '攻撃'))
  const [a, b, c, d, e, f] = rows
  const cells = new WeakMap<DamageThreeAttributeEntry, DamageCell>([
    [a, { physical: 1.01, arts: 1.02 }], [b, { physical: 1.02, arts: 1.01 }],
    [c, { physical: 0, arts: 0 }], [d, { physical: 2, arts: 2 }],
    [e, { physical: Number.NaN, arts: null }],
  ])
  assert.deepEqual(sortSkillDamageMatrixEntries(rows, 'physical', 'asc', cells), [c, a, b, d, e, f])
  assert.deepEqual(sortSkillDamageMatrixEntries(rows, 'arts', 'desc', cells), [d, a, b, c, e, f])
  assert.deepEqual(sortSkillDamageMatrixEntries(rows, 'difference', 'asc', cells), [a, c, d, b, e, f])
  assert.deepEqual(sortSkillDamageMatrixEntries(rows, 'difference', 'desc', cells), [b, c, d, a, e, f])
  assert.equal(sortSkillDamageMatrixEntries(rows, 'difference', 'desc'), rows)
})
