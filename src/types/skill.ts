export interface RawBlackboardEntry {
  key?: string
  value?: number
  valueStr?: string | null
}

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
  blackboard?: RawBlackboardEntry[]
}

export interface RawAttributeData {
  maxHp?: number
  atk?: number
  def?: number
  magicResistance?: number
  cost?: number
  blockCnt?: number
  moveSpeed?: number
  attackSpeed?: number
  baseAttackTime?: number
  respawnTime?: number
  hpRecoveryPerSec?: number
  spRecoveryPerSec?: number
  maxDeployCount?: number
}

export interface RawAttributeKeyFrame {
  level?: number
  data?: RawAttributeData
}

export interface RawCharacterPhase {
  maxLevel?: number
  attributesKeyFrames?: RawAttributeKeyFrame[]
}

export interface RawUnlockCondition {
  phase?: string
  level?: number
}

export interface RawTraitCandidate {
  unlockCondition?: RawUnlockCondition
  requiredPotentialRank?: number
  blackboard?: RawBlackboardEntry[]
  overrideDescripton?: string | null
  overrideDescription?: string | null
  prefabKey?: string | null
  rangeId?: string | null
}

export interface RawCharacterTrait {
  candidates?: RawTraitCandidate[]
}

export interface RawTalentCandidate {
  unlockCondition?: RawUnlockCondition
  requiredPotentialRank?: number
  prefabKey?: string | null
  name?: string | null
  description?: string | null
  rangeId?: string | null
  blackboard?: RawBlackboardEntry[]
  tokenKey?: string | null
  isHideTalent?: boolean
}

export interface RawCharacterTalent {
  candidates?: RawTalentCandidate[]
}

export interface RawPotentialRank {
  type?: string
  description?: string | null
  buff?: RawPotentialBuff | null
}

export interface RawPotentialBuff {
  attributes?: RawPotentialAttributes | null
}

export interface RawPotentialAttributes {
  attributeModifiers?: RawPotentialAttributeModifier[] | null
}

export interface RawPotentialAttributeModifier {
  attributeType?: string | number
  formulaItem?: string | number
  value?: number
  loadFromBlackboard?: boolean
  fetchBaseValueFromSourceEntity?: boolean
}

export interface RawOperatorModule {
  uniEquipId?: string
  uniEquipName?: string | null
  uniEquipDesc?: string | null
  type?: string
  typeIcon?: string | null
  typeName1?: string | null
  typeName2?: string | null
  unlockEvolvePhase?: string | null
  unlockLevel?: number
  charEquipOrder?: number
  isSpecialEquip?: boolean
  phases?: RawOperatorModulePhase[]
}

export interface RawOperatorModulePhase {
  equipLevel?: number
  parts?: RawOperatorModulePart[]
  attributeBlackboard?: RawBlackboardCollection
  tokenAttributeBlackboard?: Record<string, RawBlackboardCollection>
}

export interface RawOperatorModulePart {
  target?: string
  isToken?: boolean
  addOrOverrideTalentDataBundle?: {
    candidates?: RawOperatorModuleTalentCandidate[] | null
  }
  overrideTraitDataBundle?: {
    candidates?: RawOperatorModuleTraitCandidate[] | null
  }
}

export interface RawOperatorModuleTraitCandidate {
  additionalDescription?: string | null
  overrideDescripton?: string | null
  overrideDescription?: string | null
  unlockCondition?: RawUnlockCondition
  requiredPotentialRank?: number
  prefabKey?: string | null
  blackboard?: RawBlackboardCollection
}

export interface RawOperatorModuleTalentCandidate {
  upgradeDescription?: string | null
  description?: string | null
  name?: string | null
  talentIndex?: number
  unlockCondition?: RawUnlockCondition
  requiredPotentialRank?: number
  prefabKey?: string | null
  tokenKey?: string | null
  isHideTalent?: boolean
  blackboard?: RawBlackboardCollection
}

export type RawBlackboardCollection = RawBlackboardEntry[] | Record<string, number | string | null>

export interface OperatorCombatProfile {
  phases: RawCharacterPhase[]
  favorKeyFrames: RawAttributeKeyFrame[]
  trait?: RawCharacterTrait | null
  talents?: RawCharacterTalent[]
  potentialRanks?: RawPotentialRank[]
  modules?: RawOperatorModule[]
  traitDescription?: string
  subProfessionTraitDescription?: string
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
  profession: string
  professionLabel: string
  subProfessionId: string
  subProfessionName: string
  nameInitial: OperatorInitial
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
  skillLevels: RawSkillLevel[]
  operatorProfile: OperatorCombatProfile
  raw: RawSkillLevel
}

export const OPERATOR_INITIALS = [
  'A_ROW',
  'K_ROW',
  'S_ROW',
  'T_ROW',
  'N_ROW',
  'H_ROW',
  'M_ROW',
  'Y_ROW',
  'R_ROW',
  'W_ROW',
  'LATIN',
  'NUMBER',
  'OTHER',
] as const

export type OperatorInitial = typeof OPERATOR_INITIALS[number]
