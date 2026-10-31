import { useMemo, useRef, useState } from 'react'
import { matchesEnemyFilters } from '../lib/enemyData'
import { ENEMY_IMMUNITIES, filterEnemiesByImmunity, summarizeEnemyImmunities, type EnemyImmunityKey } from '../lib/enemyImmunities'
import { ENEMY_LEVEL_LABELS, type EnemyLevelSelection } from '../lib/enemyLevelSelection'
import { useEnemyAggregation } from '../lib/useEnemyAggregation'
import type { EnemyRecord } from '../types/enemy'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { EnemyAggregationHistoryButton, EnemyAggregationSelector } from './EnemyAggregationSelector'
import { EnemyDataContent } from './EnemyPageShared'
import { EnemyDetailModal } from './EnemyDetailModal'
import { EnemyFilterPanel } from './EnemyFilterPanel'
import { EnemyImmunityChart } from './EnemyImmunityChart'
import './DamageCalculator.css'
import './EnemyAnalysis.css'
import './EnemyImmunityPage.css'

const PAGE_SIZE = 5

export default function EnemyImmunityPage() {
  const aggregation = useEnemyAggregation()
  const [levelType, setLevelType] = useState<EnemyLevelSelection>('ALL')
  const [selected, setSelected] = useState<EnemyImmunityKey>('silenceImmune')

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
        selected={selected} onSelect={setSelected}
      />}
    </EnemyDataContent>
  </section>
}

function EnemyImmunityContent({ rows, levelType, onLevelChange, selected, onSelect }: {
  rows: readonly EnemyRecord[]
  levelType: EnemyLevelSelection
  onLevelChange: (level: EnemyLevelSelection) => void
  selected: EnemyImmunityKey
  onSelect: (key: EnemyImmunityKey) => void
}) {
  const scopedRows = useMemo(() => rows.filter(enemy => matchesEnemyFilters(enemy, { query: '', levelType })), [rows, levelType])
  const summary = useMemo(() => summarizeEnemyImmunities(scopedRows), [scopedRows])
  const allCount = useMemo(() => new Set(rows.map(enemy => enemy.id)).size, [rows])
  const selectedRows = useMemo(() => filterEnemiesByImmunity(scopedRows, selected), [scopedRows, selected])
  const selectedLabel = ENEMY_IMMUNITIES.find(item => item.key === selected)!.label

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
      <EnemyImmunityChart items={summary.items} selected={selected} onSelect={onSelect} />
    </CollapsibleCalculatorPanel>
    <CollapsibleCalculatorPanel id="enemy-immunity-list" number="02" title={`${selectedLabel}無効の敵`}
      summary={`${selectedRows.length.toLocaleString('ja-JP')}種類`} collapsedLabel="開く">
      <EnemyImmunityTable key={`${selected}:${JSON.stringify(levelType)}`} rows={selectedRows} label={selectedLabel} />
    </CollapsibleCalculatorPanel>
  </>
}

function EnemyImmunityTable({ rows, label }: { rows: readonly EnemyRecord[]; label: string }) {
  const [page, setPage] = useState(0)
  const [detailEnemy, setDetailEnemy] = useState<EnemyRecord | null>(null)
  const detailTrigger = useRef<HTMLButtonElement | null>(null)
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const first = currentPage * PAGE_SIZE
  const visibleRows = rows.slice(first, first + PAGE_SIZE)

  function closeDetail() {
    setDetailEnemy(null)
    window.requestAnimationFrame(() => {
      if (detailTrigger.current?.isConnected) detailTrigger.current.focus({ preventScroll: true })
    })
  }

  return <>
    <div className="enemy-immunity-table-scroll" role="region" aria-label={`${label}無効の敵一覧`} tabIndex={0}>
      <table className="enemy-immunity-table">
        <thead><tr><th scope="col">敵</th><th scope="col">区分</th><th scope="col">無効化する状態異常</th></tr></thead>
        <tbody>{visibleRows.map(enemy => <tr key={enemy.id}>
          <th scope="row"><button type="button" className="enemy-immunity-enemy-name" aria-haspopup="dialog"
            onClick={event => { detailTrigger.current = event.currentTarget; setDetailEnemy(enemy) }}>
            {enemy.name}
          </button></th>
          <td>{ENEMY_LEVEL_LABELS[enemy.levelType]}</td>
          <td>{enemy.statusImmunities.join('・')}</td>
        </tr>)}
          {rows.length === 0 && <tr><td colSpan={3} className="enemy-immunity-empty">該当する敵なし</td></tr>}
        </tbody>
      </table>
    </div>
    <nav className="enemy-pagination" aria-label="耐性を持つ敵一覧のページ切り替え">
      <span role="status">{rows.length === 0 ? '0' : `${first + 1}–${Math.min(first + PAGE_SIZE, rows.length)}`} / {rows.length.toLocaleString('ja-JP')}種類</span>
      <div>
        <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>前へ</button>
        <span>{currentPage + 1} / {pageCount}</span>
        <button type="button" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>次へ</button>
      </div>
    </nav>
    {detailEnemy && <EnemyDetailModal enemy={detailEnemy} onClose={closeDetail} />}
  </>
}
