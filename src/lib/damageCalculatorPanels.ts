export interface DamageCalculatorPanelDefaults {
  operatorSearch: boolean
  calculationConditions: boolean
  operatorInfo: boolean
  skillModel: boolean
  results: boolean
  uniqueOutput: boolean
  normalCalculationProcess: boolean
  skillCalculationProcess: boolean
}

export const DAMAGE_CALCULATOR_PANEL_DEFAULTS: DamageCalculatorPanelDefaults = {
  operatorSearch: true,
  calculationConditions: true,
  operatorInfo: false,
  skillModel: true,
  results: true,
  uniqueOutput: true,
  normalCalculationProcess: false,
  skillCalculationProcess: false,
}

export function getDamageCalculatorPanelNumbers(hasUniqueOutput: boolean) {
  return {
    results: '05',
    uniqueOutput: '06',
    normalCalculationProcess: hasUniqueOutput ? '07' : '06',
    skillCalculationProcess: hasUniqueOutput ? '08' : '07',
  }
}
