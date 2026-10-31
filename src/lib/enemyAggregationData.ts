import { buildEnemyRecords } from './enemyData.ts'
import { parseEnemyHistogramCounts, type EnemyHistogramCounts } from './enemyHistogramCounts.ts'
import { parseMapIndex } from './mapDatabase.ts'
import { summarizeMapCoverage } from './enemyMapCoverage.ts'
import { createChartImageFilename } from './chartImageFilename.ts'
import { parseEnemyAggregationIndex, parseEnemyAggregationBundle,
  type EnemyAggregationVersion } from './enemyAggregationContract.ts'
import type { EnemyRecord } from '../types/enemy.ts'
import type { MapIndex } from '../types/map.ts'

export interface EnemyAggregationData {
  maps: MapIndex
  counts: EnemyHistogramCounts
  rows: EnemyRecord[]
}

/** Load a complete fixed dataset. A failed version must never fall back to live data. */
export function createEnemyAggregationClient({ fetch: fetchOverride, base = '/' }: {
  fetch?: typeof globalThis.fetch; base?: string
} = {}) {
  const fetchData = fetchOverride ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args))
  const prefix = `${base.endsWith('/') ? base : `${base}/`}data/enemy-aggregation/`
  const requests = new Map<string, Promise<EnemyAggregationData>>()
  async function loadIndex() {
    const response = await fetchData(`${prefix}index.json`, { cache: 'no-store' })
    if (!response.ok) throw new Error('集計データの版一覧を取得できませんでした。')
    return parseEnemyAggregationIndex(await response.json())
  }
  async function readVersion(version: EnemyAggregationVersion): Promise<EnemyAggregationData> {
    const response = await fetchData(`${prefix}${version.file}`)
    if (!response.ok) throw new Error(`${version.label}を取得できませんでした。`)
    const bytes = await response.arrayBuffer()
    const hash = async (buffer: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)),
      byte => byte.toString(16).padStart(2, '0')).join('')
    const signature = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength))
    const compressed = signature[0] === 0x1f && signature[1] === 0x8b
    if (compressed && (bytes.byteLength !== version.bytes || await hash(bytes) !== version.sha256)) {
      throw new Error('集計データの保存内容と版情報が一致しません。')
    }
    // Vite and some hosts use Content-Encoding:gzip for .gz assets; fetch has
    // already decoded those responses. Both delivery forms verify the same payload.
    const payload = compressed ? await new Response(new Blob([bytes]).stream()
      .pipeThrough(new DecompressionStream('gzip'))).arrayBuffer() : bytes
    if (payload.byteLength !== version.payloadBytes || await hash(payload) !== version.payloadSha256) {
      throw new Error('集計データの保存内容と版情報が一致しません。')
    }
    const bundle = parseEnemyAggregationBundle(JSON.parse(new TextDecoder().decode(payload)))
    if (bundle.versionId !== version.id) throw new Error('集計データの版が一致しません。')
    const maps = parseMapIndex(bundle.files['maps/index.json'])
    const counts = parseEnemyHistogramCounts(bundle.files['enemy-histogram-counts.json'])
    const coverage = summarizeMapCoverage(maps.maps, 'SPAWNS')
    if (counts.summary.spawnMapCount !== coverage.included
      || coverage.included !== version.summary.includedMapCount
      || coverage.excluded !== version.summary.excludedMapCount
      || coverage.missing !== version.summary.missingMapCount
      || (counts.summary.lowerBoundMapCount ?? 0) !== (version.summary.lowerBoundMapCount ?? 0)
      || (counts.summary.expectedMapCount ?? 0) !== (version.summary.expectedMapCount ?? 0)) {
      throw new Error('マップ一覧と出現数の集計版が一致しません。')
    }
    const rows = buildEnemyRecords(bundle.files['runtime/enemy_handbook_table.json'],
      bundle.files['runtime/enemy_database.json'], bundle.files['enemy-stage-appearances.json'])
    if (!rows.length) throw new Error('集計版の敵ステータスがありません。')
    return { maps, counts, rows }
  }
  function loadVersion(version: EnemyAggregationVersion) {
    const key = JSON.stringify([version.id, version.sha256, version.payloadSha256, version.summary])
    let request = requests.get(key)
    if (!request) {
      request = readVersion(version).catch(error => { requests.delete(key); throw error })
      requests.set(key, request)
    }
    return request
  }
  return { loadIndex, loadVersion }
}

export const enemyAggregationClient = createEnemyAggregationClient({ base: import.meta.env?.BASE_URL ?? '/' })

export function getEnemyAggregationFilename(filename: string, versionId?: string): string {
  if (!versionId) return filename
  const parts = filename.replace(/\.png$/i, '').split('_')
  // The version is a primary condition, retained even when long names are shortened.
  return createChartImageFilename(parts[0], [`集計${versionId}`, ...parts.slice(1)])
}
