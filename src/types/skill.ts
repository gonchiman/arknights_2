export type SkillCategory =
  | '持続'
  | '弾薬'
  | '永続'
  | '通常攻撃強化'
  | '一撃必殺'
  | '持続＋一撃必殺'
  | '条件分岐'
  | 'その他'
  | '要確認'

export type Confidence = 'high' | 'medium' | 'low'

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
  spCost: number | null
  category: SkillCategory
  confidence: Confidence
  reasons: string[]
  raw: RawSkillLevel
}

export interface ClassificationResult {
  category: SkillCategory
  confidence: Confidence
  reasons: string[]
}
