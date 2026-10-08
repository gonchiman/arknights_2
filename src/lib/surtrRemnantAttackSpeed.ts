import type { OperatorPassives } from './operatorProfile.ts'

const REMNANT_SPEED_KEY = 'surtr_t_2[withdraw].attack_speed'

/** Read the selected Remnant talent after module and potential application. */
export function getSurtrRemnantAttackSpeedBonus(
  passives: OperatorPassives,
  moduleType: 'X' | 'Y' | null,
  moduleLevel: number,
): number | null {
  const talent = passives.sources.find((source) => (
    source.sourceKind === 'TALENT' && source.talentIndex === 1
  ))
  if (!talent) return null
  const entry = talent.blackboard.find((item) => item.key?.toLowerCase() === REMNANT_SPEED_KEY)
  // No equipment, X and Y Lv1 have no conditional speed field in the data.
  // Upgraded Y requires it; missing data must not erase its speed bonus.
  if (!entry) return moduleType === 'Y' && moduleLevel > 1 ? null : 0
  const bonus = entry.value
  return typeof bonus === 'number' && Number.isFinite(bonus) && bonus >= 0 ? bonus : null
}
