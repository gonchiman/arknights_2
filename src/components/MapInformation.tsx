import { useEffect, useId, useState } from 'react'
import { loadMapDetail } from '../lib/mapDatabase'
import { getMapEntrances } from '../lib/mapWaves'
import { getMapCoverageReasons, getMapCoverageStatus } from '../lib/enemyMapCoverage'
import { DATA_SOURCE_URLS } from '../lib/dataSources'
import type { MapDetail, MapIndex, MapSummary, MapTile } from '../types/map'

const formatNumber = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString('ja-JP')
const difficultyLabel = (map: MapSummary) => {
  if (map.difficulty === 'FOUR_STAR') return '強襲'
  return ({ EASY: '物語', NORMAL: '標準', TOUGH: '厄難', ALL: '共通' } as Record<string, string>)[map.diffGroup ?? ''] ?? ''
}

export interface MapInformationProps {
  map: MapSummary
  index: MapIndex
  detailLoader?: (map: MapSummary) => Promise<MapDetail>
  variantLabel?: string
  enemyHeading?: string
  showBaseStatLabels?: boolean
  showDataInfo?: boolean
  layout?: 'stack' | 'side-by-side'
}

export function MapInformation({
  map, index, detailLoader = loadMapDetail, variantLabel, enemyHeading = 'マップに登録された敵',
  showBaseStatLabels = false, showDataInfo = true, layout = 'stack',
}: MapInformationProps) {
  const [detail, setDetail] = useState<MapDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    setDetail(null)
    setError(null)
    if (map.status === 'missing') return
    void detailLoader(map).then((result) => { if (active) setDetail(result) }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'マップ情報を読み込めませんでした。')
    })
    return () => { active = false }
  }, [map, detailLoader, revision])
  const enemies = detail?.enemies ?? []
  const statLabel = (label: string) => showBaseStatLabels ? `${label}（基礎）` : label
  return <>
    <header className="map-detail-heading" aria-live="polite"><h2>{map.code && <span>{map.code}</span>}{map.name}</h2><p>{[map.zoneName, variantLabel ?? difficultyLabel(map)].filter(Boolean).join(' ／ ')}</p></header>
    {map.status === 'missing' ? <p className="map-empty" role="status">このマップの配置・敵情報は未取得です。</p>
      : error ? <div className="map-load-state" role="alert"><span>{error}</span><button type="button" className="button secondary" onClick={() => setRevision((value) => value + 1)}>再読み込み</button></div>
        : !detail ? <p className="map-empty" role="status">マップ情報を読み込んでいます…</p>
          : <div className={`map-information-content${layout === 'side-by-side' ? ' map-information-columns' : ''}`}>
            <div className="map-information-terrain">
            <MapBoard detail={detail} name={`${map.code} ${map.name}`} />
            <dl className="map-battle-facts">
              <div><dt>登録敵</dt><dd>{formatNumber(enemies.length)}種類</dd></div>
              <div><dt>出現数</dt><dd>{map.status === 'supported' ? `${formatNumber(map.spawnCount)}体` : '未確定'}</dd></div>
              <div><dt>耐久値</dt><dd>{formatNumber(detail.life)}</dd></div>
              <div><dt>初期コスト</dt><dd>{formatNumber(detail.initialCost)}</dd></div>
              <div><dt>配置上限</dt><dd>{formatNumber(detail.deployLimit)}</dd></div>
            </dl>
            </div>
            <div className="map-information-enemies">
            <h3 className="map-enemy-heading">{enemyHeading}</h3>
            {enemies.length ? <div className="map-table-scroll map-enemy-scroll" tabIndex={0} role="region" aria-label={`${enemyHeading}の一覧`}><table className="map-enemy-table"><thead><tr><th scope="col">敵名</th><th scope="col" className="map-numeric">体数</th><th scope="col" className="map-numeric">{statLabel('HP')}</th><th scope="col" className="map-numeric">{statLabel('攻撃力')}</th><th scope="col" className="map-numeric">{statLabel('防御力')}</th><th scope="col" className="map-numeric">{statLabel('術耐性')}</th></tr></thead><tbody>{enemies.map((enemy) => {
              const base = index.enemies[enemy.id]
              return <tr key={enemy.id}><th scope="row">{base?.name ?? enemy.id}</th><td className="map-numeric">{enemy.count == null ? '未確定' : formatNumber(enemy.count)}</td><td className="map-numeric">{formatNumber(base?.hp)}</td><td className="map-numeric">{formatNumber(base?.attack)}</td><td className="map-numeric">{formatNumber(base?.defense)}</td><td className="map-numeric">{formatNumber(base?.resistance)}</td></tr>
            })}</tbody></table></div> : <p className="map-empty">登録された敵はありません</p>}
            </div>
          </div>}
    {showDataInfo && <details className="map-data-information"><summary>データ情報</summary><dl><div><dt>出現回数の集計</dt><dd>{getMapCoverageStatus(map, 'SPAWNS') === 'included' ? '集計対象' : '集計対象外'}</dd></div><div><dt>理由</dt><dd>{getMapCoverageReasons(map, 'SPAWNS').join('、')}</dd></div><div><dt>マップID</dt><dd>{map.levelId}</dd></div></dl><p>体数は、この環境で判定できた出現条件と敵の置き換えを反映しています。分岐や抽選などで合計が確定しないマップは、出現回数の集計に含めません。能力値は基礎値で、マップ固有の補正は反映していません。</p><a href={`${DATA_SOURCE_URLS.levelRawBase}/${map.levelId}.json`} target="_blank" rel="noopener noreferrer">元のマップJSONを開く</a></details>}
  </>
}

const TILE_LABELS = { ground: '地上', high: '高台', blocked: '配置不可', start: '出現口', end: '防衛地点', hole: '穴', special: '特殊マス' }
type TileKind = keyof typeof TILE_LABELS
function tileKind(tile: MapTile | undefined): TileKind {
  if (!tile) return 'blocked'
  if (['tile_start', 'tile_flystart', 'tile_ftstart', 'tile_mpprts_enemy_born'].includes(tile.tileKey)) return 'start'
  if (['tile_end', 'tile_end_cooperate'].includes(tile.tileKey)) return 'end'
  if (tile.tileKey === 'tile_hole') return 'hole'
  if (tile.tileKey === 'tile_forbidden') return 'blocked'
  if (!['tile_road', 'tile_floor', 'tile_wall'].includes(tile.tileKey)) return 'special'
  if (tile.buildableType === 'NONE') return 'blocked'
  return tile.heightType === 'HIGHLAND' ? 'high' : 'ground'
}

export function MapBoard({ detail, name }: { detail: MapDetail; name: string }) {
  const blockedPatternId = useId()
  if (!detail.grid.length || !detail.grid[0]?.length) return <p className="map-empty">マス配置のデータがありません</p>
  const rows = detail.grid.length
  const columns = detail.grid[0].length
  const entrances = getMapEntrances(detail)
  const entranceLegend = entrances.length > 4 ? `A–${entrances[entrances.length - 1].label}` : entrances.map((entrance) => entrance.label).join('・')
  const entranceByTile = new Map(entrances.map((entrance) => [`${rows - 1 - entrance.row}-${entrance.col}`, entrance]))
  const kinds = new Set(detail.grid.flat().map((index) => tileKind(detail.tiles[index])))
  return <figure className="map-board-figure">
    <svg className="map-board" viewBox={`0 0 ${columns * 32} ${rows * 32}`} role="img" aria-label={`${name}のマップ配置、${rows}行${columns}列`}>
      <desc>{entrances.map((entrance) => `出現口${entrance.label}：上から${rows - entrance.row}行、左から${entrance.col + 1}列`).join('。')}</desc>
      <defs>
        <pattern id={blockedPatternId} className="map-tile-blocked map-blocked-pattern" width="6.4" height="6.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6.4" height="6.4" />
          <path d="M3.2 0V6.4" strokeWidth="0.65" />
        </pattern>
      </defs>
      {detail.grid.flatMap((row, y) => row.map((index, x) => {
        const kind = tileKind(detail.tiles[index])
        const entrance = entranceByTile.get(`${y}-${x}`)
        const label = entrance?.label ?? (kind === 'start' ? 'IN' : kind === 'end' ? 'BASE' : kind === 'hole' ? '穴' : kind === 'special' ? '◇' : '')
        return <g key={`${y}-${x}`} className={`map-tile map-tile-${kind}${entrance ? ' map-tile-entrance' : ''}`}>
          {entrance && <title>{`出現口${entrance.label}（上から${y + 1}行、左から${x + 1}列）`}</title>}
          <rect x={x * 32 + 1} y={y * 32 + 1} width="30" height="30" style={kind === 'blocked' ? { fill: `url(#${blockedPatternId})` } : undefined} />
          {entrance && kind !== 'start' && <circle className="map-entrance-marker" cx={x * 32 + 16} cy={y * 32 + 16} r="11" />}
          {label && <text x={x * 32 + 16} y={y * 32 + 17} textAnchor="middle" dominantBaseline="middle">{label}</text>}
        </g>
      }))}
    </svg>
    <figcaption className="map-board-legend">{(Object.keys(TILE_LABELS) as TileKind[]).filter((kind) => kinds.has(kind) || kind === 'start' && entrances.length > 0).map((kind) => <span key={kind}><i className={`map-tile-${kind}`} aria-hidden="true" />{TILE_LABELS[kind]}{kind === 'start' && entrances.length > 0 ? `（${entranceLegend}）` : ''}</span>)}</figcaption>
  </figure>
}
