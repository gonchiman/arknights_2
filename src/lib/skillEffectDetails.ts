import {
  ACTIVATION_TRIGGER_LABELS,
  DAMAGE_COMPONENT_LABELS,
  EFFECT_WINDOW_LABELS,
  SKILL_CONDITION_LABELS,
  getOutputCapabilityLabels,
} from './classifier.ts'
import type { SkillRecord } from '../types/skill.ts'

export interface SkillEffectDetails {
  activation: string
  effectWindow: string
  spRecovery: string
  initialSp: string
  requiredSp: string
  damageComponents: string[]
  conditions: string[]
  outputs: string[]
}

const SP_TYPE_LABELS: Record<string, string> = {
  INCREASE_WITH_TIME: '自然回復',
  INCREASE_WHEN_ATTACK: '攻撃回復',
  INCREASE_WHEN_TAKEN_DAMAGE: '被撃回復',
  NO_SP: 'SPなし',
  UNKNOWN: '要確認',
}

export function buildSkillEffectDetails(skill: SkillRecord): SkillEffectDetails {
  const classification = skill.classification
  const effectWindow = classification.effectWindow.value
  const outputLabels = getOutputCapabilityLabels(classification.outputCapabilities)

  return {
    activation: ACTIVATION_TRIGGER_LABELS[classification.activationTrigger.value],
    effectWindow: effectWindow === 'FIXED_DURATION' && skill.duration !== null && skill.duration > 0
      ? `${EFFECT_WINDOW_LABELS[effectWindow]}（${formatNumber(skill.duration)}秒）`
      : EFFECT_WINDOW_LABELS[effectWindow],
    spRecovery: SP_TYPE_LABELS[skill.spType] ?? skill.spType,
    initialSp: skill.initSp === null ? '—' : formatNumber(skill.initSp),
    requiredSp: skill.spCost === null ? '—' : formatNumber(skill.spCost),
    damageComponents: classification.damageComponents.value.map((value) => DAMAGE_COMPONENT_LABELS[value]),
    conditions: classification.conditions.value.length > 0
      ? classification.conditions.value.map((value) => SKILL_CONDITION_LABELS[value])
      : ['なし'],
    outputs: outputLabels.length > 0 ? outputLabels : ['直接出力なし'],
  }
}

export function formatSkillEffectDescription(skill: SkillRecord): string {
  const description = skill.description.trim()
  if (!description) return '説明文なし'

  const blackboard = skill.raw.blackboard ?? skill.skillLevels.at(-1)?.blackboard ?? []
  const values = new Map(blackboard.flatMap((entry) => (
    entry.key ? [[entry.key, entry] as const] : []
  )))

  return description.replace(/\{(-?[^}:]+)(?::([^}]+))?\}/g, (placeholder, rawKey: string, format?: string) => {
    const negative = rawKey.startsWith('-')
    const key = negative ? rawKey.slice(1) : rawKey
    const entry = values.get(rawKey) ?? values.get(key)
    if (!entry) return placeholder
    if (typeof entry.value !== 'number') return entry.valueStr || placeholder

    const value = negative ? -entry.value : entry.value
    return formatBlackboardValue(value, format)
  })
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
}

function formatBlackboardValue(value: number, format?: string): string {
  const percent = format?.includes('%') ?? false
  const decimalMatch = format?.match(/0\.(0+)/)
  const decimals = decimalMatch?.[1].length ?? (format?.includes('0') ? 0 : undefined)
  const normalized = percent ? value * 100 : value
  const formatted = decimals === undefined
    ? formatNumber(normalized)
    : normalized.toFixed(decimals)
  const signed = format?.includes('+') && normalized > 0 ? `+${formatted}` : formatted
  return percent ? `${signed}%` : signed
}
