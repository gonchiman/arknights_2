export type EnemyThresholdBarLayout = 'AXIS' | 'RIGHT'

export const ENEMY_THRESHOLD_BAR_LAYOUTS: ReadonlyArray<{ key: EnemyThresholdBarLayout; label: string }> = [
  { key: 'AXIS', label: '共通軸' },
  { key: 'RIGHT', label: '数値を右側' },
]
