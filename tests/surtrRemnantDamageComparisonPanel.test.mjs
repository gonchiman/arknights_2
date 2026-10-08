import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Panel, Detail, Content, Image, classifySkill, moduleComparison, buildComparison, getTsv

before(async () => {
  server = await createServer({
    configFile: false, resolve: { preserveSymlinks: true },
    plugins: [react(), {
      name: 'probe-remnant-comparison-panel', enforce: 'pre',
      resolveId(source, importer) {
        if (importer?.endsWith('/SurtrRemnantDamageComparisonPanel.tsx')) {
          if (source === './SurtrUnequippedComparisonTable') return '\0remnant-comparison-table'
        }
      },
      load(id) {
        if (id === '\0remnant-comparison-table') return `
          import { createElement, Fragment } from 'react'
          import { SurtrUnequippedComparisonTable as Actual } from '/src/components/SurtrUnequippedComparisonTable.tsx'
          export function SurtrUnequippedComparisonTable(props) {
            return createElement(Fragment, null,
              createElement('pre', { 'data-remnant-comparison': '' }, JSON.stringify(props)),
              createElement(Actual, props))
          }
        `
      },
    }],
    cacheDir: 'node_modules/.vite/surtr-remnant-damage-comparison-panel-test', logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  ;({ SurtrRemnantDamageComparisonPanel: Panel, SurtrRemnantDamageComparisonDetail: Detail } = await server.ssrLoadModule('/src/components/SurtrRemnantDamageComparisonPanel.tsx'))
  ;({ SurtrUnequippedComparisonTableContent: Content } = await server.ssrLoadModule('/src/components/SurtrUnequippedComparisonTableContent.tsx'))
  ;({ SurtrUnequippedComparisonTableImage: Image } = await server.ssrLoadModule('/src/components/SurtrUnequippedComparisonTableImage.tsx'))
  ;({ classifySkill } = await server.ssrLoadModule('/src/lib/classifier.ts'))
  moduleComparison = await server.ssrLoadModule('/src/lib/surtrModuleComparison.ts')
  ;({ buildSurtrRemnantDamageComparison: buildComparison } = await server.ssrLoadModule('/src/lib/surtrRemnantDamageComparison.ts'))
  ;({ getSurtrUnequippedComparisonTsv: getTsv } = await server.ssrLoadModule('/src/lib/surtrUnequippedComparison.ts'))
})
after(async () => { await server?.close() })

const xId = 'uniequip_002_surtr', yId = 'uniequip_003_surtr'
const settings = { level: 90, trust: 100, potential: 1, skillLevelIndex: 9, blocking: false }
const assumptions = { windup: 0.3, ctCarry: 'time', includeRetreatHit: false }

function createRecord() {
  const skillLevels = Array.from({ length: 10 }, () => ({ name: 'ラグナロク', description: '攻撃力上昇、最大HP+5000、退場まで継続',
    duration: -1, durationType: 'NONE', skillType: 'MANUAL', blackboard: [
      { key: 'atk', value: 3.3 }, { key: 'max_hp', value: 5000 }, { key: 'interval', value: 0.2 },
      { key: 'hp_ratio', value: 0.2 }, { key: 'duration', value: 60 },
    ] }))
  return {
    id: 'char_350_surtr:skchr_surtr_3', operatorId: 'char_350_surtr', operatorName: 'スルト',
    profession: 'WARRIOR', professionLabel: '前衛', subProfessionId: 'artsfghter', subProfessionName: '術戦士',
    nameInitial: 'S_ROW', rarity: 6, skillIndex: 3, skillId: 'skchr_surtr_3', skillName: 'ラグナロク',
    description: '', duration: -1, durationType: 'NONE', skillType: 'MANUAL', spType: 'INCREASE_WITH_TIME',
    initSp: 0, spCost: 5, classification: classifySkill(skillLevels[9]), skillLevels, raw: skillLevels[9],
    operatorProfile: {
      phases: [{ maxLevel: 50 }, { maxLevel: 80 }, { maxLevel: 90, attributesKeyFrames: [
        { level: 1, data: { maxHp: 2216, atk: 544, attackSpeed: 100, baseAttackTime: 1.25 } },
        { level: 90, data: { maxHp: 2916, atk: 672, attackSpeed: 100, baseAttackTime: 1.25 } },
      ] }],
      favorKeyFrames: [{ level: 0, data: { maxHp: 0, atk: 0 } }, { level: 50, data: { maxHp: 0, atk: 100 } }],
      traitDescription: '敵に術ダメージを与える', potentialRanks: [{}, {}, {}, {}, {}],
      talents: [{ candidates: [{ name: '劫火', requiredPotentialRank: 0,
        unlockCondition: { phase: 'PHASE_2', level: 1 }, blackboard: [{ key: 'magic_resist_penetrate_fixed', value: 20 }] }] },
      { candidates: [{ name: '余燼', requiredPotentialRank: 0, unlockCondition: { phase: 'PHASE_2', level: 1 },
        blackboard: [{ key: 'surtr_t_2[withdraw].interval', value: 8 }] }] }],
      modules: ['X', 'Y'].map(type => ({ uniEquipId: type === 'X' ? xId : yId, uniEquipName: `MOD ${type}`,
        type: 'ADVANCED', typeName2: type, unlockEvolvePhase: 'PHASE_2', unlockLevel: 60,
        phases: [1, 2, 3].map((level, index) => ({ equipLevel: level,
          attributeBlackboard: { atk: (type === 'X' ? [30, 48, 60] : [45, 55, 60])[index] },
          parts: [{ overrideTraitDataBundle: { candidates: [{ requiredPotentialRank: 0,
            additionalDescription: type === 'X' ? '未ブロック時、攻撃速度+8' : 'ブロック中の敵に対術脆弱',
            blackboard: type === 'X' ? { attack_speed: 8 } : { damage_scale: 1.1 } }] } },
          { addOrOverrideTalentDataBundle: { candidates: level === 1 ? [] : [{ requiredPotentialRank: 0,
            talentIndex: type === 'X' ? 0 : 1, name: type === 'X' ? '劫火' : '余燼',
            blackboard: type === 'X' ? { magic_resist_penetrate_fixed: level === 2 ? 24 : 26 }
              : { 'surtr_t_2[withdraw].interval': level === 2 ? 8 : 9, 'surtr_t_2[withdraw].attack_speed': level === 2 ? 20 : 30 },
          }] } }],
        })),
      })),
    },
  }
}
const stages = record => moduleComparison.getSelectedSurtrModuleStages(moduleComparison.getSurtrModuleChoices(record.operatorProfile, 90), [''])
const render = (overrides = {}) => {
  const record = createRecord()
  return renderToStaticMarkup(createElement(Panel, { record, settings, selectedStages: stages(record), assumptions, status: null, ...overrides }))
}
const unescape = value => value.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&gt;', '>')
  .replaceAll('&lt;', '<').replaceAll('&amp;', '&')
const text = markup => unescape(markup.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
const capture = markup => {
  const found = markup.match(/<pre data-remnant-comparison="">([\s\S]*?)<\/pre>/)
  assert.ok(found, 'Missing shared comparison table data')
  return JSON.parse(unescape(found[1]))
}
const table = markup => {
  const found = markup.match(/<table\b[^>]*>([\s\S]*?)<\/table>/)
  assert.ok(found, 'Missing shared comparison table')
  return found[1]
}
const rows = markup => [...markup.matchAll(/<tr(?:\s[^>]*)?>([\s\S]*?)<\/tr>/g)]
  .map(row => [...row[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/g)].map(cell => text(cell[1])))
const sectionRows = (markup, tag) => [...markup.matchAll(new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + tag + '>', 'g'))].flatMap(section => rows(section[1]))
const point = (group, id, resistance) => group.referenceSeries.find(item => item.id === id)?.points.find(item => item.x === resistance)?.value
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`)

// Independent analytical timing for 0.3 s windup/time carry over each stage's CT.
const means = { none: 6.16, X: { 1: 6.6528, 2: 6.6528, 3: 6.6528 }, Y: { 1: 6.16, 2: 7.326666666666667, 3: 8.843076923076923 } }
function expected(type, level, blocking, resistance = 60) {
  const hitCount = type === 'X' && blocking ? 6.16 : type ? means[type][level] : means.none
  const attack = type ? (type === 'X' ? [3448, 3526, 3577] : [3513, 3556, 3577])[level - 1] : 3319
  const ignore = type === 'X' ? [20, 24, 26][level - 1] : 20
  return hitCount * attack * Math.max(0.05, 1 - Math.max(0, resistance - ignore) / 100) * (type === 'Y' && blocking ? 1.1 : 1)
}

test('panel05 defaults to expected total damage with the same comparison options while keeping DPS labels out of its table', () => {
  const markup = render(), data = capture(markup)
  assert.match(markup, /<span>05<\/span>/)
  assert.equal(data.quantity, 'expected-damage')
  assert.equal(data.comparisonBase, 'unequipped')
  assert.equal(data.layout, 'combined')
  assert.equal(data.metric, 'difference')
  assert.equal(data.precision, 0)
  assert.equal(data.columnOrder, 'module')
  assert.equal(data.rankMode, 'none')
  assert.equal(data.colorScale, false)
  assert.deepEqual(data.resistances, Array.from({ length: 11 }, (_, index) => index * 10))
  assert.deepEqual(data.metadata.remnantAssumptions, assumptions)
  assert.match(table(markup), /総ダメージ期待値/)
  assert.match(table(markup), /ダメージ差/)
  assert.doesNotMatch(table(markup), /DPS|DPS計算フロー/)
  assert.match(markup, /aria-label="術耐性 60の期待総ダメージ計算フローを開く"/)
  assert.doesNotMatch(markup, /aria-label="[^"]*DPS/)
  assert.match(markup, /<option value="previous">/)
  assert.match(markup, /<option value="SQRT">/)
})

test('both blocking conditions use each MOD own expected count and preserve the independent unequipped reference', () => {
  const data = capture(render())
  assert.deepEqual(data.blockingComparison.map(group => group.blocking), [false, true])
  for (const group of data.blockingComparison) {
    close(point(group, 'none', 60), expected(null, 0, group.blocking))
    close(point(group, `${xId}:lv3`, 60), expected('X', 3, group.blocking))
    close(point(group, `${yId}:lv3`, 60), expected('Y', 3, group.blocking))
  }
  const blocked = capture(render({ settings: { ...settings, blocking: true } }))
  assert.deepEqual(blocked.blockingComparison, data.blockingComparison)
  assert.deepEqual(data.series.filter(item => item.id !== 'none').map(item => [item.id, item.label, item.color]),
    stages(createRecord()).map(item => [item.id, item.label, item.color]))
})

test('assumption changes recalculate expected totals and are captured in the shared image conditions', () => {
  const changed = { windup: 0.45, ctCarry: 'ratio', includeRetreatHit: true }
  const data = capture(render({ assumptions: changed }))
  const unblocked = data.blockingComparison.find(group => !group.blocking)
  close(point(unblocked, `${yId}:lv3`, 60), 8.892 * 3577 * 0.6)
  assert.deepEqual(data.metadata.remnantAssumptions, changed)
  const snapshot = { ...data, colorScale: true, colorScaleMode: 'SQRT', rankMode: 'inline', metric: 'ratio' }
  const before = structuredClone(snapshot)
  const saved = renderToStaticMarkup(createElement(Image, snapshot))
  assert.match(table(saved), /比率/)
  assert.match(saved, /一様/)
  assert.match(saved, /0\.45/)
  assert.match(saved, /比率|割合/)
  assert.match(saved, /(?:撤退|退場)同時.*含む/)
  assert.doesNotMatch(table(saved), /DPS|<button|<select/)
  const shared = renderToStaticMarkup(createElement(Content, snapshot))
  assert.deepEqual(sectionRows(table(saved), 'tbody'), sectionRows(table(shared), 'tbody'))
  assert.deepEqual(sectionRows(table(saved), 'thead'), sectionRows(table(shared), 'thead'))
  assert.deepEqual(snapshot, before)
})

test('previous-stage expected damage tables and TSV compare each hidden stage using its own expected count', () => {
  const record = createRecord()
  const all = moduleComparison.getSelectedSurtrModuleStages(moduleComparison.getSurtrModuleChoices(record.operatorProfile, 90), [],
    { [xId]: [1, 3], [yId]: [3] })
  const data = buildComparison(record, settings, all, assumptions, 'previous', [60])
  assert.ok(data)
  const targets = [['X', 1, '未装備'], ['X', 3, 'MOD X Lv.2'], ['Y', 3, 'MOD Y Lv.2']]
  const calculate = (type, level, blocking, metric) => {
    const current = expected(type, level, blocking)
    const previous = level === 1 ? expected(null, 0, blocking) : expected(type, level - 1, blocking)
    return metric === 'difference' ? current - previous : metric === 'ratio' ? current / previous * 100 : (current / previous - 1) * 100
  }
  const format = (value, metric, grouping) => {
    const rounded = Number(value.toFixed(1))
    const formatted = (rounded === 0 ? 0 : rounded).toLocaleString('ja-JP', {
      minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: grouping,
    })
    return (metric !== 'ratio' && rounded > 0 ? '+' : '') + formatted + (metric === 'difference' ? '' : '%')
  }
  for (const group of data.blockingComparison) {
    assert.ok(!group.series.some(item => item.id === `${yId}:lv2`))
    close(point(group, `${yId}:lv2`, 60), expected('Y', 2, group.blocking))
  }
  for (const layout of ['combined', 'comparison']) {
    for (const metric of ['difference', 'ratio', 'percent']) {
      for (const columnOrder of ['module', 'blocking']) {
        const snapshot = { ...data, quantity: 'expected-damage', comparisonBase: 'previous', precision: 1,
          resistances: [60], layout, metric, columnOrder }
        const columns = columnOrder === 'module'
          ? targets.flatMap(target => [false, true].map(blocking => ({ target, blocking })))
          : [false, true].flatMap(blocking => targets.map(target => ({ target, blocking })))
        const cells = grouping => ['60', ...columns.flatMap(({ target: [type, level], blocking }) => [
          ...(layout === 'combined' ? [expected(type, level, blocking).toLocaleString('ja-JP', {
            minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: grouping,
          })] : []), format(calculate(type, level, blocking, metric), metric, grouping),
        ])]
        const summary = table(renderToStaticMarkup(createElement(Content, snapshot)))
        assert.deepEqual(sectionRows(summary, 'tbody'), [cells(true)], `${layout}, ${metric}, ${columnOrder}`)
        assert.doesNotMatch(summary, /DPS|総ダメージ期待値・基準/)
        for (const [, , label] of targets) assert.ok(text(summary).includes(`基準：${label}`))
        const tsv = getTsv(data.series, data.baseline, [60], 1, metric, layout,
          data.blockingComparison, 'none', columnOrder, 'previous', [], 'expected-damage')
        const exported = tsv.split('\r\n').map(row => row.split('\t'))
        assert.deepEqual(exported[1], cells(false), `${layout}, ${metric}, ${columnOrder} TSV`)
        assert.equal(exported[0].length, exported[1].length)
        assert.doesNotMatch(tsv, /DPS/)
        for (const [, , label] of targets) assert.ok(exported[0].some(heading => heading.includes(`基準：${label}`)))
        if (layout === 'combined') assert.match(tsv, /総ダメージ期待値/)
        if (metric === 'difference') assert.match(tsv, /前段階とのダメージ差/)
      }
    }
  }
})

test('saved expected-damage images keep captured assumptions and a full-width footer in every comparison layout', () => {
  const selected = { windup: 0.3456789, ctCarry: 'ratio', includeRetreatHit: true }
  const live = capture(render({ assumptions: selected, settings: { ...settings, potential: 6 } }))
  const record = createRecord()
  Object.assign(live, buildComparison(record, { ...settings, potential: 6 }, stages(record), selected, 'previous', live.resistances))
  const captured = structuredClone(live)
  live.metadata.potential = 1
  live.metadata.remnantAssumptions = { ...assumptions }
  live.blockingComparison[0].series[1].points[0].value = 999
  for (const comparisonBase of ['unequipped', 'previous']) {
    for (const layout of ['combined', 'comparison']) {
      for (const columnOrder of ['module', 'blocking']) {
        for (const rankMode of ['none', 'inline', 'merged']) {
          const snapshot = { ...captured, comparisonBase, layout, columnOrder, rankMode, metric: 'percent',
            colorScale: true, colorScaleMode: 'SQRT', precision: 2 }
          const saved = renderToStaticMarkup(createElement(Image, snapshot))
          const summary = table(saved)
          const footer = summary.match(/<tfoot>([\s\S]*?)<\/tfoot>/)?.[1]
          assert.ok(footer)
          const footerText = text(footer)
          assert.ok(footerText.includes(`総ダメージ期待値・増加率（%）・基準：${comparisonBase === 'previous' ? '1つ前の段階（Lv.1は未装備）' : '未装備'}`))
          assert.match(footerText, /S3 特化3・昇進2 Lv\.90・信頼度100・潜在6・未ブロック／対象を自身でブロック/)
          assert.match(footerText, /残りCT一様・命中まで0\.3456789s・CT割合維持・退場同時の命中を含む/)
          assert.doesNotMatch(footerText, /潜在1|CT時間維持|命中を除外|DPS/)
          const columns = 1 + (rankMode === 'merged' ? 1 : 0) + (layout === 'combined' && comparisonBase === 'unequipped' ? 1 : 0)
            + 2 * 2 * (layout === 'combined' ? 2 : 1)
          assert.match(footer, new RegExp(`colspan="${columns}"`, 'i'))
          const shared = renderToStaticMarkup(createElement(Content, snapshot))
          assert.deepEqual(sectionRows(summary, 'tbody'), sectionRows(table(shared), 'tbody'))
          assert.deepEqual(sectionRows(summary, 'thead'), sectionRows(table(shared), 'thead'))
          assert.doesNotMatch(saved, /<button|<select|aria-haspopup|DPS/)
        }
      }
    }
  }
  assert.deepEqual(captured.metadata.remnantAssumptions, selected)
})

test('status, no MOD selection and invalid assumptions cannot render fabricated expected totals', () => {
  const pending = render({ record: undefined, status: createElement('p', { role: 'status' }, 'データを読み込み中') })
  assert.match(pending, /データを読み込み中/)
  assert.doesNotMatch(pending, /data-remnant-comparison|<table/)
  const empty = render({ selectedStages: [] })
  assert.match(empty, /role="status"/)
  assert.doesNotMatch(empty, /data-remnant-comparison|<table/)
  const invalid = render({ assumptions: { ...assumptions, windup: 2 } })
  assert.match(invalid, /role="alert"/)
  assert.doesNotMatch(invalid, /data-remnant-comparison|<table/)
})

const detailResult = { expectedHitCount: means.Y[3], perHit: 2146.2, totalDamage: means.Y[3] * 2146.2 }
const detailBaseline = { label: 'MOD Y Lv.2', result: {
  expectedHitCount: means.Y[2], perHit: 2133.6, totalDamage: means.Y[2] * 2133.6,
} }
const detailEntry = { id: `${yId}:lv3`, label: 'MOD Y Lv.3', color: '#b4763e', duration: 9,
  intervalBefore: 1.25, intervalAfter: 1.25 / 1.3, result: detailResult, baseline: detailBaseline,
  expectation: { expectedHitCount: means.Y[3], remainingCtLimit: 1.25, probabilities: [
    { hitCount: 8, probability: 0.1938461538461538 }, { hitCount: 9, probability: 0.7692307692307693 },
    { hitCount: 10, probability: 0.03692307692307695 },
  ] } }
const formatDetail = value => value.toLocaleString('ja-JP', { maximumFractionDigits: 6 })
const renderDetail = (metric, entry = detailEntry) => renderToStaticMarkup(createElement(Detail, {
  snapshot: { resistance: 60, conditions: '未ブロック・残りCT一様・命中まで0.3s',
    series: [entry], initialSeriesId: entry.id, metric, comparisonBase: 'previous', precision: 1 }, onClose: () => {},
}))

test('the expected-total flow shows each preceding stage own expected count and per-hit damage for all comparison metrics', () => {
  for (const metric of ['difference', 'ratio', 'percent']) {
    const value = metric === 'difference' ? detailResult.totalDamage - detailBaseline.result.totalDamage
      : metric === 'ratio' ? detailResult.totalDamage / detailBaseline.result.totalDamage * 100
        : (detailResult.totalDamage / detailBaseline.result.totalDamage - 1) * 100
    const markup = renderDetail(metric, { ...detailEntry, value }), body = sectionRows(table(markup), 'tbody')
    assert.deepEqual(body.find(row => row[0] === '総ダメージ期待値'), ['総ダメージ期待値',
      `${formatDetail(detailResult.expectedHitCount)} × ${formatDetail(detailResult.perHit)}`, formatDetail(detailResult.totalDamage)])
    assert.deepEqual(body.find(row => row[0] === '基準：MOD Y Lv.2'), ['基準：MOD Y Lv.2',
      `${formatDetail(detailBaseline.result.expectedHitCount)} 回 × ${formatDetail(detailBaseline.result.perHit)}`,
      formatDetail(detailBaseline.result.totalDamage)])
    const formula = metric === 'difference' ? `${formatDetail(detailResult.totalDamage)} − ${formatDetail(detailBaseline.result.totalDamage)}`
      : metric === 'ratio' ? `${formatDetail(detailResult.totalDamage)} ÷ ${formatDetail(detailBaseline.result.totalDamage)} × 100`
        : `(${formatDetail(detailResult.totalDamage)} ÷ ${formatDetail(detailBaseline.result.totalDamage)} − 1) × 100`
    assert.ok(body.some(row => row[1] === formula && row[2] === formatDetail(value) + (metric === 'difference' ? '' : '%')))
    assert.match(markup, /各段階で期待命中回数と1回のダメージを計算/)
    assert.doesNotMatch(markup, /DPS|基準：未装備/)
  }
})

test('zero comparison denominators stay unavailable and raw expected totals omit comparison rows', () => {
  const zeroBase = { ...detailEntry, value: null,
    baseline: { label: 'MOD Y Lv.2', result: { ...detailBaseline.result, perHit: 0, totalDamage: 0 } } }
  for (const metric of ['ratio', 'percent']) {
    const body = sectionRows(table(renderDetail(metric, zeroBase)), 'tbody')
    assert.ok(body.some(row => row[1] === '基準の総ダメージ期待値が0のため算出できません' && row[2] === '—'))
    assert.deepEqual(body.at(-1), ['表の表示', '小数点以下1桁に丸める', '—'])
  }
  const raw = sectionRows(table(renderDetail('total', { ...detailEntry, value: detailResult.totalDamage })), 'tbody')
  assert.ok(!raw.some(row => row[0].startsWith('基準：')))
  assert.equal(raw.at(-1)[2], detailResult.totalDamage.toLocaleString('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))
})

test('raw expected total detail, shared table and TSV use the same rounding at a fractional boundary', () => {
  const totalDamage = 11000.005
  const result = { expectedHitCount: 2, perHit: totalDamage / 2, totalDamage }
  const entry = { ...detailEntry, result, value: totalDamage }
  const detail = renderToStaticMarkup(createElement(Detail, {
    snapshot: { resistance: 60, conditions: '未ブロック・残りCT一様・命中まで0.3s',
      series: [entry], initialSeriesId: entry.id, metric: 'total', comparisonBase: 'unequipped', precision: 2 },
    onClose: () => {},
  }))
  assert.deepEqual(sectionRows(table(detail), 'tbody').at(-1), ['表の表示', '小数点以下2桁に丸める', '11,000.00'])

  const baseline = { id: 'none', label: '未装備', color: '#747b84', points: [{ x: 60, value: 10000 }] }
  const current = { id: entry.id, label: entry.label, color: entry.color, points: [{ x: 60, value: totalDamage }] }
  const data = { series: [baseline, current], baseline, resistances: [60], precision: 2,
    metric: 'difference', layout: 'combined', quantity: 'expected-damage' }
  const shared = renderToStaticMarkup(createElement(Content, data))
  assert.equal(sectionRows(table(shared), 'tbody')[0][2], '11,000.00')
  const tsv = getTsv(data.series, baseline, [60], 2, 'difference', 'combined',
    undefined, 'none', 'module', 'unequipped', [], 'expected-damage')
  assert.equal(tsv.split('\r\n')[1].split('\t')[2], '11000.00')
  assert.equal(entry.result.totalDamage, totalDamage)
  assert.equal(current.points[0].value, totalDamage)
})
