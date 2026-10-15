/** Categorical colors for independent HP comparison conditions. */
export const SURTR_DURATION_LINE_COLORS: readonly string[] = [
  '#737982', '#b4763e', '#417b8c', '#8b6f9e',
  '#5f8666', '#b45c65', '#6679ad', '#9b873e',
]

export interface SurtrDurationLineAppearance {
  color: string
  defaultColor: string
}

export function getSurtrDurationDefaultLineColor(id: string): string {
  const initialIds = ['baseline', 'default-sarkaz', 'default-ansel']
  const initialIndex = initialIds.indexOf(id)
  const lineNumber = /^line-(\d+)$/.exec(id)
  const index = initialIndex >= 0 ? initialIndex : lineNumber ? Number(lineNumber[1]) + 2 : 0
  return SURTR_DURATION_LINE_COLORS[index % SURTR_DURATION_LINE_COLORS.length]
}

export function getNextSurtrDurationLineColor(usedColors: readonly string[]): string {
  const used = new Set(usedColors.map(color => color.toLowerCase()))
  return SURTR_DURATION_LINE_COLORS.find(color => !used.has(color))
    ?? SURTR_DURATION_LINE_COLORS[usedColors.length % SURTR_DURATION_LINE_COLORS.length]
}
