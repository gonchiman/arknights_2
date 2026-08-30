import type { SkillRecord } from '../types/skill.ts'
import type { DamageType, SkillTotalMode } from './damageCalculator.ts'
import { getDefaultDamageType } from './damageCalculator.ts'

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

export function inferSkillDamageType(
  skill: SkillRecord,
  traitDescription = '',
): DamageType {
  const explicitTypes = getExplicitDamageTypes(skill.description)
  if (explicitTypes.length === 1) return explicitTypes[0]
  return getDefaultDamageType(skill.profession, traitDescription)
}

export function getExplicitDamageTypes(description: string): DamageType[] {
  const types: DamageType[] = []
  if (/物理ダメージ/.test(description)) types.push('PHYSICAL')
  if (/術ダメージ/.test(description)) types.push('ARTS')
  if (/確定ダメージ/.test(description)) types.push('TRUE')
  return types
}
