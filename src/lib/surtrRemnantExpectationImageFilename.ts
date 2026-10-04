import { createChartImageFilename, formatChartFilenameValues } from './chartImageFilename.ts'
import type { SurtrRemnantAttackAssumptions } from './surtrRemnantAttacks.ts'

export interface SurtrRemnantExpectationImageConditions extends SurtrRemnantAttackAssumptions {
  potential: number
  blocking: boolean
  modules: readonly string[]
  resistances: readonly number[]
  kind: 'bar' | 'line'
  showValues: boolean
  digits: number
}

export function getSurtrRemnantExpectationImageFilename(settings: SurtrRemnantExpectationImageConditions): string {
  return createChartImageFilename('スルト_余燼総ダメージ期待値', [
    `潜在${settings.potential}`,
    settings.modules.join('-'),
    settings.blocking ? 'ブロック中' : '非ブロック',
    'CT一様',
    `術耐性${formatChartFilenameValues(settings.resistances)}`,
    `予備動作${settings.windup}秒`,
    settings.ctCarry === 'time' ? 'CT秒数維持' : 'CT割合維持',
    settings.includeRetreatHit ? '退場時含む' : '退場時除外',
    settings.kind === 'bar' ? '集合棒' : '折れ線',
    settings.kind === 'bar' && settings.showValues && '数値あり',
    `小数${settings.digits}桁`,
  ])
}
