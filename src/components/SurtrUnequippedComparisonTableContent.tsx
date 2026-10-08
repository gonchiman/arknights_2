import { useMemo, type CSSProperties, type ReactNode } from 'react'
import type { SurtrDpsOutputSeries } from '../lib/surtrDpsOutput'
import { buildSurtrUnequippedComparisonSeries, formatSurtrUnequippedComparisonValue,
  type SurtrUnequippedBlockingComparison, type SurtrUnequippedLayout, type SurtrUnequippedMetric } from '../lib/surtrUnequippedComparison'

export interface SurtrUnequippedComparisonTableData {
  series: readonly SurtrDpsOutputSeries[]
  baseline: SurtrDpsOutputSeries
  resistances: readonly number[]
  precision: number
  metric: SurtrUnequippedMetric
  layout: SurtrUnequippedLayout
  blockingComparison?: readonly SurtrUnequippedBlockingComparison[]
}

export const getUnequippedMetricLabel = (metric: SurtrUnequippedMetric) =>
  metric === 'difference' ? 'DPS差' : metric === 'ratio' ? '比率（未装備＝100%）' : '増加率（%）'

export function SurtrUnequippedComparisonTableContent({ series, baseline, resistances, precision, metric, layout, blockingComparison,
  selectedResistance, onOpenDetail, footer }: SurtrUnequippedComparisonTableData & {
  selectedResistance?: number | null
  onOpenDetail?: (resistance: number, seriesId: string | undefined, metric: SurtrUnequippedMetric | 'total', blocking?: boolean) => void
  footer?: ReactNode
}) {
  const targets = useMemo(() => series.filter(item => item.id !== 'none'), [series])
  const compareBlocking = blockingComparison !== undefined
  const conditions = [false, true] as const
  const columns = useMemo(() => {
    const groups = blockingComparison === undefined
      ? [{ blocking: undefined, series: targets, baseline }]
      : [false, true].map(blocking => ({ blocking, ...blockingComparison.find(group => group.blocking === blocking) }))
    const values = groups.map(group => {
      const comparison = group.baseline ? buildSurtrUnequippedComparisonSeries(group.series ?? [], group.baseline, metric) : []
      return { blocking: group.blocking,
        raw: new Map(group.series?.map(item => [item.id, new Map(item.points.map(point => [point.x, point.value]))])),
        comparison: new Map(comparison.map(item => [item.id, new Map(item.points.map(point => [point.x, point.value]))])) }
    })
    return targets.flatMap(item => values.map(group => ({ seriesId: item.id, blocking: group.blocking,
      raw: group.raw.get(item.id), comparison: group.comparison.get(item.id) })))
  }, [targets, baseline, blockingComparison, metric])
  const baselineValues = useMemo(() => new Map(baseline.points.map(point => [point.x, point.value])), [baseline])
  const formatter = useMemo(() => new Intl.NumberFormat('ja-JP', { minimumFractionDigits: precision, maximumFractionDigits: precision }), [precision])
  const formatDps = (value: number | null | undefined) => {
    if (value == null || !Number.isFinite(value)) return '—'
    const rounded = Number(value.toFixed(precision))
    return formatter.format(rounded === 0 ? 0 : rounded)
  }
  const metricLabel = getUnequippedMetricLabel(metric)
  const combined = layout === 'combined'
  const headerRows = (combined ? 2 : 1) + (compareBlocking ? 1 : 0)
  const moduleColumns = (combined ? 2 : 1) * (compareBlocking ? 2 : 1)
  const columnCount = 1 + (combined ? 1 : 0) + targets.length * moduleColumns
  const minimumWidth = 80 + (combined ? 96 : 0) + targets.length * moduleColumns * (combined ? precision > 1 ? 88 : 76 : 128)
  return <div className={`surtr-s3-table-wrap ${onOpenDetail ? 'surtr-s3-result-table' : ''}`}><table
    className={`surtr-s3-table surtr-s3-unequipped-table${compareBlocking ? ' surtr-s3-equal-blocking-columns' : ''}`}
    style={compareBlocking ? { '--surtr-unequipped-min-width': `${minimumWidth}px` } as CSSProperties : undefined}
    aria-label={`術耐性ごとの未装備との比較：${combined ? 'DPS＋' : ''}${metricLabel}`}>
    {compareBlocking ? <colgroup><col className="surtr-s3-unequipped-resistance-column" /></colgroup> : <colgroup span={1} />}
    {combined && (compareBlocking ? <colgroup><col className="surtr-s3-unequipped-baseline-column" /></colgroup> : <colgroup span={1} />)}
    {targets.map(item => <colgroup key={item.id} span={compareBlocking ? undefined : moduleColumns}>
      {compareBlocking && Array.from({ length: moduleColumns }, (_, index) => <col key={index} />)}
    </colgroup>)}
    <thead><tr>
      <th scope="col" rowSpan={headerRows}>術耐性</th>
      {combined && <th scope="col" rowSpan={headerRows}><span className="surtr-s3-column-label"><i style={{ backgroundColor: baseline.color }} />未装備</span>
        <span className="surtr-s3-baseline-label">DPS・基準</span></th>}
      {targets.map(item => <th key={item.id} scope={moduleColumns > 1 ? 'colgroup' : 'col'} colSpan={moduleColumns}>
        <span className="surtr-s3-column-label"><i style={{ backgroundColor: item.color }} />{item.label}</span>
      </th>)}
    </tr>{compareBlocking && <tr>{targets.flatMap(item => conditions.map(blocking =>
      <th key={`${item.id}:${blocking}`} scope={combined ? 'colgroup' : 'col'} colSpan={combined ? 2 : 1} className="surtr-s3-blocking-column">
        {blocking ? <><span>対象を自身で</span><wbr /><span>ブロック</span></> : '未ブロック'}
      </th>))}</tr>}
    {combined && <tr>{columns.map(column => <FragmentColumns key={`${column.seriesId}:${column.blocking}`} metricLabel={compareBlocking && metric === 'ratio' ? '比率' : metricLabel} />)}</tr>}</thead>
    <tbody>{resistances.map(resistance => <tr key={resistance} className={onOpenDetail && selectedResistance === resistance ? 'is-selected' : undefined}
      onClick={onOpenDetail ? event => {
        const column = event.target instanceof Element ? event.target.closest('td[data-series-id]') : null
        event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
        onOpenDetail(resistance, column?.getAttribute('data-series-id') ?? undefined,
          column?.getAttribute('data-metric') === 'total' ? 'total' : metric,
          column?.hasAttribute('data-blocking') ? column.getAttribute('data-blocking') === 'true' : compareBlocking ? false : undefined)
      } : undefined}>
      <th scope="row">{onOpenDetail ? <button type="button" className="surtr-s3-table-resistance" aria-label={`術耐性 ${resistance}のDPS計算フローを開く`} aria-haspopup="dialog">{resistance}<span aria-hidden="true">›</span></button> : resistance}</th>
      {combined && <td data-series-id="none" data-metric="total">{formatDps(baselineValues.get(resistance))}</td>}
      {columns.map(column => <ComparisonCells key={`${column.seriesId}:${column.blocking}`} seriesId={column.seriesId} blocking={column.blocking} combined={combined}
        dps={formatDps(column.raw?.get(resistance))}
        comparison={formatSurtrUnequippedComparisonValue(column.comparison?.get(resistance), metric, precision)} />)}
    </tr>)}</tbody>
    {footer && <tfoot><tr><td colSpan={columnCount}>{footer}</td></tr></tfoot>}
  </table></div>
}

function FragmentColumns({ metricLabel }: { metricLabel: string }) {
  return <><th scope="col">DPS</th><th scope="col">{metricLabel}</th></>
}

function ComparisonCells({ seriesId, blocking, combined, dps, comparison }: { seriesId: string; blocking?: boolean; combined: boolean; dps: string; comparison: string }) {
  return <>{combined && <td data-series-id={seriesId} data-blocking={blocking} data-metric="total">{dps}</td>}<td data-series-id={seriesId} data-blocking={blocking}>{comparison}</td></>
}
