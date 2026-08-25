export interface RawSkillLevel {
  name?: string
  description?: string
  duration?: number
  durationType?: string
  skillType?: string
  spData?: {
    spType?: string
    initSp?: number
    spCost?: number
  }
  blackboard?: Array<{ key?: string; value?: number }>
}

export const EFFECT_WINDOWS = [
  'FIXED_DURATION',
  'AMMO',
  'PERMANENT',
  'TOGGLE_OR_MODE',
  'NONE',
  'UNKNOWN',
] as const

export type EffectWindowType = typeof EFFECT_WINDOWS[number]

export const ACTIVATION_TRIGGERS = [
  'MANUAL',
  'AUTO_SP',
  'NEXT_ATTACK',
  'ON_DEPLOY',
  'PASSIVE',
  'CONDITIONAL',
  'UNKNOWN',
] as const

export type ActivationTriggerType = typeof ACTIVATION_TRIGGERS[number]

export const DAMAGE_COMPONENT_TYPES = [
  'BASIC_ATTACK_MODIFIER',
  'BURST',
  'PERIODIC',
  'DEPLOYED_OBJECT',
  'SUMMON',
  'DAMAGE_OVER_TIME',
  'NO_DIRECT_DAMAGE',
  'UNKNOWN',
] as const

export type DamageComponentType = typeof DAMAGE_COMPONENT_TYPES[number]

export const SKILL_CONDITION_TYPES = [
  'CHARGE',
  'OVERCHARGE',
  'PHASE',
  'MODE',
  'TARGET_STATE',
  'DEPLOY_TIME',
  'ACTIVATION_COUNT',
  'OTHER',
] as const

export type SkillConditionType = typeof SKILL_CONDITION_TYPES[number]
export type ClassificationConfidence = 'HIGH' | 'MEDIUM' | 'LOW'
export type ClassificationSource = 'AUTO' | 'MANUAL'

export interface ClassifiedField<T> {
  value: T
  confidence: ClassificationConfidence
  reasons: string[]
  source: ClassificationSource
  automaticValue?: T
}

export interface OutputCapabilities {
  canShowPerHit: boolean
  canShowPerActivationTotal: boolean
  canShowDps: boolean
  canShowWindowTotal: boolean
  canShowSteadyStateDps: boolean
  requiresModeSelection: boolean
  requiresManualModel: boolean
}

export interface SkillClassification {
  effectWindow: ClassifiedField<EffectWindowType>
  activationTrigger: ClassifiedField<ActivationTriggerType>
  damageComponents: ClassifiedField<DamageComponentType[]>
  conditions: ClassifiedField<SkillConditionType[]>
  outputCapabilities: OutputCapabilities
  requiresManualModelReasons: string[]
}

export interface SkillClassificationOverride {
  effectWindow?: EffectWindowType
  activationTrigger?: ActivationTriggerType
  damageComponents?: DamageComponentType[]
  conditions?: SkillConditionType[]
}

export interface SkillRecord {
  id: string
  operatorId: string
  operatorName: string
  rarity: number
  skillIndex: number
  skillId: string
  skillName: string
  description: string
  duration: number | null
  durationType: string
  skillType: string
  spType: string
  initSp: number | null
  spCost: number | null
  classification: SkillClassification
  raw: RawSkillLevel
}
