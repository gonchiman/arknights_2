import type { DamageType, HpDamageType } from './damageCalculator.ts'
import type { CombatDamageKind } from './combatEffectStructure.ts'
import type { PeriodTotalCapability } from './damagePeriodTotal.ts'

/** A skill can replace individual base-attack rules without disabling unrelated traits. */
export type GuardTraitOverride = 'DAMAGE_TYPE' | 'HIT_COUNT' | 'MAX_TARGETS' | 'ATTACK_TARGETING' | 'ATTACK_SCALE' | 'SPLASH_DAMAGE' | 'CHAIN_ATTACK' | 'AFTERSHOCK' | 'NORMAL_ATTACK_ENABLED' | 'STORED_CHARGES'

/** Values in reviewed recipes remain executable data, rather than parsed descriptions. */
export type GuardValue = number | { key: string } | { input: string }
  | { op: 'add' | 'mul' | 'min' | 'max'; args: readonly GuardValue[] }
  | { op: 'if'; input: string; comparison: 'EQ' | 'NE' | 'LT' | 'LTE' | 'GT' | 'GTE'; value: number | string | boolean; yes: GuardValue; no: GuardValue }

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
  /** Stable source identity for explicitly linked damage-derived elemental buildup. */
  id?: string
  label: string
  /** Reviewed provenance; virtual comparison never guesses from a label or array order. */
  role?: 'MAIN' | 'ADDITIONAL'
  damageType: HpDamageType
  /** Required for ELEMENTAL HP damage; buildup is a separate output, never HP damage. */
  damageKind?: Extract<CombatDamageKind, { type: 'ELEMENTAL_DAMAGE' }>
  /** A separate mystic projectile; only this action receives stored-energy modifiers. */
  isStoredCharge?: boolean
  /** A reviewed drone projectile, distinct from the operator's own attack. */
  drone?: {
    sameTargetAttack: GuardValue
    atMaximum?: GuardValue
    maximumMultiplier?: GuardValue
    includeTalentExtraUnits?: boolean
  }
  scale: GuardValue
  hits?: GuardValue
  /** Total equivalent targets per action; omitted means all selected targets. */
  targets?: GuardValue
  attackBonus?: GuardValue
  probability?: GuardValue
  flatDamage?: GuardValue
  /** Applied after mitigation only if the resolved attribute matches (including virtual attacks). */
  damageScaleWhenType?: { damageType: DamageType; scale: GuardValue }
  /** OWNER_ATK_STAT requires a validated actor context; it never inherits the token's ATK bonuses or criticals. */
  basis?: 'ATK' | 'ATK_STAT' | 'OWNER_ATK_STAT' | 'DEF_STAT' | 'TARGET_CURRENT_HP' | 'TARGET_DEFENSE'
  minimumAttackScale?: GuardValue
  timing?: 'PER_ATTACK' | 'PER_SECOND' | 'ON_DEPLOY'
  /** Added skill damage may have its own type/count while the main attack inherits traits. */
  traitOverrides?: readonly GuardTraitOverride[]
}

export interface GuardElementalBuildup {
  id: string
  label: string
  damageKind: Extract<CombatDamageKind, { type: 'ELEMENTAL_BUILDUP' }>
  scale: GuardValue
  /** ATK_STAT never receives attack multipliers, mitigation, or critical effects. */
  basis: { type: 'ATK_STAT' } | { type: 'FIXED' }
    | { type: 'DEALT_DAMAGE'; actionId: string; damageType?: HpDamageType }
    /** Actual HP loss of one deterministic hit, without barriers, healing or death replacement. */
    | { type: 'HP_LOST'; actionId: string; damageType?: HpDamageType; hpBefore: GuardValue }
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
  when?: { input: string; comparison: 'EQ' | 'NE' | 'LT' | 'LTE' | 'GT' | 'GTE'; value: number | string | boolean }
  kind: 'NORMAL' | 'NEXT_ATTACK' | 'SKILL_ACTION'
  /** A separately validated unit supplies base stats and actor-specific passives. */
  actor?: { kind: 'TOKEN'; tokenKey: string }
  /** Fixed skill treatment, evaluated by the shared trait condition rules. */
  attackTreatment?: 'MELEE' | 'RANGED'
  traitOverrides?: readonly GuardTraitOverride[]
  /** Skill-specific multiplication of a structured trait's selected charge amount. */
  traitAttackRatioScale?: GuardValue
  atk?: GuardValue
  /** Reviewed skill DEF bonus for DEF_STAT damage; not an ATK bonus. */
  defenseRatio?: GuardValue
  /** Added after percentage ATK bonuses, before attack-scale multipliers. */
  attackFinalFlat?: GuardValue
  aspd?: GuardValue
  intervalScale?: GuardValue
  intervalAdd?: GuardValue
  /** Explicit fixed ticks are independent of normal attack speed. */
  fixedAttackInterval?: GuardValue
  /** Remaining damage on each bounce; the job trait supplies the default. */
  chainDamageRetention?: GuardValue
  maxTargets?: GuardValue | null
  /** A skill's block-count change; structured multi-target traits read the resulting count. */
  blockCountAdd?: GuardValue
  duration?: GuardValue | 'UNTIL_EXIT'
  /** Explicit coverage of the stage and all damage-bearing passive effects. */
  periodTotal?: PeriodTotalCapability
  /** A reviewed attack can be evaluated even when its reload/return cadence is unresolved. */
  dpsUnsupportedReason?: string
  /** A next-attack skill may include its skill-start effect in this one activation. */
  includesSkillActivation?: boolean
  actions: readonly GuardDamageAction[]
  /** Finite applications evaluated independently from HP damage. */
  elementalBuildups?: readonly GuardElementalBuildup[]
  defenseIgnoreRatio?: GuardValue
  defenseIgnoreFixed?: GuardValue
  resistanceIgnoreFixed?: GuardValue
  /** Enemy debuffs are applied before the attacker's defense/resistance ignore. */
  defenseReductionRatio?: GuardValue
  resistanceReductionRatio?: GuardValue
  defenseReductionFixed?: GuardValue
  /** Removed after enemy percentage reductions, before attacker penetration. */
  defenseReductionFinalFixed?: GuardValue
  resistanceReductionFixed?: GuardValue
  /** Post-mitigation multiplier; distinct from attack scale. */
  damageScale?: GuardValue
  /** Minimum damage as a 0..1 fraction of ATK before attack multipliers; excludes periodic/stat-based actions. */
  minimumDamageRatio?: GuardValue
  /** Per-target limit after mitigation. Currently evaluated for one independent hit only. */
  damageCapPerTarget?: GuardValue
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
  /** Cross-field constraints on a valid selected state, separate from unsupported mechanics. */
  conditionRequirements?: readonly {
    when?: NonNullable<GuardStage['when']>
    condition: NonNullable<GuardStage['when']>
    reason: string
    /** A reviewed scope restriction, as opposed to an invalid combination of inputs. */
    supportedCondition?: string
  }[]
  stages: readonly GuardStage[]
  notes?: readonly string[]
}

export interface GuardPassiveModifiers {
  elementalBuildups?: GuardElementalBuildup[]
  attackRatio: number
  attackFlat: number
  attackFinalFlat?: number
  attackScale: number
  storedChargeScale?: number
  extraStoredCharges?: number
  droneMaximumMultiplier?: number
  extraDrones?: number
  attackSpeed: number
  attackIntervalAdd?: number
  /** Additive ATK on the proc branch, before attack scales and enemy mitigation. */
  criticalAttackRatio?: number
  /** Defense penetration on the single supported probabilistic attack branch. */
  criticalDefenseIgnoreRatio?: number
  /** Guaranteed per-hit fraction of buffed ATK, before attack-scale multipliers. */
  minimumDamageRatio?: number
  damageScale: number
  /** Added per arts hit after attack multipliers, before resistance mitigation. */
  artsDamageFlatAddition?: number
  damageCapPerTarget?: number
  weakpointDamage?: boolean
  splashDamageScale?: number
  defenseIgnoreRatio: number
  /** Guaranteed penetration for ATTACK/CURRENT_EVENT only, excluding stat-based DOT. */
  attackDefenseIgnoreRatio?: number
  defenseIgnoreFixed: number
  resistanceIgnoreFixed: number
  resistanceIgnoreRatio: number
  resistanceReductionRatio?: number
  defenseReductionRatio: number
  defenseReductionFixed?: number
  defenseReductionFinalFixed?: number
  resistanceReductionFixed?: number
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
