import { Activity, useEffect, useMemo, useState } from 'react'
import { matchesEnemyFilters } from '../lib/enemyData'
import { formatEnemyLevelSelection, type EnemyAnalysisFiltersState } from '../lib/enemyLevelSelection'
import { formatEnemyNumericCondition, matchesEnemyNumericConditions, type EnemyNumericCondition } from '../lib/enemyNumericFilters'
import { useEnemyAggregation } from '../lib/useEnemyAggregation'
import type { EnemyRecord } from '../types/enemy'
import { EnemyAggregationHistoryButton, EnemyAggregationSelector } from './EnemyAggregationSelector'
import { EnemyAnalysisFilters } from './EnemyAnalysisFilters'
import { EnemyDataContent, EnemyDataNotes } from './EnemyPageShared'
import { EnemyStatisticsPanel, useEnemyStatisticsControls } from './EnemyStatisticsPanel'
import { EnemyRatingReferencePanel } from './EnemyRatingReferencePanel'
import './DamageCalculator.css'
import './EnemyAnalysis.css'

const EMPTY_ROWS: EnemyRecord[] = []

export function EnemyAnalysis() {
  const aggregation = useEnemyAggregation()
  const { data, version, loading, error, retry } = aggregation
  const [lastReady, setLastReady] = useState<{ data: NonNullable<typeof data>; version: NonNullable<typeof version> } | null>(null)
  const ready = data && version && !loading && !error ? { data, version } : null
  useEffect(() => {
    if (data && version && !loading && !error) setLastReady({ data, version })
  }, [data, version, loading, error])
  // Retain the complete old pair while hidden, so changing versions preserves all
  // graph controls without showing old counts under the newly selected version.
  const displayed = ready ?? lastReady
  const rows = displayed?.data.rows ?? EMPTY_ROWS
  const [filters, setFilters] = useState<EnemyAnalysisFiltersState>({ levelType: 'ALL' })
  const [numericConditions, setNumericConditions] = useState<readonly EnemyNumericCondition[]>([])
  const statisticsControls = useEnemyStatisticsControls()
  const scopedRows = useMemo(
    () => rows.filter((enemy) => matchesEnemyFilters(enemy, { query: '', levelType: filters.levelType }) && matchesEnemyNumericConditions(enemy, numericConditions)),
    [rows, filters, numericConditions],
  )
  const scopeLabel = [
    formatEnemyLevelSelection(filters.levelType),
    ...numericConditions.map(formatEnemyNumericCondition),
  ].filter(Boolean).join(' · ')
  const resetFilters = () => {
    setFilters({ levelType: 'ALL' })
    setNumericConditions([])
  }

  return (
    <section className="calculator-page enemy-analysis-route enemy-statistics-route">
      <header className="page-intro">
        <div>
          <span className="page-kicker">ENEMY STATISTICS</span>
          <h1>敵の統計分析</h1>
        </div>
        <nav className="enemy-analysis-page-actions" aria-label="集計版と敵の関連ページ">
          <EnemyAggregationSelector state={aggregation} />
          <EnemyAggregationHistoryButton state={aggregation} />
          <a className="button secondary enemy-page-link" href="#/enemies">敵データベースへ</a>{' '}
          <a className="button secondary enemy-page-link" href="#/analysis/enemies/regression">敵の重回帰分析へ</a>
        </nav>
      </header>
      <section className="enemy-directory" aria-label="敵の統計分析">
        <EnemyDataContent loading={loading} error={error} onRetry={retry}>
          {null}
        </EnemyDataContent>
        <Activity mode={ready ? 'visible' : 'hidden'}>
          {displayed && <EnemyStatisticsPanel
            rows={scopedRows}
            allRows={rows}
            aggregationCounts={displayed.data.counts}
            aggregationVersion={displayed.version}
            scopeLabel={scopeLabel}
            controls={statisticsControls}
            filterSettings={{ ...filters, numericConditions }}
            filterControls={<EnemyAnalysisFilters
              filters={filters}
              onFiltersChange={setFilters}
              numericConditions={numericConditions}
              onNumericConditionsChange={setNumericConditions}
              matchedCount={scopedRows.length}
              totalCount={rows.length}
              onReset={resetFilters}
            />}
          />}
        </Activity>
        <EnemyRatingReferencePanel />
      </section>
      <EnemyDataNotes />
    </section>
  )
}
