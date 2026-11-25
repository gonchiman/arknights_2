import assert from 'node:assert/strict'
import test from 'node:test'
import type { AttributeEffectRow } from '../src/lib/attributeEffectCatalog.ts'
import { compareAttributeEffectCatalogVersions } from '../src/lib/attributeEffectCatalogDiff.ts'
import { ATTRIBUTE_EFFECT_CATALOG_VERSIONS } from '../src/lib/attributeEffectCatalogVersions.ts'

const base: AttributeEffectRow = {
  id: 'talent-defense', operatorName: 'テスト', source: 'talent', sourceLabel: '素質1', name: '天賦',
  attribute: 'physical', effect: '防御力無視', amount: '100', condition: '命中時', href: '#/talents',
}

test('公開したv1とv2は既存65件を保持し、物理7件と術3件の追加を再現する', () => {
  const v1 = ATTRIBUTE_EFFECT_CATALOG_VERSIONS.find(release => release.version === 'v1')
  const v2 = ATTRIBUTE_EFFECT_CATALOG_VERSIONS.find(release => release.version === 'v2')
  assert.ok(v1 && v2)
  assert.equal(v1.rows.length, 65)
  assert.equal(v2.rows.length, 75)
  const changes = compareAttributeEffectCatalogVersions(v1.rows, v2.rows)
  assert.equal(changes.length, 10)
  assert.ok(changes.every(change => change.kind === 'added'))
  assert.equal(changes.filter(change => change.row.attribute === 'physical').length, 7)
  assert.equal(changes.filter(change => change.row.attribute === 'arts').length, 3)
})

test('同じ素質の複数効果をIDで対応させ、追加・変更は新版の順、削除は旧版の順で返す', () => {
  const removed = { ...base, id: 'talent-resistance', attribute: 'arts', effect: '術耐性無視' } as const
  const added = { ...base, id: 'talent-damage', effect: '与ダメージ増加', amount: '10%' }
  const changed = { ...base, amount: '150' }
  assert.deepEqual(compareAttributeEffectCatalogVersions([base, removed], [added, changed]), [
    { kind: 'added', row: added },
    { kind: 'changed', row: changed, previous: base },
    { kind: 'removed', row: removed },
  ])
})

test('一覧で確認できる効果の内容と出典の各項目を比較する', () => {
  const changes = [
    { operatorName: '別名' }, { source: 'skill' }, { sourceLabel: '素質2' }, { name: '新名称' },
    { attribute: 'arts' }, { effect: '防御力低下' }, { amount: '120' }, { condition: '初撃のみ' },
  ] as const
  for (const edit of changes) {
    const row = { ...base, ...edit }
    assert.deepEqual(compareAttributeEffectCatalogVersions([base], [row]), [{ kind: 'changed', row, previous: base }])
  }
})

test('並べ替え、リンク先、原文の表示方法だけの変更は適用状況の変更に数えない', () => {
  const other = { ...base, id: 'second' }
  const modal = { ...base, href: null, description: '攻撃時、防御力を100無視する。' } as const
  assert.deepEqual(compareAttributeEffectCatalogVersions([base, other], [{ ...other, href: '#/operators' }, modal]), [])
  assert.deepEqual(compareAttributeEffectCatalogVersions([modal], [{ ...modal, description: '命中時、防御力を100無視する。' }]), [])
})
