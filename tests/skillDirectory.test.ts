import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_SKILL_DIRECTORY_FILTERS,
  filterSkillDirectoryRows,
  sortSkillDirectoryRows,
  type SkillDirectoryFilters,
} from '../src/lib/skillDirectory.ts'
import type {
  ActivationTriggerType,
  EffectWindowType,
  SkillRecord,
} from '../src/types/skill.ts'

const SKILLS = [
  createSkill({
    id: 'amiya:chimera',
    operatorName: 'アーミヤ',
    skillName: 'キメラ',
    description: '術ダメージを与える',
    profession: 'CASTER',
    professionLabel: '術師',
    rarity: 5,
    effectWindow: 'FIXED_DURATION',
    activationTrigger: 'MANUAL',
    spCost: 30,
    skillIndex: 3,
  }),
  createSkill({
    id: 'exusiai:overloading',
    operatorName: 'エクシア',
    skillName: 'オーバーロード',
    description: '通常攻撃が5回連続攻撃になる',
    profession: 'SNIPER',
    professionLabel: '狙撃',
    rarity: 6,
    effectWindow: 'FIXED_DURATION',
    activationTrigger: 'AUTO_SP',
    spCost: 15,
    skillIndex: 3,
  }),
  createSkill({
    id: 'gravel:sneak-guard',
    operatorName: 'グラベル',
    skillName: 'スニークガード',
    description: '配置後にシールドを獲得',
    profession: 'SPECIAL',
    professionLabel: '特殊',
    rarity: 4,
    effectWindow: 'NONE',
    activationTrigger: 'PASSIVE',
    spCost: null,
    skillIndex: 2,
  }),
]

test('文字検索は表記を正規化し、分類ラベルも検索対象にする', () => {
  assert.deepEqual(
    filterSkillDirectoryRows(SKILLS, filters({ query: 'ｷﾒﾗ' })).map((row) => row.id),
    ['amiya:chimera'],
  )
  assert.deepEqual(
    filterSkillDirectoryRows(SKILLS, filters({ query: '自動発動' })).map((row) => row.id),
    ['exusiai:overloading'],
  )
})

test('職業・レアリティ・終了条件・発動契機を組み合わせて絞り込む', () => {
  const result = filterSkillDirectoryRows(SKILLS, filters({
    profession: 'SNIPER',
    rarity: 6,
    effectWindow: 'FIXED_DURATION',
    activationTrigger: 'AUTO_SP',
  }))

  assert.deepEqual(result.map((row) => row.id), ['exusiai:overloading'])
})

test('レアリティと必要SPを指定方向に並べ、値なしは末尾に置く', () => {
  assert.deepEqual(
    sortSkillDirectoryRows(SKILLS, { key: 'rarity', direction: 'desc' }).map((row) => row.id),
    ['exusiai:overloading', 'amiya:chimera', 'gravel:sneak-guard'],
  )
  assert.deepEqual(
    sortSkillDirectoryRows(SKILLS, { key: 'spCost', direction: 'desc' }).map((row) => row.id),
    ['amiya:chimera', 'exusiai:overloading', 'gravel:sneak-guard'],
  )
})

test('同じ並び替え値ではオペレーター名とスキル番号を安定した順序にする', () => {
  const sameOperator = [
    createSkill({ id: 'test:s2', operatorName: 'テスト', skillIndex: 2, rarity: 5 }),
    createSkill({ id: 'test:s1', operatorName: 'テスト', skillIndex: 1, rarity: 5 }),
  ]

  assert.deepEqual(
    sortSkillDirectoryRows(sameOperator, { key: 'rarity', direction: 'desc' }).map((row) => row.id),
    ['test:s1', 'test:s2'],
  )
})

test('スキル番号を数値として昇順・降順に並べる', () => {
  const rows = [
    createSkill({ id: 'skill:s10', skillIndex: 10 }),
    createSkill({ id: 'skill:s2', skillIndex: 2 }),
    createSkill({ id: 'skill:s1', skillIndex: 1 }),
  ]

  assert.deepEqual(
    sortSkillDirectoryRows(rows, { key: 'skillIndex', direction: 'asc' }).map((row) => row.id),
    ['skill:s1', 'skill:s2', 'skill:s10'],
  )
  assert.deepEqual(
    sortSkillDirectoryRows(rows, { key: 'skillIndex', direction: 'desc' }).map((row) => row.id),
    ['skill:s10', 'skill:s2', 'skill:s1'],
  )
})

test('職分名を日本語の表示名で並べる', () => {
  const rows = [
    createSkill({ id: 'sub:lord', subProfessionName: '領主' }),
    createSkill({ id: 'sub:duelist', subProfessionName: '勇士' }),
    createSkill({ id: 'sub:arts', subProfessionName: '術戦士' }),
  ]

  assert.deepEqual(
    sortSkillDirectoryRows(rows, { key: 'subProfession', direction: 'asc' }).map((row) => row.id),
    ['sub:arts', 'sub:duelist', 'sub:lord'],
  )
  assert.deepEqual(
    sortSkillDirectoryRows(rows, { key: 'subProfession', direction: 'desc' }).map((row) => row.id),
    ['sub:lord', 'sub:duelist', 'sub:arts'],
  )
})

test('持続時間の値なし・瞬間・永続を数値から除外し、両方向で末尾に置く', () => {
  const rows = [
    createSkill({ id: 'duration:none', duration: null, skillIndex: 1 }),
    createSkill({ id: 'duration:instant', duration: 0, skillIndex: 2 }),
    createSkill({ id: 'duration:permanent', duration: -1, skillIndex: 3 }),
    createSkill({ id: 'duration:long', duration: 30 }),
    createSkill({ id: 'duration:short', duration: 2.5 }),
  ]
  const missing = ['duration:none', 'duration:instant', 'duration:permanent']

  assert.deepEqual(
    sortSkillDirectoryRows(rows, { key: 'duration', direction: 'asc' }).map((row) => row.id),
    ['duration:short', 'duration:long', ...missing],
  )
  assert.deepEqual(
    sortSkillDirectoryRows(rows, { key: 'duration', direction: 'desc' }).map((row) => row.id),
    ['duration:long', 'duration:short', ...missing],
  )
})

test('SP回復方式はゲームデータのキーではなく日本語の表示ラベル順に並べる', () => {
  const rows = [
    createSkill({ id: 'sp:damage', spType: 'INCREASE_WHEN_TAKEN_DAMAGE' }),
    createSkill({ id: 'sp:time', spType: 'INCREASE_WITH_TIME' }),
    createSkill({ id: 'sp:attack', spType: 'INCREASE_WHEN_ATTACK' }),
    createSkill({ id: 'sp:unknown', spType: 'UNKNOWN' }),
    createSkill({ id: 'sp:none', spType: 'NO_SP' }),
  ]

  assert.deepEqual(
    sortSkillDirectoryRows(rows, { key: 'spType', direction: 'asc' }).map((row) => row.id),
    ['sp:none', 'sp:attack', 'sp:time', 'sp:damage', 'sp:unknown'],
  )
  assert.deepEqual(
    sortSkillDirectoryRows(rows, { key: 'spType', direction: 'desc' }).map((row) => row.id),
    ['sp:unknown', 'sp:damage', 'sp:time', 'sp:attack', 'sp:none'],
  )
})

test('初期SPの0は有効値として扱い、値なしは両方向で末尾に置く', () => {
  const rows = [
    createSkill({ id: 'initial:none', initSp: null }),
    createSkill({ id: 'initial:high', initSp: 20 }),
    createSkill({ id: 'initial:zero', initSp: 0 }),
    createSkill({ id: 'initial:low', initSp: 5 }),
  ]

  assert.deepEqual(
    sortSkillDirectoryRows(rows, { key: 'initSp', direction: 'asc' }).map((row) => row.id),
    ['initial:zero', 'initial:low', 'initial:high', 'initial:none'],
  )
  assert.deepEqual(
    sortSkillDirectoryRows(rows, { key: 'initSp', direction: 'desc' }).map((row) => row.id),
    ['initial:high', 'initial:low', 'initial:zero', 'initial:none'],
  )
})

function filters(overrides: Partial<SkillDirectoryFilters>): SkillDirectoryFilters {
  return { ...EMPTY_SKILL_DIRECTORY_FILTERS, ...overrides }
}

interface SkillFixture {
  id: string
  operatorName?: string
  skillName?: string
  description?: string
  profession?: string
  professionLabel?: string
  subProfessionName?: string
  rarity?: number
  effectWindow?: EffectWindowType
  activationTrigger?: ActivationTriggerType
  spCost?: number | null
  initSp?: number | null
  spType?: string
  duration?: number | null
  skillIndex?: number
}

function createSkill(fixture: SkillFixture): SkillRecord {
  return {
    id: fixture.id,
    operatorName: fixture.operatorName ?? 'テスト',
    skillName: fixture.skillName ?? 'テストスキル',
    description: fixture.description ?? '',
    profession: fixture.profession ?? 'WARRIOR',
    professionLabel: fixture.professionLabel ?? '前衛',
    subProfessionName: fixture.subProfessionName ?? 'テスト職分',
    skillId: fixture.id.split(':').at(-1) ?? fixture.id,
    rarity: fixture.rarity ?? 5,
    skillIndex: fixture.skillIndex ?? 1,
    spCost: fixture.spCost === undefined ? 10 : fixture.spCost,
    initSp: fixture.initSp === undefined ? 0 : fixture.initSp,
    spType: fixture.spType ?? 'INCREASE_WITH_TIME',
    duration: fixture.duration === undefined ? 20 : fixture.duration,
    classification: {
      effectWindow: { value: fixture.effectWindow ?? 'FIXED_DURATION' },
      activationTrigger: { value: fixture.activationTrigger ?? 'MANUAL' },
    },
  } as SkillRecord
}
