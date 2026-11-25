import v1 from '../data/attribute-effect-catalog/v1.json' with { type: 'json' }
import v2 from '../data/attribute-effect-catalog/v2.json' with { type: 'json' }
import type { AttributeEffectRow } from './attributeEffectCatalog.ts'

export interface AttributeEffectCatalogVersion {
  version: string
  codeRevision: string
  gameDataRevision: string
  rows: AttributeEffectRow[]
}

// JSON imports preserve field types but widen the catalog's string discriminants.
type StoredRow = Omit<AttributeEffectRow, 'source' | 'attribute' | 'description'> & {
  source: string
  attribute: string
  description?: string
}

function isCatalogRow(row: StoredRow): row is AttributeEffectRow {
  return (row.source === 'talent' || row.source === 'skill')
    && (row.attribute === 'physical' || row.attribute === 'arts')
    && (row.href === null ? !!row.description : !!row.href && row.description === undefined)
}

function readVersion(snapshot: Omit<AttributeEffectCatalogVersion, 'rows'> & { rows: StoredRow[] }): AttributeEffectCatalogVersion {
  const { rows } = snapshot
  if (!rows.every(isCatalogRow) || new Set(rows.map(row => row.id)).size !== rows.length) {
    throw new Error(`属性限定効果一覧 ${snapshot.version} の保存データが不正です。`)
  }
  return { ...snapshot, rows }
}

export const ATTRIBUTE_EFFECT_CATALOG_VERSIONS = [v2, v1].map(readVersion)
