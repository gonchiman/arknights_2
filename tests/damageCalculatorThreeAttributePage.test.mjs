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

test('legacy Surtr and newly included one-shot skills show a usable comparison metric', () => {
  const surtr = entries.find(item => item.skill.operatorId === 'char_350_surtr' && item.skill.skillIndex === 3)
  assert.ok(surtr?.capability.supported)
  const sustained = render(surtr.structure.basicInfo)
  assert.match(sustained, /本来（術）/)
  assert.match(sustained, /scope="row">DPS/)
  assert.doesNotMatch(sustained, /未対応です。|未確定/)
  const angel = entries.find(item => item.skill.operatorId === 'char_103_angel' && item.skill.skillIndex === 1)
  assert.ok(angel?.capability.supported)
  assert.equal(angel.kind, 'NEXT_ATTACK')
  const once = render(angel.structure.basicInfo)
  assert.match(once, /S1 アサルトモード/)
  assert.match(once, /value="perAttack" selected=""/)
  assert.match(once, /scope="row">1回の攻撃ダメージ/)
  assert.doesNotMatch(once, /<option value="dps"|scope="row">DPS|未対応です。/)
})

test('true and mixed native main attacks have explicit labels', () => {
  const amiya = entries.find(item => item.skill.operatorId === 'char_002_amiya' && item.skill.skillIndex === 3)
  const chen = entries.find(item => item.skill.operatorId === 'char_010_chen' && item.skill.skillIndex === 2)
  assert.ok(amiya?.capability.supported)
  assert.ok(chen?.capability.supported)
  assert.match(render(amiya.structure.basicInfo), /本来（確定）/)
  assert.match(render(chen.structure.basicInfo), /本来（混合）/)
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
  const entry = entries.find(item => item.capability.supported
    && item.skill.operatorId === 'char_4082_qiubai' && item.skill.skillIndex === 2)
  assert.ok(entry, 'reviewed conditional skill fixture')
  const markup = render(entry.structure.basicInfo)
  assert.match(markup, /本来（(?:物理|術)）/)
  assert.match(markup, /aria-label="敵の防御力"/)
  assert.match(markup, /aria-label="敵の術耐性"/)
  assert.match(markup, /aria-label="敵の数"/)
  assert.match(markup, /aria-label="対象が足止め・バインド中"/)
  assert.match(markup, /aria-label="攻撃距離"/)
  assert.match(markup, /aria-label="スキルの段階"/)
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
