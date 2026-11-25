import type { AttributeEffectRow } from './attributeEffectCatalog.ts'

export type AttributeEffectCatalogChange =
  | { kind: 'added' | 'removed'; row: AttributeEffectRow; previous?: never }
  | { kind: 'changed'; row: AttributeEffectRow; previous: AttributeEffectRow }

// Links and original descriptions provide evidence for the catalogued effect.
const effectFields = ['operatorName', 'source', 'sourceLabel', 'name', 'attribute', 'effect', 'amount', 'condition'] as const

export function compareAttributeEffectCatalogVersions(
  previous: readonly AttributeEffectRow[],
  current: readonly AttributeEffectRow[],
): AttributeEffectCatalogChange[] {
  const remaining = new Map(previous.map(row => [row.id, row]))
  const changes: AttributeEffectCatalogChange[] = []

  for (const row of current) {
    const before = remaining.get(row.id)
    if (!before) {
      changes.push({ kind: 'added', row })
      continue
    }
    remaining.delete(row.id)
    if (effectFields.some(field => row[field] !== before[field])) {
      changes.push({ kind: 'changed', row, previous: before })
    }
  }
  for (const row of remaining.values()) changes.push({ kind: 'removed', row })
  return changes
}
