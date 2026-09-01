import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_OPERATOR_FILTERS,
  addRecentOperatorId,
  buildSubProfessionOptions,
  getRecentOperatorRows,
  hasActiveOperatorFilters,
  matchesOperatorFilters,
  normalizeRecentOperatorIds,
  type FilterState,
} from '../src/lib/operatorSearchFilters.ts'
import type { OperatorInitial, SkillRecord } from '../src/types/skill.ts'

const MECH_ACCORD = createSkill({
  operatorName: 'ゴールデングロー',
  skillName: 'ゴールデングロー',
  description: '浮遊ユニットが敵を攻撃する',
  skillId: 'skchr_gg_1',
  nameInitial: 'K_ROW',
  profession: 'CASTER',
  subProfessionId: 'funnel',
  rarity: 6,
})

test('初期条件は職分を含む全条件を無指定にする', () => {
  assert.deepEqual(EMPTY_OPERATOR_FILTERS, {
    query: '',
    nameInitial: 'ALL',
    profession: 'ALL',
    subProfession: 'ALL',
    rarity: 'ALL',
  })
  assert.equal(matchesOperatorFilters(MECH_ACCORD, EMPTY_OPERATOR_FILTERS), true)
})

test('検索条件がすべて未指定かを判定する', () => {
  assert.equal(hasActiveOperatorFilters(EMPTY_OPERATOR_FILTERS), false)
  assert.equal(hasActiveOperatorFilters(filters({ query: '   ' })), false)
  assert.equal(hasActiveOperatorFilters(filters({ query: 'スルト' })), true)
  assert.equal(hasActiveOperatorFilters(filters({ nameInitial: 'A_ROW' })), true)
  assert.equal(hasActiveOperatorFilters(filters({ profession: 'CASTER' })), true)
  assert.equal(hasActiveOperatorFilters(filters({ subProfession: 'funnel' })), true)
  assert.equal(hasActiveOperatorFilters(filters({ rarity: 6 })), true)
})

test('最近選択したオペレーターを最新順・重複なしの6人に保つ', () => {
  let recentIds: string[] = []
  for (const id of ['char_a', 'char_b', 'char_c', 'char_d', 'char_e', 'char_f', 'char_g']) {
    recentIds = addRecentOperatorId(recentIds, id)
  }
  assert.deepEqual(recentIds, ['char_g', 'char_f', 'char_e', 'char_d', 'char_c', 'char_b'])
  assert.deepEqual(addRecentOperatorId(recentIds, 'char_d'), [
    'char_d', 'char_g', 'char_f', 'char_e', 'char_c', 'char_b',
  ])
  assert.deepEqual(normalizeRecentOperatorIds([' char_a ', 'char_a', '', 'char_b'], 2), [
    'char_a', 'char_b',
  ])
  assert.deepEqual(normalizeRecentOperatorIds(['char_a'], 0), [])
})

test('履歴順を保ち、存在するオペレーターを1人1行へ復元する', () => {
  const rows = [
    createSkill({ operatorId: 'char_gg', skillId: 'skchr_gg_1', operatorName: 'ゴールデングロー' }),
    createSkill({ operatorId: 'char_gg', skillId: 'skchr_gg_2', operatorName: 'ゴールデングロー' }),
    createSkill({ operatorId: 'char_surtr', skillId: 'skchr_surtr_1', operatorName: 'スルト' }),
  ]

  assert.deepEqual(
    getRecentOperatorRows(rows, ['char_surtr', 'unknown', 'char_gg'])
      .map((row) => [row.operatorId, row.skillId]),
    [
      ['char_surtr', 'skchr_surtr_1'],
      ['char_gg', 'skchr_gg_1'],
    ],
  )
})

test('職分ID funnelとの完全一致で操機術師だけを絞り込む', () => {
  assert.equal(matchesOperatorFilters(MECH_ACCORD, filters({ subProfession: 'funnel' })), true)
  assert.equal(matchesOperatorFilters(
    createSkill({ subProfessionId: 'core_caster' }),
    filters({ subProfession: 'funnel' }),
  ), false)
  assert.equal(matchesOperatorFilters(MECH_ACCORD, filters({ subProfession: '操機術師' })), false)
})

test('文字検索は既存どおりNFKC正規化・小文字化・前後空白除去を行う', () => {
  assert.equal(matchesOperatorFilters(
    MECH_ACCORD,
    filters({ query: '  ｺﾞｰﾙﾃﾞﾝｸﾞﾛｰ  ' }),
  ), true)
  assert.equal(matchesOperatorFilters(
    MECH_ACCORD,
    filters({ query: 'ＳＫＣＨＲ＿ＧＧ＿１' }),
  ), true)
})

test('文字・頭文字・職業・職分・レアリティをAND条件で判定する', () => {
  const combined = filters({
    query: '浮遊ユニット',
    nameInitial: 'K_ROW',
    profession: 'CASTER',
    subProfession: 'funnel',
    rarity: 6,
  })

  assert.equal(matchesOperatorFilters(MECH_ACCORD, combined), true)
  assert.equal(matchesOperatorFilters(MECH_ACCORD, { ...combined, rarity: 5 }), false)
  assert.equal(matchesOperatorFilters(MECH_ACCORD, { ...combined, profession: 'SNIPER' }), false)
  assert.equal(matchesOperatorFilters(MECH_ACCORD, { ...combined, nameInitial: 'A_ROW' }), false)
})

test('矛盾する職業と職分、および不明な職分IDは一致しない', () => {
  assert.equal(matchesOperatorFilters(
    MECH_ACCORD,
    filters({ profession: 'SNIPER', subProfession: 'funnel' }),
  ), false)
  assert.equal(matchesOperatorFilters(
    createSkill({ subProfessionId: 'UNKNOWN' }),
    filters({ subProfession: 'funnel' }),
  ), false)
  assert.equal(matchesOperatorFilters(
    createSkill({ subProfessionId: '' }),
    filters({ subProfession: 'funnel' }),
  ), false)
})

test('職分候補をIDで重複除去し、日本語名順に並べる', () => {
  const rows = [
    createSkill({ subProfessionId: 'funnel', subProfessionName: 'か職分' }),
    createSkill({ subProfessionId: 'core_caster', subProfessionName: 'あ職分' }),
    createSkill({ subProfessionId: 'funnel', subProfessionName: 'か職分' }),
    createSkill({ profession: 'SNIPER', subProfessionId: 'marksman', subProfessionName: 'さ職分' }),
  ]

  assert.deepEqual(buildSubProfessionOptions(rows, 'ALL'), [
    { value: 'core_caster', label: 'あ職分' },
    { value: 'funnel', label: 'か職分' },
    { value: 'marksman', label: 'さ職分' },
  ])
})

test('職業指定時は該当する職分候補だけを返す', () => {
  const rows = [
    createSkill({ subProfessionId: 'funnel', subProfessionName: '操機術師' }),
    createSkill({ subProfessionId: 'core_caster', subProfessionName: '中堅術師' }),
    createSkill({ profession: 'SNIPER', subProfessionId: 'marksman', subProfessionName: '速射手' }),
  ]

  assert.deepEqual(buildSubProfessionOptions(rows, 'CASTER').map((option) => option.value).sort(), [
    'core_caster',
    'funnel',
  ])
  assert.deepEqual(buildSubProfessionOptions(rows, 'SNIPER'), [
    { value: 'marksman', label: '速射手' },
  ])
  assert.deepEqual(buildSubProfessionOptions(rows, 'MEDIC'), [])
})

function filters(overrides: Partial<FilterState>): FilterState {
  return { ...EMPTY_OPERATOR_FILTERS, ...overrides }
}

function createSkill(overrides: {
  operatorId?: string
  operatorName?: string
  skillName?: string
  description?: string
  skillId?: string
  nameInitial?: OperatorInitial
  profession?: string
  subProfessionId?: string
  subProfessionName?: string
  rarity?: number
} = {}): SkillRecord {
  const operatorId = overrides.operatorId ?? 'char_test'
  const skillId = overrides.skillId ?? 'skchr_test_1'
  return {
    id: `${operatorId}:${skillId}`,
    operatorId,
    operatorName: overrides.operatorName ?? 'テスト術師',
    skillName: overrides.skillName ?? 'テストスキル',
    description: overrides.description ?? '',
    skillId,
    nameInitial: overrides.nameInitial ?? 'T_ROW',
    profession: overrides.profession ?? 'CASTER',
    subProfessionId: overrides.subProfessionId ?? 'core_caster',
    subProfessionName: overrides.subProfessionName ?? '中堅術師',
    rarity: overrides.rarity ?? 5,
  } as SkillRecord
}
