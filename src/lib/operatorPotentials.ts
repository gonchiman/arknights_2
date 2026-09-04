import type {
  OperatorCombatProfile,
  RawPotentialAttributeModifier,
} from '../types/skill'

export type OperatorPotentialEffectStatus = 'APPLIED' | 'NO_DIRECT_EFFECT' | 'UNSUPPORTED'

export interface OperatorPotentialEffect {
  potentialRank: number
  requiredPotentialRank: number
  description: string
  attributeType: string
  formulaItem: string
  value: number | null
  label: string
  status: OperatorPotentialEffectStatus
  reason: string
}

export interface OperatorPotentialApplication {
  potentialRank: number
  maxPotentialRank: number
  requiredPotentialRank: number
  potentialAttack: number
  attackSpeedBonus: number
  effects: OperatorPotentialEffect[]
  unsupportedReasons: string[]
}

const ATTRIBUTE_TYPE_BY_NUMBER: Record<number, string> = {
  0: 'MAX_HP',
  1: 'ATK',
  2: 'DEF',
  3: 'MAGIC_RESISTANCE',
  4: 'COST',
  5: 'BLOCK_CNT',
  6: 'MOVE_SPEED',
  7: 'ATTACK_SPEED',
  8: 'BASE_ATTACK_TIME',
  9: 'RESPAWN_TIME',
  10: 'HP_RECOVERY_PER_SEC',
  11: 'SP_RECOVERY_PER_SEC',
  12: 'MAX_DEPLOY_COUNT',
  13: 'MAX_DECK_STACK_CNT',
  14: 'TAUNT_LEVEL',
  15: 'MASS_LEVEL',
  16: 'BASE_FORCE_LEVEL',
  17: 'DEF_PENETRATE_FIXED',
  18: 'DEF_PENETRATE_SCALE',
  19: 'MAGIC_RESIST_PENETRATE_FIXED',
  20: 'MAGIC_RESIST_PENETRATE_SCALE',
  21: 'STRATEGY_ORIGINAL_COST',
}

const ATTRIBUTE_LABELS: Record<string, string> = {
  MAX_HP: '最大HP',
  ATK: '攻撃力',
  DEF: '防御力',
  MAGIC_RESISTANCE: '術耐性',
  COST: '配置コスト',
  BLOCK_CNT: 'ブロック数',
  MOVE_SPEED: '移動速度',
  ATTACK_SPEED: '攻撃速度',
  BASE_ATTACK_TIME: '基礎攻撃間隔',
  RESPAWN_TIME: '再配置時間',
  HP_RECOVERY_PER_SEC: 'HP自然回復',
  SP_RECOVERY_PER_SEC: 'SP自然回復',
  MAX_DEPLOY_COUNT: '配置可能数',
  MAX_DECK_STACK_CNT: '編成可能数',
  TAUNT_LEVEL: '挑発レベル',
  MASS_LEVEL: '重量',
  BASE_FORCE_LEVEL: '力加減',
  DEF_PENETRATE_FIXED: '防御力固定無視',
  DEF_PENETRATE_SCALE: '防御力割合無視',
  MAGIC_RESIST_PENETRATE_FIXED: '術耐性固定無視',
  MAGIC_RESIST_PENETRATE_SCALE: '術耐性割合無視',
  STRATEGY_ORIGINAL_COST: '初期戦術コスト',
}

const DAMAGE_ATTRIBUTE_TYPES = new Set(['ATK', 'ATTACK_SPEED'])
const NON_DAMAGE_ATTRIBUTE_TYPES = new Set([
  'MAX_HP',
  'DEF',
  'MAGIC_RESISTANCE',
  'COST',
  'BLOCK_CNT',
  'MOVE_SPEED',
  'RESPAWN_TIME',
  'HP_RECOVERY_PER_SEC',
  'SP_RECOVERY_PER_SEC',
  'MAX_DEPLOY_COUNT',
  'MAX_DECK_STACK_CNT',
  'TAUNT_LEVEL',
  'MASS_LEVEL',
  'BASE_FORCE_LEVEL',
  'STRATEGY_ORIGINAL_COST',
])

export function getOperatorMaxPotentialRank(profile: OperatorCombatProfile): number {
  return Math.max(1, (Array.isArray(profile.potentialRanks) ? profile.potentialRanks.length : 0) + 1)
}

export function getOperatorPotentialApplication(
  profile: OperatorCombatProfile,
  requestedPotentialRank: number,
): OperatorPotentialApplication {
  const maxPotentialRank = getOperatorMaxPotentialRank(profile)
  const potentialRank = clampPotentialRank(requestedPotentialRank, maxPotentialRank)
  const requiredPotentialRank = potentialRank - 1
  const effects: OperatorPotentialEffect[] = []
  const unsupportedReasons: string[] = []
  let potentialAttack = 0
  let attackSpeedBonus = 0

  const unlockedRanks = (Array.isArray(profile.potentialRanks) ? profile.potentialRanks : [])
    .slice(0, requiredPotentialRank)

  unlockedRanks.forEach((rank, index) => {
    const rankPotential = index + 2
    const modifiers = rank.buff?.attributes?.attributeModifiers
    if (!Array.isArray(modifiers)) return

    for (const modifier of modifiers) {
      const effect = evaluatePotentialModifier(modifier, rankPotential, rank.description ?? '')
      effects.push(effect)

      if (effect.status === 'UNSUPPORTED') {
        unsupportedReasons.push(effect.reason)
        continue
      }
      if (effect.status !== 'APPLIED' || effect.value === null) continue

      if (effect.attributeType === 'ATK') potentialAttack += effect.value
      if (effect.attributeType === 'ATTACK_SPEED') attackSpeedBonus += effect.value
    }
  })

  return {
    potentialRank,
    maxPotentialRank,
    requiredPotentialRank,
    potentialAttack,
    attackSpeedBonus,
    effects,
    unsupportedReasons: [...new Set(unsupportedReasons)],
  }
}

function evaluatePotentialModifier(
  modifier: RawPotentialAttributeModifier,
  potentialRank: number,
  description: string,
): OperatorPotentialEffect {
  const requiredPotentialRank = potentialRank - 1
  const attributeType = normalizeAttributeType(modifier.attributeType)
  const formulaItem = normalizeFormulaItem(modifier.formulaItem)
  const value = typeof modifier.value === 'number' && Number.isFinite(modifier.value)
    ? modifier.value
    : null
  const label = ATTRIBUTE_LABELS[attributeType] ?? (attributeType || '不明な能力値')
  const base = {
    potentialRank,
    requiredPotentialRank,
    description: cleanGameText(description),
    attributeType,
    formulaItem,
    value,
    label,
  }

  if (NON_DAMAGE_ATTRIBUTE_TYPES.has(attributeType)) {
    return {
      ...base,
      status: 'NO_DIRECT_EFFECT',
      reason: `${label}は現在のダメージ出力を直接補正しません。`,
    }
  }

  if (!DAMAGE_ATTRIBUTE_TYPES.has(attributeType)) {
    return {
      ...base,
      status: 'UNSUPPORTED',
      reason: `潜在${potentialRank}の能力値「${label}」は計算規則が登録されていません。`,
    }
  }

  const invalidReason = getInvalidDamageModifierReason(modifier, formulaItem, value)
  if (invalidReason) {
    return {
      ...base,
      status: 'UNSUPPORTED',
      reason: `潜在${potentialRank}の${label}補正を適用できません。${invalidReason}`,
    }
  }

  return {
    ...base,
    status: 'APPLIED',
    reason: attributeType === 'ATK'
      ? '基礎攻撃力へ加算します。'
      : '攻撃間隔の算出に加えます。',
  }
}

function getInvalidDamageModifierReason(
  modifier: RawPotentialAttributeModifier,
  formulaItem: string,
  value: number | null,
): string | null {
  if (formulaItem !== 'ADDITION') {
    return `計算式「${formulaItem || '不明'}」は未対応です。`
  }
  if (modifier.loadFromBlackboard) {
    return 'blackboardから値を取得する補正には未対応です。'
  }
  if (modifier.fetchBaseValueFromSourceEntity) {
    return '参照元の基礎値を使う補正には未対応です。'
  }
  if (value === null) {
    return '加算値が有効な数値ではありません。'
  }
  return null
}

function normalizeAttributeType(value: string | number | undefined): string {
  if (typeof value === 'number') return ATTRIBUTE_TYPE_BY_NUMBER[value] ?? String(value)
  const normalized = value?.trim().toUpperCase() ?? ''
  if (/^\d+$/.test(normalized)) {
    return ATTRIBUTE_TYPE_BY_NUMBER[Number(normalized)] ?? normalized
  }
  return normalized
}

function normalizeFormulaItem(value: string | number | undefined): string {
  if (value === 0 || value === '0') return 'ADDITION'
  return typeof value === 'string' ? value.trim().toUpperCase() : String(value ?? '')
}

function clampPotentialRank(value: number, maxPotentialRank: number): number {
  const normalized = Number.isFinite(value) ? Math.round(value) : 1
  return Math.min(maxPotentialRank, Math.max(1, normalized))
}

function cleanGameText(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
