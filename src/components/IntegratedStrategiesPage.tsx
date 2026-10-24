import { useEffect, useMemo, useState } from 'react'
import { getRoguelikeStageGroups, loadRoguelikeDatabase, loadRoguelikeMapDetail } from '../lib/roguelikeDatabase'
import type { RoguelikeIndex } from '../types/roguelike'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { MapInformation } from './MapInformation'
import { MapWaveInformation } from './MapWaveInformation'
import './DamageCalculator.css'
import './MapDatabase.css'
import './IntegratedStrategiesPage.css'

const PAGE_SIZE = 12
const formatNumber = (value: number) => value.toLocaleString('ja-JP')

export function IntegratedStrategiesPage() {
  const [data, setData] = useState<RoguelikeIndex | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [themeId, setThemeId] = useState('rogue_3')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [selectedStageId, setSelectedStageId] = useState('')
  const [selectedLevelId, setSelectedLevelId] = useState('')

  useEffect(() => {
    let active = true
    setError(null)
    void loadRoguelikeDatabase().then((index) => {
      if (!active) return
      setData(index)
      setThemeId((current) => index.themes.some((theme) => theme.id === current) ? current : index.themes[0]?.id ?? '')
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : '統合戦略のデータを読み込めませんでした。')
    })
    return () => { active = false }
  }, [revision])

  const groups = useMemo(() => data ? getRoguelikeStageGroups(data, themeId, query) : [], [data, themeId, query])
  const currentPage = Math.min(page, Math.max(0, Math.ceil(groups.length / PAGE_SIZE) - 1))
  const visible = groups.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
  const selectedGroup = visible.find((group) => group.id === selectedGroupId) ?? visible[0] ?? null
  const selectedStage = selectedGroup?.stages.find((stage) => stage.id === selectedStageId)
    ?? selectedGroup?.stages.find((stage) => !stage.isEmergency) ?? selectedGroup?.stages[0] ?? null
  const theme = data?.themes.find((entry) => entry.id === themeId)
  const levelIds = selectedStage ? [...new Set([selectedStage.levelId, ...selectedStage.replacementLevelIds])] : []
  const levelId = levelIds.includes(selectedLevelId) ? selectedLevelId : selectedStage?.levelId
  const selectedMap = useMemo(() => {
    const map = data?.maps.find((entry) => entry.levelId === levelId)
    return map && selectedStage ? { ...map, code: '', name: selectedStage.name, zoneName: theme?.name ?? '', stageId: selectedStage.id } : null
  }, [data, selectedStage, theme, levelId])

  const resetSelection = () => { setPage(0); setSelectedGroupId(''); setSelectedStageId(''); setSelectedLevelId('') }
  const selectGroup = (id: string) => { setSelectedGroupId(id); setSelectedStageId(''); setSelectedLevelId('') }
  const changePage = (next: number) => { setPage(next); setSelectedGroupId(''); setSelectedStageId(''); setSelectedLevelId('') }

  return <section className="calculator-page map-database-page roguelike-page">
    <header className="page-intro"><div><span className="page-kicker">INTEGRATED STRATEGIES</span><h1>統合戦略</h1></div></header>
    {error ? <div className="map-load-state" role="alert"><span>{error}</span><button className="button secondary" type="button" onClick={() => setRevision((value) => value + 1)}>再読み込み</button></div>
      : !data ? <div className="map-load-state" role="status">統合戦略のデータを読み込んでいます…</div>
        : <>
          <CollapsibleCalculatorPanel id="roguelike-search" number="01" title="ステージを選ぶ" summary={`${formatNumber(groups.length)}件`} collapsedLabel="選択欄を表示" bodyClassName="map-selection-body">
            <div className="map-search-controls roguelike-search-controls">
              <label><span>テーマ</span><select value={themeId} onChange={(event) => { setThemeId(event.target.value); resetSelection() }}>
                {data.themes.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </select></label>
              <label><span>ステージ検索</span><input type="search" value={query} placeholder="ステージ名・敵名" onChange={(event) => { setQuery(event.target.value); resetSelection() }} /></label>
            </div>
            {visible.length ? <>
              <div className="map-selection-grid roguelike-stage-grid" role="group" aria-label="ステージ一覧">
                {visible.map((group) => <button key={group.id} type="button" className="map-selection-button" aria-pressed={selectedGroup?.id === group.id} onClick={() => selectGroup(group.id)}>
                  <span>{group.name}</span>
                  <span className="roguelike-stage-kind">{[group.stages.some((stage) => stage.isBoss) ? 'ボス' : '', group.stages.some((stage) => stage.isEmergency) ? '緊急あり' : ''].filter(Boolean).join(' ／ ')}</span>
                </button>)}
              </div>
              <div className="map-pagination"><span aria-live="polite">{currentPage * PAGE_SIZE + 1}–{Math.min(groups.length, (currentPage + 1) * PAGE_SIZE)} / {formatNumber(groups.length)}件</span><div>
                <button className="button secondary" type="button" disabled={currentPage === 0} onClick={() => changePage(currentPage - 1)} aria-label="前のステージ一覧">前へ</button>
                <button className="button secondary" type="button" disabled={(currentPage + 1) * PAGE_SIZE >= groups.length} onClick={() => changePage(currentPage + 1)} aria-label="次のステージ一覧">次へ</button>
              </div></div>
            </> : <p className="map-empty" role="status">該当するステージがありません</p>}
          </CollapsibleCalculatorPanel>
          <CollapsibleCalculatorPanel id="roguelike-detail" number="02" title="マップ・敵編成" summary={selectedStage?.name ?? ''} collapsedLabel="情報を表示" className="map-detail-panel">
            {selectedGroup && selectedStage && selectedMap ? <>
              <div className="roguelike-stage-controls">
                <div className="map-category-buttons" role="group" aria-label="作戦種別">
                  {selectedGroup.stages.map((stage) => <button key={stage.id} type="button" aria-pressed={stage.id === selectedStage.id} onClick={() => { setSelectedStageId(stage.id); setSelectedLevelId('') }}>
                    {stage.isEmergency ? '緊急' : '通常'}{selectedGroup.stages.filter((entry) => entry.isEmergency === stage.isEmergency).length > 1 ? `（${stage.name}）` : ''}
                  </button>)}
                </div>
                {levelIds.length > 1 && <label className="roguelike-map-picker"><span>マップ</span><select value={levelId} onChange={(event) => setSelectedLevelId(event.target.value)}>
                  {levelIds.map((id, index) => <option key={id} value={id}>{index === 0 ? '標準' : `変化 ${index}`}</option>)}
                </select></label>}
                <span>能力値：基礎値</span><span>出現条件：未適用</span>
              </div>
              {selectedStage.isEmergency && selectedStage.eliteDescription && <p className="roguelike-emergency-condition">{selectedStage.eliteDescription}</p>}
              <MapInformation key={`${selectedStage.id}:${selectedMap.levelId}`} map={selectedMap} index={data} detailLoader={loadRoguelikeMapDetail}
                variantLabel={selectedStage.isEmergency ? '緊急' : '通常'} enemyHeading="登録敵（抽選・条件付きの候補を含む）"
                showBaseStatLabels showDataInfo={false} layout="side-by-side" />
            </> : <p className="map-empty">表示するステージがありません</p>}
          </CollapsibleCalculatorPanel>
          <CollapsibleCalculatorPanel id="roguelike-waves" number="03" title="出現ウェーブ" summary={selectedStage?.name ?? ''} collapsedLabel="ウェーブを表示">
            {selectedStage && selectedMap ? <MapWaveInformation key={`${selectedStage.id}:${selectedMap.levelId}`} map={selectedMap} index={data}
              detailLoader={loadRoguelikeMapDetail} configuredOnly conditionContext="出現条件未適用" showHelp={false} />
              : <p className="map-empty">表示するステージがありません</p>}
          </CollapsibleCalculatorPanel>
        </>}
  </section>
}
