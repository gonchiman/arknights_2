import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, GroupTable, EffectModal, DocumentSource, classifySkill
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()],
    cacheDir: 'node_modules/.vite/skill-kmeans-group-table-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  ;({ SkillKMeansGroupTable: GroupTable } = await server.ssrLoadModule('/src/components/SkillKMeansGroupTable.tsx'))
  ;({ SkillClusteringSource: DocumentSource } = await server.ssrLoadModule('/src/components/SkillClusteringSource.tsx'))
  ;({ SkillEffectModal: EffectModal } = await server.ssrLoadModule('/src/components/SkillEffectModal.tsx'))
  ;({ classifySkill } = await server.ssrLoadModule('/src/lib/classifier.ts'))
})
after(async () => { await server?.close() })

const render = (Component, props) => renderToStaticMarkup(createElement(Component, {
  onOpenOperatorDetail: () => {}, ...props,
}))
const text = markup => markup.replace(/<[^>]*>/g, '')
const tableRows = markup => [...(markup.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/)?.[1] ?? '')
  .matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(match => text(match[1]))
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
  assert.deepEqual(rows, [sameFirst, sameSecond, other].map(row => `${row.operatorName}S${row.skillIndex} · ${row.skillName}`))
  const body = markup.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/)?.[1] ?? ''
  const skillButtons = [...body.matchAll(/<button\b[^>]*>/g)].map(match => match[0])
  assert.equal(skillButtons.length, 3)
  for (const button of skillButtons) assert.match(button, /aria-haspopup="dialog"/)
  assert.doesNotMatch(markup, /aria-pressed=|skill-clustering-source|<dialog\b/)
  assert.match(markup, /<th\b[^>]*scope="col"[^>]*>オペレーター<\/th>/)
  assert.match(markup, /<th\b[^>]*scope="col"[^>]*>スキル<\/th>/)
})

test('13件のグループは最初の12件だけを一覧に表示する', () => {
  const records = Array.from({ length: 13 }, (_, index) => skill(`member${index + 1}`, 'アーミヤ', index + 1))
  const markup = render(GroupTable, { group: 2, terms: [], recordMap: recordMap(records),
    documents: [document('shared', [...records].reverse())] })
  const rows = tableRows(markup)
  assert.equal(rows.length, 12)
  assert.ok(rows[0].includes('S1 · 技_member1'))
  assert.ok(rows[11].includes('S12 · 技_member12'))
  assert.ok(rows.every(row => !row.includes('技_member13')))
  assert.match(markup, /aria-label="次のスキル一覧"/)
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
