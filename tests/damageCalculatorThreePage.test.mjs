import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const source = JSON.parse(readFileSync(new URL('./fixtures/skillStructureFourOperators.json', import.meta.url), 'utf8'))
const talentSource = JSON.parse(readFileSync(new URL('./fixtures/talentStructureFourOperators.json', import.meta.url), 'utf8'))
let server, Page, ResultTable, EffectTable, TalentTable, DotTable, SteadyTable, buildOutput, rows

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
const calculate = (operatorId, skillIndex, actualAttackTargetCount = 1, conditions = {}) => {
  const skill = rows.find(candidate => candidate.operatorId === operatorId && candidate.skillIndex === skillIndex)
  assert.ok(skill)
  return buildOutput({ operator: skill, skill, phaseIndex: 2, operatorLevel: 90, trust: 100,
    skillLevelIndex: 9, conditions: { actualAttackTargetCount, ...conditions } })
}

function profile(operatorId) {
  const surtr = operatorId === 'char_350_surtr'
  const data = {
    char_350_surtr: { low: 544, high: 672, trust: 100, interval: 1.25 },
    char_263_skadi: { low: 842, high: 1015, trust: 80, interval: 1.5 },
    char_172_svrash: { low: 577, high: 713, trust: 50, interval: 1.3 },
    char_293_thorns: { low: 575, high: 711, trust: 30, interval: 1.3 },
  }[operatorId]
  return {
    phases: [{ maxLevel: 50 }, { maxLevel: 80 }, { maxLevel: 90, attributesKeyFrames: [
      { level: 1, data: { atk: data.low, baseAttackTime: data.interval, attackSpeed: 100 } },
      { level: 90, data: { atk: data.high, baseAttackTime: data.interval, attackSpeed: 100 } },
    ] }],
    favorKeyFrames: [{ level: 0, data: { atk: 0 } }, { level: 50, data: { atk: data.trust } }],
    traitDescription: surtr ? '敵に術ダメージを与える' : ['char_172_svrash', 'char_293_thorns'].includes(operatorId) ? '80%の攻撃力で遠距離攻撃も行える' : '',
    talents: structuredClone(talentSource.find(operator => operator.operatorId === operatorId).operatorProfile.talents),
    affiliationIds: { nationId: null, groupId: operatorId === 'char_263_skadi' ? 'abyssal' : null, teamId: null },
    // Potential and module bonuses remain excluded at potential 1 / no module.
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
    DamageCalculatorThreeEffectTable: EffectTable,
    DamageCalculatorThreeTalentTable: TalentTable,
    DamageCalculatorThreeDotTable: DotTable,
    DamageCalculatorThreeSteadyDpsTable: SteadyTable } = await server.ssrLoadModule('/src/components/DamageCalculatorThree.tsx'))
  ;({ buildDamageCalculatorThreeOutput: buildOutput } = await server.ssrLoadModule('/src/lib/damageCalculatorThree.ts'))
  const { classifySkill } = await server.ssrLoadModule('/src/lib/classifier.ts')
  rows = source.flatMap(operator => operator.skills.map(entry => {
    const skillLevels = Array.from({ length: 10 }, (_, index) => index === 9 ? entry : {
      ...entry, name: `下位レベル${index + 1}`, description: '未対応レベルの説明', blackboard: [],
    })
    const surtr = operator.operatorId === 'char_350_surtr'
    const lord = ['char_172_svrash', 'char_293_thorns'].includes(operator.operatorId)
    return {
      id: `${operator.operatorId}:${entry.skillId}`, operatorId: operator.operatorId,
      operatorName: operator.operatorName, skillId: entry.skillId, skillIndex: entry.skillIndex, skillName: entry.name,
      profession: 'WARRIOR', professionLabel: '前衛', subProfessionId: surtr ? 'artsfghter' : lord ? 'lord' : 'fearless',
      subProfessionName: surtr ? '術戦士' : lord ? '領主' : '勇士', nameInitial: 'S_ROW', rarity: 6,
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
  const table = markup.match(/<table\b[^>]*class="[^"]*damage-three-result-table[^"]*"[^>]*>([\s\S]*?)<\/table>/)
  assert.ok(table, '1体と全対象を分けた計算結果テーブル')
  return tableRows(table[1])
}
const talentTable = markup => {
  const table = markup.match(/<table\b[^>]*class="[^"]*damage-three-talent-table[^"]*"[^>]*>([\s\S]*?)<\/table>/)
  assert.ok(table, '素質の適用状態テーブル')
  return tableRows(table[1])
}
const dotTable = markup => {
  const table = markup.match(/<table\b[^>]*class="[^"]*damage-three-dot-table[^"]*"[^>]*>([\s\S]*?)<\/table>/)
  assert.ok(table, '付与中の継続ダメージ表')
  return tableRows(table[1])
}
const steadyTable = markup => {
  const table = markup.match(/<table\b[^>]*class="[^"]*damage-three-steady-table[^"]*"[^>]*>([\s\S]*?)<\/table>/)
  assert.ok(table, '定常DPS表')
  return tableRows(table[1])
}

test('初期表示はスルトS2で、選択・戦闘条件・素質・結果の4パネルを順に表示する', () => {
  const markup = render()
  const headings = [...markup.matchAll(/<span class="collapsible-panel-heading-label">([^<]*)<\/span>/g)]
    .map(match => match[1])
  assert.deepEqual(headings, ['オペレーター・スキル', '戦闘条件', '素質の適用', '計算結果'])
  assert.match(markup, /<span>01<\/span>/)
  assert.match(markup, /<span>02<\/span>/)
  assert.match(markup, /<span>03<\/span>/)
  assert.match(markup, /<span>04<\/span>/)
  assert.match(markup, /スルト/)
  assert.match(markup, /災厄の巨焔/)
  assert.match(markup, /特化3/)
  assert.doesNotMatch(markup, /未対応レベルの説明|下位レベル/)
  const data = resultTable(markup)
  assert.equal(data[0].length, 5)
  assert.ok(data.length > 1)
  assert.ok(data.slice(1).every(row => row.length === 5))
  // The single-target condition applies ×1.6 after the ATK+120% modifier.
  assert.deepEqual(data[1], ['0', '2,717', '2,173', '2,717', '2,173'])
})

test('対応済みでない技能・不整合な識別子はスルトS2へ代用せず選び直しを案内する', () => {
  for (const initialSelection of [
    { ...selected('char_350_surtr', 2), skillId: 'skchr_missing' },
    { ...selected('char_350_surtr', 2), skillIndex: 1 },
    { ...selected('char_350_surtr', 2), operatorId: 'char_4009_irene' },
  ]) {
    const markup = render(initialSelection)
    assert.doesNotMatch(markup, /damage-three-result-table/)
    assert.match(text(markup), /選び直|選択し直|対応してい|対象外|見つかりません/)
  }
})

test('特化3以外の指定に特化3の数値を流用しない', () => {
  for (const { operatorId, skillIndex } of rows) {
    for (const levelIndex of [0, 8, 10]) {
      const markup = render({ ...selected(operatorId, skillIndex), levelIndex })
      assert.doesNotMatch(markup, /damage-three-result-table/)
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
  assert.deepEqual(data[1], ['0', '1,741', '1,683', '1,741', '1,683'])
  assert.match(text(markup), /対象数.*1|1体/)
  assert.doesNotMatch(markup, /<select\b[^>]*aria-label="[^"]*対象数/)
  assert.doesNotMatch(markup, /災厄の巨焔|ラグナロク/)
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
    assert.match(markup, /基礎性能＋スキル効果＋適用中の素質 · 潜在1 · MODなし · 外部バフなし/)
    assert.doesNotMatch(markup, /素質・潜在・MOD・外部バフなし|素質・潜在・モジュール・外部バフの補正は含めません/)
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

test('素質の適用は6列の通常テーブルで表示し、補正と計算対象外の効果を区別する', () => {
  const markup = render()
  const data = talentTable(markup)
  assert.deepEqual(data[0], ['区分', '名称', '項目', '値', '条件', '状態'])
  assert.ok(data.slice(1).every(row => row.length === 6))
  assert.deepEqual(data.find(row => row[2] === '術耐性固定無視'), ['素質1', '劫火', '術耐性固定無視', '20', 'なし', '適用'])
  for (const item of ['HP', '強制退場']) {
    const row = data.find(row => row[2] === item)
    assert.ok(row, item)
    assert.equal(row[1], '余燼')
    assert.equal(row[5], '対象外')
  }
  const table = markup.match(/<table\b[^>]*class="[^"]*damage-three-talent-table[^"]*"[^>]*>([\s\S]*?)<\/table>/)[1]
  assert.doesNotMatch(table, /colspan|rowspan|<small|<br/)
})

test('使用数値はスキル・素質・合計の攻撃力増加と術耐性無視を分けて表示する', () => {
  const markup = render(selected('char_263_skadi', 1))
  const values = tableRows(markup.match(/<table\b[^>]*class="[^"]*damage-three-value-table[^"]*"[^>]*>([\s\S]*?)<\/table>/)[1])
  assert.deepEqual(values.find(row => row[0] === '攻撃力増加（スキル）'), ['攻撃力増加（スキル）', '＋45％'])
  assert.deepEqual(values.find(row => row[0] === '攻撃力増加（素質）'), ['攻撃力増加（素質）', '＋14％'])
  assert.deepEqual(values.find(row => row[0] === '攻撃力増加（合計）'), ['攻撃力増加（合計）', '＋59％'])
  const surtr = tableRows(render().match(/<table\b[^>]*class="[^"]*damage-three-value-table[^"]*"[^>]*>([\s\S]*?)<\/table>/)[1])
  assert.deepEqual(surtr.find(row => row[0] === '術耐性固定無視'), ['術耐性固定無視', '20'])
  const row = resultTable(render()).find(entry => entry[0] === '60')
  assert.deepEqual(row, ['60', '1,630', '1,304', '1,630', '1,304'])
})

test('ソーンズは毒の対象条件を選び、直接攻撃と付与中の継続ダメージを別表で表示する', () => {
  for (const skillIndex of [1, 2, 3]) {
    const markup = render(selected('char_293_thorns', skillIndex))
    const data = talentTable(markup)
    const dot = data.filter(row => row[2] === '継続ダメージ')
    assert.equal(dot.length, 2)
    assert.deepEqual(dot.map(row => row[3]), ['125/秒', '250/秒'])
    assert.deepEqual(dot.map(row => row[5]), ['適用', '条件不成立'])
    assert.deepEqual(dotTable(markup), [['対象', '付与中のダメージ/秒'], ['1体', '125'], ['全対象', '125']])
    assert.match(markup, /<h3 class="damage-three-result-heading">直接攻撃<\/h3>/)
    assert.match(markup, /<h3 class="damage-three-result-heading">継続ダメージ<\/h3>/)
    assert.match(markup, /敵の術耐性0/)
    assert.doesNotMatch(markup, /直接攻撃分（継続ダメージを除く）|毒1付与分|有限時間総量/)
    assert.doesNotMatch(markup, /この条件では計算できません|NaN|Infinity/)
    const headings = resultTable(markup)[0]
    assert.equal(headings.some(cell => cell.includes('DPS')), skillIndex !== 2)
    assert.equal(markup.includes('damage-three-steady-table'), skillIndex !== 2)
    assert.equal(markup.includes(' · 同一対象へ連続攻撃'), skillIndex !== 2)
    if (skillIndex === 2) assert.doesNotMatch(markup, /定常DPS：/)
  }
})

test('毒の条件には術耐性の数値入力と敵の遠距離攻撃能力の選択を表示する', () => {
  for (const skillIndex of [1, 2, 3]) {
    const markup = render(selected('char_293_thorns', skillIndex))
    const resistance = [...markup.matchAll(/<input\b[^>]*>/g)].map(match => match[0])
      .find(input => input.includes('aria-label="敵の術耐性"'))
    assert.ok(resistance)
    for (const attribute of ['type="number"', 'min="0"', 'max="100"', 'step="1"', 'value="0"']) assert.ok(resistance.includes(attribute), attribute)
    const select = markup.match(/<select\b[^>]*aria-label="敵の遠距離攻撃能力"[^>]*>([\s\S]*?)<\/select>/)?.[1]
    assert.ok(select)
    assert.deepEqual([...select.matchAll(/<option value="([^"]+)"/g)].map(match => match[1]), ['MELEE_ONLY', 'RANGED_CAPABLE'])
    assert.match(select, /<option value="MELEE_ONLY" selected="">/)
  }
  const surtr = render()
  assert.doesNotMatch(surtr, /aria-label="敵の術耐性"|aria-label="敵の遠距離攻撃能力"|damage-three-dot-table|damage-three-steady-table/)
})

test('毒の術耐性と直接攻撃の防御力を独立させ、敵の遠距離攻撃能力で125と250を選ぶ', () => {
  const ordinary = calculate('char_293_thorns', 1, 1, { enemyResistance: 40, enemyAttackCapability: 'MELEE_ONLY' })
  const rangedEnemy = calculate('char_293_thorns', 1, 1, { enemyResistance: 40, enemyAttackCapability: 'RANGED_CAPABLE' })
  const ordinaryDot = dotTable(renderToStaticMarkup(createElement(DotTable, { output: ordinary, precision: 1 })))
  const rangedDot = dotTable(renderToStaticMarkup(createElement(DotTable, { output: rangedEnemy, precision: 1 })))
  assert.deepEqual(ordinaryDot[1], ['1体', '75.0'])
  assert.deepEqual(rangedDot[1], ['1体', '150.0'])
  assert.deepEqual(resultTable(renderToStaticMarkup(createElement(ResultTable, { output: rangedEnemy, precision: 1 })))[1],
    ['0', '1,482.0', '1,140.0', '1,482.0', '1,140.0'])
  const steady = steadyTable(renderToStaticMarkup(createElement(SteadyTable, { output: rangedEnemy, precision: 1 })))
  assert.deepEqual(steady[0], ['敵の防御力', '1体の直接DPS', '1体の継続DPS', '1体の合計DPS', '全対象の合計DPS'])
  assert.deepEqual(steady[1], ['0', '1,140.0', '150.0', '1,290.0', '1,290.0'])
  assert.ok(steady.slice(1).every(row => row[2] === '150.0'))
  assert.ok(steady.slice(1).some(row => row[1] !== '1,140.0'))
  const ownRanged = calculate('char_293_thorns', 1, 1, { enemyResistance: 40, enemyAttackCapability: 'RANGED_CAPABLE', attackDistanceType: 'RANGED' })
  assert.deepEqual(dotTable(renderToStaticMarkup(createElement(DotTable, { output: ownRanged, precision: 1 })))[1], ['1体', '150.0'])
  assert.deepEqual(resultTable(renderToStaticMarkup(createElement(ResultTable, { output: ownRanged, precision: 1 })))[1],
    ['0', '1,185.6', '912.0', '1,185.6', '912.0'])
})

test('継続ダメージと定常DPSにも指定の小数桁数を適用する', () => {
  const output = calculate('char_293_thorns', 1, 1, { enemyResistance: 35, enemyAttackCapability: 'RANGED_CAPABLE' })
  for (const [precision, rate, combined] of [[0, '163', '1,303'], [3, '162.500', '1,302.500']]) {
    assert.deepEqual(dotTable(renderToStaticMarkup(createElement(DotTable, { output, precision })))[1], ['1体', rate])
    const data = steadyTable(renderToStaticMarkup(createElement(SteadyTable, { output, precision })))
    assert.equal(data[1][2], rate)
    assert.equal(data[1][3], combined)
    assert.ok(data.slice(1).every(row => row.length === 5))
  }
})

test('ソーンズS2は全対象の付与中毎秒量を表示しても定常合計DPSを表示しない', () => {
  const output = calculate('char_293_thorns', 2, 4)
  const dot = dotTable(renderToStaticMarkup(createElement(DotTable, { output, precision: 1 })))
  assert.deepEqual(dot, [['対象', '付与中のダメージ/秒'], ['1体', '125.0'], ['全対象', '500.0']])
  assert.equal(renderToStaticMarkup(createElement(SteadyTable, { output, precision: 1 })), '')
  assert.deepEqual(resultTable(renderToStaticMarkup(createElement(ResultTable, { output, precision: 1 })))[1], ['0', '948.0', '3,792.0'])
})

test('通常攻撃の間隔が毒の持続時間以上なら定常DPSを表示できない理由を状態として示す', () => {
  const skill = rows.find(row => row.operatorId === 'char_293_thorns' && row.skillIndex === 1)
  const operatorProfile = structuredClone(skill.operatorProfile)
  for (const frame of operatorProfile.phases[2].attributesKeyFrames) frame.data.baseAttackTime = 4
  const slow = { ...skill, operatorProfile }
  const markup = renderToStaticMarkup(createElement(Page, { rows: [slow], loading: false, initialSelection: selected(skill.operatorId, skill.skillIndex) }))
  assert.ok(resultTable(markup).length > 1)
  assert.ok(dotTable(markup).length > 1)
  assert.doesNotMatch(markup, /damage-three-steady-table/)
  assert.match(markup, /<p class="damage-two-note">定常DPS：攻撃間隔が持続時間以上/)
  assert.doesNotMatch(markup, /この条件では計算できません/)
})

test('毒の参照値が欠けたときは毒を0とせず直接攻撃だけを残して範囲を明示する', () => {
  const skill = rows.find(row => row.operatorId === 'char_293_thorns' && row.skillIndex === 1)
  const operatorProfile = structuredClone(skill.operatorProfile)
  operatorProfile.talents[0].candidates[0].blackboard = operatorProfile.talents[0].candidates[0].blackboard
    .filter(entry => entry.key !== 'damage[normal]')
  const broken = { ...skill, operatorProfile }
  const markup = renderToStaticMarkup(createElement(Page, { rows: [broken], loading: false, initialSelection: selected(skill.operatorId, skill.skillIndex) }))
  assert.ok(resultTable(markup).length > 1)
  assert.match(markup, /直接攻撃分（継続ダメージを除く）/)
  assert.doesNotMatch(markup, /damage-three-dot-table|damage-three-steady-table|NaN|Infinity/)
  assert.ok(talentTable(markup).some(row => row[3].startsWith('未確認') && row[5] === '未確認'))
})

test('素質の未確認項目は0へ置き換えず未確認と表示する', () => {
  const output = calculate('char_172_svrash', 3)
  const effects = [{ ...output.talentEffects[0], effect: null, status: 'UNVERIFIED', reason: '素質の原典を確認できません。' }]
  const markup = renderToStaticMarkup(createElement(TalentTable, { effects }))
  const data = talentTable(markup)
  assert.deepEqual(data[1].slice(2), ['未確認', '未確認', '未確認', '未確認'])
  assert.ok(data[1].every(cell => cell !== '0'))
})

test('既知の対象不一致は条件不成立、所属不足は未確認として区別する', () => {
  const skill = rows.find(row => row.operatorId === 'char_263_skadi' && row.skillIndex === 1)
  for (const [affiliationIds, expected] of [
    [{ nationId: null, groupId: 'other', teamId: null }, '条件不成立'],
    [undefined, '未確認'],
  ]) {
    const row = { ...skill, operatorProfile: { ...skill.operatorProfile, affiliationIds } }
    const output = buildOutput({ operator: row, skill: row, phaseIndex: 2, operatorLevel: 90, trust: 100, skillLevelIndex: 9 })
    const markup = renderToStaticMarkup(createElement(TalentTable, { effects: output.talentEffects }))
    const attack = talentTable(markup).find(entry => entry[2] === '攻撃力')
    assert.ok(attack)
    assert.match(attack[4], /アビサルハンター/)
    assert.equal(attack[5], expected)
    assert.equal(output.rows.length > 0, expected === '条件不成立')
  }
})

test('対象の陣営・タグ制限も条件列に表示し、条件なしと取り違えない', () => {
  const skadi = talentTable(render(selected('char_263_skadi', 1))).find(entry => entry[2] === '攻撃力')
  assert.ok(skadi)
  assert.match(skadi[4], /アビサルハンター/)
  assert.equal(skadi[5], '適用')
  const template = calculate('char_172_svrash', 3).talentEffects[0]
  const effects = [{ ...template, effect: {
    ...template.effect,
    condition: { type: 'COMPARE', metric: 'source.hpRatio', comparison: 'LTE', value: 0.5 },
    target: { ...template.effect.target, tagIds: ['test_tag'], filterLabels: { test_tag: '試験タグ' } },
  } }]
  const data = talentTable(renderToStaticMarkup(createElement(TalentTable, { effects })))
  assert.match(data[1][4], /試験タグ/)
  assert.match(data[1][4], /自身のHP割合/)
  assert.match(data[1][4], /かつ/)
  assert.equal(data[1].length, 6)
})

test('適用可能な素質の原典が欠けている場合に素質なしの結果へ代用しない', () => {
  const skill = rows.find(row => row.operatorId === 'char_172_svrash' && row.skillIndex === 3)
  const broken = { ...skill, operatorProfile: { ...skill.operatorProfile, talents: [] } }
  const markup = renderToStaticMarkup(createElement(Page, { rows: [broken], loading: false, initialSelection: selected(skill.operatorId, skill.skillIndex) }))
  assert.match(markup, /この条件では計算できません/)
  assert.doesNotMatch(markup, /damage-three-result-table|NaN|Infinity/)
  assert.ok(talentTable(markup).some(row => row[5] === '未確認'))
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

test('全12技能を選択でき、同一OPのS1・S2・S3の名前付きボタンと対応する計算結果を表示する', () => {
  const expectations = [
    ['char_263_skadi', 1, ['0', '1,741', '1,683', '1,741', '1,683']],
    ['char_263_skadi', 2, ['0', '3,109', '2,073', '3,109', '2,073']],
    ['char_263_skadi', 3, ['0', '2,671', '1,781', '2,671', '1,781']],
    ['char_350_surtr', 1, ['0', '2,393', '2,393']],
    ['char_350_surtr', 2, ['0', '2,717', '2,173', '2,717', '2,173']],
    ['char_350_surtr', 3, ['0', '3,319', '2,655', '3,319', '2,655']],
    ['char_172_svrash', 1, ['0', '2,433', '2,433']],
    ['char_172_svrash', 2, ['0', '839', '645', '839', '645']],
    ['char_172_svrash', 3, ['0', '2,365', '1,819', '2,365', '1,819']],
    ['char_293_thorns', 1, ['0', '1,482', '1,140', '1,482', '1,140']],
    ['char_293_thorns', 2, ['0', '948', '948']],
    ['char_293_thorns', 3, ['0', '1,185', '1,139', '1,185', '1,139']],
  ]
  for (const [operatorId, skillIndex, expected] of expectations) {
    const markup = render(selected(operatorId, skillIndex))
    const operator = rows.find(row => row.operatorId === operatorId)
    const operatorLink = [...markup.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)]
      .find(anchor => /class="[^"]*damage-three-operator-name(?:\s|\")/.test(anchor[1]))
    assert.ok(operatorLink, `${operatorId}/S${skillIndex}: operator detail link`)
    assert.ok(operatorLink[1].includes(`href="#/operators/${operatorId}?from=damage-3"`))
    assert.ok(operatorLink[1].includes(`aria-label="${escapeHtml(operator.operatorName)}のオペレーター情報を開く"`))
    assert.ok(text(operatorLink[2]).includes(escapeHtml(operator.operatorName)))
    assert.match(text(operatorLink[2]), /→$/)
    assert.match(markup, /<div\b[^>]*class="[^"]*damage-three-operator-summary[^"]*"/)
    const changeButton = [...markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
      .find(button => /class="[^"]*damage-three-operator-change(?:\s|\")/.test(button[1]))
    assert.ok(changeButton, `${operatorId}/S${skillIndex}: independent operator search button`)
    assert.match(changeButton[1], /type="button"/)
    assert.match(changeButton[1], /aria-expanded="false"/)
    assert.match(changeButton[1], /aria-controls="damage-three-search"/)
    assert.equal(text(changeButton[2]), '検索して変更')
    for (const button of markup.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)) assert.doesNotMatch(button[1], /<a\b/)
    for (const anchor of markup.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)) assert.doesNotMatch(anchor[1], /<button\b/)
    assert.doesNotMatch(markup, /operator-search-trigger/)
    const data = resultTable(markup)
    assert.deepEqual(data[1], expected, `${operatorId}/S${skillIndex}`)
    assert.equal(data[0].length, expected.length)
    assert.ok(data.slice(1).every(row => row.length === expected.length))
    const choices = markup.match(/<div\b(?=[^>]*role="group")(?=[^>]*aria-label="スキル選択")[^>]*>([\s\S]*?)<\/div>/)?.[1]
    assert.ok(choices, `${operatorId}/S${skillIndex}`)
    const siblingSkills = rows.filter(row => row.operatorId === operatorId).sort((a, b) => a.skillIndex - b.skillIndex)
    const buttons = [...choices.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
    assert.deepEqual(buttons.map(button => button[1].match(/aria-label="([^"]+)"/)?.[1]),
      siblingSkills.map(row => escapeHtml(`S${row.skillIndex} ${row.skillName}`)))
    assert.deepEqual(buttons.map(button => button[1].match(/aria-pressed="([^"]+)"/)?.[1]),
      siblingSkills.map(row => String(row.skillIndex === skillIndex)))
    for (const [index, button] of buttons.entries()) {
      assert.ok(text(button[2]).includes(`S${siblingSkills[index].skillIndex}`))
      assert.ok(text(button[2]).includes(escapeHtml(siblingSkills[index].skillName)))
    }
    assert.doesNotMatch(markup, /<select\b[^>]*aria-label="スキル"/)
    assert.match(markup, /damage-three-description/)
    assert.doesNotMatch(markup, /この条件では計算できません|NaN|Infinity/)
  }
})

const selectOptions = (markup, label) => {
  const contents = markup.match(new RegExp('<select\\b[^>]*aria-label="' + label + '"[^>]*>([\\s\\S]*?)<\\/select>'))?.[1]
  assert.ok(contents, label)
  return [...contents.matchAll(/<option value="([^"]+)"[^>]*>([^<]*)<\/option>/g)].map(match => [match[1], match[2]])
}

test('モード・発動回数・近接遠距離は必要な技能の戦闘条件として表示する', () => {
  const silverash = render(selected('char_172_svrash', 2))
  assert.deepEqual(selectOptions(silverash, 'スキルの状態'), [['INITIAL', '初期状態'], ['ALTERNATE', '切替後']])
  assert.deepEqual(selectOptions(silverash, '攻撃距離'), [['MELEE', '近接'], ['RANGED', '遠距離']])
  const thorns = render(selected('char_293_thorns', 3))
  assert.deepEqual(selectOptions(thorns, 'スキル発動回数'), [['1', '初回'], ['2', '2回目以降']])
  assert.deepEqual(selectOptions(thorns, '攻撃距離'), [['MELEE', '近接'], ['RANGED', '遠距離']])
  const counter = render(selected('char_293_thorns', 2))
  assert.deepEqual(selectOptions(counter, '実際の攻撃対象数'), [['1', '1体'], ['2', '2体'], ['3', '3体'], ['4', '4体']])
  assert.doesNotMatch(counter, /<select\b[^>]*aria-label="攻撃距離"/)
  const fixedMelee = render(selected('char_172_svrash', 3))
  assert.doesNotMatch(fixedMelee, /<select\b[^>]*aria-label="攻撃距離"/)
})

test('次回攻撃と反撃の出力には連続DPS列を置かず、1回の攻撃を3列で表示する', () => {
  for (const [operatorId, skillIndex, attackLabel] of [
    ['char_350_surtr', 1, '強化攻撃'], ['char_172_svrash', 1, '強化攻撃'], ['char_293_thorns', 2, '反撃'],
  ]) {
    const markup = render(selected(operatorId, skillIndex))
    const data = resultTable(markup)
    assert.equal(data[0].length, 3)
    assert.ok(data[0].slice(1).every(cell => cell.includes(attackLabel)))
    assert.ok(data[0].every(cell => !cell.includes('DPS')))
    assert.ok(data.slice(1).every(row => row.length === 3))
    assert.doesNotMatch(markup, /この条件では計算できません/)
  }
})

test('反撃の全対象ダメージとソーンズS3の後続段階を選択した結果をテーブルへ反映する', () => {
  const counter = calculate('char_293_thorns', 2, 4)
  const counterMarkup = renderToStaticMarkup(createElement(ResultTable, { output: counter, precision: 1 }))
  assert.deepEqual(resultTable(counterMarkup)[1], ['0', '948.0', '3,792.0'])
  const later = calculate('char_293_thorns', 3, 1, { skillActivationCount: 2, attackDistanceType: 'RANGED' })
  const laterMarkup = renderToStaticMarkup(createElement(ResultTable, { output: later, precision: 1 }))
  assert.deepEqual(resultTable(laterMarkup)[1], ['0', '1,630.0', '1,880.8', '1,630.0', '1,880.8'])
})
