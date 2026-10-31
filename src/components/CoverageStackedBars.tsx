import type { CSSProperties } from 'react'
import './CoverageStackedBars.css'

export interface CoverageBarCategory {
  key: string
  label: string
  color: string
}

export interface CoverageBarRow {
  key: string
  label: string
  total: number
  unit: string
  countUnit?: string
  buckets: Array<CoverageBarCategory & { count: number }>
}

const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`
const colorStyle = (color: string): CSSProperties => ({ '--coverage-bar-color': color } as CSSProperties)

/** Display only: each caller supplies its own population and status definitions. */
export function CoverageStackedBars({ rows, categories, title, legendLabel = '実装状況の凡例',
  showZeroCounts = false, showCountPercent = true, showSegmentTitles = false,
}: {
  rows: readonly CoverageBarRow[]
  categories: readonly CoverageBarCategory[]
  title?: string
  legendLabel?: string
  showZeroCounts?: boolean
  showCountPercent?: boolean
  showSegmentTitles?: boolean
}) {
  return <div className="coverage-stacked-bars">
    <div className="coverage-stacked-heading">
      {title && <h3>{title}</h3>}
      <ul className="coverage-stacked-legend" aria-label={legendLabel}>
        {categories.map(category => <li key={category.key}>
          <span className="coverage-stacked-swatch" style={colorStyle(category.color)} aria-hidden="true" />
          {category.label}
        </li>)}
      </ul>
    </div>
    <div className="coverage-stacked-axis" aria-hidden="true">
      {[0, 25, 50, 75, 100].map(value => <span key={value}>{value}%</span>)}
    </div>
    {rows.map(row => {
      const unit = row.countUnit ?? row.unit
      return <div className="coverage-stacked-row" data-coverage-section={row.key} key={row.key}>
        <span className="coverage-stacked-label" aria-hidden={row.total > 0 || undefined}>{row.label}</span>
        {row.total === 0 ? <span className="coverage-stacked-empty">対象なし</span>
          : <div className="coverage-stacked-values">
            <div className="coverage-stacked-track" role="img"
              aria-label={`${row.label}：${row.total}${row.unit}中、${row.buckets.map(bucket =>
                `${bucket.label} ${bucket.count}${unit}（${formatPercent(bucket.count / row.total)}）`).join('、')}`}>
              {row.buckets.filter(bucket => bucket.count > 0).map(bucket => (
                <span className="coverage-stacked-segment" key={bucket.key} data-coverage-status={bucket.key}
                  style={{ ...colorStyle(bucket.color), width: `${bucket.count / row.total * 100}%` }}
                  title={showSegmentTitles ? `${bucket.label} ${bucket.count}${unit}（${formatPercent(bucket.count / row.total)}）` : undefined}>
                  <span className="coverage-stacked-percent" aria-hidden="true">
                    {formatPercent(bucket.count / row.total)}
                  </span>
                </span>
              ))}
            </div>
            <ul className="coverage-stacked-counts" aria-hidden="true">
              {row.buckets.filter(bucket => showZeroCounts || bucket.count > 0).map(bucket => <li key={bucket.key}>
                <span className="coverage-stacked-swatch" style={colorStyle(bucket.color)} />
                {bucket.label} {bucket.count.toLocaleString('ja-JP')}{unit}
                {showCountPercent && ` · ${formatPercent(bucket.count / row.total)}`}
              </li>)}
            </ul>
          </div>}
      </div>
    })}
  </div>
}
