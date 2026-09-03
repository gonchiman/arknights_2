import test from 'node:test'
import assert from 'node:assert/strict'
import {
  analyzeDescriptionPlaceholders,
  createSkillJsonSelectionKey,
  diffBlackboards,
  getSkillLevelLabel,
  inspectSkillLevel,
} from '../src/lib/skillJsonAnalysis.ts'
import type { RawBlackboardEntry, SkillRecord } from '../src/types/skill.ts'

test('descriptionの対応・未対応・負号・valueStrを同じ解析結果から展開する', () => {
  const blackboard: RawBlackboardEntry[] = [
    { key: 'atk', value: 0.5 },
    { key: 'interval', value: 0.35 },
    { key: 'times', value: 4 },
    { key: 'label', valueStr: '特殊' },
    { key: 'unused', value: 10 },
  ]
  const snapshot = structuredClone(blackboard)
  const description = '攻撃力+{atk:0%}、攻撃間隔{-interval:0.0}秒、{times}回、{label}、{missing}'

  const analysis = analyzeDescriptionPlaceholders(description, blackboard)

  assert.equal(
    analysis.expandedDescription,
    '攻撃力+50%、攻撃間隔-0.3秒、4回、特殊、{missing}',
  )
  assert.deepEqual(
    analysis.placeholders.map((item) => [
      item.placeholder,
      item.lookupKey,
      item.negative,
      item.status,
      item.expandedValue,
    ]),
    [
      ['{atk:0%}', 'atk', false, 'MATCHED', '50%'],
      ['{-interval:0.0}', 'interval', true, 'MATCHED', '-0.3'],
      ['{times}', 'times', false, 'MATCHED', '4'],
      ['{label}', 'label', false, 'MATCHED', '特殊'],
      ['{missing}', 'missing', false, 'UNMATCHED', null],
    ],
  )
  assert.deepEqual(analysis.blackboardRows[4].referencedBy, [])
  assert.deepEqual(blackboard, snapshot)
})

test('負値に負号付きプレースホルダーを適用し、0も有効な値として扱う', () => {
  const analysis = analyzeDescriptionPlaceholders(
    '{-max_hp:0%} / {zero:0%}',
    [{ key: 'max_hp', value: -0.75 }, { key: 'zero', value: 0 }],
  )

  assert.equal(analysis.expandedDescription, '75% / 0%')
  assert.deepEqual(analysis.placeholders.map((item) => item.status), ['MATCHED', 'MATCHED'])
})

test('同じplaceholderの全出現を追跡し、keyの大文字小文字を推測補正しない', () => {
  const analysis = analyzeDescriptionPlaceholders(
    '{atk} / {atk} / {ATK}',
    [{ key: 'atk', value: 1 }],
  )

  assert.equal(analysis.expandedDescription, '1 / 1 / {ATK}')
  assert.deepEqual(
    analysis.placeholders.map((item) => item.status),
    ['MATCHED', 'MATCHED', 'UNMATCHED'],
  )
  assert.equal(analysis.blackboardRows[0].referencedBy.length, 2)
})

test('keyが対応しても表示値がなければplaceholderを保持する', () => {
  const analysis = analyzeDescriptionPlaceholders('{empty}', [{ key: 'empty' }])

  assert.equal(analysis.placeholders[0].status, 'MATCHED')
  assert.equal(analysis.placeholders[0].expandedValue, null)
  assert.equal(analysis.expandedDescription, '{empty}')
})

test('空object形式のblackboardを空配列として安全に扱う', () => {
  const invalidShape = {} as RawBlackboardEntry[]
  const analysis = analyzeDescriptionPlaceholders('{missing}', invalidShape)

  assert.equal(analysis.placeholders[0].status, 'UNMATCHED')
  assert.deepEqual(analysis.blackboardRows, [])
  assert.deepEqual(diffBlackboards(invalidShape, []), [])
})

test('timesは生値とdescription参照だけを保持しhitCountへ意味付けしない', () => {
  const analysis = analyzeDescriptionPlaceholders(
    '{times}回まで効果を保持',
    [{ key: 'times', value: 10 }],
  )

  assert.equal(analysis.expandedDescription, '10回まで効果を保持')
  assert.equal(analysis.blackboardRows[0].entry.value, 10)
  assert.equal(analysis.blackboardRows[0].semanticStatus, 'UNINTERPRETED')
  assert.equal('hitCount' in analysis.blackboardRows[0], false)
})

test('blackboardの追加・削除・value変更・valueStr変更・同一を区別する', () => {
  const before: RawBlackboardEntry[] = [
    { key: 'same', value: 1, valueStr: null },
    { key: 'changed', value: 0.2, valueStr: null },
    { key: 'text', valueStr: 'A' },
    { key: 'removed', value: 3 },
  ]
  const after: RawBlackboardEntry[] = [
    { key: 'same', value: 1, valueStr: null },
    { key: 'changed', value: 0.3, valueStr: null },
    { key: 'text', valueStr: 'B' },
    { key: 'added', value: 4 },
  ]

  const diff = diffBlackboards(before, after)
  const byKey = new Map(diff.map((row) => [row.key, row]))

  assert.equal(byKey.get('same')?.kind, 'UNCHANGED')
  assert.deepEqual(byKey.get('changed')?.changedFields, ['value'])
  assert.deepEqual(byKey.get('text')?.changedFields, ['valueStr'])
  assert.equal(byKey.get('removed')?.kind, 'REMOVED')
  assert.equal(byKey.get('removed')?.before?.value, 3)
  assert.equal(byKey.get('added')?.kind, 'ADDED')
  assert.equal(byKey.get('added')?.after?.value, 4)
})

test('同じkeyが複数ある場合も出現順ごとに差分を追跡する', () => {
  const diff = diffBlackboards(
    [{ key: 'duplicate', value: 1 }, { key: 'duplicate', value: 2 }],
    [{ key: 'duplicate', value: 1 }, { key: 'duplicate', value: 3 }],
  )

  assert.deepEqual(
    diff.map((row) => [row.occurrence, row.kind, row.changedFields]),
    [[1, 'UNCHANGED', []], [2, 'CHANGED', ['value']]],
  )
})

test('同じskillIdでもoperatorIdとskillIndexを含む選択キーで区別する', () => {
  const identities = [
    { operatorId: 'char_a', skillIndex: 1, skillId: 'shared_skill' },
    { operatorId: 'char_b', skillIndex: 1, skillId: 'shared_skill' },
    { operatorId: 'char_a', skillIndex: 2, skillId: 'shared_skill' },
    { operatorId: 'char_a', skillIndex: 1, skillId: 'other_skill' },
  ]
  const keys = identities.map(createSkillJsonSelectionKey)

  assert.equal(new Set(keys).size, identities.length)
  assert.equal(keys[0], createSkillJsonSelectionKey(identities[0]))
})

test('選択レベルのdescriptionとblackboardをそのまま解析対象にする', () => {
  const skill = createSkill({
    levels: [
      { name: 'テスト', description: 'Lv1 {atk}', blackboard: [{ key: 'atk', value: 1 }] },
      { name: 'テスト', description: 'Lv2 {atk}', blackboard: [{ key: 'atk', value: 2 }] },
    ],
  })

  const first = inspectSkillLevel(skill, 0)
  const last = inspectSkillLevel(skill, 99)

  assert.equal(first.level, skill.skillLevels[0])
  assert.equal(first.sourceDescription, 'Lv1 {atk}')
  assert.equal(first.expandedDescription, 'Lv1 1')
  assert.equal(last.level, skill.skillLevels[1])
  assert.equal(last.expandedDescription, 'Lv2 2')
})

test('10段階スキルだけLv.7以降を特化ラベルにする', () => {
  assert.deepEqual(
    Array.from({ length: 10 }, (_, index) => getSkillLevelLabel(index, 10)),
    ['Lv.1', 'Lv.2', 'Lv.3', 'Lv.4', 'Lv.5', 'Lv.6', 'Lv.7', '特化1', '特化2', '特化3'],
  )
  assert.equal(getSkillLevelLabel(6, 7), 'Lv.7')
})

function createSkill(overrides: {
  operatorId?: string
  operatorName?: string
  skillId?: string
  skillName?: string
  levels?: SkillRecord['skillLevels']
} = {}): SkillRecord {
  const levels = overrides.levels ?? [{
    name: overrides.skillName ?? 'テストスキル',
    description: '説明',
    blackboard: [],
  }]

  return {
    id: `${overrides.operatorId ?? 'char_test'}:${overrides.skillId ?? 'skill_test'}`,
    operatorId: overrides.operatorId ?? 'char_test',
    operatorName: overrides.operatorName ?? 'テスト',
    skillIndex: 1,
    skillId: overrides.skillId ?? 'skill_test',
    skillName: overrides.skillName ?? 'テストスキル',
    skillLevels: levels,
    raw: levels.at(-1),
  } as SkillRecord
}
