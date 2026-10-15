import { createChartImageFilename } from './chartImageFilename.ts'
import type { SurtrDurationChartRange } from './surtrDurationChartView.ts'

export interface SurtrDurationImageConditions {
  level: number
  trust: number
  potential: number
  skillLevelLabel: string
  modules: readonly string[]
  /** Complete saved-line conditions, used when external actions or multiple builds are compared. */
  comparisonConditions?: readonly string[]
  chartRange?: SurtrDurationChartRange
  colors?: readonly string[]
}

export function getSurtrDurationImageFilename(settings: SurtrDurationImageConditions): string {
  const range = settings.chartRange ? [settings.chartRange === 'remnant' ? '素質2発動まで' : '退場まで'] : []
  const colors = settings.colors?.length ? [`配色${settings.colors.map(color => color.replace(/^#/, '').toLowerCase()).join('-')}`] : []
  if (settings.comparisonConditions?.length) return createChartImageFilename('スルト_S3_継続時間', [
    ...range, ...colors, ...settings.comparisonConditions, '0.2秒刻み推定', 'HP推移',
  ])
  return createChartImageFilename('スルト_S3_継続時間', [
    ...range,
    settings.skillLevelLabel,
    `昇進2Lv${settings.level}`,
    `信頼${settings.trust}`,
    `潜在${settings.potential}`,
    settings.modules.join('-'),
    '外部回復なし',
    '被ダメージなし',
    '外部HPバフなし',
    ...colors,
    '0.2秒刻み推定',
    'HP推移',
  ])
}
