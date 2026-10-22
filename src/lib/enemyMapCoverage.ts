import { getMapCategory, getMapEnvironment } from './mapDatabase.ts'
import type { MapCategory, MapSummary } from '../types/map.ts'

export type EnemyMapCoverageMode = 'SPAWNS' | 'MAPS'
export type MapCoverageStatus = 'included' | 'excluded' | 'missing'

export const MAP_COVERAGE_CATEGORIES = [
  { key: 'main', label: 'メインテーマ' },
  { key: 'event', label: 'イベント' },
  { key: 'supply', label: '物資調達・SoC' },
  { key: 'other', label: 'その他' },
] as const satisfies readonly { key: MapCategory; label: string }[]

export interface MapCoverageSummary {
  total: number
  included: number
  excluded: number
  missing: number
}

function uniqueMaps(maps: readonly MapSummary[]): MapSummary[] {
  const seen = new Set<string>()
  return maps.filter((map) => {
    if (seen.has(map.levelId)) return false
    seen.add(map.levelId)
    return true
  })
}

/** Coverage describes the source map population, independently of enemy filters. */
export function getMapCoverageStatus(map: MapSummary, mode: EnemyMapCoverageMode): MapCoverageStatus {
  if (getMapEnvironment(map) === 'EASY' || getMapCategory(map) === 'other') return 'excluded'
  if (map.status === 'missing') return 'missing'
  return map.status === 'supported' || mode === 'MAPS' ? 'included' : 'excluded'
}

export function summarizeMapCoverage(maps: readonly MapSummary[], mode: EnemyMapCoverageMode): MapCoverageSummary {
  const summary: MapCoverageSummary = { total: 0, included: 0, excluded: 0, missing: 0 }
  for (const map of uniqueMaps(maps)) {
    summary.total += 1
    summary[getMapCoverageStatus(map, mode)] += 1
  }
  return summary
}

export function getMapCoverageCategories(maps: readonly MapSummary[], mode: EnemyMapCoverageMode) {
  const unique = uniqueMaps(maps)
  return MAP_COVERAGE_CATEGORIES.map((category) => ({
    ...category,
    ...summarizeMapCoverage(unique.filter((map) => getMapCategory(map) === category.key), mode),
  }))
}

export function getMapCoverageZones(maps: readonly MapSummary[], category: MapCategory): { id: string; name: string }[] {
  const zones = new Map<string, string>()
  for (const map of uniqueMaps(maps)) {
    if (getMapCategory(map) === category && !zones.has(map.zoneId)) {
      zones.set(map.zoneId, map.zoneName || map.zoneId || 'その他')
    }
  }
  return [...zones].map(([id, name]) => ({ id, name })).sort((left, right) => {
    if (category === 'main') {
      const leftChapter = /^main_(\d+)$/.exec(left.id)
      const rightChapter = /^main_(\d+)$/.exec(right.id)
      if (leftChapter && rightChapter) return Number(leftChapter[1]) - Number(rightChapter[1])
      if (leftChapter) return -1
      if (rightChapter) return 1
    }
    return left.id.localeCompare(right.id, 'ja', { numeric: true })
  })
}

export function getMapCoverageEnvironmentLabel(map: MapSummary): string {
  if (map.difficulty === 'FOUR_STAR') return '強襲'
  switch (getMapEnvironment(map)) {
    case 'EASY': return '物語'
    case 'NORMAL': return '標準'
    case 'TOUGH': return '厄難'
    case 'ALL': return '共通'
    case 'none': return '環境指定なし'
    default: return 'その他'
  }
}

export function getMapSpawnReasonLabel(reason: string): string {
  if (reason === 'hidden-spawn-group') return '非表示グループの出現指定'
  if (reason === 'branch-spawn') return '分岐に応じた出現指定'
  if (reason === 'random-spawn-group' || reason === 'weighted-spawn') return 'ランダムな出現指定'
  if (reason === 'enemy-replacement' || reason === 'conflicting-enemy-replacement' || reason === 'chained-enemy-replacement') return '敵の置き換え未確定'
  if (reason === 'conflicting-hidden-group-rules') return '出現グループの設定が競合'
  if (reason === 'optional-spawn-rule' || reason === 'unknown-selected-rune') return '追加条件の選択未確定'
  if (reason === 'unsupported-rune-difficulty' || reason === 'unsupported-difficulty-context') return '難易度条件を判定できない'
  if (reason === 'unscheduled-spawn') return '通常スケジュール外の出現'
  if (reason.startsWith('conditional-spawn')) return '条件付きの出現指定'
  if (reason.startsWith('unsupported')) return '未対応の出現設定'
  if (reason.includes('missing') || reason === 'not-cached') return 'マップデータ未取得'
  if (reason.startsWith('invalid') || reason === 'spawn-total-overflow') return '必要なデータを確認できない'
  return '出現数未確定'
}

export function getMapCoverageReasons(map: MapSummary, mode: EnemyMapCoverageMode): string[] {
  if (getMapEnvironment(map) === 'EASY') return ['物語環境']
  if (getMapCategory(map) === 'other') return ['その他のマップ']
  if (map.status === 'missing') return ['マップデータ未取得']
  if (mode === 'MAPS') return ['マップデータ取得済み']
  if (map.status === 'supported') return ['出現数確定']
  return map.reasons.length > 0 ? [...new Set(map.reasons.map(getMapSpawnReasonLabel))] : ['出現数未確定']
}
