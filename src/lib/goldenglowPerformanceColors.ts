import type { GoldenglowComparisonBuild } from './goldenglowPerformanceComparison.ts'
import { getModuleColor } from './moduleColors.ts'

/** Module identity determines the hue; potential determines its fixed shade. */
export function getGoldenglowPerformanceColor(
  build: Pick<GoldenglowComparisonBuild, 'moduleId' | 'potential'>,
  choices: readonly { id: string; type: string }[],
): string {
  return getModuleColor(build.moduleId ? choices.find((choice) => choice.id === build.moduleId)?.type : null, build.potential)
}
