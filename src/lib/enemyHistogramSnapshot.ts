import { ENEMY_HISTOGRAM_COUNT_MODES, getWeightedEnemyHistogramImageFilename, type EnemyHistogramCountMode, type EnemyHistogramCounts } from './enemyHistogramCounts.ts'
import type { EnemyRatingHistogramBin } from './enemyRatingHistogram.ts'
import { getEnemyRatingNumericRanges } from './enemyStatRatings.ts'
import type { HistogramScale, NumericStatistics } from './enemyStatistics.ts'
import { copyEnemyLevelSelection, isEnemyLevelSelection, type EnemyLevelSelection } from './enemyLevelSelection.ts'
import { ENEMY_NUMERIC_FILTER_FIELDS, ENEMY_NUMERIC_FILTER_OPERATORS, parseEnemyNumericFilterValue, type EnemyNumericCondition } from './enemyNumericFilters.ts'

export const ENEMY_HISTOGRAM_SNAPSHOT_KEY = 'arknights-resistance-histogram-snapshot-v1'
export const ENEMY_HISTOGRAM_SNAPSHOT_EVENT = 'enemy-histogram-snapshot-changed'
type SnapshotStorage = Pick<Storage, 'getItem' | 'setItem'>

export interface EnemyHistogramEditorSettings {
  levelType: EnemyLevelSelection
  numericConditions: readonly EnemyNumericCondition[]
  linearBinWidthInput: string
  linearUpperBoundInput: string
  /** Preserve the exact cohort of a legacy snapshot whose original filters are unknown. */
  sourceEnemyIds?: readonly string[]
}

export interface EnemyHistogramSnapshotInput {
  metric: 'magicResistance'
  source: { scopeLabel: string; enemyIds: string[]; countGeneratedAt: string | null }
  countMode: EnemyHistogramCountMode
  coverage: EnemyHistogramCounts['summary'] | null
  scale: HistogramScale
  statistics: NumericStatistics
  ratingBins: EnemyRatingHistogramBin[] | null
  customLinearUpperBound: number | null
  showPercentages: boolean
  showBinRanges: boolean
  referenceVisibility: { mean: boolean; median: boolean }
  /** Optional so v1 snapshots captured before in-place editing remain usable. */
  editorSettings?: EnemyHistogramEditorSettings
}

/** Owns a deeply frozen copy of the calculated distribution and its display settings. */
export interface EnemyHistogramSnapshot extends EnemyHistogramSnapshotInput {
  schemaVersion: 1
  id: string
  title: string
  axisTitle: string
  conditions: string
  summary: string
  filename: string
}

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const nonnegative = (value: unknown): value is number => finite(value) && value >= 0
const nullableFinite = (value: unknown) => value === null || finite(value)
const shortString = (value: unknown): value is string => typeof value === 'string' && value.length <= 8_000
const nearlyEqual = (left: number, right: number) => Math.abs(left - right) <= Math.max(1, Math.abs(right)) * 1e-9

function validEditorSettings(value: unknown): value is EnemyHistogramEditorSettings {
  const settings = object(value)
  if (!settings || !isEnemyLevelSelection(settings.levelType)
    || !Array.isArray(settings.numericConditions) || settings.numericConditions.length > 200
    || !validHistogramInput(settings.linearBinWidthInput) || !validHistogramInput(settings.linearUpperBoundInput)) return false
  const conditionIds = new Set<number>()
  for (const value of settings.numericConditions) {
    const condition = object(value)
    if (!condition || !nonnegative(condition.id) || !Number.isSafeInteger(condition.id) || conditionIds.has(condition.id)
      || !ENEMY_NUMERIC_FILTER_FIELDS.some(({ key }) => key === condition.field)
      || !ENEMY_NUMERIC_FILTER_OPERATORS.some(({ key }) => key === condition.operator)
      || typeof condition.value !== 'string' || condition.value.length > 128
      || (condition.value.trim() !== '' && parseEnemyNumericFilterValue(condition.value) === null)) return false
    conditionIds.add(condition.id)
  }
  if (settings.sourceEnemyIds !== undefined) {
    if (!Array.isArray(settings.sourceEnemyIds) || !settings.sourceEnemyIds.length || settings.sourceEnemyIds.length > 50_000
      || !settings.sourceEnemyIds.every(id => shortString(id) && id.trim().length > 0)
      || new Set(settings.sourceEnemyIds).size !== settings.sourceEnemyIds.length) return false
  }
  return true
}

function validHistogramInput(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 128) return false
  if (value.trim() === '') return true
  const parsed = parseEnemyNumericFilterValue(value)
  return parsed !== null && parsed > 0
}

function copyEditorSettings(settings: EnemyHistogramEditorSettings | undefined): EnemyHistogramEditorSettings | undefined {
  if (!settings) return undefined
  return {
    levelType: copyEnemyLevelSelection(settings.levelType),
    numericConditions: settings.numericConditions.map(({ id, field, operator, value }) => ({ id, field, operator, value })),
    linearBinWidthInput: settings.linearBinWidthInput,
    linearUpperBoundInput: settings.linearUpperBoundInput,
    ...(settings.sourceEnemyIds === undefined ? {} : { sourceEnemyIds: [...settings.sourceEnemyIds] }),
  }
}

function validInput(value: unknown): value is EnemyHistogramSnapshotInput {
  const input = object(value)
  const source = object(input?.source)
  const stats = object(input?.statistics)
  const refs = object(input?.referenceVisibility)
  if (!input || input.metric !== 'magicResistance' || !source || !stats || !refs
    || !shortString(source.scopeLabel) || !source.scopeLabel.trim()
    || !Array.isArray(source.enemyIds) || !source.enemyIds.length || source.enemyIds.length > 50_000
    || !source.enemyIds.every(id => shortString(id) && id.length > 0)
    || !(source.countGeneratedAt === null || shortString(source.countGeneratedAt))
    || !ENEMY_HISTOGRAM_COUNT_MODES.some(({ key }) => key === input.countMode)
    || !['LINEAR', 'LOG'].includes(String(input.scale))
    || typeof input.showPercentages !== 'boolean' || typeof input.showBinRanges !== 'boolean'
    || typeof refs.mean !== 'boolean' || typeof refs.median !== 'boolean'
    || !(input.customLinearUpperBound === null || (finite(input.customLinearUpperBound) && input.customLinearUpperBound > 0))
    || !nonnegative(stats.totalCount) || !nonnegative(stats.missingCount) || !finite(stats.count) || stats.count <= 0
    || !nearlyEqual(stats.totalCount, stats.count + stats.missingCount)
    || !['minimum', 'firstQuartile', 'median', 'mean', 'thirdQuartile', 'maximum', 'standardDeviation'].every(key => finite(stats[key]))
    || Number(stats.maximum) < Number(stats.minimum) || Number(stats.standardDeviation) < 0
    || !Array.isArray(stats.bins) || !stats.bins.length || stats.bins.length > 1_000
    || (input.editorSettings !== undefined && !validEditorSettings(input.editorSettings))) return false

  let total = 0
  let previousEnd: number | undefined
  for (const value of stats.bins) {
    const bin = object(value)
    if (!bin || !finite(bin.start) || !finite(bin.end) || bin.end < bin.start || !nonnegative(bin.count)
      || typeof bin.includesMaximum !== 'boolean' || !(bin.isOverflow === undefined || typeof bin.isOverflow === 'boolean')
      || (previousEnd !== undefined && !nearlyEqual(bin.start, previousEnd))) return false
    total += bin.count
    previousEnd = bin.end
  }
  if (!nearlyEqual(total, stats.count)) return false
  const histogram = object(stats.histogram)
  if (!histogram || !['LINEAR', 'LOG'].includes(String(histogram.scale))
    || !(histogram.binWidth === null || (finite(histogram.binWidth) && histogram.binWidth > 0))
    || !finite(histogram.normalRangeStart) || !finite(histogram.normalRangeEnd)
    || histogram.normalRangeEnd < histogram.normalRangeStart
    || !Number.isSafeInteger(histogram.normalBinCount) || Number(histogram.normalBinCount) < 1
    || typeof histogram.hasOverflow !== 'boolean') return false

  if (input.coverage !== null) {
    const coverage = object(input.coverage)
    if (!coverage || !['mapCount', 'missingMapCount', 'spawnMapCount', 'spawnExcludedMapCount'].every(key =>
      nonnegative(coverage[key]) && Number.isSafeInteger(coverage[key]))
      || Number(coverage.spawnMapCount) + Number(coverage.spawnExcludedMapCount) !== coverage.mapCount) return false
  }
  if (input.countMode !== 'TYPES' && input.coverage === null) return false
  if (input.ratingBins !== null) {
    const ranges = getEnemyRatingNumericRanges('magicResistance')
    if (!Array.isArray(input.ratingBins) || input.ratingBins.length !== ranges.length) return false
    let ratingTotal = 0
    for (let index = 0; index < ranges.length; index += 1) {
      const bin = object(input.ratingBins[index])
      const range = ranges[index]
      if (!bin || !nonnegative(bin.count) || !nullableFinite(bin.lowerBound) || !nullableFinite(bin.upperBound)
        || !Object.entries(range).every(([key, entry]) => bin[key] === entry)) return false
      ratingTotal += bin.count
    }
    if (!nearlyEqual(ratingTotal, stats.count)) return false
  }
  return true
}

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const entry of Object.values(value)) freezeDeep(entry)
    Object.freeze(value)
  }
  return value
}

export function createEnemyHistogramSnapshot(input: EnemyHistogramSnapshotInput): EnemyHistogramSnapshot {
  if (!validInput(input)) throw new Error('術耐性の分布を登録できませんでした。')
  // Select only known fields. Parsing stored data cannot inject stale display text.
  const copy: EnemyHistogramSnapshotInput = JSON.parse(JSON.stringify({
    metric: input.metric, source: input.source, countMode: input.countMode,
    coverage: input.coverage, scale: input.scale, statistics: input.statistics,
    ratingBins: input.ratingBins, customLinearUpperBound: input.customLinearUpperBound,
    showPercentages: input.showPercentages, showBinRanges: input.showBinRanges,
    referenceVisibility: input.referenceVisibility,
    editorSettings: copyEditorSettings(input.editorSettings),
  }))
  const count = ENEMY_HISTOGRAM_COUNT_MODES.find(({ key }) => key === copy.countMode)!
  const format = (value: number) => value.toLocaleString('ja-JP', { maximumFractionDigits: 3 })
  const distribution = copy.ratingBins ? 'ゲーム内評価別'
    : copy.scale === 'LINEAR' && copy.statistics.histogram?.binWidth != null
      ? `階級幅 ${format(copy.statistics.histogram.binWidth)}` : `対数 · ${copy.statistics.bins.length}階級`
  const conditions = `${copy.source.scopeLabel} · ${count.label} ${format(copy.statistics.count)}${count.unit}`
  const summary = ['術耐性', conditions, distribution,
    copy.statistics.missingCount > 0 ? `値なし ${format(copy.statistics.missingCount)}${count.unit}を除外` : null,
  ].filter(Boolean).join(' · ')
  return freezeDeep({ ...copy, schemaVersion: 1,
    id: `resistance-histogram-${snapshotFingerprint(JSON.stringify(copy))}`,
    title: '術耐性のヒストグラム', axisTitle: `術耐性（${copy.ratingBins ? 'ゲーム内評価' : '階級'}）`,
    conditions, summary,
    filename: getWeightedEnemyHistogramImageFilename({ mode: copy.countMode, metric: '術耐性', scope: copy.source.scopeLabel,
      scale: copy.scale, statistics: copy.statistics, customLinearUpperBound: copy.customLinearUpperBound,
      referenceVisibility: copy.referenceVisibility, showPercentages: copy.showPercentages,
      showBinRanges: copy.showBinRanges, useRatingBins: copy.ratingBins !== null, coverage: copy.coverage }),
  })
}

function snapshotFingerprint(text: string): string {
  let hash = 0xcbf29ce484222325n
  for (let index = 0; index < text.length; index += 1) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(text.charCodeAt(index))) * 0x100000001b3n)
  }
  return hash.toString(16).padStart(16, '0')
}

export function parseEnemyHistogramSnapshot(value: unknown): EnemyHistogramSnapshot | null {
  if (object(value)?.schemaVersion !== 1 || !validInput(value)) return null
  return createEnemyHistogramSnapshot(value)
}

function sessionStorageOrUndefined(): SnapshotStorage | undefined {
  try { return typeof window === 'undefined' ? undefined : window.sessionStorage } catch { return undefined }
}

export function readEnemyHistogramSnapshot(storage = sessionStorageOrUndefined()): EnemyHistogramSnapshot | null {
  try {
    const stored = storage?.getItem(ENEMY_HISTOGRAM_SNAPSHOT_KEY)
    return stored ? parseEnemyHistogramSnapshot(JSON.parse(stored)) : null
  } catch { return null }
}

export function writeEnemyHistogramSnapshot(snapshot: EnemyHistogramSnapshot, storage = sessionStorageOrUndefined()): boolean {
  try {
    const validated = parseEnemyHistogramSnapshot(snapshot)
    if (!storage || !validated) return false
    storage.setItem(ENEMY_HISTOGRAM_SNAPSHOT_KEY, JSON.stringify(validated))
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(ENEMY_HISTOGRAM_SNAPSHOT_EVENT))
    return true
  } catch { return false }
}
