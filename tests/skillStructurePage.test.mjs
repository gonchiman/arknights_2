import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const source = JSON.parse(readFileSync(new URL('./fixtures/skillStructureFourOperators.json', import.meta.url), 'utf8'))
let server, Page, Picker, rows, structures, classifySkill
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;',
})[character])
const selection = (operatorId, skillIndex) => {
  const record = rows.find(row => row.operatorId === operatorId && row.skillIndex === skillIndex)
  assert.ok(record, `${operatorId}/S${skillIndex}`)
  return { operatorId, skillIndex, skillId: record.skillId, levelIndex: 9 }
}
const render = initialSelection => renderToStaticMarkup(createElement(Page, { rows, loading: false, initialSelection }))

before(async () => {
  server = await createServer({
    configFile: false, plugins: [react()], logLevel: 'error',
    cacheDir: 'node_modules/.vite/skill-structure-test', resolve: { preserveSymlinks: true },
    server: { middlewareMode: true, watch: null, preTransformRequests: false }, appType: 'custom',
  })
  ;({ SkillStructurePage: Page } = await server.ssrLoadModule('/src/components/SkillStructurePage.tsx'))
  ;({ SkillDescriptionSelectionPage: Picker } = await server.ssrLoadModule('/src/components/SkillDescriptionSelectionPage.tsx'))
  ;({ SKILL_STRUCTURES: structures } = await server.ssrLoadModule('/src/lib/skillStructure.ts'))
  ;({ classifySkill } = await server.ssrLoadModule('/src/lib/classifier.ts'))
  // The picker receives source records, rather than deriving its input from the implementation's supported list.
  rows = source.flatMap(operator => operator.skills.map(entry => {
    const skillLevels = Array.from({ length: 10 }, (_, index) => index === 9 ? entry : {
      ...entry, name: `下位レベル${index + 1}`, description: '下位レベルの原文', blackboard: [],
    })
    return {
      id: `${operator.operatorId}:${entry.skillId}`, operatorId: operator.operatorId,
      operatorName: operator.operatorName, skillId: entry.skillId, skillIndex: entry.skillIndex, skillName: entry.name,
      profession: 'WARRIOR', professionLabel: '前衛', subProfessionId: 'test', subProfessionName: '試験職分',
      nameInitial: 'S_ROW', rarity: 6, description: entry.description, duration: entry.duration,
      durationType: entry.durationType, skillType: entry.skillType, spType: entry.spData.spType,
      initSp: entry.spData.initSp, spCost: entry.spData.spCost,
      classification: classifySkill(entry), skillLevels, operatorProfile: { phases: [], favorKeyFrames: [] }, raw: entry,
    }
  }))
})
after(async () => { await server?.close() })

test('初期表示はスルトS2の効果構造で、特化3だけを表示する', () => {
  const markup = render()
  assert.match(markup, /role="tab" aria-selected="true"[^>]*>効果構造/)
  assert.equal((markup.match(/role="tab" /g) ?? []).length, 4)
  assert.equal((markup.match(/aria-hidden="true" inert=""/g) ?? []).length, 3)
  assert.match(markup, /skill-effects-fixed-level">特化3/)
  assert.doesNotMatch(markup, /<select/)
  assert.match(markup, /攻撃対象数＝1/)
  assert.match(markup, /＋120％/)
  assert.match(markup, /×1.6/)
  assert.doesNotMatch(markup, /下位レベル/)
})

test('4人それぞれの3スキルを選択でき、12件の説明文を選択パネルに常時表示する', () => {
  assert.equal(rows.length, 12)
  for (const row of rows) {
    const markup = render(selection(row.operatorId, row.skillIndex))
    const picker = markup.match(/<section class="skill-effects-picker"[^>]*>([\s\S]*?)<\/section>/)?.[1]
    assert.ok(picker, row.skillId)
    for (const sibling of rows.filter(candidate => candidate.operatorId === row.operatorId)) {
      assert.ok(picker.includes(`aria-label="S${sibling.skillIndex} ${escapeHtml(sibling.skillName)}"`), sibling.skillId)
    }
    assert.equal((picker.match(/aria-pressed="/g) ?? []).length, 3)
    assert.equal((picker.match(/aria-pressed="true"/g) ?? []).length, 1)
    const structure = structures.find(candidate => candidate.basicInfo.operatorId === row.operatorId
      && candidate.basicInfo.skillId === row.skillId && candidate.basicInfo.skillIndex === row.skillIndex)
    assert.ok(structure, row.skillId)
    assert.match(picker, /<section class="skill-structure-description" aria-label="スキル説明文"><p>/)
    assert.ok(picker.includes(escapeHtml(structure.source.description)), row.skillId)
    assert.doesNotMatch(picker, /hidden=|\{[A-Za-z_][^}]*\}/)
    assert.doesNotMatch(markup, /スキル説明文を表示|スキル説明文を閉じる|下位レベル/)
  }
})

test('12スキルそれぞれの固有効果を出力し、別スキルの構造へすり替えない', () => {
  const expectations = [
    ['char_263_skadi', 1, ['＋45％', '＋45', '35秒']],
    ['char_263_skadi', 2, ['＋170％', '30秒', 'SPなし', '配置時']],
    ['char_263_skadi', 3, ['＋130％', '50秒', '最大HP']],
    ['char_350_surtr', 1, ['×3.1', '通常攻撃1回', '当該攻撃で撃破時', '最大値']],
    ['char_350_surtr', 2, ['＋120％', '×1.6', '攻撃対象数＝1']],
    ['char_350_surtr', 3, ['＋330％', '＋5000', '4体', '最大HPの20％/秒']],
    ['char_172_svrash', 1, ['×2.9', '通常攻撃1回']],
    ['char_172_svrash', 2, ['初期状態', '切替後', '最大HPの6％', '1秒ごと']],
    ['char_172_svrash', 3, ['－70％', '＋200％', '6体', '近接攻撃']],
    ['char_293_thorns', 1, ['＋100％', '30秒']],
    ['char_293_thorns', 2, ['＋60％', '＋110％', '敵の通常攻撃を受けた時', '反撃']],
    ['char_293_thorns', 3, ['発動回数＝1', '発動回数≧2', '＋60％', '＋120％']],
  ]
  for (const [operatorId, skillIndex, tokens] of expectations) {
    const markup = render(selection(operatorId, skillIndex))
    assert.match(markup, /skill-structure-content/)
    for (const token of tokens) assert.ok(markup.includes(token), `${operatorId}/S${skillIndex}: ${token}`)
  }
})

test('SA S2は往復する状態切替と初期状態での効果継承を明示し、空の効果行を落とさない', () => {
  const markup = render(selection('char_172_svrash', 2))
  assert.match(markup, /状態切替/)
  assert.match(markup, /<td>スキル発動<\/td><td>初期状態<\/td><td>切替後<\/td>/)
  assert.match(markup, /<td>スキル発動<\/td><td>切替後<\/td><td>初期状態<\/td>/)
  assert.match(markup, /<th scope="row">初期状態<\/th><td colSpan="6">スキルによる変更なし<\/td>/)
  assert.match(markup, /次の状態切替まで/)
  assert.match(markup, /状態切替または本人の退場/)
  assert.doesNotMatch(markup, /rowSpan="0"|\{HP_RECOVERY_PER_SEC_BY_MAX_HP_RATIO/)
})

test('ソーンズS3は2段階を表示し、段階ごとの値を保持する', () => {
  const markup = render(selection('char_293_thorns', 3))
  for (const token of ['発動回数＝1', '発動回数≧2', '時間制限なし', '本人の退場', '＋60％', '＋120％']) {
    assert.ok(markup.includes(token), token)
  }
  assert.equal((markup.match(/rowSpan="4"/g) ?? []).length, 2)
})

test('全12件で別レベルのURLは特化3の説明・構造を代用せず選び直せる', () => {
  for (const row of rows) for (const levelIndex of [0, 8, 10]) {
    const markup = render({ ...selection(row.operatorId, row.skillIndex), levelIndex })
    assert.match(markup, /このページで表示できないレベル指定です/)
    assert.match(markup, /<option value="9">特化3<\/option>/)
    assert.doesNotMatch(markup, /skill-structure-content|skill-structure-description/)
  }
})

test('他オペレーターと不整合なスキル指定は、対応済みデータへフォールバックしない', () => {
  const unsupported = {
    ...rows[0], operatorId: 'char_4009_irene', operatorName: 'アイリーニ',
    skillIndex: 1, skillId: 'skchr_irene_1', id: 'char_4009_irene:skchr_irene_1',
  }
  for (const initialSelection of [
    { operatorId: unsupported.operatorId, skillIndex: 1, skillId: unsupported.skillId, levelIndex: 9 },
    { ...selection('char_350_surtr', 2), skillIndex: 3 },
    { ...selection('char_350_surtr', 2), skillId: 'skchr_nonexistent' },
  ]) {
    const markup = renderToStaticMarkup(createElement(Page, { rows: [...rows, unsupported], loading: false, initialSelection }))
    assert.match(markup, /リンク先のスキルが見つかりません/)
    assert.doesNotMatch(markup, /skill-structure-content|skill-structure-description/)
  }
})

test('既存ピッカーは制約なしの全レベル選択と明示された下位レベルを維持する', () => {
  const row = rows.find(candidate => candidate.operatorId === 'char_350_surtr' && candidate.skillIndex === 2)
  for (const levelIndex of [0, 8, 9]) {
    const markup = renderToStaticMarkup(createElement(Picker, {
      rows: [row], loading: false, createHash: () => '#/skill-summary', title: '既存ページ', kicker: '',
      initialSelection: { ...selection(row.operatorId, row.skillIndex), levelIndex },
      renderSelection: ({ levelLabel, description }) => createElement('output', null, `${levelLabel}:${description}`),
    }))
    assert.equal((markup.match(/<option value=/g) ?? []).length, 10)
    assert.ok(markup.includes(`<option value="${levelIndex}" selected="">`))
    assert.doesNotMatch(markup, /skill-structure-description|skill-effects-fixed-level/)
    if (levelIndex !== 9) assert.match(markup, /下位レベルの原文<\/output>/)
  }
})
