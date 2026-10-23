import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Page, Dialog, buildCoverage, filterCoverage, defaults, empty, records
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()], logLevel: 'error',
    cacheDir: 'node_modules/.vite/dc3-coverage-pages-test', resolve: { preserveSymlinks: true },
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  ;({ DamageCalculatorThreeCoveragePage: Page, DamageCalculatorThreeCoverageDialog: Dialog } =
    await server.ssrLoadModule('/src/components/DamageCalculatorThreeCoveragePage.tsx'))
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

test('初期範囲は星6前衛、1スキル1行の5列で対応件数と詳細導線を表示する', () => {
  const extra = { ...records[0], id: 'other', operatorId: 'other', profession: 'CASTER', professionLabel: '術師', rarity: 5 }
  const markup = render(Page, { rows: [...records, extra], loading: false, onOpenOperatorDetail() {} })
  const rows = table(markup)
  assert.deepEqual(rows[0], ['オペレーター', 'S番号', 'スキル名', '対応状況', '詳細'])
  assert.equal(rows.length, 91)
  assert.ok(rows.every(row => row.length === 5))
  assert.match(markup, /90 \/ 91 スキル表示/)
  assert.match(markup, /対応 74・条件付き 7・保留 9・未対応 0/)
  assert.match(markup, /role="region" aria-label="DC3の対応スキル" tabindex="0"/)
  assert.match(markup, /<a[^>]*href="#\/operators\/char_350_surtr"[^>]*aria-haspopup="dialog"/)
  assert.doesNotMatch(markup, /rowspan|colspan|<small|<br/)
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

test('詳細は条件と保留理由を別行にし、選択したスキルをDC3へ渡す', () => {
  const coverage = buildCoverage(records)
  for (const row of coverage.filter(row => row.status === 'CONDITIONAL' || row.status === 'PENDING')) {
    const markup = render(Dialog, { row, onClose() {} })
    const facts = table(markup)
    assert.ok(facts.every(cells => cells.length === 2))
    assert.deepEqual(facts[0], ['項目', '内容'])
    assert.deepEqual(facts.filter(cells => cells[0] === '対応条件').map(cells => cells[1]), row.supportedConditions)
    assert.deepEqual(facts.filter(cells => cells[0] === '保留事項').map(cells => cells[1]), row.deferredReasons)
    assert.match(markup, new RegExp(`href="#/damage-3\\?operatorId=${row.skill.operatorId}&amp;skillIndex=${row.skill.skillIndex}&amp;skillId=${row.skill.skillId}&amp;levelIndex=9"`))
    assert.doesNotMatch(markup, /rowspan|colspan|<small|<br/)
  }
})

test('未対応スキルの詳細には計算済みの範囲やDC3への選択リンクを捏造しない', () => {
  const row = buildCoverage([{ ...records[0], operatorId: 'unknown', skillId: 'unknown' }])[0]
  const markup = render(Dialog, { row, onClose() {} })
  assert.deepEqual(table(markup), [['項目', '内容'], ['スキル名', row.skill.skillName], ['対応状況', '未対応']])
  assert.doesNotMatch(markup, /計算機3で開く|昇進2|特化3/)
})

test('読み込み中と結果なしを区別する', () => {
  const pending = render(Page, { rows: [], loading: true, onOpenOperatorDetail() {} })
  assert.match(pending, /読み込み中…/)
  assert.doesNotMatch(pending, /条件に一致するスキルがありません/)
  const emptyPage = render(Page, { rows: [], loading: false, onOpenOperatorDetail() {} })
  assert.match(emptyPage, /条件に一致するスキルがありません/)
})
