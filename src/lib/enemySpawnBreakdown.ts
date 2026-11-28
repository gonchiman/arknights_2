import type { EnemyRecord } from '../types/enemy.ts'
import { buildEnemySpawnPopulation } from './damageThreeEnemySpawnAdvantage.ts'
import { getEnemyCountWeight, type EnemyHistogramCounts } from './enemyHistogramCounts.ts'
import type { MainStorySpawnList } from './mainStoryEnemySpawns.ts'

export type EnemySpawnBreakdownView = 'pairs' | 'enemies' | 'chapters'

interface EnemySpawnPair {
  key: string
  defense: number
  resistance: number
}

export interface EnemySpawnBreakdownRow {
  key: string
  label: string
  count: number
  share: number
}

interface BreakdownOptions {
  view: EnemySpawnBreakdownView
  chapter?: number | null
  pairKey?: string | null
  chapterLists?: readonly MainStorySpawnList[]
}

const labelOrder = new Intl.Collator('ja-JP', { numeric: true })
const statFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })

export function formatEnemySpawnPair(defense: number, resistance: number): string {
  return `防御力 ${statFormat.format(defense)} ／ 術耐性 ${statFormat.format(resistance)}`
}

export function buildEnemySpawnBreakdown(rows: readonly EnemyRecord[], counts: EnemyHistogramCounts, options: BreakdownOptions) {
  const { view, chapterLists = [], chapter, pairKey } = options
  // Match each enemy to a pair admitted by the comparison's archived population.
  const population = buildEnemySpawnPopulation(rows, counts)
  const populationPairs = new Map(population.pairs.map(({ defense, resistance }) => {
    const key = JSON.stringify([defense, resistance])
    return [key, { key, defense, resistance }] as const
  }))
  const pairs = new Map<string, EnemySpawnPair>()
  const groups = new Map<string, Omit<EnemySpawnBreakdownRow, 'share'>>()
  const chapters = [...new Set(chapterLists.map(list => list.stage.chapter))].sort((a, b) => a - b)
  const enemies = new Map<string, { name: string; pair: EnemySpawnPair | null; weight: number }>()
  const nameCounts = new Map<string, number>()
  for (const { id, name, stats } of rows) {
    const weight = getEnemyCountWeight(id, 'SPAWNS', counts)
    if (weight <= 0) continue
    const pair = populationPairs.get(JSON.stringify([stats.defense, stats.magicResistance])) ?? null
    enemies.set(id, { name, pair, weight })
    if (pair) nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1)
  }

  let total = 0, missingCount = 0
  function add(key: string, label: string, count: number) {
    const existing = groups.get(key)
    if (existing) existing.count += count
    else groups.set(key, { key, label, count })
    total += count
  }
  function countSpawn(id: string, count: number, chapterNumber?: number) {
    const enemy = enemies.get(id)
    if (!enemy) return
    const { pair, name } = enemy
    if (!pair) {
      missingCount += count
      return
    }
    if (view === 'chapters') {
      add(String(chapterNumber), `第${chapterNumber}章`, count)
      return
    }
    pairs.set(pair.key, pair)
    if (view === 'pairs') {
      add(pair.key, formatEnemySpawnPair(pair.defense, pair.resistance), count)
    } else if (pairKey == null || pairKey === pair.key) {
      add(id, (nameCounts.get(name) ?? 0) > 1 ? `${name}（${id}）` : name, count)
    }
  }

  if (view === 'chapters' || chapter != null) {
    for (const { stage, groups: spawns } of chapterLists) {
      if (view !== 'chapters' && stage.chapter !== chapter) continue
      for (const spawn of spawns) countSpawn(spawn.enemyId, spawn.count, stage.chapter)
    }
  } else {
    for (const [id, { weight }] of enemies) countSpawn(id, weight)
  }
  return {
    rows: [...groups.values()].sort((a, b) => b.count - a.count || labelOrder.compare(a.label, b.label))
      .map(row => ({ ...row, share: row.count / total })),
    total, missingCount, chapters,
    pairs: [...pairs.values()].sort((a, b) => a.defense - b.defense || a.resistance - b.resistance),
  }
}
