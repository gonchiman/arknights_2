import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildTraitCoarseRecords, DEFAULT_TRAIT_COARSE_FILTERS, filterTraitCoarseRows,
  getTraitCoarseCategories, summarizeTraitCoarseCategories,
  type TraitCoarseRecord, type TraitCoarseCategory,
} from '../src/lib/traitCoarseClassification.ts'
import type { OperatorCombatProfile, RawTraitCandidate, SkillRecord } from '../src/types/skill.ts'

function candidate(description: string, value: number, phase = 'PHASE_2', level = 1, potential = 0): RawTraitCandidate {
  return { overrideDescripton: description, blackboard: [{ key: 'value', value }],
    unlockCondition: { phase, level }, requiredPotentialRank: potential }
}

function skill(operatorId = 'char_test', patch: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: `${operatorId}:skill`, operatorId, operatorName: '試験OP', profession: 'WARRIOR',
    professionLabel: '前衛', subProfessionId: 'lord', subProfessionName: '領主', rarity: 6,
    nameInitial: 'S_ROW', skillId: 'test_skill', skillIndex: 1, skillName: '試験スキル',
    description: 'スキルの攻撃力+999%', duration: 30, durationType: 'NONE', skillType: 'MANUAL',
    spType: 'INCREASE_WITH_TIME', initSp: 0, spCost: 10,
    classification: {} as SkillRecord['classification'], skillLevels: [], raw: {},
    operatorProfile: { phases: [{ maxLevel: 50 }, { maxLevel: 80 }, { maxLevel: 90 }], favorKeyFrames: [],
      traitDescription: '80%の攻撃力で遠距離攻撃も行える',
      talents: [{ candidates: [{ name: '素質のみ', description: '攻撃力+999%' }] }],
    },
    ...patch,
  }
}

function row(description: string, patch: Partial<TraitCoarseRecord> = {}): TraitCoarseRecord {
  return {
    id: 'test', profession: 'WARRIOR', professionLabel: '前衛',
    subProfessionId: 'lord', subProfessionName: '領主', variantIndex: 1, description,
    operators: [{ operatorId: 'char_test', operatorName: '試験OP', rarity: 6 }], ...patch,
  }
}

test('複数スキルを持つOPを重複させず、最大昇進・レベル・潜在1の特性の数値を展開する', () => {
  const operator = skill()
  operator.operatorProfile.trait = { candidates: [
    candidate('HPを{value}回復', 10, 'PHASE_0'),
    candidate('HPを{value}回復', 50, 'PHASE_1'),
    candidate('HPを<@ba.kw>{value}</>回復', 70),
    candidate('HPを{value}回復', 99, 'PHASE_2', 1, 4),
    candidate('HPを{value}回復', 100, 'PHASE_2', 99),
  ] }
  operator.operatorProfile.modules = [{ phases: [{ parts: [{ overrideTraitDataBundle: {
    candidates: [{ overrideDescripton: 'MODによるHPを999回復' }],
  } }] }] }]
  const input = [operator, { ...operator, id: 'char_test:skill2', skillIndex: 2 }]
  const before = structuredClone(input)
  const result = buildTraitCoarseRecords(input)
  assert.equal(result.length, 1)
  assert.equal(result[0].description, 'HPを70回復')
  assert.equal(result[0].operators.length, 1)
  assert.equal(result[0].variantIndex, 1)
  assert.deepEqual(input, before)
})

test('最大昇進が1ならその最大レベルの候補を選び、正しい綴りのoverrideも使う', () => {
  const operator = skill()
  operator.operatorProfile.phases = [{ maxLevel: 40 }, { maxLevel: 55 }]
  operator.operatorProfile.trait = { candidates: [candidate('HPを{value}回復', 10, 'PHASE_1'),
    { ...candidate('', 50, 'PHASE_1', 55), overrideDescripton: undefined, overrideDescription: 'HPを{value}回復' },
    candidate('HPを{value}回復', 70),
  ] }
  assert.equal(buildTraitCoarseRecords([operator])[0].description, 'HPを50回復')
})

test('同じ職業・職分・展開後の特性だけ統合し、数値違いと職分違いを残す', () => {
  const first = skill('char_first', { operatorName: 'A' })
  first.operatorProfile.trait = { candidates: [candidate('HPを{value}回復', 70)] }
  const equal = skill('char_equal', { operatorName: 'B', rarity: 5 })
  equal.operatorProfile.traitDescription = '  HPを７０回復  '
  const variant = skill('char_variant', { operatorName: 'C' })
  variant.operatorProfile.trait = { candidates: [candidate('HPを{value}回復', 50)] }
  const otherJob = { ...equal, operatorId: 'char_job', subProfessionId: 'musha', subProfessionName: '武者' }
  const otherProfession = { ...equal, operatorId: 'char_profession', profession: 'MEDIC', professionLabel: '医療' }
  const input = [first, equal, variant, otherJob, otherProfession]
  const result = buildTraitCoarseRecords(input)
  assert.equal(result.length, 4)
  const shared = result.find(entry => entry.operators.length === 2)!
  assert.deepEqual(shared.operators.map(operator => operator.operatorId), ['char_first', 'char_equal'])
  assert.equal(shared.description, 'HPを70回復')
  assert.deepEqual(result.filter(entry => entry.profession === 'WARRIOR' && entry.subProfessionId === 'lord')
    .map(entry => [entry.description, entry.variantIndex]), [['HPを50回復', 1], ['HPを70回復', 2]])
  assert.deepEqual(buildTraitCoarseRecords([...input].reverse()), result)
  assert.equal(new Set(result.map(entry => entry.id)).size, 4)
})

test('数値プレースホルダーの比率・小数を既存書式で展開し、未取得値も内部キーを表示しない', () => {
  const operator = skill()
  operator.operatorProfile.trait = { candidates: [candidate('攻撃力+{value:0%}、時間{duration:0.0}秒、HPを{missing}回復', 0.25)] }
  operator.operatorProfile.trait.candidates![0].blackboard!.push({ key: 'duration', value: 2.5 })
  const result = buildTraitCoarseRecords([operator])[0]
  assert.equal(result.description, '攻撃力+25%、時間2.5秒、HPを不明回復')
  assert.doesNotMatch(result.description, /[{}]|missing/)
})

test('literalの支援装置・身替りを装飾タグとして消さず、元プロフィールを変更しない', () => {
  const operator = skill()
  operator.operatorProfile.traitDescription = '敵を2体までブロック\n<支援装置>を使用可能'
  const before = structuredClone(operator)
  const built = buildTraitCoarseRecords([operator])[0]
  assert.equal(built.description, '敵を2体までブロック 「支援装置」を使用可能')
  assert.deepEqual(getTraitCoarseCategories(built), ['BLOCK', 'SUMMON'])
  assert.deepEqual(operator, before)
  operator.operatorProfile.trait = { candidates: [candidate('致命的なダメージを受けても撤退せず、<身替り>と入れ替わる', 0)] }
  assert.match(buildTraitCoarseRecords([operator])[0].description, /「身替り」/)
})

test('空の特性でもOPを失わず未分類に残し、職分特性のフォールバックも使う', () => {
  const operator = skill()
  operator.operatorProfile.traitDescription = undefined
  operator.operatorProfile.subProfessionTraitDescription = '敵を2体までブロック'
  assert.equal(buildTraitCoarseRecords([operator])[0].description, '敵を2体までブロック')
  operator.operatorProfile.subProfessionTraitDescription = undefined
  const result = buildTraitCoarseRecords([operator])
  assert.equal(result[0].operators[0].operatorId, operator.operatorId)
  assert.deepEqual(getTraitCoarseCategories(result[0]), ['UNKNOWN'])
  assert.deepEqual(buildTraitCoarseRecords([]), [])
})

test('初期フィルターは星6前衛で、検索とレア度に合うOPだけをグループに残す', () => {
  const shared = row('80%の攻撃力で遠距離攻撃も行える', { variantIndex: 2, operators: [
    { operatorId: 'char_a', operatorName: 'SilverAsh', rarity: 6 },
    { operatorId: 'char_b', operatorName: 'フロストリーフ', rarity: 4 },
    { operatorId: 'char_c', operatorName: 'ソーンズ', rarity: 6 },
  ] })
  const rows = [shared, row('HPを回復', { id: 'medic', profession: 'MEDIC' })]
  const before = structuredClone(rows)
  assert.deepEqual(filterTraitCoarseRows(rows, DEFAULT_TRAIT_COARSE_FILTERS)[0].operators.map(op => op.operatorId), ['char_a', 'char_c'])
  const filtered = filterTraitCoarseRows(rows, { ...DEFAULT_TRAIT_COARSE_FILTERS, query: 'ＳＩＬＶＥＲＡＳＨ 領主 特性２' })
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0].id, shared.id)
  assert.equal(filtered[0].variantIndex, 2)
  assert.deepEqual(filtered[0].operators.map(op => op.operatorId), ['char_a'])
  assert.deepEqual(filterTraitCoarseRows(rows, { ...DEFAULT_TRAIT_COARSE_FILTERS, query: 'SilverAsh ソーンズ' }), [])
  assert.deepEqual(filterTraitCoarseRows(rows, { ...DEFAULT_TRAIT_COARSE_FILTERS, query: 'フロストリーフ' }), [])
  assert.deepEqual(filterTraitCoarseRows(rows, { ...DEFAULT_TRAIT_COARSE_FILTERS, rarity: 4 })[0].operators.map(op => op.operatorId), ['char_b'])
  assert.deepEqual(rows, before)
})

test('職業・分類・説明・分類名・職分IDで絞り込み、空になったグループは残さない', () => {
  const rows = [row('80%の攻撃力で遠距離攻撃も行える'), row('HPを回復', { id: 'medic', profession: 'MEDIC' }),
    row('新しい独自の仕組み', { id: 'unknown' })]
  for (const query of ['ダメージ倍率 領主', 'lord ８０％', 'char_test 遠距離']) {
    assert.deepEqual(filterTraitCoarseRows(rows, { ...DEFAULT_TRAIT_COARSE_FILTERS, query }).map(entry => entry.id), ['test'])
  }
  assert.deepEqual(filterTraitCoarseRows(rows, { query: '', profession: 'ALL', rarity: 'ALL', category: 'HP_CHANGE' }).map(entry => entry.id), ['medic'])
  assert.deepEqual(filterTraitCoarseRows(rows, { ...DEFAULT_TRAIT_COARSE_FILTERS, category: 'UNKNOWN' }).map(entry => entry.id), ['unknown'])
})

test('実特性の各方式を分類し、該当しない説明は未分類として残す', () => {
  const cases: [string, TraitCoarseCategory[]][] = [
    ['敵を1体までブロック', ['BLOCK']],
    ['ブロック中の敵全員を同時に攻撃', ['ATTACK_BEHAVIOR']],
    ['80%の攻撃力で遠距離攻撃も行える', ['ATTACK_BEHAVIOR', 'DAMAGE']],
    ['通常攻撃時、1回の攻撃で2回ダメージを与える', ['ATTACK_BEHAVIOR']],
    ['攻撃距離がやや長い、自身がブロックしていない敵を攻撃時、攻撃力が120%まで上昇', ['ATTACK_BEHAVIOR', 'DAMAGE']],
    ['敵に術ダメージを与える', ['DAMAGE_TYPE']],
    ['攻撃対象の周囲にいる敵に攻撃力の50%の範囲物理ダメージを与える', ['ATTACK_BEHAVIOR', 'DAMAGE_TYPE', 'DAMAGE']],
    ['通常時は攻撃せずブロック数が0となり、攻撃力が+200%まで徐々に上昇していく', ['ATTACK_BEHAVIOR', 'ABILITY', 'BLOCK']],
    ['未ブロック時、SPが自然回復しない', ['RESOURCE']],
    ['敵を倒す度所持コスト+1 撤退時に初期配置時のコストを返却', ['RESOURCE', 'DEPLOYMENT']],
    ['再配置までの時間が極めて短い', ['DEPLOYMENT']],
    ['強制移動スキルを所持 遠距離マスにも配置可能', ['DEPLOYMENT', 'STATUS']],
    ['敵に術ダメージを与える 攻撃時、敵を一瞬足止め', ['DAMAGE_TYPE', 'STATUS']],
    ['HPが徐々に減少', ['HP_CHANGE']],
    ['罠を使用可能、敵のいるマスに罠配置不可', ['DEPLOYMENT', 'SUMMON']],
    ['錬金ユニットを投擲可能', ['ATTACK_BEHAVIOR', 'SUMMON']],
    ['独自の未定義の仕組み', ['UNKNOWN']],
  ]
  for (const [description, expected] of cases) assert.deepEqual(getTraitCoarseCategories(row(description)), expected, description)
})

test('治療を受けないだけなら回復を付けず、独立した自己回復は拾う', () => {
  for (const description of ['味方の治療対象にならない', '味方からの治療効果を受けない']) {
    assert.deepEqual(getTraitCoarseCategories(row(description)), ['HEAL_RESTRICTION'], description)
  }
  assert.deepEqual(getTraitCoarseCategories(row('味方の治療対象にならない 敵を攻撃するたび自身のHPを70回復')), ['HP_CHANGE', 'HEAL_RESTRICTION'])
  const reaper = getTraitCoarseCategories(row('味方の治療対象にならない 攻撃は範囲物理ダメージを与え、敵を1体攻撃するたび自身のHPを50回復（攻撃毎の最大回復回数はブロック数と同じ）'))
  assert.deepEqual(reaper, ['ATTACK_BEHAVIOR', 'DAMAGE_TYPE', 'HP_CHANGE', 'HEAL_RESTRICTION'])
})

test('HP条件付きSP回復をHP回復にせず、治療の与ダメージ参照をダメージ補正にしない', () => {
  for (const description of ['HPが50%未満のとき、SPを1回復', '未ブロック時、SPが自然回復しない']) {
    const categories = getTraitCoarseCategories(row(description))
    assert.ok(categories.includes('RESOURCE'), description)
    assert.ok(!categories.includes('HP_CHANGE'), description)
  }
  assert.deepEqual(getTraitCoarseCategories(row('術ダメージを与え、敵を攻撃するたび攻撃範囲内の味方1人のHPを与ダメージの50%回復')), ['DAMAGE_TYPE', 'HP_CHANGE'])
  assert.deepEqual(getTraitCoarseCategories(row('敵に術ダメージを与える スキル発動中、通常攻撃が味方に対する治療行動になる（治療量は攻撃力の75%）')), ['ATTACK_BEHAVIOR', 'DAMAGE_TYPE', 'HP_CHANGE'])
})

test('浮遊ユニットの操作を敵への浮遊状態の付与として扱わない', () => {
  const categories = getTraitCoarseCategories(row('浮遊ユニットを操作して敵に術ダメージを与える 浮遊ユニットが連続で同一目標を攻撃時、与ダメージが上昇（最大は攻撃力の110%まで）'))
  assert.deepEqual(categories, ['DAMAGE_TYPE', 'DAMAGE', 'SUMMON'])
  assert.ok(getTraitCoarseCategories(row('敵を2秒間浮遊させる')).includes('STATUS'))
})

test('職分単位で各候補を一度数え、所属OP数や重複語で水増ししない', () => {
  const rows = [row('攻撃力+10%、防御力+10%、ブロック数が0になる', { operators: [
    { operatorId: 'a', operatorName: 'A', rarity: 6 }, { operatorId: 'b', operatorName: 'B', rarity: 5 },
  ] }), row('独自の未定義の仕組み', { id: 'unknown' })]
  const summary = summarizeTraitCoarseCategories(rows)
  assert.equal(summary.find(entry => entry.value === 'ABILITY')?.count, 1)
  assert.equal(summary.find(entry => entry.value === 'BLOCK')?.count, 1)
  assert.equal(summary.find(entry => entry.value === 'UNKNOWN')?.count, 1)
  assert.ok(summary.every(entry => entry.label && entry.description))
  assert.ok(summarizeTraitCoarseCategories([]).every(entry => entry.count === 0))
})

test('保存済み星6前衛30人を12職分の特性に統合し、全員と展開済み数値を保持する', () => {
  const profiles = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardProfiles.json', import.meta.url), 'utf8')) as {
    operatorId: string; operatorProfile: OperatorCombatProfile
  }[]
  const sources = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardSources.json', import.meta.url), 'utf8')) as {
    guards: { id: string; name: string; subProfessionId: string }[]
  }
  const records = profiles.flatMap(profile => {
    const source = sources.guards.find(entry => entry.id === profile.operatorId)!
    return [1, 2, 3].map(skillIndex => skill(profile.operatorId, {
      operatorName: source.name, subProfessionId: source.subProfessionId, subProfessionName: source.subProfessionId,
      operatorProfile: profile.operatorProfile, skillIndex,
    }))
  })
  const result = filterTraitCoarseRows(buildTraitCoarseRecords(records), DEFAULT_TRAIT_COARSE_FILTERS)
  assert.equal(result.length, 12)
  assert.equal(result.reduce((sum, entry) => sum + entry.operators.length, 0), 30)
  assert.ok(result.every(entry => !/[{}<>]/.test(entry.description)))
  assert.ok(result.every(entry => !getTraitCoarseCategories(entry).includes('UNKNOWN')))
  assert.match(result.find(entry => entry.subProfessionId === 'musha')!.description, /HPを70回復/)
  assert.match(result.find(entry => entry.subProfessionId === 'librator')!.description, /\+200%/)
  assert.match(result.find(entry => entry.subProfessionId === 'hammer')!.description, /50%/)
})
