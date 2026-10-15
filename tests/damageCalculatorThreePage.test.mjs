import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const source = JSON.parse(readFileSync(new URL('./fixtures/skillStructureFourOperators.json', import.meta.url), 'utf8'))
let server, Page, ResultTable, EffectTable, buildOutput, rows

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;',
})[character])
const text = markup => markup.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
const selected = (operatorId, skillIndex) => {
  const row = rows.find(candidate => candidate.operatorId === operatorId && candidate.skillIndex === skillIndex)
  assert.ok(row, `${operatorId}/S${skillIndex}`)
  return { operatorId, skillIndex, skillId: row.skillId, levelIndex: 9 }
}
const render = initialSelection => renderToStaticMarkup(createElement(Page, { rows, loading: false, initialSelection }))
const calculate = (operatorId, skillIndex, actualAttackTargetCount = 1) => {
  const skill = rows.find(candidate => candidate.operatorId === operatorId && candidate.skillIndex === skillIndex)
  assert.ok(skill)
  return buildOutput({ operator: skill, skill, phaseIndex: 2, operatorLevel: 90, trust: 100,
    skillLevelIndex: 9, conditions: { actualAttackTargetCount } })
}

function profile(operatorId) {
  const surtr = operatorId === 'char_350_surtr'
  return {
    phases: [{ maxLevel: 50 }, { maxLevel: 80 }, { maxLevel: 90, attributesKeyFrames: [
      { level: 1, data: { atk: surtr ? 544 : 773, baseAttackTime: surtr ? 1.25 : 1.5, attackSpeed: 100 } },
      { level: 90, data: { atk: surtr ? 672 : 1015, baseAttackTime: surtr ? 1.25 : 1.5, attackSpeed: 100 } },
    ] }],
    favorKeyFrames: [{ level: 0, data: { atk: 0 } }, { level: 50, data: { atk: surtr ? 100 : 80 } }],
    traitDescription: surtr ? '敵に術ダメージを与える' : '',
    // Deliberately extreme optional modifiers expose accidental inclusion in the page's result.
    talents: [{ candidates: [{ description: '攻撃力+999%', blackboard: [{ key: 'atk', value: 9.99 }] }] }],
    potentialRanks: [{ buff: { attributes: { attributeModifiers: [{ attributeType: 'ATK', value: 999 }] } } }],
    modules: [{ uniEquipId: 'test_module', phases: [{ equipLevel: 3, attributeBlackboard: { atk: 999 } }] }],
  }
}

before(async () => {
  server = await createServer({
    configFile: false, plugins: [react()], logLevel: 'error',
    cacheDir: 'node_modules/.vite/damage-three-page-test', resolve: { preserveSymlinks: true },
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  ;({ DamageCalculatorThree: Page, DamageCalculatorThreeResultTable: ResultTable,
    DamageCalculatorThreeEffectTable: EffectTable } = await server.ssrLoadModule('/src/components/DamageCalculatorThree.tsx'))
  ;({ buildDamageCalculatorThreeOutput: buildOutput } = await server.ssrLoadModule('/src/lib/damageCalculatorThree.ts'))
  const { classifySkill } = await server.ssrLoadModule('/src/lib/classifier.ts')
  rows = source.flatMap(operator => operator.skills.map(entry => {
    const skillLevels = Array.from({ length: 10 }, (_, index) => index === 9 ? entry : {
      ...entry, name: `下位レベル${index + 1}`, description: '未対応レベルの説明', blackboard: [],
    })
    const surtr = operator.operatorId === 'char_350_surtr'
    return {
      id: `${operator.operatorId}:${entry.skillId}`, operatorId: operator.operatorId,
      operatorName: operator.operatorName, skillId: entry.skillId, skillIndex: entry.skillIndex, skillName: entry.name,
      profession: 'WARRIOR', professionLabel: '前衛', subProfessionId: surtr ? 'artsfghter' : 'fearless',
      subProfessionName: surtr ? '術戦士' : '勇士', nameInitial: 'S_ROW', rarity: 6,
      description: entry.description, duration: entry.duration, durationType: entry.durationType,
      skillType: entry.skillType, spType: entry.spData.spType, initSp: entry.spData.initSp, spCost: entry.spData.spCost,
      classification: classifySkill(entry), skillLevels, operatorProfile: profile(operator.operatorId), raw: entry,
    }
  }))
})

after(async () => { await server?.close() })

const tableRows = markup => [...markup.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)]
  .map(row => [...row[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/g)]
    .map(cell => text(cell[1])))
const resultTable = markup => {
  const table = [...markup.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/g)]
    .find(match => /1体.*DPS/.test(text(match[1])) && /全対象.*DPS/.test(text(match[1])))
  assert.ok(table, '1体と全対象を分けた計算結果テーブル')
  return tableRows(table[1])
}

test('初期表示はスルトS2で、選択・戦闘条件・結果の3パネルを順に表示する', () => {
  const markup = render()
  const headings = [...markup.matchAll(/<span class="collapsible-panel-heading-label">([^<]*)<\/span>/g)]
    .map(match => match[1])
  assert.deepEqual(headings, ['オペレーター・スキル', '戦闘条件', '計算結果'])
  assert.match(markup, /<span>01<\/span>/)
  assert.match(markup, /<span>02<\/span>/)
  assert.match(markup, /<span>03<\/span>/)
  assert.match(markup, /スルト/)
  assert.match(markup, /災厄の巨焔/)
  assert.match(markup, /特化3/)
  assert.doesNotMatch(markup, /未対応レベルの説明|下位レベル/)
  const data = resultTable(markup)
  assert.equal(data[0].length, 5)
  assert.ok(data.length > 1)
  assert.ok(data.slice(1).every(row => row.length === 5))
  // The single-target condition applies ×1.6 after the ATK+120% modifier.
  assert.deepEqual(data[1], ['0', '2,716.8', '2,173.4', '2,716.8', '2,173.4'])
})

test('対応済みでない技能・不整合な識別子はスルトS2へ代用せず選び直しを案内する', () => {
  for (const initialSelection of [
    selected('char_350_surtr', 3),
    selected('char_172_svrash', 3),
    { ...selected('char_350_surtr', 2), skillId: 'skchr_missing' },
    { ...selected('char_350_surtr', 2), skillIndex: 1 },
    { ...selected('char_350_surtr', 2), operatorId: 'char_4009_irene' },
  ]) {
    const markup = render(initialSelection)
    assert.doesNotMatch(markup, /1体[^<]*DPS/)
    assert.match(text(markup), /選び直|選択し直|対応してい|対象外|見つかりません/)
  }
})

test('特化3以外の指定に特化3の数値を流用しない', () => {
  for (const [operatorId, skillIndex] of [['char_350_surtr', 2], ['char_263_skadi', 1]]) {
    for (const levelIndex of [0, 8, 10]) {
      const markup = render({ ...selected(operatorId, skillIndex), levelIndex })
      assert.doesNotMatch(markup, /1体[^<]*DPS/)
      assert.match(text(markup), /選び直|選択し直|対応してい|対象外|見つかりません/)
    }
  }
})

test('2体への攻撃は、単体条件の倍率を外して1体と全対象の結果を別列で表示する', () => {
  const output = calculate('char_350_surtr', 2, 2)
  assert.deepEqual(output.unsupportedReasons, [])
  const markup = renderToStaticMarkup(createElement(ResultTable, { output, precision: 1 }))
  const data = resultTable(markup)
  assert.equal(data[0].length, 5)
  assert.deepEqual(data[1], ['0', '1,698.0', '1,358.4', '3,396.0', '2,716.8'])
  assert.ok(data.slice(1).every(row => row.length === 5))
  assert.doesNotMatch(markup, /colspan|rowspan|<button|<select/i)
})

test('小数点以下の表示桁数は単体・全対象の4つの数値列すべてへ適用する', () => {
  const output = calculate('char_350_surtr', 2)
  for (const [precision, expected] of [
    [0, ['0', '2,717', '2,173', '2,717', '2,173']],
    [3, ['0', '2,716.800', '2,173.440', '2,716.800', '2,173.440']],
  ]) {
    const markup = renderToStaticMarkup(createElement(ResultTable, { output, precision }))
    assert.deepEqual(resultTable(markup)[1], expected)
  }
})

test('スカジS1は物理攻撃の表を表示し、対象数を選択する不要なプルダウンを置かない', () => {
  const markup = render(selected('char_263_skadi', 1))
  const data = resultTable(markup)
  assert.match(data[0][0], /防御力/)
  assert.deepEqual(data[1], ['0', '1,587.0', '1,534.1', '1,587.0', '1,534.1'])
  assert.match(text(markup), /対象数.*1|1体/)
  assert.doesNotMatch(markup, /<select\b[^>]*aria-label="[^"]*対象数/)
  assert.doesNotMatch(markup, /災厄の巨焔|ラグナロク|波濤の裂刃/)
})

test('スルトS2の戦闘条件には実際の対象数1体・2体だけを選ぶ入力を表示する', () => {
  const markup = render()
  const select = markup.match(/<select\b[^>]*aria-label="実際の攻撃対象数"[^>]*>([\s\S]*?)<\/select>/)?.[1]
  assert.ok(select)
  assert.deepEqual([...select.matchAll(/<option value="(\d+)"[^>]*>([^<]*)<\/option>/g)]
    .map(match => [Number(match[1]), match[2]]), [[1, '1体'], [2, '2体']])
  assert.match(select, /<option value="1" selected="">1体<\/option>/)
})

test('説明文を常時表示し、計算範囲・効果の適用状態・使用数値は初期状態で閉じる', () => {
  for (const [operatorId, skillIndex, description] of [
    ['char_350_surtr', 2, '攻撃力+120%、攻撃範囲+1マス、攻撃対象数+1\n攻撃対象が1体のみの場合、攻撃力が160%まで上昇'],
    ['char_263_skadi', 1, '攻撃力+45%、攻撃速度+45'],
  ]) {
    const markup = render(selected(operatorId, skillIndex))
    const descriptionMatch = markup.match(/<div class="damage-three-description">([\s\S]*?)<\/div>/)
    assert.ok(descriptionMatch)
    assert.equal(descriptionMatch[1], escapeHtml(description))
    const details = [...markup.matchAll(/<details\b([^>]*)>([\s\S]*?)<\/details>/g)]
    assert.deepEqual(details.map(match => text(match[2].match(/<summary>([\s\S]*?)<\/summary>/)?.[1] ?? '')),
      ['適用する効果', '計算範囲', '計算に使った値'])
    assert.ok(details.every(match => !/\bopen\b/.test(match[1])))
    assert.ok(details.every(match => !match[2].includes(descriptionMatch[0])))
    assert.match(markup, /基礎性能＋スキル効果（素質・潜在・MOD・外部バフなし）/)
  }
})

test('単体条件の効果行は1体なら適用、2体なら不適用と表示する', () => {
  for (const [count, expected] of [[1, '適用'], [2, '不適用']]) {
    const output = calculate('char_350_surtr', 2, count)
    const markup = renderToStaticMarkup(createElement(EffectTable, { effects: output.effects }))
    const data = tableRows(markup)
    assert.deepEqual(data[0], ['項目', '値', '条件', '計算への適用'])
    assert.deepEqual(data.find(row => row[1] === '×1.6'), ['攻撃倍率', '×1.6', '攻撃対象数＝1', expected])
    assert.ok(data.every(row => row.length === 4))
  }
})

test('ダメージ計算に関与しない攻撃範囲と、条件不成立の単体倍率を区別して表示する', () => {
  const output = calculate('char_350_surtr', 2, 2)
  const range = output.effects.find(entry => entry.effect.item === 'ATTACK_RANGE')
  const multiplier = output.effects.find(entry => entry.effect.item === 'ATTACK_SCALE')
  assert.equal(range?.status, 'NOT_RELEVANT')
  assert.equal(multiplier?.status, 'CONDITION_FALSE')
  const markup = renderToStaticMarkup(createElement(EffectTable, { effects: output.effects }))
  const data = tableRows(markup)
  const rangeRow = data.find(row => row[0] === '攻撃範囲')
  assert.ok(rangeRow)
  assert.equal(rangeRow[3], '対象外')
  assert.equal(data.find(row => row[1] === '×1.6')?.[3], '不適用')
})

test('育成データを取得できない場合は数値表を出さず理由を表示する', () => {
  const skill = rows.find(row => row.operatorId === 'char_350_surtr' && row.skillIndex === 2)
  const broken = { ...skill, operatorProfile: { phases: [], favorKeyFrames: [] } }
  const markup = renderToStaticMarkup(createElement(Page, { rows: [broken], loading: false }))
  assert.match(markup, /この条件では計算できません/)
  assert.doesNotMatch(markup, /1体[^<]*DPS|NaN|Infinity/)
})

test('データ未取得時は読み込み中と取得失敗を区別し、空の結果表を表示しない', () => {
  const loading = renderToStaticMarkup(createElement(Page, { rows: [], loading: true }))
  const failed = renderToStaticMarkup(createElement(Page, { rows: [], loading: false }))
  assert.match(loading, /role="status"/)
  assert.match(loading, /読み込み中/)
  assert.match(failed, /取得できません/)
  for (const markup of [loading, failed]) assert.doesNotMatch(markup, /<table|NaN|Infinity/)
})
