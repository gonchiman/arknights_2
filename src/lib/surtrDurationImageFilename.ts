import { createChartImageFilename } from './chartImageFilename.ts'

export interface SurtrDurationImageConditions {
  level: number
  trust: number
  potential: number
  skillLevelLabel: string
  modules: readonly string[]
}

export function getSurtrDurationImageFilename(settings: SurtrDurationImageConditions): string {
  return createChartImageFilename('スルト_S3_継続時間', [
    settings.skillLevelLabel,
    `昇進2Lv${settings.level}`,
    `信頼${settings.trust}`,
    `潜在${settings.potential}`,
    settings.modules.join('-'),
    '外部回復なし',
    '被ダメージなし',
    '外部HPバフなし',
    '0.2秒刻み推定',
    'HP推移',
  ])
}
