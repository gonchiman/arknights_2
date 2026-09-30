import { useEffect, useMemo, useState } from 'react'
import { loadMapDatabase, loadMapDetail, matchesMapFilters } from '../lib/mapDatabase'
import { DATA_SOURCE_URLS } from '../lib/dataSources'
import type { MapDataStatus, MapDetail, MapFilters, MapIndex, MapSummary, MapTile } from '../types/map'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import './DamageCalculator.css'
import './MapDatabase.css'

const PAGE_SIZE = 12
const DEFAULT_FILTERS: MapFilters = { query: '', zoneId: 'all', status: 'all' }
const STATUS_LABELS: Record<MapDataStatus, string> = { supported: '集計対象', excluded: '出現数未確定', missing: 'マップデータ未取得' }
const formatNumber = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString('ja-JP')
const difficultyLabel = (map: MapSummary) => {
  if (map.difficulty === 'FOUR_STAR') return '強襲'
  return ({ EASY: '物語', NORMAL: '標準', TOUGH: '厄難', ALL: '共通' } as Record<string, string>)[map.diffGroup ?? ''] ?? ''
}

function compareMaps(a: MapSummary, b: MapSummary) {
  const mainA = a.zoneId.startsWith('main_')
  const mainB = b.zoneId.startsWith('main_')
  return Number(mainB) - Number(mainA)
    || a.zoneId.localeCompare(b.zoneId, 'ja', { numeric: true })
    || a.code.localeCompare(b.code, 'ja', { numeric: true })
    || a.levelId.localeCompare(b.levelId, 'en', { numeric: true })
}

export function MapDatabase() {
  const [data, setData] = useState<MapIndex | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [filters, setFilters] = useState<MapFilters>(DEFAULT_FILTERS)
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState('obt/main/level_main_01-07')

  useEffect(() => {
    let active = true
    setError(null)
    void loadMapDatabase().then((index) => {
      if (!active) return
      setData(index)
      const sorted = [...index.maps].sort(compareMaps)
      const initialIndex = sorted.findIndex((map) => map.levelId === 'obt/main/level_main_01-07')
      setPage(initialIndex < 0 ? 0 : Math.floor(initialIndex / PAGE_SIZE))
      setSelectedId(sorted[Math.max(0, initialIndex)]?.levelId ?? '')
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'マップ一覧を読み込めませんでした。')
    })
    return () => { active = false }
  }, [revision])

  const allMaps = useMemo(() => [...(data?.maps ?? [])].sort(compareMaps), [data])
  const zones = useMemo(() => [...new Map(allMaps.map((map) => [map.zoneId, map.zoneName])).entries()], [allMaps])
  const filtered = useMemo(() => data ? allMaps.filter((map) => matchesMapFilters(map, data.enemies, filters)) : [], [allMaps, data, filters])
  const pageCount = Math.ceil(filtered.length / PAGE_SIZE)
  const currentPage = Math.min(page, Math.max(0, pageCount - 1))
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
  const selected = visible.find((map) => map.levelId === selectedId) ?? visible[0] ?? null

  const updateFilters = (patch: Partial<MapFilters>) => {
    setFilters((current) => ({ ...current, ...patch }))
    setPage(0)
    setSelectedId('')
  }
  const changePage = (next: number) => { setPage(next); setSelectedId('') }

  return <section className="calculator-page map-database-page">
    <header className="page-intro"><div><span className="page-kicker">MAP DATABASE</span><h1>マップデータベース</h1></div></header>
    {error ? <div className="map-load-state" role="alert"><span>{error}</span><button className="button secondary" type="button" onClick={() => setRevision((value) => value + 1)}>再読み込み</button></div>
      : !data ? <div className="map-load-state" role="status">マップ一覧を読み込んでいます…</div>
        : <>
          <CollapsibleCalculatorPanel id="map-search" number="01" title="検索・絞り込み" summary={`${formatNumber(filtered.length)}件`} collapsedLabel="条件を表示">
            <div className="map-search-controls">
              <label className="map-search-input"><span>マップ検索</span><input type="search" value={filters.query} placeholder="ステージ番号・マップ名・敵名" onChange={(event) => updateFilters({ query: event.target.value })} /></label>
              <label><span>章・エリア</span><select value={filters.zoneId} onChange={(event) => updateFilters({ zoneId: event.target.value })}><option value="all">すべて</option>{zones.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
              <label><span>データの状態</span><select value={filters.status} onChange={(event) => updateFilters({ status: event.target.value as MapFilters['status'] })}><option value="all">すべて</option><option value="supported">出現数を集計できる</option><option value="excluded">出現数未確定</option><option value="missing">マップデータ未取得</option></select></label>
            </div>
          </CollapsibleCalculatorPanel>
          <div className="map-database-columns">
            <CollapsibleCalculatorPanel id="map-list" number="02" title="マップ一覧" summary={`${formatNumber(filtered.length)}件`} collapsedLabel="一覧を表示" bodyClassName="map-list-body">
              {visible.length ? <>
                <div className="map-table-scroll"><table className="map-list-table"><thead><tr><th scope="col">ステージ</th><th scope="col">マップ名</th><th scope="col" className="map-numeric">出現数</th></tr></thead><tbody>{visible.map((map) => <tr key={map.levelId} className={selected?.levelId === map.levelId ? 'map-selected' : ''} onClick={() => setSelectedId(map.levelId)}>
                  <td><button type="button" className="map-row-button" aria-label={`${map.code} ${difficultyLabel(map)} ${map.name}の情報を表示`} aria-pressed={selected?.levelId === map.levelId} onClick={() => setSelectedId(map.levelId)}>{map.code}{difficultyLabel(map) && <small className="map-difficulty">{difficultyLabel(map)}</small>}</button></td><td>{map.name}</td><td className="map-numeric">{map.status === 'supported' ? `${formatNumber(map.spawnCount)}体` : map.status === 'missing' ? '未取得' : '未確定'}</td>
                </tr>)}</tbody></table></div>
                <div className="map-pagination"><span aria-live="polite">{currentPage * PAGE_SIZE + 1}–{Math.min(filtered.length, (currentPage + 1) * PAGE_SIZE)} / {formatNumber(filtered.length)}件</span><div><button className="button secondary" type="button" disabled={currentPage === 0} onClick={() => changePage(currentPage - 1)} aria-label="前のマップ一覧">前へ</button><button className="button secondary" type="button" disabled={currentPage + 1 >= pageCount} onClick={() => changePage(currentPage + 1)} aria-label="次のマップ一覧">次へ</button></div></div>
              </> : <p className="map-empty" role="status">該当するマップがありません</p>}
            </CollapsibleCalculatorPanel>
            <CollapsibleCalculatorPanel id="map-detail" number="03" title="マップ情報" summary={selected?.code ?? ''} collapsedLabel="情報を表示" className="map-detail-panel">
              {selected ? <MapInformation key={selected.levelId} map={selected} index={data} /> : <p className="map-empty">表示するマップがありません</p>}
            </CollapsibleCalculatorPanel>
          </div>
          <details className="map-source-notes"><summary>データの範囲</summary><p>stage_table内の戦闘ステージを、同じマップデータを共有するものごとにまとめています。ローグライクなど、別管理のマップは含みません。</p><p>取得済み {formatNumber(data.maps.filter((map) => map.status !== 'missing').length)}マップ／未取得 {formatNumber(data.maps.filter((map) => map.status === 'missing').length)}マップ。敵の能力値は基礎値で、マップ固有の補正は反映していません。</p><p>マップ情報の生成：{data.generatedAt.slice(0, 10)}{data.sourceGeneratedAt ? ` ／ 取得範囲の集計：${data.sourceGeneratedAt.slice(0, 10)}` : ''}</p></details>
        </>}
  </section>
}

function MapInformation({ map, index }: { map: MapSummary; index: MapIndex }) {
  const [detail, setDetail] = useState<MapDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    if (map.status === 'missing') return
    setError(null)
    void loadMapDetail(map).then((result) => { if (active) setDetail(result) }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'マップ情報を読み込めませんでした。')
    })
    return () => { active = false }
  }, [map, revision])
  const enemies = detail?.enemies ?? []
  return <>
    <header className="map-detail-heading" aria-live="polite"><h2><span>{map.code}</span>{map.name}</h2><p>{[map.zoneName, difficultyLabel(map)].filter(Boolean).join(' ／ ')}</p></header>
    {map.status === 'missing' ? <p className="map-empty" role="status">このマップの配置・敵情報は未取得です。</p>
      : error ? <div className="map-load-state" role="alert"><span>{error}</span><button type="button" className="button secondary" onClick={() => setRevision((value) => value + 1)}>再読み込み</button></div>
        : !detail ? <p className="map-empty" role="status">マップ情報を読み込んでいます…</p>
          : <>
            <MapBoard detail={detail} name={`${map.code} ${map.name}`} />
            <dl className="map-battle-facts">
              <div><dt>登録敵</dt><dd>{formatNumber(enemies.length)}種類</dd></div>
              <div><dt>出現数</dt><dd>{map.status === 'supported' ? `${formatNumber(map.spawnCount)}体` : '未確定'}</dd></div>
              <div><dt>耐久値</dt><dd>{formatNumber(detail.life)}</dd></div>
              <div><dt>初期コスト</dt><dd>{formatNumber(detail.initialCost)}</dd></div>
              <div><dt>配置上限</dt><dd>{formatNumber(detail.deployLimit)}</dd></div>
            </dl>
            <h3 className="map-enemy-heading">マップに登録された敵</h3>
            {enemies.length ? <div className="map-table-scroll map-enemy-scroll"><table className="map-enemy-table"><thead><tr><th scope="col">敵名</th><th scope="col" className="map-numeric">体数</th><th scope="col" className="map-numeric">基礎HP</th><th scope="col" className="map-numeric">基礎術耐性</th></tr></thead><tbody>{enemies.map((enemy) => {
              const base = index.enemies[enemy.id]
              return <tr key={enemy.id}><td>{base?.name ?? enemy.id}</td><td className="map-numeric">{enemy.count == null ? '未確定' : formatNumber(enemy.count)}</td><td className="map-numeric">{formatNumber(base?.hp)}</td><td className="map-numeric">{formatNumber(base?.resistance)}</td></tr>
            })}</tbody></table></div> : <p className="map-empty">登録された敵はありません</p>}
          </>}
    <details className="map-data-information"><summary>データ情報</summary><dl><div><dt>出現回数の集計</dt><dd>{STATUS_LABELS[map.status]}</dd></div>{map.reasons.length > 0 && <div><dt>理由</dt><dd>{[...new Set(map.reasons.map(reasonLabel))].join('、')}</dd></div>}<div><dt>マップID</dt><dd>{map.levelId}</dd></div></dl><p>体数は通常の出現スケジュールに記載された数です。敵の召喚などは含みません。能力値は基礎値で、マップ固有の補正は反映していません。</p><a href={`${DATA_SOURCE_URLS.levelRawBase}/${map.levelId}.json`} target="_blank" rel="noopener noreferrer">元のマップJSONを開く</a></details>
  </>
}

function reasonLabel(reason: string): string {
  if (reason === 'hidden-spawn-group') return '非表示グループの出現指定'
  if (reason === 'branch-spawn') return '分岐に応じた出現指定'
  if (reason === 'random-spawn-group' || reason === 'weighted-spawn') return 'ランダムな出現指定'
  if (reason === 'enemy-replacement') return '敵の置き換え'
  if (reason === 'unscheduled-spawn') return '通常スケジュール外の出現'
  if (reason.startsWith('conditional-spawn')) return '条件付きの出現指定'
  if (reason.startsWith('unsupported')) return '未対応の出現設定'
  if (reason.includes('missing') || reason === 'not-cached') return 'マップデータ未取得'
  if (reason.startsWith('invalid')) return '必要なデータを確認できない'
  return reason
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

function MapBoard({ detail, name }: { detail: MapDetail; name: string }) {
  if (!detail.grid.length || !detail.grid[0]?.length) return <p className="map-empty">マス配置のデータがありません</p>
  const rows = detail.grid.length
  const columns = detail.grid[0].length
  const kinds = new Set(detail.grid.flat().map((index) => tileKind(detail.tiles[index])))
  return <figure className="map-board-figure">
    <svg className="map-board" viewBox={`0 0 ${columns * 32} ${rows * 32}`} role="img" aria-label={`${name}のマップ配置、${rows}行${columns}列`}>
      {detail.grid.flatMap((row, y) => row.map((index, x) => {
        const kind = tileKind(detail.tiles[index])
        const label = kind === 'start' ? 'IN' : kind === 'end' ? 'OUT' : kind === 'hole' ? '穴' : kind === 'special' ? '◇' : ''
        return <g key={`${y}-${x}`} className={`map-tile map-tile-${kind}`}><rect x={x * 32 + 1} y={y * 32 + 1} width="30" height="30" />{label && <text x={x * 32 + 16} y={y * 32 + 17} textAnchor="middle" dominantBaseline="middle">{label}</text>}</g>
      }))}
    </svg>
    <figcaption className="map-board-legend">{(Object.keys(TILE_LABELS) as TileKind[]).filter((kind) => kinds.has(kind)).map((kind) => <span key={kind}><i className={`map-tile-${kind}`} aria-hidden="true" />{TILE_LABELS[kind]}</span>)}</figcaption>
  </figure>
}
