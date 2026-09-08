import type { EnemyRecord } from '../types/enemy.ts'

export interface EnemyCombatInputValues {
  hp: string
  defense: string
  resistance: string
}

/** A missing stat must clear the previous enemy's value, while zero remains usable. */
export function getEnemyCombatInputValues(enemy: EnemyRecord): EnemyCombatInputValues {
  const inputValue = (value: number | null) => value !== null && Number.isFinite(value) ? String(value) : ''
  return {
    hp: inputValue(enemy.stats.maxHp),
    defense: inputValue(enemy.stats.defense),
    resistance: inputValue(enemy.stats.magicResistance),
  }
}

export function hasEnemyCombatInputChanges(enemy: EnemyRecord, values: EnemyCombatInputValues): boolean {
  const base = getEnemyCombatInputValues(enemy)
  return (Object.keys(base) as Array<keyof EnemyCombatInputValues>).some((key) => {
    const current = values[key].trim()
    return current === '' || base[key] === '' ? current !== base[key] : Number(current) !== Number(base[key])
  })
}
