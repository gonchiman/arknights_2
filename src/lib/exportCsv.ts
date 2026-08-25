import type { SkillRecord } from '../types/skill'

const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`

export function exportSkillsCsv(rows: SkillRecord[]) {
  const header = ['オペレーター名', 'レアリティ', 'スキル番号', 'スキル名', 'skillId', 'duration', 'durationType', 'skillType', 'spType', 'initSp', 'spCost', '説明文']
  const body = rows.map((row) => [
    row.operatorName,
    row.rarity,
    row.skillIndex,
    row.skillName,
    row.skillId,
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
