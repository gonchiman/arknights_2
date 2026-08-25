import type { OperatorInitial } from '../types/skill'

export const PROFESSION_LABELS: Record<string, string> = {
  PIONEER: '先鋒',
  WARRIOR: '前衛',
  TANK: '重装',
  SNIPER: '狙撃',
  CASTER: '術師',
  MEDIC: '医療',
  SUPPORT: '補助',
  SPECIAL: '特殊',
}

export const OPERATOR_INITIAL_LABELS: Record<OperatorInitial, string> = {
  A_ROW: 'あ行',
  K_ROW: 'か行',
  S_ROW: 'さ行',
  T_ROW: 'た行',
  N_ROW: 'な行',
  H_ROW: 'は行',
  M_ROW: 'ま行',
  Y_ROW: 'や行',
  R_ROW: 'ら行',
  W_ROW: 'わ行',
  LATIN: 'A–Z',
  NUMBER: '0–9',
  OTHER: 'その他',
}

export function getProfessionLabel(profession: string): string {
  return (PROFESSION_LABELS[profession] ?? profession) || '不明'
}

export function getOperatorInitial(name: string): OperatorInitial {
  const first = name.normalize('NFKC').match(/[\p{L}\p{N}]/u)?.[0]
  if (!first) return 'OTHER'
  if (/[A-Z]/i.test(first)) return 'LATIN'
  if (/\d/.test(first)) return 'NUMBER'

  const hiragana = toHiragana(first)
  if (/[ぁあぃいうぅゔえぇお]/.test(hiragana)) return 'A_ROW'
  if (/[かがきぎくぐけげこご]/.test(hiragana)) return 'K_ROW'
  if (/[さざしじすずせぜそぞ]/.test(hiragana)) return 'S_ROW'
  if (/[ただちぢっつづてでとど]/.test(hiragana)) return 'T_ROW'
  if (/[なにぬねの]/.test(hiragana)) return 'N_ROW'
  if (/[はばぱひびぴふぶぷへべぺほぼぽ]/.test(hiragana)) return 'H_ROW'
  if (/[まみむめも]/.test(hiragana)) return 'M_ROW'
  if (/[ゃやゅゆょよ]/.test(hiragana)) return 'Y_ROW'
  if (/[らりるれろ]/.test(hiragana)) return 'R_ROW'
  if (/[ゎわゐゑをん]/.test(hiragana)) return 'W_ROW'
  return 'OTHER'
}

function toHiragana(value: string): string {
  const codePoint = value.codePointAt(0)
  if (codePoint !== undefined && codePoint >= 0x30a1 && codePoint <= 0x30f6) {
    return String.fromCodePoint(codePoint - 0x60)
  }
  return value
}
