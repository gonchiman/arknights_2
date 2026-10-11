import type { SkillEffectBreakdownRow } from './skillEffectBreakdown.ts'

export const SKILL_EFFECT_CORRECTIONS_STORAGE_KEY = 'arknights-skill-effect-corrections-v1'
const FIELD_NAMES = ['timing', 'condition', 'target', 'label', 'operation', 'valueText'] as const
export type SkillEffectDisplayFields = Pick<SkillEffectBreakdownRow, typeof FIELD_NAMES[number]>
export interface SkillEffectCorrectionContext {
  operatorId: string
  skillId: string
  levelIndex: number
  sourceDescription: string
  description: string
}
export interface SkillEffectCorrection {
  contextKey: string
  rowFingerprint: string
  fields: SkillEffectDisplayFields
}
interface CorrectionStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}
export interface SkillEffectCorrectionState {
  entries: SkillEffectCorrection[]
  error: string | null
}

export function getSkillEffectDisplayFields(row: SkillEffectBreakdownRow): SkillEffectDisplayFields {
  return Object.fromEntries(FIELD_NAMES.map(key => [key, row[key]])) as SkillEffectDisplayFields
}

function contextKey(context: SkillEffectCorrectionContext): string {
  // Both forms are needed: the template can stay unchanged while its numeric values change.
  return JSON.stringify([context.operatorId, context.skillId, context.levelIndex,
    context.sourceDescription, context.description])
}

function rowFingerprint(row: SkillEffectBreakdownRow): string {
  const effect = row.effect
  return JSON.stringify([row.id, row.sourceStart, row.sourceEnd, row.sourceText, row.status,
    getSkillEffectDisplayFields(row), effect && [effect.key, effect.value, effect.unit, effect.sourceKey]])
}

export function findSkillEffectCorrection(
  entries: SkillEffectCorrection[], context: SkillEffectCorrectionContext, row: SkillEffectBreakdownRow,
): SkillEffectCorrection | undefined {
  const key = contextKey(context)
  const fingerprint = rowFingerprint(row)
  return entries.find(entry => entry.contextKey === key && entry.rowFingerprint === fingerprint)
}

export function validateSkillEffectDisplayFields(fields: SkillEffectDisplayFields): string | null {
  return FIELD_NAMES.some(key => typeof fields[key] !== 'string' || !fields[key].trim() || fields[key].length > 2000)
    ? '各項目を入力してください。未確認の項目は「未解析」としてください。' : null
}

export function updateSkillEffectCorrections(
  entries: SkillEffectCorrection[], context: SkillEffectCorrectionContext, row: SkillEffectBreakdownRow,
  fields: SkillEffectDisplayFields | null,
): SkillEffectCorrection[] {
  const key = contextKey(context)
  const fingerprint = rowFingerprint(row)
  const remaining = entries.filter(entry => entry.contextKey !== key || entry.rowFingerprint !== fingerprint)
  if (!fields) return remaining
  const error = validateSkillEffectDisplayFields(fields)
  if (error) throw new Error(error)
  const normalized = Object.fromEntries(FIELD_NAMES.map(name => [name, fields[name].trim()])) as SkillEffectDisplayFields
  if (FIELD_NAMES.every(name => normalized[name] === row[name])) return remaining
  return [...remaining, { contextKey: key, rowFingerprint: fingerprint, fields: normalized }]
}

function browserStorage(): CorrectionStorage | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

function validEntry(value: unknown): value is SkillEffectCorrection {
  if (!value || typeof value !== 'object') return false
  const entry = value as SkillEffectCorrection
  return typeof entry.contextKey === 'string' && entry.contextKey.length <= 50000
    && typeof entry.rowFingerprint === 'string' && entry.rowFingerprint.length <= 30000
    && !!entry.fields && typeof entry.fields === 'object'
    && validateSkillEffectDisplayFields(entry.fields) === null
}

export function loadSkillEffectCorrections(storage?: CorrectionStorage | null): SkillEffectCorrectionState {
  try {
    const source = storage === undefined ? browserStorage() : storage
    const text = source?.getItem(SKILL_EFFECT_CORRECTIONS_STORAGE_KEY)
    if (!text) return { entries: [], error: null }
    const parsed = JSON.parse(text) as { version?: number; entries?: unknown[] }
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)
      || parsed.entries.length > 5000 || !parsed.entries.every(validEntry)) {
      return { entries: [], error: '保存した修正を読み込めませんでした。自動解析の結果を表示しています。' }
    }
    return { entries: parsed.entries, error: null }
  } catch {
    return { entries: [], error: '保存した修正を読み込めませんでした。自動解析の結果を表示しています。' }
  }
}

export function saveSkillEffectCorrections(
  entries: SkillEffectCorrection[], storage?: CorrectionStorage | null,
): { ok: true } | { ok: false; error: string } {
  if (entries.length > 5000 || !entries.every(validEntry)) {
    return { ok: false, error: '修正データが保存できる形式ではありません。' }
  }
  try {
    const target = storage === undefined ? browserStorage() : storage
    if (!target) return { ok: false, error: 'この環境では修正を保存できません。' }
    target.setItem(SKILL_EFFECT_CORRECTIONS_STORAGE_KEY, JSON.stringify({ version: 1, entries }))
    return { ok: true }
  } catch {
    return { ok: false, error: '修正を保存できませんでした。ブラウザの保存設定や空き容量を確認してください。' }
  }
}
