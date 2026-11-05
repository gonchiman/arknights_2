import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const sources = ['Melee', 'Ranged', 'Arts'].flatMap(group => JSON.parse(readFileSync(
  new URL(`../src/data/expanded${group}Sources.json`, import.meta.url), 'utf8')))
let server, Page, ResultTable, rows, entries
const text = markup => markup.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
const render = initialSelection => renderToStaticMarkup(createElement(Page, { rows, loading: false, initialSelection }))

before(async () => {
  server = await createServer({
    configFile: false, plugins: [react()], logLevel: 'error',
    cacheDir: 'node_modules/.vite/damage-three-attribute-page-test', resolve: { preserveSymlinks: true },
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  ;({ DamageCalculatorThreeAttributePage: Page, DamageCalculatorThreeAttributeResultTable: ResultTable }
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

test('physical skill renders the actual growth limits, skill information, two-series chart and current condition table', () => {
  const entry = entries.find(item => item.skill.operatorId === 'char_208_melan')
  assert.ok(entry?.capability.supported)
  const markup = render(entry.structure.basicInfo)
  assert.match(markup, /メランサ/)
  assert.match(markup, /スキル・共通条件/)
  assert.match(markup, /aria-label="オペレーターレベル" min="1" max="55" step="1" value="55"/)
  assert.match(markup, /aria-label="信頼度（%）"/)
  assert.match(markup, /aria-label="スキル情報"/)
  assert.match(markup, /aria-label="変更後の主攻撃"/)
  assert.match(markup, /本来（物理）/)
  assert.match(markup, /変更後（術）/)
  assert.match(markup, /aria-label="攻撃属性の比較結果（1体）" tabindex="0"/)
  assert.match(markup, /scope="row">1回の攻撃ダメージ/)
  assert.match(markup, /scope="col">増減率/)
  assert.doesNotMatch(markup, /NaN|Infinity|サンプル|title="|role="tooltip"/)
})

test('selecting an arts operator keeps that exact skill and displays its original main attack', () => {
  const entry = entries.find(item => item.skill.operatorName === 'ラヴァ')
  assert.ok(entry?.capability.supported)
  const markup = render(entry.structure.basicInfo)
  assert.match(markup, /ラヴァ/)
  assert.match(markup, /本来（術）/)
  assert.match(markup, /<td>0%<\/td>/)
  assert.doesNotMatch(markup, /メランサ/)
})

test('an invalid deep-link selection does not silently substitute a supported operator', () => {
  const entry = entries.find(item => item.skill.operatorId === 'char_208_melan')
  const markup = render({ ...entry.structure.basicInfo, levelIndex: 0 })
  assert.match(markup, /指定されたスキル・レベルは属性比較の対象外です。/)
  assert.match(markup, /検索して変更/)
  assert.doesNotMatch(markup, /攻撃属性の比較結果（1体）|本来（物理）/)
})

test('default selection uses a supported stage and conditional skills retain their explicit controls', () => {
  const first = entries.find(entry => entry.capability.supported)
  assert.ok(first)
  assert.match(text(render()), new RegExp(first.skill.operatorName))
  const entry = entries.find(item => item.capability.supported && item.structure.guardRecipe?.inputs
    .some(input => !['actualAttackTargetCount', 'enemyResistance', 'skillActivationCount'].includes(input.key)))
  assert.ok(entry, 'reviewed conditional skill fixture')
  const markup = render(entry.structure.basicInfo)
  assert.match(markup, /本来（(?:物理|術)）/)
  assert.match(markup, /aria-label="敵の防御力"/)
  assert.match(markup, /aria-label="敵の術耐性"/)
  assert.match(markup, /aria-label="敵の数"/)
  const locked = ['actualAttackTargetCount', 'enemyResistance', 'skillActivationCount']
  const input = entry.structure.guardRecipe.inputs.find(item => !locked.includes(item.key))
  assert.ok(markup.includes(`aria-label="${input.label}"`), input.label)
})

test('result table preserves zero, unavailable values, direct DPS and periodic DPS separately', () => {
  const comparison = {
    errors: [], samples: [], axisMaximum: 3000,
    original: { errors: [], perAttack: 0, dps: 10.004, combinedDps: 15.004, damageOverTimeDps: 5 },
    changed: { errors: [], perAttack: 100, dps: 10.008, combinedDps: 15.008, damageOverTimeDps: 5 },
  }
  const markup = renderToStaticMarkup(createElement(ResultTable, { comparison, originalLabel: '物理', changedLabel: '術' }))
  const resultRows = [...markup.matchAll(/<tr>(.*?)<\/tr>/g)].map(match => text(match[1]))
  assert.equal(resultRows[1], '1回の攻撃ダメージ0100—')
  assert.equal(resultRows[2], 'DPS1010.01+0.04%')
  assert.equal(resultRows[3], '合計DPS1515.01+0.03%')
  const unavailable = renderToStaticMarkup(createElement(ResultTable, { comparison: {
    ...comparison, errors: ['主攻撃の属性変更は未対応です。'], changed: null,
  }, originalLabel: '物理', changedLabel: '術' }))
  assert.match(unavailable, /<td>0<\/td><td>—<\/td><td>—<\/td>/)
  assert.doesNotMatch(unavailable, /Infinity|NaN/)
})
