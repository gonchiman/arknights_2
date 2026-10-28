import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createSkillClusteringFeatures,
  type SkillClusteringDocument,
  type SkillClusteringStopWordProfile,
} from '../src/lib/skillClusteringFeatures.ts'

function documents(descriptions: string[]): SkillClusteringDocument[] {
  return descriptions.map((description, index) => ({
    id: `document-${index}`,
    description,
    recordIds: [`source-${index}`],
    operatorName: 'テスト名',
    skillName: '名称',
    skillIndex: 1,
  }))
}

function features(descriptions: string[], profile?: SkillClusteringStopWordProfile) {
  return createSkillClusteringFeatures(documents(descriptions), profile)
}

test('接続表現や助詞だけが異なる同じ効果は同じ特徴量になる', () => {
  const pairs = [
    ['攻撃力が上昇し、防御力が上昇する', '攻撃力が上昇して、また防御力が上昇する'],
    ['通常攻撃が術ダメージになり、攻撃速度が上昇する', '通常攻撃が術ダメージとなり、そして攻撃速度が上昇する'],
    ['敵への攻撃で術ダメージを与える', '敵に対する攻撃で術ダメージを与える'],
    ['通常攻撃で敵に術ダメージを与える', '通常攻撃として敵に術ダメージを与える'],
  ]
  for (const pair of pairs) {
    const result = features(pair, 'extended')
    assert.deepEqual(result.documentIndices, [0, 1])
    assert.deepEqual(result.vectors[0], result.vectors[1], pair.join(' / '))
  }
})

for (const profile of ['basic', 'extended'] as const) {
  test(`${profile}: 制限の有無を示す否定を残して、肯定文と同一視しない`, () => {
    const result = features(['攻撃回数の制限がある', '攻撃回数の制限がない'], profile)
    assert.deepEqual(result.documentIndices, [0, 1])
    assert.notDeepEqual(result.vectors[0], result.vectors[1])
    const negativeIndex = result.terms.indexOf('ない')
    assert.ok(negativeIndex >= 0)
    assert.ok(!result.vectors[0].indices.includes(negativeIndex))
    assert.ok(result.vectors[1].indices.includes(negativeIndex))

    const otherNegations = features([
      '攻撃回数の制限がなく、持続時間が無限になる',
      'HPを消費せず、攻撃力が上昇する',
    ], profile)
    assert.ok(otherNegations.terms.includes('なく'))
    assert.ok(otherNegations.terms.includes('ず'))
  })
}

test('効果と発動条件・制約の違いを特徴量に残す', () => {
  const pairs = [
    ['攻撃力が上昇する', '防御力が上昇する'],
    ['HPが半分以下の場合のみ攻撃力が上昇する', 'HPが半分以上の場合のみ攻撃力が上昇する'],
    ['対象がいる場合に発動する', '対象がいる場合のみ発動する'],
    ['スキル終了時に無効になる', 'スキル発動時に無効になる'],
    ['状態異常を無効にする', '状態異常を付与する'],
  ]
  for (const pair of pairs) {
    const result = features(pair, 'extended')
    assert.deepEqual(result.documentIndices, [0, 1])
    assert.notDeepEqual(result.vectors[0], result.vectors[1], pair.join(' / '))
  }
  const conditions = features(['対象がいる場合のみ発動し、スキル終了時に無効になる'], 'extended')
  for (const term of ['場合', 'のみ', '終了', '無効']) assert.ok(conditions.terms.includes(term), term)
})

test('短い除外語を含む対象範囲や否定の語を部分削除しない', () => {
  const result = features(['範囲内すべての敵に術ダメージを与える', 'HPがなくなると撤退する'], 'extended')
  assert.ok(result.terms.includes('すべて'))
  assert.ok(result.terms.includes('なくなる'))
  assert.deepEqual(result.excludedIndices, [])
})

test('定型表現だけの文は分類対象から除き、元の説明文との対応を維持する', () => {
  const result = features(['このため、また、そして、これにより。', '味方のHPを回復する'], 'extended')
  assert.equal(result.documentCount, 2)
  assert.deepEqual(result.excludedIndices, [0])
  assert.deepEqual(result.documentIndices, [1])
  assert.equal(result.vectors.length, 1)
  assert.ok(result.vectors[0].values.every(Number.isFinite))
})

test('基本と拡張で同じ説明文の定型語の扱いを切り替えられる', () => {
  const descriptions = ['攻撃力が上昇し、防御力が上昇する', '攻撃力が上昇して、また防御力が上昇する']
  const basic = features(descriptions, 'basic')
  const extended = features(descriptions, 'extended')
  for (const term of ['て', 'また']) {
    assert.ok(basic.terms.includes(term), term)
    assert.ok(!extended.terms.includes(term), term)
  }
  assert.notDeepEqual(basic.vectors[0], basic.vectors[1])
  assert.deepEqual(extended.vectors[0], extended.vectors[1])
  assert.deepEqual(basic.documentIndices, extended.documentIndices)
})

test('プロファイル省略時は基本リストを使用する', () => {
  const descriptions = ['これを通常攻撃として扱う', '通常攻撃で敵にダメージを与える']
  assert.deepEqual(features(descriptions), features(descriptions, 'basic'))
  assert.notDeepEqual(features(descriptions), features(descriptions, 'extended'))
})

test('リストの切り替えで原文や以前の特徴量やリストを変更しない', () => {
  const corpus = documents(['また、そして、これ。', '攻撃力が上昇して、回復量が上昇する'])
  const original = structuredClone(corpus)
  corpus.forEach((document) => {
    Object.freeze(document.recordIds)
    Object.freeze(document)
  })
  Object.freeze(corpus)
  const basic = createSkillClusteringFeatures(corpus, 'basic')
  const basicSnapshot = structuredClone(basic)
  const extended = createSkillClusteringFeatures(corpus, 'extended')
  const extendedSnapshot = structuredClone(extended)

  assert.deepEqual(basic.documentIndices, [0, 1])
  assert.deepEqual(extended.excludedIndices, [0])
  assert.deepEqual(extended.documentIndices, [1])
  assert.deepEqual(createSkillClusteringFeatures(corpus, 'basic'), basicSnapshot)
  assert.deepEqual(createSkillClusteringFeatures(corpus, 'extended'), extendedSnapshot)
  assert.deepEqual(basic, basicSnapshot)
  assert.deepEqual(extended, extendedSnapshot)
  assert.deepEqual(corpus, original)
})

test('不明な除外語リストは基本に置き換えずエラーにする', () => {
  for (const invalid of ['standard', 'constructor', '', null, 1, {}]) {
    assert.throws(() => createSkillClusteringFeatures([], invalid as SkillClusteringStopWordProfile), RangeError)
  }
})
