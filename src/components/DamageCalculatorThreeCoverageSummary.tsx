import { useId, useMemo } from 'react'
import type { DamageCalculatorThreeCoverageRow } from '../lib/damageCalculatorThreeCoverage'
import {
  COVERAGE_SUMMARY_CATEGORIES,
  summarizeDamageCalculatorThreeCoverage,
} from '../lib/damageCalculatorThreeCoverageSummary'
import { CoverageStackedBars } from './CoverageStackedBars'
import './DamageCalculatorThreeCoverageSummary.css'

const COLORS = {
  SUPPORTED: 'var(--coverage-bar-blue)',
  CONDITIONAL: 'var(--coverage-bar-gold)',
  PENDING: 'var(--coverage-bar-rose)',
  UNSUPPORTED: 'var(--coverage-bar-gray)',
  NOT_APPLICABLE: 'var(--coverage-bar-light-gray)',
} as const
const CATEGORIES = COVERAGE_SUMMARY_CATEGORIES.map(({ status, label }) => ({ key: status, label, color: COLORS[status] }))

export function DamageCalculatorThreeCoverageSummary({ rows }: {
  rows: readonly DamageCalculatorThreeCoverageRow[]
}) {
  const titleId = useId()
  const summary = useMemo(() => summarizeDamageCalculatorThreeCoverage(rows), [rows])

  return (
    <section className="damage-three-coverage-summary" aria-labelledby={titleId}>
      <header className="filters-heading damage-three-coverage-summary-heading">
        <h2 id={titleId}>絞り込み結果の対応状況</h2>
        <span>{summary.count.toLocaleString('ja-JP')}スキル</span>
      </header>
      {summary.count === 0 ? (
        <p className="damage-three-coverage-summary-empty">集計対象のスキルがありません</p>
      ) : (
        <div className="damage-three-coverage-summary-body">
          <CoverageStackedBars categories={CATEGORIES} showSegmentTitles rows={summary.sections.map(section => ({
            key: section.key, label: section.label, total: summary.count, unit: 'スキル', countUnit: '件',
            buckets: section.buckets.map(bucket => ({
              key: bucket.status, label: bucket.label, count: bucket.count, color: COLORS[bucket.status],
            })),
          }))} />
        </div>
      )}
    </section>
  )
}
