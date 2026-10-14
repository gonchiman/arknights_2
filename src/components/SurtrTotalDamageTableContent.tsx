import { useId, useMemo, type CSSProperties, type ReactNode } from 'react'
import { getEnemyHeatmapOpacity, type EnemyHeatmapColorScale } from '../lib/enemyHeatmapColor'
import {
  getSurtrTotalDamageTablePoint,
  type SurtrTotalDamageTable,
  type SurtrTotalDamageTableLayout,
} from '../lib/surtrTotalDamageTable'
import './SurtrS3Page.css'
import './SurtrTotalDamageTableContent.css'

export interface SurtrTotalDamageTableCellSelection {
  time: number
  resistance: number
  seriesId: string
}

export interface SurtrTotalDamageTableContentProps {
  matrix: SurtrTotalDamageTable
  layout?: SurtrTotalDamageTableLayout
  precision?: number
  colorScale?: 'none' | EnemyHeatmapColorScale
  selectedCell?: SurtrTotalDamageTableCellSelection | null
  onSelectCell?: (cell: SurtrTotalDamageTableCellSelection) => void
  title?: string
  footer?: ReactNode
  forImage?: boolean
}

const timeFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 6 })
const layoutLabels: Record<SurtrTotalDamageTableLayout, string> = {
  time: '発動時間別', module: 'MOD別', resistance: '術耐性別',
}

/** The same captured matrix feeds every layout and the table image. */
export function SurtrTotalDamageTableContent({
  matrix, layout = 'time', precision = 1, colorScale = 'none', selectedCell,
  onSelectCell, title, footer, forImage = false,
}: SurtrTotalDamageTableContentProps) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const digits = Number.isInteger(precision) && precision >= 0 && precision <= 3 ? precision : 0
  const format = useMemo(() => new Intl.NumberFormat('ja-JP', {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  }), [digits])
  const { times, resistances, series } = matrix
  const isResistanceLayout = layout === 'resistance'
  const columnCount = isResistanceLayout ? 1 + times.length * series.length : 2 + resistances.length
  const minimumWidth = isResistanceLayout
    ? 80 + times.length * series.length * 112
    : 300 + resistances.length * 112
  const interactive = Boolean(onSelectCell && !forImage)
  const style = { '--surtr-total-damage-table-min-width': `${minimumWidth}px` } as CSSProperties
  const timeHeader = (timeIndex: number) => `${id}-time-${timeIndex}`
  const resistanceHeader = (resistanceIndex: number) => `${id}-resistance-${resistanceIndex}`
  const moduleHeader = (seriesIndex: number, timeIndex?: number) => `${id}-module-${seriesIndex}${timeIndex === undefined ? '' : `-${timeIndex}`}`
  const rowHeader = (groupIndex: number, rowIndex: number) => `${id}-row-${groupIndex}-${rowIndex}`

  const valueCell = (timeIndex: number, resistanceIndex: number, seriesIndex: number, headers: string) => {
    const point = getSurtrTotalDamageTablePoint(matrix, timeIndex, resistanceIndex, seriesIndex)
    const time = times[timeIndex]
    const resistance = resistances[resistanceIndex]
    const item = series[seriesIndex]
    const value = point?.totalDamage
    const rounded = value == null || !Number.isFinite(value) ? null : Number(value.toFixed(digits))
    const text = rounded === null ? '—' : format.format(rounded === 0 ? 0 : rounded)
    const selection = { time, resistance, seriesId: item.id }
    const selected = !forImage && selectedCell?.time === time
      && selectedCell.resistance === resistance && selectedCell.seriesId === item.id
    const opacity = colorScale === 'none' || value == null
      ? 0 : getEnemyHeatmapOpacity(value, matrix.maximumTotalDamage, colorScale)
    const cellStyle = opacity > 0 ? {
      '--surtr-total-damage-cell-background': `rgba(75, 122, 176, ${opacity})`,
    } as CSSProperties : undefined
    return <td key={`${timeIndex}:${resistanceIndex}:${seriesIndex}`} headers={headers}
      data-time={time} data-resistance={resistance} data-series-id={item.id}
      className={`surtr-total-damage-value-cell${opacity > 0 ? ' has-color-scale' : ''}${selected ? ' is-selected' : ''}${interactive ? ' is-interactive' : ''}`}
      style={cellStyle}>
      {interactive && point ? <button type="button" className="surtr-total-damage-value-button"
        onClick={() => onSelectCell?.(selection)}
        aria-label={`素質２発動まで${timeFormat.format(time)}秒、術耐性${resistance}、${item.label}、総ダメージ${text}の命中内訳を表示`}
        data-time={time} data-resistance={resistance} data-series-id={item.id}>{text}</button> : text}
    </td>
  }
  const moduleLabel = (seriesIndex: number) => <span className="surtr-s3-column-label">
    <i aria-hidden="true" style={{ backgroundColor: series[seriesIndex].color }} />{series[seriesIndex].label}
  </span>

  return <div className={`surtr-s3-table-wrap surtr-total-damage-table-content${forImage ? ' is-image' : ''}`}
    data-layout={layout} data-color-scale={colorScale} style={style}>
    <table className={`surtr-s3-table surtr-total-damage-table surtr-total-damage-layout-${layout}`}
      aria-label={`術耐性別のスキル総ダメージ・${layoutLabels[layout]}`}>
      {isResistanceLayout ? <>
        <colgroup><col className="surtr-total-damage-resistance-column" /></colgroup>
        {times.map((time, timeIndex) => <colgroup key={`${time}:${timeIndex}`}>
          {series.map(item => <col key={item.id} />)}
        </colgroup>)}
      </> : <colgroup>
        <col className={layout === 'time' ? 'surtr-total-damage-time-column' : 'surtr-total-damage-module-column'} />
        <col className={layout === 'time' ? 'surtr-total-damage-module-column' : 'surtr-total-damage-time-column'} />
        {resistances.map(resistance => <col key={resistance} />)}
      </colgroup>}
      <thead>
        {title && <tr className="surtr-s3-table-title-row"><th className="surtr-total-damage-table-title" colSpan={columnCount}>{title}</th></tr>}
        {isResistanceLayout ? <>
          <tr><th scope="col" rowSpan={2}>術耐性</th>{times.map((time, timeIndex) => <th
            key={`${time}:${timeIndex}`} id={timeHeader(timeIndex)} scope="colgroup" colSpan={series.length}>
            <span className="surtr-total-damage-time-heading">素質２発動まで {timeFormat.format(time)}秒</span>
          </th>)}</tr>
          <tr>{times.flatMap((_, timeIndex) => series.map((item, seriesIndex) => <th
            key={`${timeIndex}:${item.id}`} id={moduleHeader(seriesIndex, timeIndex)} scope="col">{moduleLabel(seriesIndex)}</th>))}</tr>
        </> : <tr>
          <th scope="col">{layout === 'time' ? <>素質２発動まで<span className="surtr-total-damage-time-unit">（秒）</span></> : 'MOD'}</th>
          <th scope="col">{layout === 'time' ? 'MOD' : <>素質２発動まで<span className="surtr-total-damage-time-unit">（秒）</span></>}</th>
          {resistances.map((resistance, resistanceIndex) => <th key={resistance} id={resistanceHeader(resistanceIndex)} scope="col">術耐性 {resistance}</th>)}
        </tr>}
      </thead>
      <tbody>{isResistanceLayout ? resistances.map((resistance, resistanceIndex) => <tr key={resistance}>
        <th id={resistanceHeader(resistanceIndex)} scope="row">{resistance}</th>
        {times.flatMap((_, timeIndex) => series.map((__, seriesIndex) => valueCell(timeIndex, resistanceIndex, seriesIndex,
          `${resistanceHeader(resistanceIndex)} ${timeHeader(timeIndex)} ${moduleHeader(seriesIndex, timeIndex)}`)))}
      </tr>) : layout === 'time' ? times.flatMap((time, timeIndex) => series.map((item, seriesIndex) => <tr
        key={`${timeIndex}:${item.id}`} className={seriesIndex === 0 && timeIndex > 0 ? 'surtr-total-damage-group-start' : undefined}>
        {seriesIndex === 0 && <th id={timeHeader(timeIndex)} scope="rowgroup" rowSpan={series.length}>{timeFormat.format(time)}</th>}
        <th id={rowHeader(timeIndex, seriesIndex)} scope="row">{moduleLabel(seriesIndex)}</th>
        {resistances.map((_, resistanceIndex) => valueCell(timeIndex, resistanceIndex, seriesIndex,
          `${timeHeader(timeIndex)} ${rowHeader(timeIndex, seriesIndex)} ${resistanceHeader(resistanceIndex)}`))}
      </tr>)) : series.flatMap((item, seriesIndex) => times.map((time, timeIndex) => <tr
        key={`${item.id}:${timeIndex}`} className={timeIndex === 0 && seriesIndex > 0 ? 'surtr-total-damage-group-start' : undefined}>
        {timeIndex === 0 && <th id={moduleHeader(seriesIndex)} scope="rowgroup" rowSpan={times.length}>{moduleLabel(seriesIndex)}</th>}
        <th id={rowHeader(seriesIndex, timeIndex)} scope="row">{timeFormat.format(time)}</th>
        {resistances.map((_, resistanceIndex) => valueCell(timeIndex, resistanceIndex, seriesIndex,
          `${moduleHeader(seriesIndex)} ${rowHeader(seriesIndex, timeIndex)} ${resistanceHeader(resistanceIndex)}`))}
      </tr>))}</tbody>
      {footer && <tfoot><tr><td className="surtr-total-damage-table-footer" colSpan={columnCount}>{footer}</td></tr></tfoot>}
    </table>
  </div>
}
