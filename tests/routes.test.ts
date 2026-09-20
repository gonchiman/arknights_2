import test from 'node:test'
import assert from 'node:assert/strict'
import { APP_NAV_ITEMS, GOLDENGLOW_ANALYSIS_ITEMS } from '../src/lib/navigation.ts'
import {
  createOperatorDetailHash,
  createSkillEffectsHash,
  createSkillJsonHash,
  parseHashRoute,
  type SkillEffectsRouteSelection,
} from '../src/lib/routes.ts'

test('サイドバーから主要ページへ遷移できる', () => {
  assert.deepEqual(
    APP_NAV_ITEMS.map((item) => [item.id, parseHashRoute(item.href).view]),
    [
      ['operators', 'operators'],
      ['skills', 'skills'],
      ['skill-effects', 'skill-effects'],
      ['skill-json', 'skill-json'],
      ['code-analysis', 'code-analysis'],
      ['damage', 'damage'],
      ['comparison', 'comparison'],
      ['enemies', 'enemies'],
      ['enemy-analysis', 'enemy-analysis'],
      ['goldenglow-home', 'goldenglow-home'],
      ['slide-maker', 'slide-maker'],
      ['sources', 'sources'],
    ],
  )
  assert.equal(new Set(APP_NAV_ITEMS.map((item) => item.href)).size, APP_NAV_ITEMS.length)
})

test('比較ページのhashを解析する', () => {
  assert.deepEqual(parseHashRoute('#/comparison'), { view: 'comparison' })
})

test('スライド作成はアプリ内の独立したページとしてメニューから開く', () => {
  assert.deepEqual(parseHashRoute('#/slide-maker'), { view: 'slide-maker' })
  assert.deepEqual(APP_NAV_ITEMS.find((item) => item.id === 'slide-maker'), {
    id: 'slide-maker',
    href: '#/slide-maker',
    label: 'スライド作成',
    description: '画像と字幕から解説用スライドを作成',
    section: 'information',
  })
  assert.deepEqual(parseHashRoute('#/slide-maker/extra'), { view: 'operators' })
})

test('GGの専用トップはサイドバーの入口を一つにまとめる', () => {
  assert.deepEqual(parseHashRoute('#/analysis/goldenglow'), { view: 'goldenglow-home' })
  assert.deepEqual(APP_NAV_ITEMS.filter((item) => item.section === 'operator-analysis'), [
    {
      id: 'goldenglow-home',
      href: '#/analysis/goldenglow',
      label: 'ゴールデングロー',
      description: 'スキルダメージ・爆発・ターゲット切替',
      section: 'operator-analysis',
    },
  ])
})

test('GGの専用トップから各分析を個別のhashで開く', () => {
  assert.deepEqual(
    GOLDENGLOW_ANALYSIS_ITEMS.map(({ id, href, label, description, section }) => [
      id, href, label, description, section, parseHashRoute(href).view,
    ]),
    [
      ['goldenglow-performance', '#/analysis/goldenglow/performance', 'スキルダメージ比較', 'モジュール・潜在比較', 'operator-analysis', 'goldenglow-performance'],
      ['goldenglow-guide', '#/analysis/goldenglow/explosion', '爆発分析', '爆発確率・期待値', 'operator-analysis', 'goldenglow-guide'],
      ['goldenglow-target-switch', '#/analysis/goldenglow/target-switch', 'ターゲット切替', '敵HP・切替時間', 'operator-analysis', 'goldenglow-target-switch'],
      ['goldenglow-target-switch-two', '#/analysis/goldenglow/target-switch-2', 'ターゲット切替2', '敵HP・スキル総ダメージ', 'operator-analysis', 'goldenglow-target-switch-two'],
      ['goldenglow-single-trial', '#/analysis/goldenglow/single-trial', '単発シミュレーション', '', 'operator-analysis', 'goldenglow-single-trial'],
    ],
  )
})

test('GGの既存の分析URLを引き続き開ける', () => {
  const routes = [
    ['#/analysis/goldenglow-performance', 'goldenglow-performance'],
    ['#/guides/goldenglow-explosion', 'goldenglow-guide'],
    ['#/analysis/goldenglow-target-switch', 'goldenglow-target-switch'],
  ] as const

  for (const [hash, view] of routes) {
    assert.deepEqual(parseHashRoute(hash), { view })
    for (const suffix of ['/', '/extra', '?skill=3']) {
      assert.deepEqual(parseHashRoute(`${hash}${suffix}`), { view: 'operators' })
    }
  }
})

test('GGの不正な専用ページURLを分析ページと誤認しない', () => {
  const hashes = [
    '#/analysis/goldenglow',
    ...GOLDENGLOW_ANALYSIS_ITEMS.map((item) => item.href),
  ]
  for (const hash of hashes) {
    for (const suffix of ['/', '/extra', '?skill=3']) {
      assert.deepEqual(parseHashRoute(`${hash}${suffix}`), { view: 'operators' })
    }
  }
  for (const suffix of ['unknown', '%E0%A4%A', 'performance-extra']) {
    assert.deepEqual(parseHashRoute(`#/analysis/goldenglow/${suffix}`), { view: 'operators' })
  }
})

test('GGの専用ページとオペレーター詳細のURLは区別する', () => {
  assert.deepEqual(parseHashRoute('#/operators/char_377_gdglow'), {
    view: 'operator-detail',
    operatorId: 'char_377_gdglow',
  })
  assert.deepEqual(parseHashRoute('#/operators/goldenglow'), {
    view: 'operator-detail',
    operatorId: 'goldenglow',
  })
  assert.deepEqual(parseHashRoute('#/operators/char_377_gdglow/performance'), { view: 'operators' })
})

test('オペレーターデータベースのhashを解析する', () => {
  assert.deepEqual(parseHashRoute('#/operators'), { view: 'operators' })
})

test('オペレーター詳細のhashを解析する', () => {
  assert.deepEqual(parseHashRoute('#/operators/char_456_ash'), {
    view: 'operator-detail',
    operatorId: 'char_456_ash',
  })
  assert.deepEqual(parseHashRoute('#/operators/%E3%82%A2%E3%83%BC%E3%82%AF%2F%E3%83%8A%E3%82%A4%E3%83%84'), {
    view: 'operator-detail',
    operatorId: 'アーク/ナイツ',
  })
})

test('オペレーター詳細のhashを生成する', () => {
  assert.equal(createOperatorDetailHash('char_456_ash'), '#/operators/char_456_ash')
  assert.equal(createOperatorDetailHash('char_456_ash', {}), '#/operators/char_456_ash')
  assert.equal(
    createOperatorDetailHash('アーク/ナイツ'),
    '#/operators/%E3%82%A2%E3%83%BC%E3%82%AF%2F%E3%83%8A%E3%82%A4%E3%83%84',
  )
})

test('GGトップから開くオペレーター詳細はURLだけで参照元を復元する', () => {
  const hash = createOperatorDetailHash('char_377_gdglow', { source: 'goldenglow-home' })

  assert.equal(hash, '#/operators/char_377_gdglow?from=goldenglow')
  assert.deepEqual(parseHashRoute(hash), {
    view: 'operator-detail',
    operatorId: 'char_377_gdglow',
    source: 'goldenglow-home',
  })
  assert.deepEqual(parseHashRoute(createOperatorDetailHash('char_377_gdglow')), {
    view: 'operator-detail',
    operatorId: 'char_377_gdglow',
  })
})

test('オペレーター詳細の未知・不正・重複した参照元は通常の詳細表示として扱う', () => {
  const queries = [
    '',
    'from',
    'from=',
    'from=unknown',
    'from=Goldenglow',
    'from=goldenglow%20',
    'from=%E0%A4%A',
    'from=goldenglow&from=goldenglow',
    'from=goldenglow&from=unknown',
    'from=unknown&from=goldenglow',
    'from=goldenglow&%66rom=goldenglow',
    'from=https%3A%2F%2Fexample.com%2F',
    'returnTo=https%3A%2F%2Fexample.com%2F',
  ]

  for (const query of queries) {
    assert.deepEqual(parseHashRoute(`#/operators/char_377_gdglow?${query}`), {
      view: 'operator-detail',
      operatorId: 'char_377_gdglow',
    }, query)
  }
})

test('オペレーターID内の符号化された区切り文字を参照元のクエリと混同しない', () => {
  for (const operatorId of ['アーク/ナイツ', 'char?from=goldenglow', 'char/?from=other&from=goldenglow#%']) {
    assert.deepEqual(parseHashRoute(createOperatorDetailHash(operatorId)), {
      view: 'operator-detail',
      operatorId,
    })
    assert.deepEqual(parseHashRoute(createOperatorDetailHash(operatorId, { source: 'goldenglow-home' })), {
      view: 'operator-detail',
      operatorId,
      source: 'goldenglow-home',
    })
  }
})

test('不正なオペレーター詳細のhashはデータベースへフォールバックする', () => {
  assert.deepEqual(parseHashRoute('#/operators/'), { view: 'operators' })
  assert.deepEqual(parseHashRoute('#/operators/char_test/extra'), { view: 'operators' })
  assert.deepEqual(parseHashRoute('#/operators/%E0%A4%A'), { view: 'operators' })
  assert.deepEqual(parseHashRoute('#/operators/?from=goldenglow'), { view: 'operators' })
  assert.deepEqual(parseHashRoute('#/operators/char_test/extra?from=goldenglow'), { view: 'operators' })
  assert.deepEqual(parseHashRoute('#/operators/%E0%A4%A?from=goldenglow'), { view: 'operators' })
})

test('削除済みのスキル分類ページのhashはデータベースへ戻す', () => {
  assert.deepEqual(parseHashRoute('#/operators/skills/char_test%3Askill_1'), { view: 'operators' })
  assert.deepEqual(parseHashRoute('#/operators/skills/%E0%A4%A'), { view: 'operators' })
  assert.deepEqual(parseHashRoute('#/skills/char_test%3Askill_1'), { view: 'operators' })
  assert.deepEqual(parseHashRoute('#/skills/%E0%A4%A'), { view: 'operators' })
})

test('敵データベースの既存URLを維持し、統計分析は独立したURLで開く', () => {
  assert.deepEqual(parseHashRoute('#/enemies'), { view: 'enemies' })
  assert.deepEqual(parseHashRoute('#/analysis/enemies'), { view: 'enemy-analysis' })

  const databaseIndex = APP_NAV_ITEMS.findIndex((item) => item.id === 'enemies')
  assert.ok(databaseIndex >= 0)
  assert.deepEqual(
    APP_NAV_ITEMS.slice(databaseIndex, databaseIndex + 2).map(({ id, href, label, section }) => ({ id, href, label, section })),
    [
      { id: 'enemies', href: '#/enemies', label: '敵データベース', section: 'analysis' },
      { id: 'enemy-analysis', href: '#/analysis/enemies', label: '敵の統計分析', section: 'analysis' },
    ],
  )
})

test('敵の各ページの不正なURLはデータベースへフォールバックする', () => {
  for (const hash of ['#/enemies', '#/analysis/enemies']) {
    for (const suffix of ['/', '/extra', '?enemy=001', '-extra']) {
      assert.deepEqual(parseHashRoute(`${hash}${suffix}`), { view: 'operators' })
    }
  }
})

test('全スキル一覧ページのhashを解析する', () => {
  assert.deepEqual(parseHashRoute('#/skills'), { view: 'skills' })
})

test('スキル効果解析ページは全スキル一覧とは独立したhashで開く', () => {
  assert.deepEqual(parseHashRoute('#/skill-effects'), { view: 'skill-effects' })
  assert.deepEqual(parseHashRoute('#/skill-effects/extra'), { view: 'operators' })
})

test('スキル効果解析の共有hashは選択したスキルとレベルを復元する', () => {
  const selections: SkillEffectsRouteSelection[] = [
    { operatorId: 'char_test', skillIndex: 1, skillId: 'skill_test', levelIndex: 0 },
    {
      operatorId: 'char/日本',
      skillIndex: 2,
      skillId: 'skchr_test[2]&mode=1',
      levelIndex: 9,
    },
  ]

  for (const selection of selections) {
    const hash = createSkillEffectsHash(selection)
    assert.ok(hash.startsWith('#/skill-effects?'))
    assert.deepEqual(parseHashRoute(hash), { view: 'skill-effects', selection })
  }
})

test('スキル効果解析の不完全・不正・重複した選択指定は解析ページへ戻す', () => {
  const selection = {
    operatorId: 'char_test',
    skillIndex: '1',
    skillId: 'skill_test',
    levelIndex: '0',
  }
  const invalidValues = {
    operatorId: ['', ' char_test', 'char_test ', '\u0000char', 'x'.repeat(257), '\ufffd'],
    skillId: ['', ' skill_test', 'skill_test ', 'skill\u007f', 'x'.repeat(257), '\ufffd'],
    skillIndex: ['0', '-1', '1.5', '01', 'NaN', '9007199254740992'],
    levelIndex: ['-1', '0.5', '01', 'NaN', '9007199254740992'],
  }
  const base = { view: 'skill-effects' }

  assert.deepEqual(parseHashRoute('#/skill-effects?'), base)
  for (const key of Object.keys(selection) as (keyof typeof selection)[]) {
    const missing = new URLSearchParams(selection)
    missing.delete(key)
    assert.deepEqual(parseHashRoute(`#/skill-effects?${missing}`), base, `missing ${key}`)

    const duplicate = new URLSearchParams(selection)
    duplicate.append(key, selection[key])
    assert.deepEqual(parseHashRoute(`#/skill-effects?${duplicate}`), base, `duplicate ${key}`)

    for (const value of invalidValues[key]) {
      const invalid = new URLSearchParams(selection)
      invalid.set(key, value)
      assert.deepEqual(parseHashRoute(`#/skill-effects?${invalid}`), base, `${key}=${JSON.stringify(value)}`)
    }
  }
})

test('スキル効果解析の共有hash生成は無効なIDと選択番号を拒否する', () => {
  const selection: SkillEffectsRouteSelection = {
    operatorId: 'char_test', skillIndex: 1, skillId: 'skill_test', levelIndex: 0,
  }

  for (const key of ['operatorId', 'skillId'] as const) {
    for (const value of ['', ' leading', 'trailing ', '\u0000', 'x'.repeat(257)]) {
      assert.throws(() => createSkillEffectsHash({ ...selection, [key]: value }), TypeError)
    }
  }
  for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createSkillEffectsHash({ ...selection, skillIndex: value }), RangeError)
  }
  for (const value of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createSkillEffectsHash({ ...selection, levelIndex: value }), RangeError)
  }
})

test('Skill JSONページのhashを解析する', () => {
  assert.deepEqual(parseHashRoute('#/skill-json'), { view: 'skill-json' })
  assert.deepEqual(parseHashRoute('#/skill-json/extra'), { view: 'operators' })
})

test('Skill JSONキー一覧ページのhashを解析する', () => {
  assert.deepEqual(parseHashRoute('#/skill-json/overview'), { view: 'skill-json-overview' })
  assert.deepEqual(parseHashRoute('#/skill-json/overview/extra'), { view: 'operators' })
})

test('Skill JSON個別分析の共有hashを生成・解析する', () => {
  const selection = {
    operatorId: 'char/日本',
    skillIndex: 2,
    skillId: 'skchr_test[2]&mode=1',
    levelIndex: 9,
  }
  const hash = createSkillJsonHash(selection)

  assert.equal(
    hash,
    '#/skill-json?operatorId=char%2F%E6%97%A5%E6%9C%AC&skillIndex=2&skillId=skchr_test%5B2%5D%26mode%3D1&levelIndex=9',
  )
  assert.deepEqual(parseHashRoute(hash), { view: 'skill-json', selection })
})

test('Skill JSON個別分析は完全で一意な選択指定だけを採用する', () => {
  const base = { view: 'skill-json' }

  assert.deepEqual(
    parseHashRoute('#/skill-json?operatorId=char_test&skillIndex=1&skillId=skill_test'),
    base,
  )
  assert.deepEqual(
    parseHashRoute('#/skill-json?operatorId=char_test&skillIndex=0&skillId=skill_test&levelIndex=0'),
    base,
  )
  assert.deepEqual(
    parseHashRoute('#/skill-json?operatorId=char_test&skillIndex=1.5&skillId=skill_test&levelIndex=0'),
    base,
  )
  assert.deepEqual(
    parseHashRoute('#/skill-json?operatorId=char_a&operatorId=char_b&skillIndex=1&skillId=skill_test&levelIndex=0'),
    base,
  )
})

test('Skill JSON個別分析のhash生成は不正な選択値を拒否する', () => {
  assert.throws(
    () => createSkillJsonHash({ operatorId: '', skillIndex: 1, skillId: 'skill', levelIndex: 0 }),
    TypeError,
  )
  assert.throws(
    () => createSkillJsonHash({ operatorId: 'char', skillIndex: 0, skillId: 'skill', levelIndex: 0 }),
    RangeError,
  )
  assert.throws(
    () => createSkillJsonHash({ operatorId: 'char', skillIndex: 1, skillId: 'skill', levelIndex: -1 }),
    RangeError,
  )
})

test('参照元ページのhashを解析する', () => {
  assert.deepEqual(parseHashRoute('#/sources'), { view: 'sources' })
})

test('ホームと不明なhashはデータベースへフォールバックする', () => {
  assert.deepEqual(parseHashRoute('#/damage'), { view: 'damage' })
  assert.deepEqual(parseHashRoute(''), { view: 'operators' })
  assert.deepEqual(parseHashRoute('#/'), { view: 'operators' })
  assert.deepEqual(parseHashRoute('#/unknown'), { view: 'operators' })
})
