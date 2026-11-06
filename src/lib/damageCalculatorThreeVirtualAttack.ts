import type { HpDamageType } from './damageCalculator.ts'
import type { GuardDamageAction, GuardStage } from './guardCombatTypes.ts'
import type { SkillStructure } from './skillStructure.ts'

export type VirtualMainAttackType = 'PHYSICAL' | 'ARTS'
export interface VirtualAttackCapability { supported: boolean; reason: string | null }

/** Attribute comparison uses every reviewed DC3 attack kind; runtime DC3 validation still applies. */
export function getDamageCalculatorThreeVirtualAttackCapability(
  structure: SkillStructure | null, stageId: string,
): VirtualAttackCapability {
  if (!structure) return unavailable('属性を変更するスキルを確認できません。')
  if (structure.guardRecipe) return getGuardVirtualAttackCapability(structure.guardRecipe.stages.find(stage => stage.id === stageId))
  return structure.effectStructure.stages.some(stage => stage.id === stageId)
    ? { supported: true, reason: null } : unavailable('属性を変更する攻撃段階を確認できません。')
}

export function getGuardVirtualAttackCapability(stage: GuardStage | undefined): VirtualAttackCapability {
  if (!stage) return unavailable('属性を変更する攻撃段階を確認できません。')
  if (stage.unresolved?.length) return unavailable(stage.unresolved[0])
  if (stage.actions.some(action => action.role !== 'MAIN' && action.role !== 'ADDITIONAL')) {
    return unavailable('主攻撃と追加ダメージの区分が未確認です。')
  }
  const main = stage.actions.filter(action => action.role === 'MAIN')
  if (!main.length) return unavailable('属性を変更できる主攻撃がありません。')
  return { supported: true, reason: null }
}

export function getMainAttackType(actions: readonly GuardDamageAction[]): HpDamageType | null {
  const types = new Set(actions.filter(action => action.role === 'MAIN').map(action => action.damageType))
  return types.size === 1 ? [...types][0] : null
}

function unavailable(reason: string): VirtualAttackCapability { return { supported: false, reason } }
