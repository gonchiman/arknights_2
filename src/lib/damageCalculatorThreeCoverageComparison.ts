import {
  EMPTY_DAMAGE_THREE_COVERAGE_FILTERS,
  filterDamageCalculatorThreeCoverage,
  type DamageCalculatorThreeCoverageFilters,
} from './damageCalculatorThreeCoverageFilters.ts'
import {
  canonicalCoverageJson,
  coverageRecordKey,
  diffCoverageRecords,
  type CoverageChange,
  type CoverageRecord,
  type CoverageSnapshot,
  type CoverageVersionInfo,
} from './damageCalculatorThreeCoverageHistory.ts'
import {
  summarizeDamageCalculatorThreeCoverage,
  type DamageCalculatorThreeCoverageSummary,
} from './damageCalculatorThreeCoverageSummary.ts'

export type CoverageComparisonFilters = Pick<DamageCalculatorThreeCoverageFilters, 'profession' | 'rarity'>

export interface CoverageVersionSummary {
  version: CoverageVersionInfo
  rows: CoverageRecord[]
  summary: DamageCalculatorThreeCoverageSummary
}

function filterRows(rows: readonly CoverageRecord[], filters: CoverageComparisonFilters): CoverageRecord[] {
  return filterDamageCalculatorThreeCoverage(rows, { ...EMPTY_DAMAGE_THREE_COVERAGE_FILTERS,
    profession: filters.profession, rarity: filters.rarity })
}

/** Each saved version retains its own population, even when catalogs differ. */
export function summarizeCoverageVersions(
  versions: readonly CoverageVersionInfo[],
  snapshots: Readonly<Record<string, CoverageSnapshot>>,
  selectedIds: readonly string[],
  filters: CoverageComparisonFilters,
): CoverageVersionSummary[] {
  const selected = [...new Set(selectedIds)].map(id => {
    const version = versions.find(candidate => candidate.id === id)
    if (!version) throw new Error(`バージョン「${id}」がありません。`)
    return version
  }).sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))

  return selected.map(version => {
    const snapshot = snapshots[canonicalCoverageJson(version)]
    if (!snapshot) throw new Error(`${version.label}の保存データが読み込まれていません。`)
    const rows = filterRows(snapshot.rows, filters)
    return { version, rows, summary: summarizeDamageCalculatorThreeCoverage(rows) }
  })
}

/** Filter after the full diff so metadata moves do not become catalog additions or removals. */
export function compareCoverageVersionRows(
  before: readonly CoverageRecord[],
  after: readonly CoverageRecord[],
  filters: CoverageComparisonFilters,
): CoverageChange[] {
  const included = new Set([...filterRows(before, filters), ...filterRows(after, filters)].map(coverageRecordKey))
  return diffCoverageRecords(before, after).filter(change => included.has(change.key))
}

export function getCoverageChangeLabel(change: CoverageChange): string {
  if (change.kind === 'ADDED') return 'カタログ追加'
  if (change.kind === 'REMOVED') return 'カタログ削除'
  if (change.after?.status === 'NOT_APPLICABLE' && change.before?.status !== 'NOT_APPLICABLE') return '対象外に分類'
  const usable = (row: CoverageRecord | undefined) => row?.status === 'SUPPORTED' || row?.status === 'CONDITIONAL'
  if (!usable(change.before) && usable(change.after)) return '新規対応'
  if (change.before?.status === 'UNSUPPORTED' && change.after?.status === 'PENDING') return '登録追加'
  return '変更'
}
