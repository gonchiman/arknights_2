import { createChartImageFilename, withChartImageAspect } from './chartImageFilename.ts'
import { ENEMY_HISTOGRAM_COUNT_MODES } from './enemyHistogramCounts.ts'
import type { EnemyBoxplotRange, EnemyBoxplotScale } from './enemyBoxplotComparison.ts'
import {
  createEnemyBoxplotComparisonImageSnapshot,
  ENEMY_BOXPLOT_IMAGE_TITLE,
  type EnemyBoxplotComparisonImageSnapshot,
} from './enemyBoxplotImage.ts'

export const ENEMY_BOXPLOT_IMAGE_SCALE_OPTIONS = [
  { key: 'RAW', label: '元の値' },
  { key: 'MEDIAN', label: '中央値＝1' },
] as const

export const ENEMY_BOXPLOT_IMAGE_RANGE_OPTIONS = [
  { key: 'ALL', label: '全範囲' },
  { key: 'WHISKERS', label: '箱とひげ' },
] as const

export const ENEMY_BOXPLOT_IMAGE_OUTLIER_OPTIONS = [
  { key: true, label: 'あり' },
  { key: false, label: 'なし' },
] as const

export interface EnemyBoxplotImageSelection {
  scales: readonly EnemyBoxplotScale[]
  ranges: readonly EnemyBoxplotRange[]
  outlierInfo: readonly boolean[]
}

export interface EnemyBoxplotImageVariant {
  key: string
  label: string
  snapshot: EnemyBoxplotComparisonImageSnapshot
}

function freezeDeep<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child)
    Object.freeze(value)
  }
  return value
}

/** Copy the source once, then keep every selected output independent of live state and its peers. */
export function buildEnemyBoxplotImageVariants(
  snapshot: EnemyBoxplotComparisonImageSnapshot,
  selection: EnemyBoxplotImageSelection,
): EnemyBoxplotImageVariant[] {
  const source = freezeDeep(createEnemyBoxplotComparisonImageSnapshot(snapshot))
  return ENEMY_BOXPLOT_IMAGE_SCALE_OPTIONS.filter(({ key }) => selection.scales.includes(key))
    .flatMap(({ key: scale, label: scaleLabel }) =>
      ENEMY_BOXPLOT_IMAGE_RANGE_OPTIONS.filter(({ key }) => selection.ranges.includes(key))
        .flatMap(({ key: range, label: rangeLabel }) =>
          ENEMY_BOXPLOT_IMAGE_OUTLIER_OPTIONS.filter(({ key }) => selection.outlierInfo.includes(key))
            .map(({ key: showOutlierInfo, label: outlierLabel }) => Object.freeze({
              key: `${scale}-${range}-${showOutlierInfo ? 'with-outliers' : 'without-outliers'}`,
              label: `${scaleLabel} ／ ${rangeLabel} ／ 外れ値情報${outlierLabel}`,
              snapshot: freezeDeep(createEnemyBoxplotComparisonImageSnapshot({ ...source, scale, range, showOutlierInfo })),
            }))))
}

function sourceNameParts(snapshot: EnemyBoxplotComparisonImageSnapshot) {
  return [
    snapshot.aggregationVersion && `集計${snapshot.aggregationVersion.id}`,
    ENEMY_BOXPLOT_IMAGE_TITLE,
    ENEMY_HISTOGRAM_COUNT_MODES.find(({ key }) => key === snapshot.countMode)!.label,
    snapshot.scopeLabel,
  ]
}

function filenameWithConditions(snapshot: EnemyBoxplotComparisonImageSnapshot, conditions: string[], aspectRatio?: number): string {
  const ordinaryOrder = withChartImageAspect(createChartImageFilename('敵', [
    ...sourceNameParts(snapshot), ...conditions,
  ]), aspectRatio)
  if (ordinaryOrder.includes(`_${conditions.join('_')}_比率`)) return ordinaryOrder
  // Long scope names must not truncate different selections into indistinguishable names.
  return withChartImageAspect(createChartImageFilename('敵', [
    ...conditions, ...sourceNameParts(snapshot),
  ]), aspectRatio)
}

/** Unlike ordinary one-image names, batch entries explicitly distinguish both outlier states. */
export function getEnemyBoxplotVariantFilename(
  snapshot: EnemyBoxplotComparisonImageSnapshot,
  aspectRatio?: number,
): string {
  const conditions = [
    ENEMY_BOXPLOT_IMAGE_SCALE_OPTIONS.find(({ key }) => key === snapshot.scale)!.label,
    ENEMY_BOXPLOT_IMAGE_RANGE_OPTIONS.find(({ key }) => key === snapshot.range)!.label,
    `外れ値情報${snapshot.showOutlierInfo !== false ? 'あり' : 'なし'}`,
  ]
  return filenameWithConditions(snapshot, conditions, aspectRatio)
}

export function getEnemyBoxplotArchiveFilename(
  source: EnemyBoxplotComparisonImageSnapshot,
  variants: readonly EnemyBoxplotImageVariant[],
  aspectRatio?: number,
): string {
  const scales = ENEMY_BOXPLOT_IMAGE_SCALE_OPTIONS.filter(({ key }) => variants.some(({ snapshot }) => snapshot.scale === key))
    .map(({ label }) => label).join('・')
  const ranges = ENEMY_BOXPLOT_IMAGE_RANGE_OPTIONS.filter(({ key }) => variants.some(({ snapshot }) => snapshot.range === key))
    .map(({ label }) => label).join('・')
  const outliers = ENEMY_BOXPLOT_IMAGE_OUTLIER_OPTIONS.filter(({ key }) => variants.some(({ snapshot }) => (snapshot.showOutlierInfo !== false) === key))
    .map(({ label }) => label).join('・')
  return filenameWithConditions(source, [
    `${variants.length}枚`, scales, ranges, outliers && `外れ値情報${outliers}`,
  ].filter(Boolean), aspectRatio).replace(/\.png$/i, '.zip')
}
