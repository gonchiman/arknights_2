import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Page, SummaryTable, Strip, ObservationTable, ScatterPanel, classifySkill, buildDataset, summarize, metrics, defaults, rows
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props))
const text = markup => markup.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
const raw = (changes = {}) => ({
  name: '未対応スキル', description: '攻撃力が上昇', duration: 30, durationType: 'NONE', skillType: 'MANUAL',
  spData: { spType: 'INCREASE_WITH_TIME', spCost: 40, initSp: 0 }, ...changes,
})
function record(id, levels = [raw()], changes = {}) {
  const last = levels.at(-1) ?? raw()
  return {
    id, operatorId: id, operatorName: id, profession: 'WARRIOR', professionLabel: '前衛',
    subProfessionId: 'lord', subProfessionName: '領主', rarity: 6, nameInitial: 'OTHER',
    skillIndex: 1, skillId: `unreviewed-${id}`, skillName: last.name, description: last.description,
    duration: last.duration, durationType: last.durationType, skillType: last.skillType,
    spType: last.spData?.spType, initSp: last.spData?.initSp, spCost: last.spData?.spCost,
    classification: classifySkill(last), raw: last, skillLevels: levels,
    // Numeric metadata is usable even without a combat profile or a reviewed DC3 implementation.
    operatorProfile: {}, ...changes,
  }
}
const summaryRows = markup => new Map([...markup.matchAll(/<tr><th scope="row">([^<]+)<\/th>(.*?)<\/tr>/g)]
  .map(([, label, cells]) => [label, [...cells.matchAll(/<td>(.*?)<\/td>/g)].map(([, value]) => value)]))

before(async () => {
  server = await createServer({
    configFile: false, plugins: [react()], logLevel: 'error',
    cacheDir: 'node_modules/.vite/skill-numeric-statistics-page-test', resolve: { preserveSymlinks: true },
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  const page = await server.ssrLoadModule('/src/components/SkillNumericStatisticsPage.tsx')
  Page = page.default
  SummaryTable = page.SkillNumericSummaryTable
  Strip = page.SkillNumericStatisticStrip
  ObservationTable = page.SkillNumericObservationTable
  ScatterPanel = page.SkillNumericScatterPanel
  ;({ classifySkill } = await server.ssrLoadModule('/src/lib/classifier.ts'))
  const numeric = await server.ssrLoadModule('/src/lib/skillNumericStatistics.ts')
  buildDataset = numeric.buildSkillNumericDataset
  summarize = numeric.summarizeSkillNumericMetric
  metrics = numeric.SKILL_NUMERIC_METRICS
  defaults = numeric.DEFAULT_SKILL_NUMERIC_CONFIG
  rows = [
    record('未対応OP'),
    record('永続OP', [raw({ name: '永続スキル', duration: -1, description: '退場まで効果継続',
      spData: { spType: 'INCREASE_WITH_TIME', spCost: 20, initSp: 25 } })]),
    record('必要SP不明', [raw({ duration: 10, spData: { spType: 'INCREASE_WITH_TIME', initSp: 0 } })]),
    record('弾薬OP', [raw({ durationType: 'AMMO', duration: 5,
      spData: { spType: 'INCREASE_WITH_TIME', spCost: 3, initSp: 0 } })]),
    record('持続不明', [raw({ duration: Number.NaN, description: '不明',
      spData: { spType: 'INCREASE_WITH_TIME', spCost: 8, initSp: 3 } })]),
    record('攻撃回復OP', [raw({ spData: { spType: 'INCREASE_WHEN_ATTACK', spCost: 2, initSp: 0 } })]),
  ]
})

after(async () => { await server?.close() })

test('initial summary uses natural recovery and six independent numeric metrics with standard navigation', () => {
  const markup = render(Page, { rows, loading: false })
  assert.doesNotMatch(markup, /<h1\b/)
  assert.match(markup, /aria-label="スキル数値分析 \/ 集計条件の場所をコピー"/)
  assert.match(markup, /aria-label="スキル数値分析 \/ 統計量の場所をコピー"/)
  assert.match(markup, /role="tab" aria-selected="true"[^>]*>統計量/)
  assert.match(markup, /role="tab" aria-selected="false"[^>]*>分布/)
  assert.match(markup, /role="tab" aria-selected="false"[^>]*aria-controls="[^"]+-panel-scatter"[^>]*>散布図/)
  assert.match(markup, /role="tab" aria-selected="false"[^>]*>スキル一覧/)
  assert.match(markup, /<option value="INCREASE_WITH_TIME" selected="">自然回復<\/option>/)
  assert.match(markup, /<option value="MAX" selected="">最高Lv<\/option>/)
  assert.match(markup, /role="region" tabindex="0" aria-label="各指標の統計量"/)
  assert.match(text(markup), /対象 5件/)
  const summaries = summaryRows(markup)
  assert.equal(summaries.size, 6)
  assert.deepEqual(summaries.get('持続時間（秒）'), ['2', '3', '10', '15', '20', '20', '25', '30', '10'])
  assert.deepEqual(summaries.get('必要SP').slice(0, 2), ['4', '1'])
  assert.deepEqual(summaries.get('初期SP').slice(0, 2), ['5', '0'])
  assert.deepEqual(summaries.get('必要SP−初期SP').slice(0, 3), ['4', '1', '-5'])
  assert.deepEqual(summaries.get('初期SP率（%）').map(value => value.replace(/\s/g, '')),
    ['4', '1', '0%', '0%', '18.75%', '40.63%', '59.38%', '125%', '51.06pt'])
  assert.deepEqual(summaries.get('理論稼働率（%）'), ['0', '5', '—', '—', '—', '—', '—', '—', '—'])
  assert.doesNotMatch(markup, /DC3未対応|DPS未計算|NaN|Infinity|role="img"/)
})

test('the skill table separates operator, skill number and name while retaining permanent and signed values', () => {
  const observations = buildDataset(rows, defaults).observations
  const markup = render(ObservationTable, { observations, onOpenSkill() {} })
  assert.equal((markup.match(/scope="col"/g) ?? []).length, 9)
  assert.match(markup, /role="region" tabindex="0" aria-label="スキルの数値"/)
  assert.match(markup, /aria-label="オペレーターで並べ替え"/)
  assert.match(markup, /aria-label="Sで並べ替え"/)
  assert.match(markup, /aria-label="初期SP率（%）で並べ替え"/)
  assert.match(markup, /aria-label="理論稼働率（%）で並べ替え"/)
  assert.match(markup, /aria-label="未対応OP S1 未対応スキルのスキル効果を表示"/)
  assert.match(markup, /未対応OP<\/button><\/th><td[^>]*>S1<\/td><td[^>]*>未対応スキル<\/td><td>30<\/td><td>40<\/td><td>0<\/td><td>40<\/td><td>0<\/td><td>—<\/td><\/tr>/)
  assert.match(markup, /永続OP<\/button><\/th><td[^>]*>S1<\/td><td[^>]*>永続スキル<\/td><td>永続<\/td><td>20<\/td><td>25<\/td><td>-5<\/td><td>125<\/td><td>—<\/td><\/tr>/)
  assert.match(markup, /<td>弾薬制<\/td>/)
  assert.match(markup, /<td>10<\/td><td>—<\/td><td>0<\/td><td>—<\/td><td>—<\/td><td>—<\/td><\/tr>/)
  assert.doesNotMatch(markup, /攻撃回復OP|NaN|Infinity|<a\b/)
})

test('the table name and detail action refer to the exact selected level', () => {
  const levels = Array.from({ length: 10 }, () => raw({ name: '最高Lvの名称' }))
  levels[6] = raw({ name: 'Lv7の名称', duration: 17 })
  const observations = buildDataset([record('レベルOP', levels)], { ...defaults, skillLevel: 'RANK_7' }).observations
  const markup = render(ObservationTable, { observations, onOpenSkill() {} })
  assert.match(markup, /aria-label="レベルOP S1 Lv7の名称のスキル効果を表示"/)
  assert.match(markup, /<td[^>]*>Lv7の名称<\/td><td>17<\/td>/)
  assert.doesNotMatch(markup, /最高Lvの名称/)
})

test('empty and unavailable metrics display zero counts and unknown statistics rather than invented zeros', () => {
  const markup = render(Page, { rows: [], loading: false })
  assert.match(text(markup), /対象 0件/)
  for (const cells of summaryRows(markup).values()) assert.deepEqual(cells, ['0', '0', '—', '—', '—', '—', '—', '—', '—'])
  const passive = record('SPなし', [raw({ spData: { spType: 'NO_SP', spCost: 0, initSp: 0 } })])
  const dataset = buildDataset([passive], { ...defaults, spRecovery: 'NO_SP' })
  const summaries = metrics.map(definition => summarize(dataset, definition.key))
  const summaryMarkup = render(SummaryTable, { summaries })
  assert.deepEqual(summaryRows(summaryMarkup).get('必要SP'), ['0', '1', '—', '—', '—', '—', '—', '—', '—'])
  assert.deepEqual(summaryRows(summaryMarkup).get('初期SP率（%）'), ['0', '1', '—', '—', '—', '—', '—', '—', '—'])
  const strip = render(Strip, { statistics: summaries[1].statistics, label: '必要SP' })
  assert.match(strip, /aria-label="必要SPの統計量"/)
  assert.equal((strip.match(/<td>—<\/td>/g) ?? []).length, 7)
  const emptyTable = render(ObservationTable, { observations: [], onOpenSkill() {} })
  assert.match(emptyTable, /colspan="9"/i)
  assert.match(text(emptyTable), /対象のスキルは0件です。/)
  assert.doesNotMatch(markup + summaryMarkup + strip + emptyTable, /NaN|Infinity/)
})

test('the distribution strip expresses ratios as percentages and their deviation in percentage points', () => {
  const { statistics } = summarize(buildDataset(rows, defaults), 'initialRatio')
  const markup = render(Strip, { statistics, label: '初期SP率', unit: '%' })
  assert.match(markup, /aria-label="初期SP率の統計量"/)
  const cells = [...markup.matchAll(/<td>(.*?)<\/td>/g)].map(([, value]) => value.replace(/\s/g, ''))
  assert.deepEqual(cells, ['0%', '0%', '18.75%', '40.63%', '59.38%', '125%', '51.06pt'])
})

test('loading and data-source errors never expose a calculated result', () => {
  const loading = render(Page, { rows, loading: true })
  assert.match(text(loading), /読み込み中/)
  assert.match(loading, /type="submit" class="button" disabled=""/)
  assert.doesNotMatch(loading, /role="tabpanel"|skill-numeric-summary-table/)
  const failure = render(Page, { rows, loading: false, error: 'スキルデータを取得できませんでした。' })
  assert.match(failure, /role="alert"[^>]*>スキルデータを取得できませんでした。/)
  assert.doesNotMatch(failure, /role="tabpanel"|skill-numeric-summary-table/)
})

const scatter = (dataset, extra = {}) => render(ScatterPanel, {
  dataset, xMetric: 'spCost', yMetric: 'duration', pointMode: 'count', showFit: true,
  onAxisChange() {}, onSwap() {}, onPointModeChange() {}, onShowFitChange() {}, ...extra,
})
const pearson = markup => markup.match(/<dt>Pearson r<\/dt><dd>(.*?)<\/dd>/)?.[1]
const rSquared = markup => markup.match(/<dt>R²<\/dt><dd>(.*?)<\/dd>/)?.[1]
const equation = markup => text(markup.match(/<p[^>]*aria-label="回帰式"[^>]*>(.*?)<\/p>/)?.[1] ?? '')
const weightedScatterDataset = () => buildDataset([
  record('負のSP差', [raw({ duration: 10, spData: { spType: 'INCREASE_WITH_TIME', spCost: 15, initSp: 20 } })]),
  record('ゼロSP', [raw({ duration: 20, spData: { spType: 'INCREASE_WITH_TIME', spCost: 0, initSp: 0 } })]),
  record('ゼロSP重複', [raw({ duration: 20, spData: { spType: 'INCREASE_WITH_TIME', spCost: 0, initSp: 0 } })]),
  record('正のSP差', [raw({ duration: 40, spData: { spType: 'INCREASE_WITH_TIME', spCost: 10, initSp: 5 } })]),
  record('SP差不明', [raw({ duration: 40, spData: { spType: 'INCREASE_WITH_TIME', initSp: 0 } })]),
  record('秒数なし', [raw({ duration: -1, description: '退場まで効果継続' })]),
], defaults)

test('scatter controls identify selected axes and prevent selecting their counterpart metric', () => {
  const markup = scatter(buildDataset(rows, defaults))
  const xOptions = markup.match(/<label class="skill-numeric-x-field">.*?<select[^>]*>(.*?)<\/select>/)?.[1]
  const yOptions = markup.match(/<label class="skill-numeric-y-field">.*?<select[^>]*>(.*?)<\/select>/)?.[1]
  assert.ok(xOptions && yOptions)
  assert.match(xOptions, /<option value="spCost" selected="">必要SP<\/option>/)
  assert.match(xOptions, /<option value="duration" disabled="">持続時間<\/option>/)
  assert.match(yOptions, /<option value="duration" selected="">持続時間<\/option>/)
  assert.match(yOptions, /<option value="spCost" disabled="">必要SP<\/option>/)
  assert.match(markup, /aria-label="軸を入れ替える"/)
  assert.match(markup, /<option value="count" selected="">件数を大きさで表示<\/option>/)
  assert.match(markup, /<option value="overplot">半透明の点を重ねる<\/option>/)
  assert.match(markup, /type="checkbox"[^>]*checked=""/)
  assert.match(text(markup), /回帰線/)
  assert.equal(rSquared(markup), '—')
  assert.doesNotMatch(markup, /aria-label="回帰式"|class="numeric-scatter-chart-fit"|NaN|Infinity/)
})

test('scatter displays the paired sample count rather than either univariate valid count', () => {
  const dataset = buildDataset(rows, defaults)
  assert.equal(summarize(dataset, 'spCost').validCount, 4)
  assert.equal(summarize(dataset, 'duration').validCount, 2)
  const markup = scatter(dataset)
  assert.match(text(markup), /有効 1件 ／ 対象外 4件/)
  assert.equal(pearson(markup), '—')
  assert.equal(rSquared(markup), '—')
  assert.equal(equation(markup), '')
  assert.doesNotMatch(markup, /Pearson r<\/dt><dd>0<\/dd>/)
})

test('reviewed uptime is available in the list, distribution statistics, and scatter against initial SP ratio', () => {
  const { guards } = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardSources.json', import.meta.url), 'utf8'))
  const reviewed = [['char_350_surtr', 2], ['char_264_f12yin', 3]].map(([operatorId, skillIndex]) => {
    const guard = guards.find(item => item.id === operatorId)
    const { skillId, raw: level } = guard.skills.find(item => item.skillIndex === skillIndex)
    return record(guard.name, Array(10).fill(level), { operatorId, skillId, skillIndex, subProfessionId: guard.subProfessionId })
  })
  const dataset = buildDataset([...reviewed, record('未確認')], defaults)
  const table = render(ObservationTable, { observations: dataset.observations, onOpenSkill() {} })
  assert.match(table, /<td>66\.67<\/td><td>50<\/td><\/tr>/)
  const { statistics } = summarize(dataset, 'uptime')
  const { label, unit } = metrics.find(item => item.key === 'uptime')
  const strip = render(Strip, { statistics, label, unit })
  assert.match(strip, /aria-label="理論稼働率の統計量"/)
  assert.match(strip, /<td>50%<\/td><td>3\.57\s*pt<\/td>/)
  for (const [xMetric, yMetric] of [['initialRatio', 'uptime'], ['uptime', 'initialRatio']]) {
    const markup = scatter(dataset, { xMetric, yMetric })
    assert.match(markup, /<option value="uptime" selected="">理論稼働率<\/option>/)
    assert.match(markup, /<option value="uptime" disabled="">理論稼働率<\/option>/)
    assert.match(text(markup), /有効 2件 ／ 対象外 1件/)
    assert.match(equation(markup), /初期SP率（%）/)
    assert.match(equation(markup), /理論稼働率（%）/)
  }
})

test('either scatter axis can use the initial SP ratio with its unit and only valid pairs', () => {
  const dataset = weightedScatterDataset()
  for (const [xMetric, yMetric, xLabel, yLabel] of [
    ['initialRatio', 'duration', '初期SP率（%）', '持続時間（秒）'],
    ['duration', 'initialRatio', '持続時間（秒）', '初期SP率（%）'],
  ]) {
    const markup = scatter(dataset, { xMetric, yMetric })
    assert.match(markup, /<option value="initialRatio" selected="">初期SP率<\/option>/)
    assert.match(markup, /<option value="initialRatio" disabled="">初期SP率<\/option>/)
    assert.ok(markup.includes(`>${xLabel}と${yLabel}</title>`))
    assert.match(text(markup), /有効 2件 ／ 対象外 4件/)
    assert.ok(equation(markup).startsWith(`${yLabel} = `))
    assert.ok(equation(markup).includes(` × ${xLabel} `))
  }
})

test('signed and zero-valued pairs remain valid and point display mode does not change statistical weighting', () => {
  const dataset = weightedScatterDataset()
  for (const pointMode of ['count', 'overplot']) {
    const markup = scatter(dataset, { xMetric: 'spGap', pointMode })
    assert.match(text(markup), /有効 4件 ／ 対象外 2件/)
    // Two skills at (0, 20) keep their original weight; collapsing them would give r = 0.982.
    assert.equal(pearson(markup), '0.9733')
    assert.equal(rSquared(markup), '0.9474')
    assert.equal(equation(markup), '持続時間（秒） = 3 × 必要SP−初期SP + 22.5')
    assert.match(markup, /class="numeric-scatter-chart-fit"/)
    assert.match(markup, /必要SP−初期SP/)
    assert.doesNotMatch(markup, /NaN|Infinity/)
  }
})

test('constant axes, empty data and missing SP produce an undefined correlation instead of zero', () => {
  const constant = buildDataset([
    record('一定1', [raw({ duration: 30, spData: { spType: 'INCREASE_WITH_TIME', spCost: 10, initSp: 0 } })]),
    record('一定2', [raw({ duration: 30, spData: { spType: 'INCREASE_WITH_TIME', spCost: 20, initSp: 0 } })]),
  ], defaults)
  const missingSp = buildDataset([
    record('パッシブ', [raw({ duration: 20, spData: { spType: 'NO_SP', spCost: 0, initSp: 0 } })]),
  ], { ...defaults, spRecovery: 'NO_SP' })
  for (const [dataset, count] of [[constant, '有効 2件 ／ 対象外 0件'], [buildDataset([], defaults), '有効 0件 ／ 対象外 0件'], [missingSp, '有効 0件 ／ 対象外 1件']]) {
    const markup = scatter(dataset)
    assert.ok(text(markup).includes(count))
    assert.equal(pearson(markup), '—')
    assert.equal(rSquared(markup), '—')
    assert.doesNotMatch(markup, /NaN|Infinity|Pearson r<\/dt><dd>0<\/dd>/)
  }
})

test('turning the fit off hides only the regression line and equation, retaining r, R² and paired sample counts', () => {
  const dataset = weightedScatterDataset()
  for (const pointMode of ['count', 'overplot']) {
    const on = scatter(dataset, { xMetric: 'spGap', pointMode, showFit: true })
    const off = scatter(dataset, { xMetric: 'spGap', pointMode, showFit: false })
    assert.equal(pearson(on), pearson(off))
    assert.equal(rSquared(on), rSquared(off))
    assert.equal(pearson(off), '0.9733')
    assert.equal(rSquared(off), '0.9474')
    assert.match(text(on), /有効 4件 ／ 対象外 2件/)
    assert.match(text(off), /有効 4件 ／ 対象外 2件/)
    assert.match(on, /type="checkbox"[^>]*checked=""/)
    assert.doesNotMatch(off, /type="checkbox"[^>]*checked=""/)
    assert.match(on, /class="numeric-scatter-chart-fit"/)
    assert.doesNotMatch(off, /class="numeric-scatter-chart-fit"|aria-label="回帰式"/)
    assert.equal((on.match(/class="numeric-scatter-chart-point"/g) ?? []).length,
      (off.match(/class="numeric-scatter-chart-point"/g) ?? []).length)
  }
})

test('a negative regression intercept uses a minus sign without combining plus and a signed value', () => {
  const dataset = buildDataset([10, 20, 30].map((cost, index) => record(`切片${index}`, [raw({
    duration: 2 * cost - 10, spData: { spType: 'INCREASE_WITH_TIME', spCost: cost, initSp: 0 },
  })])), defaults)
  const markup = scatter(dataset)
  assert.equal(pearson(markup), '1')
  assert.equal(rSquared(markup), '1')
  assert.equal(equation(markup), '持続時間（秒） = 2 × 必要SP − 10')
  assert.doesNotMatch(equation(markup), /\+\s*[-−]/)
})

test('an undefined fit for constant X or an insufficient sample produces no line or equation', () => {
  const constantX = buildDataset([10, 20].map((duration, index) => record(`一定X${index}`, [raw({
    duration, spData: { spType: 'INCREASE_WITH_TIME', spCost: 10, initSp: 0 },
  })])), defaults)
  for (const dataset of [constantX, buildDataset([record('1件')], defaults), buildDataset([], defaults)]) {
    const markup = scatter(dataset)
    assert.equal(rSquared(markup), '—')
    assert.equal(equation(markup), '')
    assert.doesNotMatch(markup, /class="numeric-scatter-chart-fit"|aria-label="回帰式"|NaN|Infinity/)
  }
})

test('constant Y retains a horizontal regression line while Pearson r and R² remain undefined', () => {
  const dataset = buildDataset([10, 20].map((cost, index) => record(`水平${index}`, [raw({
    duration: 30, spData: { spType: 'INCREASE_WITH_TIME', spCost: cost, initSp: 0 },
  })])), defaults)
  const markup = scatter(dataset)
  assert.equal(pearson(markup), '—')
  assert.equal(rSquared(markup), '—')
  assert.equal(equation(markup), '持続時間（秒） = 0 × 必要SP + 30')
  const line = markup.match(/<line class="numeric-scatter-chart-fit"[^>]*>/)?.[0]
  assert.ok(line)
  assert.equal(line.match(/y1="([^"]+)"/)?.[1], line.match(/y2="([^"]+)"/)?.[1])
  assert.doesNotMatch(markup, /NaN|Infinity/)
})
