export interface DamageCalculatorPanelDefaults {
  operatorSearch: boolean
  calculationConditions: boolean
  operatorInfo: boolean
  skillModel: boolean
  commonOutput: boolean
  subProfessionOutput: boolean
  operatorOutput: boolean
  skillOutput: boolean
  normalCalculationProcess: boolean
  skillCalculationProcess: boolean
}

export const DAMAGE_OUTPUT_PANELS = {
  common: { number: '05', title: '共通出力' },
  subProfession: { number: '06', title: '職分固有出力' },
  operator: { number: '07', title: 'オペレーター固有出力' },
  skill: { number: '08', title: 'スキル固有出力' },
} as const

export const DAMAGE_CALCULATOR_PANEL_DEFAULTS: DamageCalculatorPanelDefaults = {
  operatorSearch: true,
  calculationConditions: true,
  operatorInfo: false,
  skillModel: false,
  commonOutput: true,
  subProfessionOutput: true,
  operatorOutput: true,
  skillOutput: true,
  normalCalculationProcess: false,
  skillCalculationProcess: false,
}

export function getDamageCalculatorPanelNumbers() {
  return {
    commonOutput: DAMAGE_OUTPUT_PANELS.common.number,
    subProfessionOutput: DAMAGE_OUTPUT_PANELS.subProfession.number,
    operatorOutput: DAMAGE_OUTPUT_PANELS.operator.number,
    skillOutput: DAMAGE_OUTPUT_PANELS.skill.number,
    normalCalculationProcess: '09',
    skillCalculationProcess: '10',
  }
}

export function getDamageOutputPanelState(hasOutput: boolean, requestedOpen: boolean) {
  return {
    open: hasOutput && requestedOpen,
    disabled: !hasOutput,
  }
}
