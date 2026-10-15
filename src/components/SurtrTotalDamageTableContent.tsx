import { useId, useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import { getEnemyHeatmapOpacity, type EnemyHeatmapColorScale } from '../lib/enemyHeatmapColor'
import { getModuleColorKey, getModuleComparisonColors } from '../lib/moduleColors'
import {
  formatSurtrTotalDamageWinnerLabel,
  formatSurtrTotalDamageWinnerShortLabel,
  getSurtrTotalDamageTablePoint,
  getSurtrTotalDamageTableWinnerGap,
  getSurtrTotalDamageTableWinners,
  SURTR_TOTAL_DAMAGE_WINNER_GAP_MAX_PERCENT,
  type SurtrTotalDamageTable,
  type SurtrTotalDamageTableDisplayMode,
  type SurtrTotalDamageTableLayout,
  type SurtrTotalDamageWinnerColor,
} from '../lib/surtrTotalDamageTable'
import { applySurtrTotalDamageWinnerLayout, clearSurtrTotalDamageWinnerLayout } from './surtrTotalDamageWinnerLayout'
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
  displayMode?: SurtrTotalDamageTableDisplayMode
  winnerColor?: SurtrTotalDamageWinnerColor
  winnerGapShading?: boolean
  precision?: number
  colorScale?: 'none' | EnemyHeatmapColorScale
  selectedCell?: SurtrTotalDamageTableCellSelection | null
  onSelectCell?: (cell: SurtrTotalDamageTableCellSelection) => void
  title?: string
  footer?: ReactNode
  forImage?: boolean
}

const timeFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 6 })
const gapFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 6 })
const layoutLabels: Record<SurtrTotalDamageTableLayout, string> = {
  time: '発動時間別', module: 'MOD別', resistance: '術耐性別',
}

/** The same captured matrix feeds every layout and the table image. */
export function SurtrTotalDamageTableContent({
  matrix, layout = 'time', precision = 1, colorScale = 'none', selectedCell,
  displayMode = 'total', winnerColor = 'module', winnerGapShading = false, onSelectCell, title, footer, forImage = false,
}: SurtrTotalDamageTableContentProps) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const tableRef = useRef<HTMLTableElement>(null)
  const digits = Number.isInteger(precision) && precision >= 0 && precision <= 3 ? precision : 0
  const format = useMemo(() => new Intl.NumberFormat('ja-JP', {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  }), [digits])
  const { times, resistances, series } = matrix
  const isWinner = displayMode === 'winner'
  const gapShadingActive = isWinner && winnerColor === 'module' && winnerGapShading && series.length >= 2
  const gapColors = useMemo(() => gapShadingActive
    ? getModuleComparisonColors(series.map(item => ({ moduleType: item.type }))) : [], [series, gapShadingActive])
  const gapScaleColors = useMemo(() => {
    const colors = new Map<string, { color: string; label: string }>()
    if (gapShadingActive) series.forEach((item, index) => {
      const key = getModuleColorKey(item.type)
      const label = key === 'none' ? '未装備' : key === 'unknown' ? '不明' : `MOD ${key}`
      colors.set(gapColors[index], { color: gapColors[index], label })
    })
    return [...colors.values()]
  }, [series, gapColors, gapShadingActive])
  const effectiveLayout = isWinner && layout === 'module' ? 'resistance' : layout
  const isResistanceLayout = effectiveLayout === 'resistance'
  const columnCount = isWinner ? 1 + (isResistanceLayout ? times.length : resistances.length)
    : isResistanceLayout ? 1 + times.length * series.length : 2 + resistances.length
  const minimumWidth = isWinner
    ? (isResistanceLayout ? 82 + times.length * 96 : 132 + resistances.length * 96)
    : isResistanceLayout
    ? 80 + times.length * series.length * 112
    : 300 + resistances.length * 112
  const interactive = Boolean(onSelectCell && !forImage)
  const style = { '--surtr-total-damage-table-min-width': `${minimumWidth}px` } as CSSProperties
  const timeHeader = (timeIndex: number) => `${id}-time-${timeIndex}`
  const resistanceHeader = (resistanceIndex: number) => `${id}-resistance-${resistanceIndex}`
  const moduleHeader = (seriesIndex: number, timeIndex?: number) => `${id}-module-${seriesIndex}${timeIndex === undefined ? '' : `-${timeIndex}`}`
  const rowHeader = (groupIndex: number, rowIndex: number) => `${id}-row-${groupIndex}-${rowIndex}`

  useLayoutEffect(() => {
    const table = tableRef.current
    if (!table || !isWinner || forImage) return
    let cancelled = false
    const measure = () => { if (!cancelled) applySurtrTotalDamageWinnerLayout(table) }
    measure()
    void document.fonts.ready.then(measure)
    document.fonts.addEventListener('loadingdone', measure)
    const observer = new ResizeObserver(measure)
    if (table.parentElement) observer.observe(table.parentElement)
    return () => {
      cancelled = true
      observer.disconnect()
      document.fonts.removeEventListener('loadingdone', measure)
      clearSurtrTotalDamageWinnerLayout(table)
    }
  }, [matrix, isWinner, effectiveLayout, forImage])

  const winnerCell = (timeIndex: number, resistanceIndex: number) => {
    const winners = getSurtrTotalDamageTableWinners(matrix, timeIndex, resistanceIndex)
    const text = formatSurtrTotalDamageWinnerLabel(winners.map(item => item.series))
    const shortText = formatSurtrTotalDamageWinnerShortLabel(winners.map(item => item.series))
    const time = times[timeIndex]
    const resistance = resistances[resistanceIndex]
    const selected = !forImage && selectedCell?.time === time && selectedCell.resistance === resistance
    const gap = gapShadingActive ? getSurtrTotalDamageTableWinnerGap(matrix, timeIndex, resistanceIndex) : null
    const gapPercent = typeof gap?.increasePercent === 'number' && Number.isFinite(gap.increasePercent) ? gap.increasePercent : undefined
    const hasColor = winnerColor === 'module' && winners.length > 0
      && (!gapShadingActive || winners.length > 1 || gapPercent !== undefined)
    const cellStyle = hasColor && winners.length === 1 ? {
      '--surtr-total-damage-winner-color': gapShadingActive ? gapColors[winners[0].seriesIndex] : winners[0].series.color,
      ...(gapShadingActive ? {
        '--surtr-total-damage-winner-intensity': `${getEnemyHeatmapOpacity(gapPercent ?? 0, SURTR_TOTAL_DAMAGE_WINNER_GAP_MAX_PERCENT) * 100}%`,
      } : {}),
    } as CSSProperties : undefined
    const gapDescription = !gapShadingActive ? '' : gapPercent !== undefined
      ? `、次点への増加率${gapFormat.format(gapPercent)}%`
      : gap?.runnerUpTotalDamage === 0 ? '、次点の総ダメージが0のため増加率を算出できません' : '、次点への増加率を算出できません'
    const label = <span className="surtr-total-damage-winner-label">{shortText}</span>
    return <td key={`${timeIndex}:${resistanceIndex}`} headers={`${timeHeader(timeIndex)} ${resistanceHeader(resistanceIndex)}`}
      data-time={time} data-resistance={resistance} data-series-id={winners.map(item => item.series.id).join('=')}
      data-gap-percent={gapPercent}
      className={`surtr-total-damage-value-cell surtr-total-damage-winner-cell${hasColor ? ' has-winner-color' : ''}${winners.length > 1 ? ' is-tied' : ''}${selected ? ' is-selected' : ''}${interactive && winners.length ? ' is-interactive' : ''}`}
      style={cellStyle}>
      {interactive && winners.length ? <button type="button" className="surtr-total-damage-value-button"
        onClick={() => onSelectCell?.({ time, resistance, seriesId: winners[0].series.id })}
        aria-label={`素質２発動まで${timeFormat.format(time)}秒、術耐性${resistance}、最大のMOD ${text}${gapDescription}の命中内訳を表示`}
        data-time={time} data-resistance={resistance} data-series-id={winners.map(item => item.series.id).join('=')}>{label}</button> : label}
    </td>
  }

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
    data-layout={effectiveLayout} data-display-mode={displayMode} data-winner-color={winnerColor}
    data-winner-gap-shading={gapShadingActive}
    data-color-scale={isWinner ? 'none' : colorScale} style={style}>
    <table ref={tableRef} className={`surtr-s3-table surtr-total-damage-table surtr-total-damage-layout-${effectiveLayout}${isWinner ? ' surtr-total-damage-winner-table' : ''}`}
      aria-label={`術耐性別のスキル総ダメージ${isWinner ? 'が最大のMOD' : ''}・${layoutLabels[effectiveLayout]}`}>
      {isWinner ? <colgroup>
        <col className={isResistanceLayout ? 'surtr-total-damage-resistance-column' : 'surtr-total-damage-time-column'} />
        {(isResistanceLayout ? times : resistances).map(value => <col key={value} />)}
      </colgroup> : isResistanceLayout ? <>
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
        {isWinner ? <tr>
          <th scope="col">{isResistanceLayout ? '術耐性' : <>素質２発動まで<span className="surtr-total-damage-time-unit">（秒）</span></>}</th>
          {isResistanceLayout ? times.map((time, timeIndex) => <th key={time} id={timeHeader(timeIndex)} scope="col">
            <span className="surtr-total-damage-time-heading">素質２発動まで {timeFormat.format(time)}秒</span>
          </th>) : resistances.map((resistance, resistanceIndex) => <th key={resistance} id={resistanceHeader(resistanceIndex)} scope="col">術耐性 {resistance}</th>)}
        </tr> : isResistanceLayout ? <>
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
      <tbody>{isWinner ? isResistanceLayout ? resistances.map((resistance, resistanceIndex) => <tr key={resistance}>
        <th id={resistanceHeader(resistanceIndex)} scope="row">{resistance}</th>
        {times.map((_, timeIndex) => winnerCell(timeIndex, resistanceIndex))}
      </tr>) : times.map((time, timeIndex) => <tr key={time}>
        <th id={timeHeader(timeIndex)} scope="row">{timeFormat.format(time)}</th>
        {resistances.map((_, resistanceIndex) => winnerCell(timeIndex, resistanceIndex))}
      </tr>) : isResistanceLayout ? resistances.map((resistance, resistanceIndex) => <tr key={resistance}>
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
    {gapShadingActive && <div className="surtr-total-damage-winner-gap-scale" aria-label="次点への増加率のカラースケール">
      <span>次点への増加率 0% ～ {SURTR_TOTAL_DAMAGE_WINNER_GAP_MAX_PERCENT}%以上</span>
      <span className="surtr-total-damage-winner-gap-scale-colors">{gapScaleColors.map(item => <span key={item.color}>
        <span>{item.label}</span><i aria-hidden="true" style={{ '--surtr-total-damage-winner-scale-color': item.color } as CSSProperties} />
      </span>)}</span>
    </div>}
  </div>
}
