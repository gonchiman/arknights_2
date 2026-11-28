import type { ReactNode } from 'react'
import { MAIN_STORY_SPAWN_AGGREGATION_VERSION } from '../lib/mainStoryEnemySpawns'
import type { ComparisonTableImageSnapshot } from './ComparisonTableImageDialog'

export interface MainStoryChapterSpawnConditions {
  query: string
  sortLabel: string
  scopeLabel: string
  confirmedCount: number
  stageCount: number
  partialStageCount: number
}

export function getMainStoryChapterSpawnImageMetadata({
  query, sortLabel, scopeLabel, confirmedCount, stageCount, partialStageCount,
}: MainStoryChapterSpawnConditions) {
  const version = `集計版 ${MAIN_STORY_SPAWN_AGGREGATION_VERSION}`
  const enemyFilter = query.trim() ? `敵名「${query.trim()}」` : '全敵'
  const scope = [version, '通常環境', scopeLabel, enemyFilter, sortLabel]
  const partial = `一部集計 ${partialStageCount.toLocaleString('ja-JP')}ステージ`
  return {
    title: 'メインストーリーの章別出現回数',
    conditions: [
      ...scope, `確認済み出現回数 ${confirmedCount.toLocaleString('ja-JP')}回`,
      `対象 ${stageCount.toLocaleString('ja-JP')}ステージ`, partial,
    ],
    filenameConditions: [...scope, partial],
  }
}

export function createMainStoryChapterSpawnImage({ table, ...selection }:
  MainStoryChapterSpawnConditions & { table: ReactNode }): ComparisonTableImageSnapshot {
  const metadata = getMainStoryChapterSpawnImageMetadata(selection)
  return {
    ...metadata,
    conditions: [...metadata.conditions,
      ...(selection.partialStageCount > 0 ? ['一部集計のステージは確認できた出現のみを計上'] : [])],
    defaultOutput: { width: 1920, aspect: { preset: '16:9', width: '16', height: '9' } },
    table,
  }
}
