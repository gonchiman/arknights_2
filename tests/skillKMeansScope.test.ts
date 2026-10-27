import test from 'node:test'
import assert from 'node:assert/strict'
import { classifySkill } from '../src/lib/classifier.ts'
import { SKILL_COARSE_CATEGORIES, SKILL_COARSE_CATEGORY_LABELS } from '../src/lib/skillCoarseClassification.ts'
import { buildSkillKMeansCorpus, createSkillKMeansFeatures, type SkillKMeansDocument } from '../src/lib/skillKMeans.ts'
import {
  buildSkillKMeansScopes,
  getSkillKMeansInitialMaxK,
  getSkillKMeansUsableDocumentCount,
  type SkillKMeansScope,
} from '../src/lib/skillKMeansScope.ts'
import type { RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

function skill(id: string, raw: RawSkillLevel, overrides: Partial<SkillRecord> = {}): SkillRecord {
  const level: RawSkillLevel = { duration: 0, skillType: 'MANUAL', ...raw }
  return {
    id, operatorId: `operator-${id}`, operatorName: `演習者${id}`,
    profession: 'WARRIOR', professionLabel: '前衛', subProfessionId: 'test', subProfessionName: 'テスト',
    nameInitial: 'T_ROW', rarity: 6, skillIndex: 1, skillId: `skill-${id}`, skillName: `技${id}`,
    description: level.description ?? '', duration: level.duration ?? null, durationType: 'NONE',
    skillType: level.skillType ?? 'MANUAL', spType: 'INCREASE_WITH_TIME', initSp: 0, spCost: 10,
    classification: classifySkill(level), skillLevels: [level], operatorProfile: { phases: [], favorKeyFrames: [] },
    raw: level, ...overrides,
  }
}

function scopeRows(rows: readonly SkillRecord[], scope: SkillKMeansScope) {
  return buildSkillKMeansScopes(rows).find(item => item.value === scope)!.rows
}

test('全スキルは元の入力参照と既存コーパスを保持し、空の大分類も固定順で残す', () => {
  const rows = Object.freeze([
    skill('b', { description: '次の通常攻撃時、攻撃力が200%まで上昇する' }),
    skill('a', { description: '次の通常攻撃時、攻撃力が200%まで上昇する' }),
  ])
  const before = structuredClone(rows)
  const scopes = buildSkillKMeansScopes(rows)
  assert.equal(scopes[0].value, 'ALL')
  assert.equal(scopes[0].label, '全スキル')
  assert.equal(scopes[0].rows, rows)
  assert.deepEqual(scopes.slice(1).map(item => item.value), SKILL_COARSE_CATEGORIES)
  assert.deepEqual(scopes.slice(1).map(item => item.label), SKILL_COARSE_CATEGORIES.map(key => SKILL_COARSE_CATEGORY_LABELS[key]))
  assert.equal(scopes.find(item => item.value === 'MODE')!.rows.length, 0)
  assert.deepEqual(buildSkillKMeansCorpus(scopes[0].rows), buildSkillKMeansCorpus(rows))
  assert.deepEqual(rows, before)
  assert.deepEqual(buildSkillKMeansScopes([]).map(item => item.rows.length), Array(8).fill(0))
})

test('複数の大分類に属するスキルはそれぞれに1件ずつ含め、未分類も対象にする', () => {
  const nextSummon = skill('summon', { description: '次の通常攻撃時、地雷を設置する' })
  const sustainedBurst = skill('burst', {
    description: 'スキル発動時、周囲の敵に攻撃力の200%の術ダメージを与える。攻撃力+100%', duration: 20,
  })
  const unknown = skill('unknown', { description: '特殊な効果を発動する' })
  const rows = [nextSummon, sustainedBurst, unknown]
  const memberships = new Map(buildSkillKMeansScopes(rows).map(item => [item.value, item.rows.map(row => row.id)]))
  assert.deepEqual(memberships.get('NEXT_ATTACK'), ['summon'])
  assert.deepEqual(memberships.get('SUMMON'), ['summon'])
  assert.deepEqual(memberships.get('SUSTAINED'), ['burst'])
  assert.deepEqual(memberships.get('BURST'), ['burst'])
  assert.deepEqual(memberships.get('UNKNOWN'), ['unknown'])
  assert.deepEqual(memberships.get('ALL'), rows.map(row => row.id))
})

test('同じ説明文でも大分類の異なる掲載先は、統合前に絞り込んでから学習・展開する', () => {
  const sustained = skill('a-active', { description: '攻撃力+100%', duration: 20 })
  const passive = skill('b-passive', { description: '攻撃力+100%', duration: -1, skillType: 'PASSIVE' })
  const rows = [sustained, passive]
  assert.deepEqual(buildSkillKMeansCorpus(rows).documents[0].recordIds, [sustained.id, passive.id])
  for (const [scope, expected] of [['SUSTAINED', sustained], ['PASSIVE', passive]] as const) {
    const selected = scopeRows(rows, scope)
    const corpus = buildSkillKMeansCorpus(selected)
    const recordMap = new Map(selected.map(row => [row.id, row]))
    assert.equal(corpus.sourceCount, 1)
    assert.deepEqual(corpus.documents.flatMap(document => document.recordIds), [expected.id])
    assert.deepEqual(corpus.documents.flatMap(document => document.recordIds.map(id => recordMap.get(id))), [expected])
  }
})

test('共通スキルIDでも別分類の代表説明文や所属スキルが漏れない', () => {
  const passive = skill('a-passive', { description: '配置後にシールドを獲得', skillType: 'PASSIVE' }, { skillId: 'shared' })
  const active = skill('z-active', { description: '攻撃力と防御力が上昇する', duration: 20 }, { skillId: 'shared' })
  const all = buildSkillKMeansCorpus([passive, active])
  assert.equal(all.documents.length, 1)
  assert.match(all.documents[0].description, /シールド/)
  const scoped = buildSkillKMeansCorpus(scopeRows([passive, active], 'SUSTAINED'))
  assert.equal(scoped.documents.length, 1)
  assert.deepEqual(scoped.documents[0].recordIds, [active.id])
  assert.match(scoped.documents[0].description, /攻撃力/)
  assert.doesNotMatch(scoped.documents[0].description, /シールド/)
  assert.ok(!createSkillKMeansFeatures(scoped.documents).terms.includes('シールド'))
})

test('全スキル・大分類とも初期探索上限は60と学習説明文数−1の小さい方にする', () => {
  for (const [count, expected] of [[4, 3], [9, 8], [32, 31], [47, 46], [60, 59], [61, 60], [62, 60], [97, 60], [102, 60], [533, 60], [834, 60]]) {
    for (const scope of ['ALL', ...SKILL_COARSE_CATEGORIES] as const) {
      assert.equal(getSkillKMeansInitialMaxK(scope, count), expected)
    }
  }
  for (const count of [0, 1, 2, 3]) {
    assert.equal(getSkillKMeansInitialMaxK('ALL', count), 3)
    assert.equal(getSkillKMeansInitialMaxK('MODE', count), 3)
  }
  for (let count = 4; count <= 1000; count += 1) {
    for (const scope of ['ALL', ...SKILL_COARSE_CATEGORIES] as const) {
      const maxK = getSkillKMeansInitialMaxK(scope, count)
      assert.ok(Number.isInteger(maxK) && maxK >= 3 && maxK <= Math.min(60, count - 1))
    }
  }
})

test('学習可能数は空文・数値・助詞・名称だけの説明文をトークン化と同じ規則で除外する', () => {
  const descriptions = ['', '100% 30秒', 'の に を は', 'アーミヤ', '攻撃力を上昇する', '周囲の敵を凍結する']
  const documents: SkillKMeansDocument[] = descriptions.map((description, index) => ({
    id: `doc-${index}`, description, recordIds: [`row-${index}`], operatorName: 'アーミヤ', skillName: '術式', skillIndex: 1,
  }))
  assert.equal(getSkillKMeansUsableDocumentCount(documents), 2)
  assert.equal(getSkillKMeansUsableDocumentCount([]), 0)
  assert.equal(getSkillKMeansUsableDocumentCount(documents.slice(0, 4)), 0)
})
