import { useId, useMemo, useState } from 'react'
import { matchesEnemyFilters } from '../lib/enemyData'
import { ENEMY_HISTOGRAM_COUNT_MODES, getEnemySpawnCoverageLabel, type EnemyHistogramCounts } from '../lib/enemyHistogramCounts'
import { ENEMY_IMMUNITIES, filterEnemiesByImmunity, summarizeEnemyImmunities, type EnemyImmunityCountMode, type EnemyImmunityKey } from '../lib/enemyImmunities'
import { normalizeEnemyLevelSelection, type EnemyLevelSelection } from '../lib/enemyLevelSelection'
import { useEnemyAggregation } from '../lib/useEnemyAggregation'
import type { EnemyRecord } from '../types/enemy'
import { AnalysisTabs, AnalysisTabPanel } from './AnalysisTabs'
import { EnemyAggregationHistoryButton, EnemyAggregationSelector } from './EnemyAggregationSelector'
import { EnemyDataContent } from './EnemyPageShared'
import { EnemyFilterPanel } from './EnemyFilterPanel'
import { EnemyImmunityChart } from './EnemyImmunityChart'
import { EnemyImmunityOverlap } from './EnemyImmunityOverlap'
import { EnemyImmunityRatios } from './EnemyImmunityRatios'
import { EnemyImmunityTable } from './EnemyImmunityTable'
import './DamageCalculator.css'
import './EnemyAnalysis.css'
import './EnemyImmunityPage.css'

const COUNT_OPTIONS = ENEMY_HISTOGRAM_COUNT_MODES.filter(option => option.key !== 'MAPS')
const TABS = [['graph', '耐性比較'], ['ratios', '保有率'], ['overlap', '重複率'], ['list', '敵一覧']] as const
type ImmunityTab = typeof TABS[number][0]

export default function EnemyImmunityPage() {
  const aggregation = useEnemyAggregation()
  const [levelType, setLevelType] = useState<EnemyLevelSelection>('ALL')
  const [countMode, setCountMode] = useState<EnemyImmunityCountMode>('TYPES')
  const [activeTab, setActiveTab] = useState<ImmunityTab>('graph')
  const [immunityKey, setImmunityKey] = useState<EnemyImmunityKey>('silenceImmune')

  return <section className="calculator-page enemy-analysis-route enemy-immunity-page">
    <header className="page-intro">
      <h1>敵の状態異常耐性</h1>
      <nav className="enemy-analysis-page-actions" aria-label="集計版">
        <EnemyAggregationSelector state={aggregation} />
        <EnemyAggregationHistoryButton state={aggregation} />
      </nav>
    </header>
    <EnemyDataContent loading={aggregation.loading} error={aggregation.error} onRetry={aggregation.retry}>
      {aggregation.data && <EnemyImmunityContent
        key={aggregation.version?.id}
        rows={aggregation.data.rows}
        counts={aggregation.data.counts}
        levelType={levelType} onLevelChange={setLevelType}
        countMode={countMode} onCountModeChange={setCountMode}
        activeTab={activeTab} onTabChange={setActiveTab}
        immunityKey={immunityKey} onImmunityChange={setImmunityKey}
      />}
    </EnemyDataContent>
  </section>
}

function EnemyImmunityContent({ rows, counts, levelType, onLevelChange, countMode, onCountModeChange, activeTab, onTabChange, immunityKey, onImmunityChange }: {
  rows: readonly EnemyRecord[]
  counts: EnemyHistogramCounts
  levelType: EnemyLevelSelection
  onLevelChange: (level: EnemyLevelSelection) => void
  countMode: EnemyImmunityCountMode
  onCountModeChange: (mode: EnemyImmunityCountMode) => void
  activeTab: ImmunityTab
  onTabChange: (tab: ImmunityTab) => void
  immunityKey: EnemyImmunityKey
  onImmunityChange: (key: EnemyImmunityKey) => void
}) {
  const countModeId = useId()
  const tabId = useId()
  const immunityId = useId()
  const scopedRows = useMemo(() => rows.filter(enemy => matchesEnemyFilters(enemy, { query: '', levelType })), [rows, levelType])
  const summary = useMemo(() => summarizeEnemyImmunities(scopedRows, countMode, counts), [scopedRows, countMode, counts])
  const allCount = useMemo(() => summarizeEnemyImmunities(rows, countMode, counts).total, [rows, countMode, counts])
  const immunityRows = useMemo(() => filterEnemiesByImmunity(scopedRows, immunityKey), [scopedRows, immunityKey])
  const tableKey = `${JSON.stringify(normalizeEnemyLevelSelection(levelType))}:${immunityKey}:${countMode}`
  const countOption = COUNT_OPTIONS.find(option => option.key === countMode)!
  const immunitySelector = (tab: 'ratios' | 'list') => <label className="enemy-immunity-selector" htmlFor={`${immunityId}-${tab}`}>
    <span>状態異常</span>
    <select id={`${immunityId}-${tab}`} value={immunityKey} onChange={event => onImmunityChange(event.target.value as EnemyImmunityKey)}>
      {ENEMY_IMMUNITIES.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
    </select>
  </label>

  return <>
    <div className="enemy-immunity-filters">
      <EnemyFilterPanel multiple levelType={levelType} onChange={onLevelChange} showReset={false} />
      <div className="enemy-immunity-scope">
        <strong>対象 {summary.total.toLocaleString('ja-JP')}{countOption.unit} / {allCount.toLocaleString('ja-JP')}{countOption.unit}</strong>
        <span>{countMode === 'SPAWNS' ? '各マップ1回分' : '敵ID単位'} · 基礎レベル</span>
      </div>
      <div className="enemy-immunity-count-controls">
        <fieldset className="enemy-chart-visibility">
          <legend>集計方法</legend>
          <div role="radiogroup" aria-label="敵耐性の集計方法">
            {COUNT_OPTIONS.map(option => <label key={option.key} className={countMode === option.key ? 'active' : ''}>
              <input type="radio" name={`${countModeId}-count-mode`} value={option.key} checked={countMode === option.key}
                onChange={() => onCountModeChange(option.key)} />
              <span>{option.label}</span>
            </label>)}
          </div>
        </fieldset>
        {countMode === 'SPAWNS' && <span className="enemy-immunity-coverage" role="status">{getEnemySpawnCoverageLabel(counts.summary)}</span>}
      </div>
    </div>
    <AnalysisTabs tabs={TABS} activeTab={activeTab} onChange={onTabChange} idPrefix={tabId} label="敵耐性の表示切り替え" />
    <AnalysisTabPanel idPrefix={tabId} tab="graph" activeTab={activeTab} title={countMode === 'SPAWNS' ? '耐性別の出現回数' : '耐性別の敵数'}>
      <div className="analysis-panel-body">
        <EnemyImmunityChart items={summary.items} countMode={countMode} />
      </div>
    </AnalysisTabPanel>
    <AnalysisTabPanel idPrefix={tabId} tab="ratios" activeTab={activeTab} title="耐性の保有率" headerActions={immunitySelector('ratios')}>
      <div className="analysis-panel-body">
        <EnemyImmunityRatios rows={scopedRows} immunityKey={immunityKey} countMode={countMode} counts={counts} levelType={levelType} />
      </div>
    </AnalysisTabPanel>
    <AnalysisTabPanel idPrefix={tabId} tab="overlap" activeTab={activeTab} title="耐性の重複率">
      <div className="analysis-panel-body">
        <EnemyImmunityOverlap rows={scopedRows} countMode={countMode} counts={counts} />
      </div>
    </AnalysisTabPanel>
    <AnalysisTabPanel idPrefix={tabId} tab="list" activeTab={activeTab} title="耐性を持つ敵" headerActions={immunitySelector('list')}>
      <div className="analysis-panel-body">
        <EnemyImmunityTable key={tableKey} rows={immunityRows} immunityKey={immunityKey} countMode={countMode} counts={counts} />
      </div>
    </AnalysisTabPanel>
  </>
}
