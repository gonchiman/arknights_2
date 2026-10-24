import { useEffect, useMemo, useState } from 'react'
import { getMapCategory, getMapEnvironment, loadMapDatabase, matchesMapFilters } from '../lib/mapDatabase'
import { MAP_FEATURE_LABELS } from '../lib/mapFeatures'
import { matchesMapEnemyConditions } from '../lib/mapEnemyFilters'
import type { MapEnemyCondition } from '../lib/mapEnemyFilters'
import type { MapDataStatus, MapFilters, MapIndex, MapSummary } from '../types/map'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { MapInformation } from './MapInformation'
import { MapWaveInformation } from './MapWaveInformation'
import { MapFeatureFilters } from './MapFeatureFilters'
import { MapEnemyConditionFilters } from './MapEnemyConditionFilters'
import { MapEnemySearchResults, MapMatchingEnemyInformation } from './MapEnemySearchResults'
import './DamageCalculator.css'
import './MapDatabase.css'

const PAGE_SIZE = 12
const DEFAULT_FILTERS: MapFilters = { query: '', category: 'all', zoneId: 'all', environment: 'all', status: 'all', features: [], featureMatch: 'any' }
const CATEGORY_OPTIONS: { value: MapFilters['category']; label: string }[] = [
  { value: 'all', label: 'すべて' }, { value: 'main', label: 'メインテーマ' },
  { value: 'event', label: 'イベント' }, { value: 'supply', label: '物資調達・SoC' },
  { value: 'other', label: 'その他' },
]
const ENVIRONMENT_OPTIONS: { value: MapFilters['environment']; label: string }[] = [
  { value: 'none', label: '環境指定なし' }, { value: 'EASY', label: '物語' },
  { value: 'NORMAL', label: '標準' }, { value: 'TOUGH', label: '厄難' },
  { value: 'ALL', label: '共通' }, { value: 'other', label: 'その他' },
]
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
  const [enemyConditions, setEnemyConditions] = useState<MapEnemyCondition[]>([])
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
  const categoryMaps = useMemo(() => allMaps.filter((map) => filters.category === 'all' || getMapCategory(map) === filters.category), [allMaps, filters.category])
  const zones = useMemo(() => [...new Map(categoryMaps.map((map) => [map.zoneId, map.zoneName])).entries()], [categoryMaps])
  const environments = useMemo(() => new Set(categoryMaps.map(getMapEnvironment)), [categoryMaps])
  const filtered = useMemo(() => data ? allMaps.filter((map) => matchesMapFilters(map, data.enemies, filters)
    && matchesMapEnemyConditions(map, data.enemies, enemyConditions)) : [], [allMaps, data, filters, enemyConditions])
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
  const updateEnemyConditions = (conditions: MapEnemyCondition[]) => {
    setEnemyConditions(conditions)
    setPage(0)
    setSelectedId('')
  }

  return <section className="calculator-page map-database-page">
    <header className="page-intro"><div><span className="page-kicker">MAP DATABASE</span><h1>マップデータベース</h1></div></header>
    {error ? <div className="map-load-state" role="alert"><span>{error}</span><button className="button secondary" type="button" onClick={() => setRevision((value) => value + 1)}>再読み込み</button></div>
      : !data ? <div className="map-load-state" role="status">マップ一覧を読み込んでいます…</div>
        : <>
          <CollapsibleCalculatorPanel id="map-search" number="01" title="マップを選ぶ" summary={`${formatNumber(filtered.length)}件`} collapsedLabel="選択欄を表示" bodyClassName="map-selection-body">
            <div className="map-category-buttons" role="group" aria-label="コンテンツ">
              {CATEGORY_OPTIONS.map(({ value, label }) => <button
                key={value} type="button" aria-pressed={filters.category === value}
                onClick={() => updateFilters({ category: value, zoneId: 'all', environment: 'all' })}
              >{label}</button>)}
            </div>
            <div className="map-search-controls">
              <label className="map-search-input"><span>マップ検索</span><input type="search" value={filters.query} placeholder="ステージ番号・マップ名・敵名" onChange={(event) => updateFilters({ query: event.target.value })} /></label>
              <label><span>章・エリア</span><select value={filters.zoneId} onChange={(event) => updateFilters({ zoneId: event.target.value })}><option value="all">すべて</option>{zones.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
              <label><span>作戦環境</span><select value={filters.environment} onChange={(event) => updateFilters({ environment: event.target.value as MapFilters['environment'] })}><option value="all">すべて</option>{ENVIRONMENT_OPTIONS.filter(({ value }) => value !== 'all' && environments.has(value)).map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label><span>データの状態</span><select value={filters.status} onChange={(event) => updateFilters({ status: event.target.value as MapFilters['status'] })}><option value="all">すべて</option><option value="supported">出現数を集計できる</option><option value="excluded">出現数未確定</option><option value="missing">マップデータ未取得</option></select></label>
            </div>
            <MapFeatureFilters filters={filters} onChange={updateFilters} />
            <MapEnemyConditionFilters conditions={enemyConditions} index={data} onChange={updateEnemyConditions} />
            {visible.length ? <>
              <MapEnemySearchResults maps={visible} index={data} conditions={enemyConditions}
                selectedId={selected?.levelId ?? ''} onSelect={setSelectedId} />
              {selected && <div className="map-selection-summary" aria-live="polite">
                <span className="map-selection-label">選択中</span>
                <strong>{selected.code}</strong>
                <span className="map-selection-name">{selected.name}</span>
                {difficultyLabel(selected) && <span className="map-selection-difficulty">{difficultyLabel(selected)}</span>}
                <span className="map-selection-count">出現数 {selected.status === 'supported' ? `${formatNumber(selected.spawnCount)}体` : selected.status === 'missing' ? '未取得' : '未確定'}</span>
                {!!selected.features?.length && <span className="map-selection-features">{selected.features.map((id) => MAP_FEATURE_LABELS[id]).join(' ／ ')}</span>}
                <MapMatchingEnemyInformation map={selected} index={data} conditions={enemyConditions} />
              </div>}
              <div className="map-pagination"><span aria-live="polite">{currentPage * PAGE_SIZE + 1}–{Math.min(filtered.length, (currentPage + 1) * PAGE_SIZE)} / {formatNumber(filtered.length)}件</span><div><button className="button secondary" type="button" disabled={currentPage === 0} onClick={() => changePage(currentPage - 1)} aria-label="前のマップ一覧">前へ</button><button className="button secondary" type="button" disabled={currentPage + 1 >= pageCount} onClick={() => changePage(currentPage + 1)} aria-label="次のマップ一覧">次へ</button></div></div>
            </> : <p className="map-empty" role="status">該当するマップがありません</p>}
          </CollapsibleCalculatorPanel>
          <CollapsibleCalculatorPanel id="map-detail" number="02" title="マップ情報" summary={selected?.code ?? ''} collapsedLabel="情報を表示" className="map-detail-panel">
            {selected ? <MapInformation key={selected.levelId} map={selected} index={data} /> : <p className="map-empty">表示するマップがありません</p>}
          </CollapsibleCalculatorPanel>
          <CollapsibleCalculatorPanel id="map-waves" number="03" title="ウェーブ情報" summary={selected?.code ?? ''} collapsedLabel="ウェーブを表示">
            {selected ? <MapWaveInformation key={selected.levelId} map={selected} index={data} /> : <p className="map-empty">表示するマップがありません</p>}
          </CollapsibleCalculatorPanel>
          <details className="map-source-notes"><summary>データの範囲</summary><p>stage_table内の戦闘ステージを、同じマップデータを共有するものごとにまとめています。ローグライクなど、別管理のマップは含みません。</p><p>取得済み {formatNumber(data.maps.filter((map) => map.status !== 'missing').length)}マップ／未取得 {formatNumber(data.maps.filter((map) => map.status === 'missing').length)}マップ。敵の能力値は基礎値で、マップ固有の補正は反映していません。</p><p>特徴の絞り込みは、取得済みデータから判定できる16種類が対象です。強襲条件や条件付きで追加される効果は含みません。未取得のマップは特徴による絞り込みの対象外です。</p><p>マップ情報の生成：{data.generatedAt.slice(0, 10)}{data.sourceGeneratedAt ? ` ／ 取得範囲の集計：${data.sourceGeneratedAt.slice(0, 10)}` : ''}</p></details>
        </>}
  </section>
}
