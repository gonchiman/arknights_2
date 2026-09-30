import { createChartImageFilename } from './chartImageFilename.ts'
import type { SurtrDpsMetric } from './surtrDpsOutput.ts'

export interface SurtrDpsImageConditions {
  level: number
  trust: number
  potential: number
  skillLevelLabel: string
  blocking: boolean
  modules: readonly string[]
  kind?: 'bar' | 'line'
  barStep?: number
  metric?: SurtrDpsMetric
  baselineLabel?: string
  gridStyle?: 'solid' | 'dashed' | 'none'
  precision?: number
  yAxis?: { mode: 'zero' | 'auto' | 'manual'; min?: number; max?: number }
  selectedResistance?: number | null
}

export function getSurtrDpsImageFilename(settings: SurtrDpsImageConditions): string {
  const kind = settings.kind ?? 'bar'
  const barStep = Number.isInteger(settings.barStep) && settings.barStep! >= 1 && settings.barStep! <= 100
    ? settings.barStep! : 20
  const metric = settings.metric ?? 'total'
  const precision = Number.isInteger(settings.precision) && settings.precision! >= 0 && settings.precision! <= 3
    ? settings.precision! : 0
  const gridStyle = settings.gridStyle ?? 'solid'
  const yAxis = settings.yAxis ?? { mode: 'zero' }
  const selected = settings.selectedResistance
  const extraBar = kind === 'bar' && typeof selected === 'number' && Number.isFinite(selected)
    && selected >= 0 && selected <= 100 && selected % barStep !== 0
  return createChartImageFilename('スルト_S3_DPS', [
    settings.skillLevelLabel,
    metric === 'difference' ? '基準との差分' : metric === 'percent' ? '増減率' : null,
    metric !== 'total' && settings.baselineLabel && `基準${settings.baselineLabel}`,
    `昇進2Lv${settings.level}`,
    `信頼${settings.trust}`,
    `潜在${settings.potential}`,
    settings.modules.join('-'),
    settings.blocking ? '対象を自身でブロック' : '未ブロック',
    '単体',
    '余燼なし',
    kind === 'bar' ? `術耐性0-100刻み${barStep}` : '術耐性0-100',
    kind === 'bar' ? '集合棒' : '折れ線',
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
