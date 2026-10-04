import { useMemo, useState } from 'react'
import { matchesEnemyFilters } from '../lib/enemyData'
import { formatEnemyLevelSelection, type EnemyAnalysisFiltersState } from '../lib/enemyLevelSelection'
import { formatEnemyNumericCondition, matchesEnemyNumericConditions, type EnemyNumericCondition } from '../lib/enemyNumericFilters'
import { useEnemyRecords } from '../lib/useEnemyRecords'
import { EnemyAnalysisFilters } from './EnemyAnalysisFilters'
import { EnemyDataContent, EnemyDataNotes } from './EnemyPageShared'
import { EnemyStatisticsPanel, useEnemyStatisticsControls } from './EnemyStatisticsPanel'
import { EnemyRatingReferencePanel } from './EnemyRatingReferencePanel'
import './DamageCalculator.css'
import './EnemyAnalysis.css'

export function EnemyAnalysis() {
  const { rows, loading, error, retry } = useEnemyRecords()
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
        <a className="button secondary enemy-page-link" href="#/enemies">敵データベースへ</a>
      </header>
      <section className="enemy-directory" aria-label="敵の統計分析">
        <EnemyDataContent loading={loading} error={error} onRetry={retry}>
          <EnemyStatisticsPanel
            rows={scopedRows}
            allRows={rows}
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
          />
        </EnemyDataContent>
        <EnemyRatingReferencePanel />
      </section>
      <EnemyDataNotes />
    </section>
  )
}
