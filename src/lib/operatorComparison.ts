import { EFFECT_WINDOW_LABELS } from './classifier.ts'
import {
  DAMAGE_TYPE_LABELS,
  calculateSkillDamageBreakdown,
  deriveSkillModel,
  getOperatorStats,
  type DamageType,
  type SkillModelDefaults,
} from './damageCalculator.ts'
import { getOperatorPassives } from './operatorProfile.ts'
import {
  getExplicitDamageTypes,
  getSkillDamageUnsupportedReasons,
  getSkillTotalMode,
  inferSkillDamageType,
} from './skillDamageModel.ts'
import type { EffectWindowType, RawSkillLevel, SkillRecord } from '../types/skill.ts'

export const COMPARISON_METRICS = ['DAMAGE', 'DPS', 'TOTAL'] as const
export type ComparisonMetric = typeof COMPARISON_METRICS[number]
const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 })

export const COMPARISON_METRIC_LABELS: Record<ComparisonMetric, string> = {
  DAMAGE: 'ダメージ（1回攻撃）',
  DPS: 'DPS',
  TOTAL: 'スキル総ダメージ',
}

export interface EnemyStatProfile {
  id: string
  defense: number
  resistance: number
}

export interface SkillComparisonRow {
  skill: SkillRecord
  damageType: DamageType | null
  values: Array<number | null>
  unavailableReasons: string[]
  warnings: string[]
}

export const DEFAULT_ENEMY_STAT_PROFILES: readonly EnemyStatProfile[] = [
  { id: 'enemy-1', defense: 0, resistance: 0 },
  { id: 'enemy-2', defense: 500, resistance: 20 },
  { id: 'enemy-3', defense: 1000, resistance: 40 },
  { id: 'enemy-4', defense: 1500, resistance: 60 },
  { id: 'enemy-5', defense: 2000, resistance: 80 },
]

export function getAvailableComparisonMetrics(effectWindow: EffectWindowType): ComparisonMetric[] {
  if (effectWindow === 'FIXED_DURATION' || effectWindow === 'AMMO') {
    return ['DAMAGE', 'DPS', 'TOTAL']
  }
  if (effectWindow === 'PERMANENT' || effectWindow === 'TOGGLE_OR_MODE') {
    return ['DAMAGE', 'DPS']
  }
  if (effectWindow === 'NONE') return ['DAMAGE', 'TOTAL']
  return ['DAMAGE']
}

export function buildSkillComparisonRow(
  skill: SkillRecord,
  enemyProfiles: EnemyStatProfile[],
  metric: ComparisonMetric,
): SkillComparisonRow {
  const phaseIndex = Math.max(0, skill.operatorProfile.phases.length - 1)
  const phase = skill.operatorProfile.phases[phaseIndex]
  const operatorLevel = Math.max(1, phase?.maxLevel ?? 1)
  const operatorStats = getOperatorStats(skill.operatorProfile, phaseIndex, operatorLevel, 100)
  const passives = getOperatorPassives(skill.operatorProfile, phaseIndex, operatorLevel)
  const skillLevel = skill.skillLevels.at(-1) ?? skill.raw
  const model = deriveSkillModel(skillLevel, operatorStats.attackInterval)
  const explicitDamageTypes = getExplicitDamageTypes(skill.description)
  const damageType = explicitDamageTypes.length > 1
    ? null
    : inferSkillDamageType(skill, passives.traitDescription)
  const unavailableReasons = getComparisonUnavailableReasons(skill, skillLevel, model, metric)
  const warnings = getComparisonWarnings(model)

  if (unavailableReasons.length > 0 || damageType === null) {
    return {
      skill,
      damageType,
      values: enemyProfiles.map(() => null),
      unavailableReasons,
      warnings,
    }
  }

  const totalMode = getSkillTotalMode(skill)
  const values = enemyProfiles.map(({ defense, resistance }) => {
    const breakdown = calculateSkillDamageBreakdown(
      operatorStats.attack,
      damageType,
      defense,
      resistance,
      model,
      {
        canShowDps: skill.classification.outputCapabilities.canShowDps,
        totalMode,
      },
    )

    if (metric === 'DPS') return breakdown.dps
    if (metric === 'TOTAL') return breakdown.total
    return breakdown.perAttack
  })

  return { skill, damageType, values, unavailableReasons: [], warnings }
}

export function buildComparisonCsv(
  rows: SkillComparisonRow[],
  enemyProfiles: EnemyStatProfile[],
  metric: ComparisonMetric,
): string {
  const headers = [
    'オペレーター',
    'スキル',
    'レアリティ',
    '職業',
    '終了条件',
    'ダメージ種別',
    '出力',
    ...enemyProfiles.map((profile) => getEnemyProfileLabel(profile)),
    '計算状態',
  ]
  const lines = [headers.map(escapeCsvCell).join(',')]

  for (const row of rows) {
    const cells = [
      row.skill.operatorName,
      `S${row.skill.skillIndex} ${row.skill.skillName}`,
      `★${row.skill.rarity}`,
      `${row.skill.professionLabel} / ${row.skill.subProfessionName}`,
      EFFECT_WINDOW_LABELS[row.skill.classification.effectWindow.value],
      row.damageType === null ? '複合・要確認' : DAMAGE_TYPE_LABELS[row.damageType],
      COMPARISON_METRIC_LABELS[metric],
      ...row.values.map((value) => value === null ? '' : formatCsvNumber(value)),
      row.unavailableReasons.length > 0
        ? row.unavailableReasons.join(' / ')
        : row.warnings.length > 0
          ? `概算: ${row.warnings.join(' / ')}`
          : '計算可能',
    ]
    lines.push(cells.map(escapeCsvCell).join(','))
  }

  return `\uFEFF${lines.join('\r\n')}`
}

export function getEnemyProfileLabel(profile: Pick<EnemyStatProfile, 'defense' | 'resistance'>): string {
  return `防御 ${formatCompactNumber(profile.defense)} / 術耐性 ${formatCompactNumber(profile.resistance)}`
}

function getComparisonUnavailableReasons(
  skill: SkillRecord,
  skillLevel: RawSkillLevel,
  model: SkillModelDefaults,
  metric: ComparisonMetric,
): string[] {
  const reasons = getSkillDamageUnsupportedReasons(skill)
  const explicitDamageTypes = getExplicitDamageTypes(skill.description)
  const capabilities = skill.classification.outputCapabilities
  const totalMode = getSkillTotalMode(skill)

  if (explicitDamageTypes.length > 1) {
    reasons.push('複数のダメージ種別を含むため、単一の式では比較できません。')
  }
  if (model.notes.some((note) => note.includes('初期版の計算対象外'))) {
    reasons.push('計算対象外の独立ダメージ倍率を含みます。')
  }
  if (model.notes.some((note) => note.includes('複数の攻撃力補正E'))) {
    reasons.push('複数の攻撃倍率を別々に扱うモデルが必要です。')
  }
  const unmodeledDamageKeys = getUnmodeledDamageKeys(skillLevel)
  if (unmodeledDamageKeys.length > 0) {
    reasons.push(`未対応の攻撃・ダメージ倍率を含みます（${unmodeledDamageKeys.join(', ')}）。`)
  }
  if (metric === 'DAMAGE' && !capabilities.canShowPerHit) {
    reasons.push('1回攻撃のダメージを算出できない分類です。')
  }
  if (metric === 'DPS' && !capabilities.canShowDps) {
    reasons.push('この終了条件とダメージ構成ではDPSを算出できません。')
  }
  if (metric === 'TOTAL') {
    if (totalMode === 'NONE') reasons.push('終了条件からスキル総ダメージを確定できません。')
    if (totalMode === 'DURATION' && (!capabilities.canShowWindowTotal || model.duration <= 0)) {
      reasons.push('効果時間総ダメージを算出できません。')
    }
    if (totalMode === 'AMMO') {
      if (!capabilities.canShowWindowTotal) reasons.push('全弾総ダメージを算出できないダメージ構成です。')
      if (model.ammoCount <= 0) reasons.push('弾薬数をゲームデータから取得できません。')
    }
    if (totalMode === 'ACTIVATION' && !capabilities.canShowPerActivationTotal) {
      reasons.push('発動総ダメージを算出できません。')
    }
  }

  return [...new Set(reasons)]
}

function getComparisonWarnings(model: SkillModelDefaults): string[] {
  return [...new Set(model.notes.filter((note) => (
    !note.includes('初期版の計算対象外')
    && !note.includes('複数の攻撃力補正E')
  )))]
}

function getUnmodeledDamageKeys(level: RawSkillLevel): string[] {
  return [...new Set((level.blackboard ?? []).flatMap((entry) => {
    const key = entry.key?.toLowerCase()
    if (!key) return []
    const looksLikeDamageScale = /(?:atk|damage).*(?:scale|ratio)|(?:scale|ratio).*(?:atk|damage)/.test(key)
    const modeled = key === 'atk_scale' || key.endsWith('@atk_scale') || key.endsWith('.atk_scale')
    return looksLikeDamageScale && !modeled ? [key] : []
  }))]
}

function escapeCsvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function formatCsvNumber(value: number): string {
  return String(Math.round(value * 10000) / 10000)
}

function formatCompactNumber(value: number): string {
  return COMPACT_NUMBER_FORMATTER.format(value)
}
