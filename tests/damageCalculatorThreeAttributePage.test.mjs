import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const profiles = readJson('./fixtures/sixStarGuardProfiles.json')
const sources = [
  ...readJson('./fixtures/sixStarGuardSources.json').guards.map(source => ({
    operatorId: source.id, operatorName: source.name, profession: 'WARRIOR', rarity: 6,
    subProfessionId: source.subProfessionId, skillLevelIndex: 9, skills: source.skills,
    profile: profiles.find(profile => profile.operatorId === source.id).operatorProfile,
  })),
  ...['Melee', 'Ranged', 'Arts'].flatMap(group => readJson(`../src/data/expanded${group}Sources.json`)),
]
let server, Page, Table, rows, entries
const text = markup => markup.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
const render = initialSelection => renderToStaticMarkup(createElement(Page, { rows, loading: false, initialSelection }))
const comparisonTables = markup => markup.match(/<table class="damage-two-table damage-three-attribute-table"[^>]*>.*?<\/table>/gs) ?? []
const attributeHeadings = markup => [...markup.matchAll(
  /<th(?=[^>]*scope="colgroup")(?=[^>]*colspan="3")[^>]*>([^<]*)<\/th>/gi,
)].map(([, label]) => label)
const gradeRows = markup => [...markup.matchAll(
  /<tr[^>]*><th(?=[^>]*scope="row")[^>]*>([^<]*)<\/th>((?:<td[^>]*>[^<]*<\/td>)+)<\/tr>/g,
)].map(([, rating, cells]) => [
  rating, [...cells.matchAll(/<td([^>]*)>([^<]*)<\/td>/g)]
    .map(([, attributes, value]) => [Number(attributes.match(/\bcolspan="(\d+)"/i)?.[1] ?? 1), value]),
])

before(async () => {
  server = await createServer({
    configFile: false, plugins: [react()], logLevel: 'error',
    cacheDir: 'node_modules/.vite/damage-three-attribute-page-test', resolve: { preserveSymlinks: true },
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  ;({ DamageCalculatorThreeAttributePage: Page, DamageCalculatorThreeAttributeTable: Table }
    = await server.ssrLoadModule('/src/components/DamageCalculatorThreeAttributePage.tsx'))
  const { classifySkill } = await server.ssrLoadModule('/src/lib/classifier.ts')
  const { getDamageThreeAttributeEntries } = await server.ssrLoadModule('/src/lib/damageCalculatorThreeAttributeComparison.ts')
  rows = sources.flatMap(source => source.skills.map(entry => {
    const raw = structuredClone(entry.raw)
    return {
      id: `${source.operatorId}/${entry.skillId}/${entry.skillIndex}`, operatorId: source.operatorId,
      operatorName: source.operatorName, profession: source.profession, professionLabel: source.profession,
      rarity: source.rarity, subProfessionId: source.subProfessionId, subProfessionName: source.subProfessionId,
      nameInitial: 'OTHER', skillIndex: entry.skillIndex, skillId: entry.skillId, skillName: raw.name,
      description: raw.description, duration: raw.duration, durationType: raw.durationType,
      skillType: raw.skillType, spType: raw.spData.spType, initSp: raw.spData.initSp, spCost: raw.spData.spCost,
      classification: classifySkill(raw), raw,
      skillLevels: Array.from({ length: source.skillLevelIndex + 1 }, () => structuredClone(raw)),
      operatorProfile: structuredClone(source.profile),
    }
  }))
  entries = getDamageThreeAttributeEntries(rows)
})

after(async () => { await server?.close() })

test('physical skill keeps growth and skill information while showing one grouped game rating table', () => {
  const entry = entries.find(item => item.skill.operatorId === 'char_208_melan')
  assert.ok(entry?.capability.supported)
  const markup = render(entry.structure.basicInfo)
  assert.match(markup, /メランサ/)
  assert.match(markup, /スキル・共通条件/)
  assert.match(markup, /aria-label="オペレーターレベル" min="1" max="55" step="1" value="55"/)
  assert.match(markup, /aria-label="信頼度（%）"/)
  assert.match(markup, /aria-label="スキル情報"/)
  assert.match(markup, /<details class="damage-three-attribute-growth">/)
  assert.match(markup, /仮想比較 · 主攻撃のみ/)
  assert.match(markup, /aria-label="表示指標"/)
  assert.match(markup, /aria-pressed="true">DPS<\/button>/)
  assert.match(markup, /<button(?=[^>]*aria-label="属性比較表をPNG画像で保存")(?=[^>]*aria-haspopup="dialog")(?![^>]*disabled)[^>]*>画像を保存<\/button>/)
  assert.match(markup, /<div(?=[^>]*role="region")(?=[^>]*aria-label="属性比較表（1体あたり）")(?=[^>]*tabindex="0")/)
  const tables = comparisonTables(markup)
  assert.equal(tables.length, 1)
  const [table] = tables
  assert.equal([...table.matchAll(/<th(?=[^>]*scope="col")(?=[^>]*rowspan="2")[^>]*>評価<\/th>/gi)].length, 1)
  assert.match(table, /aria-label="DPSの属性比較（1体あたり）"/)
  assert.deepEqual(attributeHeadings(table), ['物理', '術'])
  assert.deepEqual([...table.matchAll(/<th(?=[^>]*scope="col")(?![^>]*rowspan)[^>]*>([^<]*)<\/th>/gi)]
    .map(([, label]) => label), ['防御力', '最小', '最大', '術耐性', '最小', '最大'])
  assert.doesNotMatch(markup, /aria-label="変更後の主攻撃"|aria-label="横軸"|増減率|合計DPS|<canvas|<svg/)
  assert.doesNotMatch(markup, /NaN|Infinity|サンプル|title="|role="tooltip"/)
})

test('selecting an arts operator keeps that exact skill and both attribute column groups', () => {
  const entry = entries.find(item => item.skill.operatorName === 'ラヴァ')
  assert.ok(entry?.capability.supported)
  const markup = render(entry.structure.basicInfo)
  assert.match(markup, /ラヴァ/)
  assert.match(markup, /aria-label="DPSの属性比較（1体あたり）"/)
  assert.deepEqual(attributeHeadings(markup), ['物理', '術'])
  assert.doesNotMatch(markup, /メランサ/)
})

test('legacy Surtr and newly included one-shot skills show a usable comparison metric', () => {
  const surtr = entries.find(item => item.skill.operatorId === 'char_350_surtr' && item.skill.skillIndex === 3)
  assert.ok(surtr?.capability.supported)
  const sustained = render(surtr.structure.basicInfo)
  assert.match(sustained, /aria-label="DPSの属性比較（1体あたり）"/)
  assert.doesNotMatch(sustained, /未対応です。|未確定/)
  const angel = entries.find(item => item.skill.operatorId === 'char_103_angel' && item.skill.skillIndex === 1)
  assert.ok(angel?.capability.supported)
  assert.equal(angel.kind, 'NEXT_ATTACK')
  const once = render(angel.structure.basicInfo)
  assert.match(once, /S1 アサルトモード/)
  assert.match(once, /class="damage-three-attribute-fixed-metric">1回の攻撃ダメージ/)
  assert.match(once, /aria-label="1回の攻撃ダメージの属性比較（1体あたり）"/)
  assert.doesNotMatch(once, /aria-label="表示指標"|aria-label="DPSの属性比較（1体あたり）"|未対応です。/)
})

test('true and mixed native main attacks also render both physical and Arts column groups', () => {
  const amiya = entries.find(item => item.skill.operatorId === 'char_002_amiya' && item.skill.skillIndex === 3)
  const chen = entries.find(item => item.skill.operatorId === 'char_010_chen' && item.skill.skillIndex === 2)
  assert.ok(amiya?.capability.supported)
  assert.ok(chen?.capability.supported)
  for (const entry of [amiya, chen]) {
    const markup = render(entry.structure.basicInfo)
    assert.deepEqual(attributeHeadings(markup), ['物理', '術'])
    assert.doesNotMatch(markup, /未対応です。|未確定|NaN|Infinity/)
  }
})

test('an invalid deep-link selection does not silently substitute a supported operator', () => {
  const entry = entries.find(item => item.skill.operatorId === 'char_208_melan')
  const markup = render({ ...entry.structure.basicInfo, levelIndex: 0 })
  assert.match(markup, /指定されたスキル・レベルは属性比較の対象外です。/)
  assert.match(markup, /検索して変更/)
  assert.doesNotMatch(markup, /class="damage-two-table damage-three-attribute-table"/)
  assert.doesNotMatch(markup, /aria-label="属性比較表をPNG画像で保存"/)
})

test('default selection uses a supported stage and conditional skills retain their explicit controls', () => {
  const first = entries.find(entry => entry.capability.supported)
  assert.ok(first)
  assert.match(text(render()), new RegExp(first.skill.operatorName))
  const entry = entries.find(item => item.capability.supported
    && item.skill.operatorId === 'char_4082_qiubai' && item.skill.skillIndex === 2)
  assert.ok(entry, 'reviewed conditional skill fixture')
  const markup = render(entry.structure.basicInfo)
  assert.doesNotMatch(markup, /aria-label="敵の防御力"|aria-label="敵の術耐性"/)
  assert.match(markup, /aria-label="敵の数"/)
  assert.match(markup, /aria-label="対象が足止め・バインド中"/)
  assert.match(markup, /aria-label="攻撃距離"/)
  assert.match(markup, /aria-label="スキルの段階"/)
})

test('Exusiai S3 shows the physical and Arts damage ranges on the same game rating row', () => {
  const entry = entries.find(item => item.skill.operatorId === 'char_103_angel' && item.skill.skillIndex === 3)
  assert.ok(entry?.capability.supported)
  const markup = render(entry.structure.basicInfo)
  const [table] = comparisonTables(markup)
  assert.ok(table)
  const ratingsAndCells = gradeRows(table)
  const ratings = ['E', 'D', 'C', 'B', 'B+', 'A', 'A+', 'S', 'S+', 'SS']
  assert.deepEqual(ratingsAndCells.map(([rating]) => rating), ratings)
  assert.ok(ratingsAndCells.every(([, cells]) => cells.reduce((sum, [span]) => sum + span, 0) === 6))
  assert.deepEqual(ratingsAndCells[0], ['E', [[1, '0〜99'], [1, '3,993.6'], [1, '4,616.5'], [1, '0'], [2, '4,616.5']]])
  assert.deepEqual(ratingsAndCells[3], ['B', [[1, '500〜799'], [1, '230.8'], [1, '1,470.5'], [1, '20〜29'], [1, '3,277.7'], [1, '3,693.2']]])
  assert.deepEqual(ratingsAndCells.at(-1), ['SS', [[1, '5,001以上'], [2, '230.8'], [1, '91〜100'], [1, '230.8'], [1, '415.5']]])
})

test('shared metric preserves zero, formats ranges and keeps the stat boundaries when damage is unavailable', () => {
  const physical = [
    { rating: 'E', minStat: 0, maxStat: 99, dps: { min: 0, max: 0 }, perAttack: { min: 12.34, max: 15.1 } },
    { rating: 'B', minStat: 500, maxStat: 799, dps: null, perAttack: { min: Number.NaN, max: 15.1 } },
  ]
  const arts = [
    { rating: 'B', minStat: 20, maxStat: 29, dps: { min: 0, max: Number.POSITIVE_INFINITY }, perAttack: null },
    { rating: 'E', minStat: 0, maxStat: 0, dps: { min: 10.08, max: 10.1 }, perAttack: { min: 20.56, max: 20.56 } },
  ]
  const renderTable = props => renderToStaticMarkup(createElement(Table, { physical, arts, ...props }))
  const unavailable = [[1, '—'], [1, '—']]
  const dps = renderTable({ metric: 'dps' })
  assert.match(dps, /aria-label="DPSの属性比較（1体あたり）"/)
  assert.deepEqual(gradeRows(dps), [
    ['E', [[1, '0〜99'], [2, '0.0'], [1, '0'], [1, '10.1'], [1, '10.1']]],
    ['B', [[1, '500〜799'], ...unavailable, [1, '20〜29'], ...unavailable]],
  ])
  const perAttack = renderTable({ metric: 'perAttack' })
  assert.match(perAttack, /aria-label="1回の攻撃ダメージの属性比較（1体あたり）"/)
  assert.deepEqual(gradeRows(perAttack), [
    ['E', [[1, '0〜99'], [1, '12.3'], [1, '15.1'], [1, '0'], [2, '20.6']]],
    ['B', [[1, '500〜799'], ...unavailable, [1, '20〜29'], ...unavailable]],
  ])
  for (const [metric, markup] of [['dps', dps], ['perAttack', perAttack]]) {
    const image = renderTable({ metric, forImage: true })
    assert.match(image, /^<table class="damage-two-table damage-three-attribute-table damage-three-attribute-table-image"/)
    assert.doesNotMatch(image, /role="region"|tabindex=/i)
    assert.deepEqual(attributeHeadings(image), ['物理', '術'])
    assert.deepEqual(gradeRows(image), gradeRows(markup))
    assert.match(image, /<td(?=[^>]*data-table-image-number="true")(?=[^>]*colspan="2")[^>]*>/i)
  }
  assert.doesNotMatch(dps + perAttack, /NaN|Infinity|増減率|合計DPS|勝|%/)
  const invalid = renderTable({ metric: 'dps', invalid: true })
  assert.deepEqual(gradeRows(invalid), [
    ['E', [[1, '0〜99'], ...unavailable, [1, '0'], ...unavailable]],
    ['B', [[1, '500〜799'], ...unavailable, [1, '20〜29'], ...unavailable]],
  ])
})
