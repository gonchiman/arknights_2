import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

// Independent JP candidates, not the implementation's structure registry.
const source = JSON.parse(readFileSync(new URL('./fixtures/talentStructureFourOperators.json', import.meta.url), 'utf8'))
let server, Page, DefinitionTable, rows, structures
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;',
})[character])
const cleanText = value => String(value).replace(/<[^>]+>/g, '').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()
const render = (initialSelection, props = {}) => renderToStaticMarkup(createElement(Page, {
  rows, loading: false, initialSelection, ...props,
}))

function content(markup) {
  const match = markup.match(/<(?:section|div)\b[^>]*class="[^"]*\btalent-structure-content\b[^"]*"[^>]*>/)
  assert.ok(match, 'selected talent structure must be rendered')
  return markup.slice(match.index)
}

function definitionRows(effect) {
  const markup = renderToStaticMarkup(createElement(DefinitionTable, { effect }))
  return [...markup.matchAll(/<tr><th scope="row">([\s\S]*?)<\/th><td>([\s\S]*?)<\/td><\/tr>/g)]
    .map(([, label, value]) => [cleanText(label), cleanText(value)])
}

function assertDefinitionRow(entries, label, value) {
  assert.ok(entries.some(([actualLabel, actualValue]) => actualLabel === label && actualValue === String(value)),
    `${label}: ${value}\n${JSON.stringify(entries)}`)
}

before(async () => {
  server = await createServer({
    configFile: false, plugins: [react()], logLevel: 'error',
    cacheDir: 'node_modules/.vite/talent-structure-test', resolve: { preserveSymlinks: true },
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  ;({ TalentStructurePage: Page, TalentEffectDefinitionTable: DefinitionTable } = await server.ssrLoadModule('/src/components/TalentStructurePage.tsx'))
  // Three source skill records per OP exercise the existing site's population
  // without tripling the talent buttons. Talent selection uses its own slot.
  rows = source.flatMap(operator => [1, 2, 3].map(skillIndex => ({
    ...operator, id: `${operator.operatorId}:fixture-skill-${skillIndex}`,
    subProfessionId: operator.subProfessionName, nameInitial: 'S_ROW',
    skillIndex, skillId: `fixture_skill_${skillIndex}`, skillName: `試験スキル${skillIndex}`,
    description: '', duration: 0, durationType: 'NONE', skillType: 'MANUAL',
    spType: 'INCREASE_WITH_TIME', initSp: 0, spCost: 1,
    classification: {}, skillLevels: [{}], raw: {},
  })))
  const { buildTalentStructures } = await server.ssrLoadModule('/src/lib/talentStructure.ts')
  structures = buildTalentStructures(rows)
})
after(async () => { await server?.close() })

test('初期表示はスルトの劫火で、素質構造を4区分で表示する', () => {
  const markup = render()
  assert.match(markup, /role="tab" aria-selected="true"[^>]*>効果構造/)
  assert.equal((markup.match(/role="tab" /g) ?? []).length, 4)
  assert.equal((markup.match(/aria-hidden="true" inert=""/g) ?? []).length, 3)
  for (const label of ['基本情報', '分類情報', '適用・発動', '効果構造']) assert.ok(markup.includes(label), label)
  assert.match(markup, /aria-label="素質1 劫火"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*aria-label="素質1 劫火"/)
  assert.match(content(markup), /術耐性/)
  assert.match(content(markup), /20/)
  assert.match(markup, /潜在1/)
  assert.match(markup, /MODなし/)
})

test('独立fixtureの全8素質を選択でき、対応OPの二つの素質だけを選択肢にする', () => {
  assert.equal(source.length, 4)
  assert.equal(source.reduce((sum, operator) => sum + operator.operatorProfile.talents.length, 0), 8)
  for (const operator of source) for (const [talentIndex, talent] of operator.operatorProfile.talents.entries()) {
    const candidate = talent.candidates[0]
    const markup = render({ operatorId: operator.operatorId, talentIndex })
    const selectionButtons = [...markup.matchAll(/<button\b[^>]*aria-label="素質\d+ [^"]*"[^>]*>/g)].map(match => match[0])
    assert.equal(selectionButtons.length, 2, `${operator.operatorId}/${talentIndex}`)
    assert.equal(selectionButtons.filter(button => /aria-pressed="true"/.test(button)).length, 1)
    for (const [index, sibling] of operator.operatorProfile.talents.entries()) {
      assert.ok(selectionButtons.some(button => button.includes(`aria-label="素質${index + 1} ${escapeHtml(sibling.candidates[0].name)}"`)), sibling.candidates[0].name)
    }
    assert.ok(content(markup).includes(escapeHtml(candidate.name)), candidate.name)
  }
})

test('全8素質の効果一覧は1属性1セルの同じ6列を維持する', () => {
  for (const operator of source) for (const talentIndex of [0, 1]) {
    const markup = content(render({ operatorId: operator.operatorId, talentIndex }))
    const table = markup.match(/<table class="skill-structure-table talent-structure-effects-table">([\s\S]*?)<\/table>/)
    assert.ok(table)
    const headers = [...table[1].matchAll(/<th scope="col">([^<]*)<\/th>/g)].map(([, text]) => text)
    assert.deepEqual(headers, ['タイミング', '条件', '対象', '項目', '演算', '値'])
    for (const [, row] of table[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      if (row.includes('scope="col"')) continue
      assert.equal((row.match(/<td>/g) ?? []).length, 6)
      assert.doesNotMatch(row, /colspan=|rowspan=|<small|<br/)
    }
  }
})

test('素質説明文は選択欄に常時表示し、素質を変えると原典の内容へ切り替わる', () => {
  for (const operator of source) for (const [talentIndex, talent] of operator.operatorProfile.talents.entries()) {
    const markup = render({ operatorId: operator.operatorId, talentIndex })
    const description = markup.match(/<section\b[^>]*aria-label="素質説明文"[^>]*>([\s\S]*?)<\/section>/)
    assert.ok(description, `${operator.operatorId}/${talentIndex}`)
    assert.ok(cleanText(description[1]).includes(escapeHtml(cleanText(talent.candidates[0].description))), talent.candidates[0].name)
    assert.doesNotMatch(description[0], /\bhidden=|aria-hidden="true"/)
    assert.doesNotMatch(markup, /説明文を表示|説明文を閉じる/)
  }
})

test('カリスマは自身の攻撃力と編成中の全員再配置補正を別効果として表示する', () => {
  const markup = content(render({ operatorId: 'char_172_svrash', talentIndex: 0 }))
  for (const token of ['攻撃力', '＋10％', '再配置', '－10％', '自身', '味方', '編成']) {
    assert.ok(markup.includes(token), token)
  }
})

test('スカジの陣営対象と固定秒数の再配置短縮を取り違えずに表示する', () => {
  const buff = content(render({ operatorId: 'char_263_skadi', talentIndex: 0 }))
  for (const token of ['アビサルハンター', '＋14％', '編成']) assert.ok(buff.includes(token), token)
  const redeploy = content(render({ operatorId: 'char_263_skadi', talentIndex: 1 }))
  assert.match(redeploy, /再配置/)
  assert.match(redeploy, /－10秒/)
  assert.doesNotMatch(redeploy, /－10％/)
})

test('余燼は致命的なダメージ・HP1・8秒後退場を保持し、耐性無視とは別の構造を表示する', () => {
  const markup = content(render({ operatorId: 'char_350_surtr', talentIndex: 1 }))
  for (const token of ['致命', 'HP', '8秒', '退場']) assert.ok(markup.includes(token), token)
  assert.match(markup, /aria-label="HPの定義"/)
  assert.doesNotMatch(markup, /<td>劫火<\/td>/)
  assert.match(markup, /保留/)
})

test('神経猛毒は対象条件ごとの毎秒量を表示し、毎秒量を1秒tickと決めつけない', () => {
  const markup = content(render({ operatorId: 'char_293_thorns', talentIndex: 0 }))
  for (const token of ['継続ダメージ', '125/秒', '250/秒', '遠距離攻撃が可能な敵', '遠距離攻撃を行えない敵']) assert.ok(markup.includes(token), token)
  assert.match(markup, /保留/)
  assert.match(markup, /tick間隔・初回時刻を未確定/)
  assert.match(markup, /非重複・再付与時は持続時間のみ更新/)
})

test('毒の定義は敵の属性条件と持続3秒を別項目で表示し、処理時刻を未確定とする', () => {
  const poison = structures.find(entry => entry.basicInfo.operatorId === 'char_293_thorns' && entry.basicInfo.talentIndex === 0)
  assert.ok(poison)
  assert.equal(poison.effects.length, 2)
  for (const [index, effect] of poison.effects.entries()) {
    const entries = definitionRows(effect)
    assertDefinitionRow(entries, '固定値', index === 0 ? 125 : 250)
    assertDefinitionRow(entries, '量の基準', 'FIXED')
    assertDefinitionRow(entries, '量の時間単位', 'PER_SECOND')
    assertDefinitionRow(entries, '持続時間（秒）', 3)
    assertDefinitionRow(entries, 'ダメージ種別', '術')
    assertDefinitionRow(entries, '条件の指標', 'target.canUseRangedAttack')
    assertDefinitionRow(entries, '条件の値', index === 1 ? 'はい' : 'いいえ')
    for (const label of ['初回ダメージの時刻（秒）', '処理間隔（秒）']) assertDefinitionRow(entries, label, '未確定')
    assertDefinitionRow(entries, '最大重複数', 1)
    assertDefinitionRow(entries, '重複方式', 'REPLACE')
    assertDefinitionRow(entries, '再付与時の更新', 'RESET_DURATION')
    assert.doesNotMatch(JSON.stringify(entries), /attackDistanceType|1秒ごと/)
  }
})

test('故郷の濤声の無通常攻撃待機条件とHP割合回復を表示する', () => {
  const markup = content(render({ operatorId: 'char_293_thorns', talentIndex: 1 }))
  for (const token of ['2秒', '通常攻撃', '3.5', '最大HP', '1秒']) assert.ok(markup.includes(token), token)
})

test('ホークビジョンは攻撃範囲内の敵のステルス無効を表示する', () => {
  const markup = content(render({ operatorId: 'char_172_svrash', talentIndex: 1 }))
  for (const token of ['攻撃範囲', '敵', 'ステルス', '無効']) assert.ok(markup.includes(token), token)
})

test('余燼の残HPと強制退場までの遅延は別定義で、発動後のHP処理を捏造しない', () => {
  const remnant = structures.find(entry => entry.basicInfo.operatorId === 'char_350_surtr' && entry.basicInfo.talentIndex === 1)
  assert.ok(remnant)
  const [hp, retreat] = remnant.effects.map(definitionRows)
  assertDefinitionRow(hp, '発生方式', 'EVENT')
  assertDefinitionRow(hp, '発生イベント', '致命ダメージ')
  assertDefinitionRow(hp, '値', 1)
  assert.ok(!hp.some(([label]) => label === '待ち時間（秒）'))
  assertDefinitionRow(retreat, '発生方式', 'AFTER_EVENT')
  assertDefinitionRow(retreat, '発生イベント', '致命ダメージ')
  assertDefinitionRow(retreat, '待ち時間（秒）', 8)
  const markup = content(render({ operatorId: 'char_350_surtr', talentIndex: 1 }))
  for (const token of ['回復・再被撃・再度の致命ダメージ', '退場タイマーの再起動可否', '発動後の処理は仮定しない']) assert.ok(markup.includes(token), token)
})

test('共通定義テーブルは他者の対象選択・複合条件・確率を別々の行で表示する', () => {
  const template = structures.find(entry => entry.basicInfo.operatorId === 'char_172_svrash' && entry.basicInfo.talentIndex === 0).effects[0]
  const effect = {
    ...template,
    target: {
      type: 'RECIPIENTS', side: 'ALLY', entity: 'UNIT', scope: 'ATTACK_RANGE', includeSelf: false,
      factionIds: ['fixture_faction'], tagIds: ['fixture_tag'],
      selection: { type: 'RANDOM', count: 1 },
    },
    condition: { type: 'ALL', conditions: [
      { type: 'COMPARE', metric: 'source.hpRatio', comparison: 'LTE', value: 0.5 },
      { type: 'ANY', conditions: [
        { type: 'COMPARE', metric: 'source.blockCount', comparison: 'GTE', value: 1 },
        { type: 'COMPARE', metric: 'target.isBlocked', comparison: 'EQ', value: true },
      ] },
    ] },
    probability: { chance: 0.25, rollScope: 'APPLICATION', sharedRollId: 'fixture_roll' },
  }
  const entries = definitionRows(effect)
  for (const [label, value] of [
    ['対象の側', 'ALLY'], ['対象の単位', 'UNIT'], ['対象の母集団', 'ATTACK_RANGE'],
    ['自身を含む', 'いいえ'], ['陣営ID（いずれか）', 'fixture_faction'], ['タグID（すべて）', 'fixture_tag'],
    ['対象の選び方', 'RANDOM'], ['選択数', 1], ['条件の結合', 'すべて成立'], ['条件2の結合', 'いずれか成立'],
    ['発動確率', '25％'], ['抽選単位', 'APPLICATION'], ['共有する抽選', 'fixture_roll'],
  ]) assertDefinitionRow(entries, label, value)
  for (const metric of ['source.hpRatio', 'source.blockCount', 'target.isBlocked']) {
    assert.ok(entries.some(([label, value]) => label.endsWith('の指標') && value === metric), metric)
  }
})

test('共通定義テーブルは線形値の定数・係数・指標・上下限を各行で表示する', () => {
  const template = structures.find(entry => entry.basicInfo.operatorId === 'char_172_svrash' && entry.basicInfo.talentIndex === 0).effects[0]
  const entries = definitionRows({ ...template, value: {
    type: 'AFFINE', base: 0.1, coefficient: 0.02, metric: 'source.blockCount', min: 0.1, max: 0.5,
  } })
  for (const [label, value] of [
    ['値の形式', '定数＋係数×指標'], ['値の定数', 0.1], ['値の係数', 0.02],
    ['値の指標', 'source.blockCount'], ['値の下限', 0.1], ['値の上限', 0.5],
  ]) assertDefinitionRow(entries, label, value)
})

test('線形値の上下限なしと取得できない数値を区別して表示する', () => {
  const template = structures.find(entry => entry.basicInfo.operatorId === 'char_172_svrash' && entry.basicInfo.talentIndex === 0).effects[0]
  const entries = definitionRows({ ...template, value: {
    type: 'AFFINE', base: null, coefficient: 0.02, metric: 'source.blockCount',
  } })
  assertDefinitionRow(entries, '値の定数', '未確認')
  assertDefinitionRow(entries, '値の係数', 0.02)
  assertDefinitionRow(entries, '値の下限', '下限なし')
  assertDefinitionRow(entries, '値の上限', '上限なし')
})

test('効果の定義ボタンは閉じた定義領域を参照し、タブはそれぞれ対応するpanelを持つ', () => {
  for (const operator of source) for (const talentIndex of [0, 1]) {
    const markup = render({ operatorId: operator.operatorId, talentIndex })
    const definitions = [...markup.matchAll(/<button\b[^>]*aria-label="[^"]+の定義"[^>]*aria-controls="([^"]+)"[^>]*aria-expanded="false"[^>]*>/g)]
    assert.ok(definitions.length >= 1)
    for (const [, id] of definitions) {
      assert.ok(markup.includes(`id="${id}" class="skill-structure-definition" hidden=""`), id)
    }
    for (const match of markup.matchAll(/<button\b[^>]*id="([^"]+)"[^>]*role="tab"[^>]*aria-controls="([^"]+)"[^>]*>/g)) {
      assert.ok(markup.includes(`id="${match[2]}" class="skill-structure-tab-panel" role="tabpanel" aria-labelledby="${match[1]}"`))
    }
  }
})

test('保留事項は該当素質だけに表示し、根拠リンクを外部参照として保持する', () => {
  const titles = ['発動後のHP処理と強制退場の境界', '毒の重複・更新とダメージ発生時刻', '非通常攻撃時間の判定と回復開始時刻']
  const selectors = ['char_350_surtr/1', 'char_293_thorns/0', 'char_293_thorns/1']
  for (const operator of source) for (const talentIndex of [0, 1]) {
    const markup = content(render({ operatorId: operator.operatorId, talentIndex }))
    const active = selectors.indexOf(`${operator.operatorId}/${talentIndex}`)
    assert.equal(markup.includes('<summary>構造化の補足・保留事項</summary>'), active >= 0)
    for (const [index, title] of titles.entries()) assert.equal(markup.includes(`<td>${title}</td>`), index === active, title)
    if (active >= 0) {
      assert.match(markup, /<a href="https:\/\/[^\"]+" target="_blank" rel="noopener noreferrer">JPオペレーターデータ<\/a>/)
    }
  }
})

test('未対応OP・素質枠とmalformed URLは既定のスルトへ置き換えない', () => {
  const unsupported = { ...rows[0], id: 'char_4009_irene:fixture', operatorId: 'char_4009_irene', operatorName: 'アイリーニ' }
  for (const [initialSelection, props] of [
    [{ operatorId: unsupported.operatorId, talentIndex: 0 }, { rows: [...rows, unsupported] }],
    [{ operatorId: 'char_350_surtr', talentIndex: 2 }, {}],
    [{ operatorId: 'char_350_surtr', talentIndex: -1 }, {}],
    [undefined, { invalidSelection: true }],
    [{ operatorId: 'char_350_surtr', talentIndex: 0 }, { invalidSelection: true }],
  ]) {
    const markup = render(initialSelection, props)
    assert.doesNotMatch(markup, /class="[^"]*\btalent-structure-content\b|aria-label="素質説明文"/)
    assert.match(markup, /見つかりません|表示できません|指定|対応/)
  }
})

test('データ読み込み中と空データでは、存在しないOPの構造を先に表示しない', () => {
  for (const loading of [true, false]) {
    const markup = render(undefined, { rows: [], loading })
    assert.doesNotMatch(markup, /class="[^"]*\btalent-structure-content\b/)
    assert.match(markup, loading ? /読み込み/ : /取得|ありません|選択/)
  }
})
