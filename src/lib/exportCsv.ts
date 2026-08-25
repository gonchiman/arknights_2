import type { SkillRecord } from '../types/skill'
import type { SkillOverrides } from './storage'

const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`

export function exportSkillsCsv(rows: SkillRecord[], overrides: SkillOverrides) {
  const header = ['オペレーター名', 'レアリティ', 'スキル番号', 'スキル名', '自動分類', '確定分類', '信頼度', 'duration', 'durationType', 'spType', '説明文']
  const body = rows.map((row) => [
    row.operatorName,
    row.rarity,
    row.skillIndex,
    row.skillName,
    row.category,
    overrides[row.id] ?? row.category,
    row.confidence,
    row.duration ?? '',
    row.durationType,
    row.spType,
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
