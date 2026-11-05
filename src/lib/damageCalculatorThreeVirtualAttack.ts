import type { DamageType } from './damageCalculator.ts'
import type { GuardDamageAction, GuardPassiveModifiers, GuardStage } from './guardCombatTypes.ts'
import type { SkillStructure } from './skillStructure.ts'

export type VirtualMainAttackType = 'PHYSICAL' | 'ARTS'
export interface VirtualAttackCapability { supported: boolean; reason: string | null }

/** This is a reviewed action capability, not a second estimate of normal DC3 coverage. */
export function getDamageCalculatorThreeVirtualAttackCapability(
  structure: SkillStructure | null, stageId: string,
): VirtualAttackCapability {
  if (!structure?.guardRecipe) return unavailable('このスキルの主攻撃の属性変更には未対応です。')
  return getGuardVirtualAttackCapability(structure.guardRecipe.stages.find(stage => stage.id === stageId))
}

export function getGuardVirtualAttackCapability(stage: GuardStage | undefined): VirtualAttackCapability {
  if (!stage) return unavailable('属性を変更する攻撃段階を確認できません。')
  if (stage.kind !== 'NORMAL') return unavailable('属性変更は通常攻撃型の段階に対応しています。')
  if (stage.unresolved?.length) return unavailable(stage.unresolved[0])
  if (stage.actions.some(action => action.role !== 'MAIN' && action.role !== 'ADDITIONAL')) {
    return unavailable('主攻撃と追加ダメージの区分が未確認です。')
  }
  const main = stage.actions.filter(action => action.role === 'MAIN')
  if (!main.length) return unavailable('属性を変更できる主攻撃がありません。')
  if (main.some(action => action.damageType === 'TRUE')) return unavailable('確定ダメージの主攻撃は属性変更の対象外です。')
  if (main.some(action => (action.timing !== undefined && action.timing !== 'PER_ATTACK')
    || (action.basis !== undefined && action.basis !== 'ATK'))) {
    return unavailable('攻撃力を基準にする直接攻撃以外の属性変更には未対応です。')
  }
  if (new Set(main.map(action => action.damageType)).size !== 1) {
    return unavailable('複数の属性を持つ主攻撃の属性変更には未対応です。')
  }
  return { supported: true, reason: null }
}

export function getMainAttackType(actions: readonly GuardDamageAction[]): DamageType | null {
  const types = new Set(actions.filter(action => action.role === 'MAIN').map(action => action.damageType))
  return types.size === 1 ? [...types][0] : null
}

/** Mixed damage needs per-component passive evaluation if an attribute-dependent modifier changes. */
export function hasChangedVirtualPassiveModifiers(before: GuardPassiveModifiers, after: GuardPassiveModifiers): boolean {
  const numerical = (value: GuardPassiveModifiers) => Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['evaluations', 'blockers', 'notes'].includes(key)))
  return JSON.stringify(numerical(before)) !== JSON.stringify(numerical(after))
}

function unavailable(reason: string): VirtualAttackCapability { return { supported: false, reason } }
