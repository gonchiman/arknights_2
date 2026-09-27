export type EnemyHeatmapColorScale = 'LINEAR' | 'SQRT'

/** Change only the color intensity; the heatmap's counts and proportions stay intact. */
export function getEnemyHeatmapOpacity(
  count: number,
  maximum: number,
  scale: EnemyHeatmapColorScale = 'LINEAR',
): number {
  if (!Number.isFinite(count) || !Number.isFinite(maximum) || count <= 0 || maximum <= 0) return 0
  const ratio = Math.min(1, count / maximum)
  return (scale === 'SQRT' ? Math.sqrt(ratio) : ratio) * 0.4
}
