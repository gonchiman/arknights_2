import { useEffect, useId, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { loadMapDetail } from '../lib/mapDatabase'
import { getMapEntrances } from '../lib/mapWaves'
import { formatTdCell, tdFile, tdRank } from '../lib/tdCoordinates'
import { getMapCoverageReasons, getMapCoverageStatus, getMapCoverageStatusLabel } from '../lib/enemyMapCoverage'
import { DATA_SOURCE_URLS } from '../lib/dataSources'
import type { MapDetail, MapIndex, MapPosition, MapSummary, MapTile } from '../types/map'

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
  return <>
    <header className="map-detail-heading" aria-live="polite"><h2>{map.code && <span>{map.code}</span>}{map.name}</h2><p>{[map.zoneName, variantLabel ?? difficultyLabel(map)].filter(Boolean).join(' ／ ')}</p></header>
    {map.status === 'missing' ? <p className="map-empty" role="status">このマップの配置・敵情報は未取得です。</p>
      : error ? <div className="map-load-state" role="alert"><span>{error}</span><button type="button" className="button secondary" onClick={() => setRevision((value) => value + 1)}>再読み込み</button></div>
        : !detail ? <p className="map-empty" role="status">マップ情報を読み込んでいます…</p>
          : <div className={`map-information-content${layout === 'side-by-side' ? ' map-information-columns' : ''}`}>
            <div className="map-information-terrain">
            <MapBoard detail={detail} name={`${map.code} ${map.name}`} />
            <MapBattleFacts map={map} detail={detail} />
            </div>
            <div className="map-information-enemies">
            <h3 className="map-enemy-heading">{enemyHeading}</h3>
            <MapEnemyTable detail={detail} index={index} heading={enemyHeading} showBaseStatLabels={showBaseStatLabels} />
            </div>
          </div>}
    {showDataInfo && <details className="map-data-information"><summary>データ情報</summary>
      <dl>
        <div><dt>出現回数の集計</dt><dd>{getMapCoverageStatusLabel(map, 'SPAWNS')}</dd></div>
        <div><dt>理由</dt><dd>{getMapCoverageReasons(map, 'SPAWNS').join('、')}</dd></div>
        <div><dt>マップID</dt><dd>{map.levelId}</dd></div>
        {!!map.omittedBranchSpawns?.length && <div><dt>除外した分岐出現</dt><dd>
          {map.omittedBranchSpawns.map((spawn) => <div key={JSON.stringify([spawn.branchId, spawn.phaseIndex, spawn.actionIndex])}>
            <strong>{index.enemies[spawn.enemyId]?.name ?? spawn.enemyId}</strong> · {spawn.condition}
            <ul>{spawn.evidence.map((value, i) => <li key={i}><code>{value}</code></li>)}</ul>
          </div>)}
        </dd></div>}
        {!!map.countedBranchSpawns?.length && <div><dt>加算した分岐出現</dt><dd>
          {map.countedBranchSpawns.map((spawn) => <div key={JSON.stringify([spawn.branchId, spawn.phaseIndex, spawn.actionIndex])}>
            <strong>{index.enemies[spawn.enemyId]?.name ?? spawn.enemyId}</strong> · {formatNumber(spawn.count)}体 · {spawn.condition}
            <ul>{spawn.evidence.map((value, i) => <li key={i}><code>{value}</code></li>)}</ul>
          </div>)}
        </dd></div>}
      </dl>
      <p>体数は、この環境で判定できた出現条件と敵の置き換えを反映しています。分岐は必須出現を加算し、回避できる追加出現や敵以外のユニットを除外しています。{map.spawnAggregation && getMapCoverageStatus(map, 'SPAWNS') === 'included'
        ? map.spawnAggregation.kind === 'expected-lower-bound'
          ? 'このマップは抽選の重みに基づく理論期待出現数を使用します。既知の出現のみを含め、未解析の追加出現は未算入です。'
          : 'このマップは確定出現分のみ下限集計に含め、未解析の分岐や抽選などは未算入です。'
        : '未解析の分岐や抽選などで合計が確定しないマップは、出現回数の集計に含めません。'}能力値は基礎値で、マップ固有の補正は反映していません。</p>
      <a href={`${DATA_SOURCE_URLS.levelRawBase}/${map.levelId}.json`} target="_blank" rel="noopener noreferrer">元のマップJSONを開く</a>
    </details>}
  </>
}

export function MapBattleFacts({ map, detail }: { map: MapSummary; detail: MapDetail }) {
  return <dl className="map-battle-facts">
    <div><dt>登録敵</dt><dd>{formatNumber(detail.enemies.length)}種類</dd></div>
    <div><dt>出現数</dt><dd>{map.status === 'supported' ? `${formatNumber(map.spawnCount)}体` : '未確定'}</dd></div>
    {map.spawnAggregation && getMapCoverageStatus(map, 'SPAWNS') === 'included'
      && <div><dt>{map.spawnAggregation.kind === 'expected-lower-bound' ? '期待出現数（下限）' : '下限集計'}</dt><dd>{formatNumber(map.spawnAggregation.count)}体</dd></div>}
    <div><dt>耐久値</dt><dd>{formatNumber(detail.life)}</dd></div>
    <div><dt>初期コスト</dt><dd>{formatNumber(detail.initialCost)}</dd></div>
    <div><dt>配置上限</dt><dd>{formatNumber(detail.deployLimit)}</dd></div>
  </dl>
}

export function MapEnemyTable({ detail, index, heading, showBaseStatLabels = false, onSelectEnemy }: {
  detail: MapDetail; index: MapIndex; heading: string; showBaseStatLabels?: boolean
  onSelectEnemy?: (enemyId: string) => void
}) {
  const statLabel = (label: string) => showBaseStatLabels ? `${label}（基礎）` : label
  if (!detail.enemies.length) return <p className="map-empty">登録された敵はありません</p>
  return <div className="map-table-scroll map-enemy-scroll" tabIndex={0} role="region" aria-label={`${heading}の一覧`}>
    <table className="map-enemy-table">
      <thead><tr><th scope="col">敵名</th><th scope="col" className="map-numeric">体数</th>
        {['HP', '攻撃力', '防御力', '術耐性'].map((label) => <th key={label} scope="col" className="map-numeric">{statLabel(label)}</th>)}
      </tr></thead>
      <tbody>{detail.enemies.map((enemy) => {
        const base = index.enemies[enemy.id]
        const name = base?.name ?? enemy.id
        return <tr key={enemy.id} className={onSelectEnemy && 'map-enemy-route-row'}
          onClick={onSelectEnemy && (event => {
            if (event.detail > 0 && window.getSelection()?.toString()) return
            onSelectEnemy(enemy.id)
          })}>
          <th scope="row">{onSelectEnemy
            ? <button type="button" className="map-enemy-route-trigger" aria-label={`${name}の経路を地形で表示`}>
                {name}<span aria-hidden="true">›</span>
              </button>
            : name}</th>
          <td className="map-numeric">{enemy.count == null ? '未確定' : formatNumber(enemy.count)}</td>
          <td className="map-numeric">{formatNumber(base?.hp)}</td>
          <td className="map-numeric">{formatNumber(base?.attack)}</td>
          <td className="map-numeric">{formatNumber(base?.defense)}</td>
          <td className="map-numeric">{formatNumber(base?.resistance)}</td>
        </tr>
      })}</tbody>
    </table>
  </div>
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

export interface MapEntranceVisibility {
  visible: boolean
  onChange: (visible: boolean) => void
}

interface MapBoardProps {
  detail: MapDetail
  name: string
  appearance?: 'td'
  cellStates?: ReadonlyMap<string, 'candidate' | 'ally'>
  markedEntrance?: { row: number; col: number }
  showEntranceLabels?: boolean
  nonTileEntrances?: MapEntranceVisibility
  routeDescription?: string
  routeLinks?: ReactNode
  routeLegend?: ReactNode
  boardOverlay?: ReactNode
  showShogiCoordinates?: boolean
  highlightedCell?: { row: number; col: number }
  children?: ReactNode
}

const TD_TILE_SYMBOLS: Partial<Record<TileKind, string>> = { start: '入', end: '拠', hole: '穴', special: '◇' }

function TdTileMarks({ kind, entrance, state, badgeMark }: {
  kind: TileKind
  entrance?: string
  state?: 'candidate' | 'ally'
  badgeMark?: ReactNode
}) {
  const badge = kind !== 'start' ? entrance : undefined
  const symbol = kind === 'start' && entrance ? entrance : TD_TILE_SYMBOLS[kind]
  const cornerSymbol = !!symbol && !!state
  const cornerPlus = !!badge || !!symbol
  return <>
    <rect className="td-tile-surface" x=".5" y=".5" width="31" height="31" />
    {symbol && <text className="td-tile-symbol" x={cornerSymbol ? (badge ? 25 : 6) : 16} y={cornerSymbol ? 6.5 : 16.5}>{symbol}</text>}
    {badgeMark}
    {state === 'candidate' && <text className="td-tile-plus" x={cornerPlus ? 24 : 16} y={cornerPlus ? 24 : 16.5}>＋</text>}
  </>
}

function boardContents({ detail, name, appearance, cellStates, markedEntrance, showEntranceLabels, nonTileEntrances, routeDescription, routeLinks, routeLegend, showShogiCoordinates, children }: MapBoardProps, blockedPatternId: string) {
  if (!detail.grid[0]?.length) return null
  const rows = detail.grid.length
  const columns = detail.grid[0].length
  const td = appearance === 'td'
  const cellLabel = (row: number, col: number) => showShogiCoordinates
    ? formatTdCell(columns, row, col)
    : `上から${row + 1}行、左から${col + 1}列`
  const mapEntrances = showEntranceLabels === false ? [] : getMapEntrances(detail)
  const isDedicated = ({ row, col }: MapPosition) => tileKind(detail.tiles[detail.grid[rows - 1 - row][col]]) === 'start'
  const visibility = td && !markedEntrance && nonTileEntrances && mapEntrances.some(entrance => !isDedicated(entrance)) ? nonTileEntrances : undefined
  const eligibleEntrances = visibility?.visible === false ? mapEntrances.filter(isDedicated) : mapEntrances
  const entrances = eligibleEntrances.filter((entrance) => !markedEntrance
    || entrance.row === markedEntrance.row && entrance.col === markedEntrance.col)
  const entranceLegend = entrances.length > 4 ? `A–${entrances[entrances.length - 1].label}` : entrances.map((entrance) => entrance.label).join('・')
  const entranceByTile = new Map(entrances.map((entrance) => [`${rows - 1 - entrance.row}-${entrance.col}`, entrance]))
  const kinds = new Set(detail.grid.flat().map((index) => tileKind(detail.tiles[index])))
  let routeEntranceBadge: ReactNode
  const terrain = (
    <svg className="map-board" viewBox={`0 0 ${columns * 32} ${rows * 32}`} role="img" aria-label={`${name}のマップ配置、${rows}行${columns}列`}>
      <desc>{[showShogiCoordinates && '右から筋、上から段', ...entrances.map(entrance => `出現口${entrance.label}：${cellLabel(rows - 1 - entrance.row, entrance.col)}`), routeDescription].filter(Boolean).join('。')}</desc>
      {!td && <defs>
        <pattern id={blockedPatternId} className="map-tile-blocked map-blocked-pattern" width="6.4" height="6.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6.4" height="6.4" />
          <path d="M3.2 0V6.4" strokeWidth="0.65" />
        </pattern>
      </defs>}
      {detail.grid.flatMap((row, y) => row.map((index, x) => {
        const kind = tileKind(detail.tiles[index])
        const key = `${y}-${x}`
        const entrance = entranceByTile.get(key)
        const state = cellStates?.get(key)
        const badgeWidth = entrance ? 4 + entrance.label.length * 6 : 0
        const badge = td && entrance && kind !== 'start' && <g className="td-entrance-badge">
          <rect x="1.5" y="1.5" width={badgeWidth} height="10" rx="1" />
          <text x={1.5 + badgeWidth / 2} y="6.8">{entrance.label}</text>
        </g>
        const liftBadge = badge && markedEntrance && routeLinks
        if (liftBadge) routeEntranceBadge = <g transform={`translate(${x * 32} ${y * 32})`}>{badge}</g>
        const label = entrance?.label ?? (kind === 'start' ? 'IN' : kind === 'end' ? 'BASE' : kind === 'hole' ? '穴' : kind === 'special' ? '◇' : '')
        return <g key={key} className={`map-tile map-tile-${kind}${entrance ? ' map-tile-entrance' : ''}`}
          transform={td ? `translate(${x * 32} ${y * 32})` : undefined} data-cell-state={state}>
          {entrance && <title>{`出現口${entrance.label}（${cellLabel(y, x)}）`}</title>}
          {td ? <TdTileMarks kind={kind} entrance={entrance?.label} state={state} badgeMark={!liftBadge && badge} /> : <>
            <rect x={x * 32 + 1} y={y * 32 + 1} width="30" height="30" style={kind === 'blocked' ? { fill: `url(#${blockedPatternId})` } : undefined} />
            {entrance && kind !== 'start' && <circle className="map-entrance-marker" cx={x * 32 + 16} cy={y * 32 + 16} r="11" />}
            {label && <text x={x * 32 + 16} y={y * 32 + 17} textAnchor="middle" dominantBaseline="middle">{label}</text>}
          </>}
        </g>
      }))}
      {routeLinks}
      {routeEntranceBadge}
      {children}
    </svg>
  )
  const legend = (
    <figcaption className="map-board-legend">
      {(Object.keys(TILE_LABELS) as TileKind[]).filter(kind => kinds.has(kind) || !td && kind === 'start' && entrances.length > 0).map(kind =>
        <span key={kind}><i className={`map-tile-${kind}`} aria-hidden="true" />
          {td && kind === 'start' ? '出現専用マス' : TILE_LABELS[kind]}
          {!td && kind === 'start' && entrances.length > 0 && `（${entranceLegend}）`}
        </span>)}
      {td && markedEntrance && entrances[0] && <span><b className="td-route-entrance-key">{entrances[0].label}</b>選択中の出現口</span>}
      {routeLegend}
      {visibility && <div className="td-entrance-visibility">
        <label><input type="checkbox" checked={visibility.visible} onChange={event => visibility.onChange(event.currentTarget.checked)} />専用マス以外の出現口</label>
      </div>}
    </figcaption>
  )
  return { terrain, legend }
}

export function MapBoard({ detail, name, appearance, cellStates, markedEntrance, showEntranceLabels, nonTileEntrances, routeDescription, routeLinks, routeLegend, boardOverlay, showShogiCoordinates, highlightedCell, children }: MapBoardProps) {
  const blockedPatternId = useId()
  // Moving markers can update many times per second over the same terrain.
  const board = useMemo(() => boardContents({ detail, name, appearance, cellStates, markedEntrance, showEntranceLabels, nonTileEntrances, routeDescription, routeLinks, routeLegend, showShogiCoordinates, children }, blockedPatternId),
    [detail, name, appearance, cellStates, markedEntrance, showEntranceLabels, nonTileEntrances, routeDescription, routeLinks, routeLegend, showShogiCoordinates, children, blockedPatternId])
  if (!board) return <p className="map-empty">マス配置のデータがありません</p>
  const terrain = boardOverlay == null ? board.terrain : <div className="map-board-layers">
    {board.terrain}
    <div className="map-board-overlay">{boardOverlay}</div>
  </div>
  return <figure className="map-board-figure" data-appearance={appearance}>
    {showShogiCoordinates ? <div className="map-board-axes">
      <div className="map-board-files" aria-hidden="true">
        {detail.grid[0].map((_, col) => <span key={col} data-active={col === highlightedCell?.col || undefined}>{tdFile(detail.grid[0].length, col)}</span>)}
      </div>
      {terrain}
      <div className="map-board-ranks" aria-hidden="true">
        {detail.grid.map((_, row) => <span key={row} data-active={row === highlightedCell?.row || undefined}>{tdRank(row)}</span>)}
      </div>
    </div> : terrain}
    {board.legend}
  </figure>
}
