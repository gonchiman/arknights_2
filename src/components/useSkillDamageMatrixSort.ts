import { useEffect, useMemo, useReducer } from 'react'
import type { DamageThreeAttributeEntry } from '../lib/damageCalculatorThreeAttributeComparison'
import { evaluateDamageThreeSkillRankRow, getDamageDifference, type DamageCell, type DamageThreeSkillRankMode } from '../lib/damageThreeSkillRankMatrix.ts'
import type { EnemyResistanceThreshold } from '../lib/enemyDefenseResistance'
import { compareNumericValues } from '../lib/enemyTableSort.ts'

type DamageKey = 'physical' | 'arts' | 'difference'
export type MatrixSortKey = 'operator' | 'skillIndex' | 'stage' | 'skillName' | DamageKey
export type MatrixSort = { key: MatrixSortKey; direction: 'asc' | 'desc'; resistance?: number }

const names = new Intl.Collator('ja', { numeric: true })
const isDamageKey = (key: MatrixSortKey): key is DamageKey =>
  key === 'physical' || key === 'arts' || key === 'difference'

function textValue(entry: DamageThreeAttributeEntry, key: 'operator' | 'stage' | 'skillName') {
  if (key === 'operator') return entry.skill.operatorName
  if (key === 'skillName') return entry.skill.skillName
  const stages = entry.structure.guardRecipe?.stages ?? entry.structure.effectStructure.stages
  return stages.length > 1 ? entry.stageLabel : null
}

function damageValue(cell: DamageCell | undefined, key: DamageKey) {
  if (!cell) return null
  const value = key === 'difference' ? getDamageDifference(cell) : cell[key]
  return Number.isFinite(value) ? value : null
}

export function sortSkillDamageMatrixEntries(
  entries: readonly DamageThreeAttributeEntry[], key: MatrixSortKey, direction: MatrixSort['direction'],
  cells: WeakMap<DamageThreeAttributeEntry, DamageCell> | null = null,
) {
  const order = direction === 'asc' ? 1 : -1
  // The input is already in default operator/S-number order. Stable sorting
  // preserves that order for all ties, including uncomputable cells.
  if (key === 'operator' && order === 1) return entries
  if (isDamageKey(key)) {
    if (!cells) return entries
    return [...entries].sort((a, b) => compareNumericValues(damageValue(cells.get(a), key), damageValue(cells.get(b), key), order))
  }
  return [...entries].sort((a, b) => {
    if (key === 'skillIndex') return (a.skill.skillIndex - b.skill.skillIndex) * order
    const left = textValue(a, key)
    const right = textValue(b, key)
    if (!left || !right) return Number(!left) - Number(!right)
    return names.compare(left, right) * order
  })
}

export function useSkillDamageMatrixSort(
  entries: readonly DamageThreeAttributeEntry[], mode: DamageThreeSkillRankMode,
  pairs: readonly EnemyResistanceThreshold[] | undefined, sort: MatrixSort, disablePenetration: boolean,
): readonly DamageThreeAttributeEntry[] | null {
  const { key, resistance, direction } = sort
  const pair = isDamageKey(key) ? pairs?.find(item => item.resistance === resistance && item.defense !== null) : undefined
  // Scope/version changes can match the same RES to a different DEF. Keep caches for
  // each mode and condition, reusing individual entries when the search changes.
  const caches = useMemo(() => new Map(pairs?.map(condition => [condition, {
    virtual: new WeakMap<DamageThreeAttributeEntry, DamageCell>(),
    actual: new WeakMap<DamageThreeAttributeEntry, DamageCell>(),
  }])), [pairs, disablePenetration])
  const cells = pair ? caches.get(pair)![mode] : null
  const [revision, complete] = useReducer(value => value + 1, 0)
  const pending = useMemo(() => cells ? entries.filter(entry => !cells.has(entry)) : [], [entries, cells, revision])

  useEffect(() => {
    if (!cells || !pair || !pending.length) return
    let index = 0
    const calculateBatch = () => {
      const deadline = performance.now() + 10
      do {
        const entry = pending[index++]
        cells.set(entry, evaluateDamageThreeSkillRankRow(entry, [pair], mode, disablePenetration).cells[0])
      } while (index < pending.length && performance.now() < deadline)
      if (index < pending.length) timer = window.setTimeout(calculateBatch, 0)
      else complete()
    }
    let timer = window.setTimeout(calculateBatch, 0)
    return () => window.clearTimeout(timer)
  }, [pending, cells, pair, mode, disablePenetration])

  return useMemo(() => pending.length ? null : sortSkillDamageMatrixEntries(entries, key, direction, cells),
    [pending, entries, key, direction, cells])
}
