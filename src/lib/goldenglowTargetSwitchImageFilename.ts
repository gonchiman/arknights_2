import { createChartImageFilename, formatChartFilenameValues, withChartImageAspect } from './chartImageFilename.ts'
import { GOLDENGLOW_BAR_PALETTES, type GoldenglowBarPaletteKey } from './goldenglowTargetSwitchChart.ts'
import type { GoldenglowTargetSwitchGridInput } from './goldenglowTargetSwitchGrid.ts'

export interface GoldenglowTargetSwitchImageBuild {
  skillLevelLabel: string
  moduleType: string | null
  moduleLevel: number
}

/** Keep build names with the input whose results are currently displayed. */
export interface GoldenglowTargetSwitchImageRequest {
  input: GoldenglowTargetSwitchGridInput
  build: GoldenglowTargetSwitchImageBuild
}

export interface GoldenglowTargetSwitchImageOptions {
  chartType: 'bar' | 'line'
  visibleResistances: readonly number[]
  showDecimals: boolean
  barPalette: GoldenglowBarPaletteKey | 'custom'
  customColor: string
}

export function getGoldenglowTargetSwitchImageFilename(
  { input, build }: GoldenglowTargetSwitchImageRequest,
  options: GoldenglowTargetSwitchImageOptions,
): string {
  return withChartImageAspect(createChartImageFilename('GG', [
    `S${input.skillIndex}${build.skillLevelLabel}`,
    '総ダメージ',
    options.chartType === 'bar' ? '切替1集合棒' : '切替1折れ線',
    build.moduleType ? `MOD${build.moduleType}${build.moduleLevel}` : 'MODなし',
    `${input.duration}秒`,
    `HP${formatChartFilenameValues(input.enemyHps)}`,
    `術耐性${formatChartFilenameValues(options.visibleResistances)}`,
    `小数${options.showDecimals ? 3 : 0}桁`,
    options.chartType === 'bar' && `配色${options.barPalette === 'custom'
      ? options.customColor.toLowerCase() : GOLDENGLOW_BAR_PALETTES[options.barPalette].label}`,
    `切替${input.switchDelay}秒`,
    `残り浮遊切替${input.retargetRemainingDrones ? 'あり' : 'なし'}`,
    `試行${input.trials}`,
    `抽選${input.seed}`,
  ]))
}
