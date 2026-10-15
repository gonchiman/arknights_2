import { calculateSurtrDpsCalculation } from './surtrDpsCalculation.ts'
import {
  calculateSurtrTotalDamage,
  SURTR_TOTAL_DAMAGE_DEFAULT_ASSUMPTIONS,
  SURTR_TOTAL_DAMAGE_MAXIMUM_SAMPLES,
  SURTR_TOTAL_DAMAGE_MAXIMUM_TIME,
  type SurtrTotalDamageAssumptions,
  type SurtrTotalDamageModel,
  type SurtrTotalDamageResult,
} from './surtrTotalDamage.ts'

export type SurtrTotalDamageTableLayout = 'time' | 'module' | 'resistance'
export type SurtrTotalDamageTableDisplayMode = 'total' | 'winner'
export type SurtrTotalDamageWinnerColor = 'none' | 'module'

export interface SurtrTotalDamageTableComparison {
  id: string
  label: string
  color: string
  type?: 'X' | 'Y' | null
  level?: number
  model: SurtrTotalDamageModel
}

export interface SurtrTotalDamageTablePoint extends Omit<SurtrTotalDamageResult, 'attacks'> {
  time: number
  resistance: number
  seriesId: string
}

export interface SurtrTotalDamageTable {
  times: number[]
  resistances: number[]
  series: Pick<SurtrTotalDamageTableComparison, 'id' | 'label' | 'color' | 'type' | 'level'>[]
  /** Fixed time → resistance → module order, independent of the displayed layout. */
  points: SurtrTotalDamageTablePoint[]
  maximumTotalDamage: number
}

export const SURTR_TOTAL_DAMAGE_TABLE_MAXIMUM_CELLS = 50_000

/**
 * Compute all three dimensions once. Attack timing is independent of resistance,
 * so each module/time timeline is evaluated once and its hit counts are reused.
 * Per-hit damage retains the existing calculation and rounding for both phases.
 * Layout, display rounding and the color scale never alter the raw matrix.
 */
export function buildSurtrTotalDamageTable(
  comparisons: readonly SurtrTotalDamageTableComparison[],
  times: readonly number[],
  resistances: readonly number[],
  assumptions: SurtrTotalDamageAssumptions = SURTR_TOTAL_DAMAGE_DEFAULT_ASSUMPTIONS,
): SurtrTotalDamageTable | null {
  if (!comparisons.length || !times.length || times.length > SURTR_TOTAL_DAMAGE_MAXIMUM_SAMPLES
    || !resistances.length || resistances.length > 101
    || !increasing(times, value => Number.isFinite(value) && value >= 0 && value <= SURTR_TOTAL_DAMAGE_MAXIMUM_TIME)
    || !increasing(resistances, value => Number.isInteger(value) && value >= 0 && value <= 100)
    || comparisons.some(item => typeof item.id !== 'string' || !item.id.trim()
      || typeof item.label !== 'string' || typeof item.color !== 'string')
    || new Set(comparisons.map(item => item.id)).size !== comparisons.length
    || comparisons.length * times.length * resistances.length > SURTR_TOTAL_DAMAGE_TABLE_MAXIMUM_CELLS) return null

  const perHits = comparisons.map(item => resistances.map(resistance => {
    const before = calculateSurtrDpsCalculation(item.model.before, resistance)
    const after = calculateSurtrDpsCalculation(item.model.after, resistance)
    return before && after ? { before: before.perHit, after: after.perHit } : null
  }))
  if (perHits.some(values => values.some(value => value === null))) return null

  const points: SurtrTotalDamageTablePoint[] = []
  let maximumTotalDamage = 0
  for (const time of times) {
    const timelines = comparisons.map(item => calculateSurtrTotalDamage(item.model, time, resistances[0], assumptions,
      { includeAttacks: false }))
    if (timelines.some(value => value === null)) return null
    for (let resistanceIndex = 0; resistanceIndex < resistances.length; resistanceIndex += 1) {
      for (let seriesIndex = 0; seriesIndex < comparisons.length; seriesIndex += 1) {
        const timeline = timelines[seriesIndex]!
        const perHit = perHits[seriesIndex][resistanceIndex]!
        const damageBefore = timeline.hitsBefore * perHit.before
        const damageRemnant = timeline.hitsRemnant * perHit.after
        const totalDamage = damageBefore + damageRemnant
        if (!Number.isFinite(totalDamage)) return null
        const { attacks: _attacks, ...counts } = timeline
        points.push({ ...counts, time, resistance: resistances[resistanceIndex], seriesId: comparisons[seriesIndex].id,
          perHitBefore: perHit.before, perHitRemnant: perHit.after, damageBefore, damageRemnant, totalDamage })
        maximumTotalDamage = Math.max(maximumTotalDamage, totalDamage)
      }
    }
  }
  return { times: [...times], resistances: [...resistances],
    series: comparisons.map(({ id, label, color, type, level }) => ({ id, label, color,
      ...(type !== undefined ? { type } : {}), ...(level !== undefined ? { level } : {}) })), points, maximumTotalDamage }
}

export function getSurtrTotalDamageTablePoint(
  table: SurtrTotalDamageTable,
  timeIndex: number,
  resistanceIndex: number,
  seriesIndex: number,
): SurtrTotalDamageTablePoint | null {
  if (!validIndex(timeIndex, table.times.length) || !validIndex(resistanceIndex, table.resistances.length)
    || !validIndex(seriesIndex, table.series.length)) return null
  return table.points[(timeIndex * table.resistances.length + resistanceIndex) * table.series.length + seriesIndex] ?? null
}

/** Compare the raw matrix, allowing only floating-point roundoff when identifying ties. */
export function getSurtrTotalDamageTableWinners(
  table: SurtrTotalDamageTable,
  timeIndex: number,
  resistanceIndex: number,
): Array<{ series: SurtrTotalDamageTable['series'][number]; seriesIndex: number; point: SurtrTotalDamageTablePoint }> {
  if (!table.series.length || !validIndex(timeIndex, table.times.length)
    || !validIndex(resistanceIndex, table.resistances.length)) return []

  const candidates = []
  let maximum = -Infinity
  for (let seriesIndex = 0; seriesIndex < table.series.length; seriesIndex += 1) {
    const series = table.series[seriesIndex]
    const point = getSurtrTotalDamageTablePoint(table, timeIndex, resistanceIndex, seriesIndex)
    // An incomplete comparison must not nominate a winner from only its valid series.
    if (!point || !Number.isFinite(point.totalDamage) || point.totalDamage < 0
      || point.seriesId !== series.id || point.time !== table.times[timeIndex]
      || point.resistance !== table.resistances[resistanceIndex]) return []
    candidates.push({ series, seriesIndex, point })
    maximum = Math.max(maximum, point.totalDamage)
  }
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(maximum)) * 8
  return candidates.filter(candidate => maximum - candidate.point.totalDamage <= tolerance)
}

/** Keep module stages explicit, including when multiple stages share the maximum. */
export function formatSurtrTotalDamageWinnerLabel(
  series: readonly Pick<SurtrTotalDamageTableComparison, 'label'>[],
): string {
  return series.length ? series.map(item => item.label).join('＝') : '—'
}

/** Shorten only explicit module metadata, leaving unknown labels intact. */
export function getSurtrTotalDamageSeriesShortLabel(
  series: Pick<SurtrTotalDamageTableComparison, 'id' | 'label' | 'type' | 'level'>,
): string {
  if (series.id === 'none' || series.type === null) return '未装備'
  if ((series.type === 'X' || series.type === 'Y') && typeof series.level === 'number'
    && Number.isInteger(series.level) && series.level >= 1 && series.level <= 3) return `${series.type}${series.level}`
  return series.label
}

/** Compact table labels retain stages and include every tied winner. */
export function formatSurtrTotalDamageWinnerShortLabel(
  series: readonly Pick<SurtrTotalDamageTableComparison, 'id' | 'label' | 'type' | 'level'>[],
): string {
  return series.length ? series.map(getSurtrTotalDamageSeriesShortLabel).join('＝') : '—'
}

/** One value per spreadsheet cell, with the same order as the chosen display. */
export function buildSurtrTotalDamageTableTsv(
  table: SurtrTotalDamageTable,
  layout: SurtrTotalDamageTableLayout,
  decimalPlaces = 1,
  displayMode: SurtrTotalDamageTableDisplayMode = 'total',
): string {
  const timeHeading = '素質2発動まで（秒）'
  if (displayMode === 'winner') {
    const winner = (timeIndex: number, resistanceIndex: number) => cleanLabel(formatSurtrTotalDamageWinnerLabel(
      getSurtrTotalDamageTableWinners(table, timeIndex, resistanceIndex).map(candidate => candidate.series)))
    const rows = layout === 'time'
      ? [[timeHeading, ...table.resistances.map(resistance => `術耐性${resistance}`)],
        ...table.times.map((time, timeIndex) => [String(time),
          ...table.resistances.map((_, resistanceIndex) => winner(timeIndex, resistanceIndex))])]
      : [['術耐性', ...table.times.map(time => `${time}秒`)],
        ...table.resistances.map((resistance, resistanceIndex) => [String(resistance),
          ...table.times.map((_, timeIndex) => winner(timeIndex, resistanceIndex))])]
    return rows.map(row => row.join('\t')).join('\r\n')
  }
  const value = (time: number, resistance: number, series: number) =>
    formatSurtrTotalDamageTableValue(getSurtrTotalDamageTablePoint(table, time, resistance, series)?.totalDamage,
      decimalPlaces, false)
  const moduleHeading = 'MOD'
  let rows: string[][]
  if (layout === 'resistance') {
    rows = [['術耐性', ...table.times.flatMap(time => table.series.map(item =>
      `${time}秒 ${cleanLabel(item.label)}`))],
    ...table.resistances.map((resistance, resistanceIndex) => [String(resistance),
      ...table.times.flatMap((_, timeIndex) => table.series.map((_, seriesIndex) => value(timeIndex, resistanceIndex, seriesIndex)))])]
  } else if (layout === 'module') {
    rows = [[moduleHeading, timeHeading, ...table.resistances.map(resistance => `術耐性${resistance}`)],
      ...table.series.flatMap((item, seriesIndex) => table.times.map((time, timeIndex) =>
        [cleanLabel(item.label), String(time), ...table.resistances.map((_, resistanceIndex) => value(timeIndex, resistanceIndex, seriesIndex))]))]
  } else {
    rows = [[timeHeading, moduleHeading, ...table.resistances.map(resistance => `術耐性${resistance}`)],
      ...table.times.flatMap((time, timeIndex) => table.series.map((item, seriesIndex) =>
        [String(time), cleanLabel(item.label), ...table.resistances.map((_, resistanceIndex) => value(timeIndex, resistanceIndex, seriesIndex))]))]
  }
  return rows.map(row => row.join('\t')).join('\r\n')
}

/** Match existing S3 table display rounding; retain precision in the matrix. */
export function formatSurtrTotalDamageTableValue(value: number | null | undefined, decimalPlaces: number, grouping = true): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  const digits = Number.isInteger(decimalPlaces) && decimalPlaces >= 0 && decimalPlaces <= 3 ? decimalPlaces : 0
  const rounded = Number(value.toFixed(digits))
  return new Intl.NumberFormat('ja-JP', { useGrouping: grouping, minimumFractionDigits: digits, maximumFractionDigits: digits })
    .format(rounded === 0 ? 0 : rounded)
}

function increasing(values: readonly number[], valid: (value: number) => boolean): boolean {
  return values.every((value, index) => valid(value) && (index === 0 || value > values[index - 1]))
}

function validIndex(value: number, length: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < length
}

function cleanLabel(label: string): string {
  const clean = label.replace(/[\t\r\n]+/g, ' ').trim()
  return /^[=+\-@]/.test(clean) ? `'${clean}` : clean
}
