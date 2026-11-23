import { useCallback, useEffect, useRef, useState } from 'react'
import { loadTdMapDatabase, loadTdMapDetail } from '../lib/tdMaps'
import type { MapIndex, MapSummary } from '../types/map'
import { AnalysisTabPanel } from './AnalysisTabs'
import { MapBattleFacts, MapBoard, MapEnemyTable } from './MapInformation'
import { MapWaveDetail } from './MapWaveInformation'
import { PageLayout, PageOutputHeader, PageOutputTabs } from './PageLayout'
import { TdEnemyRoutePanel } from './TdMapTerrain'
import './MapDatabase.css'
import './TdMapPage.css'

const TABS = [['terrain', '地形'], ['enemies', '出現敵'], ['waves', 'ウェーブ']] as const
type MapTab = typeof TABS[number][0]
const PICKER_TITLE = 'マップを選ぶ'

function useMapResource<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setError('')
    void load().then(result => {
      if (active) setData(result)
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'データを読み込めませんでした。')
    })
    return () => { active = false }
  }, [load, attempt])
  return { data, error, retry: () => setAttempt(value => value + 1) }
}

function MapLoadingState({ message, error, retry }: { message: string; error: string; retry: () => void }) {
  if (error) return <div className="map-load-state" role="alert">
    <span>{error}</span><button className="button secondary" type="button" onClick={retry}>再読み込み</button>
  </div>
  return <p className="map-empty" role="status">{message}</p>
}

function normalizeQuery(text: string) {
  return text.normalize('NFKC').trim().toLowerCase()
}

function StagePicker({ maps, selected }: { maps: MapSummary[]; selected?: MapSummary }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const toggle = useRef<HTMLButtonElement>(null)
  const words = normalizeQuery(query).split(/\s+/)
  const results = maps.filter(map => {
    const text = normalizeQuery(`${map.code} ${map.name}`)
    return words.every(word => text.includes(word))
  })
  function closePicker() {
    if (open) {
      setOpen(false)
      toggle.current?.focus({ preventScroll: true })
    }
  }
  return <aside className="td-map-picker" aria-label="TDマップの選択">
    <PageOutputHeader segments={[PICKER_TITLE]}>
      <h2>{PICKER_TITLE}</h2>
      <button type="button" className="td-map-picker-toggle" ref={toggle} aria-expanded={open}
        aria-controls="td-map-picker-options" onClick={() => setOpen(value => !value)}>
        {PICKER_TITLE}<span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
    </PageOutputHeader>
    <div id="td-map-picker-options" className={`td-map-picker-options${open ? ' is-open' : ''}`}>
      <label className="td-map-search"><span>検索</span>
        <input type="search" placeholder="ステージ番号・名前" value={query} onChange={event => setQuery(event.target.value)} />
      </label>
      {results.length > 0
        ? <nav className="td-map-list" aria-label="TDステージ一覧">
          {results.map(map => <a key={map.stageId} href={`#/maps/td?stage=${encodeURIComponent(map.code)}`}
            aria-current={map.stageId === selected?.stageId ? 'page' : undefined}
            onClick={event => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) closePicker() }}>
            <strong>{map.code}</strong><span>{map.name}</span>
          </a>)}
        </nav>
        : <p className="map-empty" role="status">一致するマップはありません。</p>}
    </div>
  </aside>
}

function StageOutput({ map, index, tab, setTab }: {
  map: MapSummary; index: MapIndex; tab: MapTab; setTab: (tab: MapTab) => void
}) {
  const load = useCallback(() => loadTdMapDetail(map), [map])
  const resource = useMapResource(load)
  const detail = resource.data
  const tabProps = { activeTab: tab, idPrefix: 'td-map' }
  return <article className="td-map-detail">
    <header className="td-map-heading">
      <p>泡影を穿つ碧雷{map.zoneName && <> ／ {map.zoneName}</>}</p>
      <h2 aria-live="polite"><span>{map.code}</span>{map.name}</h2>
    </header>
    {detail ? <>
      <MapBattleFacts map={map} detail={detail} />
      <PageOutputTabs {...tabProps} tabs={TABS} label="マップ情報" onChange={setTab} />
      <AnalysisTabPanel {...tabProps} tab="terrain">
        <MapBoard detail={detail} name={`${map.code} ${map.name}`} />
      </AnalysisTabPanel>
      <AnalysisTabPanel {...tabProps} tab="enemies">
        <MapEnemyTable detail={detail} index={index} heading="出現敵" showBaseStatLabels
          initialRouteEnemyId={map.code === 'TD-8' ? detail.enemies.find(enemy => index.enemies[enemy.id]?.levelType === 'BOSS')?.id : undefined}
          renderEnemyRoute={(enemyId, enemyName) => <TdEnemyRoutePanel map={map} detail={detail} enemyId={enemyId} enemyName={enemyName} />} />
      </AnalysisTabPanel>
      <AnalysisTabPanel {...tabProps} tab="waves">
        <MapWaveDetail map={map} detail={detail} index={index} showHelp={false} />
      </AnalysisTabPanel>
    </> : <MapLoadingState {...resource} message="マップ情報を読み込んでいます…" />}
  </article>
}

export default function TdMapPage({ stageCode }: { stageCode?: string }) {
  const resource = useMapResource(loadTdMapDatabase)
  const index = resource.data
  const [tab, setTab] = useState<MapTab>('terrain')
  const selected = index?.maps.find(map => map.code === (stageCode ?? 'TD-8'))
  return <PageLayout page="td-maps" className="td-map-page map-database-page">
    {index ? <div className="td-map-layout">
      <StagePicker maps={index.maps} selected={selected} />
      {selected ? <StageOutput key={selected.stageId} map={selected} index={index} tab={tab} setTab={setTab} />
        : <p className="map-empty" role="status">{stageCode ? `「${stageCode}」に一致するTDマップはありません。` : '対象のTDマップはありません。'}</p>}
    </div> : <MapLoadingState {...resource} message="TDマップを読み込んでいます…" />}
  </PageLayout>
}
