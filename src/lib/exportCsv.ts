import type { SkillRecord } from '../types/skill'
import { SKILL_OUTPUT_MODE_LABELS } from './classifier'

const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`

export function exportSkillsCsv(rows: SkillRecord[]) {
  const header = ['オペレーター名', 'レアリティ', 'スキル番号', 'スキル名', 'skillId', '効果タイプ', '計算機出力', '信頼度', '判定元', '判定根拠', 'duration', 'durationType', 'skillType', 'spType', 'initSp', 'spCost', '説明文']
  const body = rows.map((row) => [
    row.operatorName,
    row.rarity,
    row.skillIndex,
    row.skillName,
    row.skillId,
    row.classification.label,
    SKILL_OUTPUT_MODE_LABELS[row.classification.outputMode],
    row.classification.confidence,
    row.classification.source,
    row.classification.reasons.join(' / '),
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
  anchor.download = 'arknights-skill-data.csv'
  anchor.click()
  URL.revokeObjectURL(url)
}
