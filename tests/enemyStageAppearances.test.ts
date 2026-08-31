import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEnemyStageAppearanceDocument,
  extractLevelEnemyIds,
  normalizeLevelId,
  selectStageLevels,
} from '../scripts/generateEnemyStageAppearances.mjs'

const stageTable = {
  stages: {
    normal: {
      stageId: 'main_01',
      levelId: 'Obt/Main/Level_Test_A',
      difficulty: 'NORMAL',
      isStoryOnly: false,
    },
    hard: {
      stageId: 'main_01#f#',
      levelId: 'obt/main/level_test_a',
      difficulty: 'FOUR_STAR',
      isStoryOnly: false,
    },
    event: {
      stageId: 'act_02',
      levelId: 'Activities/Act/Level_Test_B.json',
      difficulty: 'NORMAL',
      isStoryOnly: false,
    },
    story: {
      stageId: 'story_01',
      levelId: 'obt/story/level_story',
      difficulty: 'NORMAL',
      isStoryOnly: true,
    },
  },
}

const handbook = {
  enemyData: {
    enemy_a: { enemyId: 'enemy_a', hideInHandbook: false, isInvalidKilled: false },
    enemy_zero: { enemyId: 'enemy_zero', hideInHandbook: false, isInvalidKilled: false },
    enemy_hidden: { enemyId: 'enemy_hidden', hideInHandbook: true, isInvalidKilled: false },
  },
}

test('戦闘ステージをlevelIdで重複除去し、通常難易度のstageIdを代表にする', () => {
  const selection = selectStageLevels(stageTable)

  assert.equal(selection.stageRecordCount, 3)
  assert.deepEqual(selection.levels, [
    { levelId: 'activities/act/level_test_b', stageId: 'act_02' },
    { levelId: 'obt/main/level_test_a', stageId: 'main_01' },
  ])
  assert.equal(normalizeLevelId('\\Obt\\Main\\Level_Test_A.json'), 'obt/main/level_test_a')
})

test('Level内の同じ敵を1回にまとめる', () => {
  assert.deepEqual(extractLevelEnemyIds({
    enemyDbRefs: [
      { id: 'enemy_a' },
      { id: 'enemy_a' },
      { id: 'enemy_b' },
      { id: '' },
    ],
  }), ['enemy_a', 'enemy_b'])
})

test('同じlevelIdは1、異なるlevelIdはそれぞれ1として登場ステージ数を集計する', () => {
  const selection = selectStageLevels(stageTable)
  const levelsById = new Map([
    ['activities/act/level_test_b', { enemyDbRefs: [{ id: 'enemy_a' }] }],
    ['obt/main/level_test_a', { enemyDbRefs: [{ id: 'enemy_a' }, { id: 'enemy_a' }, { id: 'enemy_unknown' }] }],
  ])
  const result = buildEnemyStageAppearanceDocument({
    selection,
    handbookSource: handbook,
    levelsById,
    generatedAt: '2026-08-31T00:00:00.000Z',
  })

  assert.equal(result.status, 'complete')
  assert.deepEqual(result.enemies.enemy_a, { stageCount: 2, stageIds: ['act_02', 'main_01'] })
  assert.deepEqual(result.enemies.enemy_zero, { stageCount: 0, stageIds: [] })
  assert.deepEqual(result.enemies.enemy_unknown, { stageCount: 1, stageIds: ['main_01'] })
  assert.deepEqual(result.diagnostics.unmatchedEnemyIds, ['enemy_unknown'])
  assert.equal(result.summary.uniqueLevelCount, 2)
  assert.equal(result.summary.processedLevelCount, 2)
})

test('Level取得失敗を診断へ残し、部分集計として出力する', () => {
  const selection = selectStageLevels(stageTable)
  const result = buildEnemyStageAppearanceDocument({
    selection,
    handbookSource: handbook,
    levelsById: new Map([
      ['obt/main/level_test_a', { enemyDbRefs: [{ id: 'enemy_a' }] }],
    ]),
    generatedAt: '2026-08-31T00:00:00.000Z',
  })

  assert.equal(result.status, 'partial')
  assert.equal(result.summary.failedLevelCount, 1)
  assert.deepEqual(result.diagnostics.failedLevelIds, ['activities/act/level_test_b'])
})

test('stageIdが同じでもlevelIdが異なれば別ステージとして数える', () => {
  const selection = {
    stageRecordCount: 2,
    levels: [
      { levelId: 'obt/main/level_a', stageId: 'shared_stage' },
      { levelId: 'obt/main/level_b', stageId: 'shared_stage' },
    ],
  }
  const result = buildEnemyStageAppearanceDocument({
    selection,
    handbookSource: handbook,
    levelsById: new Map([
      ['obt/main/level_a', { enemyDbRefs: [{ id: 'enemy_a' }] }],
      ['obt/main/level_b', { enemyDbRefs: [{ id: 'enemy_a' }] }],
    ]),
    generatedAt: '2026-08-31T00:00:00.000Z',
  })

  assert.equal(result.enemies.enemy_a.stageCount, 2)
  assert.deepEqual(result.enemies.enemy_a.stageIds, ['shared_stage', 'shared_stage'])
})
