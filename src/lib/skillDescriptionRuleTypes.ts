export interface EffectValue {
  key: string
  label: string
  value: number | string | boolean
  unit: string
  sourceGroups: number[]
}

export interface Rule {
  pattern: RegExp
  convert: (match: RegExpMatchArray) => EffectValue[]
  accepts?: (match: RegExpMatchArray, description: string) => boolean
}

export const NUMBER = String.raw`\d+(?:\.\d+)?`
// Horizontal whitespace may join a numeric expression; a newline separates
// effects, such as "所持コスト+1\n3回チャージ可能".
export const NUMBER_END = String.raw`(?![^\S\r\n]*(?:[\dA-Za-z_.%倍/／+\-×÷*=~〜～<>≤≥]|[,，][^\S\r\n]*\d|以上|以下|未満|程度|ほど))`
export const BARE_NUMBER_START = String.raw`(?<![\dA-Za-z_.,，/+*／\-×÷=][^\S\r\n]*)`

export function numericEffect(key: string, label: string, value: number, unit: string, sourceGroups = [1]): EffectValue[] {
  return Number.isFinite(value) ? [{ key, label, value, unit, sourceGroups }] : []
}

export function countEffect(key: string, label: string, value: number, sourceGroups = [1], minimum = 0): EffectValue[] {
  return Number.isSafeInteger(value) && value >= minimum ? numericEffect(key, label, value, 'count', sourceGroups) : []
}

export function flagEffect(key: string, label: string, value = true): EffectValue[] {
  return [{ key, label, value, unit: '', sourceGroups: [] }]
}
