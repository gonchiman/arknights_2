import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Page, SearchPanel, classifySkill
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()],
    cacheDir: 'node_modules/.vite/skill-kmeans-scope-page-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  ;({ SkillKMeansPage: Page } = await server.ssrLoadModule('/src/components/SkillKMeansPage.tsx'))
  ;({ SkillKMeansSearchPanel: SearchPanel } = await server.ssrLoadModule('/src/components/SkillKMeansSearchPanel.tsx'))
  ;({ classifySkill } = await server.ssrLoadModule('/src/lib/classifier.ts'))
})
after(async () => { await server?.close() })

const renderPage = props => renderToStaticMarkup(createElement(Page, {
  rows: [], loading: false, onOpenOperatorDetail: () => {}, ...props,
}))
const renderSearch = props => renderToStaticMarkup(createElement(SearchPanel, {
  documents: [], loading: false, learningBusy: false, onBusyChange: () => {}, onLearn: () => {}, ...props,
}))
const text = markup => markup.replace(/<[^>]*>/g, '').trim()
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`, 'i'))?.[1]
const disabled = tag => /\sdisabled(?:\s|=|>)/i.test(tag)
const buttons = markup => [...markup.matchAll(/(<button\b[^>]*>)([\s\S]*?)<\/button>/g)]
  .map(match => ({ tag: match[1], label: text(match[2]) }))
function scopeButtons(markup) {
  const panel = markup.match(/<section\b[^>]*aria-label="学習対象の大分類"[^>]*>([\s\S]*?)<\/section>/)
  assert.ok(panel, '大分類を選ぶ領域にアクセシブルな名前がある')
  return buttons(panel[1])
}
function inputWithLabel(markup, label) {
  const match = [...markup.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)].find(item => text(item[1]) === label)
  assert.ok(match, `${label}の入力がある`)
  const input = match[1].match(/<input\b[^>]*>/)?.[0]
  assert.ok(input)
  return input
}
function definition(markup, label) {
  const entry = [...markup.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/g)]
    .find(match => text(match[1]) === label)
  assert.ok(entry, `${label}の値がある`)
  return text(entry[2])
}
const documents = length => Array.from({ length }, (_, index) => ({
  id: `doc-${index}`, description: `攻撃力を上昇する ${index}`, recordIds: [`row-${index}`],
  operatorName: '演習者', skillName: '訓練技', skillIndex: 1,
}))
function skill(id, description, rawOverrides = {}) {
  const raw = { description, duration: 0, skillType: 'MANUAL', ...rawOverrides }
  return {
    id, operatorId: `operator-${id}`, operatorName: '演習者', skillId: `skill-${id}`, skillName: '訓練技', skillIndex: 1,
    profession: 'WARRIOR', professionLabel: '前衛', rarity: 6, subProfessionId: 'test', subProfessionName: 'テスト', nameInitial: 'T_ROW',
    description, duration: raw.duration, durationType: 'NONE', skillType: raw.skillType, spType: 'INCREASE_WITH_TIME', initSp: 0, spCost: 10,
    classification: classifySkill(raw), skillLevels: [raw], operatorProfile: { phases: [], favorKeyFrames: [] }, raw,
  }
}

test('初期画面は全スキルを選び、空の分類を含む8選択肢に所属スキル数を表示する', () => {
  const rows = [
    skill('a', '次の通常攻撃時、攻撃力が200%まで上昇する'),
    skill('b', '次の通常攻撃時、攻撃力が200%まで上昇する'),
    skill('c', 'スキル発動時、周囲の敵に攻撃力の200%の術ダメージを与える。攻撃力+100%', { duration: 20 }),
    skill('d', '100%'),
  ]
  const markup = renderPage({ rows })
  const options = scopeButtons(markup)
  assert.deepEqual(options.map(option => attr(option.tag, 'aria-label')), [
    '全スキル、4スキル', '次の通常攻撃時、2スキル', '持続強化・攻撃変化、1スキル', '単発・連続攻撃、1スキル',
    'モード切替、0スキル', '召喚・設置、0スキル', '常時・配置時、0スキル', '未分類、1スキル',
  ])
  assert.deepEqual(options.map(option => attr(option.tag, 'aria-pressed')), ['true', ...Array(7).fill('false')])
  assert.ok(options.every(option => !disabled(option.tag)))
  assert.equal(definition(markup, '該当スキル'), '4')
  assert.equal(definition(markup, '学習説明文'), '2', '同一文の統合と無効語彙の除外を件数に反映する')
  const tabs = buttons(markup).filter(button => attr(button.tag, 'role') === 'tab')
  assert.deepEqual(tabs.map(button => [button.label, attr(button.tag, 'aria-selected')]), [
    ['K探索', 'true'], ['学習', 'false'], ['グループ', 'false'],
  ])
})

test('読み込み中は大分類の切替を無効にする', () => {
  const options = scopeButtons(renderPage({ loading: true }))
  assert.equal(options.length, 8)
  assert.ok(options.every(option => disabled(option.tag)))
})

test('統合説明文が多数あっても利用可能な説明文が4件未満なら探索できない', () => {
  for (const usableDocumentCount of [0, 1, 2, 3]) {
    const markup = renderSearch({ documents: documents(100), usableDocumentCount, initialMaxK: 3 })
    const submit = buttons(markup).find(button => attr(button.tag, 'type') === 'submit')
    assert.equal(submit?.label, '探索する')
    assert.ok(disabled(submit.tag), `利用可能な説明文が${usableDocumentCount}件の探索を無効にする`)
    const alerts = [...markup.matchAll(/<[^>]*\brole="alert"[^>]*>([\s\S]*?)<\/[^>]+>/g)].map(match => text(match[1]))
    assert.ok(alerts.some(message => message.includes('探索データ不足') && message.includes('4件以上')))
  }
})

test('大分類用の初期K上限を使い、指定がない場合は従来の60を使う', () => {
  const scoped = renderSearch({ documents: documents(100), usableDocumentCount: 47, initialMaxK: 46 })
  assert.equal(attr(inputWithLabel(scoped, 'Kの下限'), 'value'), '2')
  assert.equal(attr(inputWithLabel(scoped, 'Kの上限'), 'value'), '46')
  assert.ok(!disabled(buttons(scoped).find(button => attr(button.tag, 'type') === 'submit').tag))
  const all = renderSearch({ documents: documents(100), usableDocumentCount: 100 })
  assert.equal(attr(inputWithLabel(all, 'Kの上限'), 'value'), '60')
})

test('K入力の許容上限は利用可能説明文数より小さく、80を超えない', () => {
  for (const [usableDocumentCount, limit] of [[4, 3], [9, 8], [81, 80], [200, 80]]) {
    const markup = renderSearch({ documents: documents(250), usableDocumentCount, initialMaxK: 3 })
    assert.equal(Number(attr(inputWithLabel(markup, 'Kの下限'), 'max')), limit)
    assert.equal(Number(attr(inputWithLabel(markup, 'Kの上限'), 'max')), limit)
    assert.ok(!disabled(buttons(markup).find(button => attr(button.tag, 'type') === 'submit').tag))
  }
})
