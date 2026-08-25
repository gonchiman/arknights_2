import type { ClassificationResult, RawSkillLevel } from '../types/skill'

const includesAny = (text: string, terms: string[]) => terms.some((term) => text.includes(term))

export function classifySkill(skill: RawSkillLevel): ClassificationResult {
  const description = (skill.description ?? '').replace(/<[^>]+>/g, '')
  const duration = skill.duration ?? 0
  const durationType = skill.durationType ?? 'UNKNOWN'
  const reasons: string[] = []

  const isAmmo = durationType === 'AMMO'
  const isInfinite = includesAny(description, ['退場まで', '効果時間無限', '無限時間', 'Unlimited duration'])
  const isNextAttack = includesAny(description, ['次の通常攻撃', '次回の通常攻撃', '次の攻撃', '次回攻撃'])
  const isInstant = includesAny(description, ['即座に', '直ちに', '一斉に', '発射し', '砲撃', '爆発']) && duration <= 0
  const isConditional = includesAny(description, ['2回目以降', '二回目以降', '発動するたび', '次回発動時', '段階', '状態に移行'])
  const hasDuration = duration > 0

  if (isAmmo) {
    reasons.push(`durationType = ${durationType}`)
    return { category: '弾薬', confidence: 'high', reasons }
  }

  if (isInfinite) {
    reasons.push('説明文に永続を示す表現')
    if (duration === -1) reasons.push('duration = -1')
    return { category: '永続', confidence: 'high', reasons }
  }

  if (isConditional) {
    reasons.push('説明文に複数段階・複数回発動を示す表現')
    return { category: '条件分岐', confidence: 'medium', reasons }
  }

  if (hasDuration && includesAny(description, ['即座に', '直ちに', '発射', '砲撃', '爆発'])) {
    reasons.push(`duration = ${duration}`)
    reasons.push('持続時間内に瞬間攻撃を含む可能性')
    return { category: '持続＋一撃必殺', confidence: 'low', reasons }
  }

  if (hasDuration) {
    reasons.push(`duration = ${duration}`)
    return { category: '持続', confidence: 'high', reasons }
  }

  if (isNextAttack) {
    reasons.push('説明文に「次の攻撃」系の表現')
    return { category: '通常攻撃強化', confidence: 'high', reasons }
  }

  if (isInstant) {
    reasons.push('持続時間なし + 瞬間的な攻撃表現')
    return { category: '一撃必殺', confidence: 'medium', reasons }
  }

  if (description.length > 0) {
    reasons.push('既知の分類ルールに一致しない')
    return { category: 'その他', confidence: 'low', reasons }
  }

  reasons.push('説明文または主要フィールドが不足')
  return { category: '要確認', confidence: 'low', reasons }
}
