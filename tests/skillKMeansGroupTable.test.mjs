import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, GroupTable, EffectModal, DocumentSource, classifySkill, emptyFilters
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()],
    cacheDir: 'node_modules/.vite/skill-kmeans-group-table-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  ;({ SkillKMeansGroupTable: GroupTable } = await server.ssrLoadModule('/src/components/SkillKMeansGroupTable.tsx'))
  ;({ SkillClusteringSource: DocumentSource } = await server.ssrLoadModule('/src/components/SkillClusteringSource.tsx'))
  ;({ SkillEffectModal: EffectModal } = await server.ssrLoadModule('/src/components/SkillEffectModal.tsx'))
  ;({ classifySkill } = await server.ssrLoadModule('/src/lib/classifier.ts'))
  ;({ EMPTY_SKILL_DIRECTORY_FILTERS: emptyFilters } = await server.ssrLoadModule('/src/lib/skillDirectory.ts'))
})
after(async () => { await server?.close() })

const render = (Component, props) => renderToStaticMarkup(createElement(Component, {
  ...(Component === GroupTable ? { filters: { ...emptyFilters }, onFiltersChange: () => {} } : {}),
  onOpenOperatorDetail: () => {}, ...props,
}))
const text = markup => markup.replace(/<[^>]*>/g, '')
const tableRows = markup => [...(markup.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/)?.[1] ?? '')
  .matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)]
  .map(match => [...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(cell => text(cell[1])))
const operatorLinks = markup => [...markup.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g)]
  .filter(match => match[1].startsWith('#/operators/')).map(match => [match[1], text(match[2])])
function skill(id, operatorName, skillIndex, description = '攻撃力+{atk:0%}') {
  const raw = { description, blackboard: [{ key: 'atk', value: 1.25 }] }
  return { id, operatorId: `char_${id}`, operatorName, skillIndex, skillId: `skchr_${id}`,
    skillName: `技_${id}`, description, skillLevels: [{ ...raw }, { ...raw }], raw,
    rarity: 3, profession: 'SNIPER', professionLabel: '狙撃', subProfessionId: 'marksman', subProfessionName: '速射手',
    nameInitial: 'K_ROW', duration: null, durationType: 'NONE', skillType: 'MANUAL',
    spType: 'INCREASE_WITH_TIME', initSp: 0, spCost: 10,
    classification: classifySkill(raw), operatorProfile: { phases: [], favorKeyFrames: [] } }
}
function document(id, records, description = '統合した説明文') {
  return { id, description, recordIds: records.map(row => row.id),
    operatorName: records[0].operatorName, skillName: records[0].skillName, skillIndex: records[0].skillIndex }
}
const recordMap = records => new Map(records.map(record => [record.id, record]))

test('統合された説明文の全元スキルを展開し、オペレーター名とスキル番号で並べる', () => {
  const sameSecond = skill('a2', 'アーミヤ', 2)
  const other = skill('k1', 'クルース', 1)
  const sameFirst = skill('a1', 'アーミヤ', 1)
  const records = [sameSecond, other, sameFirst]
  const markup = render(GroupTable, { group: 0, terms: ['攻撃'], recordMap: recordMap(records),
    documents: [document('shared', [other, sameSecond]), document('single', [sameFirst])] })
  const rows = tableRows(markup)
  assert.equal(rows.length, 3, '2件の統合説明文から3件のスキルを表示する')
  assert.deepEqual(rows, [sameFirst, sameSecond, other].map(row => [row.operatorName, `S${row.skillIndex}`, row.skillName]))
  const body = markup.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/)?.[1] ?? ''
  const skillButtons = [...body.matchAll(/<button\b[^>]*>/g)].map(match => match[0])
  assert.equal(skillButtons.length, 3)
  for (const button of skillButtons) assert.match(button, /aria-haspopup="dialog"/)
  assert.doesNotMatch(markup, /aria-pressed=|skill-clustering-source|<dialog\b/)
  assert.match(markup, /<th\b[^>]*scope="col"[^>]*>オペレーター<\/th>/)
  assert.match(markup, /<th\b[^>]*scope="col"[^>]*>S番号<\/th>/)
  assert.match(markup, /<th\b[^>]*scope="col"[^>]*>スキル名<\/th>/)
})

test('13件のグループは最初の12件だけを一覧に表示する', () => {
  const records = Array.from({ length: 13 }, (_, index) => skill(`member${index + 1}`, 'アーミヤ', index + 1))
  const markup = render(GroupTable, { group: 2, terms: [], recordMap: recordMap(records),
    documents: [document('shared', [...records].reverse())] })
  const rows = tableRows(markup)
  assert.equal(rows.length, 12)
  assert.deepEqual(rows[0], ['アーミヤ', 'S1', '技_member1'])
  assert.deepEqual(rows[11], ['アーミヤ', 'S12', '技_member12'])
  assert.ok(rows.every(row => !row.includes('技_member13')))
  assert.match(markup, /aria-label="次のスキル一覧"/)
})

test('同じ統合説明文の掲載先も元スキルごとの職業・レアリティ・原文でAND絞り込みする', () => {
  const representative = { ...skill('representative', 'アーミヤ', 1, '代表スキルの原文'), profession: 'CASTER', professionLabel: '術師', rarity: 5 }
  const target = { ...skill('target', 'クルース', 2, '配置後にシールドを獲得'), rarity: 6 }
  const wrongRarity = skill('wrong-rarity', 'ジェシカ', 1, '配置後にシールドを獲得')
  const wrongProfession = { ...skill('wrong-profession', 'シャイニング', 1, '配置後にシールドを獲得'), profession: 'MEDIC', professionLabel: '医療', rarity: 6 }
  const wrongText = { ...skill('wrong-text', 'エクシア', 3, '通常攻撃が連続攻撃になる'), rarity: 6 }
  const records = [representative, target, wrongRarity, wrongProfession, wrongText]
  const markup = render(GroupTable, { group: 4, terms: [], recordMap: recordMap(records),
    documents: [document('shared', records, '代表スキルの原文')],
    filters: { ...emptyFilters, query: 'シールド', profession: 'SNIPER', rarity: 6 } })
  assert.deepEqual(tableRows(markup), [['クルース', 'S2', '技_target']])
  assert.match(markup, /<h3\b[^>]*>G5 · 1 \/ 5スキル<\/h3>/)
})

test('文字検索は名前・スキル名・原文の表記を既存一覧と同じように正規化する', () => {
  const target = { ...skill('chimera', 'アーミヤ', 3, 'HP+100%'), skillName: 'キメラ' }
  const other = skill('other', 'クルース', 1, '通常攻撃が連続攻撃になる')
  const records = [target, other]
  for (const query of [' アーミヤ ', 'ｷﾒﾗ', ' ｈｐ＋１００％ ']) {
    const markup = render(GroupTable, { group: 0, terms: [], recordMap: recordMap(records),
      documents: [document('shared', records)], filters: { ...emptyFilters, query } })
    assert.deepEqual(tableRows(markup), [['アーミヤ', 'S3', 'キメラ']], `検索語: ${query}`)
  }
})

test('絞り込み後のスキルを名前順で12件ずつページングし、件数は絞り込み前後を区別する', () => {
  const excluded = Array.from({ length: 13 }, (_, index) => ({
    ...skill(`excluded${index + 1}`, 'アーミヤ', index + 1), profession: 'CASTER', professionLabel: '術師',
  }))
  const matched = Array.from({ length: 13 }, (_, index) => skill(`matched${index + 1}`, 'クルース', index + 1))
  const records = [...matched, ...excluded].reverse()
  const markup = render(GroupTable, { group: 2, terms: [], recordMap: recordMap(records),
    documents: [document('shared', records)], filters: { ...emptyFilters, profession: 'SNIPER' } })
  assert.deepEqual(tableRows(markup), matched.slice(0, 12).map(row => [row.operatorName, `S${row.skillIndex}`, row.skillName]))
  assert.match(markup, /<h3\b[^>]*>G3 · 13 \/ 26スキル<\/h3>/)
  assert.match(markup, /1〜12 \/ 13スキル/)
  assert.match(markup, /aria-label="次のスキル一覧"/)
})

test('グループにない職業も選択を維持し、該当0件を表内に表示する', () => {
  const member = skill('member', 'クルース', 1)
  const outside = { ...skill('outside', 'シャイニング', 1), profession: 'MEDIC', professionLabel: '医療', rarity: 6 }
  const markup = render(GroupTable, { group: 1, terms: [], recordMap: recordMap([member, outside]),
    documents: [document('current-group', [member])], filters: { ...emptyFilters, profession: 'MEDIC' } })
  assert.deepEqual(tableRows(markup), [['該当するスキルなし']])
  assert.match(markup, /<td\b[^>]*colspan="3"[^>]*>該当するスキルなし<\/td>/i)
  assert.match(markup, /<h3\b[^>]*>G2 · 0 \/ 1スキル<\/h3>/)
  assert.match(markup, /<option\b(?=[^>]*value="MEDIC")(?=[^>]*selected="")[^>]*>医療<\/option>/)
  assert.doesNotMatch(markup, /aria-label="次のスキル一覧"|<dialog\b/)
})

test('既存モーダルの原文のみ表示で元スキルの最高レベルの数値と原文を表示する', () => {
  const record = skill('selected', 'クルース', 2, '<@ba.vup>攻撃力+{atk:0%}</>\\n選択したスキルだけの原文')
  record.skillLevels = [
    ...Array.from({ length: 9 }, () => ({ description: '低レベルの説明文', blackboard: [] })),
    record.raw,
  ]
  const markup = render(EffectModal, { skill: record, descriptionOnly: true, onClose: () => {} })
  assert.match(markup, /<dialog\b[^>]*aria-modal="true"/)
  assert.match(markup, /<h2\b[^>]*>クルース · S2 技_selected<\/h2>/)
  assert.match(markup, /<p>攻撃力\+125%\n選択したスキルだけの原文<\/p>/)
  assert.match(markup, /特化3/)
  assert.doesNotMatch(markup, /\{atk:0%\}|&lt;@ba\.vup&gt;|低レベルの説明文|発動情報|効果の分類|同じ説明文の掲載先/)
})

test('従来の説明文単位の原文表示は代表文と同じ説明文の掲載先を維持する', () => {
  const first = skill('first', 'アーミヤ', 1, '最初のスキル固有の原文')
  const second = skill('second', 'クルース', 2, '次のスキル固有の原文')
  const markup = render(DocumentSource, {
    document: document('shared', [first, second], '学習に使った代表文'), recordMap: recordMap([first, second]),
  })
  assert.match(markup, /<p>学習に使った代表文<\/p>/)
  assert.match(markup, /同じ説明文の掲載先（2件）/)
  assert.doesNotMatch(markup, /固有の原文/)
  assert.ok(operatorLinks(markup).some(([href, label]) => href === '#/operators/char_first' && label === 'アーミヤ'))
  assert.ok(operatorLinks(markup).some(([href, label]) => href === '#/operators/char_second' && label === 'クルース'))
  assert.doesNotMatch(markup.match(/^<details\b[^>]*>/)?.[0] ?? '', /\bopen=/)
})
