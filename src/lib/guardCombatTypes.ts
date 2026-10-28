import type { DamageType } from './damageCalculator.ts'

/** Values in reviewed recipes remain executable data, rather than parsed descriptions. */
export type GuardValue = number | { key: string } | { input: string }
  | { op: 'add' | 'mul' | 'min' | 'max'; args: readonly GuardValue[] }
  | { op: 'if'; input: string; comparison: 'EQ' | 'LT' | 'LTE' | 'GT' | 'GTE'; value: number | string | boolean; yes: GuardValue; no: GuardValue }

export interface GuardInput {
  key: string
  label: string
  kind: 'number' | 'boolean' | 'select'
  defaultValue: number | boolean | string
  min?: number
  max?: number
  step?: number
  options?: readonly { value: string | boolean | number; label: string }[]
}

export interface GuardDamageAction {
  label: string
  damageType: DamageType
  scale: GuardValue
  hits?: GuardValue
  /** Total equivalent targets per action; omitted means all selected targets. */
  targets?: GuardValue
  attackBonus?: GuardValue
  probability?: GuardValue
  flatDamage?: GuardValue
  /** Attack-scaled damage is the default. */
  basis?: 'ATK' | 'TARGET_CURRENT_HP'
  minimumAttackScale?: GuardValue
  timing?: 'PER_ATTACK' | 'PER_SECOND' | 'ON_DEPLOY'
}

export type GuardCalculationSection = 'スキル' | '特性' | `素質${number}`

export interface GuardCalculationIssue {
  readonly id: string
  readonly reason: string
  readonly relatedSections: readonly GuardCalculationSection[]
}

export interface GuardStage {
  id: string
  label: string
  when?: { input: string; comparison: 'EQ' | 'LT' | 'LTE' | 'GT' | 'GTE'; value: number | string | boolean }
  kind: 'NORMAL' | 'NEXT_ATTACK' | 'SKILL_ACTION'
  atk?: GuardValue
  aspd?: GuardValue
  intervalScale?: GuardValue
  intervalAdd?: GuardValue
  maxTargets?: GuardValue | null
  duration?: GuardValue | 'UNTIL_EXIT'
  actions: readonly GuardDamageAction[]
  defenseIgnoreRatio?: GuardValue
  defenseIgnoreFixed?: GuardValue
  resistanceIgnoreFixed?: GuardValue
  /** Effects that cannot be inferred from text/data block numerical output explicitly. */
  unresolved?: readonly string[]
  /** Stable identities link a skill-stage blocker to any affected passive effects. */
  calculationIssues?: readonly GuardCalculationIssue[]
  notes?: readonly string[]
}

export interface GuardSkillRecipe {
  operatorId: string
  skillIndex: number
  inputs: readonly GuardInput[]
  stages: readonly GuardStage[]
  notes?: readonly string[]
}

export interface GuardPassiveModifiers {
  attackRatio: number
  attackFlat: number
  attackScale: number
  attackSpeed: number
  damageScale: number
  splashDamageScale?: number
  defenseIgnoreRatio: number
  defenseIgnoreFixed: number
  resistanceIgnoreFixed: number
  resistanceIgnoreRatio: number
  defenseReductionRatio: number
  critChance: number
  critScale: number
  additionalActions: GuardDamageAction[]
  /** Display metadata comes from the same branch that applies each modifier. */
  evaluations: {
    source: string
    sourceKind?: 'TRAIT' | 'TALENT'
    talentIndex?: number
    item: string
    value: string
    status: 'APPLIED' | 'CONDITION_FALSE' | 'NOT_RELEVANT' | 'UNSUPPORTED'
    reason: string
    probability?: number
    timing?: string
    condition?: string
  }[]
  blockers: string[]
  notes: string[]
}

export interface GuardSource {
  id: string
  name: string
  subProfessionId: string
  trait: string
  talents: unknown[]
  skills: { skillIndex: number; skillId: string; supported: boolean; raw: import('../types/skill.ts').RawSkillLevel }[]
}

export type GuardConditions = Readonly<Record<string, number | string | boolean | undefined>>
