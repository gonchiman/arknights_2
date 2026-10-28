import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const original = JSON.parse(readFileSync(new URL('./fixtures/ireneS1.json', import.meta.url), 'utf8'))
const fixture = JSON.parse(readFileSync(new URL('./fixtures/ireneS2S3.json', import.meta.url), 'utf8'))
let server, Calculator, ResultTable, ComponentTable, StructurePage, buildOutput, rows
const text = value => value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
function table(markup, className) {
  const body = markup.match(new RegExp(`<table\\b[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/table>`))
  assert.ok(body, className)
  return [...body[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(([, row]) =>
    [...row.matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/g)].map(([, cell]) => text(cell)))
}
const selection = skillIndex => ({ operatorId: original.operator.operatorId,
  skillId: `skchr_irene_${skillIndex}`, skillIndex, levelIndex: 9 })
const render = skillIndex => renderToStaticMarkup(createElement(Calculator, { rows, loading: false,
  initialSelection: selection(skillIndex) }))
const calculate = (skillIndex, conditions = {}) => {
  const skill = rows.find(row => row.skillIndex === skillIndex)
  return buildOutput({ operator: skill, skill, phaseIndex: 2, operatorLevel: 90, trust: 100, skillLevelIndex: 9, conditions })
}

before(async () => {
  server = await createServer({
    configFile: false, plugins: [react()], logLevel: 'error',
    cacheDir: 'node_modules/.vite/irene-s2-s3-pages-test', resolve: { preserveSymlinks: true },
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  ;({ DamageCalculatorThree: Calculator, DamageCalculatorThreeResultTable: ResultTable,
    DamageCalculatorThreeAttackComponentTable: ComponentTable,
  } = await server.ssrLoadModule('/src/components/DamageCalculatorThree.tsx'))
  ;({ SkillStructurePage: StructurePage } = await server.ssrLoadModule('/src/components/SkillStructurePage.tsx'))
  ;({ buildDamageCalculatorThreeOutput: buildOutput } = await server.ssrLoadModule('/src/lib/damageCalculatorThree.ts'))
  const { classifySkill } = await server.ssrLoadModule('/src/lib/classifier.ts')
  const { expandSkillDescription } = await server.ssrLoadModule('/src/lib/skillJsonAnalysis.ts')
  rows = [original.skill, ...fixture.skills].map(source => {
    const raw = source.levels[9]
    return { ...original.operator, id: `irene-s${source.skillIndex}`,
      professionLabel: '前衛', subProfessionName: '剣豪', rarity: 6, nameInitial: 'A_ROW',
      skillId: source.skillId, skillIndex: source.skillIndex, skillName: raw.name,
      description: expandSkillDescription(raw.description, raw.blackboard), duration: raw.duration,
      durationType: raw.durationType, skillType: raw.skillType, spType: raw.spData.spType,
      initSp: raw.spData.initSp, spCost: raw.spData.spCost, classification: classifySkill(raw),
      skillLevels: structuredClone(source.levels), raw: structuredClone(raw),
      operatorProfile: { ...structuredClone(original.operatorProfile), traitDescription: original.operator.description,
        affiliationIds: original.operator.affiliationIds },
    }
  })
})
after(async () => { await server?.close() })

test('計算機3はS1・S2・S3を同じ3タブで選べ、該当する説明文と2素質を表示する', () => {
  for (const skillIndex of [1, 2, 3]) {
    const markup = render(skillIndex)
    const tabs = markup.match(/<div\b(?=[^>]*role="tablist")(?=[^>]*aria-label="スキル選択")[^>]*>([\s\S]*?)<\/div>/)?.[1]
    assert.ok(tabs)
    const buttons = [...tabs.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
    assert.deepEqual(buttons.map(([, , label]) => text(label)), ['S1 舞風', 'S2 裂潮', 'S3 判決'])
    assert.deepEqual(buttons.map(([, attributes]) => attributes.includes('aria-selected="true"')),
      [1, 2, 3].map(index => index === skillIndex))
    const visiblePanel = [...markup.matchAll(/<div\b([^>]*\bclass="damage-three-skill-panel"[^>]*)>([\s\S]*?)<\/div>/g)]
      .find(([, attributes]) => !/\bhidden\b/.test(attributes))
    const visibleDescription = visiblePanel?.[2].match(/<p\b[^>]*class="damage-three-description"[^>]*>([\s\S]*?)<\/p>/)
    assert.ok(visibleDescription)
    assert.equal(text(visibleDescription[1]), text(rows[skillIndex - 1].description))
    assert.equal((markup.match(/class="damage-three-talent-description"/g) ?? []).length, 2)
    assert.match(markup, /審判の灯火/)
    assert.match(markup, /浄化の剣/)
    assert.doesNotMatch(markup, /この条件では計算できません|NaN|Infinity/)
  }
})

test('S2は重量と浮遊可否を入力し6体上限を表示、S3は初期状態と平均巻き込みを別項目で表示する', () => {
  const s2 = render(2), s3 = render(3)
  for (const markup of [s2, s3]) {
    assert.match(markup, /aria-label="敵の重量"/)
    assert.match(markup, /aria-label="浮遊の適用"/)
  }
  assert.match(s2, /対象数上限[\s\S]*?6体/)
  assert.doesNotMatch(s2, /aria-label="敵の初期状態"|aria-label="砲撃1発の平均命中対象数"/)
  assert.match(s3, /aria-label="敵の初期状態"/)
  assert.match(s3, /<option value="GROUND" selected="">地上<\/option>/)
  assert.match(s3, /<option value="AIRBORNE">飛行<\/option>/)
  assert.match(s3, /aria-label="砲撃1発の平均命中対象数"/)
  assert.doesNotMatch(s3, /aria-label="浮遊中に命中する砲撃数"/, 'lightweight default needs no uncertain timing input')
})

test('結果はスキル1回分の3列とし、S3の1体平均を全対象と区別して出力する', () => {
  const s2 = table(render(2), 'damage-three-result-table')
  assert.equal(s2[0].length, 3)
  assert.ok(s2[0][1].includes('スキル1回の総ダメージ'))
  assert.deepEqual(s2.find(row => row[0] === '1,000'), ['1,000', '2,304', '2,304'])
  const output = calculate(3, { actualAttackTargetCount: 3, splashTargetCount: 1 })
  const markup = renderToStaticMarkup(createElement(ResultTable, { output, precision: 1 }))
  const s3 = table(markup, 'damage-three-result-table')
  assert.equal(s3[0].length, 3)
  assert.ok(s3[0][1].includes('1体平均の'))
  assert.ok(s3[0][1].includes('期待値'))
  assert.deepEqual(s3.find(row => row[0] === '1,000'), ['1,000', '6,613.0', '19,839.0'])
  assert.ok(s3[0].every(cell => !cell.includes('DPS')))
})

test('S3砲撃内訳は区分・打撃数・平均命中数・状態・確率・ダメージを別セルで表示する', () => {
  const output = calculate(3, { targetWeight: 4, airborneHitCount: 5, actualAttackTargetCount: 3, splashTargetCount: 1.5 })
  const markup = renderToStaticMarkup(createElement(ComponentTable, { output, precision: 1 }))
  const data = table(markup, 'damage-three-attack-component-table')
  assert.deepEqual(data[0], ['敵の防御力', '区分', '打撃回数', '1体平均の命中回数', '命中時状態', '防御無視の確率', '1体平均のダメージ期待値'])
  const components = data.filter(row => row[0] === '1,000')
  assert.equal(components.length, 3)
  assert.deepEqual(components.map(row => row.slice(2)), [
    ['1', '1', '浮遊', '100％', '1,603.0'],
    ['5', '2.5', '浮遊', '100％', '3,131.3'],
    ['7', '3.5', '地上', '50％', '3,508.8'],
  ])
  assert.doesNotMatch(markup, /colspan|rowspan|<small|<br/)
})

test('構造ページでS2/S3の発動設定・効果表・対象状態・S3保留事項を参照できる', () => {
  for (const skillIndex of [2, 3]) {
    const markup = renderToStaticMarkup(createElement(StructurePage, { rows, loading: false,
      initialSelection: selection(skillIndex) }))
    const choices = [...markup.matchAll(/<button\b[^>]*aria-label="S\d [^"]+"[^>]*>/g)]
    assert.equal(choices.length, 3)
    assert.match(markup, /aria-label="スキル説明文"/)
    const stage = table(markup, 'skill-structure-stage-table')
    assert.equal(stage[1][2], 'スキル発動1回')
    assert.match(stage[1][4], skillIndex === 2 ? /^地上$/ : /地上.*飛行|選択|指定/)
    const activation = table(markup, 'skill-structure-activation-table')
    assert.deepEqual(activation[1].slice(1, 4), skillIndex === 2 ? ['6', '8', '2'] : ['16', '24', '1'])
    assert.equal(table(markup, 'skill-structure-effects-table')[0].length, 7)
    if (skillIndex === 3) {
      assert.match(markup, /浮遊時間と砲撃の命中時刻/)
      assert.match(markup, /ランダム砲撃の範囲命中と対象の入れ替わり/)
    }
  }
})
