import type { OperatorCombatProfile, RawBlackboardCollection } from '../types/skill'
import {
  buildOperatorModuleStageComparison,
  sameComparisonCell,
  type OperatorModuleComparison,
  type OperatorModuleComparisonCell,
  type OperatorModuleComparisonColumn,
  type OperatorModuleComparisonLayout,
  type OperatorModuleComparisonRow,
} from './operatorModuleComparison.ts'
import { getOperatorMaxPotentialRank, getOperatorPotentialApplication } from './operatorPotentials.ts'
import { getOperatorModuleId, getOperatorModulePhase, getOperatorModules } from './operatorModules.ts'

export interface OperatorModulePotentialComparison {
  comparisons: OperatorModuleComparison[]
  selectedPotentials: number[]
  potentialRanks: number[]
  condition: string
}

export interface OperatorModulePotentialTableHeader {
  id: string
  label: string
  name?: string
  kind: 'module' | 'level' | 'potential'
}

export interface OperatorModulePotentialTableCell {
  cell: OperatorModuleComparisonCell
  sourceColumn: OperatorModuleComparisonColumn
  sourceLevels: number[]
  potentialRanks: number[]
  rowSpan: number
  colSpan: number
}

export interface OperatorModulePotentialTableRow {
  id: string
  levelLabel?: string
  potentialLabel?: string
  cells: Array<OperatorModulePotentialTableCell | null>
}

export interface OperatorModulePotentialTable {
  columns: Array<{ id: string; headers: OperatorModulePotentialTableHeader[] }>
  rowAxes: Array<'level' | 'potential'>
  groups: Array<{
    id: string
    label: string
    name?: string
    kind: OperatorModuleComparisonRow['kind']
    rows: OperatorModulePotentialTableRow[]
  }>
}

export interface OperatorModulePotentialTableOptions {
  levelLayout: OperatorModuleComparisonLayout
  potentialLayout: OperatorModuleComparisonLayout
  merge: boolean
}

/** Build each selected potential with the same stages and preserve the existing effect attribution. */
export function buildOperatorModulePotentialComparison(
  profile: OperatorCombatProfile,
  selectedLevels: Record<string, number[]> = {},
  requestedPotentials: number[] = [1],
  includeNone = true,
): OperatorModulePotentialComparison {
  const potentialRanks = Array.from({ length: getOperatorMaxPotentialRank(profile) }, (_, index) => index + 1)
  const selectedPotentials = [...new Set(requestedPotentials)]
    .filter((rank) => potentialRanks.includes(rank)).sort((a, b) => a - b)
  const comparisons = selectedPotentials.map((rank) => buildOperatorModuleStageComparison(profile, selectedLevels, rank, includeNone))
  const summaries = selectedPotentials.map((rank) => potentialAttributes(profile, rank))
  const attributes = new Map(summaries.flatMap((summary) => [...summary].map(([key, value]) => [key, value.label] as const)))
  const modules = new Map(getOperatorModules(profile).map((module, index) => [getOperatorModuleId(module, index), module]))

  comparisons.forEach((comparison, index) => {
    comparison.rows = comparison.rows.map((row) => row.kind === 'attribute' ? {
      ...row, name: 'MOD',
      cells: row.cells.map((cell, columnIndex) => {
        const column = comparison.columns[columnIndex]
        const phase = getOperatorModulePhase(modules.get(moduleId(column)), column.level ?? 1)
        const comparisonValue = column.id === 'none' ? 0 : !column.available || !phase ? null
          : rawAttributeValue(phase.attributeBlackboard, row.id.replace(/^attribute:/, ''))
        return { ...cell, comparisonValue }
      }),
    } : row)
    const bonusRows: OperatorModuleComparisonRow[] = [...attributes].map(([key, label]) => {
      const bonus = summaries[index].get(key)
      const value = bonus?.value ?? (bonus ? null : 0)
      const text = value === null ? bonus!.description || 'データなし'
        : value === 0 ? '—' : `${value > 0 ? '+' : ''}${formatValue(value)}${key === 'RESPAWN_TIME' ? '秒' : ''}`
      const empty = ''
      const cell: OperatorModuleComparisonCell = {
        text, baseline: null, comparisonValue: value,
        highlights: {
          base: empty, withoutModule: value === 0 ? empty : text,
          withoutPotential: empty, current: value === 0 ? empty : text,
          segments: [{ text, source: value === null || value === 0 ? null : 'potential' }],
        },
      }
      return {
        id: `potential-attribute:${key}`, label: `${label}補正`, name: '潜在', kind: 'attribute',
        cells: comparison.columns.map(() => ({ ...cell })),
      }
    })
    const afterAttributes = comparison.rows.findIndex((row) => row.kind !== 'attribute')
    comparison.rows.splice(afterAttributes < 0 ? comparison.rows.length : afterAttributes, 0, ...bonusRows)
  })

  return {
    comparisons, selectedPotentials, potentialRanks,
    condition: `昇進${Math.max(0, profile.phases.length - 1)}・潜在${selectedPotentials.join('・')}`,
  }
}

/** Preserve raw values instead of deciding equality from the formatted module attribute text. */
function rawAttributeValue(blackboard: RawBlackboardCollection | undefined, key: string): number | null {
  if (!blackboard) return 0
  const entry = Array.isArray(blackboard) ? blackboard.find((item) => item.key?.trim().toLowerCase() === key)
    : Object.entries(blackboard).map(([entryKey, value]) => ({ key: entryKey, value }))
      .find((item) => item.key.trim().toLowerCase() === key)
  if (!entry) return 0
  return typeof entry.value === 'number' && Number.isFinite(entry.value) ? entry.value : null
}

type AttributeSummary = { label: string; value: number | null; description: string }

function potentialAttributes(profile: OperatorCombatProfile, potentialRank: number): Map<string, AttributeSummary> {
  const potential = getOperatorPotentialApplication(profile, potentialRank)
  const totals = new Map<string, AttributeSummary>()
  let effectIndex = 0
  for (const rank of (profile.potentialRanks ?? []).slice(0, potentialRank - 1)) {
    for (const modifier of rank.buff?.attributes?.attributeModifiers ?? []) {
      const effect = potential.effects[effectIndex++]
      if (!effect) continue
      const previous = totals.get(effect.attributeType)
      const supported = effect.status !== 'UNSUPPORTED' && effect.formulaItem === 'ADDITION'
        && effect.value !== null && !modifier.loadFromBlackboard && !modifier.fetchBaseValueFromSourceEntity
      const value = supported && previous?.value !== null ? (previous?.value ?? 0) + effect.value! : null
      totals.set(effect.attributeType, {
        label: effect.label, value,
        description: [...new Set([previous?.description, effect.description].filter(Boolean))].join('、'),
      })
    }
  }
  return totals
}

function formatValue(value: number): string {
  return Number(value.toFixed(8)).toString()
}

type LeafColumn = {
  id: string
  source: OperatorModuleComparisonColumn
  moduleId: string
  level: number | null
  potential: number | null
  headers: OperatorModulePotentialTableHeader[]
}
type PositionedRow = OperatorModulePotentialTableRow & { level: number | null; potential: number | null }

/** Orthogonal stage/potential axes shared by the screen table and exported image. */
export function buildOperatorModulePotentialTable(
  model: OperatorModulePotentialComparison,
  options: OperatorModulePotentialTableOptions,
): OperatorModulePotentialTable {
  const sourceColumns = [...new Map(model.comparisons.flatMap((comparison) => comparison.columns.map((column) => [column.id, column] as const))).values()]
  const moduleColumns = [...new Map(sourceColumns.map((column) => [moduleId(column), { ...column, id: moduleId(column), level: null }] as const)).values()]
  const levels = [...new Set(sourceColumns.flatMap((column) => column.level === null ? [] : [column.level]))].sort((a, b) => a - b)
  const rowAxes: OperatorModulePotentialTable['rowAxes'] = []
  if (options.levelLayout === 'rows' && levels.length) rowAxes.push('level')
  if (options.potentialLayout === 'rows') rowAxes.push('potential')
  const axisColumns = options.levelLayout === 'rows' ? moduleColumns : sourceColumns
  const leafColumns: LeafColumn[] = axisColumns.flatMap((source) => (
    (options.potentialLayout === 'columns' ? model.selectedPotentials : [null]).map((potential) => {
      const id = moduleId(source)
      const headers: OperatorModulePotentialTableHeader[] = [{
        id, label: source.typeLabel ?? source.name,
        ...(source.typeLabel ? { name: source.name } : {}), kind: 'module',
      }]
      // Keep a level header for the unequipped column too so every path has the same depth.
      if (options.levelLayout === 'columns' && levels.length) headers.push({
        id: `${id}:level:${source.level ?? 'none'}`, label: source.level === null ? '—' : `Lv.${source.level}`, kind: 'level',
      })
      if (potential !== null) headers.push({ id: `${source.id}:potential:${potential}`, label: `潜在${potential}`, kind: 'potential' })
      return { id: `${source.id}:p${potential ?? 'rows'}`, source, moduleId: id, level: source.level, potential, headers }
    })
  ))
  const rowDefinitions = new Map(model.comparisons.flatMap((comparison) => comparison.rows.map((row) => [row.id, row] as const)))
  const byPotential = new Map(model.comparisons.map((comparison) => [comparison.potentialRank, {
    comparison, rows: new Map(comparison.rows.map((row) => [row.id, row])),
  }]))
  const groups = [...rowDefinitions.values()].map((definition) => {
    const rowLevels: Array<number | null> = rowAxes.includes('level') ? levels : [null]
    const rowPotentials: Array<number | null> = rowAxes.includes('potential') ? model.selectedPotentials : [null]
    let rows: PositionedRow[] = rowLevels.flatMap((level) => rowPotentials.map((potential) => ({
      id: `${definition.id}:l${level ?? 'cols'}:p${potential ?? 'cols'}`, level, potential,
      ...(rowAxes.includes('level') ? { levelLabel: String(level) } : {}),
      ...(rowAxes.includes('potential') ? { potentialLabel: String(potential) } : {}),
      cells: leafColumns.map((leaf): OperatorModulePotentialTableCell => {
        const rank = potential ?? leaf.potential!
        const current = byPotential.get(rank)!
        const requestedLevel = level ?? leaf.level
        const sourceIndex = current.comparison.columns.findIndex((column) => moduleId(column) === leaf.moduleId
          && (column.id === 'none' || column.level === requestedLevel))
        const sourceColumn = sourceIndex < 0 ? {
          ...leaf.source, id: `${leaf.moduleId}:lv${requestedLevel}`, level: requestedLevel, available: false,
        } : current.comparison.columns[sourceIndex]
        const sourceRow = current.rows.get(definition.id)
        const cell = sourceIndex < 0 ? { text: '未選択', baseline: null }
          : sourceRow?.cells[sourceIndex] ?? { text: sourceColumn.available ? '—' : 'データなし', baseline: null }
        return { cell, sourceColumn, sourceLevels: sourceColumn.level === null ? [] : [sourceColumn.level], potentialRanks: [rank], rowSpan: 1, colSpan: 1 }
      }),
    })))
    if (options.merge) {
      for (const axis of rowAxes) rows = collapseCommonAxis(rows, axis)
      rows.forEach((row) => mergeColumns(row.cells, leafColumns))
      mergeRows(rows)
    }
    return {
      id: definition.id, label: definition.label, ...(definition.name ? { name: definition.name } : {}), kind: definition.kind,
      rows: rows.map(({ level: _level, potential: _potential, ...row }) => row),
    }
  })
  return { columns: leafColumns.map(({ id, headers }) => ({ id, headers })), rowAxes, groups }
}

function moduleId(column: OperatorModuleComparisonColumn): string {
  return column.id === 'none' ? 'none' : column.id.replace(/:lv\d+$/, '')
}

function comparable(entry: OperatorModulePotentialTableCell): boolean {
  return entry.sourceColumn.available && entry.cell.comparisonValue !== null
    && !['データなし', '未選択', ''].includes(entry.cell.text)
}

function sameEntry(left: OperatorModulePotentialTableCell | null, right: OperatorModulePotentialTableCell | null): boolean {
  return Boolean(left && right && comparable(left) && comparable(right)
    && moduleId(left.sourceColumn) === moduleId(right.sourceColumn)
    && sameComparisonCell(left.cell, right.cell))
}

function combineSources(target: OperatorModulePotentialTableCell, source: OperatorModulePotentialTableCell): void {
  target.sourceLevels = [...new Set([...target.sourceLevels, ...source.sourceLevels])].sort((a, b) => a - b)
  target.potentialRanks = [...new Set([...target.potentialRanks, ...source.potentialRanks])].sort((a, b) => a - b)
}

function collapseCommonAxis(rows: PositionedRow[], axis: 'level' | 'potential'): PositionedRow[] {
  if (new Set(rows.map((row) => row[axis])).size < 2 || !rows[0]?.cells.length) return rows
  const other = axis === 'level' ? 'potential' : 'level'
  const groups = new Map<number | null, PositionedRow[]>()
  for (const row of rows) groups.set(row[other], [...groups.get(row[other]) ?? [], row])
  if (![...groups.values()].every((group) => group.every((row) => row.cells.every((entry, index) => sameEntry(entry, group[0].cells[index]))))) return rows
  return [...groups.values()].map((group) => {
    const first = group[0]
    group.slice(1).forEach((row) => first.cells.forEach((entry, index) => combineSources(entry!, row.cells[index]!)))
    return { ...first, [axis]: null, [`${axis}Label`]: '共通' }
  })
}

function mergeColumns(cells: Array<OperatorModulePotentialTableCell | null>, columns: LeafColumn[]): void {
  for (let start = 0; start < cells.length; start++) {
    const first = cells[start]!
    let best = start
    const levels = new Set([columns[start].level])
    const potentials = new Set([columns[start].potential])
    for (let end = start + 1; end < cells.length; end++) {
      if (columns[start].moduleId !== columns[end].moduleId || !sameEntry(first, cells[end])) break
      levels.add(columns[end].level)
      potentials.add(columns[end].potential)
      if (levels.size * potentials.size === end - start + 1) best = end
    }
    for (let end = start + 1; end <= best; end++) {
      combineSources(first, cells[end]!)
      cells[end] = null
    }
    first.colSpan = best - start + 1
    start = best
  }
}

function mergeRows(rows: PositionedRow[]): void {
  for (let column = 0; column < (rows[0]?.cells.length ?? 0); column++) {
    for (let start = 0; start < rows.length; start++) {
      const first = rows[start].cells[column]
      if (!first) continue
      let best = start
      const levels = new Set([rows[start].level])
      const potentials = new Set([rows[start].potential])
      for (let end = start + 1; end < rows.length; end++) {
        const current = rows[end].cells[column]
        if (!sameEntry(first, current) || first.colSpan !== current!.colSpan) break
        levels.add(rows[end].level)
        potentials.add(rows[end].potential)
        if (levels.size * potentials.size === end - start + 1) best = end
      }
      for (let end = start + 1; end <= best; end++) {
        combineSources(first, rows[end].cells[column]!)
        rows[end].cells[column] = null
      }
      first.rowSpan = best - start + 1
      start = best
    }
  }
}
