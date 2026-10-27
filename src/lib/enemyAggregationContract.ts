import { parseEnemyHistogramCounts } from './enemyHistogramCounts.ts'
import { parseMapIndex } from './mapDatabase.ts'
import { summarizeMapCoverage } from './enemyMapCoverage.ts'

export const CURRENT_ENEMY_AGGREGATION_RULE_VERSION = 'hidden-groups-default-off-v2'
export const ENEMY_AGGREGATION_INDEX_FILE = 'enemy-aggregation/index.json'
export const ENEMY_AGGREGATION_FILES = [
  'maps/index.json', 'enemy-histogram-counts.json', 'enemy-stage-appearances.json',
  'runtime/enemy_handbook_table.json', 'runtime/enemy_database.json',
] as const
export type EnemyAggregationFile = typeof ENEMY_AGGREGATION_FILES[number]

export interface EnemyAggregationVersion {
  id: string
  label: string
  createdAt: string
  generatedAt: string
  sourceRevision: string
  ruleVersion: string
  generatorVersion: string
  description: string
  file: string
  sha256: string
  payloadSha256: string
  contentSha256: string
  bytes: number
  payloadBytes: number
  summary: { includedMapCount: number; excludedMapCount: number; missingMapCount: number }
  changes: { addedMapIds: string[]; removedMapIds: string[]; changedMapIds: string[] }
  previousVersionId?: string
}

export interface EnemyAggregationIndex {
  schemaVersion: 1
  currentVersionId: string
  versions: EnemyAggregationVersion[]
}

export interface EnemyAggregationBundle {
  schemaVersion: 1
  versionId: string
  files: Record<EnemyAggregationFile, unknown>
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const versionId = (value: unknown) => typeof value === 'string' && /^v[1-9]\d*$/.test(value)
const date = (value: unknown) => text(value) && Number.isFinite(Date.parse(value))
const stringList = (value: unknown): value is string[] => Array.isArray(value) && value.every(text)
  && new Set(value).size === value.length

export function parseEnemyAggregationIndex(source: unknown): EnemyAggregationIndex {
  const root = record(source)
  if (root?.schemaVersion !== 1 || !versionId(root.currentVersionId) || !Array.isArray(root.versions)
    || root.versions.length === 0) throw new Error('集計版の一覧を確認できませんでした。')
  const ids = new Set<string>()
  const versions = root.versions.map((raw): EnemyAggregationVersion => {
    const item = record(raw), summary = record(item?.summary), changes = record(item?.changes)
    if (!item || !versionId(item.id) || ids.has(String(item.id)) || !text(item.label)
      || !date(item.createdAt) || !date(item.generatedAt) || !text(item.sourceRevision)
      || !/^[a-f0-9]{40}$/.test(item.sourceRevision) || !text(item.ruleVersion) || !hash(item.generatorVersion)
      || typeof item.description !== 'string' || item.file !== `${item.id}.json.gz`
      || !hash(item.sha256) || !hash(item.payloadSha256) || !hash(item.contentSha256)
      || !count(item.bytes) || item.bytes === 0 || !count(item.payloadBytes) || item.payloadBytes === 0
      || !summary || !['includedMapCount', 'excludedMapCount', 'missingMapCount'].every(key => count(summary[key]))
      || !changes || !['addedMapIds', 'removedMapIds', 'changedMapIds'].every(key => stringList(changes[key]))
      || (item.previousVersionId !== undefined && !versionId(item.previousVersionId))) {
      throw new Error('集計版の情報に不正な値があります。')
    }
    ids.add(String(item.id))
    return item as unknown as EnemyAggregationVersion
  })
  if (!ids.has(String(root.currentVersionId)) || versions.some(item => item.previousVersionId !== undefined
    && (!ids.has(item.previousVersionId) || Number(item.previousVersionId.slice(1)) >= Number(item.id.slice(1))))) {
    throw new Error('集計版の履歴に不整合があります。')
  }
  return { schemaVersion: 1, currentVersionId: String(root.currentVersionId), versions }
}

export function parseEnemyAggregationBundle(source: unknown, expectedVersionId?: string): EnemyAggregationBundle {
  const root = record(source), files = record(root?.files)
  if (root?.schemaVersion !== 1 || !versionId(root.versionId)
    || (expectedVersionId !== undefined && root.versionId !== expectedVersionId) || !files
    || Object.keys(files).length !== ENEMY_AGGREGATION_FILES.length
    || ENEMY_AGGREGATION_FILES.some(path => !Object.hasOwn(files, path))) {
    throw new Error('集計版のデータが揃っていません。')
  }
  const index = parseMapIndex(files['maps/index.json'])
  const histogram = parseEnemyHistogramCounts(files['enemy-histogram-counts.json'])
  const coverage = summarizeMapCoverage(index.maps, 'SPAWNS')
  if (coverage.included !== histogram.summary.spawnMapCount || coverage.missing !== histogram.summary.missingMapCount
    || coverage.excluded !== (histogram.summary.excludedMapCount ?? 0) + histogram.summary.spawnExcludedMapCount) {
    throw new Error('集計版のマップ数と出現数に不整合があります。')
  }
  const appearances = record(files['enemy-stage-appearances.json'])
  const entries = record(appearances?.enemies)
  if (appearances?.schemaVersion !== 1 || !entries || Object.entries(entries).some(([id, raw]) => {
    const entry = record(raw)
    return !entry || !count(entry.stageCount) || !stringList(entry.stageIds)
      || entry.stageCount !== entry.stageIds.length || entry.stageCount !== (histogram.enemies[id]?.mapCount ?? 0)
  })) throw new Error('集計版の敵登場データに不整合があります。')
  const handbook = record(record(files['runtime/enemy_handbook_table.json'])?.enemyData)
  const databaseRoot = files['runtime/enemy_database.json']
  const database = record(databaseRoot) && Object.hasOwn(databaseRoot as object, 'enemies')
    ? record(databaseRoot)?.enemies : databaseRoot
  const databaseEntries = Array.isArray(database)
    ? database.map(raw => [record(raw)?.Key ?? record(raw)?.key, record(raw)?.Value ?? record(raw)?.value])
    : Object.entries(record(database) ?? {})
  const seen = new Set()
  if (!handbook || Object.keys(handbook).length === 0 || Object.values(handbook).some(value => !record(value))
    || databaseEntries.length === 0 || databaseEntries.some(([id, levels]) => {
      if (!text(id) || seen.has(id) || !Array.isArray(levels) || levels.length === 0) return true
      seen.add(id)
      return levels.some(level => !record(level) || !count(record(level)?.level) || !record(record(level)?.enemyData))
    })) throw new Error('集計版の敵ステータスを確認できませんでした。')
  return { schemaVersion: 1, versionId: String(root.versionId), files: files as EnemyAggregationBundle['files'] }
}
