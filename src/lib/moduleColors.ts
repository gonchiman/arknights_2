/** Shared colors for module identity. Keep damage-component colors separate. */
export const MODULE_BASE_COLORS = Object.freeze({
  none: '#737982',
  X: '#3f7699',
  Y: '#b4763e',
  D: '#80659b',
  A: '#4f8873',
  B: '#b05f6d',
  unknown: '#776d7f',
} as const)

export type ModuleColorKey = keyof typeof MODULE_BASE_COLORS

export interface ModuleColorSeries {
  moduleType?: string | null
  potential?: number
}

/** Positive amounts mix toward white; negative amounts mix toward black. */
export const MODULE_POTENTIAL_SHADES = Object.freeze([0.4, 0.25, 0.1, -0.05, -0.2, -0.35] as const)

function normalizeModulePotential(potential: number): number {
  return Number.isInteger(potential) && potential >= 1 && potential <= 6 ? potential : 1
}

/** null explicitly means unequipped; missing or unrecognized equipped types stay unknown. */
export function getModuleColorKey(moduleType: string | null | undefined): ModuleColorKey {
  if (moduleType === null) return 'none'
  switch (moduleType?.normalize('NFKC').trim().toUpperCase()) {
    case 'X': return 'X'
    case 'Y': return 'Y'
    case 'D':
    case 'Δ':
    case '∆': return 'D'
    case 'A':
    case 'Α': return 'A'
    case 'B':
    case 'Β': return 'B'
    default: return 'unknown'
  }
}

/** Omit potential for a base swatch; charts comparing potentials pass a value from 1 to 6. */
export function getModuleColor(moduleType: string | null | undefined, potential?: number): string {
  const base = MODULE_BASE_COLORS[getModuleColorKey(moduleType)]
  if (potential === undefined) return base
  const index = normalizeModulePotential(potential) - 1
  const amount = MODULE_POTENTIAL_SHADES[index]
  const target = amount >= 0 ? 255 : 0
  return `#${[1, 3, 5].map((offset) => {
    const channel = Number.parseInt(base.slice(offset, offset + 2), 16)
    return Math.round(channel + (target - channel) * Math.abs(amount)).toString(16).padStart(2, '0')
  }).join('')}`
}

/** Use potential shades only when the compared series include different known potentials. */
export function getModuleComparisonColors(series: readonly ModuleColorSeries[]): string[] {
  const potentials = new Set<number>()
  for (const item of series) {
    if (item.potential !== undefined) potentials.add(normalizeModulePotential(item.potential))
  }
  const comparePotentials = potentials.size > 1
  return series.map((item) => getModuleColor(item.moduleType, comparePotentials ? item.potential : undefined))
}
