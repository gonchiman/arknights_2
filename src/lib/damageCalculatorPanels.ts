export interface DamageCalculatorPanelDefaults {
  operatorSearch: boolean
  calculationConditions: boolean
  operatorInfo: boolean
  skillModel: boolean
  results: boolean
  uniqueOutput: boolean
  sensitivity: boolean
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
  sensitivity: true,
  normalCalculationProcess: false,
  skillCalculationProcess: false,
}
