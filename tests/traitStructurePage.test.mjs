import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const profiles = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardProfiles.json', import.meta.url), 'utf8'))
const { guards } = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardSources.json', import.meta.url), 'utf8'))
const jobNames = { artsfghter: '術戦士', fearless: '勇士', fighter: '闘士', lord: '領主', crusher: '重剣士',
  hammer: '槌撃士', sword: '剣豪', centurion: '強襲者', musha: '武者', instructor: '教官', reaper: '鎌撃士', librator: '解放者' }
const rows = profiles.flatMap(profile => {
  const source = guards.find(guard => guard.id === profile.operatorId)
  return [1, 2, 3].map(skillIndex => ({ ...profile, id: `${source.id}:s${skillIndex}`,
    operatorName: source.name, profession: 'WARRIOR', professionLabel: '前衛', rarity: 6,
    subProfessionId: source.subProfessionId, subProfessionName: jobNames[source.subProfessionId],
    skillIndex, skillId: `fixture_skill_${skillIndex}`, skillName: `試験スキル${skillIndex}`,
    description: '', duration: 0, durationType: 'NONE', skillType: 'MANUAL',
    spType: 'INCREASE_WITH_TIME', initSp: 0, spCost: 1, classification: {}, skillLevels: [{}], raw: {},
  }))
})
let server, Page, Definition, buildStructures
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()], logLevel: 'error',
    cacheDir: '.cache/vite-trait-structure-page-test', resolve: { preserveSymlinks: true },
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  ;({ TraitStructurePage: Page, TraitEffectDefinitionTable: Definition } =
    await server.ssrLoadModule('/src/components/TraitStructurePage.tsx'))
  ;({ buildTraitStructures: buildStructures } = await server.ssrLoadModule('/src/lib/traitStructure.ts'))
})
after(async () => { await server?.close() })
const render = (initialSelection, props = {}) => renderToStaticMarkup(createElement(Page, { rows, loading: false, initialSelection, ...props }))

test('初期表示はスルトの特性で、既存構造ページと同じ4区分と6列を使う', () => {
  const markup = render()
  assert.match(markup, /<h1>特性構造<\/h1>/)
  assert.match(markup, /aria-label="特性説明文"><p>敵に術ダメージを与える<\/p>/)
  assert.equal((markup.match(/role="tab" /g) || []).length, 4)
  assert.match(markup, /role="tab" aria-selected="true"[^>]*>効果構造/)
  assert.equal((markup.match(/aria-hidden="true" inert=""/g) || []).length, 3)
  const table = markup.match(/<table class="skill-structure-table trait-structure-effects-table">([\s\S]*?)<\/table>/)[1]
  assert.deepEqual([...table.matchAll(/<th scope="col">([^<]*)<\/th>/g)].map(match => match[1]),
    ['タイミング', '条件', '対象', '項目', '演算', '値'])
  for (const [, row] of table.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)) {
    for (const [, cells] of row.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      assert.equal((cells.match(/<td>/g) || []).length, 6)
      assert.doesNotMatch(cells, /<small|<br|colspan|rowspan/)
    }
  }
})

test('登録済み30人の特性を選択でき、スキルごとに同じ効果を重複表示しない', () => {
  for (const { operatorId } of profiles) {
    const markup = render({ operatorId })
    assert.match(markup, /class="skill-structure-content trait-structure-content"/)
    assert.match(markup, /aria-label="特性説明文"/)
    assert.doesNotMatch(markup, /表示できません|NaN|undefined|Infinity/)
    const effects = buildStructures(rows.filter(row => row.operatorId === operatorId))[0].effects
    const table = markup.match(/<table class="skill-structure-table trait-structure-effects-table">([\s\S]*?)<\/table>/)[1]
    assert.equal((table.match(/class="skill-structure-effect-link"/g) || []).length, effects.length)
  }
})

test('効果名から定義を参照し、構造化と計算への適用方法を区別できる', () => {
  const structure = buildStructures(rows).find(entry => entry.basicInfo.operatorId === 'char_263_skadi')
  const effect = structure.effects[0]
  const markup = renderToStaticMarkup(createElement(Definition, { effect }))
  assert.match(markup, /scope="row"/)
  assert.match(markup, /基礎|基本/)
  assert.doesNotMatch(markup, /colspan|rowspan|NaN|undefined/)
  const page = render()
  for (const [, id] of page.matchAll(/aria-controls="([^"]+-effect-definition)" aria-expanded="false"/g)) {
    assert.ok(page.includes(`id="${id}" class="skill-structure-definition" hidden=""`))
  }
  for (const [, tab, panel] of page.matchAll(/id="([^"]+)"[^>]*role="tab"[^>]*aria-selected="[^"]+" aria-controls="([^"]+)"/g)) {
    assert.ok(page.includes(`id="${panel}" class="skill-structure-tab-panel" role="tabpanel" aria-labelledby="${tab}"`))
  }
})

test('未対応OPや不正な選択をスルトの特性で代用しない', () => {
  for (const [selection, props] of [[{ operatorId: 'char_456_ash' }, {}], [undefined, { invalidSelection: true }],
    [{ operatorId: 'char_350_surtr' }, { invalidSelection: true }]]) {
    const markup = render(selection, props)
    assert.doesNotMatch(markup, /class="skill-structure-content trait-structure-content"|aria-label="特性説明文"/)
    assert.match(markup, /指定|表示できません/)
  }
})

test('読み込みと空データ、説明文が変わって未確認になったデータを区別する', () => {
  assert.match(render(undefined, { rows: [], loading: true }), /読み込み中/)
  assert.match(render(undefined, { rows: [] }), /表示できません/)
  const changed = rows.filter(row => row.operatorId === 'char_350_surtr').map(row => ({ ...row,
    operatorProfile: { ...row.operatorProfile, trait: null, traitDescription: '独自の未確認効果' },
  }))
  const markup = render(undefined, { rows: changed })
  assert.match(markup, /独自の未確認効果/)
  assert.match(markup, /未確認|確認できない/)
  assert.doesNotMatch(markup, /class="skill-structure-effect-link"/)
})

test('スクロール表は名前とフォーカスを持ち、保留内容を参照できる', () => {
  const structures = buildStructures(rows)
  const partial = structures.find(entry => entry.notes.length > 0)
  assert.ok(partial)
  const partialPage = render({ operatorId: partial.basicInfo.operatorId })
  assert.match(partialPage, /<summary>構造化の保留事項<\/summary>/)
  assert.match(partialPage, /tabindex="0" role="region" aria-label="[^"]+"/)
})
