export interface DamageCalculatorPanelDefaults {
  operatorSearch: boolean
  calculationConditions: boolean
  operatorInfo: boolean
  skillModel: boolean
  output: boolean
  normalCalculationProcess: boolean
  skillCalculationProcess: boolean
}

export type DamageOutputSource = 'SKILL' | 'OPERATOR' | 'SUB_PROFESSION' | 'COMMON'
export type DamageOutputTableKind = 'DEFAULT' | 'ATTACK_COUNT' | 'EXPLOSION'

export interface DamageOutputDefinition {
  source: DamageOutputSource
  tables: DamageOutputTableKind[]
}

export interface DamageOutputSelection {
  operatorId: string
  skillIndex: number
  subProfessionId: string
  target: 'NORMAL' | 'SKILL'
}

const DAMAGE_OUTPUT_TABLE_TITLES = {
  DEFAULT: 'メイン出力',
  ATTACK_COUNT: '攻撃回数別ダメージ',
  EXPLOSION: '爆発ダメージ',
} as const

export interface DamageOutputPanel {
  id: DamageOutputTableKind
  number: string
  title: typeof DAMAGE_OUTPUT_TABLE_TITLES[DamageOutputTableKind]
}

export const DAMAGE_CALCULATOR_PANEL_DEFAULTS: DamageCalculatorPanelDefaults = {
  operatorSearch: true,
  calculationConditions: true,
  operatorInfo: false,
  skillModel: false,
  output: true,
  normalCalculationProcess: false,
  skillCalculationProcess: false,
}

/** Resolve by identity so an unavailable specialized result cannot fall back to a generic formula. */
export function resolveDamageOutputDefinition(selection: DamageOutputSelection): DamageOutputDefinition {
  const isGoldenglow = selection.operatorId === 'char_377_gdglow'
  if (isGoldenglow && selection.target === 'SKILL' && selection.skillIndex === 3) {
    return { source: 'SKILL', tables: ['DEFAULT', 'ATTACK_COUNT', 'EXPLOSION'] }
  }
  if (isGoldenglow) {
    return {
      source: 'OPERATOR',
      tables: selection.target === 'SKILL'
        ? ['DEFAULT', 'ATTACK_COUNT', 'EXPLOSION']
        : ['DEFAULT', 'ATTACK_COUNT'],
    }
  }
  if (selection.subProfessionId === 'funnel') {
    return { source: 'SUB_PROFESSION', tables: ['DEFAULT', 'ATTACK_COUNT'] }
  }
  return { source: 'COMMON', tables: ['DEFAULT'] }
}

export function getDamageOutputPanels(definition: DamageOutputDefinition): DamageOutputPanel[] {
  return definition.tables.map((id, index) => ({
    id,
    number: formatPanelNumber(5 + index),
    title: DAMAGE_OUTPUT_TABLE_TITLES[id],
  }))
}

export function getDamageCalculatorPanelNumbers(outputCount: number = 1) {
  return {
    normalCalculationProcess: formatPanelNumber(5 + outputCount),
    skillCalculationProcess: formatPanelNumber(6 + outputCount),
  }
}

function formatPanelNumber(number: number): string {
  return String(number).padStart(2, '0')
}
