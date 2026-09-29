import type { ResistanceComparisonInput } from './goldenglowResistanceComparison.ts'
import type { ResistanceChartImageSnapshot } from '../components/saveGoldenglowResistanceComparisonImage.tsx'
import { createChartImageFilename, formatChartFilenameValues } from './chartImageFilename.ts'
import { formatGoldenglowImageBuild, getGoldenglowImageCalculationParts, getGoldenglowImageDisplayParts, goldenglowImageMetrics } from './goldenglowChartImageFilename.ts'

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

/** Name the frozen chart's conditions, without serializing calculated result values. */
export function getResistanceComparisonImageFilename(input: ResistanceComparisonInput, snapshot: ResistanceChartImageSnapshot): string {
  return createChartImageFilename('GG', [
    snapshot.conditions.replace(/\s+/g, ''),
    goldenglowImageMetrics[snapshot.metric],
    `MOD${snapshot.series.map(formatGoldenglowImageBuild).join('-')}`,
    `HP${formatChartFilenameValues(snapshot.enemyHps)}`,
    `術耐性${formatChartFilenameValues(snapshot.enemyResistances)}`,
    '集合棒',
    ...getGoldenglowImageDisplayParts(snapshot),
    ...getGoldenglowImageCalculationParts(input),
  ])
}
