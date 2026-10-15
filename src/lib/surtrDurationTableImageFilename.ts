import { createChartImageFilename, withChartImageAspect } from './chartImageFilename.ts'
import { getSurtrDurationImageFilename, type SurtrDurationImageConditions } from './surtrDurationImageFilename.ts'

export interface SurtrDurationTableImageConditions extends SurtrDurationImageConditions {
  step: 1 | 5
  precision: number
}

export function getSurtrDurationTableImageFilename(settings: SurtrDurationTableImageConditions, aspectRatio?: number): string {
  const base = getSurtrDurationImageFilename(settings).replace(/\.png$/i, '')
  return withChartImageAspect(createChartImageFilename(base, [
    'テーブル', `${settings.step}秒間隔`, `残HP率小数${settings.precision}桁`,
  ]), aspectRatio)
}
