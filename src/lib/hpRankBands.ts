import { getStatRankBands, type StatRankBand } from './statRankBands.ts'

export type HpRankBand = StatRankBand

interface HpRankBandOptions {
  chartKind: 'line' | 'bar'
  minHp?: number
  maxHp: number
  barHps: readonly number[]
}

/** Preserve the HP chart's positive-value domain while sharing rank geometry. */
export function getHpRankBands({ chartKind, minHp = 0, maxHp, barHps }: HpRankBandOptions): HpRankBand[] {
  if (!Number.isFinite(maxHp) || maxHp <= 0) return []
  return getStatRankBands({
    stat: 'maxHp', chartKind, min: minHp, max: maxHp,
    barValues: barHps.filter((hp) => hp > 0),
  })
}
