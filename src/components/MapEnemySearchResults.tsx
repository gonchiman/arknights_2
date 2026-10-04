import { useMemo } from 'react'
import { getMatchingMapEnemyRoutes, hasActiveMapEnemyConditions } from '../lib/mapEnemyFilters'
import { getMapEnemyConditionField } from '../lib/mapEnemyConditionFields'
import { getMapEnemyConditionValueText } from '../lib/mapEnemyConditionValues'
import type { MapEnemyCondition, MatchingMapEnemyRoute } from '../lib/mapEnemyFilters'
import type { MapIndex, MapSummary } from '../types/map'

const formatWait = (value: number) => value.toLocaleString('ja-JP', { maximumFractionDigits: 6 })

function waitLabel(matches: MatchingMapEnemyRoute[]): string {
  const known = matches.flatMap((match) => match.waitTimes ?? [])
  if (known.length) return `${formatWait(Math.max(...known))}秒${matches.some((match) => match.waitTimes === null) ? '（未取得あり）' : ''}`
  return matches.length === 0 || matches.some((match) => match.waitTimes === null) ? '未取得' : 'なし'
}

function enemyName(index: MapIndex, id: string) { return index.enemies[id]?.name ?? id }

function mapDifficulty(map: MapSummary) {
  if (map.difficulty === 'FOUR_STAR') return '強襲'
  return ({ EASY: '物語', NORMAL: '標準', TOUGH: '厄難', ALL: '共通' } as Record<string, string>)[map.diffGroup ?? ''] ?? ''
}

export function MapEnemySearchResults({ maps, index, conditions, selectedId, onSelect }: {
  maps: MapSummary[]
  index: MapIndex
  conditions: MapEnemyCondition[]
  selectedId: string
  onSelect: (levelId: string) => void
}) {
  const hasConditions = hasActiveMapEnemyConditions(conditions)
  const rows = useMemo(() => maps.map((map) => ({
    map, matches: getMatchingMapEnemyRoutes(map, index.enemies, conditions),
  })), [maps, index, conditions])

  return <section className="map-enemy-results" aria-label="マップの検索結果">
    <h3>{hasConditions ? '該当マップと敵' : 'マップ一覧'}</h3>
    <div className="map-table-scroll map-enemy-results-scroll" role="region" aria-label="マップと敵の一覧" tabIndex={0}>
      <table className="map-enemy-results-table">
        <colgroup><col className="map-results-map-column" /><col /><col className="map-results-wait-column" /></colgroup>
        <thead><tr><th scope="col">マップ</th><th scope="col">{hasConditions ? '条件に合う敵' : '登場する敵'}</th><th scope="col">固定待機（最長）</th></tr></thead>
        <tbody>{rows.map(({ map, matches }) => {
          const ids = [...new Set(matches.map((match) => match.enemyId))]
          const hasConditional = matches.some((match) => match.spawnKind === 'conditional')
          const hasUnknown = matches.some((match) => match.spawnKind === 'unknown')
          return <tr key={map.levelId} className={selectedId === map.levelId ? 'is-selected' : ''}
            onClick={() => onSelect(map.levelId)}>
            <td className="map-result-selection">
              <button type="button" aria-pressed={selectedId === map.levelId}
                aria-label={`${map.code} ${mapDifficulty(map)} ${map.name}の情報を表示`}
                onClick={(event) => { event.stopPropagation(); onSelect(map.levelId) }}>
                <span>{map.code}{mapDifficulty(map) && <small className="map-difficulty">{mapDifficulty(map)}</small>}</span>
                <span className="map-result-name">{map.name}</span>
              </button>
            </td>
            <td>{ids.length ? <>
              <span>{ids.slice(0, 3).map((id) => enemyName(index, id)).join('、')}{ids.length > 3 ? `、ほか${ids.length - 3}種類` : ''}</span>
              {(hasConditional || hasUnknown) && <small className="map-result-spawn-kind">{hasUnknown ? '出現条件未確定を含む' : '条件付き出現を含む'}</small>}
            </> : map.enemyRoutes == null ? '未取得' : 'なし'}</td>
            <td className="map-result-wait">{matches.length === 0 && map.enemyRoutes?.length === 0 ? 'なし' : waitLabel(matches)}</td>
          </tr>
        })}</tbody>
      </table>
    </div>
  </section>
}

export function MapMatchingEnemyInformation({ map, index, conditions }: {
  map: MapSummary
  index: MapIndex
  conditions: MapEnemyCondition[]
}) {
  const matches = useMemo(() => getMatchingMapEnemyRoutes(map, index.enemies, conditions), [map, index, conditions])
  const fields = [...new Set(conditions.filter((condition) => condition.value !== null
    && !(typeof condition.value === 'string' && !condition.value.trim())).map((condition) => condition.property))]
  if (!hasActiveMapEnemyConditions(conditions) || !matches.length) return null
  return <details className="map-matching-enemies">
    <summary>条件に合う敵・経路（{matches.length}件）</summary>
    <div className="map-table-scroll"><table>
      <thead><tr><th scope="col">敵</th><th scope="col">条件の値</th><th scope="col">待機時間</th><th scope="col">出現</th><th scope="col">経路</th></tr></thead>
      <tbody>{matches.map((match, position) => <tr key={`${match.enemyId}-${match.routeIndex}-${match.spawnKind}-${position}`}>
        <td>{enemyName(index, match.enemyId)}</td>
        <td className="map-matched-condition-values">{fields.map((property) => <span key={property}>
          {getMapEnemyConditionField(property)?.label}：{getMapEnemyConditionValueText(map, index, match, property)}
        </span>)}</td>
        <td>{match.waitTimes === null ? '未取得' : match.waitTimes.length ? match.waitTimes.map((value) => `${formatWait(value)}秒`).join(' ／ ') : 'なし'}</td>
        <td>{match.spawnKind === 'fixed' ? '通常' : match.spawnKind === 'conditional' ? '条件付き' : '未確定'}</td>
        <td>{match.routeIndex == null ? '未取得' : match.routeIndex + 1}</td>
      </tr>)}</tbody>
    </table></div>
  </details>
}
