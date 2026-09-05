import {
  calculateDamageBreakdown,
  type DamageCalculationBreakdown,
  type MitigationModifiers,
  type SkillModelDefaults,
} from './damageCalculator.ts'
import { getDamageSensitivityTablePoints } from './damageSensitivity.ts'
import { isGoldenglowSkill3 } from './goldenglowExplosion.ts'
import { detectSkillDamageType, getSkillDamageUnsupportedReasons } from './skillDamageModel.ts'
import type { RawSkillLevel, SkillRecord } from '../types/skill.ts'

export const MECH_ACCORD_SUB_PROFESSION_ID = 'funnel'

export const MECH_ACCORD_ATTACK_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8] as const
export type MechAccordAttackCount = typeof MECH_ACCORD_ATTACK_COUNTS[number]

export interface MechAccordAttackOptions {
  droneCount?: number
  mainAttackEnabled?: boolean
}

export interface MechAccordSkillOutput {
  droneCount: number
  mainAttackEnabled: boolean
  unsupportedReasons: string[]
}

export interface MechAccordDamageRow {
  attackCount: number
  attackCountLabel: string
  multiplierPercent: number
  rawDroneAttack: number
  droneDamage: number
  combinedDamage: number
  minimumReached: boolean
  droneBreakdown: DamageCalculationBreakdown
}

export interface MechAccordDamageRowsResult {
  droneCount: number
  mainAttackEnabled: boolean
  mainDamage: DamageCalculationBreakdown
  rows: MechAccordDamageRow[]
}

export interface MechAccordResistanceDamageRow {
  resistance: number
  mainDamage: number
  droneDamage: number
  combinedDamage: number
  mainMinimumReached: boolean
  droneMinimumReached: boolean
  combinedMinimumReached: boolean
  mainBreakdown: DamageCalculationBreakdown
  droneBreakdown: DamageCalculationBreakdown
}

export interface MechAccordResistanceTableResult {
  droneCount: number
  mainAttackEnabled: boolean
  attackCount: MechAccordAttackCount
  attackCountLabel: string
  multiplierPercent: number
  rows: MechAccordResistanceDamageRow[]
}

const MECH_ACCORD_MULTIPLIERS = [20, 35, 50, 65, 80, 95, 110, 110] as const

export function isMechAccordSubProfession(subProfessionId: string): boolean {
  return subProfessionId === MECH_ACCORD_SUB_PROFESSION_ID
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

export function getMechAccordMultiplierPercent(attackCount: number): number {
  const normalizedAttackCount = normalizeMechAccordAttackCount(attackCount)
  const multiplierIndex = normalizedAttackCount - 1
  return MECH_ACCORD_MULTIPLIERS[multiplierIndex]
}

export function calculateMechAccordDamageRows(
  rawAttack: number,
  enemyDefense: number,
  enemyResistance: number,
  mitigationModifiers: MitigationModifiers = {},
  options: MechAccordAttackOptions = {},
): MechAccordDamageRowsResult {
  const normalizedAttack = Number.isFinite(rawAttack) ? Math.max(0, rawAttack) : 0
  const droneCount = normalizeDroneCount(options.droneCount)
  const mainAttackEnabled = options.mainAttackEnabled ?? true
  const mainDamage = calculateDamageBreakdown(
    mainAttackEnabled ? normalizedAttack : 0,
    'ARTS',
    enemyDefense,
    enemyResistance,
    mitigationModifiers,
  )

  const createRow = (attackCount: number): MechAccordDamageRow => {
    const multiplierPercent = getMechAccordMultiplierPercent(attackCount)
    const rawDroneAttack = normalizedAttack * multiplierPercent / 100
    const droneBreakdown = calculateDamageBreakdown(
      rawDroneAttack,
      'ARTS',
      enemyDefense,
      enemyResistance,
      mitigationModifiers,
    )

    const droneDamage = droneBreakdown.result * droneCount
    return {
      attackCount,
      attackCountLabel: attackCount === MECH_ACCORD_ATTACK_COUNTS.length
        ? `${attackCount}以上`
        : String(attackCount),
      multiplierPercent,
      rawDroneAttack,
      droneDamage,
      combinedDamage: mainDamage.result + droneDamage,
      minimumReached: isMinimumDamageReached(droneBreakdown),
      droneBreakdown,
    }
  }

  return {
    droneCount,
    mainAttackEnabled,
    mainDamage,
    rows: MECH_ACCORD_ATTACK_COUNTS.map(createRow),
  }
}

export function calculateMechAccordResistanceTable(
  rawAttack: number,
  enemyDefense: number,
  attackCount: number,
  mitigationModifiers: MitigationModifiers = {},
  options: MechAccordAttackOptions = {},
): MechAccordResistanceTableResult {
  const droneCount = normalizeDroneCount(options.droneCount)
  const mainAttackEnabled = options.mainAttackEnabled ?? true
  const normalizedAttackCount = normalizeMechAccordAttackCount(attackCount)
  const multiplierPercent = getMechAccordMultiplierPercent(normalizedAttackCount)
  const rows = getDamageSensitivityTablePoints('ARTS').map((resistance): MechAccordResistanceDamageRow => {
    const damage = calculateMechAccordDamageRows(
      rawAttack,
      enemyDefense,
      resistance,
      mitigationModifiers,
      { droneCount, mainAttackEnabled },
    )
    const selectedDamage = damage.rows[normalizedAttackCount - 1]
    const mainMinimumReached = isMinimumDamageReached(damage.mainDamage)
    const droneMinimumReached = selectedDamage.minimumReached

    return {
      resistance,
      mainDamage: damage.mainDamage.result,
      droneDamage: selectedDamage.droneDamage,
      combinedDamage: selectedDamage.combinedDamage,
      mainMinimumReached,
      droneMinimumReached,
      combinedMinimumReached: mainMinimumReached || droneMinimumReached,
      mainBreakdown: damage.mainDamage,
      droneBreakdown: selectedDamage.droneBreakdown,
    }
  })

  return {
    droneCount,
    mainAttackEnabled,
    attackCount: normalizedAttackCount,
    attackCountLabel: normalizedAttackCount === MECH_ACCORD_ATTACK_COUNTS.length
      ? `${normalizedAttackCount}回目以降`
      : `${normalizedAttackCount}回目`,
    multiplierPercent,
    rows,
  }
}

function normalizeDroneCount(droneCount: number | undefined): number {
  return typeof droneCount === 'number' && Number.isFinite(droneCount)
    ? Math.max(1, Math.round(droneCount))
    : 1
}

function normalizeMechAccordAttackCount(attackCount: number): MechAccordAttackCount {
  const normalizedAttackCount = Number.isFinite(attackCount)
    ? Math.max(1, Math.floor(attackCount))
    : 1
  return Math.min(normalizedAttackCount, MECH_ACCORD_ATTACK_COUNTS.length) as MechAccordAttackCount
}

function isMinimumDamageReached(breakdown: DamageCalculationBreakdown): boolean {
  const minimumDamage = breakdown.minimumDamage
  if (minimumDamage === null || minimumDamage <= 0) return false
  const tolerance = Number.EPSILON
    * Math.max(1, Math.abs(breakdown.attack), Math.abs(minimumDamage), Math.abs(breakdown.result))
    * 32
  return breakdown.result <= minimumDamage + tolerance
}
