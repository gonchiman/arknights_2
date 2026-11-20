import type { EnemyStats } from '../types/enemy.ts'
import type { HistogramScale } from './enemyStatistics.ts'

export type EnemyStatKey = keyof Pick<
  EnemyStats,
  'maxHp' | 'attack' | 'defense' | 'magicResistance' | 'moveSpeed' | 'baseAttackTime' | 'massLevel'
>

export type EnemyAnalyzedStatKey = EnemyStatKey | 'stageAppearanceCount'

export interface EnemyStatMetric<Key extends EnemyAnalyzedStatKey = EnemyAnalyzedStatKey> {
  key: Key
  label: string
  axisLabel: string
  suffix: string
  valueDigits: number
  summaryDigits: number
  logBinCount: number
  minimumLinearBinWidth: number
  defaultScale: HistogramScale
}

/** Base status definitions shared by enemy statistics and chart data providers. */
export const ENEMY_STAT_METRICS: readonly EnemyStatMetric<EnemyStatKey>[] = [
  { key: 'maxHp', label: 'HP', axisLabel: 'HP', suffix: '', valueDigits: 0, summaryDigits: 1, logBinCount: 12, minimumLinearBinWidth: 1, defaultScale: 'LINEAR' },
  { key: 'attack', label: '攻撃力', axisLabel: '攻撃力', suffix: '', valueDigits: 0, summaryDigits: 1, logBinCount: 12, minimumLinearBinWidth: 1, defaultScale: 'LINEAR' },
  { key: 'defense', label: '防御力', axisLabel: '防御力', suffix: '', valueDigits: 0, summaryDigits: 1, logBinCount: 12, minimumLinearBinWidth: 1, defaultScale: 'LINEAR' },
  { key: 'magicResistance', label: '術耐性', axisLabel: '術耐性', suffix: '', valueDigits: 0, summaryDigits: 1, logBinCount: 10, minimumLinearBinWidth: 1, defaultScale: 'LINEAR' },
  { key: 'moveSpeed', label: '移動速度', axisLabel: '移動速度', suffix: '', valueDigits: 2, summaryDigits: 2, logBinCount: 10, minimumLinearBinWidth: 0.01, defaultScale: 'LINEAR' },
  { key: 'baseAttackTime', label: '攻撃間隔', axisLabel: '攻撃間隔（秒）', suffix: '秒', valueDigits: 2, summaryDigits: 2, logBinCount: 10, minimumLinearBinWidth: 0.01, defaultScale: 'LINEAR' },
  { key: 'massLevel', label: '重量', axisLabel: '重量', suffix: '', valueDigits: 0, summaryDigits: 2, logBinCount: 10, minimumLinearBinWidth: 1, defaultScale: 'LINEAR' },
]

/** Statistics also exposes this derived measure after the seven base statuses. */
export const ENEMY_ANALYSIS_METRICS: readonly EnemyStatMetric[] = [
  ...ENEMY_STAT_METRICS,
  { key: 'stageAppearanceCount', label: '登場ステージ数', axisLabel: '登場ステージ数', suffix: '', valueDigits: 0, summaryDigits: 2, logBinCount: 10, minimumLinearBinWidth: 1, defaultScale: 'LINEAR' },
]
