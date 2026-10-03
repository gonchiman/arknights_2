import type { EnemyThresholdDistribution } from './enemyThresholdDistribution.ts'

/** Keep the threshold meaning identical across pie charts and stacked bars. */
export const ENEMY_THRESHOLD_BUCKET_COLORS: Record<EnemyThresholdDistribution['buckets'][number]['key'], string> = {
  BELOW: '#6b96a9',
  EQUAL: '#aeb4bb',
  ABOVE: '#9a819f',
}
