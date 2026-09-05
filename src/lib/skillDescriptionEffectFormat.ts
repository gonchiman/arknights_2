import type { SkillDescriptionEffect } from './skillDescriptionEffects.ts'

const UNIT_SUFFIXES: Record<string, string> = {
  multiplier: '倍', points: '', seconds: '秒', count: '', cost: 'コスト',
  cells: 'マス', damage: 'ダメージ', hp: 'HP', sp: 'SP', hpPerSecond: 'HP/秒', spPerSecond: 'SP/秒',
  multiplierPerSecond: '倍/秒',
}
const COUNT_SUFFIXES: Record<string, string> = {
  floatingUnitCount: '体', floatingUnitCountBonus: '体', targetCount: '体', targetCountBonus: '体',
  healingTargetCount: '人', healingTargetCountBonus: '人', blockCount: '体', blockCountBonus: '体',
  chainTargetCount: '体', shieldCountGained: '枚', resourceCountGained: '', skillAmmoCount: '発',
  coinCapacity: '枚', coinCost: '枚', firstTalentTargetCountBonus: '体', secondTalentTargetCountBonus: '体',
  namedUnitCountBonus: '体', summonedUnitCount: '体', retreatedUnitCount: '体', deployableUnitCount: '体',
  resourceCapacityBonus: '', deploymentSlotCost: '枠', deploymentSlotReturn: '枠', useLimitBattleCount: '回',
  ammoConsumedPerAttack: '発', ammoRecoveryCount: '発', rotatingProjectileCount: '個',
  rotatingProjectileCountBonus: '個', arrowsPerAttack: '本',
}
const DAMAGE_TYPES: Record<string, string> = { physical: '物理', arts: '術', true: '確定', elemental: '元素' }

export function formatSkillDescriptionEffectValue(effect: SkillDescriptionEffect): string {
  if (typeof effect.value !== 'number') {
    if (effect.key === 'damageType') return DAMAGE_TYPES[String(effect.value)] ?? String(effect.value)
    if (typeof effect.value === 'boolean') return effect.value ? 'あり' : 'なし'
    return effect.value
  }
  const percent = effect.unit === 'ratio' || effect.unit === 'fraction' || effect.unit === 'fractionPerSecond'
  const change = effect.unit === 'ratio'
    || /Bonus$|Delta/.test(effect.key) || effect.key === 'attackRangeExtension'
  const value = effect.value.toLocaleString('ja-JP', {
    style: percent ? 'percent' : 'decimal', maximumFractionDigits: 10,
    signDisplay: change ? 'exceptZero' : 'auto',
  })
  if (percent) return `${value}${effect.unit === 'fractionPerSecond' ? '/秒' : ''}`
  if (effect.unit === 'count') return `${value}${COUNT_SUFFIXES[effect.key] ?? (effect.key.endsWith('TargetCount') ? '体' : '回')}`
  return `${value}${UNIT_SUFFIXES[effect.unit] ?? effect.unit}`
}
