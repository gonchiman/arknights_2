import { getMapEnemyConditionField } from './mapEnemyConditionFields.ts'
import type { MapEnemyConditionProperty } from './mapEnemyConditionFields.ts'
import type { MatchingMapEnemyRoute } from './mapEnemyFilters.ts'
import type { MapEnemyBase, MapIndex, MapSummary } from '../types/map.ts'

const formatNumber = (value: number) => value.toLocaleString('ja-JP', { maximumFractionDigits: 6 })

/** Values in the matched route are shown alongside the search result for review. */
export function getMapEnemyConditionValueText(
  map: MapSummary, index: MapIndex, match: MatchingMapEnemyRoute, property: MapEnemyConditionProperty,
): string {
  const enemy = index.enemies[match.enemyId]
  const route = map.enemyRoutes?.find((entry) => entry.enemyId === match.enemyId
    && entry.routeIndex === match.routeIndex && entry.spawnKind === match.spawnKind)
  const field = getMapEnemyConditionField(property)
  let value: number | string | number[] | null | undefined
  switch (property) {
    case 'enemyName': return `${enemy?.name ?? match.enemyId}（${match.enemyId}）`
    case 'enemyId': return match.enemyId
    case 'hp': case 'attack': case 'defense': case 'resistance':
    case 'moveSpeed': case 'attackInterval': case 'weight':
      value = enemy?.[property as keyof MapEnemyBase] as number | null | undefined
      break
    case 'levelType': case 'motion': case 'attackWay': value = enemy?.[property]; break
    case 'damageType': {
      if (!enemy?.damageTypes) return '未確認'
      return enemy.damageTypes.length ? enemy.damageTypes.map((item) =>
        field?.options?.find((option) => option.value === item)?.label ?? item).join(' ／ ') : 'なし'
    }
    case 'wait': value = match.waitTimes; break
    case 'waitCount': value = route?.fixedWaits?.length; break
    case 'waitTotal': value = route?.fixedWaits?.reduce((sum, wait) => sum + wait, 0); break
    case 'waitPresence': value = route?.fixedWaits == null ? null : route.fixedWaits.length ? 'yes' : 'no'; break
    case 'spawnCount': value = map.enemySpawnCounts?.[match.enemyId]; break
    case 'routeSpawnCount': value = route?.spawnCount; break
    case 'spawnInterval': value = match.intervalTimes ?? route?.spawnIntervals; break
    case 'spawnKind': value = match.spawnKind; break
    case 'entrance': value = route?.entrance; break
    case 'entranceCount': {
      const routes = map.enemyRoutes?.filter((entry) => entry.enemyId === match.enemyId)
      value = routes?.length && routes.every((entry) => entry.entrance != null)
        ? new Set(routes.map((entry) => entry.entrance)).size : null
      break
    }
    default: {
      const immune = enemy?.immunities?.[property]
      value = immune == null ? null : immune ? 'yes' : 'no'
    }
  }
  if (value == null) return '未確認'
  if (Array.isArray(value)) return value.length
    ? [...new Set(value)].map((entry) => `${formatNumber(entry)}${field?.unit ?? ''}`).join(' ／ ') : 'なし'
  if (typeof value === 'number') return Number.isFinite(value) ? `${formatNumber(value)}${field?.unit ?? ''}` : '未確認'
  return field?.options?.find((option) => option.value === value)?.label ?? value
}
