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
  rarity?: number
  effectWindow?: EffectWindowType
  activationTrigger?: ActivationTriggerType
  spCost?: number | null
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
    subProfessionName: 'テスト職分',
    skillId: fixture.id.split(':').at(-1) ?? fixture.id,
    rarity: fixture.rarity ?? 5,
    skillIndex: fixture.skillIndex ?? 1,
    spCost: fixture.spCost === undefined ? 10 : fixture.spCost,
    classification: {
      effectWindow: { value: fixture.effectWindow ?? 'FIXED_DURATION' },
      activationTrigger: { value: fixture.activationTrigger ?? 'MANUAL' },
    },
  } as SkillRecord
}
