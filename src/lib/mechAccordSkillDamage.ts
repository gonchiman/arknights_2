import type { SkillModelDefaults } from './damageCalculator.ts'
import type { RawSkillLevel, SkillRecord } from '../types/skill.ts'
import { isGoldenglowSkill3 } from './goldenglowExplosion.ts'
import { isMechAccordSubProfession } from './mechAccordDamage.ts'
import { detectSkillDamageType, getSkillDamageUnsupportedReasons } from './skillDamageModel.ts'

// Skill-specific behavior is resolved before entering the shared drone calculation.
export interface MechAccordSkillOutput {
  droneCount: number
  mainAttackEnabled: boolean
  unsupportedReasons: string[]
}

export function deriveMechAccordSkillOutput(
  skill: SkillRecord,
  level: RawSkillLevel,
  model: SkillModelDefaults,
): MechAccordSkillOutput {
  const description = (level.description ?? skill.description).replace(/<[^>]*>/g, '')
  const selectedSkill = { ...skill, description }
  const unsupportedReasons = getSkillDamageUnsupportedReasons(selectedSkill)
  const damageType = detectSkillDamageType(selectedSkill, 'ARTS', description)
  const mainAttackEnabled = !isGoldenglowSkill3(skill.operatorId, skill.skillIndex)
  const additionalDroneCount = level.blackboard?.find((entry) => (
    entry.key?.trim().toLowerCase() === 'attack@cnt'
  ))?.value ?? 0
  const validDroneCount = Number.isInteger(additionalDroneCount) && additionalDroneCount >= 0

  if (!isMechAccordSubProfession(skill.subProfessionId)) {
    unsupportedReasons.push('操機術師のスキルではありません。')
  }
  if (damageType.damageType !== 'ARTS') {
    unsupportedReasons.push(damageType.damageType === null
      ? damageType.reason
      : '術以外のダメージは操機術師の職分固有出力に対応していません。')
  }
  if (model.hitCount !== 1 || model.attackScalePercent !== 100) {
    unsupportedReasons.push('本体と浮遊ユニットの攻撃倍率・連続攻撃を個別に扱うモデルが必要です。')
  }
  if (model.notes.some((note) => note.includes('初期版の計算対象外'))) {
    unsupportedReasons.push('計算対象外の独立ダメージ倍率を含みます。')
  }
  if (mainAttackEnabled && /攻撃しなく|攻撃を行わなく|攻撃を停止|敵を攻撃しない|通常攻撃を行わない/.test(description)) {
    unsupportedReasons.push('本体の攻撃停止と浮遊ユニットの動作を個別に確認する必要があります。')
  }
  if (!validDroneCount) {
    unsupportedReasons.push('スキル中の浮遊ユニット数を取得できません。')
  }

  return {
    droneCount: 1 + (validDroneCount ? additionalDroneCount : 0),
    mainAttackEnabled,
    unsupportedReasons: [...new Set(unsupportedReasons)],
  }
}
