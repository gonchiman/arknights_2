import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Page, Dialog, Summary, buildCoverage, filterCoverage, defaults, empty, records
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()], logLevel: 'error',
    cacheDir: 'node_modules/.vite/dc3-coverage-pages-test', resolve: { preserveSymlinks: true },
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  ;({ DamageCalculatorThreeCoveragePage: Page, DamageCalculatorThreeCoverageDialog: Dialog } =
    await server.ssrLoadModule('/src/components/DamageCalculatorThreeCoveragePage.tsx'))
  ;({ DamageCalculatorThreeCoverageSummary: Summary } =
    await server.ssrLoadModule('/src/components/DamageCalculatorThreeCoverageSummary.tsx'))
  ;({ buildDamageCalculatorThreeCoverage: buildCoverage } = await server.ssrLoadModule('/src/lib/damageCalculatorThreeCoverage.ts'))
  ;({ filterDamageCalculatorThreeCoverage: filterCoverage, DEFAULT_DAMAGE_THREE_COVERAGE_FILTERS: defaults,
    EMPTY_DAMAGE_THREE_COVERAGE_FILTERS: empty } = await server.ssrLoadModule('/src/lib/damageCalculatorThreeCoverageFilters.ts'))
  const { classifySkill } = await server.ssrLoadModule('/src/lib/classifier.ts')
  const source = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardSources.json', import.meta.url), 'utf8'))
  const profiles = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardProfiles.json', import.meta.url), 'utf8'))
  records = source.guards.flatMap(operator => operator.skills.map(skill => {
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
const summaryRows = markup => [...markup.matchAll(/data-coverage-section="([^"]+)"([\s\S]*?)(?=data-coverage-section=|<\/section>)/g)]
const summaryStatuses = ['SUPPORTED', 'CONDITIONAL', 'PENDING', 'UNSUPPORTED', 'NOT_APPLICABLE']
const summaryLabels = ['対応', '条件付き', '保留', '未対応', '対象外']

function assertSummary(markup, total, expectedCounts) {
  const rows = summaryRows(markup)
  assert.deepEqual(rows.map(row => row[1]), ['overall', 'skill', 'talent', 'trait'])
  const legend = markup.match(/<ul class="damage-three-coverage-summary-legend"[^>]*>([\s\S]*?)<\/ul>/)?.[1]
  assert.ok(legend)
  assert.deepEqual([...legend.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(match => text(match[1])), summaryLabels)
  rows.forEach(([, key, content], index) => {
    const counts = expectedCounts[index]
    const label = ['総合', 'スキル', '素質', '特性'][index]
    const expectedDescription = `${label}：${total}スキル中、${counts.map((count, statusIndex) =>
      `${summaryLabels[statusIndex]} ${count}件（${(count / total * 100).toFixed(1)}%）`).join('、')}`
    assert.equal(content.match(/role="img" aria-label="([^"]+)"/)?.[1], expectedDescription, key)
    const segments = [...content.matchAll(/class="damage-three-coverage-summary-segment" data-coverage-status="([^"]+)" style="width:([^%]+)%" title="([^"]+)"/g)]
    assert.deepEqual(segments.map(segment => segment[1]), summaryStatuses.filter((_, i) => counts[i] > 0), key)
    for (const [, status, width, title] of segments) {
      const statusIndex = summaryStatuses.indexOf(status)
      const proportion = counts[statusIndex] / total * 100
      assert.ok(Math.abs(Number(width) - proportion) < 1e-10, `${key}/${status} width`)
      assert.equal(title, `${summaryLabels[statusIndex]} ${counts[statusIndex]}件（${proportion.toFixed(1)}%）`)
    }
    const values = content.match(/<ul class="damage-three-coverage-summary-counts"[^>]*>([\s\S]*?)<\/ul>/)?.[1]
    assert.ok(values)
    assert.deepEqual([...values.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(match => text(match[1])),
      counts.flatMap((count, i) => count > 0 ? [`${summaryLabels[i]} ${count}件 · ${(count / total * 100).toFixed(1)}%`] : []), key)
  })
}

test('初期範囲は星6前衛、1スキル1行の8列で区分別の状態と総合を分ける', () => {
  const extra = { ...records[0], id: 'other', operatorId: 'other', profession: 'CASTER', professionLabel: '術師', rarity: 5 }
  const markup = render(Page, { rows: [...records, extra], loading: false, onOpenOperatorDetail() {} })
  const rows = table(markup)
  assert.deepEqual(rows[0], ['オペレーター', 'S番号', 'スキル名', 'スキル', '素質', '特性', '総合', '詳細'])
  assert.equal(rows.length, 91)
  assert.ok(rows.every(row => row.length === 8))
  const bellone = rows.find(row => row[0] === 'ベッローネ' && row[1] === 'S2')
  assert.deepEqual(bellone.slice(3, 7), ['対応', '条件付き', '対象外', '条件付き'])
  const sakiko = rows.find(row => row[0] === '豊川祥子' && row[1] === 'S2')
  assert.deepEqual(sakiko.slice(3, 7), ['保留', '対応', '対応', '保留'])
  assert.match(markup, /90 \/ 91 スキル表示/)
  assert.match(markup, /対応 74・条件付き 7・保留 9・未対応 0/)
  assert.match(markup, /role="region" aria-label="DC3の対応スキル" tabindex="0"/)
  assert.match(markup, /aria-label="総合の状況"/)
  assert.match(markup, /<a[^>]*href="#\/operators\/char_350_surtr"[^>]*aria-haspopup="dialog"/)
  assert.doesNotMatch(markup, /rowspan|colspan|<small|<br/)
  assert.match(markup, /絞り込み結果の対応状況<\/h2><span>90スキル<\/span>/)
  assertSummary(markup, 90,
    [[74, 7, 9, 0, 0], [80, 4, 6, 0, 0], [76, 6, 5, 0, 3], [51, 0, 1, 0, 38]])
})

test('保留9スキルの横棒は総合100%でもスキル・素質・特性の異なる内訳を表示する', () => {
  const pending = filterCoverage(buildCoverage(records), { ...defaults, status: 'PENDING' })
  const markup = render(Summary, { rows: pending })
  assert.match(markup, /<span>9スキル<\/span>/)
  assertSummary(markup, 9, [[0, 0, 9, 0, 0], [3, 0, 6, 0, 0], [4, 0, 5, 0, 0], [7, 0, 1, 0, 1]])
})

test('単一スキルでは対象外を対応に含めず独立した100%の棒で表示する', () => {
  const selected = filterCoverage(buildCoverage(records), { ...defaults, query: 'ベッローネ S2' })
  const markup = render(Summary, { rows: selected })
  assert.match(markup, /<span>1スキル<\/span>/)
  assertSummary(markup, 1, [[0, 1, 0, 0, 0], [1, 0, 0, 0, 0], [0, 1, 0, 0, 0], [0, 0, 0, 0, 1]])
})

test('検索は複数語・全角S番号に対応し、職業・レアリティ・状況を組み合わせられる', () => {
  const coverage = buildCoverage(records)
  const surtr = filterCoverage(coverage, { ...defaults, query: 'スルト　Ｓ３' })
  assert.equal(surtr.length, 1)
  assert.equal(surtr[0].skill.skillId, 'skchr_surtr_3')
  assert.equal(filterCoverage(coverage, { ...defaults, query: 'スルト S30' }).length, 0)
  assert.equal(filterCoverage(coverage, { ...defaults, status: 'PENDING' }).length, 9)
  assert.equal(filterCoverage(coverage, { ...defaults, status: 'CONDITIONAL' }).length, 7)
  assert.equal(filterCoverage(coverage, { ...defaults, query: 'スルト', status: 'PENDING' }).length, 0)
  const unsupported = { ...coverage[0], skill: { ...coverage[0].skill, profession: 'CASTER', rarity: 5 }, status: 'UNSUPPORTED' }
  assert.equal(filterCoverage([unsupported], defaults).length, 0)
  assert.equal(filterCoverage([unsupported], { ...empty, profession: 'CASTER', rarity: 5, status: 'UNSUPPORTED' }).length, 1)
  assert.equal(filterCoverage([unsupported], { ...empty, rarity: 6 }).length, 0)
})

test('詳細は区分・条件・関連する保留事項を分け、選択したスキルをDC3へ渡す', () => {
  const coverage = buildCoverage(records)
  for (const row of coverage.filter(row => row.status === 'CONDITIONAL' || row.status === 'PENDING')) {
    const markup = render(Dialog, { row, onClose() {} })
    const sections = namedTable(markup, 'damage-three-coverage-sections-table')
    assert.deepEqual(sections[0], ['区分', '項目', '実装状況'])
    assert.ok(sections.every(cells => cells.length === 3))
    assert.ok(sections.some(cells => cells[0] === '素質1'))
    assert.ok(sections.some(cells => cells[0] === '素質2'))
    const facts = namedTable(markup, 'damage-three-coverage-detail-table')
    assert.ok(facts.every(cells => cells.length === 2))
    assert.deepEqual(facts[0], ['項目', '内容'])
    assert.deepEqual(facts.filter(cells => cells[0] === '対応条件').map(cells => cells[1]), row.supportedConditions)
    const issues = namedTable(markup, 'damage-three-coverage-issues-table')
    assert.deepEqual(issues[0], ['関連区分', '保留事項', '現在の対応'])
    assert.deepEqual(issues.slice(1).map(cells => cells[1]), row.issues.map(issue => issue.reason))
    assert.deepEqual(issues.slice(1).map(cells => cells[0]), row.issues.map(issue => issue.relatedSections.join('・')))
    assert.ok(issues.every(cells => cells.length === 3))
    assert.match(markup, new RegExp(`href="#/damage-3\\?operatorId=${row.skill.operatorId}&amp;skillIndex=${row.skill.skillIndex}&amp;skillId=${row.skill.skillId}&amp;levelIndex=9"`))
    assert.doesNotMatch(markup, /rowspan|colspan|<small|<br/)
  }
})

test('未対応スキルの詳細には計算済みの範囲やDC3への選択リンクを捏造しない', () => {
  const row = buildCoverage([{ ...records[0], operatorId: 'unknown', skillId: 'unknown' }])[0]
  const markup = render(Dialog, { row, onClose() {} })
  assert.deepEqual(namedTable(markup, 'damage-three-coverage-detail-table'),
    [['項目', '内容'], ['スキル名', row.skill.skillName], ['総合', '未対応']])
  const sections = namedTable(markup, 'damage-three-coverage-sections-table')
  assert.ok(sections.length > 1)
  assert.ok(sections.slice(1).every(cells => cells[2] === '未対応'))
  assert.doesNotMatch(markup, /計算機3で開く|昇進2|特化3/)
})

test('スルトS3は攻撃に使う素質と計算対象外の生存素質を別行で表示する', () => {
  const row = buildCoverage(records).find(row => row.skill.operatorId === 'char_350_surtr' && row.skill.skillIndex === 3)
  const markup = render(Dialog, { row, onClose() {} })
  const sections = namedTable(markup, 'damage-three-coverage-sections-table')
  assert.equal(sections.find(cells => cells[0] === '素質1')[2], '対応')
  assert.equal(sections.find(cells => cells[0] === '素質2')[2], '対象外')
  const issues = namedTable(markup, 'damage-three-coverage-issues-table')
  assert.ok(issues.slice(1).every(cells => cells[2] === '計算範囲外'))
})

test('読み込み中と結果なしを区別する', () => {
  const pending = render(Page, { rows: records, loading: true, onOpenOperatorDetail() {} })
  assert.match(pending, /読み込み中…/)
  assert.doesNotMatch(pending, /条件に一致するスキルがありません/)
  assert.doesNotMatch(pending, /class="damage-three-coverage-summary"|data-coverage-section=/)
  const emptyPage = render(Page, { rows: [], loading: false, onOpenOperatorDetail() {} })
  assert.match(emptyPage, /条件に一致するスキルがありません/)
  assert.match(emptyPage, /<span>0スキル<\/span>/)
  assert.match(emptyPage, /集計対象のスキルがありません/)
  assert.doesNotMatch(emptyPage, /data-coverage-section=|class="damage-three-coverage-summary-track"|NaN|Infinity/)
})
