import type { SkillRecord } from '../types/skill.ts'
import {
  getSkillCoarseCategories,
  SKILL_COARSE_CATEGORIES,
  SKILL_COARSE_CATEGORY_LABELS,
  type SkillCoarseCategory,
} from './skillCoarseClassification.ts'
import { createSkillKMeansFeatures, type SkillKMeansDocument } from './skillKMeans.ts'

export type SkillKMeansScope = 'ALL' | SkillCoarseCategory

export interface SkillKMeansScopeEntry {
  value: SkillKMeansScope
  label: string
  rows: readonly SkillRecord[]
}

/** Group source records before deduplication; a skill can belong to multiple scopes. */
export function buildSkillKMeansScopes(rows: readonly SkillRecord[]): SkillKMeansScopeEntry[] {
  const categories = SKILL_COARSE_CATEGORIES.map(value => ({
    value,
    label: SKILL_COARSE_CATEGORY_LABELS[value],
    rows: [] as SkillRecord[],
  }))
  const byCategory = new Map(categories.map(scope => [scope.value, scope.rows]))
  for (const row of rows) {
    for (const value of getSkillCoarseCategories(row)) byCategory.get(value)!.push(row)
  }
  return [{ value: 'ALL', label: '全スキル', rows }, ...categories]
}

/** Use the same default search range for every scope, capped below its document count. */
export function getSkillKMeansInitialMaxK(_scope: SkillKMeansScope, usableCount: number): number {
  // Fewer than four usable documents cannot form a comparison range; the UI disables search.
  return Math.min(60, Math.max(3, usableCount - 1))
}

/** Use exactly the training tokenizer's exclusions when deriving scope counts and K limits. */
export function getSkillKMeansUsableDocumentCount(documents: readonly SkillKMeansDocument[]): number {
  return createSkillKMeansFeatures(documents).vectors.length
}
