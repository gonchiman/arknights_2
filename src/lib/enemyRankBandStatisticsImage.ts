import type { EnemyRankBandMetric, EnemyStandardizedRankBandStatistics } from './enemyRankBandStatistics.ts'
import { ENEMY_RANK_BAND_METRIC_LABELS } from './enemyRankBandStatisticsDisplay.ts'
import { createChartImageFilename, withChartImageAspect } from './chartImageFilename.ts'

export interface EnemyRankBandStatisticsChartSnapshot {
  bands: readonly EnemyStandardizedRankBandStatistics[]
  metric: EnemyRankBandMetric
  step: number
  conditions: readonly string[]
  filenameConditions: readonly string[]
  stepBands?: readonly { step: 5 | 10 | 20; bands: readonly EnemyStandardizedRankBandStatistics[] }[]
}

export const ENEMY_RANK_BAND_IMAGE_METRIC_OPTIONS = ([
  'standardDeviation', 'width', 'mean', 'variance',
] as const).map(key => ({ key, label: ENEMY_RANK_BAND_METRIC_LABELS[key] }))

export const ENEMY_RANK_BAND_IMAGE_STEP_OPTIONS = ([5, 10, 20] as const)
  .map(key => ({ key, label: `${key}ポイント` }))

export interface EnemyRankBandImageSelection {
  metrics: readonly EnemyRankBandMetric[]
  steps: readonly number[]
}

export interface EnemyRankBandImageVariant {
  key: string
  label: string
  snapshot: EnemyRankBandStatisticsChartSnapshot
}

function freezeDeep<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child)
    Object.freeze(value)
  }
  return value
}

function copyBands(bands: readonly EnemyStandardizedRankBandStatistics[]): EnemyStandardizedRankBandStatistics[] {
  return bands.map(band => ({ ...band,
    defense: band.defense ? { ...band.defense } : null,
    resistance: band.resistance ? { ...band.resistance } : null,
  }))
}

/** Keep saved conditions and all provided resolutions independent of the live panel. */
export function createEnemyRankBandStatisticsChartSnapshot(
  snapshot: EnemyRankBandStatisticsChartSnapshot,
): EnemyRankBandStatisticsChartSnapshot {
  return freezeDeep({
    ...snapshot,
    bands: copyBands(snapshot.bands),
    conditions: [...snapshot.conditions],
    filenameConditions: [...snapshot.filenameConditions],
    ...(snapshot.stepBands ? { stepBands: snapshot.stepBands.map(({ step, bands }) => ({ step, bands: copyBands(bands) })) } : {}),
  })
}

function metricConditions(conditions: readonly string[], hasVariance: boolean): string[] {
  const common = conditions.filter(value => value !== '母分散')
  return [...new Set([...common, ...(hasVariance ? ['母分散'] : [])])]
}

function usesVariance(metric: EnemyRankBandMetric): boolean {
  return metric === 'standardDeviation' || metric === 'variance'
}

/** Use actual precomputed bands; a different resolution cannot be inferred from current-band summaries. */
export function buildEnemyRankBandImageVariants(
  snapshot: EnemyRankBandStatisticsChartSnapshot,
  selection: EnemyRankBandImageSelection,
): EnemyRankBandImageVariant[] {
  const source = createEnemyRankBandStatisticsChartSnapshot(snapshot)
  const resolutions = new Map<number, readonly EnemyStandardizedRankBandStatistics[]>(
    source.stepBands?.map(({ step, bands }) => [step, bands]),
  )
  resolutions.set(source.step, source.bands)
  return ENEMY_RANK_BAND_IMAGE_METRIC_OPTIONS.filter(({ key }) => selection.metrics.includes(key))
    .flatMap(({ key: metric, label }) => ENEMY_RANK_BAND_IMAGE_STEP_OPTIONS
      .filter(({ key }) => selection.steps.includes(key) && (resolutions.get(key)?.length ?? 0) > 0)
      .map(({ key: step }) => Object.freeze({
        key: `${metric}-${step}`,
        label: `${label} ／ ${step}ポイント`,
        snapshot: createEnemyRankBandStatisticsChartSnapshot({
          ...source, metric, step, bands: resolutions.get(step)!,
          conditions: metricConditions(source.conditions, usesVariance(metric)),
          filenameConditions: metricConditions(source.filenameConditions, usesVariance(metric)),
        }),
      })))
}

/** Batch names preserve the discriminating metric and resolution even when the shared scope is long. */
export function getEnemyRankBandVariantFilename(
  snapshot: EnemyRankBandStatisticsChartSnapshot,
  aspectRatio?: number,
): string {
  const title = `防御力・術耐性の順位帯別${ENEMY_RANK_BAND_METRIC_LABELS[snapshot.metric]}`
  const step = `順位帯${snapshot.step}ポイント`
  const conditions = metricConditions(snapshot.filenameConditions, usesVariance(snapshot.metric))
  const filename = withChartImageAspect(createChartImageFilename(title, [...conditions, step]), aspectRatio)
  if (filename.includes(`_${step}_比率`)) return filename
  return withChartImageAspect(createChartImageFilename(title, [step, ...conditions]), aspectRatio)
}

export function getEnemyRankBandArchiveFilename(
  source: EnemyRankBandStatisticsChartSnapshot,
  variants: readonly EnemyRankBandImageVariant[],
  aspectRatio?: number,
): string {
  const metrics = ENEMY_RANK_BAND_IMAGE_METRIC_OPTIONS.filter(({ key }) => variants.some(({ snapshot }) => snapshot.metric === key))
    .map(({ label }) => label).join('・')
  const steps = ENEMY_RANK_BAND_IMAGE_STEP_OPTIONS.filter(({ key }) => variants.some(({ snapshot }) => snapshot.step === key))
    .map(({ key }) => key).join('・')
  const conditions = metricConditions(source.filenameConditions, variants.some(({ snapshot }) => usesVariance(snapshot.metric)))
  // The selection summary precedes potentially long common conditions so ZIP names still identify the outputs.
  return withChartImageAspect(createChartImageFilename('防御力・術耐性の順位帯統計', [
    `${variants.length}枚`, metrics, steps && `順位帯${steps}ポイント`, ...conditions,
  ]), aspectRatio).replace(/\.png$/i, '.zip')
}
