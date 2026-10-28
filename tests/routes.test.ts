import test from 'node:test'
import assert from 'node:assert/strict'
import { APP_NAV_ITEMS, DAMAGE_VERIFICATION_ITEM, GOLDENGLOW_ANALYSIS_ITEMS, SKILL_LEARNING_ITEMS, SURTR_ANALYSIS_ITEMS, SURTR_HOME_ITEMS, SURTR_HOME_LINK } from '../src/lib/navigation.ts'
import {
  createDamageCalculatorThreeHash,
  createOperatorDetailHash,
  createSkillEffectsHash,
  createSkillSummaryHash,
  createSkillStructureHash,
  createTalentStructureHash,
  createTraitStructureHash,
  createSkillJsonHash,
  parseHashRoute,
  type SkillEffectsRouteSelection,
} from '../src/lib/routes.ts'

test('メイン敵ステータス推移は敵分析用の独立ページとして開く', () => {
  assert.deepEqual(parseHashRoute('#/analysis/enemies/main-trends'), { view: 'main-enemy-trends' })
  assert.equal(APP_NAV_ITEMS.find((item) => item.id === 'main-enemy-trends')?.href, '#/analysis/enemies/main-trends')
  assert.deepEqual(parseHashRoute('#/analysis/enemies/main-trends/extra'), { view: 'operators' })
  assert.deepEqual(parseHashRoute('#/analysis/enemies'), { view: 'enemy-analysis' })
})

test('敵の重回帰分析を統計分析の隣の導線から独立したページとして開く', () => {
  assert.deepEqual(parseHashRoute('#/analysis/enemies/regression'), { view: 'enemy-regression' })
  assert.deepEqual(parseHashRoute('#/analysis/enemies'), { view: 'enemy-analysis' })
  const analysisIndex = APP_NAV_ITEMS.findIndex((item) => item.id === 'enemy-analysis')
  assert.deepEqual(APP_NAV_ITEMS[analysisIndex + 1], {
    id: 'enemy-regression', href: '#/analysis/enemies/regression', label: '敵の重回帰分析',
    description: '', section: 'analysis',
  })
  for (const suffix of ['/', '/extra', '?enemy=001', '-extra']) {
    assert.deepEqual(parseHashRoute(`#/analysis/enemies/regression${suffix}`), { view: 'operators' })
  }
})

test('集計マップ確認は敵分析用の独立ページとして開く', () => {
  assert.deepEqual(parseHashRoute('#/analysis/enemies/maps'), { view: 'enemy-map-coverage' })
  assert.deepEqual(APP_NAV_ITEMS.find((item) => item.id === 'enemy-map-coverage'), {
    id: 'enemy-map-coverage', href: '#/analysis/enemies/maps', label: '集計マップ確認',
    description: '', section: 'analysis',
  })
  assert.deepEqual(parseHashRoute('#/analysis/enemies'), { view: 'enemy-analysis' })
  assert.deepEqual(parseHashRoute('#/maps'), { view: 'maps' })
  for (const suffix of ['/', '/extra', '?map=1-7', '-extra']) {
    assert.deepEqual(parseHashRoute(`#/analysis/enemies/maps${suffix}`), { view: 'operators' })
  }
})

test('集計版を含むURLの直接アクセスでも敵統計と集計マップ確認を開く', () => {
  const routes = [
    ['#/analysis/enemies', 'enemy-analysis'],
    ['#/analysis/enemies/maps', 'enemy-map-coverage'],
  ] as const
  for (const [path, view] of routes) {
    for (const query of [
      'aggregationVersion=v4',
      'aggregationVersion=v1',
      'aggregationVersion=%76%34',
      'filter=all&aggregationVersion=v4',
      'aggregationVersion=v4&filter=all',
      'aggregationVersion=unknown',
      'aggregationVersion=',
    ]) {
      assert.deepEqual(parseHashRoute(`${path}?${query}`), { view })
    }
    for (const suffix of ['/', '/extra', '-extra']) {
      assert.deepEqual(parseHashRoute(`${path}${suffix}?aggregationVersion=v4`), { view: 'operators' })
    }
    assert.deepEqual(parseHashRoute(`${path}?unrelated=v4`), { view: 'operators' })
  }
  assert.deepEqual(parseHashRoute('#/maps?aggregationVersion=v4'), { view: 'operators' })
})

test('オペレーター主成分分析は図鑑の隣から独立したページとして開く', () => {
  assert.deepEqual(parseHashRoute('#/analysis/operators/pca'), { view: 'operator-pca' })
  assert.deepEqual(parseHashRoute('#/operators'), { view: 'operators' })
  const databaseIndex = APP_NAV_ITEMS.findIndex((item) => item.id === 'operators')
  assert.deepEqual(APP_NAV_ITEMS[databaseIndex + 1], {
    id: 'operator-pca', href: '#/analysis/operators/pca', label: 'オペレーター主成分分析',
    description: '', section: 'analysis',
  })
  for (const suffix of ['/', '/extra', '?operator=char_test', '-extra']) {
    assert.deepEqual(parseHashRoute(`#/analysis/operators/pca${suffix}`), { view: 'operators' })
  }
})

test('サイドバーから主要ページへ遷移できる', () => {
  assert.deepEqual(
    APP_NAV_ITEMS.map((item) => [item.id, parseHashRoute(item.href).view]),
    [
      ['operators', 'operators'],
      ['operator-pca', 'operator-pca'],
      ['skills', 'skills'],
      ['skill-classification', 'skill-classification'],
      ['talent-classification', 'talent-classification'],
      ['trait-classification', 'trait-classification'],
      ['trait-structure', 'trait-structure'],
      ['talent-structure', 'talent-structure'],
      ['skill-effects', 'skill-effects'],
      ['skill-summary', 'skill-summary'],
      ['skill-structure', 'skill-structure'],
      ['skill-json', 'skill-json'],
      ['skill-kmeans', 'skill-kmeans'],
      ['skill-hdbscan', 'skill-hdbscan'],
      ['skill-hierarchical', 'skill-hierarchical'],
      ['code-analysis', 'code-analysis'],
      ['damage', 'damage'],
      ['damage-two', 'damage-two'],
      ['damage-three', 'damage-three'],
      ['damage-three-coverage', 'damage-three-coverage'],
      ['damage-verification', 'damage-verification'],
      ['comparison', 'comparison'],
      ['enemies', 'enemies'],
      ['enemy-analysis', 'enemy-analysis'],
      ['enemy-regression', 'enemy-regression'],
      ['enemy-map-coverage', 'enemy-map-coverage'],
      ['main-enemy-trends', 'main-enemy-trends'],
      ['roguelike', 'roguelike'],
      ['maps', 'maps'],
      ['goldenglow-home', 'goldenglow-home'],
      ['surtr-home', 'surtr-home'],
      ['slide-maker', 'slide-maker'],
      ['sources', 'sources'],
    ],
  )
  assert.equal(new Set(APP_NAV_ITEMS.map((item) => item.href)).size, APP_NAV_ITEMS.length)
})

test('比較ページのhashを解析する', () => {
  assert.deepEqual(parseHashRoute('#/comparison'), { view: 'comparison' })
})

test('K-means 学習ラボは専用ページとしてスキル分析から開く', () => {
  assert.deepEqual(parseHashRoute('#/analysis/skills/kmeans'), { view: 'skill-kmeans' })
  assert.deepEqual(APP_NAV_ITEMS.find((item) => item.id === 'skill-kmeans'), {
    id: 'skill-kmeans',
    href: '#/analysis/skills/kmeans',
    label: 'K-means 学習ラボ',
    description: '',
    section: 'analysis',
  })
  assert.deepEqual(parseHashRoute('#/skills'), { view: 'skills' })
  assert.deepEqual(parseHashRoute('#/skill-classification'), { view: 'skill-classification' })
  for (const suffix of ['/', '/extra', '?k=3', '-extra']) {
    assert.deepEqual(parseHashRoute(`#/analysis/skills/kmeans${suffix}`), { view: 'operators' })
  }
})

test('階層クラスタリングはK-meansと共通のスキル学習導線から独立したページを開く', () => {
  const hierarchy = APP_NAV_ITEMS.find((item) => item.id === 'skill-hierarchical')
  assert.deepEqual(hierarchy, {
    id: 'skill-hierarchical', href: '#/analysis/skills/hierarchical', label: '階層クラスタリング 学習ラボ',
    description: '', section: 'analysis',
  })
  assert.deepEqual(SKILL_LEARNING_ITEMS.map(({ id, href }) => [id, parseHashRoute(href).view]), [
    ['skill-kmeans', 'skill-kmeans'],
    ['skill-hdbscan', 'skill-hdbscan'],
    ['skill-hierarchical', 'skill-hierarchical'],
  ])
  assert.equal(SKILL_LEARNING_ITEMS[2], hierarchy)
  for (const suffix of ['/', '/extra', '?k=3', '-extra']) {
    assert.deepEqual(parseHashRoute(`#/analysis/skills/hierarchical${suffix}`), { view: 'operators' })
  }
})

test('HDBSCAN 学習ラボはK-meansと独立したページとして開く', () => {
  assert.deepEqual(parseHashRoute('#/analysis/skills/hdbscan'), { view: 'skill-hdbscan' })
  const index = APP_NAV_ITEMS.findIndex(item => item.id === 'skill-kmeans')
  assert.deepEqual(APP_NAV_ITEMS[index + 1], {
    id: 'skill-hdbscan', href: '#/analysis/skills/hdbscan', label: 'HDBSCAN 学習ラボ',
    description: '', section: 'analysis',
  })
  assert.deepEqual(parseHashRoute('#/analysis/skills/kmeans'), { view: 'skill-kmeans' })
  for (const suffix of ['/', '/extra', '?min=10', '-extra']) {
    assert.deepEqual(parseHashRoute(`#/analysis/skills/hdbscan${suffix}`), { view: 'operators' })
  }
})

test('スキル大分類は専用ページとして開き、既存スキル一覧を維持する', () => {
  assert.deepEqual(parseHashRoute('#/skill-classification'), { view: 'skill-classification' })
  assert.deepEqual(parseHashRoute('#/skills'), { view: 'skills' })
  assert.deepEqual(parseHashRoute('#/skill-classification/extra'), { view: 'operators' })
})

test('素質大分類はスキル大分類の隣から独立したページとして開く', () => {
  assert.deepEqual(parseHashRoute('#/talent-classification'), { view: 'talent-classification' })
  const skillIndex = APP_NAV_ITEMS.findIndex((item) => item.id === 'skill-classification')
  assert.deepEqual(APP_NAV_ITEMS[skillIndex + 1], {
    id: 'talent-classification', href: '#/talent-classification', label: '素質大分類', description: '', section: 'analysis',
  })
  for (const suffix of ['/', '/extra', '-extra']) {
    assert.deepEqual(parseHashRoute(`#/talent-classification${suffix}`), { view: 'operators' })
  }
})

test('特性大分類は素質大分類の隣から独立したページとして開く', () => {
  assert.deepEqual(parseHashRoute('#/trait-classification'), { view: 'trait-classification' })
  const talentIndex = APP_NAV_ITEMS.findIndex((item) => item.id === 'talent-classification')
  assert.deepEqual(APP_NAV_ITEMS[talentIndex + 1], {
    id: 'trait-classification', href: '#/trait-classification', label: '特性大分類', description: '', section: 'analysis',
  })
  for (const suffix of ['/', '/extra', '?operatorId=char_test', '-extra']) {
    assert.deepEqual(parseHashRoute(`#/trait-classification${suffix}`), { view: 'operators' })
  }
})

test('特性構造は特性大分類の隣から独立したページとして開く', () => {
  assert.deepEqual(parseHashRoute('#/trait-structure'), { view: 'trait-structure' })
  const index = APP_NAV_ITEMS.findIndex(item => item.id === 'trait-classification')
  assert.deepEqual(APP_NAV_ITEMS[index + 1], {
    id: 'trait-structure', href: '#/trait-structure', label: '特性構造', description: '', section: 'analysis',
  })
  for (const suffix of ['/', '/extra', '-extra']) {
    assert.deepEqual(parseHashRoute(`#/trait-structure${suffix}`), { view: 'operators' })
  }
})

test('特性構造の共有URLは符号化されたIDを含むオペレーターを復元する', () => {
  for (const operatorId of ['char_350_surtr', 'char/日本&test=1', 'char?operatorId=other#%', 'x'.repeat(256)]) {
    const selection = { operatorId }
    const hash = createTraitStructureHash(selection)
    assert.deepEqual(parseHashRoute(hash), { view: 'trait-structure', selection })
    assert.equal(new URLSearchParams(hash.split('?')[1]).size, 1)
  }
  assert.equal(createTraitStructureHash({ operatorId: 'char/日本&test=1' }),
    '#/trait-structure?operatorId=char%2F%E6%97%A5%E6%9C%AC%26test%3D1')
})

test('特性構造の空・不正・重複したOP指定は選択エラーとして保持する', () => {
  for (const query of [
    'operatorId', 'operatorId=', 'operatorId=%E0%A4%A', 'operatorId=%EF%BF%BD',
    'operatorId=x&operatorId=y', 'operatorId=x&operatorId=x', 'operatorId=x&%6FperatorId=x',
    ...[' x', 'x ', '\u0000x', 'x\u007f', 'x'.repeat(257)].map(operatorId => new URLSearchParams({ operatorId }).toString()),
  ]) {
    assert.deepEqual(parseHashRoute(`#/trait-structure?${query}`), {
      view: 'trait-structure', invalidSelection: true,
    }, query)
  }
  for (const query of ['', 'unknown=1']) {
    assert.deepEqual(parseHashRoute(`#/trait-structure?${query}`), { view: 'trait-structure' })
  }
})

test('特性構造のURL生成は無効なIDを拒否する', () => {
  for (const operatorId of ['', ' x', 'x ', '\u0000', 'x\u007f', '\uFFFD', 'x'.repeat(257)]) {
    assert.throws(() => createTraitStructureHash({ operatorId }), TypeError)
  }
})

test('素質構造は特性構造の後から開き、素質番号を共有URLで復元する', () => {
  assert.deepEqual(parseHashRoute('#/talent-structure'), { view: 'talent-structure' })
  const index = APP_NAV_ITEMS.findIndex(item => item.id === 'trait-structure')
  assert.deepEqual(APP_NAV_ITEMS[index + 1], {
    id: 'talent-structure', href: '#/talent-structure', label: '素質構造', description: '', section: 'analysis',
  })
  const selection = { operatorId: 'char/日本&test=1', talentIndex: 1 }
  const hash = createTalentStructureHash(selection)
  assert.deepEqual(parseHashRoute(hash), { view: 'talent-structure', selection })
  assert.match(hash, /operatorId=char%2F/)
  assert.deepEqual(parseHashRoute(createTalentStructureHash({ operatorId: 'char_350_surtr', talentIndex: 0 })), {
    view: 'talent-structure', selection: { operatorId: 'char_350_surtr', talentIndex: 0 },
  })
  for (const suffix of ['/', '/extra', '-extra']) {
    assert.deepEqual(parseHashRoute(`#/talent-structure${suffix}`), { view: 'operators' })
  }
})

test('素質構造の不完全・不正な指定は選択エラーとして保持し、初期素質で代用しない', () => {
  for (const query of [
    'operatorId=char_350_surtr', 'talentIndex=0', 'operatorId=&talentIndex=0',
    'operatorId=%E0%A4%A&talentIndex=0',
    'operatorId=x&operatorId=y&talentIndex=0', 'operatorId=x&talentIndex=0&talentIndex=1',
    ...['-1', '1.5', '1e0', '01', 'Infinity', '9007199254740992'].map(index => `operatorId=x&talentIndex=${index}`),
  ]) {
    assert.deepEqual(parseHashRoute(`#/talent-structure?${query}`), {
      view: 'talent-structure', invalidSelection: true,
    }, query)
  }
  for (const query of ['', 'unknown=1']) {
    assert.deepEqual(parseHashRoute(`#/talent-structure?${query}`), { view: 'talent-structure' })
  }
})

test('素質構造のURL生成は無効なIDと素質番号を拒否する', () => {
  for (const operatorId of ['', ' x', 'x\n', '\uFFFD']) {
    assert.throws(() => createTalentStructureHash({ operatorId, talentIndex: 0 }), TypeError)
  }
  for (const talentIndex of [-1, 0.5, NaN, Infinity]) {
    assert.throws(() => createTalentStructureHash({ operatorId: 'x', talentIndex }), RangeError)
  }
})

test('スキル効果の分解のURLはスキルとレベルを復元し、不正な選択を拒否する', () => {
  assert.deepEqual(parseHashRoute('#/skill-summary'), { view: 'skill-summary' })
  const selection = { operatorId: 'char_456_ash', skillId: 'skchr_ash_2', skillIndex: 2, levelIndex: 9 }
  assert.deepEqual(parseHashRoute(createSkillSummaryHash(selection)), { view: 'skill-summary', selection })
  assert.deepEqual(parseHashRoute('#/skill-summary?operatorId=x&skillId=x&skillIndex=2&levelIndex=-1'), { view: 'skill-summary' })
  assert.deepEqual(parseHashRoute('#/skill-summary/extra'), { view: 'operators' })
})

test('スキル構造は専用ページとして開き、スキル効果の分解の隣から移動できる', () => {
  assert.deepEqual(parseHashRoute('#/skill-structure'), { view: 'skill-structure' })
  const summaryIndex = APP_NAV_ITEMS.findIndex((item) => item.id === 'skill-summary')
  assert.deepEqual(APP_NAV_ITEMS[summaryIndex + 1], {
    id: 'skill-structure', href: '#/skill-structure', label: 'スキル構造', description: '', section: 'analysis',
  })
  for (const suffix of ['/', '/extra', '-extra']) {
    assert.deepEqual(parseHashRoute(`#/skill-structure${suffix}`), { view: 'operators' })
  }
})

test('スキル構造の共有URLは符号化されたIDを含むスキルとレベルを復元する', () => {
  const selection = {
    operatorId: 'char/日本', skillIndex: 2, skillId: 'skchr_test[2]&mode=1', levelIndex: 9,
  }
  const hash = createSkillStructureHash(selection)
  assert.equal(hash, '#/skill-structure?operatorId=char%2F%E6%97%A5%E6%9C%AC&skillIndex=2&skillId=skchr_test%5B2%5D%26mode%3D1&levelIndex=9')
  assert.deepEqual(parseHashRoute(hash), { view: 'skill-structure', selection })
})

test('スキル構造の不完全・不正・重複した選択指定は選択なしのページへ戻す', () => {
  const selection = { operatorId: 'char_test', skillIndex: '1', skillId: 'skill_test', levelIndex: '0' }
  const invalidValues = {
    operatorId: ['', ' char_test', 'char_test ', '\u0000char', 'x'.repeat(257), '\ufffd'],
    skillId: ['', ' skill_test', 'skill_test ', 'skill\u007f', 'x'.repeat(257), '\ufffd'],
    skillIndex: ['0', '-1', '1.5', '01', 'NaN', '9007199254740992'],
    levelIndex: ['-1', '0.5', '01', 'NaN', '9007199254740992'],
  }
  const base = { view: 'skill-structure' }
  assert.deepEqual(parseHashRoute('#/skill-structure?'), base)
  assert.deepEqual(parseHashRoute('#/skill-structure?unknown=value'), base)
  assert.deepEqual(parseHashRoute('#/skill-structure?operatorId=%E0%A4%A&skillIndex=1&skillId=x&levelIndex=0'), base)
  for (const key of Object.keys(selection) as (keyof typeof selection)[]) {
    const missing = new URLSearchParams(selection)
    missing.delete(key)
    assert.deepEqual(parseHashRoute(`#/skill-structure?${missing}`), base, `missing ${key}`)
    const duplicate = new URLSearchParams(selection)
    duplicate.append(key, selection[key])
    assert.deepEqual(parseHashRoute(`#/skill-structure?${duplicate}`), base, `duplicate ${key}`)
    for (const value of invalidValues[key]) {
      const invalid = new URLSearchParams(selection)
      invalid.set(key, value)
      assert.deepEqual(parseHashRoute(`#/skill-structure?${invalid}`), base, `${key}=${JSON.stringify(value)}`)
    }
  }
})

test('スキル構造の共有URL生成は無効なIDと選択番号を拒否する', () => {
  const selection = { operatorId: 'char_test', skillIndex: 1, skillId: 'skill_test', levelIndex: 0 }
  for (const key of ['operatorId', 'skillId'] as const) {
    for (const value of ['', ' leading', 'trailing ', '\u0000', 'x'.repeat(257)]) {
      assert.throws(() => createSkillStructureHash({ ...selection, [key]: value }), TypeError)
    }
  }
  for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createSkillStructureHash({ ...selection, skillIndex: value }), RangeError)
  }
  for (const value of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createSkillStructureHash({ ...selection, levelIndex: value }), RangeError)
  }
})

test('Damage Calculator 2は既存の計算機と別のURLで開く', () => {
  assert.deepEqual(parseHashRoute('#/damage'), { view: 'damage' })
  assert.deepEqual(parseHashRoute('#/damage-2'), { view: 'damage-two' })
  const calculatorIndex = APP_NAV_ITEMS.findIndex((item) => item.id === 'damage')
  assert.deepEqual(APP_NAV_ITEMS[calculatorIndex + 1], {
    id: 'damage-two',
    href: '#/damage-2',
    label: 'Damage Calculator 2',
    description: 'ダメージ・DPSテーブル',
    section: 'analysis',
  })
  for (const suffix of ['/', '/extra', '?operatorId=char_350_surtr', '-extra']) {
    assert.deepEqual(parseHashRoute(`#/damage-2${suffix}`), { view: 'operators' })
  }
})

test('Damage Calculator 3は計算機2の隣から独立したURLで開く', () => {
  assert.deepEqual(parseHashRoute('#/damage-3'), { view: 'damage-three' })
  const calculatorIndex = APP_NAV_ITEMS.findIndex((item) => item.id === 'damage-two')
  assert.deepEqual(APP_NAV_ITEMS[calculatorIndex + 1], {
    id: 'damage-three',
    href: '#/damage-3',
    label: 'Damage Calculator 3',
    description: 'スキル構造からダメージ・DPSを計算',
    section: 'analysis',
  })
  for (const suffix of ['/', '/extra', '-extra']) {
    assert.deepEqual(parseHashRoute(`#/damage-3${suffix}`), { view: 'operators' })
  }
})

test('DC3 実装範囲は計算機3の隣から独立したページとして開く', () => {
  assert.deepEqual(parseHashRoute('#/damage-3/coverage'), { view: 'damage-three-coverage' })
  const calculatorIndex = APP_NAV_ITEMS.findIndex(item => item.id === 'damage-three')
  assert.deepEqual(APP_NAV_ITEMS[calculatorIndex + 1], {
    id: 'damage-three-coverage', href: '#/damage-3/coverage', label: 'DC3 実装範囲',
    description: '', section: 'analysis',
  })
  for (const suffix of ['/', '/extra', '?operatorId=char_350_surtr', '-extra']) {
    assert.deepEqual(parseHashRoute(`#/damage-3/coverage${suffix}`), { view: 'operators' })
  }
})

test('DC3の共有URLは選択なしと符号化されたスキル・レベルの指定を復元する', () => {
  assert.equal(createDamageCalculatorThreeHash(), '#/damage-3')
  assert.deepEqual(parseHashRoute(createDamageCalculatorThreeHash()), { view: 'damage-three' })
  const selection = {
    operatorId: 'char/日本', skillIndex: 2, skillId: 'skchr_test[2]&mode=1', levelIndex: 9,
  }
  const hash = createDamageCalculatorThreeHash(selection)
  assert.equal(hash, '#/damage-3?operatorId=char%2F%E6%97%A5%E6%9C%AC&skillIndex=2&skillId=skchr_test%5B2%5D%26mode%3D1&levelIndex=9')
  assert.deepEqual(parseHashRoute(hash), { view: 'damage-three', selection })
  assert.deepEqual(parseHashRoute(`${hash}&unrelated=value`), { view: 'damage-three', selection })
  assert.deepEqual(parseHashRoute(createDamageCalculatorThreeHash({ ...selection, levelIndex: 0 })), {
    view: 'damage-three', selection: { ...selection, levelIndex: 0 },
  })
})

test('DC3の不完全・不正・重複したクエリは選択なしの計算機へ戻す', () => {
  const selection = { operatorId: 'char_test', skillIndex: '1', skillId: 'skill_test', levelIndex: '0' }
  const invalidValues = {
    operatorId: ['', ' char_test', 'char_test ', '\u0000char', 'x'.repeat(257), '\ufffd'],
    skillId: ['', ' skill_test', 'skill_test ', 'skill\u007f', 'x'.repeat(257), '\ufffd'],
    skillIndex: ['0', '-1', '1.5', '01', '1e0', 'NaN', 'Infinity', '9007199254740992'],
    levelIndex: ['-1', '0.5', '01', '1e0', 'NaN', 'Infinity', '9007199254740992'],
  }
  const base = { view: 'damage-three' }
  for (const query of ['', 'unknown=value', 'operatorId=char_350_surtr',
    'operatorId=%E0%A4%A&skillIndex=1&skillId=x&levelIndex=0',
    'operatorId=x&skillIndex=1&skillId=x&levelIndex=0&%6c%65velIndex=0']) {
    assert.deepEqual(parseHashRoute(`#/damage-3?${query}`), base, query)
  }
  for (const key of Object.keys(selection) as (keyof typeof selection)[]) {
    const missing = new URLSearchParams(selection)
    missing.delete(key)
    assert.deepEqual(parseHashRoute(`#/damage-3?${missing}`), base, `missing ${key}`)
    const duplicate = new URLSearchParams(selection)
    duplicate.append(key, selection[key])
    assert.deepEqual(parseHashRoute(`#/damage-3?${duplicate}`), base, `duplicate ${key}`)
    for (const value of invalidValues[key]) {
      const invalid = new URLSearchParams(selection)
      invalid.set(key, value)
      assert.deepEqual(parseHashRoute(`#/damage-3?${invalid}`), base, `${key}=${JSON.stringify(value)}`)
    }
  }
})

test('DC3の共有URL生成は無効なIDと選択番号を拒否する', () => {
  const selection = { operatorId: 'char_test', skillIndex: 1, skillId: 'skill_test', levelIndex: 0 }
  for (const key of ['operatorId', 'skillId'] as const) {
    for (const value of ['', ' leading', 'trailing ', '\u0000', '\ufffd', 'x'.repeat(257)]) {
      assert.throws(() => createDamageCalculatorThreeHash({ ...selection, [key]: value }), TypeError)
    }
  }
  for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createDamageCalculatorThreeHash({ ...selection, skillIndex: value }), RangeError)
  }
  for (const value of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createDamageCalculatorThreeHash({ ...selection, levelIndex: value }), RangeError)
  }
})

test('ダメージ検証は共通メニューから開き、スルトのトップには表示しない', () => {
  assert.deepEqual(parseHashRoute(DAMAGE_VERIFICATION_ITEM.href), { view: 'damage-verification' })
  assert.deepEqual(DAMAGE_VERIFICATION_ITEM, {
    id: 'damage-verification',
    href: '#/analysis/damage-verification',
    label: 'ダメージ検証',
    description: '',
    section: 'analysis',
  })
  const calculatorIndex = APP_NAV_ITEMS.findIndex((item) => item.id === 'damage-three-coverage')
  assert.equal(APP_NAV_ITEMS[calculatorIndex + 1], DAMAGE_VERIFICATION_ITEM)
  assert.deepEqual(SURTR_HOME_ITEMS, SURTR_ANALYSIS_ITEMS)
  assert.equal(SURTR_ANALYSIS_ITEMS.some((item) => item.id === 'damage-verification'), false)

  for (const suffix of ['/', '/extra', '?from=surtr', '?operatorId=char_350_surtr', '-extra']) {
    assert.deepEqual(parseHashRoute(`${DAMAGE_VERIFICATION_ITEM.href}${suffix}`), { view: 'operators' })
  }
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

test('オペレーター分析は各オペレーターのトップをサイドバーの入口にする', () => {
  assert.deepEqual(parseHashRoute('#/analysis/goldenglow'), { view: 'goldenglow-home' })
  assert.deepEqual(APP_NAV_ITEMS.filter((item) => item.section === 'operator-analysis'), [
    {
      id: 'goldenglow-home',
      href: '#/analysis/goldenglow',
      label: 'ゴールデングロー',
      description: 'スキルダメージ・爆発・ターゲット切替',
      section: 'operator-analysis',
    },
    {
      id: 'surtr-home',
      href: '#/analysis/surtr',
      label: 'スルト',
      description: 'S3 DPS・継続時間・総ダメージ・余燼の分析',
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
      ['goldenglow-target-switch-three', '#/analysis/goldenglow/target-switch-3', 'ターゲット切替3', '敵HP・術耐性別のMOD比較表', 'operator-analysis', 'goldenglow-target-switch-three'],
      ['goldenglow-single-trial', '#/analysis/goldenglow/single-trial', '単発シミュレーション', '', 'operator-analysis', 'goldenglow-single-trial'],
      ['goldenglow-trial-benchmark', '#/analysis/goldenglow/trial-benchmark', '試行回数の調査', '試行回数・計算時間', 'operator-analysis', 'goldenglow-trial-benchmark'],
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

test('スルトの専用トップから各分析を開き、詳細URLと区別する', () => {
  assert.deepEqual(parseHashRoute(SURTR_HOME_LINK.href), { view: 'surtr-home' })
  assert.deepEqual(SURTR_ANALYSIS_ITEMS.map(({ id, href, label }) => [id, href, label, parseHashRoute(href).view]), [
    ['surtr-s3', '#/analysis/surtr/s3', 'S3 DPS', 'surtr-s3'],
    ['surtr-s3-comparison', '#/analysis/surtr/s3-comparison', 'S3 DPS比較（MOD・潜在）', 'surtr-s3-comparison'],
    ['surtr-skill-comparison', '#/analysis/surtr/s2-s3-comparison', 'S2・S3 DPS比較', 'surtr-skill-comparison'],
    ['surtr-duration', '#/analysis/surtr/duration', 'S3 継続時間', 'surtr-duration'],
    ['surtr-total-damage', '#/analysis/surtr/total-damage', 'S3 総ダメージ', 'surtr-total-damage'],
    ['surtr-remnant-attacks', '#/analysis/surtr/remnant-attacks', '余燼中の攻撃・ダメージ', 'surtr-remnant-attacks'],
  ])
  assert.deepEqual(parseHashRoute('#/operators/char_350_surtr'), {
    view: 'operator-detail', operatorId: 'char_350_surtr',
  })
  for (const hash of [SURTR_HOME_LINK.href, ...SURTR_ANALYSIS_ITEMS.map((item) => item.href)]) {
    for (const suffix of ['/', '/extra', '?skill=3', '?from=surtr', '-extra']) {
      assert.deepEqual(parseHashRoute(`${hash}${suffix}`), { view: 'operators' })
    }
  }
  assert.deepEqual(parseHashRoute('#/analysis/surtr/s3-extra'), { view: 'operators' })
})

test('スルトのOP情報は参照元を復元し、重複指定は通常の詳細表示に戻す', () => {
  const hash = createOperatorDetailHash('char_350_surtr', { source: 'surtr-home' })
  assert.equal(hash, '#/operators/char_350_surtr?from=surtr')
  assert.deepEqual(parseHashRoute(hash), {
    view: 'operator-detail', operatorId: 'char_350_surtr', source: 'surtr-home',
  })
  for (const query of ['from=Surtr', 'from=surtr%20', 'from=surtr&from=surtr', 'from=surtr&from=goldenglow']) {
    assert.deepEqual(parseHashRoute(`#/operators/char_350_surtr?${query}`), {
      view: 'operator-detail', operatorId: 'char_350_surtr',
    })
  }
})

test('計算機３からのOP情報は任意のOPの参照元を復元する', () => {
  for (const operatorId of ['char_350_surtr', 'char_263_skadi', 'char_172_svrash', 'char_293_thorns', 'char/日本?from=surtr']) {
    const hash = createOperatorDetailHash(operatorId, { source: 'damage-three' })
    assert.equal(hash, `#/operators/${encodeURIComponent(operatorId)}?from=damage-3`)
    assert.deepEqual(parseHashRoute(hash), { view: 'operator-detail', operatorId, source: 'damage-three' })
  }
})

test('計算機３の参照元は一意な正しいfrom指定だけを採用する', () => {
  for (const query of [
    'from=damage-three', 'from=Damage-3', 'from=damage-3%20',
    'from=damage-3&from=damage-3', 'from=damage-3&from=surtr',
    'from=goldenglow&from=damage-3', 'from=damage-3&%66rom=damage-3',
  ]) {
    assert.deepEqual(parseHashRoute(`#/operators/char_263_skadi?${query}`), {
      view: 'operator-detail', operatorId: 'char_263_skadi',
    }, query)
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

test('マップデータベースは敵のページと同じカテゴリから独立したURLで開く', () => {
  assert.deepEqual(parseHashRoute('#/maps'), { view: 'maps' })
  assert.deepEqual(APP_NAV_ITEMS.find((item) => item.id === 'maps'), {
    id: 'maps',
    href: '#/maps',
    label: 'マップデータベース',
    description: 'マップの検索・地形・出現する敵',
    section: 'analysis',
  })
  for (const suffix of ['/', '/extra', '?map=1-7', '-extra']) {
    assert.deepEqual(parseHashRoute(`#/maps${suffix}`), { view: 'operators' })
  }
})

test('全スキル一覧ページのhashを解析する', () => {
  assert.deepEqual(parseHashRoute('#/skills'), { view: 'skills' })
})

test('統合戦略ページを独立したURLとナビゲーションで開く', () => {
  assert.deepEqual(parseHashRoute('#/roguelike'), { view: 'roguelike' })
  assert.deepEqual(APP_NAV_ITEMS.find((item) => item.id === 'roguelike'), {
    id: 'roguelike', href: '#/roguelike', label: '統合戦略', description: '', section: 'analysis',
  })
  assert.deepEqual(parseHashRoute('#/roguelike/extra'), { view: 'operators' })
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

test('サイトを直接開くかルートhashに移動するとホームを表示する', () => {
  assert.deepEqual(parseHashRoute(''), { view: 'home' })
  assert.deepEqual(parseHashRoute('#'), { view: 'home' })
  assert.deepEqual(parseHashRoute('#/'), { view: 'home' })
})

test('不明なhashはデータベースへフォールバックする', () => {
  assert.deepEqual(parseHashRoute('#/damage'), { view: 'damage' })
  assert.deepEqual(parseHashRoute('#/unknown'), { view: 'operators' })
})
