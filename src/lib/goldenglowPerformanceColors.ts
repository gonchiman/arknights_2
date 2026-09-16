import type { GoldenglowComparisonBuild } from './goldenglowPerformanceComparison.ts'

export type GoldenglowPerformanceColorScheme = 'A' | 'B' | 'C'

export const GOLDENGLOW_PERFORMANCE_COLOR_SCHEMES = [
  { id: 'A', label: 'A：元の色・濃淡くっきり' },
  { id: 'B', label: 'B：元の色・穏やか' },
  { id: 'C', label: 'C：グレー・青・橙' },
] as const satisfies readonly { id: GoldenglowPerformanceColorScheme; label: string }[]

type ModuleColorKey = 'none' | 'X' | 'Y' | 'unknown'

const originalModuleColors: Record<ModuleColorKey, string> = {
  none: '#58758a',
  X: '#95615d',
  Y: '#64806b',
  unknown: '#776d7f',
}

const colorSchemes = {
  A: {
    colors: originalModuleColors,
    shades: [0.4, 0.25, 0.1, -0.05, -0.2, -0.35],
  },
  B: {
    colors: originalModuleColors,
    shades: [0.25, 0.16, 0.07, -0.02, -0.11, -0.2],
  },
  C: {
    colors: { none: '#737982', X: '#3f7699', Y: '#b4763e', unknown: '#776d7f' },
    shades: [0.4, 0.25, 0.1, -0.05, -0.2, -0.35],
  },
} as const

/** Module identity determines the hue; potential determines its fixed shade. */
export function getGoldenglowPerformanceColor(
  build: Pick<GoldenglowComparisonBuild, 'moduleId' | 'potential'>,
  choices: readonly { id: string; type: string }[],
  scheme: GoldenglowPerformanceColorScheme,
): string {
  const moduleType = choices.find((choice) => choice.id === build.moduleId)
    ?.type.normalize('NFKC').trim().toUpperCase()
  const moduleKey: ModuleColorKey = !build.moduleId
    ? 'none'
    : moduleType === 'X' || moduleType === 'Y' ? moduleType : 'unknown'
  const potentialIndex = Number.isInteger(build.potential) && build.potential >= 1 && build.potential <= 6
    ? build.potential - 1 : 0
  const { colors, shades } = colorSchemes[scheme]
  const base = colors[moduleKey]
  const amount = shades[potentialIndex]
  const target = amount >= 0 ? 255 : 0
  const weight = Math.abs(amount)

  return `#${[1, 3, 5].map((offset) => {
    const channel = Number.parseInt(base.slice(offset, offset + 2), 16)
    return Math.round(channel + (target - channel) * weight).toString(16).padStart(2, '0')
  }).join('')}`
}
