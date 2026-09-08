import { getEnemyStatRating, matchesEnemyFilters, type EnemyFilters } from './enemyData.ts'
import type { EnemyRecord } from '../types/enemy.ts'

export const RECENT_ENEMY_LIMIT = 6

export const ENEMY_SEARCH_RATINGS = ['E', 'D', 'C', 'B', 'B+', 'A', 'A+', 'S', 'S+', 'SS'] as const
export type EnemySearchRating = typeof ENEMY_SEARCH_RATINGS[number]

export interface EnemySearchFilters extends EnemyFilters {
  hpRatings: readonly EnemySearchRating[]
  resistanceRatings: readonly EnemySearchRating[]
}

export const EMPTY_ENEMY_SEARCH_FILTERS: EnemySearchFilters = {
  query: '',
  levelType: 'ALL',
  hpRatings: [],
  resistanceRatings: [],
}

export function hasActiveEnemySearchFilters(filters: EnemySearchFilters): boolean {
  return filters.query.normalize('NFKC').trim() !== ''
    || filters.levelType !== 'ALL'
    || filters.hpRatings.length > 0
    || filters.resistanceRatings.length > 0
}

export function matchesEnemySearchFilters(enemy: EnemyRecord, filters: EnemySearchFilters): boolean {
  return matchesEnemyFilters(enemy, filters)
    && matchesRating(getEnemyStatRating('maxHp', enemy.stats.maxHp), filters.hpRatings)
    && matchesRating(getEnemyStatRating('magicResistance', enemy.stats.magicResistance), filters.resistanceRatings)
}

function matchesRating(rating: string | null, selectedRatings: readonly EnemySearchRating[]): boolean {
  return selectedRatings.length === 0 || selectedRatings.some((selected) => selected === rating)
}

export function normalizeRecentEnemyIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const result: string[] = []
  const seen = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const id = entry.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push(id)
    if (result.length === RECENT_ENEMY_LIMIT) break
  }
  return result
}

export function addRecentEnemyId(recentEnemyIds: readonly string[], enemyId: string): string[] {
  return normalizeRecentEnemyIds([enemyId, ...recentEnemyIds])
}

export function getRecentEnemyRows(rows: readonly EnemyRecord[], recentEnemyIds: readonly string[]): EnemyRecord[] {
  const byId = new Map<string, EnemyRecord>()
  for (const row of rows) {
    if (!byId.has(row.id)) byId.set(row.id, row)
  }
  const result: EnemyRecord[] = []
  const seen = new Set<string>()
  for (const rawId of recentEnemyIds) {
    const id = rawId.trim()
    const row = byId.get(id)
    if (!row || seen.has(id)) continue
    seen.add(id)
    result.push(row)
    if (result.length === RECENT_ENEMY_LIMIT) break
  }
  return result
}
