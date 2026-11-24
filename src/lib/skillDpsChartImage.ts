import { createChartImageFilename, withChartImageAspect } from './chartImageFilename.ts'
import { DAMAGE_TYPE_LABELS } from './damageCalculator.ts'
import { getProfessionLabel } from './operatorFilters.ts'
import { formatSkillStructureSpRecovery } from './skillStructure.ts'
import type {
  SkillDpsAnalysisAxis, SkillDpsAnalysisConfig, SkillDpsAnalysisMetric,
} from './skillDpsAnalysis.ts'
import { SKILL_DPS_ANALYSIS_AXES } from './skillDpsAnalysis.ts'

export interface SkillDpsChartImageSnapshot {
  config: SkillDpsAnalysisConfig
  axis: SkillDpsAnalysisAxis
  metric: SkillDpsAnalysisMetric
  showFit: boolean
  points: readonly { id: string; x: number | 'UNLIMITED'; y: number }[]
  fit: { slope: number; intercept: number } | null
  correlation: number | null
  rSquared: number | null
}

const axisLabel = (axis: SkillDpsAnalysisAxis) => SKILL_DPS_ANALYSIS_AXES.find(([key]) => key === axis)![1]
const METRIC_LABELS: Record<SkillDpsAnalysisMetric, string> = { direct: '直接DPS', combined: '合計DPS' }
const NUMBER = new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 12 })

function getCohortLabels(config: SkillDpsAnalysisConfig): string[] {
  return [
    config.profession === 'ALL' ? '全職業' : getProfessionLabel(config.profession),
    config.rarity === 'ALL' ? '全レア' : `★${config.rarity}`,
    formatSkillStructureSpRecovery(config.spRecovery),
  ]
}

function getDamageTypeLabel(config: SkillDpsAnalysisConfig): string {
  return config.damageType === 'ALL' ? '全属性'
    : config.damageType === 'MIXED' ? '複合' : DAMAGE_TYPE_LABELS[config.damageType]
}

function getSkillLevelLabel(config: SkillDpsAnalysisConfig): string {
  return config.skillLevel === 'MAX' ? 'スキル最高Lv' : 'スキルLv7'
}

export function getSkillDpsChartImageTitle(snapshot: SkillDpsChartImageSnapshot): string {
  return `${axisLabel(snapshot.axis)}と${METRIC_LABELS[snapshot.metric]}`
}

export function getSkillDpsAnalysisConditionLabels(config: SkillDpsAnalysisConfig): string[] {
  return [
    ...getCohortLabels(config),
    ...(config.damageType === 'ALL' ? [] : [`主攻撃:${getDamageTypeLabel(config)}`]),
    getSkillLevelLabel(config),
    `防御${NUMBER.format(config.defense)}／術耐性${NUMBER.format(config.resistance)}`,
    '敵1体',
  ]
}

/** Keep the header to the applied cohort, skill level, common enemy and sample size.
 * Fixed build details and display choices remain in the automatic filename.
 */
export function getSkillDpsChartImageConditions(snapshot: SkillDpsChartImageSnapshot): string {
  return [
    ...getSkillDpsAnalysisConditionLabels(snapshot.config),
    ...(snapshot.axis === 'uptime' ? ['SP回復1/秒・反復固定周期・回復支援なし'] : []),
    `n=${NUMBER.format(snapshot.points.length)}`,
  ].join('・')
}

/** Results, timestamps and point identities are not filename conditions. */
export function getSkillDpsChartImageFilename(snapshot: SkillDpsChartImageSnapshot, aspectRatio?: number): string {
  const { config } = snapshot
  const filename = createChartImageFilename('スキルDPS', [
    getSkillDpsChartImageTitle(snapshot),
    ...getCohortLabels(config),
    `主攻撃${getDamageTypeLabel(config)}`,
    getSkillLevelLabel(config),
    ...(snapshot.axis === 'uptime' ? ['SP回復1毎秒固定', '反復固定周期'] : []),
    `防御${config.defense}`,
    `術耐性${config.resistance}`,
    snapshot.axis === 'maxTargets' ? '対象数別箱ひげ図'
      : snapshot.showFit && snapshot.fit !== null ? '回帰線あり' : '回帰線なし',
    '育成最大-信頼100-潜在1',
    '未装備',
    '敵1体',
  ])
  return withChartImageAspect(filename, aspectRatio)
}
