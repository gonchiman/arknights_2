import { useId, useMemo } from 'react'
import { ENEMY_HISTOGRAM_COUNT_MODES, type EnemyHistogramCounts } from '../lib/enemyHistogramCounts'
import { ENEMY_IMMUNITIES, summarizeEnemyImmunityByLevel, type EnemyImmunityCountMode, type EnemyImmunityKey } from '../lib/enemyImmunities'
import { ENEMY_LEVEL_LABELS, normalizeEnemyLevelSelection, type EnemyLevelSelection } from '../lib/enemyLevelSelection'
import type { EnemyLevelType, EnemyRecord } from '../types/enemy'
import { CoverageStackedBars, type CoverageBarCategory, type CoverageBarRow } from './CoverageStackedBars'
import './EnemyImmunityRatios.css'

const LEVEL_COLORS: Record<EnemyLevelType, string> = {
  NORMAL: 'var(--coverage-bar-blue)',
  ELITE: 'var(--coverage-bar-gold)',
  BOSS: 'var(--coverage-bar-rose)',
  UNKNOWN: 'var(--coverage-bar-gray)',
}
const ABSENT: CoverageBarCategory = { key: 'absent', label: '耐性なし', color: 'var(--coverage-bar-light-gray)' }

export function EnemyImmunityRatios({ rows, immunityKey, countMode, counts, levelType }: {
  rows: readonly EnemyRecord[]
  immunityKey: EnemyImmunityKey
  countMode: EnemyImmunityCountMode
  counts: EnemyHistogramCounts
  levelType: EnemyLevelSelection
}) {
  const headingId = useId()
  const summary = useMemo(() => summarizeEnemyImmunityByLevel(rows, immunityKey, countMode, counts), [rows, immunityKey, countMode, counts])
  const selectedLevels = normalizeEnemyLevelSelection(levelType)
  const groups = summary.groups.filter(group => group.total > 0 || (selectedLevels !== 'ALL' && selectedLevels.includes(group.levelType)))
  const label = ENEMY_IMMUNITIES.find(item => item.key === immunityKey)!.label
  const unit = ENEMY_HISTOGRAM_COUNT_MODES.find(option => option.key === countMode)!.unit
  const categories = groups.map(group => ({ key: group.levelType, label: ENEMY_LEVEL_LABELS[group.levelType], color: LEVEL_COLORS[group.levelType] }))
  const presentBucket = (group: typeof summary.groups[number]) => ({
    key: group.levelType,
    label: `${ENEMY_LEVEL_LABELS[group.levelType]}の耐性あり`,
    color: LEVEL_COLORS[group.levelType],
    count: group.count,
  })
  const rowSummary = (count: number, total: number) => <div className="enemy-immunity-ratio-values">
    <span>{count.toLocaleString('ja-JP')} / {total.toLocaleString('ja-JP')}{unit}</span>
    <strong>{total > 0 ? `${(count / total * 100).toFixed(1)}%` : '—'}</strong>
  </div>
  const chartRows: CoverageBarRow[] = []
  if (selectedLevels === 'ALL' || selectedLevels.length > 1) {
    chartRows.push({
      key: 'ALL', label: '全体', total: summary.total, unit,
      buckets: [...groups.map(presentBucket), { ...ABSENT, count: summary.total - summary.count }],
      summary: rowSummary(summary.count, summary.total),
    })
  }
  chartRows.push(...groups.map(group => ({
    key: group.levelType,
    label: ENEMY_LEVEL_LABELS[group.levelType],
    total: group.total,
    unit,
    buckets: [presentBucket(group), { ...ABSENT, count: group.total - group.count }],
    summary: rowSummary(group.count, group.total),
  })))

  return <section className="enemy-immunity-ratios" aria-labelledby={headingId}>
    <div className="enemy-immunity-ratio-heading">
      <h3 id={headingId}>{label}の耐性保有率</h3>
      <span>耐性あり / 対象</span>
    </div>
    <CoverageStackedBars categories={[...categories, ABSENT]} rows={chartRows}
      legendPrefix={categories.length ? '耐性あり：' : undefined} legendLabel="耐性ありの敵区分と耐性なしの凡例"
      showSegmentPercent={false} />
  </section>
}
