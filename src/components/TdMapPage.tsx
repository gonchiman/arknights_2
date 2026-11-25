import { useCallback, useRef, useState } from 'react'
import type { TdPlacedOperator } from '../lib/tdDeployment'
import { loadTdMapDatabase, loadTdMapDetail } from '../lib/tdMaps'
import type { MapIndex, MapSummary } from '../types/map'
import { AnalysisTabPanel } from './AnalysisTabs'
import { MapBattleFacts, MapEnemyTable } from './MapInformation'
import { MapWaveDetail } from './MapWaveInformation'
import { PageLayout, PageOutputHeader, PageOutputTabs } from './PageLayout'
import { PageViewSwitch, viewLabel } from './PageViewSwitch'
import { TdDeploymentEditor } from './TdDeploymentEditor'
import { useMapResource } from './useMapResource'
import { TdEnemyTimelinePanel } from './TdEnemyTimelinePanel'
import { TdMapSaveButtonTarget } from './TdMapImage'
import { TdEnemyRoutePanel, TdTerrainBoard } from './TdMapTerrain'
import './MapDatabase.css'
import './TdMapPage.css'

const TABS = [['terrain', '地形'], ['enemies', '出現敵'], ['waves', 'ウェーブ']] as const
const TERRAIN_VIEWS = [['route', '経路'], ['timeline', '時間別の位置']] as const
type MapTab = typeof TABS[number][0]
type TerrainView = typeof TERRAIN_VIEWS[number][0]
const PICKER_TITLE = 'マップを選ぶ'

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

function StageOutput({ map, index, tab, setTab, placements, onPlacementsChange }: {
  map: MapSummary; index: MapIndex; tab: MapTab; setTab: (tab: MapTab) => void
  placements: readonly TdPlacedOperator[]; onPlacementsChange: (placements: readonly TdPlacedOperator[]) => void
}) {
  const load = useCallback(() => loadTdMapDetail(map), [map])
  const resource = useMapResource(load)
  const detail = resource.data
  const [routeEnemyId, setRouteEnemyId] = useState<string | null>(null)
  const [terrainView, setTerrainView] = useState<TerrainView>('route')
  const [editSwitchTarget, setEditSwitchTarget] = useState<HTMLSpanElement | null>(null)
  const [saveButtonTarget, setSaveButtonTarget] = useState<HTMLSpanElement | null>(null)
  const hasTimeline = map.code === 'TD-8'
  const showTimeline = hasTimeline && terrainView === 'timeline'
  const tabProps = { activeTab: tab, idPrefix: 'td-map' }
  function showTerrain(enemyId: string | null) {
    setRouteEnemyId(enemyId)
    setTerrainView('route')
    setTab('terrain')
    document.getElementById(`${tabProps.idPrefix}-tab-terrain`)?.focus()
  }
  return <article className="td-map-detail">
    <header className="td-map-heading">
      <p>泡影を穿つ碧雷{map.zoneName && <> ／ {map.zoneName}</>}</p>
      <h2 aria-live="polite"><span>{map.code}</span>{map.name}</h2>
    </header>
    {detail ? <>
      <MapBattleFacts map={map} detail={detail} />
      <PageOutputTabs {...tabProps} tabs={TABS} label="マップ情報" onChange={setTab}
        actions={tab === 'terrain' && <>
          <span ref={setEditSwitchTarget} />
          <span ref={setSaveButtonTarget} />
        </>}
        format={tab === 'terrain' && showTimeline ? viewLabel(TERRAIN_VIEWS, terrainView) : undefined} />
      <AnalysisTabPanel {...tabProps} tab="terrain">
        <TdDeploymentEditor detail={detail} placements={placements} onChange={onPlacementsChange}
          switchTarget={editSwitchTarget}
          viewSwitch={hasTimeline && <PageViewSwitch views={TERRAIN_VIEWS} selected={terrainView}
            onChange={setTerrainView} label="地形の表示形式" />}>
          <div hidden={showTimeline}>
            <TdMapSaveButtonTarget.Provider value={showTimeline ? null : saveButtonTarget}>
              {routeEnemyId === null
                ? <TdTerrainBoard map={map} detail={detail} />
                : <TdEnemyRoutePanel key={routeEnemyId} map={map} detail={detail}
                  enemyId={routeEnemyId} enemyName={index.enemies[routeEnemyId]?.name ?? routeEnemyId}
                  onClear={() => showTerrain(null)} />}
            </TdMapSaveButtonTarget.Provider>
          </div>
          {hasTimeline && <div hidden={!showTimeline}>
            <TdMapSaveButtonTarget.Provider value={showTimeline ? saveButtonTarget : null}>
              <TdEnemyTimelinePanel map={map} detail={detail} index={index} active={tab === 'terrain' && showTimeline} />
            </TdMapSaveButtonTarget.Provider>
          </div>}
        </TdDeploymentEditor>
      </AnalysisTabPanel>
      <AnalysisTabPanel {...tabProps} tab="enemies">
        <MapEnemyTable detail={detail} index={index} heading="出現敵" showBaseStatLabels onSelectEnemy={showTerrain} />
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
  const [stagePlacements, setStagePlacements] = useState<Record<string, readonly TdPlacedOperator[]>>({})
  const selected = index?.maps.find(map => map.code === (stageCode ?? 'TD-8'))
  return <PageLayout page="td-maps" className="td-map-page map-database-page">
    {index ? <div className="td-map-layout">
      <StagePicker maps={index.maps} selected={selected} />
      {selected ? <StageOutput key={selected.stageId} map={selected} index={index} tab={tab} setTab={setTab}
        placements={stagePlacements[selected.stageId] ?? []}
        onPlacementsChange={next => setStagePlacements(current => ({ ...current, [selected.stageId]: next }))} />
        : <p className="map-empty" role="status">{stageCode ? `「${stageCode}」に一致するTDマップはありません。` : '対象のTDマップはありません。'}</p>}
    </div> : <MapLoadingState {...resource} message="TDマップを読み込んでいます…" />}
  </PageLayout>
}
