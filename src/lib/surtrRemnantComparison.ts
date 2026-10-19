import type { ModuleWinnerTableData } from '../components/ModuleWinnerTable'
import type { SurtrUnequippedComparisonTableData } from '../components/SurtrUnequippedComparisonTableContent'
import type { SurtrDpsOutputSeries } from './surtrDpsOutput.ts'
import { getSurtrDpsResistanceRating } from './surtrDpsResistance.ts'
import { buildSurtrComparisonImageColumns } from './surtrComparisonImageLayout.ts'
import { buildSurtrComparisonWinnerData, getSurtrWinnerColumnCondition } from './surtrComparisonWinner.ts'
import { getModuleTableWinner } from './moduleTableWinner.ts'
import { getSurtrUnequippedColorScaleMaximum } from './surtrUnequippedColorScale.ts'
import { formatSurtrUnequippedComparisonValue, getSurtrComparisonBaseLabel, getSurtrUnequippedBaselines,
  type SurtrUnequippedBlockingComparison } from './surtrUnequippedComparison.ts'

export type SurtrRemnantComparisonLayout = 'common' | 'columns'
export type SurtrRemnantComparisonMode = 'single' | SurtrRemnantComparisonLayout

export interface SurtrRemnantComparisonState {
  remnantActive: boolean
  series: readonly SurtrDpsOutputSeries[]
  baseline: SurtrDpsOutputSeries
  referenceSeries?: readonly SurtrDpsOutputSeries[]
  blockingComparison?: readonly SurtrUnequippedBlockingComparison[]
}

export interface SurtrRemnantComparisonColumn {
  id: string
  seriesId: string
  item: SurtrDpsOutputSeries
  blocking?: boolean
  remnantActive?: boolean
  common: boolean
  isBaseline: boolean
  raw?: Map<number, number | null>
  comparison?: Map<number, number | null>
  reference?: SurtrDpsOutputSeries | null
}

type Source = SurtrUnequippedComparisonTableData & {
  remnantComparison?: readonly SurtrRemnantComparisonState[]
  remnantLayout?: SurtrRemnantComparisonLayout
}

export const getSurtrRemnantStateLabel = (active: boolean | undefined): string => active === undefined
  ? '余燼なし・中 共通' : active ? '余燼中' : '余燼なし'

const finite = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value)
const pointMap = (item: SurtrDpsOutputSeries | undefined) => item && new Map(item.points.map(point => [point.x, point.value]))
const emptySeries = (item: SurtrDpsOutputSeries): SurtrDpsOutputSeries => ({ ...item, points: [] })
const potentialOf = (item: SurtrDpsOutputSeries) => item.potential ?? (Number(/:pot([1-6])$/.exec(item.id)?.[1]) || undefined)
const blockOrder = (blocking: boolean | undefined) => blocking === undefined ? 2 : Number(blocking)
const hasBlocking = (source: Source) => source.blockingComparison !== undefined
  || source.remnantComparison?.some(state => state.blockingComparison !== undefined) === true

/** Keep selected identities even if a state or condition has no corresponding calculation. */
function stateSource(source: Source, active: boolean) {
  const state = source.remnantComparison?.find(state => state.remnantActive === active)
  return { ...source,
    series: source.series.map(item => state?.series.find(value => value.id === item.id) ?? emptySeries(item)),
    baseline: state?.baseline ?? emptySeries(source.baseline),
    referenceSeries: state?.referenceSeries ?? [],
    blockingComparison: hasBlocking(source) ? state?.blockingComparison ?? [] : undefined,
  }
}

function identity(column: Pick<SurtrRemnantComparisonColumn, 'seriesId' | 'blocking' | 'isBaseline'>) {
  return JSON.stringify([column.isBaseline, column.seriesId, column.blocking ?? 'current'])
}

const columnId = (column: Pick<SurtrRemnantComparisonColumn, 'seriesId' | 'blocking' | 'isBaseline' | 'remnantActive'>) =>
  JSON.stringify([column.isBaseline ? 'baseline' : 'target', column.seriesId,
    column.blocking ?? 'current', column.remnantActive ?? 'common'])

/** Common columns require complete equality before display rounding, including the raw quantity. */
function equalNumericColumns(first: SurtrRemnantComparisonColumn, second: SurtrRemnantComparisonColumn, resistances: readonly number[]) {
  return resistances.length > 0 && resistances.every(resistance => {
    const firstRaw = first.raw?.get(resistance), secondRaw = second.raw?.get(resistance)
    const firstComparison = first.comparison?.get(resistance), secondComparison = second.comparison?.get(resistance)
    return finite(firstRaw) && finite(secondRaw) && firstRaw === secondRaw && (first.isBaseline
      || finite(firstComparison) && finite(secondComparison) && firstComparison === secondComparison)
  })
}

function baselineIdentities(source: Source): SurtrDpsOutputSeries[] {
  const known = [
    ...getSurtrUnequippedBaselines(source.series, source.baseline, source.referenceSeries),
    ...(source.remnantComparison ?? []).flatMap(state => [
      ...getSurtrUnequippedBaselines(source.series, state.baseline, state.referenceSeries),
      ...(state.blockingComparison ?? []).flatMap(group => getSurtrUnequippedBaselines(source.series, group.baseline, group.referenceSeries)),
    ]),
  ]
  const potentials = [...new Set(source.series.map(potentialOf).filter(potential => potential !== undefined))]
  return potentials.length ? potentials.map(potential => known.find(item => potentialOf(item) === potential) ?? {
    ...source.baseline, id: `none:pot${potential}`, moduleStageId: 'none', potential,
    label: `未装備 潜在${potential}`, points: [],
  }) : known.slice(0, 1)
}

/** Expand the existing comparison axis with adjacent off/on values; never infer common data from MOD identity. */
export function buildSurtrRemnantComparisonColumns(source: Source): SurtrRemnantComparisonColumn[] {
  const conditions = hasBlocking(source) ? [false, true] : [undefined]
  const baselineTemplates = baselineIdentities(source)
  const includeBaseline = source.layout === 'combined' && (source.comparisonBase ?? 'unequipped') === 'unequipped'
  const states = [false, true].map(active => {
    const data = stateSource(source, active)
    const targets: SurtrRemnantComparisonColumn[] = buildSurtrComparisonImageColumns(data).map(column => ({ ...column,
      id: '', remnantActive: active, common: false, isBaseline: false }))
    const baselines: SurtrRemnantComparisonColumn[] = includeBaseline ? baselineTemplates.flatMap(item => conditions.map(blocking => {
      const condition = blocking === undefined ? data : data.blockingComparison?.find(group => group.blocking === blocking)
      const selected = condition && source.series.map(item => condition.series.find(value => value.id === item.id) ?? emptySeries(item))
      const actual = condition && getSurtrUnequippedBaselines(selected!, condition.baseline, condition.referenceSeries)
        .find(value => value.id === item.id || potentialOf(value) === potentialOf(item))
      return { id: '', seriesId: item.id, item: actual ?? item, blocking, remnantActive: active,
        common: false, isBaseline: true, raw: pointMap(actual) }
    })) : []
    return [...baselines, ...targets]
  })
  const onById = new Map(states[1].map(column => [identity(column), column]))
  let columns = states[0].flatMap(off => {
    const on = onById.get(identity(off))!
    return source.remnantLayout === 'common' && equalNumericColumns(off, on, source.resistances)
      ? [{ ...off, remnantActive: undefined, common: true }]
      : [off, on]
  })
  if (source.columnOrder === 'blocking') columns = columns.sort((first, second) => blockOrder(first.blocking) - blockOrder(second.blocking))
  return columns.map(column => ({ ...column, id: columnId(column) }))
}

/** One scale across both states, independent of common-column compression or image splitting. */
export function getSurtrRemnantComparisonColorScaleMaximum(source: Source): number {
  if (finite(source.colorScaleMaximum) && source.colorScaleMaximum >= 0) return source.colorScaleMaximum
  return getSurtrUnequippedColorScaleMaximum(buildSurtrRemnantComparisonColumns({ ...source, remnantLayout: 'columns' })
    .flatMap(column => source.resistances.map(resistance => column.comparison?.get(resistance))), source.metric)
}

const cleanLabel = (text: string) => {
  const value = text.replace(/[\t\r\n]+/g, ' ').trim()
  return /^[=+\-@]/.test(value) ? `'${value}` : value
}

function rawValue(value: number | null | undefined, precision: number) {
  if (!finite(value)) return '—'
  const digits = Number.isInteger(precision) && precision >= 0 && precision <= 3 ? precision : 0
  const rounded = Number(value.toFixed(digits))
  return new Intl.NumberFormat('ja-JP', { useGrouping: false, minimumFractionDigits: digits, maximumFractionDigits: digits })
    .format(rounded === 0 ? 0 : rounded)
}

/** Full state, module, potential, condition and reference names are retained in clipboard output. */
export function getSurtrRemnantComparisonTsv(source: Source): string {
  if (source.displayMode === 'winner') return winnerTsv(source)
  const columns = buildSurtrRemnantComparisonColumns(source)
  const combined = source.layout === 'combined'
  const ranked = source.rankMode !== undefined && source.rankMode !== 'none'
  const base = getSurtrComparisonBaseLabel(source.comparisonBase)
  const quantity = source.quantity === 'expected-damage' ? '総ダメージ期待値' : 'DPS'
  const metric = source.metric === 'difference' ? `${base}との${source.quantity === 'expected-damage' ? 'ダメージ' : 'DPS'}差`
    : source.metric === 'ratio' ? `${base}に対する${quantity}比（%）` : `${base}からの増加率（%）`
  const label = (column: SurtrRemnantComparisonColumn) => {
    const block = column.blocking === undefined ? '' : column.blocking ? '対象を自身でブロック' : '未ブロック'
    const labels = source.columnOrder === 'blocking' ? [block, column.item.label] : [column.item.label, block]
    return cleanLabel([...labels, getSurtrRemnantStateLabel(column.remnantActive)].filter(Boolean).join(' '))
  }
  return [
    ['術耐性', ...(ranked ? ['術耐性ランク'] : []), ...columns.flatMap(column => column.isBaseline
      ? [`${label(column)} ${quantity}`]
      : [...(combined ? [`${label(column)} ${quantity}`] : []), `${label(column)} ${metric}${source.comparisonBase && source.comparisonBase !== 'unequipped'
        ? `（基準：${cleanLabel(column.reference?.label ?? `${base}不明`)}）` : ''}`])],
    ...source.resistances.map(resistance => [String(resistance), ...(ranked ? [getSurtrDpsResistanceRating(resistance)?.rating ?? '—'] : []),
      ...columns.flatMap(column => column.isBaseline ? [rawValue(column.raw?.get(resistance), source.precision)]
        : [...(combined ? [rawValue(column.raw?.get(resistance), source.precision)] : []),
          formatSurtrUnequippedComparisonValue(column.comparison?.get(resistance), source.metric, source.precision, false)])]),
  ].map(row => row.join('\t')).join('\r\n')
}

export function getSurtrRemnantWinnerColumnCondition(id: string): { potential: number; blocking?: boolean; remnantActive?: boolean } | null {
  const match = /^remnant:(off|on|common):(.*)$/.exec(id)
  const condition = match && getSurtrWinnerColumnCondition(match[2])
  return condition ? { ...condition, ...(match![1] === 'common' ? {} : { remnantActive: match![1] === 'on' }) } : null
}

/** Collapse a winner column only when every selected candidate's raw values match in both states. */
export function buildSurtrRemnantWinnerData(source: Source): ModuleWinnerTableData {
  const off = buildSurtrComparisonWinnerData(stateSource(source, false))
  const on = buildSurtrComparisonWinnerData(stateSource(source, true))
  const cell = (data: ModuleWinnerTableData, rowId: string, columnId: string) =>
    data.cells.find(cell => cell.rowId === rowId && cell.columnId === columnId)
  let baseColumns = [...off.columnAxis.items]
  if (source.columnOrder === 'blocking') baseColumns = baseColumns.sort((first, second) =>
    blockOrder(getSurtrWinnerColumnCondition(first.id)?.blocking) - blockOrder(getSurtrWinnerColumnCondition(second.id)?.blocking))
  const columns = baseColumns.flatMap(column => {
    const common = source.remnantLayout === 'common' && off.rowAxis.items.length > 0 && off.rowAxis.items.every(row => {
      const first = cell(off, row.id, column.id)?.candidates ?? []
      const second = cell(on, row.id, column.id)?.candidates ?? []
      return first.length > 0 && first.length === second.length && first.every(candidate => {
        const other = second.find(item => item.id === candidate.id)
        return finite(candidate.value) && finite(other?.value) && candidate.value === other.value
      })
    })
    const condition = getSurtrWinnerColumnCondition(column.id)!
    const heading = condition.blocking === undefined ? `潜在${condition.potential}`
      : `潜在${condition.potential} ${condition.blocking ? '対象を自身でブロック' : '未ブロック'}`
    return (common ? [undefined] : [false, true]).map(active => ({
      id: `remnant:${active === undefined ? 'common' : active ? 'on' : 'off'}:${column.id}`,
      label: getSurtrRemnantStateLabel(active), groupId: column.id, groupLabel: heading,
      condition, active, originalId: column.id,
    }))
  })
  return { rowAxis: off.rowAxis, columnAxis: { label: '余燼状態', items: columns.map(({ id, label, groupId, groupLabel }) => ({ id, label, groupId, groupLabel })) },
    cells: off.rowAxis.items.flatMap(row => columns.map(column => ({ rowId: row.id, columnId: column.id,
      candidates: cell(column.active === true ? on : off, row.id, column.originalId)?.candidates ?? [],
    }))) }
}

function winnerTsv(source: Source): string {
  const data = buildSurtrRemnantWinnerData(source)
  const ranked = source.rankMode !== undefined && source.rankMode !== 'none'
  return [['術耐性', ...(ranked ? ['術耐性ランク'] : []), ...data.columnAxis.items.map(column => cleanLabel(`${column.groupLabel} ${column.label}`))],
    ...data.rowAxis.items.map(row => [row.label, ...(ranked ? [row.rank ?? '—'] : []), ...data.columnAxis.items.map(column => {
      const cell = data.cells.find(cell => cell.rowId === row.id && cell.columnId === column.id)
      return cell ? getModuleTableWinner(cell.candidates)?.winners.map(winner => cleanLabel(winner.label)).join('＝') || '—' : '—'
    })])].map(row => row.join('\t')).join('\r\n')
}
