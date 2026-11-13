import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Table, Page, AttributePage, evaluate, entries, records
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props))
const cellText = markup => markup.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()], logLevel: 'error',
    cacheDir: 'node_modules/.vite/elemental-buildup-page-test', resolve: { preserveSymlinks: true },
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  ;({ ElementalBuildupTable: Table } = await server.ssrLoadModule('/src/components/ElementalBuildupTable.tsx'))
  ;({ DamageCalculatorThree: Page } = await server.ssrLoadModule('/src/components/DamageCalculatorThree.tsx'))
  ;({ DamageCalculatorThreeAttributePage: AttributePage } = await server.ssrLoadModule('/src/components/DamageCalculatorThreeAttributePage.tsx'))
  const { classifySkill } = await server.ssrLoadModule('/src/lib/classifier.ts')
  const comparison = await server.ssrLoadModule('/src/lib/damageCalculatorThreeComparison.ts')
  evaluate = comparison.evaluateDamageThreeComparisonEntry
  const sources = JSON.parse(readFileSync(new URL('../src/data/expandedElementalSources.json', import.meta.url), 'utf8'))
  records = sources.flatMap(source => source.skills.map(skill => {
    const raw = structuredClone(skill.raw)
    return { id: `${source.operatorId}/${skill.skillIndex}`, operatorId: source.operatorId, operatorName: source.operatorName,
      profession: source.profession, professionLabel: source.profession, rarity: source.rarity,
      subProfessionId: source.subProfessionId, subProfessionName: source.subProfessionId, nameInitial: 'OTHER',
      skillIndex: skill.skillIndex, skillId: skill.skillId, skillName: raw.name, description: raw.description,
      duration: raw.duration, durationType: raw.durationType, skillType: raw.skillType,
      spType: raw.spData.spType, spCost: raw.spData.spCost, initSp: raw.spData.initSp,
      classification: classifySkill(raw), raw, skillLevels: Array.from({ length: 10 }, () => structuredClone(raw)),
      operatorProfile: structuredClone(source.profile) }
  }))
  entries = comparison.getDamageThreeComparisonEntries(records)
})
after(async () => { await server?.close() })

test('元素損傷はHP結果と分離し、0・無効・爆発中と複数回分の残りを省略しない', () => {
  const base = { elementId: 'corrosion', basis: 'ATK_STAT', allTargetsPerApplication: 100, perApplication: 100, status: 'APPLIED' }
  const markup = render(Table, { precision: 1, groups: [{ label: '本来', values: [
    { ...base, label: '先行追加', remainingGaugeAfter: 900 },
    { ...base, label: '主攻撃', remainingGaugeAfter: 800 },
    { ...base, label: '無効時', perApplication: 0, allTargetsPerApplication: 0, status: 'IMMUNE', remainingGaugeAfter: 1000 },
    { ...base, label: '爆発中', perApplication: 0, allTargetsPerApplication: 0, status: 'BURST_ACTIVE', remainingGaugeAfter: null },
  ] }] })
  assert.match(markup, /role="region"[^>]*aria-label="元素損傷の計算結果"[^>]*tabindex="0"/)
  assert.match(markup, /<caption>元素損傷（HPダメージとは別）<\/caption>/)
  const body = markup.match(/<tbody>([\s\S]*)<\/tbody>/)[1]
  const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(row =>
    [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(cell => cellText(cell[1])))
  assert.deepEqual(rows[0], ['本来', '侵蝕', '先行追加', '攻撃力', '100.0', '100.0', '900.0', '蓄積'])
  assert.equal(rows[1][6], '800.0')
  assert.deepEqual(rows[2].slice(4), ['0.0', '0.0', '1,000.0', '無効'])
  assert.deepEqual(rows[3].slice(4), ['0.0', '0.0', '—', '爆発中・蓄積なし'])
  assert.equal(render(Table, { groups: [{ label: 'なし', values: [] }] }), '')
})

test('元素損傷表は通常の計算機で対象スキルに表示し、属性比較では1回の攻撃ダメージを表示する', () => {
  const skill = records.find(row => row.operatorId === 'char_499_kaitou' && row.skillIndex === 1)
  const props = { rows: records, loading: false,
    initialSelection: { operatorId: skill.operatorId, skillId: skill.skillId, skillIndex: 1, levelIndex: 9 } }
  const normal = render(Page, props)
  assert.match(normal, /elemental-buildup-table/)
  assert.match(normal, /壊死/)
  assert.doesNotMatch(cellText(normal), /この条件では計算できません/)
  const other = records.find(row => row.operatorId === 'char_499_kaitou' && row.skillIndex === 2)
  assert.doesNotMatch(render(Page, { ...props,
    initialSelection: { ...props.initialSelection, skillId: other.skillId, skillIndex: 2 } }), /elemental-buildup-table/)

  const attribute = render(AttributePage, props)
  assert.match(attribute, /aria-label="1回の攻撃ダメージの属性比較（1体あたり）"/)
  assert.match(attribute, /aria-label="属性比較表をPNG画像で保存"/)
  assert.doesNotMatch(attribute, /elemental-buildup-table|aria-label="表示形式"/)
  assert.doesNotMatch(cellText(attribute), /この条件では計算できません/)
})

test('比較adapterは与ダメージ基準の蓄積を別項目で渡し、仮想属性と爆発越境の停止を引き継ぐ', () => {
  const entry = entries.find(entry => entry.skill.operatorId === 'char_499_kaitou' && entry.skill.skillIndex === 1)
  const common = { defense: 300, resistance: 60, enemyCount: 2 }
  const result = evaluate(entry, common)
  assert.deepEqual(result.errors, [])
  assert.ok(result.perAttack > 0)
  assert.equal(result.elementalBuildups.length, 1)
  assert.equal(result.elementalBuildups[0].basis, 'DEALT_DAMAGE')
  assert.ok(result.elementalBuildups[0].perApplication > 0)
  assert.equal(result.totalDamage, null)
  const changed = evaluate(entry, common, {}, { virtualMainAttackType: 'PHYSICAL' })
  assert.deepEqual(changed.errors, [])
  assert.equal(changed.elementalBuildups[0].perApplication, 0)
  const crossing = evaluate(entry, common, { 'guard.elementalGaugeRemaining': 1 })
  assert.ok(crossing.errors.length)
  assert.equal(crossing.perAttack, null)
  assert.deepEqual(crossing.elementalBuildups, [])
})

test('攻撃力・与ダメージ・実HP減少量・固定値の計算基準を表で区別する', () => {
  const bases = ['ATK_STAT', 'DEALT_DAMAGE', 'HP_LOST', 'FIXED']
  const markup = render(Table, { groups: [{ label: '本来', values: bases.map(basis => ({
    elementId: 'burn', basis, label: '蓄積効果', perApplication: 40, allTargetsPerApplication: 40,
    remainingGaugeAfter: 960, status: 'APPLIED',
  })) }] })
  const body = markup.match(/<tbody>([\s\S]*)<\/tbody>/)[1]
  const labels = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(row =>
    [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(cell => cellText(cell[1]))[3])
  assert.deepEqual(labels, ['攻撃力', '与ダメージ', '実HP減少量', '固定値'])
})
