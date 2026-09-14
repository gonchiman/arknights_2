import type { OperatorModuleComparison as Comparison } from '../lib/operatorModuleComparison'
import { splitPassiveDescriptionChanges } from '../lib/passiveDescriptionChanges'

export function OperatorModuleComparisonTable({ comparison }: { comparison: Comparison }) {
  return (
    <table className="operator-module-comparison-table"
      aria-label="モジュール比較"
      style={{ minWidth: 40 + comparison.columns.length * 64 }}
    >
      <thead><tr>
        <th scope="col">項目</th>
        {comparison.columns.map((column) => (
          <th scope="col" key={column.id}>
            {column.typeLabel && <span className="operator-module-comparison-type">{column.typeLabel}</span>}
            {column.name}
            {!column.available && <span className="operator-module-comparison-type">効果データなし</span>}
            {column.level !== null && column.level !== comparison.level && (
              <span className="operator-module-comparison-type">Lv.{column.level}</span>
            )}
          </th>
        ))}
      </tr></thead>
      <tbody>{comparison.rows.map((row) => (
        <tr key={row.id}>
          <th scope="row">{row.label}{row.name && <span className="operator-module-comparison-name">{row.name}</span>}</th>
          {row.cells.map((cell, index) => (
            <td key={comparison.columns[index].id} className={row.kind === 'attribute' ? 'operator-module-comparison-value' : undefined}>
              {cell.baseline === null ? cell.text : splitPassiveDescriptionChanges(cell.baseline, cell.text).map((part, partIndex) => (
                part.changed ? <mark key={partIndex}>{part.text}</mark> : part.text
              ))}
            </td>
          ))}
        </tr>
      ))}</tbody>
    </table>
  )
}
