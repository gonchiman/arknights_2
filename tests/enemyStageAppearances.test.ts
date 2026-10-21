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

test('物語環境はマップ一覧へ残し、敵統計では取得済みでも未取得でも集計対象外にする', () => {
  const source = { stages: {
    ...stageTable.stages,
    easy: { stageId: 'easy_01', levelId: 'Obt/Main/Level_Easy', diffGroup: 'EASY', isStoryOnly: false },
  } }
  const inventory = selectStageLevels(source)
  assert.ok(inventory.levels.some(({ stageId }) => stageId === 'easy_01'))
  assert.deepEqual(inventory.excludedLevelIds, [])

  const selection = selectStageLevels(source, { excludeStoryEnvironment: true })
  assert.deepEqual(selection.levels, selectStageLevels(stageTable).levels)
  assert.equal(selection.stageRecordCount, 3)
  assert.deepEqual(selection.excludedLevelIds, ['obt/main/level_easy'])
  for (const cached of [false, true]) {
    const levelsById = new Map([
      ['activities/act/level_test_b', { enemyDbRefs: [{ id: 'enemy_a' }] }],
      ['obt/main/level_test_a', { enemyDbRefs: [{ id: 'enemy_a' }] }],
    ])
    if (cached) levelsById.set('obt/main/level_easy', { enemyDbRefs: [{ id: 'enemy_easy_only' }] })
    const result = buildEnemyStageAppearanceDocument({
      selection, handbookSource: handbook, levelsById,
      failedLevelIds: ['Obt/Main/Level_Easy.json'],
    })
    assert.equal(result.status, 'complete')
    assert.equal(result.summary.uniqueLevelCount, 2)
    assert.equal(result.summary.processedLevelCount, 2)
    assert.equal(result.summary.failedLevelCount, 0)
    assert.equal(result.summary.excludedLevelCount, 1)
    assert.equal(result.enemies.enemy_a.stageCount, 2)
    assert.equal(result.enemies.enemy_easy_only, undefined)
    assert.deepEqual(result.diagnostics.failedLevelIds, [])
    assert.deepEqual(result.diagnostics.excludedLevelIds, ['obt/main/level_easy'])
  }
})

test('物語と標準が同じlevelIdを参照する場合は標準を1件として残す', () => {
  const selection = selectStageLevels({ stages: {
    easy: { stageId: 'easy_01', levelId: 'Obt/Main/Shared', diffGroup: 'EASY', isStoryOnly: false },
    normal: { stageId: 'normal_01', levelId: 'obt/main/shared', diffGroup: 'NORMAL', isStoryOnly: false },
  } }, { excludeStoryEnvironment: true })
  assert.deepEqual(selection.levels, [{ levelId: 'obt/main/shared', stageId: 'normal_01' }])
  assert.deepEqual(selection.excludedLevelIds, [])
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
  assert.match(result.source.stageTableUrl, /stage_table\.json$/)
  assert.match(result.source.handbookTableUrl, /enemy_handbook_table\.json$/)
  assert.match(result.source.levelBaseUrl, /\/levels$/)
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
