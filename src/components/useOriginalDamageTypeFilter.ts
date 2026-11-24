import { useEffect, useMemo, useReducer } from 'react'
import type { DamageThreeAttributeEntry } from '../lib/damageCalculatorThreeAttributeComparison'
import { evaluateDamageThreeComparisonEntry } from '../lib/damageCalculatorThreeComparison'

const referenceEnemy = { defense: 0, resistance: 0, enemyCount: 1 }
const originalTypes = new WeakMap<DamageThreeAttributeEntry, string | null>()

export function useOriginalDamageTypeFilter(
  entries: readonly DamageThreeAttributeEntry[], damageType: string,
): readonly DamageThreeAttributeEntry[] | null {
  const active = damageType !== 'ALL'
  const [revision, complete] = useReducer(value => value + 1, 0)
  const pending = useMemo(() => active ? entries.filter(entry => !originalTypes.has(entry)) : [],
    [active, entries, revision])

  useEffect(() => {
    if (!pending.length) return
    let index = 0
    function calculateBatch() {
      const deadline = performance.now() + 10
      do {
        const entry = pending[index++]
        if (!originalTypes.has(entry)) {
          originalTypes.set(entry, evaluateDamageThreeComparisonEntry(entry, referenceEnemy).damageType)
        }
      } while (index < pending.length && performance.now() < deadline)
      if (index < pending.length) timer = window.setTimeout(calculateBatch, 0)
      else complete()
    }
    let timer = window.setTimeout(calculateBatch, 0)
    return () => window.clearTimeout(timer)
  }, [pending])

  return useMemo(() => {
    if (!active) return entries
    if (pending.length) return null
    return entries.filter(entry => originalTypes.get(entry) === damageType)
  }, [active, entries, pending, damageType])
}
