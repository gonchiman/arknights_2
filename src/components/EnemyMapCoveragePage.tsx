import { useEffect, useMemo, useState } from 'react'
import { getMapCategory, loadMapDatabase } from '../lib/mapDatabase'
import {
  getMapCoverageCategories, getMapCoverageEnvironmentLabel, getMapCoverageReasons,
  getMapCoverageStatus, getMapCoverageZones, summarizeMapCoverage,
} from '../lib/enemyMapCoverage'
import type { EnemyMapCoverageMode as CountMode, MapCoverageStatus as CoverageStatus, MapCoverageSummary as CoverageCounts } from '../lib/enemyMapCoverage'
import type { MapCategory, MapIndex, MapSummary } from '../types/map'
import { PageBreadcrumbs } from './PageBreadcrumbs'
import './DamageCalculator.css'
import './MapDatabase.css'
import './EnemyMapCoveragePage.css'

const PAGE_SIZE = 36
const STATUS_LABELS: Record<CoverageStatus, string> = {
  included: '集計対象', excluded: '集計対象外', missing: 'データ未取得',
}
const ENVIRONMENT_ORDER = ['標準', '強襲', '厄難', '物語', '共通', '環境指定なし', 'その他']
const formatCount = (count: number) => count.toLocaleString('ja-JP')
const STATUS_KEYS: CoverageStatus[] = ['included', 'excluded', 'missing']

function compareMaps(a: MapSummary, b: MapSummary) {
  const environmentOrder = (map: MapSummary) => {
    const index = ENVIRONMENT_ORDER.indexOf(getMapCoverageEnvironmentLabel(map))
    return index < 0 ? ENVIRONMENT_ORDER.length : index
  }
  return environmentOrder(a) - environmentOrder(b)
    || a.code.localeCompare(b.code, 'ja', { numeric: true })
    || a.levelId.localeCompare(b.levelId, 'en', { numeric: true })
}

function CoverageLegend({ counts }: { counts: CoverageCounts }) {
  return <div className="enemy-map-coverage-legend">
    {STATUS_KEYS.map((status) => <span key={status}>
      <i className={`coverage-${status}`} aria-hidden="true" />
      {STATUS_LABELS[status]} <strong>{formatCount(counts[status])}</strong>
    </span>)}
  </div>
}

export function EnemyMapCoveragePage() {
  const [data, setData] = useState<MapIndex | null>(null)
  const [error, setError] = useState(false)
  const [revision, setRevision] = useState(0)
  const [mode, setMode] = useState<CountMode>('SPAWNS')
  const [category, setCategory] = useState<MapCategory>('main')
  const [zoneId, setZoneId] = useState('main_9')
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState('')

  useEffect(() => {
    let active = true
    setError(false)
    void loadMapDatabase().then((index) => { if (active) setData(index) })
      .catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [revision])

  const maps = data?.maps ?? []
  const totals = useMemo(() => summarizeMapCoverage(maps, mode), [data, mode])
  const categories = useMemo(() => getMapCoverageCategories(maps, mode), [data, mode])
  const zones = useMemo(() => getMapCoverageZones(maps, category), [data, category])
  const activeZone = zones.find((zone) => zone.id === zoneId) ?? zones[0]
  const zoneMaps = useMemo(() => maps.filter((map) => getMapCategory(map) === category && map.zoneId === activeZone?.id)
    .sort(compareMaps), [data, category, activeZone?.id])
  const zoneCounts = useMemo(() => summarizeMapCoverage(zoneMaps, mode), [zoneMaps, mode])
  const pageCount = Math.ceil(zoneMaps.length / PAGE_SIZE)
  const currentPage = Math.min(page, Math.max(0, pageCount - 1))
  const visible = zoneMaps.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
  const selected = visible.find((map) => map.levelId === selectedId) ?? visible[0]
  const environments = [...new Set(visible.map(getMapCoverageEnvironmentLabel))]
  const categoryLabel = categories.find((item) => item.key === category)?.label ?? ''

  const selectCategory = (next: MapCategory) => {
    if (next === category) return
    setCategory(next)
    setZoneId(next === 'main' ? 'main_9' : '')
    setPage(0)
    setSelectedId('')
  }

  return <section className="calculator-page enemy-map-coverage-page">
    <PageBreadcrumbs parents={[{ label: '敵の統計分析', href: '#/analysis/enemies' }]} current="集計マップ確認" />
    <header className="page-intro">
      <div><span className="page-kicker">ENEMY STATISTICS</span><h1>集計マップ確認</h1></div>
      <a className="button secondary" href="#/analysis/enemies">敵の統計分析へ</a>
    </header>
    {error ? <div className="map-load-state" role="alert">
      <span>マップ一覧を読み込めませんでした。</span>
      <button className="button secondary" type="button" onClick={() => setRevision((value) => value + 1)}>再読み込み</button>
    </div> : !data ? <div className="map-load-state" role="status">マップ一覧を読み込んでいます…</div> : <>
      <div className="enemy-map-coverage-controls">
        <label><span>集計方法</span><select value={mode} onChange={(event) => setMode(event.target.value as CountMode)}>
          <option value="SPAWNS">出現回数</option><option value="MAPS">登場マップ数</option>
        </select></label>
        <div className="enemy-map-coverage-totals" aria-live="polite">
          <span>収録データ全体 <strong>{formatCount(totals.total)}</strong> マップ</span>
          <span>集計対象 <strong>{formatCount(totals.included)}</strong> マップ</span>
        </div>
      </div>
      <section className="calculator-panel" aria-labelledby="enemy-map-coverage-chart-heading">
        <header className="panel-heading"><div><span>01</span><h2 id="enemy-map-coverage-chart-heading">集計マップ</h2></div></header>
        <CoverageLegend counts={totals} />
        <div className="enemy-map-coverage-chart" role="group" aria-label="分類ごとの集計対象割合とマップ数">
          <div className="enemy-map-coverage-chart-heading" aria-hidden="true">
            <span>分類</span><span>収録マップの内訳</span><span>集計対象 / 収録数</span>
          </div>
          {categories.map((item) => <button type="button" key={item.key}
            className="enemy-map-coverage-bar-row" aria-pressed={category === item.key}
            aria-controls="enemy-map-coverage-detail" onClick={() => selectCategory(item.key)}
            aria-label={`${item.label}、集計対象 ${formatCount(item.included)} / 収録 ${formatCount(item.total)}マップ、${STATUS_KEYS.map((status) => `${STATUS_LABELS[status]} ${formatCount(item[status])}`).join('、')}`}>
            <span className="enemy-map-coverage-category">{item.label}</span>
            <span className="enemy-map-coverage-bar" aria-hidden="true">
              {STATUS_KEYS.map((status) => <span key={status} className={`coverage-${status}`}
                style={{ width: `${item.total > 0 ? item[status] / item.total * 100 : 0}%` }} />)}
            </span>
            <span className="enemy-map-coverage-count">{formatCount(item.included)} / {formatCount(item.total)} マップ</span>
          </button>)}
        </div>
      </section>
      <section id="enemy-map-coverage-detail" className="calculator-panel" aria-labelledby="enemy-map-coverage-detail-heading">
        <header className="panel-heading"><div><span>02</span><h2 id="enemy-map-coverage-detail-heading">マップ内訳</h2></div><p>{categoryLabel}</p></header>
        {zones.length ? <div className="enemy-map-coverage-detail-body">
          <label className="enemy-map-coverage-zone"><span>章・エリア</span>
            <select value={activeZone?.id ?? ''} onChange={(event) => { setZoneId(event.target.value); setPage(0); setSelectedId('') }}>
              {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
            </select>
          </label>
          <div className="enemy-map-coverage-zone-heading" aria-live="polite">
            <h3>{activeZone?.name}<span>{formatCount(zoneCounts.total)} マップ</span></h3>
            <CoverageLegend counts={zoneCounts} />
          </div>
          <div className="enemy-map-coverage-selection" aria-live="polite">
            {selected && <>
              <strong>{selected.code} {selected.name}</strong>
              <span>{getMapCoverageEnvironmentLabel(selected)}</span>
              <span className="enemy-map-coverage-selection-status"><i className={`coverage-${getMapCoverageStatus(selected, mode)}`} aria-hidden="true" />{STATUS_LABELS[getMapCoverageStatus(selected, mode)]}</span>
              <span>{getMapCoverageReasons(selected, mode).join(' ／ ')}</span>
            </>}
          </div>
          <div className="enemy-map-coverage-map-groups">
            {environments.map((environment) => <div className="enemy-map-coverage-map-group" key={environment}>
              <h4>{environment}</h4>
              <div className="enemy-map-coverage-map-grid" role="group" aria-label={`${activeZone?.name} ${environment}のマップ`}>
                {visible.filter((map) => getMapCoverageEnvironmentLabel(map) === environment).map((map) => <button
                  key={map.levelId} type="button" className="map-selection-button enemy-map-coverage-map"
                  data-coverage-status={getMapCoverageStatus(map, mode)} aria-pressed={selected?.levelId === map.levelId}
                  aria-label={`${map.code} ${map.name}、${environment}、${STATUS_LABELS[getMapCoverageStatus(map, mode)]}`}
                  onClick={() => setSelectedId(map.levelId)}>{map.code}</button>)}
              </div>
            </div>)}
          </div>
          <div className="map-pagination">
            <span aria-live="polite">{currentPage * PAGE_SIZE + 1}–{Math.min(zoneMaps.length, (currentPage + 1) * PAGE_SIZE)} / {formatCount(zoneMaps.length)} マップ</span>
            <div>
              <button type="button" className="button secondary" disabled={currentPage === 0}
                onClick={() => { setPage(currentPage - 1); setSelectedId('') }} aria-label="前のマップ一覧">前へ</button>
              <button type="button" className="button secondary" disabled={currentPage + 1 >= pageCount}
                onClick={() => { setPage(currentPage + 1); setSelectedId('') }} aria-label="次のマップ一覧">次へ</button>
            </div>
          </div>
        </div> : <p className="map-empty" role="status">収録マップがありません</p>}
      </section>
    </>}
  </section>
}
