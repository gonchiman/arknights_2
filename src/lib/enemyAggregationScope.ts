/** Official activity types kept separate from ordinary event battles in V8+. */
export const SPECIAL_ACTIVITY_LABELS = {
  MULTIPLAY_V3: '協心競技',
  MULTIPLAY_VERIFY2: '協心競技',
  BOSS_RUSH: '導灯の試練',
  VEC_BREAK: '鋒矢突破',
  VEC_BREAK_V2: '鋒矢突破',
  AUTOCHESS_SEASON: '堅守協定',
  AUTOCHESS_VERIFY1: '堅守協定',
  ENEMY_DUEL: 'デュエルチャンネル',
  HALFIDLE_VERIFY1: '再建画策',
  ARCADE: '視像博物館',
  INTERLOCK: 'ヒュムノイの叡智',
  APRIL_FOOL: 'エイプリルフール',
} as const

export type SpecialActivityType = keyof typeof SPECIAL_ACTIVITY_LABELS
export function isSpecialActivityType(value: unknown): value is SpecialActivityType {
  return typeof value === 'string' && Object.hasOwn(SPECIAL_ACTIVITY_LABELS, value)
}
export function getSpecialActivityLabel(value: string): string {
  return isSpecialActivityType(value) ? SPECIAL_ACTIVITY_LABELS[value] : value
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null

/** Resolve by official zone mapping: folder prefixes are not stable across reruns. */
export function resolveStageStatisticsExclusion(stageSource: unknown, zoneType: string | null | undefined, activitySource: unknown) {
  if (zoneType !== 'ACTIVITY') return null
  const stage = record(stageSource), activity = record(activitySource)
  const zoneId = stage?.zoneId
  const activityId = typeof zoneId === 'string' ? record(activity?.zoneToActivity)?.[zoneId] : null
  const info = typeof activityId === 'string' ? record(record(activity?.basicInfo)?.[activityId]) : null
  const type = info?.type
  if (typeof activityId !== 'string' || !activityId.trim() || typeof type !== 'string') {
    throw new Error(`Missing activity classification for zone: ${String(zoneId)}`)
  }
  if (isSpecialActivityType(type)) return { kind: 'special-mode' as const, activityType: type, activityId }
  // Reject newly introduced modes until their scope is reviewed, instead of
  // silently counting them as ordinary battles.
  if (type === 'MINISTORY' || /^TYPE_ACT\d+(?:D\d+|SIDE)$/.test(type)) return null
  throw new Error(`Unknown activity classification: ${type} (${String(zoneId)})`)
}
