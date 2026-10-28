import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Fields, ApplicationTable, Components, Periodic, Result, Recipe, Page, buildOutput, buildApplications, classify
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()], logLevel: 'error',
    cacheDir: 'node_modules/.vite/guard-skill-pages-test', resolve: { preserveSymlinks: true },
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  ;({ GuardConditionFields: Fields, DamageCalculatorThreeApplicationTable: ApplicationTable,
    GuardPeriodicDamageTable: Periodic, DamageCalculatorThreeResultTable: Result, DamageCalculatorThree: Page,
    DamageCalculatorThreeAttackComponentTable: Components } = await server.ssrLoadModule('/src/components/DamageCalculatorThree.tsx'))
  ;({ GuardRecipeStructure: Recipe } = await server.ssrLoadModule('/src/components/SkillStructurePage.tsx'))
  ;({ buildDamageCalculatorThreeOutput: buildOutput } = await server.ssrLoadModule('/src/lib/damageCalculatorThree.ts'))
  ;({ buildDamageCalculatorThreeApplicationRows: buildApplications } = await server.ssrLoadModule('/src/lib/damageCalculatorThreeApplications.ts'))
  ;({ classifySkill: classify } = await server.ssrLoadModule('/src/lib/classifier.ts'))
})

test('継続量と直接DPSを別列で表示し、合計DPSにも指定した小数桁数を適用する', () => {
  const output = { guard: {}, canShowDps: true, actualTargetCount: 3, damageType: null, axisLabel: '敵の防御力', rows: [
    { axisValue: 500, dps: 100.25, damageOverTimeDps: 60.125, combinedDps: 160.375, allTargetsCombinedDps: 481.125 },
  ] }
  assert.deepEqual(table(render(Periodic, { output, precision: 2 })), [
    ['敵の防御力', '1体の直接DPS', '1体の継続ダメージ/秒', '1体の合計DPS', '全対象の合計DPS'],
    ['500', '100.25', '60.13', '160.38', '481.13'],
  ])
  output.canShowDps = false
  assert.deepEqual(table(render(Periodic, { output, precision: 1 })), [
    ['敵の防御力', '1体の継続ダメージ/秒', '全対象の継続ダメージ/秒'], ['500', '60.1', '180.4'],
  ], '発動1回のダメージに毎秒量を加算しない')
})

test('接触や着弾を選ぶ段階の出力をスキル全体の総ダメージと呼ばない', () => {
  const markup = render(Result, { precision: 0, output: { guard: {}, attackKind: 'SKILL_ACTION',
    hasProbabilisticDamage: false, hasRandomTargets: false, canShowDps: false,
    damageType: 'ARTS', axisLabel: '敵の術耐性', rows: [
      { axisValue: 0, perAttack: 100, allTargetsPerAttack: 100, attackComponents: [] },
    ] } })
  assert.match(markup, /選択段階1回のダメージ/)
  assert.doesNotMatch(markup, /スキル1回の総ダメージ/)
})
after(async () => { await server?.close() })

const render = (Component, props) => renderToStaticMarkup(createElement(Component, props))
const text = value => value.replace(/<[^>]+>/g, '').trim()
const table = markup => [...markup.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)]
  .map(row => [...row[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/g)].map(cell => text(cell[1])))

function sourceRecord(operatorId, skillIndex) {
  const source = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardSources.json', import.meta.url), 'utf8'))
  const profiles = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardProfiles.json', import.meta.url), 'utf8'))
  const operator = source.guards.find(candidate => candidate.id === operatorId)
  const skill = operator.skills.find(candidate => candidate.skillIndex === skillIndex)
  const raw = skill.raw
  return { operatorId, operatorName: operator.name, skillIndex, skillId: skill.skillId,
    id: `${operatorId}:${skill.skillId}`, skillName: raw.name, profession: 'WARRIOR', professionLabel: '前衛',
    subProfessionId: operator.subProfessionId, subProfessionName: operator.subProfessionId, nameInitial: 'S_ROW', rarity: 6,
    raw, description: raw.description, duration: raw.duration, durationType: raw.durationType,
    spType: raw.spData.spType, initSp: raw.spData.initSp, spCost: raw.spData.spCost, skillType: raw.skillType,
    classification: classify(raw), skillLevels: Array.from({ length: 10 }, () => raw),
    operatorProfile: profiles.find(candidate => candidate.operatorId === operatorId).operatorProfile }
}

test('実データの司霆レイズS2は周期落雷を含むDPSを画面上の独立した表に出力する', () => {
  const skill = sourceRecord('char_1043_leizi2', 2)
  const markup = render(Page, { rows: [skill], loading: false,
    initialSelection: { operatorId: skill.operatorId, skillIndex: 2, skillId: skill.skillId, levelIndex: 9 } })
  assert.match(markup, /aria-label="継続ダメージと合計DPS"/)
  assert.match(markup, /aria-label="特性の攻撃力蓄積（%）"/)
  const periodicTable = markup.match(/<table[^>]*class="[^"]*damage-three-steady-table[^"]*"[^>]*>([\s\S]*?)<\/table>/)
  assert.ok(periodicTable)
  assert.deepEqual(table(periodicTable[1])[1], ['0', '1,565', '125', '1,690', '1,690'])
  const output = buildOutput({ operator: skill, skill, phaseIndex: 2, operatorLevel: 90, trust: 100,
    skillLevelIndex: 9, conditions: { guard: { enemyResistance: 60 } } })
  const atZero = output.rows.find(row => row.axisValue === 0)
  assert.equal(output.damageOverTime, null, '旧DOTモデルに依存せず新しい毎秒量を表示する')
  assert.ok(Math.abs(atZero.damageOverTimeDps - 50.076) < 1e-8)
  assert.ok(Math.abs(atZero.combinedDps - 1614.951) < 1e-8)
})

test('追加条件は数値・真偽・選択肢を型別に表示し、不正な数値は空欄のエラー状態にする', () => {
  const markup = render(Fields, { inputs: [
    { key: 'hp', label: '自身のHP（%）', kind: 'number', defaultValue: 100, min: 0, max: 100, step: 0.1 },
    { key: 'blocked', label: '対象をブロック', kind: 'boolean', defaultValue: false },
    { key: 'phase', label: 'スキル段階', kind: 'select', defaultValue: 'FIRST',
      options: [{ value: 'FIRST', label: '初回' }, { value: 'LATER', label: '2回目以降' }] },
  ], values: { hp: NaN, blocked: true, phase: 'LATER' }, onChange() {} })
  assert.match(markup, /type="number"[^>]*aria-label="自身のHP（%）"[^>]*min="0"[^>]*max="100"[^>]*step="0.1"[^>]*aria-invalid="true"[^>]*value=""/)
  assert.match(markup, /<option value="true" selected="">あり<\/option>/)
  assert.match(markup, /<option value="LATER" selected="">2回目以降<\/option>/)
  assert.doesNotMatch(markup, /value="NaN"/)
})

test('追加技能もスキル・特性・素質を同じ適用テーブルへ表示し、各区分を混同しない', () => {
  const skill = sourceRecord('char_1043_leizi2', 2)
  const input = { operator: skill, skill, phaseIndex: 2, operatorLevel: 90, trust: 100, skillLevelIndex: 9 }
  const output = buildOutput(input)
  assert.ok(output.guard)
  const rows = buildApplications(input, output)
  const before = structuredClone(output.rows)
  const markup = render(ApplicationTable, { rows })
  const [headers, ...data] = table(markup)
  assert.deepEqual(headers.slice(0, 2), ['区分', '名称'])
  assert.ok(headers.includes('タイミング'))
  assert.ok(data.every(row => row.length === headers.length))
  assert.deepEqual([...new Set(rows.map(row => row.category))], ['SKILL', 'TRAIT', 'TALENT'])
  assert.ok(rows.filter(row => row.category === 'TRAIT').length > 0)
  assert.ok(rows.filter(row => row.category === 'TALENT').every(row => row.categoryLabel.startsWith('素質')))
  assert.ok(rows.filter(row => row.category === 'TALENT').every(row => row.name && row.name !== '特性'))
  assert.ok(rows.some(row => row.category === 'TALENT' && row.status === 'APPLIED'))
  assert.deepEqual(output.rows, before)
  assert.doesNotMatch(markup, /rowspan|colspan|<small|<br/)
})

test('追加スキルの攻撃内訳は属性・倍率・回数を分け、アイリーニ専用の浮遊欄を流用しない', () => {
  const markup = render(Components, { precision: 1, output: {
    guard: { inputs: [], conditions: {}, evaluations: [], unresolved: [] },
    hasAttackSequence: true, hasProbabilisticDamage: false, attackKind: 'SKILL_ACTION',
    axisLabel: '敵の防御力', damageType: null, rows: [{ axisValue: 500, attackComponents: [
      { id: 'physical', label: '物理斬撃', damageType: 'PHYSICAL', attackScale: 5, count: 1, expectedHitCount: 1, expectedDamage: 4500 },
      { id: 'arts', label: '術斬撃', damageType: 'ARTS', attackScale: 5, count: 1, expectedHitCount: 1, expectedDamage: 3000 },
    ] }],
  } })
  assert.deepEqual(table(markup), [
    ['敵の防御力', '区分', 'ダメージ種別', '攻撃倍率', '打撃回数', '1体平均の命中回数', '1体平均のダメージ'],
    ['500', '物理斬撃', '物理', '×5', '1', '1', '4,500.0'],
    ['500', '術斬撃', '術', '×5', '1', '1', '3,000.0'],
  ])
  assert.doesNotMatch(markup, /浮遊|命中時状態|防御無視の確率|rowspan|colspan|<small|<br/)
})

test('効果構造は計算に使う段階条件・入力・blackboard参照と未確定部分を表示する', () => {
  const markup = render(Recipe, { caption: '試験 S3 特化3', source: {
    duration: 25, blackboard: [{ key: 'atk', value: 1.4 }, { key: 'atk_scale', value: 2.45 }],
  }, recipe: { operatorId: 'test', skillIndex: 3, inputs: [
    { key: 'activation', label: 'スキル発動回数', kind: 'number', defaultValue: 1, min: 1, max: 10 },
  ], stages: [{ id: 'later', label: '2回目以降', when: { input: 'activation', comparison: 'GTE', value: 2 },
    kind: 'SKILL_ACTION', atk: { key: 'atk' }, duration: 25, actions: [
      { label: '連続斬撃', damageType: 'PHYSICAL', scale: { key: 'atk_scale' }, hits: 6 },
      { label: '終撃', damageType: 'PHYSICAL', scale: { op: 'mul', args: [{ key: 'atk_scale' }, 2] }, hits: 1 },
    ], unresolved: ['途中撃破後の対象変更'] }] } })
  assert.match(markup, /スキル発動回数≧2/)
  assert.match(markup, /blackboard\.atk_scale/)
  assert.match(markup, /（2\.45×2）/)
  assert.match(markup, /途中撃破後の対象変更/)
  assert.match(markup, /aria-label="試験 S3 特化3の保留事項"/)
  assert.match(markup, /<th scope="col">参照<\/th>/)
  assert.doesNotMatch(markup, /未取得/)
})
