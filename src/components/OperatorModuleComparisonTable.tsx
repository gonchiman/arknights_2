import { useId } from 'react'
import { buildOperatorModuleLevelRows, type OperatorModuleComparison as Comparison, type OperatorModuleComparisonCell,
  type OperatorModuleComparisonLayout } from '../lib/operatorModuleComparison'
import { buildOperatorModulePotentialTable, type OperatorModulePotentialComparison } from '../lib/operatorModulePotentialComparison'
import type { EffectChangeSegment, EffectChangeSource } from '../lib/operatorEffectHighlights'
import { splitPassiveDescriptionChanges } from '../lib/passiveDescriptionChanges'
import { HelpPopover } from './HelpPopover'

const SOURCE_LABELS: Record<EffectChangeSource, string> = {
  module: 'MOD', potential: '潜在', both: 'MOD＋潜在',
}

export function OperatorEffectLegend() {
  return <div className="operator-module-comparison-legend" aria-label="効果のハイライト">
    {Object.entries(SOURCE_LABELS).map(([source, label]) => <mark key={source} data-source={source}>{label}</mark>)}
  </div>
}

export function OperatorModuleComparisonTable({ comparison, interactive = true, showLegend = false, layout = 'columns',
  potentialComparison, potentialLayout = 'columns', merge = true }: {
  comparison: Comparison
  potentialComparison?: OperatorModulePotentialComparison
  potentialLayout?: OperatorModuleComparisonLayout
  merge?: boolean
  interactive?: boolean
  showLegend?: boolean
  layout?: OperatorModuleComparisonLayout
}) {
  const tableId = useId()
  if (potentialComparison) return <PotentialComparisonTable tableId={tableId} comparison={potentialComparison}
    layout={layout} potentialLayout={potentialLayout} merge={merge} interactive={interactive} showLegend={showLegend} />
  if (layout === 'rows') {
    const grouped = buildOperatorModuleLevelRows(comparison)
    const hasModules = grouped.columns.some(column => column.id !== 'none')
    return <table className="operator-module-comparison-table operator-module-comparison-table--rows"
      aria-label="モジュール比較（レベルを行に表示）"
      style={{ minWidth: interactive ? Math.max(400, 112 + grouped.columns.length * 156) : 80 + grouped.columns.length * 64 }}>
      <colgroup><col className="operator-module-comparison-item" /><col className="operator-module-comparison-level" />
        {grouped.columns.map(column => <col key={column.id} />)}
      </colgroup>
      <thead><tr>
        <th scope="col">項目</th><th scope="col" className="operator-module-comparison-level">Lv.</th>
        {grouped.columns.map((column, index) => <th scope="col" key={column.id} id={`${tableId}-column-${index}`}>
          {column.typeLabel && <span className="operator-module-comparison-type">{column.typeLabel}</span>}
          {column.name}
          {!column.available && <span className="operator-module-comparison-type">効果データなし</span>}
        </th>)}
      </tr></thead>
      {grouped.groups.map((group, groupIndex) => <tbody key={group.id}>
        {group.levels.map((level, levelIndex) => <tr key={level ?? 'common'}>
          {levelIndex === 0 && <th scope="rowgroup" rowSpan={group.levels.length}
            id={`${tableId}-item-${groupIndex}`} className="operator-module-comparison-item">
            {group.label}{group.name && <span className="operator-module-comparison-name">{group.name}</span>}
          </th>}
          <th scope="row" id={`${tableId}-level-${groupIndex}-${levelIndex}`} className="operator-module-comparison-level">
            {level ?? (hasModules ? '共通' : '—')}
          </th>
          {group.cells[levelIndex].map((entry, columnIndex) => entry && <td
            key={grouped.columns[columnIndex].id} rowSpan={entry.rowSpan}
            headers={[`${tableId}-item-${groupIndex}`, `${tableId}-column-${columnIndex}`,
              ...Array.from({ length: entry.rowSpan }, (_, offset) => `${tableId}-level-${groupIndex}-${levelIndex + offset}`)].join(' ')}
            className={group.kind === 'attribute' ? 'operator-module-comparison-value' : undefined}>
            <ComparisonCell cell={entry.cell} interactive={interactive} potentialRank={comparison.potentialRank}
              columnLabel={entry.sourceColumn.id === 'none' ? '未装備'
                : `${entry.sourceColumn.typeLabel ?? entry.sourceColumn.name}${level !== null && entry.rowSpan === 1 ? ` Lv.${entry.sourceColumn.level}` : ''}`} />
          </td>)}
        </tr>)}
      </tbody>)}
      {showLegend && <ComparisonFooter comparison={comparison} columnCount={grouped.columns.length + 2} />}
    </table>
  }
  return (
    <table className="operator-module-comparison-table"
      aria-label="モジュール比較"
      style={{ minWidth: interactive && comparison.columns.length > 3
        ? 72 + comparison.columns.length * 140 : 40 + comparison.columns.length * 64 }}
    >
      <thead><tr>
        <th scope="col">項目</th>
        {comparison.columns.map((column) => (
          <th scope="col" key={column.id}>
            {(column.typeLabel || column.level !== null) && <span className="operator-module-comparison-type">
              {column.typeLabel}{column.level !== null ? ` Lv.${column.level}` : ''}
            </span>}
            {column.name}
            {!column.available && <span className="operator-module-comparison-type">効果データなし</span>}
          </th>
        ))}
      </tr></thead>
      <tbody>{comparison.rows.map((row) => (
        <tr key={row.id}>
          <th scope="row">{row.label}{row.name && <span className="operator-module-comparison-name">{row.name}</span>}</th>
          {row.cells.map((cell, index) => (
            <td key={comparison.columns[index].id} className={row.kind === 'attribute' ? 'operator-module-comparison-value' : undefined}>
              <ComparisonCell cell={cell} interactive={interactive} potentialRank={comparison.potentialRank}
                columnLabel={comparison.columns[index].id === 'none' ? '未装備'
                  : `${comparison.columns[index].typeLabel ?? comparison.columns[index].name} Lv.${comparison.columns[index].level}`} />
            </td>
          ))}
        </tr>
      ))}</tbody>
      {showLegend && <ComparisonFooter comparison={comparison} columnCount={comparison.columns.length + 1} />}
    </table>
  )
}

function PotentialComparisonTable({ tableId, comparison, layout, potentialLayout, merge, interactive, showLegend }: {
  tableId: string
  comparison: OperatorModulePotentialComparison
  layout: OperatorModuleComparisonLayout
  potentialLayout: OperatorModuleComparisonLayout
  merge: boolean
  interactive: boolean
  showLegend: boolean
}) {
  const table = buildOperatorModulePotentialTable(comparison, { levelLayout: layout, potentialLayout, merge })
  const depth = Math.max(1, ...table.columns.map(column => column.headers.length))
  const headerIds = table.columns.map(() => [] as string[])
  const headers = Array.from({ length: depth }, (_, level) => {
    const cells = []
    for (let index = 0; index < table.columns.length;) {
      const path = table.columns[index].headers
      const header = path[level]
      if (!header) { index++; continue }
      const prefix = JSON.stringify(path.slice(0, level + 1).map(entry => entry.id))
      let span = 1
      while (index + span < table.columns.length
        && JSON.stringify(table.columns[index + span].headers.slice(0, level + 1).map(entry => entry.id)) === prefix) span++
      const id = `${tableId}-col-${level}-${index}`
      for (let offset = 0; offset < span; offset++) headerIds[index + offset].push(id)
      cells.push(<th key={id} id={id} scope={span > 1 ? 'colgroup' : 'col'} colSpan={span}
        rowSpan={level === path.length - 1 ? depth - level : 1}>
        {header.label}{header.name && <span className="operator-module-comparison-type">{header.name}</span>}
      </th>)
      index += span
    }
    return cells
  })
  const columnCount = 1 + table.rowAxes.length + table.columns.length
  return <table className="operator-module-comparison-table operator-module-comparison-table--potentials"
    aria-label="モジュール比較"
    style={{ minWidth: interactive ? Math.max(400, 84 + table.rowAxes.length * 48 + table.columns.length * 156)
      : 84 + table.rowAxes.length * 48 + table.columns.length * 64 }}>
    <colgroup><col className="operator-module-comparison-item" />
      {table.rowAxes.map(axis => <col key={axis} className="operator-module-comparison-axis" />)}
      {table.columns.map(column => <col key={column.id} />)}
    </colgroup>
    <thead>{headers.map((cells, index) => <tr key={index}>
      {index === 0 && <><th scope="col" rowSpan={depth}>項目</th>
        {table.rowAxes.map(axis => <th key={axis} scope="col" rowSpan={depth}
          className="operator-module-comparison-axis">{axis === 'level' ? 'Lv.' : '潜在'}</th>)}</>}
      {cells}
    </tr>)}</thead>
    {table.groups.map((group, groupIndex) => <tbody key={group.id}>
      {group.rows.map((row, rowIndex) => <tr key={row.id}>
        {rowIndex === 0 && <th scope="rowgroup" rowSpan={group.rows.length} id={`${tableId}-item-${groupIndex}`}>
          {group.label}{group.name && <span className="operator-module-comparison-name">{group.name}</span>}
        </th>}
        {table.rowAxes.map(axis => <th key={axis} scope="row" className="operator-module-comparison-axis"
          id={`${tableId}-axis-${groupIndex}-${rowIndex}-${axis}`}>
          {axis === 'level' ? row.levelLabel : row.potentialLabel}
        </th>)}
        {row.cells.map((entry, columnIndex) => entry && <td key={table.columns[columnIndex].id}
          rowSpan={entry.rowSpan} colSpan={entry.colSpan}
          className={group.kind === 'attribute' ? 'operator-module-comparison-value' : undefined}
          headers={[`${tableId}-item-${groupIndex}`,
            ...new Set(headerIds.slice(columnIndex, columnIndex + entry.colSpan).flat()),
            ...Array.from({ length: entry.rowSpan }, (_, offset) => table.rowAxes.map(axis =>
              `${tableId}-axis-${groupIndex}-${rowIndex + offset}-${axis}`)).flat()].join(' ')}>
          <ComparisonCell cell={entry.cell} interactive={interactive} potentialRank={entry.potentialRanks}
            columnLabel={entry.sourceColumn.id === 'none' ? '未装備'
              : `${entry.sourceColumn.typeLabel ?? entry.sourceColumn.name}${entry.sourceLevels.length
                ? ` Lv.${entry.sourceLevels.join('・')}` : ''}`} />
        </td>)}
      </tr>)}
    </tbody>)}
    {showLegend && <tfoot><tr><td colSpan={columnCount}>
      <div className="operator-module-comparison-image-footer"><OperatorEffectLegend /><span>{comparison.condition}</span></div>
    </td></tr></tfoot>}
  </table>
}

function ComparisonFooter({ comparison, columnCount }: { comparison: Comparison; columnCount: number }) {
  return <tfoot><tr><td colSpan={columnCount}>
    <div className="operator-module-comparison-image-footer">
      <OperatorEffectLegend /><span>{comparison.condition}</span>
    </div>
  </td></tr></tfoot>
}

function ComparisonCell({ cell, columnLabel, potentialRank, interactive }: {
  cell: OperatorModuleComparisonCell
  columnLabel: string
  potentialRank: number | number[]
  interactive: boolean
}) {
  return <>{cell.highlights ? cell.highlights.segments.map((part, partIndex) => (
    part.source ? <EffectHighlight key={`${partIndex}-${part.source}-${part.text}`} part={part} cell={cell}
      interactive={interactive} columnLabel={columnLabel} potentialRank={potentialRank} /> : part.text
  )) : cell.baseline === null ? cell.text : splitPassiveDescriptionChanges(cell.baseline, cell.text).map((part, partIndex) => (
    part.changed ? <mark key={partIndex} data-source="module">{part.text}</mark> : part.text
  ))}</>
}

function EffectHighlight({ part, cell, columnLabel, potentialRank, interactive }: {
  part: EffectChangeSegment
  cell: OperatorModuleComparisonCell
  columnLabel: string
  potentialRank: number | number[]
  interactive: boolean
}) {
  if (!part.source) return part.text
  const label = SOURCE_LABELS[part.source]
  if (!interactive || !cell.highlights) {
    return <mark data-source={part.source}>{part.text}</mark>
  }
  const values = part.values ?? cell.highlights
  const steps = [{ label: '未装備・潜在1', text: values.base }]
  if (values.withoutPotential !== values.base) {
    steps.push({ label: `${columnLabel}・潜在1`, text: values.withoutPotential })
  }
  if (values.current !== values.withoutPotential) {
    steps.push({ label: `${columnLabel}・潜在${Array.isArray(potentialRank) ? potentialRank.join('・') : potentialRank}`, text: values.current })
  }
  return <span className="operator-module-comparison-highlight" data-source={part.source}>
    <HelpPopover label={`${part.text}：${label}による変化`} triggerText={part.text}>
      <strong>{label}</strong>
      <dl className="operator-module-comparison-effect-steps">
        {steps.map((step, index) => <div key={index}><dt>{step.label}</dt><dd>{step.text || '—'}</dd></div>)}
      </dl>
    </HelpPopover>
  </span>
}
