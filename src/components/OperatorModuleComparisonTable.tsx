import type { OperatorModuleComparison as Comparison, OperatorModuleComparisonCell } from '../lib/operatorModuleComparison'
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

export function OperatorModuleComparisonTable({ comparison, interactive = true, showLegend = false }: {
  comparison: Comparison
  interactive?: boolean
  showLegend?: boolean
}) {
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
              {cell.highlights ? cell.highlights.segments.map((part, partIndex) => (
                part.source ? <EffectHighlight key={`${partIndex}-${part.source}-${part.text}`}
                  part={part} cell={cell} interactive={interactive}
                  columnLabel={index === 0 ? '未装備' : comparison.columns[index].typeLabel ?? 'MOD'}
                  potentialRank={comparison.potentialRank}
                /> : part.text
              )) : cell.baseline === null ? cell.text : splitPassiveDescriptionChanges(cell.baseline, cell.text).map((part, partIndex) => (
                part.changed ? <mark key={partIndex} data-source="module">{part.text}</mark> : part.text
              ))}
            </td>
          ))}
        </tr>
      ))}</tbody>
      {showLegend && <tfoot><tr><td colSpan={comparison.columns.length + 1}>
        <div className="operator-module-comparison-image-footer">
          <OperatorEffectLegend />
          <span>{comparison.condition}{comparison.level !== null ? `・MOD Lv.${comparison.level}` : ''}</span>
        </div>
      </td></tr></tfoot>}
    </table>
  )
}

function EffectHighlight({ part, cell, columnLabel, potentialRank, interactive }: {
  part: EffectChangeSegment
  cell: OperatorModuleComparisonCell
  columnLabel: string
  potentialRank: number
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
    steps.push({ label: `${columnLabel}・潜在${potentialRank}`, text: values.current })
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
