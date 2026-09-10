import type { GoldenglowComparisonBuild } from './goldenglowPerformanceComparison.ts'

export interface GoldenglowPerformancePreset {
  id: string
  label: string
  builds: GoldenglowComparisonBuild[]
}

export function buildGoldenglowPerformancePresets(moduleChoices: readonly {
  id: string
  label: string
  levels: readonly number[]
  unlocked: boolean
}[]): GoldenglowPerformancePreset[] {
  return [
    {
      id: 'modules',
      label: 'モジュール比較（潜在1）',
      builds: [
        { id: 'default-off', moduleId: '', moduleLevel: 3, potential: 1 },
        ...moduleChoices.map((choice) => ({
          id: `default-${choice.id}`,
          moduleId: choice.id,
          moduleLevel: choice.levels.at(-1) ?? 3,
          potential: 1,
        })),
      ],
    },
    potentialPreset('potential-off', '潜在比較：未装備', '', 3),
    ...moduleChoices.filter((choice) => choice.unlocked && choice.levels.length > 0).map((choice) => {
      const level = choice.levels.at(-1)!
      return potentialPreset(`potential-${choice.id}`, `潜在比較：${choice.label}（Lv.${level}）`, choice.id, level)
    }),
  ]
}

function potentialPreset(id: string, label: string, moduleId: string, moduleLevel: number): GoldenglowPerformancePreset {
  return {
    id,
    label,
    builds: Array.from({ length: 6 }, (_, index) => {
      const potential = index + 1
      return { id: `${id}-${potential}`, moduleId, moduleLevel, potential }
    }),
  }
}
