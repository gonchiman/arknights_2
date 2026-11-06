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
let server, Page, Tables, rows, entries
const text = markup => markup.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
const render = initialSelection => renderToStaticMarkup(createElement(Page, { rows, loading: false, initialSelection }))

before(async () => {
  server = await createServer({
    configFile: false, plugins: [react()], logLevel: 'error',
    cacheDir: 'node_modules/.vite/damage-three-attribute-page-test', resolve: { preserveSymlinks: true },
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  ;({ DamageCalculatorThreeAttributePage: Page, DamageCalculatorThreeAttributeTables: Tables }
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

test('physical skill keeps growth and skill information while showing independent physical and Arts tables', () => {
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
  assert.match(markup, /aria-label="両表の表示指標"/)
  assert.match(markup, /aria-pressed="true">DPS<\/button>/)
  assert.match(markup, /aria-label="物理の属性比較（1体あたり）" tabindex="0"/)
  assert.match(markup, /aria-label="術の属性比較（1体あたり）" tabindex="0"/)
  assert.equal([...markup.matchAll(/class="damage-two-table damage-three-attribute-table"/g)].length, 2)
  assert.equal([...markup.matchAll(/scope="col">DPS/g)].length, 2)
  assert.match(markup, /scope="col">防御力/)
  assert.match(markup, /scope="col">術耐性/)
  assert.doesNotMatch(markup, /aria-label="変更後の主攻撃"|aria-label="横軸"|増減率|合計DPS|<canvas|<svg/)
  assert.doesNotMatch(markup, /NaN|Infinity|サンプル|title="|role="tooltip"/)
})

test('selecting an arts operator keeps that exact skill and both attribute tables', () => {
  const entry = entries.find(item => item.skill.operatorName === 'ラヴァ')
  assert.ok(entry?.capability.supported)
  const markup = render(entry.structure.basicInfo)
  assert.match(markup, /ラヴァ/)
  assert.match(markup, /aria-label="物理のDPS（1体あたり）"/)
  assert.match(markup, /aria-label="術のDPS（1体あたり）"/)
  assert.doesNotMatch(markup, /メランサ/)
})

test('legacy Surtr and newly included one-shot skills show a usable comparison metric', () => {
  const surtr = entries.find(item => item.skill.operatorId === 'char_350_surtr' && item.skill.skillIndex === 3)
  assert.ok(surtr?.capability.supported)
  const sustained = render(surtr.structure.basicInfo)
  assert.match(sustained, /aria-label="物理のDPS（1体あたり）"/)
  assert.match(sustained, /aria-label="術のDPS（1体あたり）"/)
  assert.doesNotMatch(sustained, /未対応です。|未確定/)
  const angel = entries.find(item => item.skill.operatorId === 'char_103_angel' && item.skill.skillIndex === 1)
  assert.ok(angel?.capability.supported)
  assert.equal(angel.kind, 'NEXT_ATTACK')
  const once = render(angel.structure.basicInfo)
  assert.match(once, /S1 アサルトモード/)
  assert.match(once, /class="damage-three-attribute-fixed-metric">1回の攻撃ダメージ/)
  assert.equal([...once.matchAll(/scope="col">1回の攻撃ダメージ/g)].length, 2)
  assert.doesNotMatch(once, /aria-label="両表の表示指標"|scope="col">DPS|未対応です。/)
})

test('true and mixed native main attacks also render both physical and Arts tables', () => {
  const amiya = entries.find(item => item.skill.operatorId === 'char_002_amiya' && item.skill.skillIndex === 3)
  const chen = entries.find(item => item.skill.operatorId === 'char_010_chen' && item.skill.skillIndex === 2)
  assert.ok(amiya?.capability.supported)
  assert.ok(chen?.capability.supported)
  for (const entry of [amiya, chen]) {
    const markup = render(entry.structure.basicInfo)
    assert.match(markup, /aria-label="物理の属性比較（1体あたり）"/)
    assert.match(markup, /aria-label="術の属性比較（1体あたり）"/)
    assert.doesNotMatch(markup, /未対応です。|未確定|NaN|Infinity/)
  }
})

test('an invalid deep-link selection does not silently substitute a supported operator', () => {
  const entry = entries.find(item => item.skill.operatorId === 'char_208_melan')
  const markup = render({ ...entry.structure.basicInfo, levelIndex: 0 })
  assert.match(markup, /指定されたスキル・レベルは属性比較の対象外です。/)
  assert.match(markup, /検索して変更/)
  assert.doesNotMatch(markup, /class="damage-three-attribute-tables"/)
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

test('Exusiai S3 uses real one-axis results, with five rows and one decimal in each table', () => {
  const entry = entries.find(item => item.skill.operatorId === 'char_103_angel' && item.skill.skillIndex === 3)
  assert.ok(entry?.capability.supported)
  const markup = render(entry.structure.basicInfo)
  const tables = [...markup.matchAll(/<table class="damage-two-table damage-three-attribute-table"[^>]*>(.*?)<\/table>/g)]
  const values = table => [...table.matchAll(/<tr><th scope="row">(.*?)<\/th><td>(.*?)<\/td><\/tr>/g)]
    .map(match => [match[1], match[2]])
  assert.equal(tables.length, 2)
  assert.deepEqual(values(tables[0][1]), [['0', '4,616.5'], ['500', '1,470.5'], ['1,000', '230.8'], ['1,500', '230.8'], ['2,000', '230.8']])
  assert.deepEqual(values(tables[1][1]), [['0', '4,616.5'], ['20', '3,693.2'], ['40', '2,769.9'], ['60', '1,846.6'], ['80', '923.3']])
})

test('shared table metric preserves zero, rounds one decimal and never presents unavailable values as numbers', () => {
  const physical = [{ value: 0, dps: 0, perAttack: 12.34 }, { value: 500, dps: null, perAttack: Number.NaN }]
  const arts = [{ value: 0, dps: 10.08, perAttack: 20.56 }, { value: 20, dps: Number.POSITIVE_INFINITY, perAttack: null }]
  const renderTables = props => renderToStaticMarkup(createElement(Tables, { physical, arts, ...props }))
  const dps = renderTables({ metric: 'dps' })
  assert.equal([...dps.matchAll(/scope="col">DPS/g)].length, 2)
  assert.deepEqual([...dps.matchAll(/<td>(.*?)<\/td>/g)].map(match => match[1]), ['0.0', '—', '10.1', '—'])
  const perAttack = renderTables({ metric: 'perAttack' })
  assert.equal([...perAttack.matchAll(/scope="col">1回の攻撃ダメージ/g)].length, 2)
  assert.deepEqual([...perAttack.matchAll(/<td>(.*?)<\/td>/g)].map(match => match[1]), ['12.3', '—', '20.6', '—'])
  assert.doesNotMatch(dps + perAttack, /NaN|Infinity|増減率|合計DPS|勝|%/)
  const invalid = renderTables({ metric: 'dps', invalid: true })
  assert.deepEqual([...invalid.matchAll(/<td>(.*?)<\/td>/g)].map(match => match[1]), ['—', '—', '—', '—'])
  assert.match(invalid, /scope="row">500/)
  assert.match(invalid, /scope="row">20/)
})
