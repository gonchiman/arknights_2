import type { ModuleWinnerTableData } from '../components/ModuleWinnerTable'
import type { SelectedSurtrModuleStage } from './surtrModuleComparison.ts'
import type { SurtrDpsOutputSeries } from './surtrDpsOutput.ts'
import { getSurtrDpsResistanceRating } from './surtrDpsResistance.ts'
import { getModuleTableWinner } from './moduleTableWinner.ts'
import type { SurtrUnequippedBlockingComparison, SurtrUnequippedRankMode } from './surtrUnequippedComparison.ts'

export type SurtrWinnerStage = Pick<SelectedSurtrModuleStage, 'id' | 'type' | 'level' | 'label' | 'color'>
export interface SurtrComparisonWinnerSource {
  series: readonly SurtrDpsOutputSeries[]
  resistances: readonly number[]
  winnerStages?: readonly SurtrWinnerStage[]
  blockingComparison?: readonly SurtrUnequippedBlockingComparison[]
}

const potentialOf = (series: SurtrDpsOutputSeries) => series.potential ?? Number(/:pot([1-6])$/.exec(series.id)?.[1] ?? 1)
const stageOf = (series: SurtrDpsOutputSeries) => series.moduleStageId ?? series.id.replace(/:pot[1-6]$/, '')
export const surtrWinnerColumnId = (potential: number, blocking: boolean | undefined) => `pot${potential}:${blocking === undefined ? 'current' : blocking ? 'blocked' : 'unblocked'}`
export function getSurtrWinnerColumnCondition(id: string): { potential: number; blocking?: boolean } | null {
  const match = /^pot([1-6]):(blocked|unblocked|current)$/.exec(id)
  return match ? { potential: Number(match[1]), ...(match[2] === 'current' ? {} : { blocking: match[2] === 'blocked' }) } : null
}

/** Collapse only the visible MOD dimension; hidden baseline references never compete. */
export function buildSurtrComparisonWinnerData(source: SurtrComparisonWinnerSource): ModuleWinnerTableData {
  const stages = new Map(source.winnerStages?.map(stage => [stage.id, stage]))
  const selected = source.series.filter(item => stages.has(stageOf(item)))
  const potentials = [...new Set(selected.map(potentialOf))]
  const conditions = source.blockingComparison === undefined ? [undefined] : [false, true]
  const columns = potentials.flatMap(potential => conditions.map(blocking => ({
    id: surtrWinnerColumnId(potential, blocking),
    label: blocking === undefined ? `潜在${potential}` : blocking ? '対象を自身でブロック' : '未ブロック',
    ...(blocking !== undefined && potentials.length > 1 ? { groupId: `pot${potential}`, groupLabel: `潜在${potential}` } : {}),
  })))
  const rows = source.resistances.map(resistance => {
    const rank = getSurtrDpsResistanceRating(resistance)
    return { id: String(resistance), label: String(resistance), ...(rank ? { rank: rank.rating, rankTitle: rank.label } : {}) }
  })
  return { rowAxis: { label: '術耐性', rankLabel: 'ランク', items: rows },
    columnAxis: { label: source.blockingComparison === undefined ? '潜在' : 'ブロック条件', items: columns },
    cells: rows.flatMap(row => columns.map(column => {
      const condition = getSurtrWinnerColumnCondition(column.id)!
      const values = condition.blocking === undefined ? source.series
        : source.blockingComparison?.find(group => group.blocking === condition.blocking)?.series ?? []
      return { rowId: row.id, columnId: column.id, candidates: selected.filter(item => potentialOf(item) === condition.potential).map(item => {
        const stage = stages.get(stageOf(item))!
        return { id: item.id, label: stage.label,
          shortLabel: stage.type === null ? '未装備' : `${stage.type}${stage.level}`,
          moduleType: stage.type, moduleLevel: stage.level, color: stage.color,
          value: values.find(value => value.id === item.id)?.points.find(point => point.x === Number(row.id))?.value ?? null }
      }) }
    })) }
}

/** Copy full MOD names and keep potential/blocking in the column headings. */
export function getSurtrComparisonWinnerTsv(source: SurtrComparisonWinnerSource, rankMode: SurtrUnequippedRankMode = 'none'): string {
  const data = buildSurtrComparisonWinnerData(source)
  const clean = (text: string) => text.replace(/[\t\r\n]+/g, ' ').trim()
  return [
    ['術耐性', ...(rankMode === 'none' ? [] : ['術耐性ランク']), ...data.columnAxis.items.map(column => clean(`${column.groupLabel ?? ''} ${column.label}`.trim()))],
    ...data.rowAxis.items.map(row => [row.label, ...(rankMode === 'none' ? [] : [row.rank ?? '—']),
      ...data.columnAxis.items.map(column => {
        const cell = data.cells.find(cell => cell.rowId === row.id && cell.columnId === column.id)
        const winner = cell ? getModuleTableWinner(cell.candidates) : null
        return winner?.winners.map(item => clean(item.label)).join('＝') || '—'
      })]),
  ].map(row => row.join('\t')).join('\r\n')
}
