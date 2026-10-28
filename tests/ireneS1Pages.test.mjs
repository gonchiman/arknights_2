import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

// Independent, pinned JP character/skill candidates; no registry is used to create input rows.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/ireneS1.json', import.meta.url), 'utf8'))
const selection = { operatorId: fixture.operator.operatorId, skillId: fixture.skill.skillId, skillIndex: 1, levelIndex: 9 }
let server, SkillPage, TalentPage, TalentDefinitionTable, Calculator, ResultTable, ComponentTable, ApplicationTable, buildOutput, buildApplications, buildTalents, row
const plainText = markup => markup.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
const tableRows = markup => [...markup.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(([, cells]) =>
  [...cells.matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/g)].map(([, value]) => plainText(value)))
function table(markup, className) {
  const contents = markup.match(new RegExp(`<table\\b[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/table>`))
  assert.ok(contents, className)
  return tableRows(contents[1])
}
const renderCalculator = () => renderToStaticMarkup(createElement(Calculator, { rows: [row], loading: false, initialSelection: selection }))
const calculationInput = conditions => ({ operator: row, skill: row, phaseIndex: 2, operatorLevel: 90, trust: 100, skillLevelIndex: 9, conditions })
const calculate = conditions => buildOutput(calculationInput(conditions))

before(async () => {
  server = await createServer({
    configFile: false, plugins: [react()], logLevel: 'error',
    cacheDir: 'node_modules/.vite/irene-s1-pages-test', resolve: { preserveSymlinks: true },
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  ;({ SkillStructurePage: SkillPage } = await server.ssrLoadModule('/src/components/SkillStructurePage.tsx'))
  ;({ TalentStructurePage: TalentPage, TalentEffectDefinitionTable: TalentDefinitionTable } = await server.ssrLoadModule('/src/components/TalentStructurePage.tsx'))
  ;({ DamageCalculatorThree: Calculator, DamageCalculatorThreeResultTable: ResultTable,
    DamageCalculatorThreeAttackComponentTable: ComponentTable, DamageCalculatorThreeApplicationTable: ApplicationTable,
  } = await server.ssrLoadModule('/src/components/DamageCalculatorThree.tsx'))
  ;({ buildDamageCalculatorThreeOutput: buildOutput } = await server.ssrLoadModule('/src/lib/damageCalculatorThree.ts'))
  ;({ buildDamageCalculatorThreeApplicationRows: buildApplications } = await server.ssrLoadModule('/src/lib/damageCalculatorThreeApplications.ts'))
  ;({ buildTalentStructures: buildTalents } = await server.ssrLoadModule('/src/lib/talentStructure.ts'))
  const { classifySkill } = await server.ssrLoadModule('/src/lib/classifier.ts')
  const { expandSkillDescription } = await server.ssrLoadModule('/src/lib/skillJsonAnalysis.ts')
  const level = fixture.skill.levels[9]
  row = {
    ...fixture.operator, id: `${selection.operatorId}:${selection.skillId}`,
    professionLabel: '前衛', subProfessionName: '剣豪', rarity: 6, nameInitial: 'A_ROW',
    skillId: selection.skillId, skillIndex: 1, skillName: level.name,
    description: expandSkillDescription(level.description, level.blackboard), duration: level.duration,
    durationType: level.durationType, skillType: level.skillType, spType: level.spData.spType,
    initSp: level.spData.initSp, spCost: level.spData.spCost, classification: classifySkill(level),
    skillLevels: structuredClone(fixture.skill.levels), raw: structuredClone(level),
    operatorProfile: { ...structuredClone(fixture.operatorProfile),
      traitDescription: fixture.operator.description, affiliationIds: fixture.operator.affiliationIds },
  }
})
after(async () => { await server?.close() })

test('独立Irene fixtureのS1だけを構造ページで選択し、常時説明と保留根拠を参照できる', () => {
  const markup = renderToStaticMarkup(createElement(SkillPage, { rows: [row], loading: false, initialSelection: selection }))
  const choices = [...markup.matchAll(/<button\b[^>]*aria-label="S\d [^"]+"[^>]*>/g)]
  assert.equal(choices.length, 1)
  assert.match(choices[0][0], /aria-label="S1 舞風"/)
  assert.match(markup, /aria-label="スキル説明文"/)
  assert.match(markup, /次の通常攻撃時/)
  assert.match(markup, /200%/)
  assert.match(markup, /浮遊/)
  const stages = table(markup, 'skill-structure-stage-table')
  assert.deepEqual(stages[0], ['段階', '段階の適用条件', '持続時間', '終了条件', '対象の初期状態'])
  assert.equal(stages[1].at(-1), '地上')
  assert.match(markup, /浮遊の経過時間と打撃間の状態変化/)
  assert.match(markup, /href="https:\/\/old\.sanitygone\.help\/operators\/irene" target="_blank" rel="noopener noreferrer"/)
  assert.doesNotMatch(markup, /リンク先のスキルが見つかりません|未対応のレベル/)
})

test('素質ページで審判の灯火と浄化の剣を選べ、確率・効果量を定義の別行で表示する', () => {
  const structures = buildTalents([row])
  assert.equal(structures.length, 2)
  for (const talentIndex of [0, 1]) {
    const markup = renderToStaticMarkup(createElement(TalentPage, { rows: [row], loading: false,
      initialSelection: { operatorId: selection.operatorId, talentIndex } }))
    assert.match(markup, /aria-label="素質1 審判の灯火"/)
    assert.match(markup, /aria-label="素質2 浄化の剣"/)
    assert.match(markup, /aria-label="素質説明文"/)
    assert.equal(table(markup, 'talent-structure-effects-table')[0].length, 6)
  }
  const defenseIgnore = structures.find(entry => entry.basicInfo.talentIndex === 0)
  const definitions = defenseIgnore.effects.map(effect => tableRows(renderToStaticMarkup(createElement(TalentDefinitionTable, { effect }))))
  assert.ok(definitions[0].some(values => values[0] === '発動確率' && values[1] === '50％'))
  assert.ok(definitions[1].some(values => values[0] === '発動確率' && values[1] === '100％'))
  assert.ok(definitions[0].some(values => values[0] === '値' && values[1] === '0.5'))
})

test('計算機3の共通boolean選択で浮遊可能・海の怪物なしを明示し、地上の敵を条件表示する', () => {
  const markup = renderCalculator()
  const options = label => {
    const select = markup.match(new RegExp(`<select\\b[^>]*aria-label="${label}"[^>]*>([\\s\\S]*?)<\\/select>`))
    assert.ok(select, label)
    return [...select[1].matchAll(/<option value="([^"]+)"([^>]*)>([^<]*)<\/option>/g)]
      .map(([, value, attributes, label]) => [value, label, attributes.includes('selected=""')])
  }
  assert.deepEqual(options('浮遊の適用'), [['true', '可能', true], ['false', '無効', false]])
  assert.deepEqual(options('戦場の海の怪物'), [['false', 'なし', true], ['true', 'あり', false]])
  assert.match(markup, /地上の敵/)
  assert.doesNotMatch(markup, /aria-label="(?:飛行|初期浮遊)/)
  const talents = table(markup, 'damage-three-application-table')
  assert.deepEqual(talents[0], ['区分', '名称', '項目', '値', 'タイミング', '発動確率', '条件', '状態'])
  assert.ok(talents.slice(1).every(values => values.length === 8))
  assert.ok(talents.some(values => values[5] === '50％'))
  assert.ok(talents.some(values => values[5] === '100％'))
})

test('浮遊成功時は両打撃を浮遊・100％無視として個別表示し、traitの2ヒットで再倍増しない', () => {
  const output = calculate({ targetCanBeLevitated: true, seaMonsterPresent: false })
  const result = table(renderToStaticMarkup(createElement(ResultTable, { output, precision: 1 })), 'damage-three-result-table')
  assert.deepEqual(result.find(values => values[0] === '0'), ['0', '2,804.0', '2,804.0'])
  assert.deepEqual(result.find(values => values[0] === '500'), ['500', '2,304.0', '2,304.0'])
  const componentsMarkup = renderToStaticMarkup(createElement(ComponentTable, { output, precision: 1 }))
  const components = table(componentsMarkup, 'damage-three-attack-component-table')
  assert.deepEqual(components[0], ['敵の防御力', '攻撃順', '命中時状態', '防御無視の確率', 'ダメージ期待値'])
  assert.deepEqual(components.filter(values => values[0] === '500'), [
    ['500', '1', '浮遊', '100％', '1,152.0'], ['500', '2', '浮遊', '100％', '1,152.0'],
  ])
  assert.doesNotMatch(componentsMarkup, /colspan|rowspan|<small|<br/)
  assert.doesNotMatch(renderCalculator(), /最低保証ダメージ/)
  assert.ok(result[0].every(value => !value.includes('DPS')))
})

test('浮遊無効時は両打撃の50％防御無視を期待値として表示し、単純な一律50％無視にしない', () => {
  const output = calculate({ targetCanBeLevitated: false, seaMonsterPresent: false })
  const markup = renderToStaticMarkup(createElement(ResultTable, { output, precision: 1 }))
  const result = table(markup, 'damage-three-result-table')
  assert.match(markup, /強化攻撃1回のダメージ期待値/)
  assert.match(markup, /aria-label="最低保証ダメージ"/)
  assert.deepEqual(result.find(values => values[0] === '500'), ['500', '2,054.0', '2,054.0'])
  const components = table(renderToStaticMarkup(createElement(ComponentTable, { output, precision: 1 })), 'damage-three-attack-component-table')
  assert.deepEqual(components.filter(values => values[0] === '500'), [
    ['500', '1', '地上', '50％', '1,027.0'], ['500', '2', '地上', '50％', '1,027.0'],
  ])
  for (const precision of [0, 3]) {
    const values = table(renderToStaticMarkup(createElement(ComponentTable, { output, precision })), 'damage-three-attack-component-table')
      .find(values => values[0] === '500')
    assert.equal(values[4], precision === 0 ? '1,027' : '1,027.000')
  }
})

test('海の怪物条件は攻撃速度18と36を切り替え、強化攻撃ダメージへ再乗算しない', () => {
  for (const [seaMonsterPresent, expectedSpeed] of [[false, '18'], [true, '36']]) {
    const input = calculationInput({ targetCanBeLevitated: true, seaMonsterPresent })
    const output = buildOutput(input)
    const applications = buildApplications(input, output)
    const talents = table(renderToStaticMarkup(createElement(ApplicationTable, { rows: applications })), 'damage-three-application-table')
    const applied = talents.find(values => values[2] === '攻撃速度' && values[3] === expectedSpeed)
    assert.ok(applied)
    assert.equal(applied[3], expectedSpeed)
    assert.equal(applied.at(-1), '計算対象外', '強化攻撃1回のダメージには攻撃速度を加算しない')
    const result = table(renderToStaticMarkup(createElement(ResultTable, { output, precision: 1 })), 'damage-three-result-table')
    assert.deepEqual(result.find(values => values[0] === '500'), ['500', '2,304.0', '2,304.0'])
  }
})

test('順序付き攻撃の使用値に単一倍率・単一pipeline・通常2ヒットの表示を流用しない', () => {
  const values = table(renderCalculator(), 'damage-three-value-table')
  const labels = values.map(values => values[0])
  for (const label of ['攻撃倍率', '軽減前の攻撃ダメージ', '特性による遠距離倍率', '1攻撃のヒット数', '計算上の攻撃間隔']) {
    assert.ok(!labels.includes(label), label)
  }
  assert.deepEqual(values.find(values => values[0] === '攻撃の内訳数'), ['攻撃の内訳数', '2'])
  assert.deepEqual(values.find(values => values[0] === '基礎攻撃力'), ['基礎攻撃力', '701'])
})

test('行データがないS2/S3や別レベルにS1特化3の出力を代用しない', () => {
  for (const initialSelection of [
    { ...selection, skillIndex: 2, skillId: 'skchr_irene_2' },
    { ...selection, skillIndex: 3, skillId: 'skchr_irene_3' },
    { ...selection, levelIndex: 8 },
  ]) {
    const markup = renderToStaticMarkup(createElement(Calculator, { rows: [row], loading: false, initialSelection }))
    assert.doesNotMatch(markup, /damage-three-result-table|damage-three-attack-component-table/)
    assert.match(markup, /対象外/)
  }
})
