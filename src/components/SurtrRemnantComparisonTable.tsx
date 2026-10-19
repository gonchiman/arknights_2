import { Fragment, useMemo, type CSSProperties, type ReactNode } from 'react'
import { getSurtrDpsResistanceRating } from '../lib/surtrDpsResistance'
import {
  buildSurtrRemnantComparisonColumns, buildSurtrRemnantWinnerData,
  getSurtrRemnantComparisonColorScaleMaximum, getSurtrRemnantStateLabel,
  getSurtrRemnantWinnerColumnCondition, type SurtrRemnantComparisonColumn,
} from '../lib/surtrRemnantComparison'
import {
  formatSurtrUnequippedComparisonValue, getSurtrComparisonBaseLabel,
  type SurtrUnequippedMetric,
} from '../lib/surtrUnequippedComparison'
import { getSurtrUnequippedColorScaleBackground } from '../lib/surtrUnequippedColorScale'
import type { SurtrUnequippedComparisonTableData } from './SurtrUnequippedComparisonTableContent'
import { ModuleWinnerTable } from './ModuleWinnerTable'
import './SurtrRemnantComparisonTable.css'

export interface SurtrRemnantComparisonTableProps extends SurtrUnequippedComparisonTableData {
  selectedResistance?: number | null
  onOpenDetail?: (resistance: number, seriesId: string | undefined, metric: SurtrUnequippedMetric | 'total',
    blocking?: boolean, remnantActive?: boolean) => void
  title?: string
  footer?: ReactNode
  transpose?: boolean
  forImage?: boolean
}

type HeaderPart = { key: string; label: ReactNode }
type ResistanceRow = { resistance: number; rank: ReturnType<typeof getSurtrDpsResistanceRating>; span: number }

/** The same state/condition columns power the live table, transposed table and PNG. */
export function SurtrRemnantComparisonTable(props: SurtrRemnantComparisonTableProps) {
  const { resistances, precision, metric, layout, rankMode = 'none', columnOrder = 'module',
    comparisonBase = 'unequipped', quantity = 'dps', colorScale = false, colorScaleMode = 'LINEAR',
    selectedResistance, onOpenDetail, title, footer, transpose = false, forImage = false } = props
  const columns = useMemo(() => buildSurtrRemnantComparisonColumns(props), [props])
  const maximum = useMemo(() => colorScale ? getSurtrRemnantComparisonColorScaleMaximum(props) : 0, [props, colorScale])
  const winnerData = useMemo(() => props.displayMode === 'winner' ? buildSurtrRemnantWinnerData(props) : null, [props])
  const resistanceRows = useMemo(() => makeResistanceRows(resistances, rankMode === 'merged'), [resistances, rankMode])
  const formatter = useMemo(() => new Intl.NumberFormat('ja-JP', {
    minimumFractionDigits: precision, maximumFractionDigits: precision,
  }), [precision])
  const formatRaw = (value: number | null | undefined) => {
    if (value == null || !Number.isFinite(value)) return '—'
    const rounded = Number(value.toFixed(precision))
    return formatter.format(rounded === 0 ? 0 : rounded)
  }
  const combined = layout === 'combined'
  const quantityLabel = quantity === 'expected-damage' ? '総ダメージ期待値' : 'DPS'
  const metricLabel = metric === 'difference' ? quantity === 'expected-damage' ? 'ダメージ差' : 'DPS差'
    : metric === 'ratio' ? '比率' : '増加率（%）'
  const compareBlocking = columns.some(column => column.blocking !== undefined)
  const blockingFirst = compareBlocking && columnOrder === 'blocking'
  const interactive = Boolean(onOpenDetail && !forImage)
  const columnWidth = (column: SurtrRemnantComparisonColumn) => combined && !column.isBaseline ? 2 : 1
  const headerPath = (column: SurtrRemnantComparisonColumn): HeaderPart[] => {
    const module = { key: column.item.id, label: <ModuleLabel column={column} comparisonBase={comparisonBase} /> }
    const blocking = { key: String(column.blocking), label: blockingLabel(column.blocking) }
    const state = { key: String(column.remnantActive), label: getSurtrRemnantStateLabel(column.remnantActive) }
    return [...(compareBlocking ? blockingFirst ? [blocking, module] : [module, blocking] : [module]), state]
  }
  const paths = columns.map(headerPath)
  const select = (resistance: number, column: SurtrRemnantComparisonColumn, cellMetric: SurtrUnequippedMetric | 'total') =>
    onOpenDetail?.(resistance, column.seriesId, cellMetric, column.blocking, column.remnantActive ?? false)
  const renderValue = (column: SurtrRemnantComparisonColumn, resistance: number,
    cellMetric: SurtrUnequippedMetric | 'total', colSpan = 1) => {
    const total = cellMetric === 'total'
    const value = total ? column.raw?.get(resistance) : column.comparison?.get(resistance)
    const text = total ? formatRaw(value) : formatSurtrUnequippedComparisonValue(value, metric, precision)
    const background = colorScale && !total
      ? getSurtrUnequippedColorScaleBackground(value, metric, maximum, colorScaleMode) : undefined
    const description = `術耐性 ${resistance}、${column.item.label}、${column.blocking === undefined ? '' : `${blockingLabel(column.blocking)}、`}${getSurtrRemnantStateLabel(column.remnantActive)}、${total ? quantityLabel : metricLabel} ${text}`
    return <td key={cellMetric} colSpan={colSpan} data-series-id={column.seriesId}
      data-blocking={column.blocking} data-remnant-active={column.remnantActive}
      data-remnant-common={column.common || undefined} data-metric={cellMetric} data-table-image-number
      className={`${background ? 'surtr-s3-color-scale-cell ' : ''}${interactive ? 'surtr-remnant-interactive-cell' : ''}`.trim() || undefined}
      style={background ? { '--surtr-comparison-cell-background': background } as CSSProperties : undefined}>
      {interactive ? <button type="button" className="surtr-remnant-value-button" aria-label={`${description}の計算フローを開く`}
        aria-haspopup="dialog" onClick={() => select(resistance, column, cellMetric)}>{text}</button> : text}
    </td>
  }
  const renderCells = (column: SurtrRemnantComparisonColumn, resistance: number) => <Fragment key={column.id}>
    {column.isBaseline ? renderValue(column, resistance, 'total', transpose && combined ? 2 : 1)
      : <>{combined && renderValue(column, resistance, 'total')}{renderValue(column, resistance, metric)}</>}
  </Fragment>

  if (winnerData) return <div className="surtr-remnant-winner-table">
    {title && <div className="surtr-remnant-table-heading">{title}</div>}
    <ModuleWinnerTable data={winnerData} transpose={transpose} color={props.winnerColor} gapShading={props.winnerGapShading}
      rankMode={rankMode} forImage={forImage} ariaLabel="余燼なし・余燼中のスルト S3 DPSが最大のMOD"
      onSelectCell={interactive ? selection => {
        const condition = getSurtrRemnantWinnerColumnCondition(selection.columnId)
        onOpenDetail?.(Number(selection.rowId), selection.winnerIds[0], 'total', condition?.blocking, condition?.remnantActive ?? false)
      } : undefined} />
    {footer && <div className="surtr-remnant-table-footer">{footer}</div>}
  </div>

  if (transpose) {
    const leadingCount = compareBlocking ? 3 : 2
    const physicalCount = leadingCount + resistances.length * (combined ? 2 : 1)
    const pathDepth = compareBlocking ? 3 : 2
    const rowSpans = paths.map((_, rowIndex) => Array.from({ length: pathDepth }, (_, depth) => {
      const prefix = (path: HeaderPart[]) => JSON.stringify(path.slice(0, depth + 1).map(part => part.key))
      const key = prefix(paths[rowIndex])
      if (rowIndex > 0 && prefix(paths[rowIndex - 1]) === key) return 0
      let count = 1
      while (rowIndex + count < paths.length && prefix(paths[rowIndex + count]) === key) count += 1
      return count
    }))
    const rankGroups = groupResistanceRanks(resistanceRows)
    return <div className="surtr-s3-table-wrap surtr-remnant-table-wrap"><table
      className={`surtr-s3-table surtr-s3-unequipped-table surtr-remnant-table surtr-remnant-transposed-table${forImage ? ' is-image' : ''}`}
      style={{ '--surtr-remnant-min-width': `${leadingCount * 160 + resistances.length * (combined ? 192 : 128)}px` } as CSSProperties}
      aria-label={`術耐性を列にした余燼なし・余燼中の${getSurtrComparisonBaseLabel(comparisonBase)}との比較表`}>
      <colgroup>{Array.from({ length: leadingCount }, (_, index) => <col key={index} className="surtr-remnant-transposed-label-column" />)}
        {resistances.flatMap(resistance => Array.from({ length: combined ? 2 : 1 }, (_, index) => <col key={`${resistance}:${index}`} />))}</colgroup>
      <thead>{title && <tr className="surtr-s3-table-title-row"><th className="surtr-s3-table-title" colSpan={physicalCount}>{title}</th></tr>}
        {rankMode === 'merged' && <tr><th colSpan={leadingCount}>術耐性ランク</th>{rankGroups.map(group =>
          <th key={group.resistance} scope="colgroup" colSpan={group.span * (combined ? 2 : 1)}><ResistanceRank rank={group.rank} /></th>)}</tr>}
        <tr className="surtr-s3-table-column-headers"><th scope="col" rowSpan={combined ? 2 : 1}>{blockingFirst ? 'ブロック条件' : 'MOD・潜在'}</th>
          {compareBlocking && <th scope="col" rowSpan={combined ? 2 : 1}>{blockingFirst ? 'MOD・潜在' : 'ブロック条件'}</th>}
          <th scope="col" rowSpan={combined ? 2 : 1}>余燼</th>{resistanceRows.map(row => <th key={row.resistance}
            scope={combined ? 'colgroup' : 'col'} colSpan={combined ? 2 : 1}>術耐性 {row.resistance}
            {rankMode === 'inline' && <ResistanceRank rank={row.rank} />}</th>)}</tr>
        {combined && <tr>{resistances.map(resistance => <Fragment key={resistance}><th scope="col">{quantityLabel}</th><th scope="col">{metricLabel}</th></Fragment>)}</tr>}
      </thead><tbody>{columns.map((column, rowIndex) => <tr key={column.id}>
        {paths[rowIndex].map((part, depth) => rowSpans[rowIndex][depth] > 0 && <th key={depth} scope="row" rowSpan={rowSpans[rowIndex][depth]}>{part.label}</th>)}
        {resistances.map(resistance => <Fragment key={resistance}>{renderCells(column, resistance)}</Fragment>)}
      </tr>)}</tbody>{footer && <tfoot><tr><td colSpan={physicalCount}>{footer}</td></tr></tfoot>}
    </table></div>
  }

  const leadingCount = 1 + Number(rankMode === 'merged')
  const physicalCount = leadingCount + columns.reduce((total, column) => total + columnWidth(column), 0)
  const pathDepth = compareBlocking ? 3 : 2
  const headerRows = pathDepth + Number(combined)
  const minimumWidth = (rankMode === 'merged' ? 64 : 0) + (rankMode === 'inline' ? 112 : 80)
    + columns.reduce((total, column) => total + columnWidth(column) * (combined ? 96 : 128), 0)
  return <div className="surtr-s3-table-wrap surtr-remnant-table-wrap"><table
    className={`surtr-s3-table surtr-s3-unequipped-table surtr-remnant-table${forImage ? ' is-image' : ''}`}
    style={{ '--surtr-remnant-min-width': `${minimumWidth}px` } as CSSProperties}
    aria-label={`術耐性ごとの余燼なし・余燼中の${getSurtrComparisonBaseLabel(comparisonBase)}との比較表`}>
    <colgroup>{rankMode === 'merged' && <col className="surtr-s3-unequipped-rank-column" />}
      <col className={rankMode === 'inline' ? 'surtr-remnant-inline-resistance-column' : 'surtr-remnant-resistance-column'} />
      {columns.flatMap(column => Array.from({ length: columnWidth(column) }, (_, index) => <col key={`${column.id}:${index}`} />))}</colgroup>
    <thead>{title && <tr className="surtr-s3-table-title-row"><th className="surtr-s3-table-title" colSpan={physicalCount}>{title}</th></tr>}
      {Array.from({ length: pathDepth }, (_, depth) => <tr key={depth} className={depth === 0 ? 'surtr-s3-table-column-headers' : undefined}>
        {depth === 0 && <>{rankMode === 'merged' && <th className="surtr-s3-rank-cell" scope="col" rowSpan={headerRows}>ランク</th>}
          <th scope="col" rowSpan={headerRows}>術耐性</th></>}
        {groupHeaders(paths, columns, depth, columnWidth).map(group => <th key={group.key} scope={group.span > 1 ? 'colgroup' : 'col'} colSpan={group.span}>{group.label}</th>)}
      </tr>)}
      {combined && <tr>{columns.map(column => column.isBaseline ? <th key={column.id} scope="col">{quantityLabel}・基準</th>
        : <Fragment key={column.id}><th scope="col">{quantityLabel}</th><th scope="col">{metricLabel}</th></Fragment>)}</tr>}
    </thead><tbody>{resistanceRows.map(({ resistance, rank, span }) => <tr key={resistance}
      className={interactive && selectedResistance === resistance ? 'is-selected' : undefined}>
      {rankMode === 'merged' && span > 0 && <th className="surtr-s3-rank-cell" scope="row" rowSpan={span}><ResistanceRank rank={rank} /></th>}
      <th scope="row">{rankMode === 'inline' ? <span className="surtr-s3-resistance-rank-value">{resistance}<ResistanceRank rank={rank} /></span> : resistance}</th>
      {columns.map(column => renderCells(column, resistance))}
    </tr>)}</tbody>{footer && <tfoot><tr><td colSpan={physicalCount}>{footer}</td></tr></tfoot>}
  </table></div>
}

function ModuleLabel({ column, comparisonBase }: { column: SurtrRemnantComparisonColumn; comparisonBase: SurtrUnequippedComparisonTableData['comparisonBase'] }) {
  return <><span className="surtr-s3-column-label"><i style={{ backgroundColor: column.item.color }} />{column.item.label}</span>
    {!column.isBaseline && comparisonBase !== 'unequipped' && <span className="surtr-s3-baseline-label">基準：{column.reference?.label ?? `${getSurtrComparisonBaseLabel(comparisonBase)}不明`}</span>}</>
}

function blockingLabel(blocking: boolean | undefined): string {
  return blocking === undefined ? '共通' : blocking ? '対象を自身でブロック' : '未ブロック'
}

function ResistanceRank({ rank }: { rank: ReturnType<typeof getSurtrDpsResistanceRating> }) {
  return <span className="surtr-s3-resistance-rank" title={rank?.label}
    aria-label={rank ? `術耐性ランク ${rank.rating}、${rank.label}` : '術耐性ランク不明'}>{rank?.rating ?? '—'}</span>
}

function makeResistanceRows(resistances: readonly number[], merged: boolean): ResistanceRow[] {
  const rows = resistances.map(resistance => ({ resistance, rank: getSurtrDpsResistanceRating(resistance), span: 1 }))
  if (!merged) return rows
  for (let index = 0; index < rows.length;) {
    let end = index + 1
    while (rows[index].rank && end < rows.length && rows[end].rank?.rating === rows[index].rank?.rating) end += 1
    rows[index].span = end - index
    for (let following = index + 1; following < end; following += 1) rows[following].span = 0
    index = end
  }
  return rows
}

function groupResistanceRanks(rows: readonly ResistanceRow[]) {
  return makeResistanceRows(rows.map(row => row.resistance), true).filter(row => row.span > 0)
}

function groupHeaders(paths: HeaderPart[][], columns: readonly SurtrRemnantComparisonColumn[], depth: number,
  columnWidth: (column: SurtrRemnantComparisonColumn) => number) {
  const groups: { key: string; label: ReactNode; span: number }[] = []
  paths.forEach((path, index) => {
    const key = JSON.stringify(path.slice(0, depth + 1).map(part => part.key))
    const previous = groups.at(-1)
    if (previous?.key === key) previous.span += columnWidth(columns[index])
    else groups.push({ key, label: path[depth].label, span: columnWidth(columns[index]) })
  })
  return groups
}
