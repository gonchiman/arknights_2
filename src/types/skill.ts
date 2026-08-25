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
  raw: RawSkillLevel
}
