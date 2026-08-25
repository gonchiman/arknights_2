import {
  ACTIVATION_TRIGGER_LABELS,
  DAMAGE_COMPONENT_LABELS,
  EFFECT_WINDOW_LABELS,
  SKILL_CONDITION_LABELS,
  getOutputCapabilityLabels,
} from './classifier'
import type { SkillRecord } from '../types/skill'

const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`

export function exportSkillsCsv(rows: SkillRecord[]) {
  const header = [
    'オペレーター名', '頭文字区分', '職業', '職業ID', '職分', '職分ID', 'レアリティ', 'スキル番号', 'スキル名', 'skillId',
    '終了条件', '終了条件の信頼度', '終了条件の判定元', '終了条件の根拠',
    '発動契機', '発動契機の信頼度', '発動契機の判定元', '発動契機の根拠',
    'ダメージ構成', 'ダメージ構成の信頼度', 'ダメージ構成の判定元', 'ダメージ構成の根拠',
    '条件・段階', '条件・段階の信頼度', '条件・段階の判定元', '条件・段階の根拠',
    '出力可否', '要モデル化の理由',
    'duration', 'durationType', 'skillType', 'spType', 'initSp', 'spCost', '説明文',
  ]
  const body = rows.map((row) => [
    row.operatorName,
    row.nameInitial,
    row.professionLabel,
    row.profession,
    row.subProfessionName,
    row.subProfessionId,
    row.rarity,
    row.skillIndex,
    row.skillName,
    row.skillId,
    EFFECT_WINDOW_LABELS[row.classification.effectWindow.value],
    row.classification.effectWindow.confidence,
    row.classification.effectWindow.source,
    row.classification.effectWindow.reasons.join(' / '),
    ACTIVATION_TRIGGER_LABELS[row.classification.activationTrigger.value],
    row.classification.activationTrigger.confidence,
    row.classification.activationTrigger.source,
    row.classification.activationTrigger.reasons.join(' / '),
    row.classification.damageComponents.value.map((value) => DAMAGE_COMPONENT_LABELS[value]).join(' / '),
    row.classification.damageComponents.confidence,
    row.classification.damageComponents.source,
    row.classification.damageComponents.reasons.join(' / '),
    row.classification.conditions.value.map((value) => SKILL_CONDITION_LABELS[value]).join(' / '),
    row.classification.conditions.confidence,
    row.classification.conditions.source,
    row.classification.conditions.reasons.join(' / '),
    getOutputCapabilityLabels(row.classification.outputCapabilities).join(' / '),
    row.classification.requiresManualModelReasons.join(' / '),
    row.duration ?? '',
    row.durationType,
    row.skillType,
    row.spType,
    row.initSp ?? '',
    row.spCost ?? '',
    row.description,
  ])
  const csv = [header, ...body].map((line) => line.map(quote).join(',')).join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'arknights-skill-classification.csv'
  anchor.click()
  URL.revokeObjectURL(url)
}
