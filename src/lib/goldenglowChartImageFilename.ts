import { createChartImageFilename, formatChartFilenameValues } from './chartImageFilename.ts'
import type { HpComparisonInput } from './goldenglowTargetSwitchHpComparison.ts'
import type { HpChartImageSnapshot } from '../components/saveGoldenglowTargetSwitchHpChartImage.tsx'

interface ImageBuild {
  id?: string
  moduleType?: string | null
  moduleId?: string
  moduleLevel?: number
  potential?: number
  label?: string
}

export function formatGoldenglowImageBuild(build: ImageBuild): string {
  const type = build.moduleType?.trim() || build.label?.match(/MOD\s+([^\s]+)/i)?.[1]
    || build.moduleId?.match(/(?:^|[-_])([xyz])$/i)?.[1]?.toUpperCase()
  const level = build.moduleLevel ?? build.label?.match(/Lv\.?\s*(\d+)/i)?.[1]
  const module = type ? `${type}${level ?? ''}` : build.moduleId ? build.moduleId : 'なし'
  return `${module}${(build.potential ?? 1) > 1 ? `潜${build.potential}` : ''}`
}

export function formatGoldenglowImageBaseline(builds: readonly ImageBuild[], baselineId: string): string | undefined {
  if (!builds.length) return undefined
  const index = Math.max(0, builds.findIndex(build => build.id === baselineId))
  const name = formatGoldenglowImageBuild(builds[index])
  const duplicate = builds.filter(build => formatGoldenglowImageBuild(build) === name).length > 1
  return `基準${name}${duplicate ? `第${index + 1}列` : ''}`
}

export const goldenglowImageMetrics = { total: '総ダメージ', difference: '差分', ratio: '基準比', growth: '増減率', percent: '増減率' } as const

/** A sweep starting at zero simulates HP 1, followed by the regular HP multiples. */
function formatHpValues(values: readonly number[]): string {
  const tail = values[0] === 1 && values.length > 3 ? formatChartFilenameValues(values.slice(1)) : ''
  return tail.includes('刻み') && values[1] - values[0] !== values[2] - values[1]
    ? `1と${tail}` : formatChartFilenameValues(values)
}

export function getGoldenglowImageDisplayParts(snapshot: {
  metric: 'total' | 'difference' | 'percent'
  series: readonly ImageBuild[]
  baselineId: string
  hideBaseline?: boolean
  digits: number
  showHpRanks?: boolean
  gridStyle?: 'none' | 'solid' | 'dashed'
  notice?: string
}) {
  return [
    snapshot.metric !== 'total' && formatGoldenglowImageBaseline(snapshot.series, snapshot.baselineId),
    snapshot.metric !== 'total' && snapshot.hideBaseline && '基準非表示',
    snapshot.digits > 0 && `小数${snapshot.digits}桁`,
    snapshot.showHpRanks !== false && 'HPランク',
    snapshot.gridStyle === 'solid' ? '補助線実線' : snapshot.gridStyle === 'dashed' ? '補助線破線' : undefined,
    snapshot.notice && '途中結果',
  ]
}

/** Common simulation controls only; generated result arrays never become filenames. */
export function getGoldenglowImageCalculationParts(input: HpComparisonInput) {
  const settings = input.builds[0]?.input
  return settings ? [
    settings.duration != null && `${settings.duration}秒`,
    settings.switchDelay != null && `切替${settings.switchDelay}秒`,
    settings.trials != null && `${settings.trials}回`,
    settings.seed != null && `抽選${settings.seed}`,
  ] : []
}

export function getGoldenglowHpComparisonImageFilename(input: HpComparisonInput, snapshot: HpChartImageSnapshot): string {
  const bar = snapshot.chartKind === 'bar'
  const hps = bar ? snapshot.barHps ?? input.builds[0]?.input.enemyHps ?? [] : input.builds[0]?.input.enemyHps ?? []
  const resistance = input.builds[0]?.input.enemyResistance
  const kind = !bar ? '折れ線' : snapshot.metric === 'total' && snapshot.barMode === 'breakdown' ? '内訳棒'
    : snapshot.metric === 'total' && snapshot.barMode === 'composition' ? '構成比棒' : '集合棒'
  return createChartImageFilename('GG', [
    snapshot.conditions.split('・')[0].replace(/\s+/g, ''),
    goldenglowImageMetrics[snapshot.metric],
    `MOD${snapshot.series.map(formatGoldenglowImageBuild).join('-')}`,
    `HP${formatHpValues(hps)}`,
    resistance != null && `術耐性${resistance}`,
    kind,
    ...getGoldenglowImageDisplayParts(snapshot),
    !bar && (snapshot.minHp !== hps[0] || snapshot.maxHp !== hps.at(-1)) && `X軸${snapshot.minHp}-${snapshot.maxHp}`,
    !bar && (snapshot.yAxisMode === 'manual' && snapshot.manualYAxisRange
      ? `Y軸${snapshot.manualYAxisRange.min}-${snapshot.manualYAxisRange.max}`
      : (snapshot.yAxisMode ?? 'zero') === 'zero' ? 'Y軸0始まり' : 'Y軸自動'),
    ...getGoldenglowImageCalculationParts(input),
  ])
}
