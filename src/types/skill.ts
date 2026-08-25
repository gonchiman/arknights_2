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

export const SKILL_EFFECT_TYPES = [
  'TIMED',
  'AMMO',
  'PERMANENT',
  'NEXT_ATTACK',
  'TRAP',
  'INSTANT',
  'PASSIVE',
  'UNKNOWN',
] as const

export type SkillEffectType = typeof SKILL_EFFECT_TYPES[number]
export type ClassificationConfidence = 'HIGH' | 'MEDIUM' | 'LOW'
export type SkillOutputMode = 'SKILL_DPS' | 'PER_USE' | 'NORMAL_DPS' | 'REVIEW'

export interface SkillClassification {
  type: SkillEffectType
  label: string
  outputMode: SkillOutputMode
  confidence: ClassificationConfidence
  reasons: string[]
  source: 'AUTO' | 'MANUAL'
  automaticType?: SkillEffectType
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
