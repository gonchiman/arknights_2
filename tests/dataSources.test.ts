import test from 'node:test'
import assert from 'node:assert/strict'
import { buildEnemyStageAppearanceDocument } from '../scripts/generateEnemyStageAppearances.mjs'
import {
  ALL_DATA_SOURCES,
  ARKNIGHTS_GAMEDATA_REPOSITORY,
  DATA_SOURCE_URLS,
  readStageSnapshotSummary,
} from '../src/lib/dataSources.ts'

test('参照元カタログのIDとURLが重複せず、HTTPSを使う', () => {
  const ids = ALL_DATA_SOURCES.map((source) => source.id)
  const urls = ALL_DATA_SOURCES.map((source) => source.url)

  assert.equal(new Set(ids).size, ids.length)
  assert.equal(new Set(urls).size, urls.length)
  assert.ok(ARKNIGHTS_GAMEDATA_REPOSITORY.url.startsWith('https://'))
  assert.ok(urls.every((url) => url.startsWith('https://')))
})

test('実行時に取得する全データが参照元カタログに登録されている', () => {
  const runtimeSources = ALL_DATA_SOURCES.filter((source) => source.access.includes('runtime'))

  assert.deepEqual(
    runtimeSources.map((source) => source.id),
    [
      'character-table',
      'skill-table',
      'uniequip-table',
      'battle-equip-table',
      'enemy-handbook-table',
      'enemy-database',
    ],
  )
  assert.ok(runtimeSources.every((source) => source.description && source.usage.length > 0))
})

test('敵の登場ステージ数に必要な生成元が登録されている', () => {
  const generationUrls = new Set(
    ALL_DATA_SOURCES
      .filter((source) => source.access.includes('generation'))
      .map((source) => source.url),
  )

  assert.ok(generationUrls.has(DATA_SOURCE_URLS.stageTable))
  assert.ok(generationUrls.has(DATA_SOURCE_URLS.levelDirectory))
  assert.ok(generationUrls.has(DATA_SOURCE_URLS.enemyHandbook))
})

test('生成スクリプトと参照元カタログのURLが一致する', () => {
  const document = buildEnemyStageAppearanceDocument({
    selection: { stageRecordCount: 0, levels: [] },
    handbookSource: { enemyData: {} },
    levelsById: new Map(),
    generatedAt: '2026-08-31T00:00:00.000Z',
  })

  assert.equal(document.source.stageTableUrl, DATA_SOURCE_URLS.stageTable)
  assert.equal(document.source.handbookTableUrl, DATA_SOURCE_URLS.enemyHandbook)
  assert.equal(document.source.levelBaseUrl, DATA_SOURCE_URLS.levelRawBase)
})

test('部分集計の生成情報を検証し、不整合な件数を拒否する', () => {
  const valid = {
    schemaVersion: 1,
    scope: 'stage_table',
    status: 'partial',
    generatedAt: '2026-08-31T00:00:00.000Z',
    summary: {
      stageRecordCount: 12,
      uniqueLevelCount: 10,
      processedLevelCount: 8,
      failedLevelCount: 2,
    },
  }

  assert.deepEqual(readStageSnapshotSummary(valid), {
    status: 'partial',
    generatedAt: '2026-08-31T00:00:00.000Z',
    stageRecordCount: 12,
    uniqueLevelCount: 10,
    processedLevelCount: 8,
    failedLevelCount: 2,
  })
  assert.equal(readStageSnapshotSummary({
    ...valid,
    summary: { ...valid.summary, processedLevelCount: 9 },
  }), null)
})
