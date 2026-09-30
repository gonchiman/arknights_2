import { useState } from 'react'
import { ENEMY_RATING_STATS, type EnemyRatingStat } from '../lib/enemyStatRatings'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { EnemyRatingReferenceTable } from './EnemyRatingReferenceTable'
import { EnemyRatingImageSaveDialog } from './EnemyRatingImageSaveDialog'
import './EnemyRatingReferencePanel.css'

const allStats = ENEMY_RATING_STATS.map(({ key }) => key)

export function EnemyRatingReferencePanel() {
  const [saveOpen, setSaveOpen] = useState(false)
  const [selectedStats, setSelectedStats] = useState<EnemyRatingStat[]>(['maxHp', 'magicResistance'])
  const [saveStatus, setSaveStatus] = useState('')

  function selectStats(stats: EnemyRatingStat[]) {
    setSelectedStats(stats)
    setSaveStatus('')
  }

  return <>
    <CollapsibleCalculatorPanel
      id="enemy-rating-reference"
      number="03"
      title="ステータス評価基準"
      summary=""
      collapsedLabel="開く"
      className="enemy-rating-panel"
      headerActions={<button type="button" className="button secondary" disabled={selectedStats.length === 0} onClick={() => {
        setSaveStatus('')
        setSaveOpen(true)
      }}>画像を保存</button>}
    >
      <div className="enemy-rating-panel-controls">
        <span>項目</span>
        <div className="enemy-rating-panel-stat-buttons" role="group" aria-label="評価基準の表示項目">
          {ENEMY_RATING_STATS.map(({ key, label }) => <button
            key={key}
            type="button"
            className={`initial-button${selectedStats.includes(key) ? ' active' : ''}`}
            aria-pressed={selectedStats.includes(key)}
            onClick={() => selectStats(allStats.filter((stat) => stat === key ? !selectedStats.includes(key) : selectedStats.includes(stat)))}
          >{key === 'maxHp' ? 'HP' : label}</button>)}
        </div>
      </div>
      {selectedStats.length > 0 ? <div className="enemy-rating-panel-table" role="region" aria-label="ステータス評価基準の一覧" tabIndex={0}>
        <EnemyRatingReferenceTable stats={selectedStats} />
      </div> : <p className="enemy-rating-panel-empty" role="status">項目を1つ以上選んでください。</p>}
      <span className="visually-hidden" role="status">{saveStatus}</span>
    </CollapsibleCalculatorPanel>
    {saveOpen && <EnemyRatingImageSaveDialog stats={selectedStats} onStatsChange={selectStats}
      onClose={() => setSaveOpen(false)} onSaved={setSaveStatus} />}
  </>
}
