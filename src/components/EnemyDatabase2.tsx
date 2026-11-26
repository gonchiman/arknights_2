import { useMemo, useRef, useState } from 'react'
import { matchesEnemyFilters, type EnemyFilters } from '../lib/enemyData'
import { formatEnemyLevelSelection } from '../lib/enemyLevelSelection'
import { formatEnemyNumericCondition, matchesEnemyNumericConditions, type EnemyNumericCondition } from '../lib/enemyNumericFilters'
import { useEnemyRecords } from '../lib/useEnemyRecords'
import type { EnemyRecord } from '../types/enemy'
import { EnemyDatabase2Results } from './EnemyDatabase2Results'
import { EnemyDetailModal } from './EnemyDetailModal'
import { EnemyFilterPanel } from './EnemyFilterPanel'
import { EnemyNumericFilter } from './EnemyNumericFilter'
import { EnemyDataContent, EnemyDataNotes } from './EnemyPageShared'
import { EnemyRatingReferenceDialog } from './EnemyRatingReferenceDialog'
import { PageLayout, PageOutputHeader } from './PageLayout'
import { PageViewSwitch } from './PageViewSwitch'
import './EnemyAnalysis.css'
import './EnemyDatabase2.css'

const FILTERS_TITLE = '絞り込み'
const INITIAL_FILTERS: EnemyFilters = { query: '', levelType: 'ALL' }
const STAT_MODES = [['RATING', 'ゲーム内評価'], ['VALUE', '実数値']] as const
type StatMode = typeof STAT_MODES[number][0]
type Dialog = { kind: 'enemy'; enemy: EnemyRecord } | { kind: 'ratings' }

export function EnemyDatabase2() {
  const { rows, loading, error, retry } = useEnemyRecords()
  const [filters, setFilters] = useState(INITIAL_FILTERS)
  const [conditions, setConditions] = useState<readonly EnemyNumericCondition[]>([])
  const [mode, setMode] = useState<StatMode>('RATING')
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  const filteredRows = useMemo(() => rows.filter(enemy =>
    matchesEnemyFilters(enemy, filters) && matchesEnemyNumericConditions(enemy, conditions)
  ), [rows, filters, conditions])
  const scopeLabel = [
    formatEnemyLevelSelection(filters.levelType),
    filters.query.trim() && `検索「${filters.query.trim()}」`,
    ...conditions.map(formatEnemyNumericCondition),
  ].filter(Boolean).join(' / ')
  const hasFilters = filters.query !== '' || filters.levelType !== 'ALL' || conditions.length > 0

  function openDialog(next: Dialog, trigger: HTMLButtonElement) {
    triggerRef.current = trigger
    setDialog(next)
  }

  function closeDialog() {
    setDialog(null)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const settings = <section className="enemy-db2-filters" aria-label={FILTERS_TITLE}>
    <PageOutputHeader segments={[FILTERS_TITLE]} actions={
      <button type="button" className="filter-reset-button" disabled={!hasFilters} onClick={() => {
        setFilters(INITIAL_FILTERS)
        setConditions([])
      }}>条件をリセット</button>
    }><h2>{FILTERS_TITLE}</h2></PageOutputHeader>
    <div className="enemy-db2-filter-fields">
      <div className="enemy-table-search">
        <label><span>キーワード検索</span>
          <input type="search" placeholder="敵名・図鑑番号・能力・内部ID" value={filters.query}
            onChange={event => setFilters({ ...filters, query: event.target.value })} />
        </label>
      </div>
      <EnemyFilterPanel levelType={filters.levelType} onChange={levelType => setFilters({ ...filters, levelType })} showReset={false} />
    </div>
    <EnemyNumericFilter legend="数値条件" conditions={conditions} onChange={setConditions} showHints={false} />
  </section>

  return <PageLayout page="enemies-2" className="enemy-db2" settings={settings}>
    <EnemyDataContent loading={loading} error={error} onRetry={retry}>
      <EnemyDatabase2Results rows={filteredRows} mode={mode} scopeLabel={scopeLabel}
        onOpenDetail={(enemy, trigger) => openDialog({ kind: 'enemy', enemy }, trigger)}>
        <div className="enemy-db2-stat-controls">
          <PageViewSwitch label="ステータス表記" views={STAT_MODES} selected={mode} onChange={setMode} />
          <button type="button" className="button secondary" aria-haspopup="dialog"
            onClick={event => openDialog({ kind: 'ratings' }, event.currentTarget)}>評価基準</button>
        </div>
      </EnemyDatabase2Results>
    </EnemyDataContent>
    <EnemyDataNotes />
    <a className="enemy-db2-analysis-link" href="#/analysis/enemies">敵の統計分析へ</a>
    {dialog?.kind === 'enemy' && <EnemyDetailModal enemy={dialog.enemy} onClose={closeDialog} />}
    {dialog?.kind === 'ratings' && <EnemyRatingReferenceDialog onClose={closeDialog} />}
  </PageLayout>
}
