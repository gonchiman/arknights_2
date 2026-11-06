export interface DamageCalculatorThreeEnemy {
  defense: number
  resistance: number
  /** Independent of arts resistance. Defaults to zero only for existing callers. */
  elementalResistance?: number
}

/** A supplied enemy is one common condition for every direct and periodic action. */
export function validateDamageCalculatorThreeEnemy(enemy: DamageCalculatorThreeEnemy | undefined): string[] {
  if (enemy === undefined) return []
  const errors: string[] = []
  if (!Number.isFinite(enemy?.defense) || enemy.defense < 0) {
    errors.push('敵の防御力を0以上の有限の数値で指定してください。')
  }
  if (!Number.isFinite(enemy?.resistance) || enemy.resistance < 0 || enemy.resistance > 100) {
    errors.push('敵の術耐性を0〜100の有限の数値で指定してください。')
  }
  if (enemy.elementalResistance !== undefined && (!Number.isFinite(enemy.elementalResistance)
    || enemy.elementalResistance < 0 || enemy.elementalResistance > 100)) {
    errors.push('敵の元素耐性を0〜100の有限の数値で指定してください。')
  }
  return errors
}
