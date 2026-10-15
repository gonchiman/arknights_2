import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTalentCoarseRecords,
  DEFAULT_TALENT_COARSE_FILTERS,
  filterTalentCoarseRows,
  getTalentCoarseCategories,
  summarizeTalentCoarseCategories,
  type TalentCoarseRecord,
} from '../src/lib/talentCoarseClassification.ts'
import type { RawTalentCandidate, SkillRecord } from '../src/types/skill.ts'

function candidate(name: string, description: string, phase = 'PHASE_2', level = 1, potential = 0): RawTalentCandidate {
  return { name, description, unlockCondition: { phase, level }, requiredPotentialRank: potential }
}

function skill(operatorId = 'char_test', patch: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: `${operatorId}:skill`, operatorId, operatorName: '試験OP', profession: 'WARRIOR',
    professionLabel: '前衛', subProfessionId: 'lord', subProfessionName: '領主',
    rarity: 6, nameInitial: 'S_ROW', skillId: 'test_skill', skillIndex: 1, skillName: '試験スキル',
    description: 'スキルの攻撃力+999%', duration: 30, durationType: 'NONE', skillType: 'MANUAL',
    spType: 'INCREASE_WITH_TIME', initSp: 0, spCost: 10,
    classification: {} as SkillRecord['classification'], skillLevels: [], raw: {},
    operatorProfile: {
      phases: [{ maxLevel: 50 }, { maxLevel: 80 }, { maxLevel: 90 }], favorKeyFrames: [],
      traitDescription: '特性だけの効果',
      talents: [{ candidates: [candidate('試験素質', '攻撃力+10%')] }],
    },
    ...patch,
  }
}

function row(description: string, patch: Partial<TalentCoarseRecord> = {}): TalentCoarseRecord {
  return {
    id: 'char_test:talent:0', operatorId: 'char_test', operatorName: '試験OP', profession: 'WARRIOR',
    professionLabel: '前衛', rarity: 6, subProfessionName: '領主', talentIndex: 0,
    talentName: '試験素質', description, ...patch,
  }
}

test('複数スキルを持つOPを一度だけ抽出し、最大昇進・最大レベル・潜在1の素質を使う', () => {
  const operator = skill()
  operator.operatorProfile.talents = [
    { candidates: [
      candidate('未昇進', '攻撃力+1%', 'PHASE_0'),
      candidate('昇進1', '攻撃力+5%', 'PHASE_1'),
      candidate('基本潜在', '<@ba.vup>攻撃力+10%</>'),
      candidate('潜在強化', '攻撃力+25%', 'PHASE_2', 1, 4),
      candidate('未解放', '攻撃力+999%', 'PHASE_2', 99),
    ] },
    { candidates: [{ ...candidate('内部用', '非表示素質'), isHideTalent: true }] },
    { candidates: [candidate('第3枠', 'HPが1残る')] },
    { candidates: [candidate('空説明', ' <@ba.vup> </> ')] },
  ]
  const rows = [operator, { ...operator, id: 'char_test:skill2', skillIndex: 2 }]
  const before = structuredClone(rows)
  const result = buildTalentCoarseRecords(rows)
  assert.deepEqual(result.map(entry => [entry.talentIndex, entry.talentName, entry.description]), [
    [0, '基本潜在', '攻撃力+10%'], [2, '第3枠', 'HPが1残る'],
  ])
  assert.equal(new Set(result.map(entry => entry.id)).size, 2)
  assert.ok(result.every(entry => entry.operatorId === 'char_test' && entry.rarity === 6))
  assert.ok(result.every(entry => !entry.description.includes('999') && !entry.description.includes('特性')))
  assert.deepEqual(rows, before)
})

test('最大昇進が1のOPでも、その最大レベルで解放される候補を選ぶ', () => {
  const operator = skill('char_low')
  operator.operatorProfile.phases = [{ maxLevel: 40 }, { maxLevel: 55 }]
  operator.operatorProfile.talents = [{ candidates: [
    candidate('初期', '攻撃力+3%', 'PHASE_1', 1),
    candidate('最大レベル', '攻撃力+6%', 'PHASE_1', 55),
    candidate('別昇進', '攻撃力+9%', 'PHASE_2', 1),
  ] }]
  assert.equal(buildTalentCoarseRecords([operator])[0].talentName, '最大レベル')
})

test('同じ説明文でも別OP・別素質枠を統合せず、空入力は空配列になる', () => {
  const first = skill('char_first')
  first.operatorProfile.talents = [
    { candidates: [candidate('同文1', '攻撃力+10%')] },
    { candidates: [candidate('同文2', '攻撃力+10%')] },
  ]
  const second = { ...first, id: 'char_second:skill', operatorId: 'char_second' }
  const result = buildTalentCoarseRecords([first, second])
  assert.equal(result.length, 4)
  assert.equal(new Set(result.map(entry => entry.id)).size, 4)
  assert.deepEqual(buildTalentCoarseRecords([]), [])
})

test('非表示の上位候補を使わず、公開された下位候補を既存OP情報と同じように残す', () => {
  const operator = skill()
  operator.operatorProfile.talents = [{ candidates: [
    candidate('公開候補', '防御力+5%', 'PHASE_1'),
    { ...candidate('非表示候補', '防御力+100%'), isHideTalent: true },
  ] }]
  assert.equal(buildTalentCoarseRecords([operator])[0].talentName, '公開候補')
})

test('カリスマ型の能力補正と再配置、確率攻撃型の倍率と敵弱体を複数候補にする', () => {
  const charisma = getTalentCoarseCategories(row('攻撃力+10%。編成中、味方全員の再配置時間-10%'))
  assert.ok(charisma.includes('ABILITY'))
  assert.ok(charisma.includes('DEPLOYMENT'))
  assert.ok(!charisma.includes('UNKNOWN'))
  const punch = getTalentCoarseCategories(row('攻撃時、20%の確率でその攻撃のみ攻撃力が160%まで上昇し、攻撃対象の攻撃力を3秒間-15%（重複不可）'))
  assert.ok(punch.includes('DAMAGE'))
  assert.ok(punch.includes('STATUS'))
  assert.equal(new Set(punch).size, punch.length)
})

test('攻撃のきっかけだけを追加ダメージ扱いせず、術耐性無視・毒・生存を区別する', () => {
  assert.deepEqual(getTalentCoarseCategories(row('攻撃時、対象の術耐性を20無視')), ['DAMAGE'])
  const penetration = getTalentCoarseCategories(row('敵に物理ダメージを与える際、50%の確率で敵の防御力を50%無視'))
  assert.ok(penetration.includes('DAMAGE'))
  assert.ok(!penetration.includes('ADDITIONAL_DAMAGE'))
  assert.ok(getTalentCoarseCategories(row('攻撃時、攻撃対象に毒で3秒間毎秒125の術ダメージを与える')).includes('ADDITIONAL_DAMAGE'))
  assert.ok(getTalentCoarseCategories(row('致命的なダメージを受けてもHPが1残る。効果発動から8秒後強制退場')).includes('SURVIVAL'))
})

test('SP・状態付与・索敵・召喚の候補を持ち、該当しない説明は未分類として残す', () => {
  const cases = [
    ['配置中、4秒ごとに味方全員の攻撃回復系、被撃回復系スキルのSPを1回復', 'RESOURCE'],
    ['攻撃時、20%の確率で対象を1.5秒間バインドさせる', 'STATUS'],
    ['攻撃範囲内の敵のステルス状態を無効にする', 'ATTACK_BEHAVIOR'],
    ['召喚物が倒された時、自身のSPが3回復', 'SUMMON'],
    ['音符は敵を追尾し、常時攻撃を行う', 'ATTACK_BEHAVIOR'],
  ] as const
  for (const [description, expected] of cases) assert.ok(getTalentCoarseCategories(row(description)).includes(expected), description)
  assert.deepEqual(getTalentCoarseCategories(row('未定義の独自の仕組み')), ['UNKNOWN'])
  assert.deepEqual(getTalentCoarseCategories(row('')), ['UNKNOWN'])
})

test('SP回復やSP自然回復速度はHP回復の候補へ混ぜず、HP条件があっても区別する', () => {
  for (const description of [
    '配置中、4秒ごとに味方全員の攻撃回復系、被撃回復系スキルのSPを1回復',
    'スキル発動中、敵を1体以上倒した場合、スキル終了後SPが3回復する',
    'スキル発動中に倒した敵1体につき、スキル終了時SPを1回復',
    'SP自然回復速度+2sp/秒',
    'HPが50%未満のとき、SPを1回復',
  ]) {
    const categories = getTalentCoarseCategories(row(description))
    assert.ok(categories.includes('RESOURCE'), description)
    assert.ok(!categories.includes('SURVIVAL'), description)
  }
  assert.ok(getTalentCoarseCategories(row('SPを1回復し、HPを100回復')).includes('SURVIVAL'))
})

test('終止する召喚・罠・引用名の配置許可を固有OPに依存せず召喚設置へ分類する', () => {
  for (const description of [
    '攻撃対象のいるマスに「小自在」を1体召喚（召喚から25秒後強制退場）',
    '敵が倒されたとき、術攻撃を行う「パペットダンサー」を1体召喚',
    '罠「クリップ」を使用可能（配置時に8個獲得、所持上限10個）',
    '「鏡映虚影」を配置可能。再配置時間は本体と別に計算',
    '「タイプライター」を配置可能（配置から25秒後強制退場）',
    '「新しい装置」を配置可能',
  ]) assert.ok(getTalentCoarseCategories(row(description)).includes('SUMMON'), description)
  assert.ok(!getTalentCoarseCategories(row('自身は10秒後に再配置可能')).includes('SUMMON'))
})

test('一定周期で対象がダメージを受ける表記と、時間付き状態語の終止を拾う', () => {
  for (const description of [
    '攻撃対象を3秒間、1秒ごとに攻撃力の18%の術ダメージ（特性に影響されない）を受ける流血状態にする',
    '敵に25秒間、1秒ごとに現在の攻撃力の10%に相当する術ダメージを受ける効果を付与',
  ]) assert.ok(getTalentCoarseCategories(row(description)).includes('ADDITIONAL_DAMAGE'), description)
  for (const description of [
    '攻撃時、攻撃対象を0.6秒<$ba.sluggish>足止め</>',
    '攻撃時、18%の確率で攻撃対象を4秒間<$ba.root>バインド</>（バインド状態の敵を攻撃しない）',
  ]) assert.ok(getTalentCoarseCategories(row(description)).includes('STATUS'), description)
})

test('優先対象や攻撃可否は行動変更にし、飛行対象への倍率や防御無視条件だけでは付けない', () => {
  for (const description of [
    '防御力が一番高い敵を優先して攻撃',
    '遠距離攻撃を行える敵を優先して攻撃する',
    '睡眠状態の敵を優先して攻撃する',
    'HPが低い味方を優先して治療する',
    '飛行ユニットを攻撃不可',
  ]) assert.ok(getTalentCoarseCategories(row(description)).includes('ATTACK_BEHAVIOR'), description)
  for (const description of [
    '飛行ユニットを攻撃時、攻撃力が140%まで上昇',
    '50%の確率で敵の防御力を50%無視、飛行ユニットに対する発動確率が100%に上昇',
  ]) assert.ok(!getTalentCoarseCategories(row(description)).includes('ATTACK_BEHAVIOR'), description)
})

test('与えるダメージと敵が受ける属性付きダメージの補正を拾い、敵の脆弱を自身の生存にしない', () => {
  for (const description of [
    'ブロックされていない敵に与えるダメージ+40%',
    'スタン中の敵が受ける物理ダメージ+18%',
    '攻撃範囲内の敵が受ける術ダメージ+20%',
  ]) {
    const categories = getTalentCoarseCategories(row(description))
    assert.ok(categories.includes('DAMAGE'), description)
    assert.ok(!categories.includes('SURVIVAL'), description)
  }
})

test('初期条件は星6前衛で、職業・レア度・分類を独立して絞り込める', () => {
  const rows = [
    row('攻撃力+10%'),
    row('攻撃力+10%', { id: 'r5', rarity: 5 }),
    row('SPを1回復', { id: 'caster', profession: 'CASTER', professionLabel: '術師' }),
    row('未定義の独自の仕組み', { id: 'unknown' }),
  ]
  assert.deepEqual(filterTalentCoarseRows(rows, DEFAULT_TALENT_COARSE_FILTERS).map(entry => entry.id), ['char_test:talent:0', 'unknown'])
  assert.deepEqual(filterTalentCoarseRows(rows, { ...DEFAULT_TALENT_COARSE_FILTERS, category: 'UNKNOWN' }).map(entry => entry.id), ['unknown'])
  assert.deepEqual(filterTalentCoarseRows(rows, { query: '', profession: 'ALL', rarity: 'ALL', category: 'RESOURCE' }).map(entry => entry.id), ['caster'])
})

test('検索はOP・素質名・説明・分類・元の素質番号に対応し、全角と複数語を正規化する', () => {
  const rows = [row('攻撃力+10%。自身の再配置時間-10秒', {
    operatorName: 'SilverAsh', talentName: 'カリスマ', talentIndex: 1,
  }), row('HPを100回復', { id: 'other', operatorId: 'char_other', operatorName: '別OP', talentName: '回復' })]
  for (const query of ['ＳＩＬＶＥＲＡＳＨ カリスマ', '再配置 １０秒', '能力補正 素質２', 'char_test 領主']) {
    assert.deepEqual(filterTalentCoarseRows(rows, { ...DEFAULT_TALENT_COARSE_FILTERS, query }).map(entry => entry.id), ['char_test:talent:0'])
  }
  assert.deepEqual(filterTalentCoarseRows(rows, { ...DEFAULT_TALENT_COARSE_FILTERS, query: 'カリスマ 回復' }), [])
})

test('集計は素質ごと各候補を一度だけ数え、複数候補の合計を素質数へ押し込めない', () => {
  const rows = [
    row('攻撃力+10%、攻撃速度+20。自身の再配置時間-10秒'),
    row('SPを1回復', { id: 'resource' }),
    row('未定義の独自の仕組み', { id: 'unknown' }),
  ]
  const before = structuredClone(rows)
  const summary = summarizeTalentCoarseCategories(rows)
  assert.equal(summary.find(entry => entry.value === 'ABILITY')?.count, 1)
  assert.equal(summary.find(entry => entry.value === 'DEPLOYMENT')?.count, 1)
  assert.equal(summary.find(entry => entry.value === 'RESOURCE')?.count, 1)
  assert.equal(summary.find(entry => entry.value === 'UNKNOWN')?.count, 1)
  assert.equal(summary.find(entry => entry.value === 'SUMMON')?.count, 0)
  assert.ok(summary.every(entry => entry.label && entry.description))
  assert.ok(summary.reduce((sum, entry) => sum + entry.count, 0) > rows.length)
  assert.ok(summarizeTalentCoarseCategories([]).every(entry => entry.count === 0))
  filterTalentCoarseRows(rows, DEFAULT_TALENT_COARSE_FILTERS)
  assert.deepEqual(rows, before)
})
