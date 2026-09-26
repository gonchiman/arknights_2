import type { ResistanceComparisonInput } from './goldenglowResistanceComparison.ts'
import type { ResistanceChartImageSnapshot } from '../components/saveGoldenglowResistanceComparisonImage.tsx'
import { createChartImageFilename } from './chartImageFilename.ts'

/** Commas, Japanese commas and whitespace are accepted; reject partial or duplicate input. */
export function parseComparisonValues(text: string, label: string, min: number, max: number, maxCount: number): { values: number[]; error: string | null } {
  const normalized = text.normalize('NFKC').trim()
  if (!normalized) return { values: [], error: `${label}を入力してください。` }
  const values = normalized.split(/[,、\s]+/).map(value => value === '' ? NaN : Number(value))
  if (values.some(value => !Number.isSafeInteger(value) || value < min || value > max)) {
    return { values: [], error: `${label}は${min.toLocaleString('ja-JP')}〜${max.toLocaleString('ja-JP')}の整数をカンマで区切って入力してください。` }
  }
  if (new Set(values).size !== values.length) return { values: [], error: `${label}に同じ値が重複しています。` }
  if (values.length > maxCount) return { values: [], error: `${label}は${maxCount}点以内にしてください。` }
  return { values: values.sort((a, b) => a - b), error: null }
}

/** Only the effective multi-RES settings and the frozen displayed results identify the image. */
export function getResistanceComparisonImageFilename(input: ResistanceComparisonInput, snapshot: ResistanceChartImageSnapshot): Promise<string> {
  return createChartImageFilename(`goldenglow-${snapshot.conditions}-resistance-comparison-${snapshot.metric}`, {
    builds: input.builds.map(build => {
      const { enemyResistance: ignoredResistance, ...settings } = build.input
      void ignoredResistance
      return { moduleType: build.moduleType ?? null, potential: build.potential ?? 1, label: build.label, settings }
    }),
    enemyResistances: input.enemyResistances,
    chart: {
      title: snapshot.title, conditions: snapshot.conditions, notice: snapshot.notice,
      metric: snapshot.metric, digits: snapshot.digits,
      baseline: snapshot.metric === 'total' ? null : snapshot.series.findIndex(series => series.id === snapshot.baselineId),
      hideBaseline: snapshot.metric !== 'total' && snapshot.hideBaseline,
      enemyHps: snapshot.enemyHps, enemyResistances: snapshot.enemyResistances,
      showHpRanks: snapshot.showHpRanks, gridStyle: snapshot.gridStyle,
      series: snapshot.series.map(series => ({ label: series.label, moduleType: series.moduleType ?? null,
        potential: series.potential ?? 1, points: series.points.map(({ enemyHp, enemyResistance, value }) => ({ enemyHp, enemyResistance, value })) })),
    },
  })
}
