import type { DamageComponentType, SkillRecord } from '../types/skill.ts'
import type { DamageType, SkillTotalMode } from './damageCalculator.ts'

export type DamageTypeDetectionSource =
  | 'TRAIT'
  | 'PROFESSION'
  | 'SKILL_DESCRIPTION'
  | 'NORMAL_ATTACK'
  | 'UNRESOLVED'

export interface DamageTypeDetection {
  damageType: DamageType | null
  source: DamageTypeDetectionSource
  reason: string
}

const PROFESSION_DEFAULT_DAMAGE_TYPES: Readonly<Record<string, DamageType>> = {
  PIONEER: 'PHYSICAL',
  WARRIOR: 'PHYSICAL',
  TANK: 'PHYSICAL',
  SNIPER: 'PHYSICAL',
  CASTER: 'ARTS',
  SPECIAL: 'PHYSICAL',
}

const SKILL_TYPE_INHERITANCE_BLOCKERS = new Set<DamageComponentType>([
  'BURST',
  'PERIODIC',
  'DAMAGE_OVER_TIME',
  'SUMMON',
  'DEPLOYED_OBJECT',
  'NO_DIRECT_DAMAGE',
  'UNKNOWN',
])

const SKILL_TYPE_DETECTION_BLOCKERS = new Set<DamageComponentType>([
  'PERIODIC',
  'DAMAGE_OVER_TIME',
  'SUMMON',
  'DEPLOYED_OBJECT',
  'NO_DIRECT_DAMAGE',
  'UNKNOWN',
])

export function getSkillDamageUnsupportedReasons(skill: SkillRecord): string[] {
  const components = new Set(skill.classification.damageComponents.value)
  const reasons: string[] = []
  const modeledDirectComponents = ['BASIC_ATTACK_MODIFIER', 'BURST']
    .filter((component) => components.has(component as 'BASIC_ATTACK_MODIFIER' | 'BURST'))
  const description = skill.description
  const traitDescription = `${skill.operatorProfile.traitDescription ?? ''} ${skill.operatorProfile.subProfessionTraitDescription ?? ''}`
  const explicitlyDealsDamage = /(?:物理|術|確定)?ダメージを与|敵を攻撃|攻撃する|攻撃を行う/.test(description)
  const operatorCanDealDamage = /敵.{0,20}(?:ダメージを与|攻撃)/.test(traitDescription)
  const attackDisabled = /攻撃しなく|攻撃を行わなく|攻撃を停止|敵を攻撃しない|通常攻撃を行わない/.test(description)
  const nonAttackingTrait = /敵を攻撃しない|攻撃を行わない/.test(traitDescription)
  const restoresHealth = /(?:HP|体力).{0,40}回復|治療/.test(description)
  const changesAttackPower = /攻撃力(?:が)?(?:\+|＋|−|-|上昇|低下|減少)/.test(description)
  const hasElementalDamage = /元素(?:損傷|ダメージ)|(?:壊死|灼熱|神経|侵蝕)損傷/.test(description)

  if (components.has('NO_DIRECT_DAMAGE')) reasons.push('直接ダメージを持たないスキルです。')
  if (components.has('UNKNOWN')) reasons.push('ダメージ構成が未確定です。')
  if (components.has('SUMMON')) reasons.push('召喚物の独立ステータスが必要です。')
  if (components.has('DEPLOYED_OBJECT')) reasons.push('設置物の個別モデルが必要です。')
  if (components.has('PERIODIC') || components.has('DAMAGE_OVER_TIME')) {
    reasons.push('周期・継続ダメージの間隔モデルが必要です。')
  }
  if (modeledDirectComponents.length > 1) {
    reasons.push('通常攻撃変化と瞬間攻撃を別々に計算するモデルが必要です。')
  }
  if (hasElementalDamage) {
    reasons.push('元素損傷・元素ダメージは現在の計算モデルに対応していません。')
  }
  if (attackDisabled && !explicitlyDealsDamage) {
    reasons.push('スキル中に通常攻撃を行わないため、攻撃ダメージを算出できません。')
  }
  if (restoresHealth && !explicitlyDealsDamage && !changesAttackPower) {
    reasons.push('味方の回復・治療を主目的とするスキルです。')
  }
  if ((nonAttackingTrait || (skill.profession === 'MEDIC' && !operatorCanDealDamage)) && !explicitlyDealsDamage) {
    reasons.push('通常攻撃でダメージを与えないオペレーターです。')
  }
  if (skill.classification.outputCapabilities.requiresModeSelection) {
    reasons.push('段階・モードごとの値を選択する必要があります。')
  }
  if (!components.has('BASIC_ATTACK_MODIFIER') && !components.has('BURST') && reasons.length === 0) {
    reasons.push('単純な通常攻撃変化・瞬間攻撃以外のモデルです。')
  }

  return reasons
}

export function getSkillTotalMode(skill: SkillRecord): SkillTotalMode {
  const window = skill.classification.effectWindow.value
  if (window === 'FIXED_DURATION') return 'DURATION'
  if (window === 'AMMO') return 'AMMO'
  if (window === 'NONE') return 'ACTIVATION'
  return 'NONE'
}

export function getSkillTotalLabel(skill: SkillRecord): string {
  const window = skill.classification.effectWindow.value
  if (window === 'FIXED_DURATION') return '効果時間総ダメージ'
  if (window === 'AMMO') return '全弾総ダメージ'
  if (window === 'NONE') return '発動総ダメージ'
  return 'スキル総ダメージ'
}

export function detectNormalAttackDamageType(
  profession: string,
  traitDescription = '',
): DamageTypeDetection {
  const normalizedTrait = normalizeDescription(traitDescription)
  if (isNonAttackingTrait(normalizedTrait)) {
    return {
      damageType: null,
      source: 'UNRESOLVED',
      reason: '通常攻撃を行わない特性です。',
    }
  }

  const explicitTypes = getExplicitDamageTypes(normalizedTrait)
  if (explicitTypes.length === 1) {
    const conditionalOrIndependentDamage = /(?:スキル(?:発動)?中|スキル発動時|召喚物|配置物|装置|身替り|替身)/.test(normalizedTrait)
    if (!conditionalOrIndependentDamage) {
      return {
        damageType: explicitTypes[0],
        source: 'TRAIT',
        reason: '特性の通常攻撃説明から自動判定しました。',
      }
    }
  }
  if (explicitTypes.length > 1) {
    return {
      damageType: null,
      source: 'UNRESOLVED',
      reason: '特性に複数のダメージ種別が含まれるため、通常攻撃の種別を自動判定できません。',
    }
  }
  const professionDefault = PROFESSION_DEFAULT_DAMAGE_TYPES[profession]
  if (professionDefault) {
    return {
      damageType: professionDefault,
      source: 'PROFESSION',
      reason: '職業の通常攻撃種別から自動判定しました。',
    }
  }

  return {
    damageType: null,
    source: 'UNRESOLVED',
    reason: '通常攻撃のダメージ種別を自動判定できません。今後対応予定です。',
  }
}

export function detectSkillDamageType(
  skill: SkillRecord,
  normalDamageType: DamageType | null,
  description = skill.description,
): DamageTypeDetection {
  const normalizedDescription = normalizeDescription(description)
  const components = new Set(skill.classification.damageComponents.value)
  const blockedComponent = [...SKILL_TYPE_DETECTION_BLOCKERS]
    .find((component) => components.has(component))
  if (blockedComponent) {
    return {
      damageType: null,
      source: 'UNRESOLVED',
      reason: blockedComponent === 'NO_DIRECT_DAMAGE'
        ? '直接ダメージを持たないスキルです。'
        : '複数の計算式や独立ユニットが必要なため、ダメージ種別を単一の式へ自動適用できません。今後対応予定です。',
    }
  }
  if (components.has('BASIC_ATTACK_MODIFIER') && components.has('BURST')) {
    return {
      damageType: null,
      source: 'UNRESOLVED',
      reason: '通常攻撃の変化と独立ダメージを別々に判定する必要があります。今後対応予定です。',
    }
  }
  if (hasNegatedTypedDamage(normalizedDescription)) {
    return {
      damageType: null,
      source: 'UNRESOLVED',
      reason: 'ダメージ種別の否定表現を単一の攻撃種別として自動適用できません。今後対応予定です。',
    }
  }
  if (hasAdditionalDamageComponent(normalizedDescription)) {
    return {
      damageType: null,
      source: 'UNRESOLVED',
      reason: '通常攻撃と追加ダメージの種別を別々に判定する必要があります。今後対応予定です。',
    }
  }

  const explicitTypes = getExplicitDamageTypes(normalizedDescription)
  if (explicitTypes.length === 1) {
    return {
      damageType: explicitTypes[0],
      source: 'SKILL_DESCRIPTION',
      reason: 'スキル説明から自動判定しました。',
    }
  }
  if (explicitTypes.length > 1) {
    return {
      damageType: null,
      source: 'UNRESOLVED',
      reason: '複数のダメージ種別を含むため、現在の単一ダメージ式では自動計算できません。今後対応予定です。',
    }
  }

  const inheritsNormalAttack = components.has('BASIC_ATTACK_MODIFIER')
    && ![...SKILL_TYPE_INHERITANCE_BLOCKERS].some((component) => components.has(component))
  if (inheritsNormalAttack && normalDamageType) {
    return {
      damageType: normalDamageType,
      source: 'NORMAL_ATTACK',
      reason: '通常攻撃を変化させるスキルのため、通常攻撃の種別を継承しました。',
    }
  }

  return {
    damageType: null,
    source: 'UNRESOLVED',
    reason: 'ダメージ種別を自動判定できないため、このスキルは現在計算できません。今後対応予定です。',
  }
}

export function getExplicitDamageTypes(description: string): DamageType[] {
  const normalized = normalizeDescription(description)
  return ([
    ['PHYSICAL', '物理'],
    ['ARTS', '術'],
    ['TRUE', '確定'],
  ] as const)
    .filter(([, label]) => hasOutgoingDamageType(normalized, label))
    .map(([type]) => type)
}

function normalizeDescription(description: string): string {
  return description
    .normalize('NFKC')
    .replace(/<[^>]*>/g, '')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isNonAttackingTrait(description: string): boolean {
  return /敵を攻撃しない|攻撃を行わない|通常時は?攻撃しない|通常時は?攻撃せず|スキル未発動時.{0,8}(?:攻撃しない|攻撃せず|攻撃を行わない)/.test(description)
}

function hasAdditionalDamageComponent(description: string): boolean {
  const typedDamage = '(?:物理|術|確定)(?:属性)?(?:の)?(?:範囲)?ダメージ'
  return new RegExp([
    `(?:追加(?:で|の)?|さらに|別途).{0,32}${typedDamage}`,
    `${typedDamage}.{0,16}(?:を)?(?:追加で|さらに|別途)(?:与え|発生)`,
    '(?:物理|術|確定)(?:属性)?(?:の)?追加ダメージ',
  ].join('|')).test(description)
}

function hasNegatedTypedDamage(description: string): boolean {
  return /(?:物理|術|確定)(?:属性)?(?:の)?(?:範囲)?ダメージ.{0,8}与え(?:ない|ず|なく)|(?:物理|術|確定)(?:属性)?攻撃を(?:行わない|しない)/.test(description)
}

function hasOutgoingDamageType(description: string, label: string): boolean {
  const damageNoun = `${label}(?:属性)?(?:の)?(?:範囲)?ダメージ`
  const directDamage = new RegExp(`${damageNoun}[^\u3002、；;]{0,24}(?:を)?与え`, 'g')
  for (const match of description.matchAll(directDamage)) {
    const prefix = description.slice(Math.max(0, (match.index ?? 0) - 12), match.index)
    const suffix = description.slice((match.index ?? 0) + match[0].length)
    const pathToVerb = match[0].slice(label.length)
    const describesIncomingOrNegatedDamage = /(?:受け|軽減|無効|減少)/.test(pathToVerb)
      || /(?:受ける|受けた|被ダメージ)$/.test(prefix)
      || /^(?:ない|ず|なく)/.test(suffix)
      || /^る(?:敵|対象|味方|ユニット|召喚物|装置|罠|地雷)/.test(suffix)
    if (!describesIncomingOrNegatedDamage) return true
  }

  const typedAttack = new RegExp(`${label}(?:属性)?攻撃(?:を)?(?:行う|する)`, 'g')
  for (const match of description.matchAll(typedAttack)) {
    const prefix = description.slice(Math.max(0, (match.index ?? 0) - 12), match.index)
    const suffix = description.slice((match.index ?? 0) + match[0].length)
    if (!/(?:受ける|受けた|回避する)$/.test(prefix)
      && !/^(?:敵|対象|味方|ユニット|召喚物|装置|罠|地雷)/.test(suffix)) return true
  }

  const conversion = new RegExp(`(?:通常)?攻撃(?:が|は|を)[^\u3002、；;]{0,24}?${label}(?:属性)?(?:攻撃|ダメージ)(?:に|へ|とな|として)`, 'g')
  for (const match of description.matchAll(conversion)) {
    const prefix = description.slice(Math.max(0, (match.index ?? 0) - 12), match.index)
    if (!/(?:受ける|受けた|敵の|味方の|対象の)$/.test(prefix)) return true
  }

  return false
}
