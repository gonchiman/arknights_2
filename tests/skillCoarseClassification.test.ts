import test from 'node:test'
import assert from 'node:assert/strict'
import { classifySkill } from '../src/lib/classifier.ts'
import {
  DEFAULT_SKILL_COARSE_FILTERS,
  filterSkillCoarseRows,
  getSkillCoarseCategories,
  type SkillCoarseFilters,
} from '../src/lib/skillCoarseClassification.ts'
import type { RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

test('次の通常攻撃の追加ダメージを別の単発攻撃として重複分類しない', () => {
  const skill = createSkill({
    description: '次の通常攻撃時、対象に攻撃力の200%の物理ダメージを与え、1秒間浮遊させ、さらに追加で攻撃力の200%の物理ダメージを与える',
  })
  assert.deepEqual(getSkillCoarseCategories(skill), ['NEXT_ATTACK'])
})

test('同じ表現はオペレーターやスキルIDに依存せず同じ候補になる', () => {
  const skill = createSkill({ description: '次の通常攻撃時、攻撃力が200%まで上昇する' })
  const other = { ...skill, id: 'different', operatorId: 'different', skillId: 'different' }
  assert.deepEqual(getSkillCoarseCategories(other), getSkillCoarseCategories(skill))
})

test('次の・次回の攻撃時/で/が/はを同じ次回攻撃として扱う', () => {
  for (const trigger of [
    '次の攻撃で',
    '次の通常攻撃で',
    '次の通常攻撃が',
    '次の通常攻撃は',
    '次回攻撃時',
    '次回通常攻撃時',
    '次回の通常攻撃時',
    '次の通常攻撃時',
  ]) {
    const skill = createSkill({
      description: `${trigger}攻撃力の260%の物理ダメージを与え、自身の状態異常を解除する`,
      skillType: 'AUTO',
    })
    assert.deepEqual(getSkillCoarseCategories(skill), ['NEXT_ATTACK'])
    assert.equal(filterSkillCoarseRows([skill], filters({ category: 'BURST' })).length, 0)
  }
})

test('次回通常攻撃の回復置換や連撃変化も次回攻撃として分類する', () => {
  for (const description of [
    '次の通常攻撃が近くの味方1人に対する治療に変化し、対象のHPを回復する',
    '次の通常攻撃は攻撃力が180%まで上昇し、追加で物理ダメージを与える',
    '次の通常攻撃が2連撃になる',
  ]) {
    const skill = createSkill({ description, skillType: 'AUTO' })
    assert.deepEqual(getSkillCoarseCategories(skill), ['NEXT_ATTACK'])
  }
})

test('攻撃力と複数ステータスを並べた持続強化も判定する', () => {
  const skill = createSkill({ description: '攻撃力・防御力・最大HP+130%', duration: 50 })
  assert.deepEqual(getSkillCoarseCategories(skill), ['SUSTAINED'])
})

test('ダメージを複数回与える語順でも継続枠なしの連続攻撃を判定する', () => {
  const skill = createSkill({
    description: '周囲一定範囲内の敵に攻撃力320%の物理ダメージを10回与え、最後の1回でスタンさせる',
  })
  assert.deepEqual(getSkillCoarseCategories(skill), ['BURST'])
})

test('効果時間中の通常攻撃に毎回生じるダメージは単発攻撃にしない', () => {
  const skill = createSkill({
    description: '攻撃力+100%、通常攻撃時、対象に攻撃力の120%の物理ダメージを与える',
    duration: 20,
  })
  assert.deepEqual(getSkillCoarseCategories(skill), ['SUSTAINED'])
})

test('発動時の独立した攻撃と持続強化は両方を固定順で表示する', () => {
  const skill = createSkill({
    description: 'スキル発動時、周囲の敵に攻撃力の200%の術ダメージを与える。攻撃力+100%',
    duration: 20,
  })
  assert.deepEqual(getSkillCoarseCategories(skill), ['SUSTAINED', 'BURST'])
})

test('モード切替と手動停止だけのスキルを区別する', () => {
  assert.deepEqual(getSkillCoarseCategories(createSkill({
    description: '攻撃力+100%、モードを切り替え可能', duration: -1,
  })), ['SUSTAINED', 'MODE'])
  assert.deepEqual(getSkillCoarseCategories(createSkill({
    description: '攻撃力+100%、手動でスキルを停止可能', duration: -1,
  })), ['SUSTAINED'])
})

test('次回攻撃時の設置は発動方法と設置の両方を保持する', () => {
  const skill = createSkill({
    description: '次の通常攻撃時、配置可能マスに地雷を設置。敵が近付くと周囲の敵に物理ダメージを与える',
    skillType: 'AUTO',
  })
  assert.deepEqual(getSkillCoarseCategories(skill), ['NEXT_ATTACK', 'SUMMON'])
})

test('常時と配置時をまとめ、明示されない効果は未分類として残す', () => {
  assert.deepEqual(getSkillCoarseCategories(createSkill({
    description: '配置後に防御力+100%', skillType: 'PASSIVE', duration: 10,
  })), ['PASSIVE'])
  assert.deepEqual(getSkillCoarseCategories(createSkill({
    description: '攻撃力+10%', skillType: 'PASSIVE', duration: -1,
  })), ['PASSIVE'])
  assert.deepEqual(getSkillCoarseCategories(createSkill({ description: '特殊な効果を発動する' })), ['UNKNOWN'])
  assert.deepEqual(getSkillCoarseCategories(createSkill({ description: '' })), ['UNKNOWN'])
})

test('計算機向け手動補正に依存せず原文から候補を得る', () => {
  const skill = createSkill({ description: '次の通常攻撃時、攻撃力が200%まで上昇する' })
  skill.classification = classifySkill({ description: 'モードを切り替える', skillType: 'PASSIVE' })
  assert.deepEqual(getSkillCoarseCategories(skill), ['NEXT_ATTACK'])
})

test('職業・レアリティ・分類・複数語検索を組み合わせ、S番号を検索できる', () => {
  const rows = [
    createSkill({ description: '物理ダメージを与える' }, { id: 'irene:s2', operatorName: 'アイリーニ', skillIndex: 2 }),
    createSkill({ description: '物理ダメージを与える' }, { id: 'irene:s3', operatorName: 'アイリーニ', skillIndex: 3 }),
    createSkill({ description: '物理ダメージを与える' }, { id: 'other:s2', operatorName: '別の前衛', skillIndex: 2, rarity: 5 }),
    createSkill({ description: '物理ダメージを与える' }, { id: 'caster:s2', operatorName: 'アイリーニ', skillIndex: 2, profession: 'CASTER' }),
  ]
  const result = filterSkillCoarseRows(rows, filters({ query: 'ｱｲﾘｰﾆ Ｓ２', category: 'BURST' }))
  assert.deepEqual(result.map((row) => row.id), ['irene:s2'])
  assert.equal(rows.length, 4)
})

test('大分類ラベルも検索でき、複数候補のどちらでも絞り込める', () => {
  const rows = [createSkill({ description: '次の通常攻撃時、地雷を設置する' })]
  assert.equal(filterSkillCoarseRows(rows, filters({ query: '召喚' })).length, 1)
  assert.equal(filterSkillCoarseRows(rows, filters({ category: 'NEXT_ATTACK' })).length, 1)
  assert.equal(filterSkillCoarseRows(rows, filters({ category: 'SUMMON' })).length, 1)
  assert.equal(filterSkillCoarseRows(rows, filters({ category: 'BURST' })).length, 0)
})

test('S番号検索はスキルIDの部分一致と区別して番号そのものを照合する', () => {
  const rows = [
    createSkill({ description: '' }, { id: 's1', skillId: 'sample_s1', skillIndex: 1 }),
    createSkill({ description: '' }, { id: 's10', skillId: 'sample_s10', skillIndex: 10 }),
  ]
  assert.deepEqual(filterSkillCoarseRows(rows, filters({ query: 'S1' })).map((row) => row.id), ['s1'])
})

test('初期範囲は星6前衛で、すべてを指定すれば他職業や未分類も表示する', () => {
  assert.deepEqual(DEFAULT_SKILL_COARSE_FILTERS, { query: '', profession: 'WARRIOR', rarity: 6, category: 'ALL' })
  const rows = [createSkill({ description: '' }, { profession: 'CASTER', rarity: 5 })]
  assert.equal(filterSkillCoarseRows(rows, DEFAULT_SKILL_COARSE_FILTERS).length, 0)
  assert.equal(filterSkillCoarseRows(rows, filters({ profession: 'ALL', rarity: 'ALL', category: 'UNKNOWN' })).length, 1)
})

function filters(overrides: Partial<SkillCoarseFilters>): SkillCoarseFilters {
  return { ...DEFAULT_SKILL_COARSE_FILTERS, ...overrides }
}

function createSkill(raw: RawSkillLevel, overrides: Partial<SkillRecord> = {}): SkillRecord {
  const level: RawSkillLevel = { duration: 0, skillType: 'MANUAL', ...raw }
  return {
    id: 'test:skill',
    operatorId: 'test',
    operatorName: 'テスト',
    profession: 'WARRIOR',
    professionLabel: '前衛',
    subProfessionId: 'test',
    subProfessionName: 'テスト',
    nameInitial: 'T_ROW',
    rarity: 6,
    skillIndex: 1,
    skillId: 'skill',
    skillName: 'テストスキル',
    description: raw.description ?? '',
    duration: level.duration ?? null,
    durationType: 'NONE',
    skillType: level.skillType ?? 'MANUAL',
    spType: 'INCREASE_WITH_TIME',
    initSp: 0,
    spCost: 10,
    classification: classifySkill(level),
    skillLevels: [level],
    operatorProfile: { phases: [], favorKeyFrames: [] },
    raw: level,
    ...overrides,
  }
}
