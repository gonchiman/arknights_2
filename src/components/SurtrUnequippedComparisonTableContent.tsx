import { useMemo, type CSSProperties, type ReactNode } from 'react'
import type { SurtrDpsOutputSeries } from '../lib/surtrDpsOutput'
import { getSurtrDpsResistanceRating } from '../lib/surtrDpsResistance'
import { getSurtrUnequippedColorScaleBackground, getSurtrUnequippedColorScaleMaximum } from '../lib/surtrUnequippedColorScale'
import { buildSurtrUnequippedComparisonSeries, formatSurtrUnequippedComparisonValue, getSurtrUnequippedColumns,
  type SurtrUnequippedBlockingComparison, type SurtrUnequippedColumnOrder, type SurtrUnequippedLayout, type SurtrUnequippedMetric, type SurtrUnequippedRankMode } from '../lib/surtrUnequippedComparison'

export interface SurtrUnequippedComparisonTableData {
  series: readonly SurtrDpsOutputSeries[]
  baseline: SurtrDpsOutputSeries
  resistances: readonly number[]
  precision: number
  metric: SurtrUnequippedMetric
  layout: SurtrUnequippedLayout
  rankMode?: SurtrUnequippedRankMode
  columnOrder?: SurtrUnequippedColumnOrder
  colorScale?: boolean
  blockingComparison?: readonly SurtrUnequippedBlockingComparison[]
}

export const getUnequippedMetricLabel = (metric: SurtrUnequippedMetric) =>
  metric === 'difference' ? 'DPS差' : metric === 'ratio' ? '比率（未装備＝100%）' : '増加率（%）'

export function SurtrUnequippedComparisonTableContent({ series, baseline, resistances, precision, metric, layout, rankMode = 'none', columnOrder = 'module', colorScale = false, blockingComparison,
  selectedResistance, onOpenDetail, footer }: SurtrUnequippedComparisonTableData & {
  selectedResistance?: number | null
  onOpenDetail?: (resistance: number, seriesId: string | undefined, metric: SurtrUnequippedMetric | 'total', blocking?: boolean) => void
  footer?: ReactNode
}) {
  const targets = useMemo(() => series.filter(item => item.id !== 'none'), [series])
  const compareBlocking = blockingComparison !== undefined
  const blockingFirst = compareBlocking && columnOrder === 'blocking'
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
    return getSurtrUnequippedColumns(targets, values, columnOrder).map(({ item, condition }) => ({ item, seriesId: item.id, blocking: condition.blocking,
      raw: condition.raw.get(item.id), comparison: condition.comparison.get(item.id) }))
  }, [targets, baseline, blockingComparison, metric, columnOrder])
  const colorScaleMaximum = useMemo(() => colorScale ? getSurtrUnequippedColorScaleMaximum(
    columns.flatMap(column => resistances.map(resistance => column.comparison?.get(resistance))), metric,
  ) : 0, [columns, resistances, metric, colorScale])
  const baselineValues = useMemo(() => new Map(baseline.points.map(point => [point.x, point.value])), [baseline])
  const resistanceRows = useMemo(() => {
    const rows = resistances.map(resistance => ({ resistance, rank: getSurtrDpsResistanceRating(resistance), rankRowSpan: 1 }))
    if (rankMode !== 'merged') return rows
    for (let index = 0; index < rows.length;) {
      const first = rows[index]
      let end = index + 1
      if (first.rank) {
        while (end < rows.length && rows[end].rank?.rating === first.rank.rating) end += 1
      }
      first.rankRowSpan = end - index
      for (let following = index + 1; following < end; following += 1) rows[following].rankRowSpan = 0
      index = end
    }
    return rows
  }, [resistances, rankMode])
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
  const mergedRanks = rankMode === 'merged'
  const columnCount = 1 + (mergedRanks ? 1 : 0) + (combined ? 1 : 0) + targets.length * moduleColumns
  const resistanceWidth = rankMode === 'inline' ? 112 : 80
  const minimumWidth = resistanceWidth + (mergedRanks ? 64 : 0) + (combined ? 96 : 0) + targets.length * moduleColumns * (combined ? precision > 1 ? 88 : 76 : 128)
  return <div className={`surtr-s3-table-wrap ${onOpenDetail ? 'surtr-s3-result-table' : ''}`}><table
    className={`surtr-s3-table surtr-s3-unequipped-table${compareBlocking ? ' surtr-s3-equal-blocking-columns' : ''}${rankMode === 'inline' ? ' surtr-s3-rank-inline' : ''}${colorScale ? ' surtr-s3-color-scale' : ''}`}
    style={compareBlocking ? { '--surtr-unequipped-min-width': `${minimumWidth}px`, '--surtr-unequipped-resistance-width': `${resistanceWidth}px` } as CSSProperties : undefined}
    aria-label={`術耐性ごとの未装備との比較：${combined ? 'DPS＋' : ''}${metricLabel}`}>
    {mergedRanks && <colgroup><col className="surtr-s3-unequipped-rank-column" /></colgroup>}
    {compareBlocking ? <colgroup><col className="surtr-s3-unequipped-resistance-column" /></colgroup> : <colgroup span={1} />}
    {combined && (compareBlocking ? <colgroup><col className="surtr-s3-unequipped-baseline-column" /></colgroup> : <colgroup span={1} />)}
    {blockingFirst ? conditions.map(blocking => <colgroup key={String(blocking)}>
      {Array.from({ length: targets.length * (combined ? 2 : 1) }, (_, index) => <col key={index} />)}
    </colgroup>) : targets.map(item => <colgroup key={item.id} span={compareBlocking ? undefined : moduleColumns}>
      {compareBlocking && Array.from({ length: moduleColumns }, (_, index) => <col key={index} />)}
    </colgroup>)}
    <thead><tr>
      {mergedRanks && <th className="surtr-s3-rank-cell" scope="col" rowSpan={headerRows}>ランク</th>}
      <th scope="col" rowSpan={headerRows}>術耐性</th>
      {combined && <th scope="col" rowSpan={headerRows}><span className="surtr-s3-column-label"><i style={{ backgroundColor: baseline.color }} />未装備</span>
        <span className="surtr-s3-baseline-label">DPS・基準</span></th>}
      {blockingFirst ? conditions.map(blocking => <BlockingHeader key={String(blocking)} blocking={blocking} colSpan={targets.length * (combined ? 2 : 1)} />)
        : targets.map(item => <ModuleHeader key={item.id} item={item} colSpan={moduleColumns} />)}
    </tr>{compareBlocking && <tr>{columns.map(column => blockingFirst
      ? <ModuleHeader key={`${column.seriesId}:${column.blocking}`} item={column.item} colSpan={combined ? 2 : 1} />
      : <BlockingHeader key={`${column.seriesId}:${column.blocking}`} blocking={column.blocking === true} colSpan={combined ? 2 : 1} />)}</tr>}
    {combined && <tr>{columns.map(column => <FragmentColumns key={`${column.seriesId}:${column.blocking}`} metricLabel={compareBlocking && metric === 'ratio' ? '比率' : metricLabel} />)}</tr>}</thead>
    <tbody>{resistanceRows.map(({ resistance, rank, rankRowSpan }) => <tr key={resistance} className={onOpenDetail && selectedResistance === resistance ? 'is-selected' : undefined}
      onClick={onOpenDetail ? event => {
        const column = event.target instanceof Element ? event.target.closest('td[data-series-id]') : null
        event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
        onOpenDetail(resistance, column?.getAttribute('data-series-id') ?? undefined,
          column?.getAttribute('data-metric') === 'total' ? 'total' : metric,
          column?.hasAttribute('data-blocking') ? column.getAttribute('data-blocking') === 'true' : compareBlocking ? false : undefined)
      } : undefined}>
      {mergedRanks && rankRowSpan > 0 && <th className="surtr-s3-rank-cell" scope="row" rowSpan={rankRowSpan}
        onClick={event => event.stopPropagation()}><ResistanceRank rank={rank} /></th>}
      <th scope="row">{onOpenDetail ? <button type="button" className="surtr-s3-table-resistance" aria-label={`術耐性 ${resistance}のDPS計算フローを開く`} aria-haspopup="dialog">
        {resistance}{rankMode === 'inline' && <ResistanceRank rank={rank} />}<span aria-hidden="true">›</span>
      </button> : rankMode === 'inline' ? <span className="surtr-s3-resistance-rank-value">{resistance}<ResistanceRank rank={rank} /></span> : resistance}</th>
      {combined && <td data-series-id="none" data-metric="total">{formatDps(baselineValues.get(resistance))}</td>}
      {columns.map(column => <ComparisonCells key={`${column.seriesId}:${column.blocking}`} seriesId={column.seriesId} blocking={column.blocking} combined={combined}
        dps={formatDps(column.raw?.get(resistance))}
        background={colorScale ? getSurtrUnequippedColorScaleBackground(column.comparison?.get(resistance), metric, colorScaleMaximum) : undefined}
        comparison={formatSurtrUnequippedComparisonValue(column.comparison?.get(resistance), metric, precision)} />)}
    </tr>)}</tbody>
    {footer && <tfoot><tr><td colSpan={columnCount}>{footer}</td></tr></tfoot>}
  </table></div>
}

function ModuleHeader({ item, colSpan }: { item: SurtrDpsOutputSeries; colSpan: number }) {
  return <th scope={colSpan > 1 ? 'colgroup' : 'col'} colSpan={colSpan}>
    <span className="surtr-s3-column-label"><i style={{ backgroundColor: item.color }} />{item.label}</span>
  </th>
}

function BlockingHeader({ blocking, colSpan }: { blocking: boolean; colSpan: number }) {
  return <th scope={colSpan > 1 ? 'colgroup' : 'col'} colSpan={colSpan} className="surtr-s3-blocking-column">
    {blocking ? <><span>対象を自身で</span><wbr /><span>ブロック</span></> : '未ブロック'}
  </th>
}

function ResistanceRank({ rank }: { rank: ReturnType<typeof getSurtrDpsResistanceRating> }) {
  return <span className="surtr-s3-resistance-rank" title={rank?.label}
    aria-label={rank ? `術耐性ランク ${rank.rating}、${rank.label}` : '術耐性ランク不明'}>{rank?.rating ?? '—'}</span>
}

function FragmentColumns({ metricLabel }: { metricLabel: string }) {
  return <><th scope="col">DPS</th><th scope="col">{metricLabel}</th></>
}

function ComparisonCells({ seriesId, blocking, combined, dps, comparison, background }: { seriesId: string; blocking?: boolean; combined: boolean; dps: string; comparison: string; background?: string }) {
  return <>{combined && <td data-series-id={seriesId} data-blocking={blocking} data-metric="total">{dps}</td>}<td data-series-id={seriesId} data-blocking={blocking}
    className={background ? 'surtr-s3-color-scale-cell' : undefined}
    style={background ? { '--surtr-comparison-cell-background': background } as CSSProperties : undefined}>{comparison}</td></>
}
