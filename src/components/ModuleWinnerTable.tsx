import { useId, useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react'
import { getEnemyHeatmapOpacity } from '../lib/enemyHeatmapColor'
import { getModuleColorKey, getModuleComparisonColors } from '../lib/moduleColors'
import {
  formatModuleTableWinnerShortLabel, getModuleTableWinner, MODULE_TABLE_WINNER_GAP_MAX_PERCENT,
  type ModuleTableWinnerCandidate,
} from '../lib/moduleTableWinner'
import './ModuleWinnerTable.css'

export interface ModuleWinnerAxisItem {
  id: string
  label: string
  rank?: string
  rankTitle?: string
  groupId?: string
  groupLabel?: string
}

export interface ModuleWinnerTableData {
  rowAxis: { label: string; rankLabel?: string; items: ModuleWinnerAxisItem[] }
  columnAxis: { label: string; rankLabel?: string; items: ModuleWinnerAxisItem[] }
  cells: { rowId: string; columnId: string; candidates: ModuleTableWinnerCandidate[] }[]
}

export interface ModuleWinnerTableProps {
  data: ModuleWinnerTableData
  /** Skill candidates supply their own stable colors rather than a module identity. */
  candidateKind?: 'module' | 'skill'
  transpose?: boolean
  color?: 'module' | 'none'
  gapShading?: boolean
  rankMode?: 'none' | 'inline' | 'merged'
  onSelectCell?: (cell: { rowId: string; columnId: string; winnerIds: string[] }) => void
  ariaLabel?: string
  forImage?: boolean
}

const number = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 6 })
const cellKey = (rowId: string, columnId: string) => JSON.stringify([rowId, columnId])
const groupKey = (item: ModuleWinnerAxisItem) => item.groupId ?? `item:${item.id}`

/** Return only the first cell of each contiguous group, with its full span. */
function spans(items: readonly ModuleWinnerAxisItem[], key: (item: ModuleWinnerAxisItem) => string): number[] {
  return items.map((item, index) => {
    if (index > 0 && key(items[index - 1]) === key(item)) return 0
    let count = 1
    while (index + count < items.length && key(items[index + count]) === key(item)) count += 1
    return count
  })
}

/** A module dimension collapsed into a winner cell, shared by screen and PNG. */
export function ModuleWinnerTable({
  data, transpose = false, color = 'module', gapShading = false, rankMode = 'none', onSelectCell,
  ariaLabel, forImage = false, candidateKind = 'module',
}: ModuleWinnerTableProps) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const wrapperRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const rowAxis = transpose ? data.columnAxis : data.rowAxis
  const columnAxis = transpose ? data.rowAxis : data.columnAxis
  const rows = rowAxis.items
  const columns = columnAxis.items
  const rowGroups = rows.some(item => item.groupId !== undefined || item.groupLabel !== undefined)
  const columnGroups = columns.some(item => item.groupId !== undefined || item.groupLabel !== undefined)
  const rowRanks = rankMode === 'merged' && rows.some(item => item.rank)
  const columnRanks = rankMode === 'merged' && columns.some(item => item.rank)
  const rowGroupSpans = spans(rows, groupKey)
  const columnGroupSpans = spans(columns, groupKey)
  const rankKey = (item: ModuleWinnerAxisItem) => JSON.stringify([item.groupId, item.rank ?? `item:${item.id}`])
  const rowRankSpans = spans(rows, rankKey)
  const columnRankSpans = spans(columns, rankKey)
  const leadingColumns = 1 + Number(rowGroups) + Number(rowRanks)
  const headerRows = 1 + Number(columnGroups) + Number(columnRanks)
  const leadingWidth = 80 + Number(rowGroups) * 96 + Number(rowRanks) * 48
  const interactive = Boolean(onSelectCell && !forImage)
  const winnerKindLabel = candidateKind === 'skill' ? 'スキル' : 'MOD'

  const cells = useMemo(() => {
    const map = new Map<string, ModuleTableWinnerCandidate[] | null>()
    data.cells.forEach(cell => {
      const key = cellKey(cell.rowId, cell.columnId)
      map.set(key, map.has(key) ? null : cell.candidates)
    })
    return map
  }, [data])
  const shadeActive = color === 'module' && gapShading && data.cells.some(cell => cell.candidates.length >= 2)
  const scaleColors = useMemo(() => {
    const candidates = data.cells.flatMap(cell => cell.candidates)
    if (candidateKind === 'skill') {
      const result = new Map<string, { color: string; label: string }>()
      candidates.forEach(candidate => {
        if (candidate.color) result.set(candidate.id, { color: candidate.color,
          label: formatModuleTableWinnerShortLabel(candidate) })
      })
      return [...result.values()]
    }
    const values = getModuleComparisonColors(candidates.map(candidate => ({ moduleType: candidate.moduleType })))
    const result = new Map<string, { color: string; label: string }>()
    candidates.forEach((candidate, index) => {
      const key = getModuleColorKey(candidate.moduleType)
      result.set(values[index], { color: values[index], label: key === 'none' ? '未装備' : key === 'unknown' ? '不明'
        : `MOD ${{ X: 'X', Y: 'Y', D: 'Δ', A: 'α', B: 'β' }[key]}` })
    })
    return [...result.values()]
  }, [data, candidateKind])

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current
    const table = tableRef.current
    if (!wrapper || !table) return
    let cancelled = false
    const measure = () => {
      if (cancelled) return
      const labels = [...table.querySelectorAll<HTMLElement>('.module-winner-label')]
      const probe = document.createElement('span')
      Object.assign(probe.style, { position: 'fixed', left: '0', top: '0', visibility: 'hidden', whiteSpace: 'pre',
        width: 'max-content', maxWidth: 'none', padding: '0', border: '0', margin: '0' })
      probe.setAttribute('aria-hidden', 'true')
      if (labels[0]) {
        const style = getComputedStyle(labels[0])
        Object.assign(probe.style, { font: style.font, fontFamily: style.fontFamily, fontSize: forImage ? '14px' : style.fontSize,
          fontWeight: style.fontWeight, letterSpacing: style.letterSpacing, fontVariantNumeric: style.fontVariantNumeric })
      }
      document.body.appendChild(probe)
      let width = 96
      try {
        for (const text of new Set(labels.map(label => label.textContent ?? ''))) {
          probe.textContent = text
          width = Math.max(width, Math.ceil(probe.getBoundingClientRect().width) + 24)
        }
      } finally { probe.remove() }
      const value = `${width}px`
      if (wrapper.style.getPropertyValue('--module-winner-column-min-width') !== value)
        wrapper.style.setProperty('--module-winner-column-min-width', value)
    }
    measure()
    void document.fonts.ready.then(measure)
    document.fonts.addEventListener('loadingdone', measure)
    const observer = new ResizeObserver(measure)
    observer.observe(wrapper)
    return () => { cancelled = true; observer.disconnect(); document.fonts.removeEventListener('loadingdone', measure) }
  }, [data, transpose, rankMode, forImage])

  const axisLabel = (item: ModuleWinnerAxisItem) => <span className="module-winner-axis-label">
    <span>{item.label}</span>{rankMode === 'inline' && item.rank && <span className="module-winner-inline-rank" title={item.rankTitle}>{item.rank}</span>}
  </span>
  const rowHeaderId = (index: number) => `${id}-row-${index}`
  const columnHeaderId = (index: number) => `${id}-column-${index}`
  const renderCell = (row: ModuleWinnerAxisItem, column: ModuleWinnerAxisItem, rowIndex: number, columnIndex: number) => {
    const rowId = transpose ? column.id : row.id
    const columnId = transpose ? row.id : column.id
    const candidates = cells.get(cellKey(rowId, columnId))
    const result = candidates ? getModuleTableWinner(candidates) : null
    const winners = result?.winners ?? []
    const label = winners.length ? winners.map(formatModuleTableWinnerShortLabel).join('＝') : '—'
    const fullLabel = winners.length ? winners.map(winner => winner.label).join('＝') : '比較できません'
    const gap = result?.increasePercent
    const gapAvailable = typeof gap === 'number' && Number.isFinite(gap)
    const cellShade = shadeActive && (candidates?.length ?? 0) >= 2
    const colors = candidates ? candidateKind === 'skill' ? candidates.map(candidate => candidate.color)
      : getModuleComparisonColors(candidates.map(candidate => ({ moduleType: candidate.moduleType,
        moduleLevel: candidate.moduleLevel })), cellShade ? undefined : { shadeBy: 'moduleLevel' }) : []
    const winnerIndex = candidates?.findIndex(candidate => candidate.id === winners[0]?.id) ?? -1
    const winnerColor = cellShade ? colors[winnerIndex] : winners[0]?.color ?? colors[winnerIndex]
    const hasColor = color === 'module' && winners.length === 1 && Boolean(winnerColor) && (!cellShade || gapAvailable)
    const intensity = cellShade ? getEnemyHeatmapOpacity(gap ?? 0, MODULE_TABLE_WINNER_GAP_MAX_PERCENT) * 100 : 18
    const style = hasColor ? { '--module-winner-color': winnerColor,
      '--module-winner-intensity': `${intensity}%` } as CSSProperties : undefined
    const gapDescription = !cellShade ? '' : gapAvailable ? `、次点への増加率${number.format(gap)}%`
      : result?.runnerUpValue === 0 ? '、次点が0のため増加率を算出できません' : '、次点への増加率を算出できません'
    const values = candidates?.map(candidate => `${candidate.label}：${candidate.value === null || !Number.isFinite(candidate.value)
      ? '—' : number.format(candidate.value)}`).join('、') ?? ''
    const description = `${rowAxis.label} ${row.groupLabel ? `${row.groupLabel} ` : ''}${row.label}、${columnAxis.label} ${column.groupLabel ? `${column.groupLabel} ` : ''}${column.label}、最大の${winnerKindLabel} ${fullLabel}${gapDescription}`
    return <td key={column.id} headers={`${rowHeaderId(rowIndex)} ${columnHeaderId(columnIndex)}`}
      data-row-id={rowId} data-column-id={columnId} data-winner-ids={winners.map(winner => winner.id).join('=')}
      data-gap-percent={cellShade && gapAvailable ? gap : undefined} data-table-image-number
      className={`module-winner-cell${hasColor ? ' has-module-color' : ''}${winners.length > 1 ? ' is-tied' : ''}${interactive && result ? ' is-interactive' : ''}`}
      style={style} title={`${description}${values ? `\n${values}` : ''}`}>
      {interactive && result ? <button type="button" aria-label={description} onClick={() => onSelectCell?.({
        rowId, columnId, winnerIds: winners.map(winner => winner.id),
      })}><span className="module-winner-label">{label}</span></button> : <span className="module-winner-label" aria-label={description}>{label}</span>}
    </td>
  }
  const corner = <th className="module-winner-corner" colSpan={leadingColumns} rowSpan={headerRows} scope="col">
    {rowAxis.label}<span className="module-winner-column-axis">{columnAxis.label}</span>
  </th>
  const style = { '--module-winner-leading-width': `${leadingWidth}px`, '--module-winner-data-columns': columns.length } as CSSProperties
  return <div ref={wrapperRef} className={`module-winner-table-wrap${forImage ? ' is-image' : ''}`}
    data-transposed={transpose} data-rank-mode={rankMode} data-winner-color={color} data-winner-gap-shading={shadeActive}
    data-winner-kind={candidateKind} style={style}>
    <table ref={tableRef} className="module-winner-table" aria-label={ariaLabel ?? `値が最大の${winnerKindLabel}`} data-table-image-equal-cells>
      <colgroup>{rowGroups && <col className="module-winner-group-column" />}{rowRanks && <col className="module-winner-rank-column" />}
        <col className="module-winner-axis-column" />{columns.map(column => <col key={column.id} />)}</colgroup>
      <thead>
        {columnGroups && <tr>{corner}{columns.map((column, index) => columnGroupSpans[index] > 0 && <th key={column.id}
          colSpan={columnGroupSpans[index]} scope="colgroup">{column.groupLabel ?? column.label}</th>)}</tr>}
        {columnRanks && <tr>{!columnGroups && corner}{columns.map((column, index) => columnRankSpans[index] > 0 && <th key={column.id}
          colSpan={columnRankSpans[index]} scope="colgroup" title={column.rankTitle} aria-label={column.rank ? `${columnAxis.rankLabel ?? 'ランク'} ${column.rank}` : undefined}>{column.rank ?? '—'}</th>)}</tr>}
        <tr>{!columnGroups && !columnRanks && corner}{columns.map((column, index) => <th key={column.id}
          id={columnHeaderId(index)} scope="col">{axisLabel(column)}</th>)}</tr>
      </thead>
      <tbody>{rows.map((row, rowIndex) => <tr key={row.id}>
        {rowGroups && rowGroupSpans[rowIndex] > 0 && <th rowSpan={rowGroupSpans[rowIndex]} scope="rowgroup">{row.groupLabel ?? row.label}</th>}
        {rowRanks && rowRankSpans[rowIndex] > 0 && <th rowSpan={rowRankSpans[rowIndex]} scope="rowgroup" title={row.rankTitle}
          aria-label={row.rank ? `${rowAxis.rankLabel ?? 'ランク'} ${row.rank}` : undefined}>{row.rank ?? '—'}</th>}
        <th id={rowHeaderId(rowIndex)} scope="row">{axisLabel(row)}</th>
        {columns.map((column, columnIndex) => renderCell(row, column, rowIndex, columnIndex))}
      </tr>)}</tbody>
    </table>
    {shadeActive && <div className="module-winner-gap-scale" aria-label="次点への増加率のカラースケール">
      <span>次点への増加率 0% ～ {MODULE_TABLE_WINNER_GAP_MAX_PERCENT}%以上</span>
      <span className="module-winner-gap-scale-colors">{scaleColors.map(item => <span key={item.color}>
        <span>{item.label}</span><i aria-hidden="true" style={{ '--module-winner-scale-color': item.color } as CSSProperties} />
      </span>)}</span>
    </div>}
  </div>
}
