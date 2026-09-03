import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSkillJsonOverview } from '../src/lib/skillJsonOverview.ts'
import type { RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

test('配置単位とdistinct skillIdを分け、ALL_LEVELSとFINAL_LEVELの母数を返す', () => {
  const levels: RawSkillLevel[] = [
    {
      description: '{atk}',
      blackboard: [{ key: 'atk', value: 1 }],
    },
    {
      description: '{atk} {added}',
      blackboard: [{ key: 'atk', value: 2 }, { key: 'added', value: 10 }],
    },
  ]
  const rows = [
    createSkill({
      operatorId: 'char_a',
      operatorName: 'A',
      skillId: 'shared_skill',
      levels,
    }),
    createSkill({
      operatorId: 'char_b',
      operatorName: 'B',
      skillId: 'shared_skill',
      levels: structuredClone(levels),
    }),
  ]
  const snapshot = structuredClone(rows)

  const allLevels = buildSkillJsonOverview(rows, 'ALL_LEVELS')
  const finalLevel = buildSkillJsonOverview(rows, 'FINAL_LEVEL')

  assert.equal(allLevels.summary.placementCount, 2)
  assert.equal(allLevels.summary.distinctSkillIdCount, 1)
  assert.equal(allLevels.summary.operatorCount, 2)
  assert.equal(allLevels.summary.levelCount, 4)
  assert.equal(allLevels.summary.distinctSkillLevelCount, 2)
  assert.equal(allLevels.summary.blackboardEntryCount, 6)
  assert.equal(allLevels.summary.placeholderOccurrenceCount, 6)

  const atk = allLevels.keyInventory.find((item) => item.key === 'atk')
  assert.ok(atk)
  assert.equal(atk.placementCount, 2)
  assert.equal(atk.distinctSkillIdCount, 1)
  assert.equal(atk.operatorCount, 2)
  assert.equal(atk.levelCount, 4)
  assert.equal(atk.distinctSkillLevelCount, 2)
  assert.equal(atk.entryCount, 4)
  assert.match(atk.searchText, /A/)
  assert.match(atk.searchText, /B/)
  assert.match(atk.searchText, /char_b/)

  assert.equal(finalLevel.summary.scope, 'FINAL_LEVEL')
  assert.equal(finalLevel.summary.levelCount, 2)
  assert.equal(finalLevel.summary.distinctSkillLevelCount, 1)
  assert.equal(finalLevel.summary.blackboardEntryCount, 4)
  assert.equal(finalLevel.adjacentLevelDiffs.transitionCount, 2)
  assert.equal(finalLevel.adjacentLevelDiffs.counts.CHANGED, 2)
  assert.equal(finalLevel.adjacentLevelDiffs.counts.ADDED, 2)
  assert.equal(finalLevel.adjacentLevelDiffs.counts.valueChanged, 2)
  assert.deepEqual(rows, snapshot)
})

test('raw keyを完全一致で分け、重複・欠落・空keyとvalue形状を検査する', () => {
  const overview = buildSkillJsonOverview([createSkill({
    levels: [{
      description: '{atk} {times}',
      blackboard: [
        { key: 'atk', value: 0 },
        { key: 'atk', valueStr: '表示値' },
        { key: 'ATK', value: 2, valueStr: '表示値もあり' },
        { key: '', valueStr: null },
        { value: 3 },
        { key: 'times', value: 4 },
        { key: 'neither' },
      ],
    }],
  })])

  assert.deepEqual(
    new Set(overview.keyInventory.map((item) => item.key)),
    new Set(['atk', 'ATK', '', null, 'times', 'neither']),
  )
  const lowerAtk = overview.keyInventory.find((item) => item.key === 'atk')
  const upperAtk = overview.keyInventory.find((item) => item.key === 'ATK')
  const empty = overview.keyInventory.find((item) => item.keyStatus === 'EMPTY')
  const missing = overview.keyInventory.find((item) => item.keyStatus === 'MISSING')
  assert.ok(lowerAtk && upperAtk && empty && missing)
  assert.equal(lowerAtk.entryCount, 2)
  assert.equal(lowerAtk.duplicateLevelCount, 1)
  assert.equal(lowerAtk.duplicateExtraEntryCount, 1)
  assert.deepEqual(lowerAtk.valueShapes, {
    VALUE_ONLY: 1,
    VALUE_STR_ONLY: 1,
    BOTH: 0,
    NEITHER: 0,
  })
  assert.equal(lowerAtk.referencedEntryCount, 1)
  assert.equal(lowerAtk.unreferencedEntryCount, 1)
  assert.equal(upperAtk.entryCount, 1)
  assert.equal(empty.key, '')
  assert.equal(missing.key, null)
  assert.deepEqual(overview.summary.valueShapes, {
    VALUE_ONLY: 3,
    VALUE_STR_ONLY: 2,
    BOTH: 1,
    NEITHER: 1,
  })

  assert.equal(findingCount(overview, 'DUPLICATE_KEY'), 1)
  assert.equal(findingCount(overview, 'EMPTY_KEY'), 1)
  assert.equal(findingCount(overview, 'MISSING_KEY'), 1)
  assert.equal(findingCount(overview, 'BOTH_VALUE_FIELDS'), 1)
  assert.equal(findingCount(overview, 'NO_VALUE_FIELDS'), 1)
  assert.equal(findingCount(overview, 'UNREFERENCED_ENTRY'), 5)
})

test('型崩れしたblackboard entryを品質所見として隔離し、分析を継続する', () => {
  const overview = buildSkillJsonOverview([createSkill({
    levels: [{
      description: '{valid}',
      blackboard: [
        null,
        1,
        { key: 3, value: 2 },
        { key: 'valid', value: 1 },
      ] as unknown as RawSkillLevel['blackboard'],
    }],
  })])

  assert.equal(overview.summary.blackboardEntryCount, 4)
  assert.deepEqual(overview.keyInventory.map((item) => item.key), ['valid'])
  assert.equal(findingCount(overview, 'INVALID_BLACKBOARD_ENTRY'), 2)
  assert.equal(findingCount(overview, 'INVALID_KEY_TYPE'), 1)
  assert.equal(findingCount(overview, 'MISSING_KEY'), 0)
})

test('配列ではないblackboardを品質所見にして空の集計として継続する', () => {
  const overview = buildSkillJsonOverview([createSkill({
    levels: [{
      description: '{missing}',
      blackboard: { invalid: true },
    } as unknown as RawSkillLevel],
  })])

  assert.equal(overview.summary.blackboardEntryCount, 0)
  assert.equal(overview.keyInventory.length, 0)
  assert.equal(findingCount(overview, 'INVALID_BLACKBOARD_COLLECTION'), 1)
  assert.equal(overview.summary.unmatchedPlaceholderOccurrenceCount, 1)
})

test('代表例の上限後に現れる使用スキルも検索語へ保持する', () => {
  const repeatedLevels = Array.from({ length: 4 }, () => ({
    description: '{shared_key}',
    blackboard: [{ key: 'shared_key', value: 1 }],
  }))
  const overview = buildSkillJsonOverview([
    createSkill({
      operatorId: 'char_first',
      operatorName: '先頭オペレーター',
      skillId: 'skill_first',
      skillName: '先頭スキル',
      levels: repeatedLevels,
    }),
    createSkill({
      operatorId: 'char_later',
      operatorName: '後発オペレーター',
      skillId: 'skill_later',
      skillName: '後発スキル',
      levels: [{
        description: '{shared_key}',
        blackboard: [{ key: 'shared_key', value: 2 }],
      }],
    }),
  ])
  const shared = overview.keyInventory.find((item) => item.key === 'shared_key')

  assert.ok(shared)
  assert.equal(shared.examples.length, 3)
  assert.equal(shared.examples.every((example) => example.operatorId === 'char_first'), true)
  assert.match(shared.searchText, /char_later/)
  assert.match(shared.searchText, /後発オペレーター/)
  assert.match(shared.searchText, /skill_later/)
})

test('valueStrがnullなら両フィールド形状には数えるが値の併記所見にしない', () => {
  const overview = buildSkillJsonOverview([createSkill({
    levels: [{
      blackboard: [{ key: 'nullable_display', value: 1, valueStr: null }],
    }],
  })])
  const item = overview.keyInventory.find((candidate) => candidate.key === 'nullable_display')

  assert.ok(item)
  assert.equal(item.valueShapes.BOTH, 1)
  assert.equal(findingCount(overview, 'BOTH_VALUE_FIELDS'), 0)
})

test('placeholder未対応をraw表記ごとに集約し、配置とlevelの例を残す', () => {
  const overview = buildSkillJsonOverview([createSkill({
    operatorId: 'char_placeholder',
    operatorName: '照合テスト',
    skillIndex: 2,
    levels: [{
      description: '{known} {-missing:0%} {missing} {missing}',
      blackboard: [{ key: 'known', value: 1 }],
    }],
  })])

  assert.equal(overview.summary.placeholderOccurrenceCount, 4)
  assert.equal(overview.summary.unmatchedPlaceholderOccurrenceCount, 3)
  assert.equal(overview.summary.unmatchedPlaceholderCount, 2)
  assert.equal(findingCount(overview, 'UNMATCHED_PLACEHOLDER'), 3)

  const negative = overview.unmatchedPlaceholders.find(
    (item) => item.placeholder === '{-missing:0%}',
  )
  const repeated = overview.unmatchedPlaceholders.find(
    (item) => item.placeholder === '{missing}',
  )
  assert.ok(negative && repeated)
  assert.equal(negative.negative, true)
  assert.equal(negative.rawKey, '-missing')
  assert.equal(negative.lookupKey, 'missing')
  assert.equal(negative.format, '0%')
  assert.equal(repeated.occurrenceCount, 2)
  assert.equal(repeated.placementCount, 1)
  assert.equal(repeated.levelCount, 1)
  assert.equal(repeated.examples[0].operatorId, 'char_placeholder')
  assert.equal(repeated.examples[0].skillIndex, 2)
  assert.equal(repeated.examples[0].levelIndex, 0)
})

test('隣接level差分の追加・削除・value変更・valueStr変更を集約する', () => {
  const overview = buildSkillJsonOverview([createSkill({
    levels: [
      {
        blackboard: [
          { key: 'numeric', value: 1 },
          { key: 'text', valueStr: 'A' },
          { key: 'removed', value: 9 },
        ],
      },
      {
        blackboard: [
          { key: 'numeric', value: 2 },
          { key: 'text', valueStr: 'B' },
          { key: 'added', value: 10 },
        ],
      },
    ],
  })], 'FINAL_LEVEL')

  assert.equal(overview.adjacentLevelDiffs.transitionCount, 1)
  assert.deepEqual(overview.adjacentLevelDiffs.counts, {
    ADDED: 1,
    REMOVED: 1,
    CHANGED: 2,
    UNCHANGED: 0,
    valueChanged: 1,
    valueStrChanged: 1,
  })
  assert.equal(overview.keyInventory.some((item) => item.key === 'removed'), false)
  const removed = overview.adjacentLevelDiffs.byKey.find((item) => item.key === 'removed')
  const numeric = overview.adjacentLevelDiffs.byKey.find((item) => item.key === 'numeric')
  assert.ok(removed && numeric)
  assert.equal(removed.counts.REMOVED, 1)
  assert.equal(numeric.counts.CHANGED, 1)
  assert.equal(numeric.counts.valueChanged, 1)
  assert.equal(numeric.examples[0].fromLevelIndex, 0)
  assert.equal(numeric.examples[0].toLevelIndex, 1)
})

test('レベル差分の代表例は同一値で枠を埋めず、実際に変化した遷移を残す', () => {
  const overview = buildSkillJsonOverview([createSkill({
    levels: [
      { blackboard: [{ key: 'late_change', value: 1 }] },
      { blackboard: [{ key: 'late_change', value: 1 }] },
      { blackboard: [{ key: 'late_change', value: 2 }] },
    ],
  })])
  const lateChange = overview.adjacentLevelDiffs.byKey.find(
    (item) => item.key === 'late_change',
  )

  assert.ok(lateChange)
  assert.equal(lateChange.counts.UNCHANGED, 1)
  assert.equal(lateChange.counts.CHANGED, 1)
  assert.equal(lateChange.examples.length, 1)
  assert.equal(lateChange.examples[0].kind, 'CHANGED')
  assert.equal(lateChange.examples[0].fromLevelIndex, 1)
  assert.equal(lateChange.examples[0].toLevelIndex, 2)
})

test('timesを生key・生値として数えるだけでゲーム上の意味を付与しない', () => {
  const overview = buildSkillJsonOverview([createSkill({
    levels: [{
      description: '{times}回まで保持',
      blackboard: [{ key: 'times', value: 7 }],
    }],
  })])
  const times = overview.keyInventory.find((item) => item.key === 'times')

  assert.ok(times)
  assert.equal(times.semanticStatus, 'UNINTERPRETED')
  assert.equal(times.examples[0].entry?.value, 7)
  assert.equal(times.placeholderReferenceCount, 1)
  assert.equal('hitCount' in times, false)
  assert.equal('meaning' in times, false)
})

function findingCount(
  overview: ReturnType<typeof buildSkillJsonOverview>,
  code: ReturnType<typeof buildSkillJsonOverview>['dataQualityFindings'][number]['code'],
): number {
  return overview.dataQualityFindings.find((finding) => finding.code === code)?.occurrenceCount ?? 0
}

function createSkill(overrides: {
  operatorId?: string
  operatorName?: string
  skillIndex?: number
  skillId?: string
  skillName?: string
  levels?: RawSkillLevel[]
} = {}): SkillRecord {
  const operatorId = overrides.operatorId ?? 'char_test'
  const skillId = overrides.skillId ?? 'skill_test'
  const levels = overrides.levels ?? [{ description: '', blackboard: [] }]
  return {
    id: `${operatorId}:${skillId}`,
    operatorId,
    operatorName: overrides.operatorName ?? 'テスト',
    skillIndex: overrides.skillIndex ?? 1,
    skillId,
    skillName: overrides.skillName ?? 'テストスキル',
    skillLevels: levels,
    raw: levels.at(-1),
  } as SkillRecord
}
