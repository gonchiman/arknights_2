import type { ResistanceComparisonSeries } from './goldenglowResistanceComparison.ts'
import { getSurtrDpsResistanceRating } from './surtrDpsResistance.ts'
import { getEnemyStatRating } from './enemyStatRatings.ts'
import { getModuleComparisonColors } from './moduleColors.ts'
import { getModuleTableWinner, type ModuleTableWinnerCandidate } from './moduleTableWinner.ts'
import { getSurtrUnequippedColorScaleMaximum } from './surtrUnequippedColorScale.ts'
import {
  buildSurtrUnequippedComparisonSeries,
  formatSurtrUnequippedComparisonValue,
  getSurtrPreviousStageId,
} from './surtrUnequippedComparison.ts'

export type GgTableMetric = 'difference' | 'ratio' | 'percent'
export type GgTableLayout = 'total' | 'comparison' | 'combined' | 'winner'
export type GgTableColorScale = 'NONE' | 'LINEAR' | 'SQRT'
export type GgTableRankMode = 'none' | 'inline' | 'merged'
export type GgTableImageLayout = 'current' | 'transpose' | 'stacked' | 'split'
export interface GgTableBaseline { kind: 'unequipped' | 'previous' | 'selected'; id?: string }
export interface GgTableBuild {
  id: string
  label: string
  moduleId: string
  moduleType: string | null | undefined
  moduleLevel: number
}
export interface GgTableData {
  builds: readonly GgTableBuild[]
  /** Includes independent reference series even when their columns are hidden. */
  series: readonly ResistanceComparisonSeries[]
  hps: readonly number[]
  resistances: readonly number[]
  baseline: GgTableBaseline
  metric: GgTableMetric
  layout: GgTableLayout
  precision: number
  showRanks: boolean
  colorScale: GgTableColorScale
  rankMode?: GgTableRankMode
  winnerColor?: 'module' | 'none'
  winnerGapShading?: boolean
  /** Keep one scale across HP or stage panels. */
  colorScaleMaximum?: number
}
export interface GgTableCell {
  hp: number
  buildId: string
  total: number | null
  comparison: number | null
}
export interface GgTableRow {
  resistance: number
  rank: ReturnType<typeof getSurtrDpsResistanceRating>
  cells: GgTableCell[]
}

export function getGgTableBaselineId(build: GgTableBuild, baseline: GgTableBaseline): string | null {
  if (baseline.kind === 'unequipped') return 'none'
  if (baseline.kind === 'selected') return baseline.id?.trim() || null
  return getSurtrPreviousStageId(`${build.moduleId}:lv${build.moduleLevel}`)
}

/** Keep selected columns in their input order; hide comparison reference columns only in the compact view. */
export function getGgTableTargets(data: GgTableData): GgTableBuild[] {
  return data.builds.filter(build => data.layout !== 'comparison'
    || (build.id !== 'none' && !(data.baseline.kind === 'selected' && build.id === data.baseline.id)))
}

/** Match both HP and RES exactly, using authoritative expectedDamage without subtracting overkill. */
export function buildGgTableRows(data: GgTableData): GgTableRow[] {
  const targets = getGgTableTargets(data)
  const inputs = new Map(data.series.map(item => [item.id, item]))
  const values = new Map<string, Map<number, Map<number, number | null>>>()
  for (const item of data.series) {
    const hps = new Map<number, Map<number, number | null>>()
    for (const point of item.points) {
      if (!hps.has(point.enemyHp)) hps.set(point.enemyHp, new Map())
      hps.get(point.enemyHp)!.set(point.enemyResistance, finiteValue(point.expectedDamage))
    }
    values.set(item.id, hps)
  }
  const comparisons = new Map<string, Map<number, Map<number, number | null>>>()
  for (const build of targets) {
    if (build.id === 'none' || data.layout === 'total') continue
    const referenceId = getGgTableBaselineId(build, data.baseline)
    const reference = referenceId === null ? undefined : inputs.get(referenceId)
    const hpValues = new Map<number, Map<number, number | null>>()
    for (const hp of data.hps) {
      const points = data.resistances.map(resistance => ({ x: resistance, value: values.get(build.id)?.get(hp)?.get(resistance) ?? null }))
      // The existing comparison helper centralizes zero-baseline, finite-value and raw-precision rules.
      const result = buildSurtrUnequippedComparisonSeries(
        [{ id: build.id, label: build.label, color: '', points }],
        reference ? { id: reference.id, label: reference.label, color: '', points: data.resistances.map(resistance => ({
          x: resistance, value: values.get(reference.id)?.get(hp)?.get(resistance) ?? null,
        })) } : null,
        data.metric,
      )
      hpValues.set(hp, new Map(result[0]?.points.map(point => [point.x, point.value])))
    }
    comparisons.set(build.id, hpValues)
  }
  return data.resistances.map(resistance => ({
    resistance,
    rank: getSurtrDpsResistanceRating(resistance),
    cells: data.hps.flatMap(hp => targets.map(build => ({
      hp,
      buildId: build.id,
      total: values.get(build.id)?.get(hp)?.get(resistance) ?? null,
      comparison: comparisons.get(build.id)?.get(hp)?.get(resistance) ?? null,
    }))),
  }))
}

/** Display rounding stays independent from simulation and comparison arithmetic. */
export function formatGgTableValue(value: number | null | undefined, metric: GgTableMetric | 'total', precision: number, grouping = true): string {
  if (metric !== 'total') return formatSurtrUnequippedComparisonValue(value, metric, precision, grouping)
  if (finiteValue(value) === null) return '—'
  const digits = Number.isInteger(precision) && precision >= 0 && precision <= 3 ? precision : 0
  const rounded = Number(value!.toFixed(digits))
  return new Intl.NumberFormat('ja-JP', { useGrouping: grouping, minimumFractionDigits: digits, maximumFractionDigits: digits })
    .format(rounded === 0 ? 0 : rounded)
}

export function getGgTableTsv(data: GgTableData): string {
  if (data.layout === 'winner') {
    const matrix = buildGgTableWinnerMatrix(data)
    return [['術耐性', ...data.hps.map(hp => `敵HP ${hp} 最大のMOD`)], ...data.resistances.map(resistance => [String(resistance),
      ...data.hps.map(hp => {
        const candidates = matrix.cells.find(cell => cell.rowId === String(resistance) && cell.columnId === String(hp))?.candidates ?? []
        return getModuleTableWinner(candidates)?.winners.map(build => cleanLabel(build.label)).join('＝') || '—'
      }),
    ])].map(row => row.join('\t')).join('\r\n')
  }
  const builds = getGgTableTargets(data)
  const buildLabels = new Map(builds.map(build => [build.id, cleanLabel(build.label)]))
  const baseLabel = data.baseline.kind === 'previous' ? '前段階' : data.baseline.kind === 'unequipped' ? '未装備'
    : cleanLabel(data.builds.find(build => build.id === data.baseline.id)?.label
      ?? data.series.find(item => item.id === data.baseline.id)?.label ?? '選択した基準')
  const comparisonLabel = data.metric === 'difference' ? `${baseLabel}とのダメージ差`
    : data.metric === 'ratio' ? `${baseLabel}に対する比率（%）` : `${baseLabel}からの増加率（%）`
  const header = [...(data.showRanks ? ['術耐性ランク'] : []), '術耐性', ...data.hps.flatMap(hp => builds.flatMap(build => {
    const prefix = `敵HP ${hp} ${buildLabels.get(build.id)}`
    const rawOnly = data.layout === 'total' || (data.layout === 'combined' && build.id === 'none')
    if (rawOnly) return [`${prefix} 総ダメージ期待値`]
    const referenceId = getGgTableBaselineId(build, data.baseline)
    const referenceLabel = data.series.find(item => item.id === referenceId)?.label ?? referenceId ?? '—'
    const referenceSuffix = data.baseline.kind === 'previous' ? `（基準：${cleanLabel(referenceLabel)}）` : ''
    return [...(data.layout === 'combined' ? [`${prefix} 総ダメージ期待値`] : []), `${prefix} ${comparisonLabel}${referenceSuffix}`]
  }))]
  const rows = buildGgTableRows(data).map(row => [...(data.showRanks ? [row.rank?.rating ?? '—'] : []), String(row.resistance),
    ...row.cells.flatMap(cell => {
      if (data.layout === 'total' || (data.layout === 'combined' && cell.buildId === 'none')) {
        return [formatGgTableValue(cell.total, 'total', data.precision, false)]
      }
      return [...(data.layout === 'combined' ? [formatGgTableValue(cell.total, 'total', data.precision, false)] : []),
        formatGgTableValue(cell.comparison, data.metric, data.precision, false)]
    }),
  ])
  return [header, ...rows].map(row => row.join('\t')).join('\r\n')
}

export function getGgTableTitle(data: GgTableData): string {
  if (data.layout === 'winner') return 'ゴールデングロー スキル総ダメージ期待値が最大のMOD'
  if (data.layout === 'total') return 'ゴールデングロー スキル総ダメージ期待値'
  const modules = new Map<string, Set<number>>()
  for (const build of getGgTableTargets(data)) {
    if (build.id === 'none') continue
    if (!modules.has(build.moduleId)) modules.set(build.moduleId, new Set())
    modules.get(build.moduleId)!.add(build.moduleLevel)
  }
  const stages = data.baseline.kind === 'previous' || [...modules.values()].some(levels => levels.size > 1)
  const dimensions = stages ? modules.size > 1 ? 'MOD・段階比較' : 'MOD段階比較' : 'MOD比較'
  const metric = data.metric === 'difference' ? '総ダメージ差' : data.metric === 'ratio' ? '基準比' : '増加率'
  const quantity = data.layout === 'combined' ? `総ダメージ＋${metric}` : metric
  const baseline = data.baseline.kind === 'previous' ? '前段階' : data.baseline.kind === 'unequipped' ? '未装備'
    : data.builds.find(build => build.id === data.baseline.id)?.label
      ?? data.series.find(item => item.id === data.baseline.id)?.label ?? '指定MOD'
  return `ゴールデングロー ${dimensions}（${quantity}・${baseline}基準）`
}

export function getGgTableRankMode(data: GgTableData): GgTableRankMode {
  return data.rankMode ?? (data.showRanks ? 'inline' : 'none')
}

/** Compare selected builds only; hidden baselines remain references, never candidates. */
export function buildGgTableWinnerMatrix(data: GgTableData) {
  const colors = getModuleComparisonColors(data.builds, { shadeBy: 'moduleLevel' })
  const values = new Map(data.series.map(series => [series.id,
    new Map(series.points.map(point => [`${point.enemyHp}:${point.enemyResistance}`, finiteValue(point.expectedDamage)]))]))
  return {
    rowAxis: { label: '術耐性', rankLabel: '術耐性ランク', items: data.resistances.map(resistance => {
      const rank = getSurtrDpsResistanceRating(resistance)
      return { id: String(resistance), label: String(resistance), rank: rank?.rating, rankTitle: rank?.label }
    }) },
    columnAxis: { label: '敵HP', rankLabel: 'HPランク', items: data.hps.map(hp => ({
      id: String(hp), label: hp.toLocaleString('ja-JP'), rank: getEnemyStatRating('maxHp', hp) ?? undefined,
    })) },
    cells: data.resistances.flatMap(resistance => data.hps.map(hp => ({
      rowId: String(resistance), columnId: String(hp), candidates: data.builds.map((build, index): ModuleTableWinnerCandidate => ({
        id: build.id, label: build.label,
        shortLabel: build.id === 'none' ? '未装備' : build.moduleType ? `${build.moduleType}${build.moduleLevel}` : build.label,
        moduleType: build.moduleType, moduleLevel: build.moduleLevel, color: colors[index],
        value: values.get(build.id)?.get(`${hp}:${resistance}`) ?? null,
      })),
    }))),
  }
}

export function getGgTableImageStageLevels(data: GgTableData): number[] {
  return [...new Set(data.builds.filter(build => build.id !== 'none').map(build => build.moduleLevel))]
    .filter(level => [1, 2, 3].includes(level)).sort((a, b) => a - b)
}

export function getGgTableColorScaleMaximum(data: GgTableData): number {
  return data.colorScaleMaximum ?? getSurtrUnequippedColorScaleMaximum(buildGgTableRows(data).flatMap(row => row.cells.map(cell => cell.comparison)), data.metric)
}

/** Filter visible stages while preserving every independently calculated reference. */
export function getGgTableStageData(data: GgTableData, level: number): GgTableData {
  if (!getGgTableImageStageLevels(data).includes(level)) throw new Error('選択中のMODにこの段階はありません。')
  return { ...data, colorScaleMaximum: getGgTableColorScaleMaximum(data),
    builds: data.builds.filter(build => build.id === 'none' || build.moduleLevel === level) }
}

function finiteValue(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function cleanLabel(label: string): string {
  const clean = label.replace(/[\t\r\n]+/g, ' ').trim()
  return /^[=+\-@]/.test(clean) ? `'${clean}` : clean
}
