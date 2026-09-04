export interface DamageCalculatorPanelDefaults {
  operatorSearch: boolean
  calculationConditions: boolean
  operatorInfo: boolean
  skillModel: boolean
  damageResult: boolean
  operatorOutput: boolean
  skillOutput: boolean
  normalCalculationProcess: boolean
  skillCalculationProcess: boolean
}

export const DAMAGE_OUTPUT_PANELS = {
  result: {
    number: '05',
    titles: {
      DEFAULT: 'デフォルト出力',
      SUB_PROFESSION: '職分固有出力',
    },
  },
  operator: { number: '06', title: 'オペレーター固有出力' },
  skill: { number: '07', title: 'スキル固有出力' },
} as const

export type PrimaryDamageOutputKind = 'DEFAULT' | 'SUB_PROFESSION'

export const DAMAGE_CALCULATOR_PANEL_DEFAULTS: DamageCalculatorPanelDefaults = {
  operatorSearch: true,
  calculationConditions: true,
  operatorInfo: false,
  skillModel: false,
  damageResult: true,
  operatorOutput: true,
  skillOutput: true,
  normalCalculationProcess: false,
  skillCalculationProcess: false,
}

export function getDamageCalculatorPanelNumbers() {
  return {
    damageResult: DAMAGE_OUTPUT_PANELS.result.number,
    operatorOutput: DAMAGE_OUTPUT_PANELS.operator.number,
    skillOutput: DAMAGE_OUTPUT_PANELS.skill.number,
    normalCalculationProcess: '08',
    skillCalculationProcess: '09',
  }
}

export function getPrimaryDamageOutputKind(
  hasSubProfessionOutput: boolean,
): PrimaryDamageOutputKind {
  return hasSubProfessionOutput ? 'SUB_PROFESSION' : 'DEFAULT'
}

export function getPrimaryDamageOutputTitle(kind: PrimaryDamageOutputKind) {
  return DAMAGE_OUTPUT_PANELS.result.titles[kind]
}

export function getDamageOutputPanelState(hasOutput: boolean, requestedOpen: boolean) {
  return {
    open: hasOutput && requestedOpen,
    disabled: !hasOutput,
  }
}
