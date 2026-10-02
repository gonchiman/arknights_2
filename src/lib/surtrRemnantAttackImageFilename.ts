import { createChartImageFilename } from './chartImageFilename.ts'
import type { SurtrRemnantAttackAssumptions } from './surtrRemnantAttacks.ts'
import type { SurtrRemnantChartKind } from './surtrRemnantChart.ts'

export interface SurtrRemnantAttackImageConditions extends SurtrRemnantAttackAssumptions {
  kind: SurtrRemnantChartKind
  step: number
  potential: number
  blocking: boolean
  modules: readonly string[]
  showValues: boolean
  showBoundaries: boolean
}

export function getSurtrRemnantAttackImageFilename(settings: SurtrRemnantAttackImageConditions): string {
  const kindLabel = settings.kind === 'grouped-bar' ? '集合棒' : settings.kind === 'step' ? '階段線' : 'CT区間帯'
  return createChartImageFilename('スルト_余燼命中回数', [
    `潜在${settings.potential}`,
    settings.modules.join('-'),
    settings.blocking ? 'ブロック中' : '非ブロック',
    `予備動作${settings.windup}秒`,
    settings.ctCarry === 'time' ? 'CT秒数維持' : 'CT割合維持',
    settings.includeRetreatHit ? '退場時含む' : '退場時除外',
    kindLabel,
    settings.kind === 'grouped-bar' && `CT刻み${settings.step}秒`,
    settings.kind !== 'step' && settings.showValues && '数値あり',
    settings.kind !== 'grouped-bar' && settings.showBoundaries && '境界CT表示',
  ])
}
