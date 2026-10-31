import { useMemo, useState } from 'react'
import { matchesEnemyFilters } from '../lib/enemyData'
import { summarizeEnemyImmunities } from '../lib/enemyImmunities'
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

export default function EnemyImmunityPage() {
  const aggregation = useEnemyAggregation()
  const [levelType, setLevelType] = useState<EnemyLevelSelection>('ALL')

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
        levelType={levelType} onLevelChange={setLevelType}
      />}
    </EnemyDataContent>
  </section>
}

function EnemyImmunityContent({ rows, levelType, onLevelChange }: {
  rows: readonly EnemyRecord[]
  levelType: EnemyLevelSelection
  onLevelChange: (level: EnemyLevelSelection) => void
}) {
  const scopedRows = useMemo(() => rows.filter(enemy => matchesEnemyFilters(enemy, { query: '', levelType })), [rows, levelType])
  const summary = useMemo(() => summarizeEnemyImmunities(scopedRows), [scopedRows])
  const allCount = useMemo(() => new Set(rows.map(enemy => enemy.id)).size, [rows])

  return <>
    <div className="enemy-immunity-filters">
      <EnemyFilterPanel multiple levelType={levelType} onChange={onLevelChange} showReset={false} />
      <div className="enemy-immunity-scope">
        <strong>対象 {summary.total.toLocaleString('ja-JP')}種類 / {allCount.toLocaleString('ja-JP')}種類</strong>
        <span>敵ID単位 · 基礎レベル</span>
      </div>
    </div>
    <CollapsibleCalculatorPanel id="enemy-immunity-chart" number="01" title="耐性別の敵数"
      summary={null} collapsedLabel="開く">
      <EnemyImmunityChart items={summary.items} />
    </CollapsibleCalculatorPanel>
  </>
}
