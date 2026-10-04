import { createChartImageFilename, formatChartFilenameValues } from './chartImageFilename.ts'
import type { SurtrRemnantAttackAssumptions } from './surtrRemnantAttacks.ts'

export interface SurtrRemnantDamageImageConditions extends SurtrRemnantAttackAssumptions {
  potential: number
  blocking: boolean
  modules: readonly string[]
  cts: readonly number[]
  resistances: readonly number[]
}

export function getSurtrRemnantDamageImageFilename(settings: SurtrRemnantDamageImageConditions): string {
  return createChartImageFilename('スルト_余燼総ダメージ', [
    `潜在${settings.potential}`,
    settings.modules.join('-'),
    settings.blocking ? 'ブロック中' : '非ブロック',
    '単体',
    `CT${formatChartFilenameValues(settings.cts)}秒`,
    `術耐性${formatChartFilenameValues(settings.resistances)}`,
    `予備動作${settings.windup}秒`,
    settings.ctCarry === 'time' ? 'CT秒数維持' : 'CT割合維持',
    settings.includeRetreatHit ? '退場時含む' : '退場時除外',
    '集合棒',
  ])
}
