import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getSpecialActivityLabel,
  isSpecialActivityType,
  resolveStageStatisticsExclusion,
} from '../src/lib/enemyAggregationScope.ts'
import { getSpecialModeExclusions, selectStageLevels } from '../scripts/generateEnemyStageAppearances.mjs'

const SPECIAL_TYPES = [
  'MULTIPLAY_V3', 'MULTIPLAY_VERIFY2', 'BOSS_RUSH', 'VEC_BREAK', 'VEC_BREAK_V2',
  'AUTOCHESS_SEASON', 'AUTOCHESS_VERIFY1', 'ENEMY_DUEL', 'HALFIDLE_VERIFY1',
  'ARCADE', 'INTERLOCK', 'APRIL_FOOL',
] as const

function fixture(types: readonly string[]) {
  return {
    stages: { stages: Object.fromEntries(types.map((_, index) => [`stage_${index}`, {
      stageId: `stage_${index}`, levelId: `Activities/Fixture/Level_${index}.json`,
      zoneId: `zone_${index}`, difficulty: 'NORMAL', isStoryOnly: false,
    }])) },
    zones: { zones: Object.fromEntries(types.map((_, index) => [`zone_${index}`, { type: 'ACTIVITY' }])) },
    activity: {
      zoneToActivity: Object.fromEntries(types.map((_, index) => [`zone_${index}`, `activity_${index}`])),
      basicInfo: Object.fromEntries(types.map((type, index) => [`activity_${index}`, { type }])),
    },
  }
}

for (const type of SPECIAL_TYPES) {
  test(`公式の特殊モード ${type} は集計対象から除外し、分類根拠を残す`, () => {
    const data = fixture([type, 'TYPE_ACT9D0'])
    const before = structuredClone(data)
    const expected = { kind: 'special-mode', activityType: type, activityId: 'activity_0' }
    assert.equal(isSpecialActivityType(type), true)
    assert.notEqual(getSpecialActivityLabel(type), type)
    assert.deepEqual(resolveStageStatisticsExclusion(data.stages.stages.stage_0, 'ACTIVITY', data.activity), expected)
    assert.deepEqual([...getSpecialModeExclusions(data.stages, data.zones, data.activity)], [
      ['activities/fixture/level_0', expected],
    ])
    const result = selectStageLevels(data.stages, { excludeSpecialActivities: true,
      zoneTableSource: data.zones, activityTableSource: data.activity })
    assert.deepEqual(result.levels.map(level => level.stageId), ['stage_1'])
    assert.deepEqual(result.excludedLevelIds, ['activities/fixture/level_0'])
    assert.deepEqual(data, before)
  })
}

test('通常サイドストーリー・オムニバス・旧イベントの個別typeを維持する', () => {
  const data = fixture(['TYPE_ACT9D0', 'MINISTORY', 'TYPE_ACT46SIDE', 'TYPE_ACT3D0', 'TYPE_ACT12SIDE'])
  assert.equal(getSpecialModeExclusions(data.stages, data.zones, data.activity).size, 0)
  const result = selectStageLevels(data.stages, { excludeSpecialActivities: true,
    zoneTableSource: data.zones, activityTableSource: data.activity })
  assert.equal(result.levels.length, 5)
  assert.deepEqual(result.excludedLevelIds, [])
})

test('フォルダ名から推測せず、復刻先を含む公式zone対応で分類する', () => {
  const data = fixture(['BOSS_RUSH', 'TYPE_ACT46SIDE', 'APRIL_FOOL'])
  data.stages.stages.stage_0.levelId = 'Activities/Act46side/Level_Special'
  data.stages.stages.stage_1.levelId = 'Activities/Act1multi/Level_Ordinary'
  data.stages.stages.stage_2.levelId = 'Activities/Act17d7/Level_Fun'
  data.activity.zoneToActivity.zone_2 = 'act6fun'
  data.activity.basicInfo.act6fun = { type: 'APRIL_FOOL' }
  const result = selectStageLevels(data.stages, { excludeSpecialActivities: true,
    zoneTableSource: data.zones, activityTableSource: data.activity })
  assert.deepEqual(result.levels.map(level => level.levelId), ['activities/act1multi/level_ordinary'])
  assert.deepEqual(result.excludedLevelIds, ['activities/act17d7/level_fun', 'activities/act46side/level_special'])
  assert.equal(getSpecialModeExclusions(data.stages, data.zones, data.activity)
    .get('activities/act17d7/level_fun')?.activityId, 'act6fun')
})

test('新しい未確認typeは通常扱いにせず生成を停止する', () => {
  for (const type of ['FUTURE_SPECIAL_MODE', 'MULTIPLAY_V9', 'toString', '']) {
    const data = fixture([type])
    assert.equal(isSpecialActivityType(type), false)
    assert.throws(() => selectStageLevels(data.stages, { excludeSpecialActivities: true,
      zoneTableSource: data.zones, activityTableSource: data.activity }), /Unknown activity classification/)
  }
})

test('zoneまたはactivityの対応データが欠けている場合は除外可否を推測しない', () => {
  const data = fixture(['BOSS_RUSH'])
  for (const activityTableSource of [undefined, {}, { basicInfo: data.activity.basicInfo, zoneToActivity: {} },
    { basicInfo: {}, zoneToActivity: data.activity.zoneToActivity }]) {
    assert.throws(() => selectStageLevels(data.stages, { excludeSpecialActivities: true,
      zoneTableSource: data.zones, activityTableSource }), /Missing activity classification/)
  }
  assert.throws(() => selectStageLevels(data.stages, { excludeSpecialActivities: true,
    zoneTableSource: { zones: {} }, activityTableSource: data.activity }), /Missing activity zone/)
  assert.throws(() => selectStageLevels(data.stages, { excludeSpecialActivities: true,
    activityTableSource: data.activity }), /requires a valid zone table/)
})

test('通常と特殊のaliasが同じlevelを使う場合は通常側の代表として1回残す', () => {
  for (const reverse of [false, true]) {
    const data = fixture(['BOSS_RUSH', 'TYPE_ACT9D0'])
    data.stages.stages.stage_0.stageId = 'a_special'
    data.stages.stages.stage_1.stageId = 'z_ordinary'
    data.stages.stages.stage_0.levelId = 'Activities/Shared/Level_Test.json'
    data.stages.stages.stage_1.levelId = 'activities/shared/level_test'
    if (reverse) data.stages.stages = Object.fromEntries(Object.entries(data.stages.stages).reverse())
    assert.equal(getSpecialModeExclusions(data.stages, data.zones, data.activity).size, 0)
    const result = selectStageLevels(data.stages, { excludeSpecialActivities: true,
      zoneTableSource: data.zones, activityTableSource: data.activity })
    assert.deepEqual(result.levels, [{ levelId: 'activities/shared/level_test', stageId: 'z_ordinary',
      context: { difficulty: 'NORMAL' } }])
    assert.deepEqual(result.excludedLevelIds, [])
  }
})

test('メインテーマ・物資調達などの非イベント分類にactivity表を要求しない', () => {
  for (const zoneType of ['MAINLINE', 'MAINLINE_ACTIVITY', 'WEEKLY', 'CAMPAIGN']) {
    const data = fixture(['BOSS_RUSH'])
    data.zones.zones.zone_0.type = zoneType
    assert.equal(resolveStageStatisticsExclusion(data.stages.stages.stage_0, zoneType, undefined), null)
    assert.equal(selectStageLevels(data.stages, { excludeSpecialActivities: true,
      zoneTableSource: data.zones }).levels.length, 1)
  }
})

test('従来のselectStageLevelsは指定なしなら特殊モードも残し、activity表を要求しない', () => {
  const data = fixture([...SPECIAL_TYPES, 'UNREVIEWED_MODE'])
  const ordinaryInventory = selectStageLevels(data.stages)
  assert.equal(ordinaryInventory.levels.length, 13)
  assert.deepEqual(ordinaryInventory.excludedLevelIds, [])
  assert.deepEqual(selectStageLevels(data.stages, { excludeSpecialActivities: false,
    zoneTableSource: data.zones, activityTableSource: {} }), ordinaryInventory)
})
