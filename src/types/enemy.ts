export const ENEMY_LEVEL_TYPES = ['NORMAL', 'ELITE', 'BOSS', 'UNKNOWN'] as const

export type EnemyLevelType = typeof ENEMY_LEVEL_TYPES[number]

export interface EnemyStats {
  maxHp: number | null
  attack: number | null
  defense: number | null
  magicResistance: number | null
  moveSpeed: number | null
  attackSpeed: number | null
  baseAttackTime: number | null
  massLevel: number | null
}

export interface EnemyRatings {
  endurance: string | null
  attack: string | null
  defense: string | null
  resistance: string | null
}

export interface EnemyRecord {
  id: string
  index: string
  sortId: number
  name: string
  levelType: EnemyLevelType
  description: string
  abilities: string[]
  damageTypes: string[]
  attackWay: string | null
  lifePointReduce: number | null
  databaseLevel: number | null
  databaseLevelCount: number
  statusImmunities: string[]
  ratings: EnemyRatings
  stats: EnemyStats
}
