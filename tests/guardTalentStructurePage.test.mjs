import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const source = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardSources.json', import.meta.url), 'utf8'))
const profiles = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardProfiles.json', import.meta.url), 'utf8'))
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;',
})[character])
let server, Page, DefinitionTable, rows, structures, ids

before(async () => {
  server = await createServer({ configFile: false, plugins: [react()], logLevel: 'error',
    cacheDir: 'node_modules/.vite/guard-talent-structure-page-test', resolve: { preserveSymlinks: true },
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  ;({ TalentStructurePage: Page, TalentEffectDefinitionTable: DefinitionTable } = await server.ssrLoadModule('/src/components/TalentStructurePage.tsx'))
  ;({ GUARD_PASSIVE_OPERATOR_IDS: ids } = await server.ssrLoadModule('/src/lib/guardCombatPassives.ts'))
  const { buildTalentStructures } = await server.ssrLoadModule('/src/lib/talentStructure.ts')
  rows = source.guards.filter(operator => ids.includes(operator.id)).flatMap(operator => operator.skills.map(skill => ({
    operatorId: operator.id, operatorName: operator.name, profession: 'WARRIOR', professionLabel: '前衛', rarity: 6,
    subProfessionId: operator.subProfessionId, subProfessionName: operator.subProfessionId, nameInitial: 'S_ROW',
    skillIndex: skill.skillIndex, skillId: skill.skillId, skillName: skill.raw.name,
    id: `${operator.id}:${skill.skillId}`, raw: skill.raw, description: skill.raw.description,
    duration: skill.raw.duration, durationType: skill.raw.durationType, skillType: skill.raw.skillType,
    spType: skill.raw.spData.spType, initSp: skill.raw.spData.initSp, spCost: skill.raw.spData.spCost,
    skillLevels: Array.from({ length: 10 }, () => skill.raw), classification: {},
    operatorProfile: profiles.find(profile => profile.operatorId === operator.id).operatorProfile,
  })))
  structures = buildTalentStructures(rows)
})
after(async () => { await server?.close() })

test('追加25人の50素質を同じ6列の効果構造テーブルと素質説明文で表示する', () => {
  assert.equal(ids.length, 25)
  assert.equal(structures.length, 50)
  for (const operatorId of ids) for (const talentIndex of [0, 1]) {
    const structure = structures.find(item => item.basicInfo.operatorId === operatorId && item.basicInfo.talentIndex === talentIndex)
    assert.ok(structure, `${operatorId}/${talentIndex}`)
    const markup = renderToStaticMarkup(createElement(Page, { rows, loading: false, initialSelection: { operatorId, talentIndex } }))
    assert.doesNotMatch(markup, /指定された素質の構造を表示できません|\[object Object\]|NaN|undefined/)
    assert.ok(markup.includes(`aria-label="素質${talentIndex + 1} ${escapeHtml(structure.basicInfo.talentName)}"`))
    assert.ok(markup.includes(escapeHtml(structure.source.description)), structure.basicInfo.talentName)
    const table = markup.match(/<table class="skill-structure-table talent-structure-effects-table">([\s\S]*?)<\/table>/)
    assert.ok(table, structure.basicInfo.talentName)
    assert.deepEqual([...table[1].matchAll(/<th scope="col">([^<]*)<\/th>/g)].map(([, text]) => text),
      ['タイミング', '条件', '対象', '項目', '演算', '値'])
    for (const [, row] of table[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      if (row.includes('scope="col"')) continue
      assert.equal((row.match(/<td>/g) ?? []).length, 6)
    }
  }
})

test('追加効果の定義をすべて開けて、計算式や条件も未整形のオブジェクトにならない', () => {
  for (const structure of structures) for (const effect of structure.effects) {
    const markup = renderToStaticMarkup(createElement(DefinitionTable, { effect }))
    assert.match(markup, /<th scope="row">/)
    assert.doesNotMatch(markup, /\[object Object\]|NaN|undefined/, `${structure.basicInfo.talentName}/${effect.item}`)
  }
})
