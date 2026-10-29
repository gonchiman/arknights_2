import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Page, Summary, Table, buildCoverage, filterCoverage, defaults, records
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()], logLevel: 'error',
    cacheDir: 'node_modules/.vite/structure-coverage-pages-test', resolve: { preserveSymlinks: true },
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  ;({ default: Page, StructureCoverageSummary: Summary, StructureCoverageTable: Table } =
    await server.ssrLoadModule('/src/components/StructureCoveragePage.tsx'))
  ;({ buildStructureCoverage: buildCoverage, filterStructureCoverage: filterCoverage,
    DEFAULT_STRUCTURE_COVERAGE_FILTERS: defaults } = await server.ssrLoadModule('/src/lib/structureCoverage.ts'))
  const { classifySkill } = await server.ssrLoadModule('/src/lib/classifier.ts')
  const source = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardSources.json', import.meta.url), 'utf8'))
  const profiles = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardProfiles.json', import.meta.url), 'utf8'))
  records = source.guards.filter(operator => ['char_350_surtr', 'char_293_thorns', 'char_4009_irene'].includes(operator.id))
    .flatMap(operator => operator.skills.map(skill => {
      const raw = skill.raw
      return { operatorId: operator.id, operatorName: operator.name, skillIndex: skill.skillIndex, skillId: skill.skillId,
        id: `${operator.id}:${skill.skillId}`, skillName: raw.name, profession: 'WARRIOR', professionLabel: '前衛',
        subProfessionId: operator.subProfessionId, subProfessionName: operator.subProfessionId, nameInitial: 'OTHER', rarity: 6,
        raw, description: raw.description, duration: raw.duration, durationType: raw.durationType,
        spType: raw.spData.spType, initSp: raw.spData.initSp, spCost: raw.spData.spCost, skillType: raw.skillType,
        classification: classifySkill(raw), skillLevels: Array.from({ length: 10 }, () => raw),
        operatorProfile: profiles.find(candidate => candidate.operatorId === operator.id).operatorProfile }
    }))
})
after(async () => { await server?.close() })

const render = (Component, props) => renderToStaticMarkup(createElement(Component, props))
const text = value => value.replace(/<[^>]+>/g, '').trim()
const table = markup => [...markup.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)]
  .map(row => [...row[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/g)].map(cell => text(cell[1])))
const namedTable = (markup, className) => table(markup.match(
  new RegExp(`<table[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)</table>`))?.[1] ?? '')
const tableProps = { onOpenOperatorDetail() {}, onOpenConcerns() {}, detailId: 'coverage-concerns' }

function example(kind, overrides = {}) {
  return { id: `${kind}:example`, kind, operatorId: 'char_example', operatorName: '対象OP',
    profession: 'WARRIOR', professionLabel: '前衛', rarity: 6, number: kind === 'trait' ? null : 1,
    name: kind === 'trait' ? '剣豪' : `${kind === 'skill' ? 'スキル' : '素質'}名`, jobName: '剣豪',
    description: '', categoryLabels: ['分類A'], registered: true,
    structureHref: `#/${kind}-structure?operatorId=char_example`, concerns: [], ...overrides }
}

test('初期表示は全職業・全レアリティで、全体集計とスキル一覧の単位を分ける', () => {
  const extra = { ...records[0], id: 'unknown:skill', operatorId: 'unknown', operatorName: '未登録OP',
    skillId: 'unknown', profession: 'CASTER', professionLabel: '術師', rarity: 5 }
  const markup = render(Page, { rows: [...records, extra], loading: false, onOpenOperatorDetail() {} })
  const summary = namedTable(markup, 'structure-coverage-summary-table')
  const list = namedTable(markup, 'structure-coverage-list-table')
  assert.deepEqual(summary[0], ['区分', '集計単位', '大分類の対象', '構造登録', '未登録', '登録率'])
  assert.deepEqual(summary[1], ['スキル', 'スキル', '10', '9', '1', '90.0%'])
  assert.deepEqual(summary.slice(1).map(row => row.slice(0, 2)), [['スキル', 'スキル'], ['素質', '素質'], ['特性', 'OP']])
  assert.equal(list.length, 11)
  assert.ok(list.some(row => row[0] === '未登録OP' && row[4] === '未登録'))
  assert.match(markup, /全体の登録状況/)
  assert.match(markup, /全職業・全レアリティ/)
  assert.match(markup, /10 \/ 10 スキル表示/)
  assert.equal((markup.match(/<option value="ALL" selected="">/g) ?? []).length, 3)
  assert.match(markup, /<button[^>]*disabled=""[^>]*>条件をリセット<\/button>/)
})

test('スキル・素質・特性の3タブは対応するパネルを持ち初期スキルだけを表示する', () => {
  const markup = render(Page, { rows: records, loading: false, onOpenOperatorDetail() {} })
  const tabs = [...markup.matchAll(/<button[^>]*role="tab"[^>]*aria-selected="(true|false)"[^>]*aria-controls="([^"]+)"[^>]*>([^<]+)<\/button>/g)]
  assert.deepEqual(tabs.map(match => [match[1], match[3]]), [['true', 'スキル'], ['false', '素質'], ['false', '特性']])
  for (const [, selected, panelId] of tabs) {
    const panel = markup.match(new RegExp(`<section[^>]*id="${panelId}"[^>]*>`))?.[0]
    assert.ok(panel)
    assert.equal(panel.includes('hidden=""'), selected === 'false')
  }
})

test('一覧の絞り込み用データを作っても全体集計の母数と登録率を変えない', () => {
  const coverage = { skill: [example('skill'), example('skill', { id: 'skill:unregistered', registered: false })],
    talent: [example('talent')], trait: [example('trait'), example('trait', { id: 'trait:second' })] }
  const before = render(Summary, { coverage })
  const visible = filterCoverage(coverage.skill, { ...defaults, registration: 'UNREGISTERED' })
  const list = render(Table, { ...tableProps, rows: visible, kind: 'skill' })
  assert.equal(table(list).length, 2)
  assert.equal(table(list)[1][4], '未登録')
  assert.deepEqual(table(before).slice(1), [
    ['スキル', 'スキル', '2', '1', '1', '50.0%'],
    ['素質', '素質', '1', '1', '0', '100.0%'],
    ['特性', 'OP', '2', '2', '0', '100.0%'],
  ])
  assert.equal(render(Summary, { coverage }), before)
})

test('3区分とも1項目1セルの規則的な表とOPモーダルへのリンクを表示する', () => {
  const headers = {
    skill: ['オペレーター', 'S番号', 'スキル名', '大分類', '構造の登録', '保留事項'],
    talent: ['オペレーター', '素質番号', '素質名', '大分類', '構造の登録', '保留事項'],
    trait: ['オペレーター', '職分', '大分類', '構造の登録', '保留事項'],
  }
  for (const kind of ['skill', 'talent', 'trait']) {
    const markup = render(Table, { ...tableProps, rows: [example(kind)], kind })
    const rows = table(markup)
    assert.deepEqual(rows[0], headers[kind])
    assert.ok(rows.every(row => row.length === headers[kind].length))
    assert.match(markup, /role="region" aria-label="[^"]+の登録一覧" tabindex="0"/)
    assert.match(markup, /<a[^>]*href="#\/operators\/char_example"[^>]*aria-haspopup="dialog"/)
    assert.match(markup, /<th scope="col">オペレーター<\/th>/)
    assert.doesNotMatch(markup, /rowspan|colspan|<small|<br/)
  }
})

test('登録済み・未登録と保留事項を別セルに表示し未登録には構造リンクを付けない', () => {
  const registered = example('skill', { concerns: [{ title: '命中順序', detail: '要確認' }] })
  const unresolved = example('skill', { id: 'skill:unknown', operatorId: 'char_unknown', operatorName: '未登録OP',
    name: '未知のスキル', registered: false, structureHref: '#/skill-structure?operatorId=char_unknown' })
  const markup = render(Table, { ...tableProps, rows: [registered, unresolved], kind: 'skill', selectedId: registered.id })
  assert.deepEqual(table(markup).slice(1).map(row => row.slice(4)), [['登録済み', 'あり'], ['未登録', '—']])
  assert.match(markup, /href="#\/skill-structure\?operatorId=char_example"/)
  assert.doesNotMatch(markup, /href="#\/skill-structure\?operatorId=char_unknown"/)
  assert.match(markup, /aria-expanded="true" aria-controls="coverage-concerns"/)
  assert.doesNotMatch(markup, /対応済み|完全対応|構造化完了/)
})

test('登録済みスルトS3の保留を消さず、保留がない項目は記録なしと表示する', () => {
  const coverage = buildCoverage(records)
  const surtr = coverage.skill.filter(row => row.operatorId === 'char_350_surtr')
  const s3 = surtr.find(row => row.number === 3)
  assert.ok(s3.registered && s3.concerns.length > 0)
  const markup = render(Table, { ...tableProps, rows: surtr, kind: 'skill' })
  const rows = table(markup)
  assert.deepEqual(rows.find(row => row[1] === 'S3').slice(4), ['登録済み', 'あり'])
  assert.ok(rows.some(row => row.at(-1) === '記録なし'))
  assert.match(markup, /aria-label="スルト ラグナロクの保留事項"/)
})

test('読み込み中に登録率や空の検索結果を先出しせず、0件では率をダッシュにする', () => {
  const loading = render(Page, { rows: records, loading: true, onOpenOperatorDetail() {} })
  assert.match(loading, /読み込み中…/)
  assert.doesNotMatch(loading, /<table|条件に一致するスキルがありません|NaN|Infinity/)
  const empty = render(Page, { rows: [], loading: false, onOpenOperatorDetail() {} })
  assert.match(empty, /条件に一致するスキルがありません/)
  assert.deepEqual(namedTable(empty, 'structure-coverage-summary-table').slice(1).map(row => row.slice(2)),
    [['0', '0', '0', '—'], ['0', '0', '0', '—'], ['0', '0', '0', '—']])
  assert.doesNotMatch(empty, /NaN|Infinity|0\.0%/)
})
