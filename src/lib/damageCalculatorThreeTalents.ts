import type { SkillRecord } from '../types/skill.ts'
import {
  evaluateCombatCondition, resolveCombatNumericValue, resolveCombatProbability,
  type CombatScalar, type CombatRecipientSelector,
} from './combatEffectStructure.ts'
import {
  buildTalentStructures, findTalentStructure, isTalentStructureSelection,
  type TalentStructureEffect,
} from './talentStructure.ts'
import { getOperatorPassives } from './operatorProfile.ts'
import { resolveSingleStackDamageOverTimeRate, type DamageOverTimeRate } from './damageOverTime.ts'

export interface DamageCalculatorThreeTalentEvaluation {
  operatorId: string
  talentIndex: number
  talentName: string
  effect: TalentStructureEffect | null
  status: 'APPLIED' | 'CONDITION_FALSE' | 'NOT_RELEVANT' | 'UNSUPPORTED' | 'UNVERIFIED'
  reason: string
  appliedAttackIds?: string[]
}
export interface DamageCalculatorThreeTalentOutput {
  effects: DamageCalculatorThreeTalentEvaluation[]
  attackRatio: number
  resistanceIgnoreFixed: number
  hasUnsupportedDamage: boolean
  blockingReasons: string[]
  scopeNotes: string[]
  hasDamageOverTime: boolean
  damageOverTimeRate: DamageOverTimeRate | null
  attackSpeedBonus: number
  defenseIgnore: { chance: number; ratio: number } | null
}

/** Evaluate verified effects of this operator only; no descriptions or legacy formulas execute. */
export function evaluateDamageCalculatorThreeTalents(input: {
  operator: SkillRecord; phaseIndex: number; operatorLevel: number
  attackKind: 'NORMAL' | 'NEXT_ATTACK' | 'COUNTER'
  enemyAttackCapability?: 'MELEE_ONLY' | 'RANGED_CAPABLE'
  targetAirborne?: boolean
  seaMonsterPresent?: boolean
}): DamageCalculatorThreeTalentOutput {
  const { operator, phaseIndex, operatorLevel } = input
  const structures = buildTalentStructures([operator], { phaseIndex, operatorLevel })
  const selectedSources = getOperatorPassives(operator.operatorProfile, phaseIndex, operatorLevel, 1).sources
  const output: DamageCalculatorThreeTalentOutput = { effects: [], attackRatio: 0, resistanceIgnoreFixed: 0,
    hasUnsupportedDamage: false, blockingReasons: [], scopeNotes: [], hasDamageOverTime: false, damageOverTimeRate: null,
    attackSpeedBonus: 0, defenseIgnore: null }
  const enemyAttackCapability = input.enemyAttackCapability ?? 'MELEE_ONLY'
  const metrics: Readonly<Record<string, CombatScalar | undefined>> = { 'source.isDeployed': true, 'source.isInSquad': true,
    'target.canUseRangedAttack': enemyAttackCapability === 'RANGED_CAPABLE' ? true : enemyAttackCapability === 'MELEE_ONLY' ? false : undefined,
    'target.isAirborne': input.targetAirborne ?? false, 'battlefield.hasSeaMonster': input.seaMonsterPresent ?? false }
  const activeDots: DamageCalculatorThreeTalentEvaluation[] = []
  for (const talentIndex of [0, 1]) {
    const selection = { operatorId: operator.operatorId, talentIndex }
    if (!isTalentStructureSelection(selection)) continue
    const structure = findTalentStructure(selection, structures)
    const talentName = structure?.basicInfo.talentName ?? selectedSources.find(source => source.sourceKind === 'TALENT' && source.talentIndex === talentIndex)?.sourceName ?? `素質${talentIndex + 1}`
    if (!structure) {
      const reason = `「${talentName}」の選択中の成長条件に対応する検証済みデータを取得できません。`
      output.effects.push({ ...selection, talentName, effect: null, status: 'UNVERIFIED', reason })
      output.blockingReasons.push(reason)
      continue
    }
    for (const effect of structure.effects) {
      const result: DamageCalculatorThreeTalentEvaluation = { ...selection, talentName, effect, status: 'UNVERIFIED', reason: '' }
      output.effects.push(result)
      if (['REDEPLOY_TIME', 'STEALTH', 'HP', 'FORCED_RETREAT', 'HP_RESTORE_RATIO'].includes(effect.item)) {
        result.status = 'NOT_RELEVANT'
        result.reason = '1回の直接ダメージ・DPSの計算には使用しません。'
        continue
      }
      if (effect.item === 'DAMAGE_OVER_TIME') {
        output.hasDamageOverTime = true
        const condition = evaluateCombatCondition(effect.condition, metrics)
        if (condition === false) {
          result.status = 'CONDITION_FALSE'
          result.reason = '敵の攻撃能力の条件が成立していません。'
          continue
        }
        const target = effect.target
        if (condition === null) result.reason = '敵の攻撃能力を確認できません。'
        else if (target.side !== 'ENEMY' || target.entity !== 'UNIT' || target.scope !== 'ATTACK_TARGET'
          || target.selection.type !== 'ALL' || target.includeSelf || target.factionIds.length || target.tagIds.length
          || !isSupportedContext(effect)) {
          result.status = 'UNSUPPORTED'
          result.reason = 'この継続ダメージの対象・付与条件にはまだ対応していません。'
        } else {
          const resolved = resolveSingleStackDamageOverTimeRate(effect.damage, metrics)
          if (!resolved.rate) {
            result.status = resolved.status ?? 'UNVERIFIED'
            result.reason = resolved.reason ?? '継続ダメージを取得できません。'
          } else {
            result.status = 'APPLIED'
            result.reason = '毒付与中の毎秒ダメージを適用します。'
            activeDots.push(result)
            output.damageOverTimeRate = resolved.rate
          }
        }
        if (result.status !== 'APPLIED') output.hasUnsupportedDamage = true
        continue
      }
      const recipient = appliesToSelf(effect.target, operator)
      const condition = evaluateCombatCondition(effect.condition, metrics)
      if (recipient === false || condition === false) {
        result.status = 'CONDITION_FALSE'
        result.reason = recipient === false ? '自身はこの効果の対象に含まれません。' : '適用条件が成立していません。'
        continue
      }
      if (recipient === null || condition === null) {
        result.reason = recipient === null ? '自身が対象に含まれるかを判定する所属・対象情報を取得できません。' : '適用条件を判定する入力を取得できません。'
      } else if (effect.item === 'DEFENSE_IGNORE_RATIO' && resolveCombatProbability(effect.probability) === null) {
        result.reason = '防御無視の発動確率を取得できません。'
      } else if (!isSupportedContext(effect, effect.item === 'DEFENSE_IGNORE_RATIO')) {
        result.status = 'UNSUPPORTED'
        result.reason = 'この効果の発動方式・確率・有効期間・制約の適用にはまだ対応していません。'
      } else {
        const value = typeof effect.value === 'boolean' ? null : resolveCombatNumericValue(effect.value, metrics)
        if (value === null) result.reason = `参照値「${effect.sourceBinding}」を取得できません。`
        else if (effect.item === 'ATK_BUFF_RATIO' && effect.operation === 'ADD_RATIO' && effect.unit === 'RATIO'
          && effect.target.entity === 'UNIT' && effect.timing.type === 'CONTINUOUS' && value >= -1) {
          output.attackRatio += value
          result.status = 'APPLIED'
          result.reason = 'スキルの攻撃力増加割合と加算して適用します。'
        } else if (effect.item === 'RESISTANCE_IGNORE_FIXED' && effect.operation === 'IGNORE_FIXED' && effect.unit === 'POINT'
          && effect.target.entity === 'ATTACK' && effect.timing.type === 'EVENT' && effect.timing.event === 'ATTACK' && value >= 0) {
          output.resistanceIgnoreFixed += value
          result.status = 'APPLIED'
          result.reason = '自身の攻撃時に敵の術耐性を固定値で無視します。'
        } else if (effect.item === 'ATTACK_SPEED' && effect.operation === 'ADD_VALUE' && effect.unit === 'POINT'
          && effect.target.entity === 'UNIT' && effect.timing.type === 'CONTINUOUS') {
          output.attackSpeedBonus += value
          result.status = 'APPLIED'
          result.reason = '攻撃速度へ加算して適用します。'
        } else if (effect.item === 'DEFENSE_IGNORE_RATIO' && effect.operation === 'IGNORE_RATIO' && effect.unit === 'RATIO'
          && effect.target.entity === 'ATTACK' && effect.timing.type === 'EVENT' && ['ATTACK', 'DAMAGE_DEALT'].includes(effect.timing.event)
          && value >= 0 && value <= 1) {
          const chance = resolveCombatProbability(effect.probability)
          if (chance === null) result.reason = '防御無視の発動確率を取得できません。'
          else if (output.defenseIgnore !== null) { result.status = 'UNSUPPORTED'; result.reason = '複数の防御無視効果を重ねる計算は未対応です。' }
          else {
            output.defenseIgnore = { chance, ratio: value }
            result.status = 'APPLIED'
            result.reason = '防御無視あり・なしのダメージを確率で加重します。'
          }
        } else {
          result.status = 'UNSUPPORTED'
          result.reason = 'この項目・演算・値の適用にはまだ対応していません。'
        }
      }
      if (result.status === 'UNVERIFIED' || result.status === 'UNSUPPORTED') output.blockingReasons.push(`「${talentName}」：${result.reason}`)
    }
  }
  if (activeDots.length > 1) {
    for (const result of activeDots) { result.status = 'UNSUPPORTED'; result.reason = '複数の継続ダメージを同時に適用する計算は未対応です。' }
    output.hasUnsupportedDamage = true
    output.damageOverTimeRate = null
  }
  // A partially resolved set cannot establish a unique supported DOT rate.
  if (output.hasUnsupportedDamage) output.damageOverTimeRate = null
  if (output.hasUnsupportedDamage) output.scopeNotes.push('素質の継続ダメージを除く、直接ダメージのみの計算結果です。')
  return output
}

function isSupportedContext(effect: TalentStructureEffect, allowProbability = false): boolean {
  const chance = resolveCombatProbability(effect.probability)
  if (chance === null || (!allowProbability && chance !== 1) || effect.probability.rollScope !== 'APPLICATION'
    || effect.restrictions.length || effect.afterEffects?.length) return false
  if (effect.timing.type === 'CONTINUOUS') return ['DEPLOYED', 'IN_SQUAD', 'ALWAYS'].includes(effect.timing.while)
    && effect.lifetime.type === 'WHILE_SOURCE_ACTIVE'
  return effect.timing.type === 'EVENT' && (effect.timing.event === 'ATTACK' || (allowProbability && effect.timing.event === 'DAMAGE_DEALT')) && effect.lifetime.type === 'CURRENT_EVENT'
}

/** Three-valued membership: missing metadata cannot prove that a faction filter fails. */
function appliesToSelf(target: CombatRecipientSelector, operator: SkillRecord): boolean | null {
  if (target.side === 'ENEMY') return false
  if (!target.includeSelf) return false
  if (target.side === 'SELF' && target.scope !== 'SELF') return null
  if (target.side === 'ALLY' && target.scope !== 'SQUAD') return null
  if (target.selection.type !== 'ALL') return null
  if (target.tagIds.length) return null
  if (!target.factionIds.length) return true
  const affiliation = operator.operatorProfile.affiliationIds
  if (!affiliation) return null
  const ids = [affiliation.nationId, affiliation.groupId, affiliation.teamId]
  if (ids.some(id => typeof id === 'string' && target.factionIds.includes(id))) return true
  return ids.every(id => id === null || (typeof id === 'string' && id.trim().length > 0)) ? false : null
}
