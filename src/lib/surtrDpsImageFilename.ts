import { createChartImageFilename } from './chartImageFilename.ts'
import type { SurtrDpsMetric } from './surtrDpsOutput.ts'
import { getSurtrDpsResistanceSamples, normalizeSurtrDpsResistanceRange, type SurtrDpsBarStep, type SurtrDpsResistanceRange } from './surtrDpsResistance.ts'

export interface SurtrDpsImageConditions {
  level: number
  trust: number
  potential: number
  skillLevelLabel: string
  blocking: boolean
  remnantActive?: boolean
  compareBlocking?: boolean
  modules: readonly string[]
  kind?: 'bar' | 'line'
  barStep?: SurtrDpsBarStep
  resistanceRange?: SurtrDpsResistanceRange
  showValues?: boolean
  showResistanceRanks?: boolean
  metric?: SurtrDpsMetric
  baselineLabel?: string
  gridStyle?: 'solid' | 'dashed' | 'none'
  precision?: number
  yAxis?: { mode: 'zero' | 'auto' | 'manual'; min?: number; max?: number }
  selectedResistance?: number | null
}

export function getSurtrDpsImageFilename(settings: SurtrDpsImageConditions): string {
  const kind = settings.kind ?? 'bar'
  const barStep = settings.barStep === 'ratings' ? 'ratings'
    : typeof settings.barStep === 'number' && Number.isInteger(settings.barStep) && settings.barStep >= 1 && settings.barStep <= 100
      ? settings.barStep : 20
  const metric = settings.metric ?? 'total'
  const precision = Number.isInteger(settings.precision) && settings.precision! >= 0 && settings.precision! <= 3
    ? settings.precision! : 0
  const gridStyle = settings.gridStyle ?? 'solid'
  const yAxis = settings.yAxis ?? { mode: 'zero' }
  const selected = settings.selectedResistance
  const range = normalizeSurtrDpsResistanceRange(settings.resistanceRange)
  const rangeLabel = `術耐性${range.min}-${range.max}`
  const extraBar = kind === 'bar' && typeof selected === 'number' && Number.isFinite(selected)
    && selected >= range.min && selected <= range.max && !getSurtrDpsResistanceSamples(barStep, range).includes(selected)
  return createChartImageFilename('スルト_S3_DPS', [
    settings.skillLevelLabel,
    metric === 'difference' ? '基準との差分' : metric === 'percent' ? '増減率' : null,
    metric !== 'total' && settings.baselineLabel && `基準${settings.baselineLabel}`,
    `昇進2Lv${settings.level}`,
    `信頼${settings.trust}`,
    `潜在${settings.potential}`,
    settings.modules.join('-'),
    settings.compareBlocking ? 'ブロック状態比較' : settings.blocking ? '対象を自身でブロック' : '未ブロック',
    '単体',
    settings.remnantActive ? '余燼中' : '余燼なし',
    kind === 'bar' ? barStep === 'ratings'
      ? range.min === 0 && range.max === 100 ? '術耐性ランク代表値' : `${rangeLabel}ランク代表値`
      : `${rangeLabel}刻み${barStep}` : rangeLabel,
    kind === 'bar' ? '集合棒' : '折れ線',
    kind === 'bar' && settings.showValues && '数値あり',
    settings.showResistanceRanks !== false && '術耐性ランク表示',
    extraBar && `追加術耐性${selected}`,
    precision > 0 && `小数${precision}桁`,
    gridStyle !== 'solid' && (gridStyle === 'dashed' ? 'グリッド破線' : 'グリッドなし'),
    yAxis.mode === 'auto' ? 'Y軸自動' : yAxis.mode === 'manual'
      ? `Y軸${finiteBound(yAxis.min)}-${finiteBound(yAxis.max)}` : null,
  ])
}

function finiteBound(value: number | undefined): number | string {
  return typeof value === 'number' && Number.isFinite(value) ? value : '自動'
}

/** Prioritize the distribution's aggregation/scope before optional drawing settings. */
export function getSurtrCombinedImageFilename(dpsFilename: string, histogramFilename: string): string {
  const dps = dpsFilename.replace(/\.png$/i, '').replace(/^スルト_S3_DPS_/, '').split('_')
  const histogram = histogramFilename.replace(/\.png$/i, '').replace(/^敵_術耐性_ヒストグラム_/, '').split('_')
  return createChartImageFilename('スルト_S3_DPSと術耐性分布', [
    ...histogram.slice(0, 2), ...dps, ...histogram.slice(2),
  ])
}
