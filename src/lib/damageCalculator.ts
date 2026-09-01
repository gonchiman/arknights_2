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
  baseAttackSpeed: number
  attackSpeedBonus: number
  attackSpeed: number
  baseAttackTime: number
  attackInterval: number
  baseAttackBreakdown: BaseAttackBreakdown
}

export interface OperatorStatModifiers {
  attackSpeedBonus?: number
  moduleAttack?: number
}

export interface BaseAttackBreakdown {
  levelAttack: number
  trustAttack: number
  potentialAttack: number
  moduleAttack: number
  beforeRounding: number
  result: number
}

export interface AttackPipelineInput {
  directAddition?: number
  directMultiplierPercent?: number
  finalAddition?: number
  finalMultiplier?: number
  attackScale?: number
}

export interface AttackPipelineBreakdown {
  baseAttack: number
  directAddition: number
  afterDirectAddition: number
  directMultiplierPercent: number
  afterDirectMultiplier: number
  finalAddition: number
  afterFinalAddition: number
  finalMultiplier: number
  afterFinalMultiplier: number
  attackScale: number
  finalAttack: number
}

export interface SkillModelDefaults {
  directMultiplierPercent: number
  attackScalePercent: number
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
  defenseBeforeIgnore: number
  defenseIgnoreFixed: number
  appliedDefense: number
  inputResistance: number
  resistanceBeforeIgnore: number
  resistanceIgnoreFixed: number
  appliedResistance: number
  afterDefense: number | null
  afterResistance: number | null
  minimumDamage: number | null
  minimumApplied: boolean
  result: number
}

export interface MitigationModifiers {
  defenseIgnoreFixed?: number
  resistanceIgnoreFixed?: number
}

export type SkillTotalMode = 'DURATION' | 'AMMO' | 'ACTIVATION' | 'NONE'

export interface SkillDamageBreakdown extends SkillDamageOutput {
  attackPipeline: AttackPipelineBreakdown
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
  modifiers: OperatorStatModifiers = {},
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
  const baseAttackSpeed = interpolateAttribute(phaseFrames, normalizedLevel, 'attackSpeed', 100)
  const attackSpeedBonus = finiteOr(modifiers.attackSpeedBonus, 0)
  const attackSpeed = baseAttackSpeed + attackSpeedBonus
  const attackInterval = baseAttackTime * 100 / Math.max(20, attackSpeed)

  const potentialAttack = 0
  const moduleAttack = finiteOr(modifiers.moduleAttack, 0)
  const beforeRounding = phaseAttack + trustAttack + potentialAttack + moduleAttack
  const attack = Math.max(0, Math.round(beforeRounding))
  const baseAttackBreakdown = {
    levelAttack: phaseAttack,
    trustAttack,
    potentialAttack,
    moduleAttack,
    beforeRounding,
    result: attack,
  }

  return {
    attack,
    baseAttackSpeed,
    attackSpeedBonus,
    attackSpeed,
    baseAttackTime,
    attackInterval,
    baseAttackBreakdown,
  }
}

export function deriveSkillModel(
  level: RawSkillLevel,
  operatorAttackInterval: number,
  operatorAttackSpeed = 100,
): SkillModelDefaults {
  const values = new Map(
    (level.blackboard ?? [])
      .filter((entry): entry is { key: string; value: number } => (
        typeof entry.key === 'string' && typeof entry.value === 'number'
      ))
      .map((entry) => [entry.key.toLowerCase(), entry.value]),
  )
  const notes: string[] = []
  const attackScaleEntries = [...values.entries()].filter(([key]) => (
    key === 'atk_scale'
    || key.endsWith('@atk_scale')
    || key.endsWith('.atk_scale')
  ))
  const directMultiplierPercent = Math.max(0, (findValue(values, ['atk'])?.value ?? 0) * 100)
  const preferredAttackScale = findValue(values, ['atk_scale', 'attack@atk_scale'])
    ?? (attackScaleEntries[0]
      ? { key: attackScaleEntries[0][0], value: attackScaleEntries[0][1] }
      : null)
  const attackScalePercent = Math.max(0, (preferredAttackScale?.value ?? 1) * 100)

  if (directMultiplierPercent === 0 && !preferredAttackScale) {
    notes.push('攻撃力補正Bと攻撃力補正Eをゲームデータから特定できなかったため、補正なしを初期値にしています。')
  }

  if (attackScaleEntries.length > 1) {
    notes.push('複数の攻撃力補正Eを持つスキルです。初期版では代表値1つの簡易モデルとして扱います。')
  }

  if (values.has('damage_scale')) {
    notes.push('独立ダメージ倍率 damage_scale は初期版の計算対象外です。')
  }

  const hitValue = findValue(values, ['attack@times', 'attack_times', 'times', 'multi_times'])
  const hitCount = hitValue && Number.isFinite(hitValue.value)
    ? clamp(Math.round(hitValue.value), 1, 100)
    : 1
  const attackSpeedBonus = findValue(values, ['attack_speed', 'attack@attack_speed'])?.value ?? 0
  const intervalOffset = findValue(values, ['base_attack_time', 'attack@base_attack_time'])?.value ?? 0
  const operatorAttackSpeedBeforeClamp = finiteOr(operatorAttackSpeed, 100)
  const operatorAttackSpeedForCurrentInterval = Math.max(20, operatorAttackSpeedBeforeClamp)
  const operatorBaseAttackTime = operatorAttackInterval * operatorAttackSpeedForCurrentInterval / 100
  const attackInterval = Math.max(
    0.05,
    (operatorBaseAttackTime + intervalOffset) * 100
      / Math.max(20, operatorAttackSpeedBeforeClamp + attackSpeedBonus),
  )
  const duration = typeof level.duration === 'number' && level.duration > 0 ? level.duration : 0
  const ammoValue = findValue(values, [
    'max_ammo',
    'ammo',
    'bullet_count',
    'bullet',
    'attack@trigger_time',
    'trigger_time',
    'attack@s3_trigger_time',
    's3_trigger_time',
  ])
  const descriptionAmmoCount = getAmmoCountFromDescription(level.description ?? '')
  const ammoCount = ammoValue
    ? clamp(Math.round(ammoValue.value), 0, 999)
    : descriptionAmmoCount

  if (level.durationType === 'AMMO' && ammoCount === 0) {
    notes.push('弾薬数を自動取得できませんでした。全弾総量を出す場合は弾数を入力してください。')
  }

  return {
    directMultiplierPercent: round(directMultiplierPercent, 2),
    attackScalePercent: round(attackScalePercent, 2),
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
  modifiers: MitigationModifiers = {},
): number {
  return calculateDamageBreakdown(rawAttack, damageType, enemyDefense, enemyResistance, modifiers).result
}

export function calculateAttackPipeline(
  rawBaseAttack: number,
  input: AttackPipelineInput = {},
): AttackPipelineBreakdown {
  const baseAttack = Math.max(0, finiteOr(rawBaseAttack, 0))
  const directAddition = finiteOr(input.directAddition, 0)
  const directMultiplierPercent = finiteOr(input.directMultiplierPercent, 0)
  const finalAddition = finiteOr(input.finalAddition, 0)
  const finalMultiplier = Math.max(0, finiteOr(input.finalMultiplier, 1))
  const attackScale = Math.max(0, finiteOr(input.attackScale, 1))
  const afterDirectAddition = baseAttack + directAddition
  const afterDirectMultiplier = afterDirectAddition * (1 + directMultiplierPercent / 100)
  const afterFinalAddition = afterDirectMultiplier + finalAddition
  const afterFinalMultiplier = Math.max(0, floorNearInteger(afterFinalAddition * finalMultiplier))
  const finalAttack = afterFinalMultiplier * attackScale

  return {
    baseAttack,
    directAddition,
    afterDirectAddition,
    directMultiplierPercent,
    afterDirectMultiplier,
    finalAddition,
    afterFinalAddition,
    finalMultiplier,
    afterFinalMultiplier,
    attackScale,
    finalAttack,
  }
}

export function calculateDamageBreakdown(
  rawAttack: number,
  damageType: DamageType,
  enemyDefense: number,
  enemyResistance: number,
  modifiers: MitigationModifiers = {},
): DamageCalculationBreakdown {
  const attack = Math.max(0, rawAttack)
  const defenseBeforeIgnore = Math.max(0, enemyDefense)
  const defenseIgnoreFixed = Math.max(0, finiteOr(modifiers.defenseIgnoreFixed, 0))
  const appliedDefense = Math.max(0, defenseBeforeIgnore - defenseIgnoreFixed)
  const resistanceBeforeIgnore = clamp(enemyResistance, 0, 100)
  const resistanceIgnoreFixed = Math.max(0, finiteOr(modifiers.resistanceIgnoreFixed, 0))
  const appliedResistance = clamp(resistanceBeforeIgnore - resistanceIgnoreFixed, 0, 100)

  if (damageType === 'TRUE') {
    return {
      attack,
      damageType,
      inputDefense: enemyDefense,
      defenseBeforeIgnore,
      defenseIgnoreFixed,
      appliedDefense,
      inputResistance: enemyResistance,
      resistanceBeforeIgnore,
      resistanceIgnoreFixed,
      appliedResistance,
      afterDefense: null,
      afterResistance: null,
      minimumDamage: null,
      minimumApplied: false,
      result: attack,
    }
  }

  if (damageType === 'ARTS') {
    const afterResistance = attack * (1 - appliedResistance / 100)
    const minimumDamage = attack * 0.05
    return {
      attack,
      damageType,
      inputDefense: enemyDefense,
      defenseBeforeIgnore,
      defenseIgnoreFixed,
      appliedDefense,
      inputResistance: enemyResistance,
      resistanceBeforeIgnore,
      resistanceIgnoreFixed,
      appliedResistance,
      afterDefense: null,
      afterResistance,
      minimumDamage,
      minimumApplied: minimumDamage > afterResistance,
      result: Math.max(minimumDamage, afterResistance),
    }
  }

  const afterDefense = attack - appliedDefense
  const minimumDamage = attack * 0.05
  return {
    attack,
    damageType,
    inputDefense: enemyDefense,
    defenseBeforeIgnore,
    defenseIgnoreFixed,
    appliedDefense,
    inputResistance: enemyResistance,
    resistanceBeforeIgnore,
    resistanceIgnoreFixed,
    appliedResistance,
    afterDefense,
    afterResistance: null,
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
    attackModifiers?: AttackPipelineInput
    mitigationModifiers?: MitigationModifiers
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
    attackModifiers?: AttackPipelineInput
    mitigationModifiers?: MitigationModifiers
  },
): SkillDamageBreakdown {
  const passiveAttackModifiers = options.attackModifiers ?? {}
  const attackPipeline = calculateAttackPipeline(baseAttack, {
    directAddition: passiveAttackModifiers.directAddition,
    directMultiplierPercent: finiteOr(passiveAttackModifiers.directMultiplierPercent, 0)
      + Math.max(0, finiteOr(model.directMultiplierPercent, 0)),
    finalAddition: passiveAttackModifiers.finalAddition,
    finalMultiplier: passiveAttackModifiers.finalMultiplier,
    attackScale: finiteOr(passiveAttackModifiers.attackScale, 1)
      * Math.max(0, finiteOr(model.attackScalePercent, 100)) / 100,
  })
  const hitCount = Math.max(1, model.hitCount)
  const duration = Math.max(0, model.duration)
  const ammoCount = Math.max(0, model.ammoCount)
  const mitigation = calculateDamageBreakdown(
    attackPipeline.finalAttack,
    damageType,
    enemyDefense,
    enemyResistance,
    options.mitigationModifiers,
  )
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
    attackPipeline,
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

function getAmmoCountFromDescription(description: string): number {
  const text = description
    .replace(/<[^>]+>/g, '')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
  const patterns = [
    /(?:合計|最大)\s*(\d+)\s*発/,
    /弾薬を\s*(\d+)\s*発(?:装填|補充)/,
    /(\d+)\s*発(?:分)?の(?:弾薬|銃弾|矢)/,
  ]

  for (const pattern of patterns) {
    const value = Number(text.match(pattern)?.[1])
    if (Number.isFinite(value) && value > 0) return clamp(Math.round(value), 1, 999)
  }
  return 0
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function floorNearInteger(value: number): number {
  const nearestInteger = Math.round(value)
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(value)) * 8
  return Math.abs(value - nearestInteger) <= tolerance
    ? nearestInteger
    : Math.floor(value)
}
