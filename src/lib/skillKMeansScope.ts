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

/** A small starting range for coarse scopes, not an estimate of the optimum K. */
export function getSkillKMeansInitialMaxK(scope: SkillKMeansScope, usableCount: number): number {
  // Fewer than four usable documents cannot form a comparison range; the UI disables search.
  const limit = Math.max(3, Math.min(80, usableCount - 1))
  return scope === 'ALL' ? Math.min(60, limit) : Math.min(10, Math.max(3, Math.floor(usableCount / 10)), limit)
}

/** Use exactly the training tokenizer's exclusions when deriving scope counts and K limits. */
export function getSkillKMeansUsableDocumentCount(documents: readonly SkillKMeansDocument[]): number {
  return createSkillKMeansFeatures(documents).vectors.length
}
