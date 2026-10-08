import { createChartImageFilename } from './chartImageFilename.ts'

export type MainEnemyTrendMetric = 'hp' | 'atk' | 'def' | 'res'
export type MainEnemyTrendKind = 'line' | 'bar'

export const MAIN_ENEMY_TREND_METRIC_LABELS: Record<MainEnemyTrendMetric, string> = {
  hp: 'HP', atk: '攻撃力', def: '防御力', res: '術耐性',
}

export interface MainEnemyTrendImageFilenameOptions {
  metric: MainEnemyTrendMetric
  chapterRange: readonly [number, number]
  enemyKind: string
  weighting: string
  kind: MainEnemyTrendKind
  showMean?: boolean
  showMedian?: boolean
}

/** The caller adds the chosen aspect ratio to this readable snapshot name. */
export function createMainEnemyTrendImageFilename({ metric, chapterRange, enemyKind, weighting, kind,
  showMean = true, showMedian = true }: MainEnemyTrendImageFilenameOptions): string {
  const [first, last] = chapterRange
  if (![first, last].every(value => Number.isSafeInteger(value) && value >= 0) || first > last) {
    throw new RangeError('Chapter range must contain ordered nonnegative integers')
  }
  const enemyLabels: Record<string, string> = { ALL: '全敵', NORMAL: '通常', ELITE: 'エリート', BOSS: 'ボス' }
  const weightingLabels: Record<string, string> = { TYPES: '種類数', MAPS: '登場マップ数', SPAWNS: '出現回数' }
  const series = [showMean && '平均', showMedian && '中央値'].filter(Boolean).join('-')
  return createChartImageFilename(`メインテーマ_敵_${MAIN_ENEMY_TREND_METRIC_LABELS[metric]}推移`, [
    first === last ? `${first}章` : `${first}-${last}章`,
    enemyLabels[enemyKind.toUpperCase()] ?? enemyKind,
    weightingLabels[weighting.toUpperCase()] ?? weighting,
    kind === 'line' ? '折れ線' : '集合棒', series || '系列なし',
  ])
}
