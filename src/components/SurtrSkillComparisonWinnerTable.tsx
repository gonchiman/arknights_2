import { getSurtrDpsResistanceRating } from '../lib/surtrDpsResistance'
import { GOLDENGLOW_BAR_PALETTES } from '../lib/goldenglowTargetSwitchChart'
import { getModuleTableWinner, type ModuleTableWinnerCandidate } from '../lib/moduleTableWinner'
import { ModuleWinnerTable, type ModuleWinnerTableData } from './ModuleWinnerTable'
import type { SurtrSkillComparisonTableData } from './SurtrSkillComparisonTableContent'

/** Distinguish skill identities without reusing the blue/orange MOD X/Y meaning. */
export const SURTR_SKILL_COMPARISON_WINNER_COLORS = {
  s2: GOLDENGLOW_BAR_PALETTES.green.colors[2],
  s3: GOLDENGLOW_BAR_PALETTES.purple.colors[2],
} as const

type SkillKey = 's2' | 's3'
const skillKeys = ['s2', 's3'] as const

/** Collapse one comparison dimension and retain every selected candidate's raw absolute DPS. */
export function getSurtrSkillComparisonWinnerData(data: SurtrSkillComparisonTableData, skill?: SkillKey): ModuleWinnerTableData {
  const byModule = data.displayMode !== 'skill-winner'
  const selectedSkill = skill ?? (data.winnerSkill === 2 ? 's2' : data.winnerSkill === 3 ? 's3' : undefined)
  const skills = selectedSkill ? [selectedSkill] : skillKeys
  const rows = data.resistances.map(resistance => {
    const rank = getSurtrDpsResistanceRating(resistance)
    return { id: String(resistance), label: String(resistance), ...(rank ? { rank: rank.rating, rankTitle: rank.label } : {}) }
  })
  const columns = byModule ? skills.map(key => ({ id: key, label: key.toUpperCase() }))
    : data.series.map(item => ({ id: item.id, label: item.label }))
  return {
    rowAxis: { label: '術耐性', rankLabel: 'ランク', items: rows },
    columnAxis: { label: byModule ? 'スキル' : 'MOD', items: columns },
    cells: rows.flatMap((row, index) => columns.map(column => {
      const candidates: ModuleTableWinnerCandidate[] = byModule
        ? data.series.map(item => ({ id: item.id, label: item.label, moduleType: item.moduleType,
          moduleLevel: item.moduleLevel, color: item.color, value: item[column.id as SkillKey][index] ?? null }))
        : skillKeys.map(key => ({ id: key, label: key.toUpperCase(), shortLabel: key.toUpperCase(),
          moduleType: undefined, color: SURTR_SKILL_COMPARISON_WINNER_COLORS[key],
          value: data.series.find(item => item.id === column.id)?.[key][index] ?? null }))
      return { rowId: row.id, columnId: column.id, candidates }
    })),
  }
}

/** Copy full winner identities, including every tie, using the exact same candidate matrix as the table. */
export function getSurtrSkillComparisonWinnerTsv(source: SurtrSkillComparisonTableData): string {
  const data = getSurtrSkillComparisonWinnerData(source)
  const ranked = source.rankMode !== 'none'
  const cells = new Map(data.cells.map(cell => [JSON.stringify([cell.rowId, cell.columnId]), cell.candidates]))
  const clean = (value: string) => value.replace(/[\t\r\n]+/g, ' ').trim()
  return [
    ['術耐性', ...(ranked ? ['術耐性ランク'] : []), ...data.columnAxis.items.map(column => clean(column.label))],
    ...data.rowAxis.items.map(row => [row.label, ...(ranked ? [row.rank ?? '—'] : []),
      ...data.columnAxis.items.map(column => {
        const candidates = cells.get(JSON.stringify([row.id, column.id]))
        const result = candidates ? getModuleTableWinner(candidates) : null
        return result?.winners.map(winner => clean(winner.label)).join('＝') || '—'
      })]),
  ].map(row => row.join('\t')).join('\n')
}

export function SurtrSkillComparisonWinnerTable({ transpose = false, forImage = false, onOpenDetail, ...data }:
  SurtrSkillComparisonTableData & { transpose?: boolean; forImage?: boolean;
    onOpenDetail?: (resistance: number, seriesId: string, skillIndex?: 2 | 3) => void }) {
  const byModule = data.displayMode !== 'skill-winner'
  return <ModuleWinnerTable data={getSurtrSkillComparisonWinnerData(data)} transpose={transpose} forImage={forImage}
    candidateKind={byModule ? 'module' : 'skill'}
    color={data.winnerColor === 'none' ? 'none' : 'module'} gapShading={data.winnerGapShading ?? false}
    rankMode={data.rankMode} ariaLabel={`スルト S2・S3 DPSが最大の${byModule ? 'MOD' : 'スキル'}`}
    onSelectCell={onOpenDetail ? selection => {
      const seriesId = byModule ? selection.winnerIds[0] : selection.columnId
      const skill = byModule ? selection.columnId : selection.winnerIds[0]
      if (seriesId && (skill === 's2' || skill === 's3')) onOpenDetail(Number(selection.rowId), seriesId, skill === 's3' ? 3 : 2)
    } : undefined} />
}
