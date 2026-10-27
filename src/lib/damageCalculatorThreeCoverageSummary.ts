import {
  COVERAGE_SECTION_STATUS_LABELS,
  type DamageCalculatorThreeCoverageRow,
  type DamageCalculatorThreeCoverageSectionStatus,
} from './damageCalculatorThreeCoverage.ts'

export const COVERAGE_SUMMARY_CATEGORIES: readonly {
  status: DamageCalculatorThreeCoverageSectionStatus
  label: string
}[] = (['SUPPORTED', 'CONDITIONAL', 'PENDING', 'UNSUPPORTED', 'NOT_APPLICABLE'] as const)
  .map(status => ({ status, label: COVERAGE_SECTION_STATUS_LABELS[status] }))

export const COVERAGE_SUMMARY_SECTIONS = [
  { key: 'overall', label: '総合' },
  { key: 'skill', label: 'スキル' },
  { key: 'talent', label: '素質' },
  { key: 'trait', label: '特性' },
] as const

export interface DamageCalculatorThreeCoverageSummary {
  count: number
  sections: Array<{
    key: typeof COVERAGE_SUMMARY_SECTIONS[number]['key']
    label: string
    buckets: Array<{
      status: DamageCalculatorThreeCoverageSectionStatus
      label: string
      count: number
      proportion: number
    }>
  }>
}

/** The caller supplies the filtered skill rows; every section uses that same population. */
export function summarizeDamageCalculatorThreeCoverage(
  rows: readonly DamageCalculatorThreeCoverageRow[],
): DamageCalculatorThreeCoverageSummary {
  const count = rows.length
  const sections = COVERAGE_SUMMARY_SECTIONS.map(({ key, label }) => {
    const counts = new Map<DamageCalculatorThreeCoverageSectionStatus, number>()
    for (const row of rows) {
      const status = key === 'overall' ? row.status : row.sections[key]
      counts.set(status, (counts.get(status) ?? 0) + 1)
    }
    return {
      key, label,
      buckets: COVERAGE_SUMMARY_CATEGORIES.map(category => {
        const bucketCount = counts.get(category.status) ?? 0
        return { ...category, count: bucketCount, proportion: count > 0 ? bucketCount / count : 0 }
      }),
    }
  })
  return { count, sections }
}
