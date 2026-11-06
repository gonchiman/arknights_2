import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Page, Dialog, Summary, CoverageTable, HistoryDialog, changeLabel, toCoverageRecords, diffCoverageRecords,
  coverageRecordKey, buildCoverage, filterCoverage, defaults, empty, records
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()], logLevel: 'error',
    cacheDir: 'node_modules/.vite/dc3-coverage-pages-test', resolve: { preserveSymlinks: true },
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  ;({ DamageCalculatorThreeCoveragePage: Page, DamageCalculatorThreeCoverageDialog: Dialog,
    DamageCalculatorThreeCoverageTable: CoverageTable, DamageCalculatorThreeCoverageHistoryDialog: HistoryDialog,
    getCoverageChangeLabel: changeLabel } =
    await server.ssrLoadModule('/src/components/DamageCalculatorThreeCoveragePage.tsx'))
  ;({ DamageCalculatorThreeCoverageSummary: Summary } =
    await server.ssrLoadModule('/src/components/DamageCalculatorThreeCoverageSummary.tsx'))
  ;({ buildDamageCalculatorThreeCoverage: buildCoverage } = await server.ssrLoadModule('/src/lib/damageCalculatorThreeCoverage.ts'))
  ;({ toCoverageRecords, diffCoverageRecords, coverageRecordKey } = await server.ssrLoadModule('/src/lib/damageCalculatorThreeCoverageHistory.ts'))
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
  const legend = markup.match(/<ul class="coverage-stacked-legend"[^>]*>([\s\S]*?)<\/ul>/)?.[1]
  assert.ok(legend)
  assert.deepEqual([...legend.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(match => text(match[1])), summaryLabels)
  rows.forEach(([, key, content], index) => {
    const counts = expectedCounts[index]
    const label = ['総合', 'スキル', '素質', '特性'][index]
    const expectedDescription = `${label}：${total}スキル中、${counts.map((count, statusIndex) =>
      `${summaryLabels[statusIndex]} ${count}件（${(count / total * 100).toFixed(1)}%）`).join('、')}`
    assert.equal(content.match(/role="img" aria-label="([^"]+)"/)?.[1], expectedDescription, key)
    const segments = [...content.matchAll(/class="coverage-stacked-segment" data-coverage-status="([^"]+)" style="[^"]*width:([^%]+)%" title="([^"]+)"/g)]
    assert.deepEqual(segments.map(segment => segment[1]), summaryStatuses.filter((_, i) => counts[i] > 0), key)
    for (const [, status, width, title] of segments) {
      const statusIndex = summaryStatuses.indexOf(status)
      const proportion = counts[statusIndex] / total * 100
      assert.ok(Math.abs(Number(width) - proportion) < 1e-10, `${key}/${status} width`)
      assert.equal(title, `${summaryLabels[statusIndex]} ${counts[statusIndex]}件（${proportion.toFixed(1)}%）`)
    }
    const values = content.match(/<ul class="coverage-stacked-counts"[^>]*>([\s\S]*?)<\/ul>/)?.[1]
    assert.ok(values)
    assert.deepEqual([...values.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(match => text(match[1])),
      counts.flatMap((count, i) => count > 0 ? [`${summaryLabels[i]} ${count}件 · ${(count / total * 100).toFixed(1)}%`] : []), key)
  })
}

test('初期範囲は全職業・全レアリティ、1スキル1行の8列で区分別の状態と総合を分ける', () => {
  const extra = { ...records[0], id: 'other', operatorId: 'other', profession: 'CASTER', professionLabel: '術師', rarity: 5 }
  const markup = render(Page, { rows: [...records, extra], loading: false, onOpenOperatorDetail() {} })
  const rows = table(markup)
  assert.deepEqual(rows[0], ['オペレーター', 'S番号', 'スキル名', 'スキル', '素質', '特性', '総合', '詳細'])
  assert.equal(rows.length, 92)
  assert.ok(rows.every(row => row.length === 8))
  const bellone = rows.find(row => row[0] === 'ベッローネ' && row[1] === 'S2')
  assert.deepEqual(bellone.slice(3, 7), ['対応', '条件付き', '対象外', '条件付き'])
  const sakiko = rows.find(row => row[0] === '豊川祥子' && row[1] === 'S2')
  assert.deepEqual(sakiko.slice(3, 7), ['条件付き', '対応', '対応', '条件付き'])
  assert.match(markup, /91 \/ 91 スキル表示/)
  assert.match(markup, /対応 77・条件付き 13・保留 0・未対応 1/)
  assert.match(markup, /role="region" aria-label="DC3の対応スキル" tabindex="0"/)
  assert.match(markup, /aria-label="総合の状況"/)
  assert.match(markup, /<a[^>]*href="#\/operators\/char_350_surtr"[^>]*aria-haspopup="dialog"/)
  assert.doesNotMatch(markup, /rowspan|colspan|<small|<br/)
  assert.match(markup, /絞り込み結果の対応状況<\/h2><span>91スキル<\/span>/)
  assertSummary(markup, 91,
    [[77, 13, 0, 1, 0], [80, 10, 0, 1, 0], [79, 8, 0, 1, 3], [51, 1, 0, 1, 38]])
})

test('条件付き13スキルの横棒は総合100%でもスキル・素質・特性の異なる内訳を表示する', () => {
  const pending = filterCoverage(buildCoverage(records), { ...defaults, status: 'CONDITIONAL' })
  const markup = render(Summary, { rows: pending })
  assert.match(markup, /<span>13スキル<\/span>/)
  assertSummary(markup, 13, [[0, 13, 0, 0, 0], [3, 10, 0, 0, 0], [5, 8, 0, 0, 0], [6, 1, 0, 0, 6]])
})

test('単一スキルでは対象外を対応に含めず独立した100%の棒で表示する', () => {
  const selected = filterCoverage(buildCoverage(records), { ...defaults, query: 'ベッローネ S2' })
  const markup = render(Summary, { rows: selected })
  assert.match(markup, /<span>1スキル<\/span>/)
  assertSummary(markup, 1, [[0, 1, 0, 0, 0], [1, 0, 0, 0, 0], [0, 1, 0, 0, 0], [0, 0, 0, 0, 1]])
})

test('純治療スキルの対象外を総合選択肢・表・凡例に表示し、計算機へのリンクを作らない', () => {
  const source = JSON.parse(readFileSync(new URL('../src/data/dc3NonDamageSources.json', import.meta.url), 'utf8'))
    .find(source => source.operatorId === 'char_147_shining')
  const entry = source.skills[0]
  const skill = { ...records[0], operatorId: source.operatorId, operatorName: source.operatorName,
    id: `${source.operatorId}/${entry.skillIndex}`, skillId: entry.skillId, skillIndex: entry.skillIndex,
    skillName: entry.raw.name, profession: source.profession, professionLabel: '医療', subProfessionId: source.subProfessionId,
    subProfessionName: source.subProfessionId, raw: entry.raw,
    skillLevels: Array.from({ length: source.skillLevelIndex + 1 }, () => entry.raw), operatorProfile: source.profile }
  const html = render(Page, { rows: [skill], loading: false, onOpenOperatorDetail() {} })
  assert.match(html, /<option value="NOT_APPLICABLE">対象外<\/option>/)
  assert.match(html, /対応 0・条件付き 0・保留 0・未対応 0・対象外 1/)
  assert.deepEqual(table(html)[1].slice(3, 7), ['対象外', '対象外', '対象外', '対象外'])
  assertSummary(html, 1, Array.from({ length: 4 }, () => [0, 0, 0, 0, 1]))
  const row = toCoverageRecords(buildCoverage([skill]))[0]
  const detail = render(Dialog, { row, onClose() {} })
  assert.doesNotMatch(detail, /計算機3で開く/)
  assert.match(detail, /回復・味方支援の効果量はダメージ計算の対象外/)
})

test('検索は複数語・全角S番号に対応し、職業・レアリティ・状況を組み合わせられる', () => {
  const coverage = buildCoverage(records)
  const surtr = filterCoverage(coverage, { ...defaults, query: 'スルト　Ｓ３' })
  assert.equal(surtr.length, 1)
  assert.equal(surtr[0].skill.skillId, 'skchr_surtr_3')
  assert.equal(filterCoverage(coverage, { ...defaults, query: 'スルト S30' }).length, 0)
  assert.equal(filterCoverage(coverage, { ...defaults, status: 'PENDING' }).length, 0)
  assert.equal(filterCoverage(coverage, { ...defaults, status: 'CONDITIONAL' }).length, 13)
  assert.equal(filterCoverage(coverage, { ...defaults, query: 'スルト', status: 'PENDING' }).length, 0)
  const unsupported = { ...coverage[0], skill: { ...coverage[0].skill, profession: 'CASTER', rarity: 5 }, status: 'UNSUPPORTED' }
  assert.equal(filterCoverage([unsupported], defaults).length, 1)
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
  assert.doesNotMatch(emptyPage, /data-coverage-section=|class="coverage-stacked-track"|NaN|Infinity/)
})

test('初期表示は現在の実装・比較なしで、比較がない間は変更のみを無効にする', () => {
  const markup = render(Page, { rows: records, loading: false, onOpenOperatorDetail() {} })
  assert.match(markup, /aria-label="バージョン"[^>]*><option value="CURRENT" selected="">現在の実装/)
  assert.match(markup, /aria-label="比較元"[^>]*><option value="" selected="">比較なし/)
  assert.match(markup, /type="checkbox" disabled=""/)
  assert.match(markup, /aria-label="職業"[^>]*><option value="ALL" selected="">すべて/)
  assert.match(markup, /aria-label="レアリティ"[^>]*><option value="ALL" selected="">すべて/)
  assert.match(markup, /aria-haspopup="dialog"[^>]*>版の履歴/)
  assert.match(markup, /id="dc3-coverage-tab-list"[^>]*aria-selected="true"/)
  assert.match(markup, /id="dc3-coverage-tab-compare"[^>]*aria-selected="false"/)
  assert.match(markup, /id="dc3-coverage-panel-compare"[^>]*hidden=""/)
})

test('保存版の最小スキル情報だけで絞り込み・集計・詳細表示し、現在の育成条件に置き換えない', () => {
  const archived = toCoverageRecords(buildCoverage(records)).find(row => row.skill.operatorId === 'char_350_surtr' && row.skill.skillIndex === 3)
  archived.skill.operatorName = '保存時のスルト'
  archived.skill.skillName = '保存時のラグナロク'
  archived.conditionsLabel = '昇進1・Lv80・信頼0・スキルLv7・潜在2・MODなし'
  assert.equal('operatorProfile' in archived.skill, false)
  assert.deepEqual(filterCoverage([archived], { ...defaults, query: '保存時のスルト S3' }), [archived])
  assert.match(render(Summary, { rows: [archived] }), /<span>1スキル<\/span>/)
  const markup = render(Dialog, { row: archived, historical: true, onClose() {} })
  assert.match(markup, /保存時のスルト S3/)
  assert.match(markup, /保存時のラグナロク/)
  assert.match(markup, /昇進1・Lv80・信頼0・スキルLv7・潜在2・MODなし/)
  assert.doesNotMatch(markup, /昇進2・特化3/)
  assert.match(markup, />現在の計算機3で開く<\/a>/)
  assert.doesNotMatch(markup, />計算機3で開く<\/a>/)
  const missingConditions = render(Dialog, { row: { ...archived, conditionsLabel: undefined }, historical: true, onClose() {} })
  assert.match(missingConditions, /育成条件の記録なし/)
  assert.doesNotMatch(missingConditions, /昇進2・特化3/)
})

test('同じ総合状態でも素質・条件・計算範囲の変更項目と保存した前後の内容を表示する', () => {
  const before = toCoverageRecords(buildCoverage(records)).find(row => row.skill.operatorId === 'char_350_surtr' && row.skill.skillIndex === 3)
  const after = structuredClone(before)
  after.details.find(detail => detail.id === 'talent-1').name = '変更後の素質'
  before.calculationScope = ['変更前の計算範囲']
  after.calculationScope = ['変更後の計算範囲']
  before.supportedConditions = ['変更前の条件']
  after.supportedConditions = ['変更後の条件']
  before.conditionsLabel = '昇進2・Lv70・特化2'
  after.conditionsLabel = '昇進2・Lv90・特化3'
  const [change] = diffCoverageRecords([before], [after])
  assert.equal(change.kind, 'CHANGED')
  assert.equal(changeLabel(change), '変更')
  assert.deepEqual(change.fields, ['素質', '計算条件', '計算範囲', '対応条件'])
  const markup = render(CoverageTable, { rows: [after], changes: new Map([[change.key, change]]), onOpenOperatorDetail() {}, onDetail() {} })
  const cells = table(markup)
  assert.equal(cells[0].length, 11)
  assert.deepEqual(cells[0].slice(7), ['変更', '比較元の総合', '変更項目', '詳細'])
  assert.equal(cells[1][6], cells[1][8])
  assert.equal(cells[1][9], '素質・計算条件・計算範囲・対応条件')
  assert.match(markup, /data-coverage-change="CHANGED"/)
  const detail = render(Dialog, { row: after, change, historical: true, beforeLabel: 'v1', afterLabel: 'v2', onClose() {} })
  const difference = namedTable(detail, 'damage-three-coverage-change-table')
  assert.deepEqual(difference[0], ['変更項目', 'v1', 'v2'])
  assert.deepEqual(difference.find(row => row[0] === '計算条件'), ['計算条件', before.conditionsLabel, after.conditionsLabel])
  assert.deepEqual(difference.find(row => row[0] === '計算範囲'), ['計算範囲', '変更前の計算範囲', '変更後の計算範囲'])
  assert.deepEqual(difference.find(row => row[0] === '対応条件'), ['対応条件', '変更前の条件', '変更後の条件'])
  assert.match(difference.find(row => row[0] === '素質')[2], /変更後の素質/)
  const aggregateOnly = structuredClone(before)
  aggregateOnly.sections.talent = 'PENDING'
  const [aggregateChange] = diffCoverageRecords([before], [aggregateOnly])
  const aggregateDetail = render(Dialog, { row: aggregateOnly, change: aggregateChange, onClose() {} })
  const talentChange = namedTable(aggregateDetail, 'damage-three-coverage-change-table').find(row => row[0] === '素質')
  assert.match(talentChange[1], /素質：対応/)
  assert.match(talentChange[2], /素質：保留/)
})

test('新規対応・カタログ追加・カタログ削除を区別し、削除された行に現在の状態を表示しない', () => {
  const row = toCoverageRecords(buildCoverage(records))[0]
  const old = { ...row, status: 'UNSUPPORTED', selection: undefined }
  const supported = { ...row, status: 'SUPPORTED' }
  assert.equal(changeLabel(diffCoverageRecords([old], [supported])[0]), '新規対応')
  assert.equal(changeLabel(diffCoverageRecords([old], [{ ...row, status: 'PENDING' }])[0]), '登録追加')
  assert.equal(changeLabel(diffCoverageRecords([], [supported])[0]), 'カタログ追加')
  const [removed] = diffCoverageRecords([supported], [])
  assert.equal(changeLabel(removed), 'カタログ削除')
  const markup = render(CoverageTable, { rows: [supported], changes: new Map([[coverageRecordKey(supported), removed]]), onOpenOperatorDetail() {}, onDetail() {} })
  assert.deepEqual(table(markup)[1].slice(3, 10), ['—', '—', '—', '—', 'カタログ削除', '対応', 'カタログ'])
  const detail = render(Dialog, { row: supported, change: removed, historical: true, onClose() {} })
  assert.deepEqual(namedTable(detail, 'damage-three-coverage-change-table')[1], ['カタログ', '対応', 'カタログに存在しない'])
})

test('版の履歴は再集計と保存時の記録を区別し、コード・ゲームデータの識別情報を表示する', () => {
  const source = { codeRevision: 'old-revision', codeDirty: true, codeFingerprint: 'code-sha', gameDataRevision: 'game-revision', gameDataFingerprint: 'game-sha', reconstructed: true }
  const version = { schemaVersion: 1, id: 'v1', label: 'v1 拡張前（再集計）', capturedAt: '2026-11-04T00:00:00Z', source, skillCount: 915, file: 'v1.json', sha256: 'file-sha', counts: {} }
  const markup = render(HistoryDialog, { versions: [version, { ...version, id: 'v2', label: 'v2', source: { ...source, reconstructed: false } }], onClose() {} })
  const rows = namedTable(markup, 'damage-three-coverage-history-table')
  assert.deepEqual(rows[0], ['バージョン', '記録日時', '記録方法', 'スキル数', 'コード', 'ゲームデータ'])
  assert.equal(rows[1][2], '過去コードを記録時のゲームデータで再集計')
  assert.equal(rows[2][2], '保存時の実装を記録')
  assert.equal(rows[1][3], '915')
  assert.match(rows[1][4], /old-revision（未コミットの変更を含む）/)
  assert.match(rows[1][4], /code-sha/)
  assert.match(rows[1][5], /game-revision/)
  assert.match(rows[1][5], /game-sha/)
  assert.match(markup, /aria-label="実装範囲の保存履歴" tabindex="0"/)
})
