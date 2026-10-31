import { useId, useMemo, useState } from 'react'
import { matchesEnemyFilters } from '../lib/enemyData'
import { ENEMY_HISTOGRAM_COUNT_MODES, getEnemySpawnCoverageLabel, type EnemyHistogramCounts } from '../lib/enemyHistogramCounts'
import { summarizeEnemyImmunities, type EnemyImmunityCountMode } from '../lib/enemyImmunities'
import type { EnemyLevelSelection } from '../lib/enemyLevelSelection'
import { useEnemyAggregation } from '../lib/useEnemyAggregation'
import type { EnemyRecord } from '../types/enemy'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { EnemyAggregationHistoryButton, EnemyAggregationSelector } from './EnemyAggregationSelector'
import { EnemyDataContent } from './EnemyPageShared'
import { EnemyFilterPanel } from './EnemyFilterPanel'
import { EnemyImmunityChart } from './EnemyImmunityChart'
import './DamageCalculator.css'
import './EnemyAnalysis.css'
import './EnemyImmunityPage.css'

const COUNT_OPTIONS = ENEMY_HISTOGRAM_COUNT_MODES.filter(option => option.key !== 'MAPS')

export default function EnemyImmunityPage() {
  const aggregation = useEnemyAggregation()
  const [levelType, setLevelType] = useState<EnemyLevelSelection>('ALL')
  const [countMode, setCountMode] = useState<EnemyImmunityCountMode>('TYPES')

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
      />}
    </EnemyDataContent>
  </section>
}

function EnemyImmunityContent({ rows, counts, levelType, onLevelChange, countMode, onCountModeChange }: {
  rows: readonly EnemyRecord[]
  counts: EnemyHistogramCounts
  levelType: EnemyLevelSelection
  onLevelChange: (level: EnemyLevelSelection) => void
  countMode: EnemyImmunityCountMode
  onCountModeChange: (mode: EnemyImmunityCountMode) => void
}) {
  const countModeId = useId()
  const scopedRows = useMemo(() => rows.filter(enemy => matchesEnemyFilters(enemy, { query: '', levelType })), [rows, levelType])
  const summary = useMemo(() => summarizeEnemyImmunities(scopedRows, countMode, counts), [scopedRows, countMode, counts])
  const allCount = useMemo(() => summarizeEnemyImmunities(rows, countMode, counts).total, [rows, countMode, counts])
  const countOption = COUNT_OPTIONS.find(option => option.key === countMode)!

  return <>
    <div className="enemy-immunity-filters">
      <EnemyFilterPanel multiple levelType={levelType} onChange={onLevelChange} showReset={false} />
      <div className="enemy-immunity-scope">
        <strong>対象 {summary.total.toLocaleString('ja-JP')}{countOption.unit} / {allCount.toLocaleString('ja-JP')}{countOption.unit}</strong>
        <span>{countMode === 'SPAWNS' ? '各マップ1回分' : '敵ID単位'} · 基礎レベル</span>
      </div>
    </div>
    <CollapsibleCalculatorPanel id="enemy-immunity-chart" number="01" title={countMode === 'SPAWNS' ? '耐性別の出現回数' : '耐性別の敵数'}
      summary={null} collapsedLabel="開く">
      <div className="enemy-immunity-count-controls">
        <fieldset className="enemy-chart-visibility">
          <legend>集計方法</legend>
          <div role="radiogroup" aria-label="耐性グラフの集計方法">
            {COUNT_OPTIONS.map(option => <label key={option.key} className={countMode === option.key ? 'active' : ''}>
              <input type="radio" name={`${countModeId}-count-mode`} value={option.key} checked={countMode === option.key}
                onChange={() => onCountModeChange(option.key)} />
              <span>{option.label}</span>
            </label>)}
          </div>
        </fieldset>
        {countMode === 'SPAWNS' && <span className="enemy-immunity-coverage" role="status">{getEnemySpawnCoverageLabel(counts.summary)}</span>}
      </div>
      <EnemyImmunityChart items={summary.items} countMode={countMode} />
    </CollapsibleCalculatorPanel>
  </>
}
