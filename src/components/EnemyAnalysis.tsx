import { useMemo, useState } from 'react'
import type { EnemyLevelType } from '../types/enemy'
import { useEnemyRecords } from '../lib/useEnemyRecords'
import { ENEMY_LEVEL_LABELS } from './EnemyFilterPanel'
import { EnemyDataContent, EnemyDataNotes } from './EnemyPageShared'
import { EnemyStatisticsPanel, useEnemyStatisticsControls } from './EnemyStatisticsPanel'
import './DamageCalculator.css'
import './EnemyAnalysis.css'

export function EnemyAnalysis() {
  const { rows, loading, error, retry } = useEnemyRecords()
  const [levelType, setLevelType] = useState<EnemyLevelType | 'ALL'>('ALL')
  const statisticsControls = useEnemyStatisticsControls()
  const scopedRows = useMemo(
    () => rows.filter((enemy) => levelType === 'ALL' || enemy.levelType === levelType),
    [rows, levelType],
  )
  const scopeLabel = levelType === 'ALL' ? '全敵' : ENEMY_LEVEL_LABELS[levelType]

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
            scopeLabel={scopeLabel}
            controls={statisticsControls}
            levelType={levelType}
            onLevelTypeChange={setLevelType}
          />
        </EnemyDataContent>
      </section>
      <EnemyDataNotes />
    </section>
  )
}
