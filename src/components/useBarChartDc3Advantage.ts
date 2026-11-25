import { useMemo } from 'react'
import { getBarChartScopeData, type BarChartAdvantagePolicy, type BarChartProviderContext } from '../lib/barChartProviders'
import { getDamageThreeAttributeEntries } from '../lib/damageCalculatorThreeAttributeComparison'
import { getAdvantageEmptyMessage, NO_CORRESPONDENCE_DATA } from '../lib/damageThreeAdvantageChart'
import type { EnemyAggregationData } from '../lib/enemyAggregationData'
import { buildEnemyDefenseResistanceBands } from '../lib/enemyDefenseResistance'
import type { SkillRecord } from '../types/skill'
import { useDamageThreeSkillRankStatistics } from './useDamageThreeSkillRankStatistics'

export function useBarChartDc3Advantage(active: boolean, skills: readonly SkillRecord[],
  data: EnemyAggregationData | null, scope: BarChartProviderContext['scope'], policy: BarChartAdvantagePolicy) {
  const thresholds = useMemo(() => {
    if (!active || !data) return null
    try {
      const scoped = getBarChartScopeData({ data, scope }, 'SPAWNS')
      const pairs = buildEnemyDefenseResistanceBands(scoped.rows, scoped.counts).resistanceThresholds
      return pairs.length ? { pairs, error: null } : { pairs: undefined, error: NO_CORRESPONDENCE_DATA }
    } catch (cause) {
      return { pairs: undefined, error: cause instanceof Error ? cause.message : '対応防御力を計算できませんでした。' }
    }
  }, [active, data, scope])
  const available = Boolean(thresholds?.pairs)
  const entries = useMemo(() => available
    ? getDamageThreeAttributeEntries(skills).filter(entry => entry.kind === 'NORMAL' && entry.capability.supported)
    : [], [available, skills])
  const pairs = thresholds?.pairs
  const rows = useDamageThreeSkillRankStatistics(active, entries, pairs, policy)
  if (!pairs) return { rows: null, error: thresholds?.error ?? null }
  if (!skills.length) return { rows: null, error: 'オペレーターデータを取得できません。' }
  if (!entries.length) return { rows: null, error: '該当するスキルはありません。' }
  const error = rows && getAdvantageEmptyMessage(rows)
  return { rows: error ? null : rows, error }
}
