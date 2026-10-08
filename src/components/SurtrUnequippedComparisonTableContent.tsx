import { useMemo, type ReactNode } from 'react'
import type { SurtrDpsOutputSeries } from '../lib/surtrDpsOutput'
import { buildSurtrUnequippedComparisonSeries, formatSurtrUnequippedComparisonValue,
  type SurtrUnequippedLayout, type SurtrUnequippedMetric } from '../lib/surtrUnequippedComparison'

export interface SurtrUnequippedComparisonTableData {
  series: readonly SurtrDpsOutputSeries[]
  baseline: SurtrDpsOutputSeries
  resistances: readonly number[]
  precision: number
  metric: SurtrUnequippedMetric
  layout: SurtrUnequippedLayout
}

export const getUnequippedMetricLabel = (metric: SurtrUnequippedMetric) =>
  metric === 'difference' ? 'DPS差' : metric === 'ratio' ? '比率（未装備＝100%）' : '増加率（%）'

export function SurtrUnequippedComparisonTableContent({ series, baseline, resistances, precision, metric, layout,
  selectedResistance, onOpenDetail, footer }: SurtrUnequippedComparisonTableData & {
  selectedResistance?: number | null
  onOpenDetail?: (resistance: number, seriesId: string | undefined, metric: SurtrUnequippedMetric | 'total') => void
  footer?: ReactNode
}) {
  const targets = useMemo(() => series.filter(item => item.id !== 'none'), [series])
  const comparison = useMemo(() => buildSurtrUnequippedComparisonSeries(targets, baseline, metric), [targets, baseline, metric])
  const rawValues = useMemo(() => targets.map(item => new Map(item.points.map(point => [point.x, point.value]))), [targets])
  const comparisonValues = useMemo(() => comparison.map(item => new Map(item.points.map(point => [point.x, point.value]))), [comparison])
  const baselineValues = useMemo(() => new Map(baseline.points.map(point => [point.x, point.value])), [baseline])
  const formatter = useMemo(() => new Intl.NumberFormat('ja-JP', { minimumFractionDigits: precision, maximumFractionDigits: precision }), [precision])
  const formatDps = (value: number | null | undefined) => {
    if (value == null || !Number.isFinite(value)) return '—'
    const rounded = Number(value.toFixed(precision))
    return formatter.format(rounded === 0 ? 0 : rounded)
  }
  const metricLabel = getUnequippedMetricLabel(metric)
  const combined = layout === 'combined'
  return <div className={`surtr-s3-table-wrap ${onOpenDetail ? 'surtr-s3-result-table' : ''}`}><table className="surtr-s3-table surtr-s3-unequipped-table" aria-label={`術耐性ごとの未装備との比較：${combined ? 'DPS＋' : ''}${metricLabel}`}>
    <colgroup span={1} />{combined && <colgroup span={1} />}{targets.map(item => <colgroup key={item.id} span={combined ? 2 : 1} />)}
    <thead><tr>
      <th scope="col" rowSpan={combined ? 2 : 1}>術耐性</th>
      {combined && <th scope="col" rowSpan={2}><span className="surtr-s3-column-label"><i style={{ backgroundColor: baseline.color }} />未装備</span>
        <span className="surtr-s3-baseline-label">DPS・基準</span></th>}
      {targets.map(item => <th key={item.id} scope={combined ? 'colgroup' : 'col'} colSpan={combined ? 2 : 1}>
        <span className="surtr-s3-column-label"><i style={{ backgroundColor: item.color }} />{item.label}</span>
      </th>)}
    </tr>{combined && <tr>{targets.map(item => <FragmentColumns key={item.id} metricLabel={metricLabel} />)}</tr>}</thead>
    <tbody>{resistances.map(resistance => <tr key={resistance} className={onOpenDetail && selectedResistance === resistance ? 'is-selected' : undefined}
      onClick={onOpenDetail ? event => {
        const column = event.target instanceof Element ? event.target.closest('td[data-series-id]') : null
        event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
        onOpenDetail(resistance, column?.getAttribute('data-series-id') ?? undefined,
          column?.getAttribute('data-metric') === 'total' ? 'total' : metric)
      } : undefined}>
      <th scope="row">{onOpenDetail ? <button type="button" className="surtr-s3-table-resistance" aria-label={`術耐性 ${resistance}のDPS計算フローを開く`} aria-haspopup="dialog">{resistance}<span aria-hidden="true">›</span></button> : resistance}</th>
      {combined && <td data-series-id="none" data-metric="total">{formatDps(baselineValues.get(resistance))}</td>}
      {targets.map((item, index) => <ComparisonCells key={item.id} seriesId={item.id} combined={combined}
        dps={formatDps(rawValues[index].get(resistance))}
        comparison={formatSurtrUnequippedComparisonValue(comparisonValues[index].get(resistance), metric, precision)} />)}
    </tr>)}</tbody>
    {footer && <tfoot><tr><td colSpan={1 + (combined ? 1 : 0) + targets.length * (combined ? 2 : 1)}>{footer}</td></tr></tfoot>}
  </table></div>
}

function FragmentColumns({ metricLabel }: { metricLabel: string }) {
  return <><th scope="col">DPS</th><th scope="col">{metricLabel}</th></>
}

function ComparisonCells({ seriesId, combined, dps, comparison }: { seriesId: string; combined: boolean; dps: string; comparison: string }) {
  return <>{combined && <td data-series-id={seriesId} data-metric="total">{dps}</td>}<td data-series-id={seriesId}>{comparison}</td></>
}
