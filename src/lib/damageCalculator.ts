import type {
  OperatorCombatProfile,
  RawAttributeData,
  RawAttributeKeyFrame,
  RawSkillLevel,
} from '../types/skill'

export const DAMAGE_TYPES = ['PHYSICAL', 'ARTS', 'TRUE'] as const
export type DamageType = typeof DAMAGE_TYPES[number]

export const DAMAGE_TYPE_LABELS: Record<DamageType, string> = {
  PHYSICAL: '物理',
  ARTS: '術',
  TRUE: '確定',
}

export interface OperatorStats {
  attack: number
  attackSpeed: number
  baseAttackTime: number
  attackInterval: number
}

export interface SkillModelDefaults {
  attackMultiplierPercent: number
  hitCount: number
  attackInterval: number
  duration: number
  ammoCount: number
  notes: string[]
}

export interface SkillDamageOutput {
  perHit: number
  perAttack: number
  dps: number | null
  total: number | null
}

export interface DamageCalculationBreakdown {
  attack: number
  damageType: DamageType
  inputDefense: number
  appliedDefense: number
  inputResistance: number
  appliedResistance: number
  afterDefense: number | null
  minimumDamage: number | null
  minimumApplied: boolean
  result: number
}

export type SkillTotalMode = 'DURATION' | 'AMMO' | 'ACTIVATION' | 'NONE'

export interface SkillDamageBreakdown extends SkillDamageOutput {
  baseAttack: number
  attackMultiplierPercent: number
  scaledAttack: number
  hitCount: number
  attackInterval: number
  duration: number
  ammoCount: number
  canShowDps: boolean
  totalMode: SkillTotalMode
  mitigation: DamageCalculationBreakdown
}

export function getOperatorStats(
  profile: OperatorCombatProfile,
  phaseIndex: number,
  level: number,
  trustPercent: number,
): OperatorStats {
  const phase = profile.phases[clamp(Math.round(phaseIndex), 0, Math.max(0, profile.phases.length - 1))]
  const phaseFrames = phase?.attributesKeyFrames ?? []
  const maxLevel = Math.max(1, phase?.maxLevel ?? 1)
  const normalizedLevel = clamp(Math.round(level), 1, maxLevel)
  const trust = clamp(trustPercent, 0, 100)
  const trustFrameMax = Math.max(0, ...profile.favorKeyFrames.map((frame) => frame.level ?? 0))
  const trustFrameLevel = trustFrameMax * trust / 100

  const phaseAttack = interpolateAttribute(phaseFrames, normalizedLevel, 'atk', 0)
  const trustAttack = interpolateAttribute(profile.favorKeyFrames, trustFrameLevel, 'atk', 0)
  const baseAttackTime = interpolateAttribute(phaseFrames, normalizedLevel, 'baseAttackTime', 1)
  const attackSpeed = interpolateAttribute(phaseFrames, normalizedLevel, 'attackSpeed', 100)
  const attackInterval = baseAttackTime * 100 / Math.max(20, attackSpeed)

  return {
    attack: Math.max(0, Math.round(phaseAttack + trustAttack)),
    attackSpeed,
    baseAttackTime,
    attackInterval,
  }
}

export function deriveSkillModel(level: RawSkillLevel, operatorAttackInterval: number): SkillModelDefaults {
  const values = new Map(
    (level.blackboard ?? [])
      .filter((entry): entry is { key: string; value: number } => (
        typeof entry.key === 'string' && typeof entry.value === 'number'
      ))
      .map((entry) => [entry.key.toLowerCase(), entry.value]),
  )
  const notes: string[] = []
  const multiplierEntries = [...values.entries()].filter(([key]) => (
    key === 'atk_scale'
    || key.endsWith('@atk_scale')
    || key === 'damage_scale'
    || key === 'atk'
  ))
  const preferredMultiplier = findValue(values, ['atk_scale', 'attack@atk_scale', 'damage_scale', 'atk'])
  let attackMultiplierPercent = 100

  if (preferredMultiplier) {
    attackMultiplierPercent = preferredMultiplier.key === 'atk'
      ? (1 + preferredMultiplier.value) * 100
      : preferredMultiplier.value * 100
  } else {
    notes.push('攻撃倍率をゲームデータから特定できなかったため、100%を初期値にしています。')
  }

  if (multiplierEntries.length > 1) {
    notes.push('複数の攻撃倍率を持つスキルです。初期版では代表値1つの簡易モデルとして扱います。')
  }

  const hitValue = findValue(values, ['attack@times', 'attack_times', 'times', 'multi_times'])
  const hitCount = hitValue && Number.isFinite(hitValue.value)
    ? clamp(Math.round(hitValue.value), 1, 100)
    : 1
  const attackSpeedBonus = findValue(values, ['attack_speed', 'attack@attack_speed'])?.value ?? 0
  const intervalOffset = findValue(values, ['base_attack_time', 'attack@base_attack_time'])?.value ?? 0
  const attackInterval = Math.max(
    0.05,
    (operatorAttackInterval + intervalOffset) * 100 / Math.max(20, 100 + attackSpeedBonus),
  )
  const duration = typeof level.duration === 'number' && level.duration > 0 ? level.duration : 0
  const ammoValue = findValue(values, ['max_ammo', 'ammo', 'bullet_count', 'bullet'])
  const ammoCount = ammoValue ? clamp(Math.round(ammoValue.value), 0, 999) : 0

  if (level.durationType === 'AMMO' && ammoCount === 0) {
    notes.push('弾薬数を自動取得できませんでした。全弾総量を出す場合は弾数を入力してください。')
  }

  return {
    attackMultiplierPercent: round(attackMultiplierPercent, 2),
    hitCount,
    attackInterval: round(attackInterval, 3),
    duration,
    ammoCount,
    notes,
  }
}

export function calculateDamage(
  rawAttack: number,
  damageType: DamageType,
  enemyDefense: number,
  enemyResistance: number,
): number {
  return calculateDamageBreakdown(rawAttack, damageType, enemyDefense, enemyResistance).result
}

export function calculateDamageBreakdown(
  rawAttack: number,
  damageType: DamageType,
  enemyDefense: number,
  enemyResistance: number,
): DamageCalculationBreakdown {
  const attack = Math.max(0, rawAttack)
  const appliedDefense = Math.max(0, enemyDefense)
  const appliedResistance = clamp(enemyResistance, 0, 95)

  if (damageType === 'TRUE') {
    return {
      attack,
      damageType,
      inputDefense: enemyDefense,
      appliedDefense,
      inputResistance: enemyResistance,
      appliedResistance,
      afterDefense: null,
      minimumDamage: null,
      minimumApplied: false,
      result: attack,
    }
  }

  if (damageType === 'ARTS') {
    return {
      attack,
      damageType,
      inputDefense: enemyDefense,
      appliedDefense,
      inputResistance: enemyResistance,
      appliedResistance,
      afterDefense: null,
      minimumDamage: null,
      minimumApplied: false,
      result: attack * (1 - appliedResistance / 100),
    }
  }

  const afterDefense = attack - appliedDefense
  const minimumDamage = attack * 0.05
  return {
    attack,
    damageType,
    inputDefense: enemyDefense,
    appliedDefense,
    inputResistance: enemyResistance,
    appliedResistance,
    afterDefense,
    minimumDamage,
    minimumApplied: minimumDamage > afterDefense,
    result: Math.max(minimumDamage, afterDefense),
  }
}

export function calculateSkillDamage(
  baseAttack: number,
  damageType: DamageType,
  enemyDefense: number,
  enemyResistance: number,
  model: Omit<SkillModelDefaults, 'notes'>,
  options: {
    canShowDps: boolean
    totalMode: SkillTotalMode
  },
): SkillDamageOutput {
  const breakdown = calculateSkillDamageBreakdown(
    baseAttack,
    damageType,
    enemyDefense,
    enemyResistance,
    model,
    options,
  )
  return {
    perHit: breakdown.perHit,
    perAttack: breakdown.perAttack,
    dps: breakdown.dps,
    total: breakdown.total,
  }
}

export function calculateSkillDamageBreakdown(
  baseAttack: number,
  damageType: DamageType,
  enemyDefense: number,
  enemyResistance: number,
  model: Omit<SkillModelDefaults, 'notes'>,
  options: {
    canShowDps: boolean
    totalMode: SkillTotalMode
  },
): SkillDamageBreakdown {
  const safeBaseAttack = Math.max(0, baseAttack)
  const attackMultiplierPercent = Math.max(0, model.attackMultiplierPercent)
  const hitCount = Math.max(1, model.hitCount)
  const duration = Math.max(0, model.duration)
  const ammoCount = Math.max(0, model.ammoCount)
  const scaledAttack = safeBaseAttack * attackMultiplierPercent / 100
  const mitigation = calculateDamageBreakdown(scaledAttack, damageType, enemyDefense, enemyResistance)
  const perHit = mitigation.result
  const perAttack = perHit * hitCount
  const dps = options.canShowDps && model.attackInterval > 0
    ? perAttack / model.attackInterval
    : null
  let total: number | null = null

  if (options.totalMode === 'DURATION' && dps !== null && duration > 0) {
    total = dps * duration
  } else if (options.totalMode === 'AMMO' && ammoCount > 0) {
    total = perAttack * ammoCount
  } else if (options.totalMode === 'ACTIVATION') {
    total = perAttack
  }

  return {
    baseAttack: safeBaseAttack,
    attackMultiplierPercent,
    scaledAttack,
    hitCount,
    attackInterval: model.attackInterval,
    duration,
    ammoCount,
    canShowDps: options.canShowDps,
    totalMode: options.totalMode,
    mitigation,
    perHit,
    perAttack,
    dps,
    total,
  }
}

export function getDefaultDamageType(profession: string, traitDescription = ''): DamageType {
  if (/確定ダメージ/.test(traitDescription)) return 'TRUE'
  if (/術ダメージ/.test(traitDescription)) return 'ARTS'
  if (/物理ダメージ/.test(traitDescription)) return 'PHYSICAL'
  return profession === 'CASTER' || profession === 'SUPPORT' ? 'ARTS' : 'PHYSICAL'
}

function interpolateAttribute(
  frames: RawAttributeKeyFrame[],
  level: number,
  key: keyof RawAttributeData,
  fallback: number,
): number {
  const usable = frames
    .filter((frame) => typeof frame.level === 'number' && typeof frame.data?.[key] === 'number')
    .sort((a, b) => (a.level ?? 0) - (b.level ?? 0))
  if (usable.length === 0) return fallback

  const first = usable[0]
  const last = usable.at(-1) ?? first
  if (level <= (first.level ?? 0)) return first.data?.[key] as number
  if (level >= (last.level ?? 0)) return last.data?.[key] as number

  const upperIndex = usable.findIndex((frame) => (frame.level ?? 0) >= level)
  const upper = usable[upperIndex]
  const lower = usable[Math.max(0, upperIndex - 1)]
  const lowerLevel = lower.level ?? 0
  const upperLevel = upper.level ?? lowerLevel
  const lowerValue = lower.data?.[key] as number
  const upperValue = upper.data?.[key] as number
  if (upperLevel === lowerLevel) return upperValue

  const progress = (level - lowerLevel) / (upperLevel - lowerLevel)
  return lowerValue + (upperValue - lowerValue) * progress
}

function findValue(values: Map<string, number>, keys: string[]): { key: string; value: number } | null {
  for (const key of keys) {
    const value = values.get(key)
    if (typeof value === 'number' && Number.isFinite(value)) return { key, value }
  }
  return null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
