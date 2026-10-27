import { useId, useMemo } from 'react'
import type { DamageCalculatorThreeCoverageRow } from '../lib/damageCalculatorThreeCoverage'
import {
  COVERAGE_SUMMARY_CATEGORIES,
  summarizeDamageCalculatorThreeCoverage,
} from '../lib/damageCalculatorThreeCoverageSummary'
import './DamageCalculatorThreeCoverageSummary.css'

const formatPercent = (proportion: number) => `${(proportion * 100).toFixed(1)}%`

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
          <ul className="damage-three-coverage-summary-legend" aria-label="実装状況の凡例">
            {COVERAGE_SUMMARY_CATEGORIES.map(({ status, label }) => <li key={status}>
              <span className="damage-three-coverage-summary-swatch" data-coverage-status={status} aria-hidden="true" />
              {label}
            </li>)}
          </ul>
          <div className="damage-three-coverage-summary-axis" aria-hidden="true">
            {[0, 25, 50, 75, 100].map(value => <span key={value}>{value}%</span>)}
          </div>
          {summary.sections.map(({ key, label, buckets }) => (
            <div className="damage-three-coverage-summary-row" data-coverage-section={key} key={key}>
              <span className="damage-three-coverage-summary-label" aria-hidden="true">{label}</span>
              <div className="damage-three-coverage-summary-values">
                <div className="damage-three-coverage-summary-track" role="img"
                  aria-label={`${label}：${summary.count}スキル中、${buckets.map(bucket =>
                    `${bucket.label} ${bucket.count}件（${formatPercent(bucket.proportion)}）`).join('、')}`}>
                  {buckets.filter(bucket => bucket.count > 0).map(bucket => (
                    <span className="damage-three-coverage-summary-segment" key={bucket.status}
                      data-coverage-status={bucket.status}
                      style={{ width: `${bucket.proportion * 100}%` }}
                      title={`${bucket.label} ${bucket.count}件（${formatPercent(bucket.proportion)}）`}>
                      <span className="damage-three-coverage-summary-percent" aria-hidden="true">
                        {formatPercent(bucket.proportion)}
                      </span>
                    </span>
                  ))}
                </div>
                <ul className="damage-three-coverage-summary-counts" aria-hidden="true">
                  {buckets.filter(bucket => bucket.count > 0).map(bucket => <li key={bucket.status}>
                    <span className="damage-three-coverage-summary-swatch" data-coverage-status={bucket.status} />
                    {bucket.label} {bucket.count.toLocaleString('ja-JP')}件 · {formatPercent(bucket.proportion)}
                  </li>)}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
