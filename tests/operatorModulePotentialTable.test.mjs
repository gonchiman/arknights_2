import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Table, Component, buildComparison, comparison

before(async () => {
  server = await createServer({ configFile: false, plugins: [react()],
    cacheDir: 'node_modules/.vite/operator-module-potential-table-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  ;({ OperatorModuleComparisonTable: Table } = await server.ssrLoadModule('/src/components/OperatorModuleComparisonTable.tsx'))
  ;({ OperatorModuleComparison: Component } = await server.ssrLoadModule('/src/components/OperatorModuleComparison.tsx'))
  ;({ buildOperatorModulePotentialComparison: buildComparison } = await server.ssrLoadModule('/src/lib/operatorModulePotentialComparison.ts'))
  comparison = buildComparison(profile(), { 'module-x': [1, 3], 'module-y': [3] }, [1, 6], true)
})

after(async () => { await server?.close() })

function profile() {
  const talent = (value, requiredPotentialRank = 0) => ({ name: '術耐性無視',
    description: `対象の術耐性を${value}無視`, requiredPotentialRank })
  const module = type => ({ uniEquipId: `module-${type.toLowerCase()}`, uniEquipName: `比較用${type}`,
    type: 'ADVANCED', typeName1: 'AFT', typeName2: type,
    phases: [1, 2, 3].map(equipLevel => ({ equipLevel,
      attributeBlackboard: { atk: equipLevel * (type === 'X' ? 20 : 15) },
      parts: type === 'X' && equipLevel > 1 ? [{ addOrOverrideTalentDataBundle: { candidates: [
        { talentIndex: 0, name: '術耐性無視', upgradeDescription: '対象の術耐性を26無視', requiredPotentialRank: 0 },
        { talentIndex: 0, name: '術耐性無視', upgradeDescription: '対象の術耐性を28無視', requiredPotentialRank: 5 },
      ] } }] : [],
    })) })
  return {
    phases: [{ maxLevel: 50 }, { maxLevel: 80 }, { maxLevel: 90 }], favorKeyFrames: [],
    traitDescription: '敵に術ダメージを与える', talents: [{ candidates: [talent(20), talent(22, 5)] }],
    potentialRanks: [
      { description: '配置コスト-1', buff: { attributes: { attributeModifiers: [{ attributeType: 'COST', formulaItem: 'ADDITION', value: -1 }] } } },
      {},
      { description: '攻撃力+28', buff: { attributes: { attributeModifiers: [{ attributeType: 'ATK', formulaItem: 'ADDITION', value: 28 }] } } },
      {}, { description: '素質強化' },
    ], modules: [module('X'), module('Y')],
  }
}

function render(model = comparison, options = {}) {
  return renderToStaticMarkup(createElement(Table, {
    comparison: model.comparisons[0], potentialComparison: model,
    interactive: false, showLegend: true, ...options,
  }))
}

const plain = html => html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'")
const attributes = html => Object.fromEntries([...html.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]))
const sections = (html, tag) => [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'g'))].map(match => match[1])

/** Expand the browser's table span geometry, detecting missing cells and overlaps. */
function grid(section, width) {
  const rows = sections(section, 'tr')
  const result = Array.from({ length: rows.length }, () => [])
  rows.forEach((row, rowIndex) => {
    let column = 0
    for (const match of row.matchAll(/<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
      while (result[rowIndex][column]) column++
      const attrs = attributes(match[2])
      const cell = { tag: match[1], attrs, html: match[3], text: plain(match[3]) }
      const rowSpan = Number(attrs.rowSpan ?? attrs.rowspan ?? 1)
      const colSpan = Number(attrs.colSpan ?? attrs.colspan ?? 1)
      assert.ok(rowSpan >= 1 && colSpan >= 1)
      assert.ok(rowIndex + rowSpan <= rows.length, 'rowSpan stays within its row group')
      for (let r = rowIndex; r < rowIndex + rowSpan; r++) {
        for (let c = column; c < column + colSpan; c++) {
          assert.equal(result[r][c], undefined, `overlapping cell at row ${r}, column ${c}`)
          result[r][c] = cell
        }
      }
      column += colSpan
    }
  })
  for (const row of result) {
    assert.equal(row.length, width, 'every row covers the table width')
    assert.ok(Array.from({ length: width }, (_, c) => row[c]).every(Boolean), 'no gaps in table row')
  }
  return result
}

function checkStructure(html) {
  const width = sections(html, 'colgroup')[0].match(/<col\b/g).length
  const head = grid(sections(html, 'thead')[0], width)
  const bodies = sections(html, 'tbody').map(body => grid(body, width))
  for (const footer of sections(html, 'tfoot')) grid(footer, width)
  const identifiedHeaders = new Map([...html.matchAll(/<th\b([^>]*)>([\s\S]*?)<\/th>/g)]
    .map(match => { const attrs = attributes(match[1]); return [attrs.id, { attrs, text: plain(match[2]) }] })
    .filter(([id]) => id))
  for (const cell of new Set([...head, ...bodies.flat()].flat())) {
    if (cell.tag === 'th') assert.ok(['col', 'colgroup', 'row', 'rowgroup'].includes(cell.attrs.scope), 'header has an appropriate scope')
    else {
      const references = (cell.attrs.headers ?? '').split(' ')
      assert.ok(references.length >= 2, 'data cell references row and column headers')
      assert.ok(references.every(id => identifiedHeaders.has(id)), 'headers refer only to existing header IDs')
      assert.ok(references.some(id => identifiedHeaders.get(id).attrs.scope === 'rowgroup'), 'item header is referenced')
      assert.ok(references.some(id => ['col', 'colgroup'].includes(identifiedHeaders.get(id).attrs.scope)), 'module header is referenced')
    }
  }
  for (const body of bodies) for (const row of body) row.forEach((cell, column) => {
    if (cell.tag !== 'td') return
    const references = new Set(cell.attrs.headers.split(' '))
    const applicable = [...head.map(headerRow => headerRow[column]), ...row.filter(entry => entry.tag === 'th')]
    for (const header of applicable) if (header.attrs.id) {
      assert.ok(references.has(header.attrs.id), `cell references its visible header: ${header.text}`)
    }
  })
  return { head, bodies }
}

const value = number => `対象の術耐性を${number}無視`
const expectedTalent = {
  'columns/columns': [[20, 22, 20, 22, 26, 28, 20, 22].map(value)],
  'columns/rows': [[20, 20, 26, 20].map(value), [22, 22, 28, 22].map(value)],
  'rows/columns': [
    [...[20, 22, 20, 22].map(value), '未選択', '未選択'],
    [20, 22, 26, 28, 20, 22].map(value),
  ],
  'rows/rows': [[value(20), value(20), '未選択'], [value(22), value(22), '未選択'],
    [20, 26, 20].map(value), [22, 28, 22].map(value)],
}

test('4種類の行列配置で、潜在とMOD段階ごとの素質値・未選択セルを正しく対応させる', () => {
  for (const layout of ['columns', 'rows']) for (const potentialLayout of ['columns', 'rows']) {
    for (const merge of [false, true]) {
      const html = render(comparison, { layout, potentialLayout, merge })
      const { bodies } = checkStructure(html)
      const talent = bodies.find(body => body[0][0].text.includes('術耐性無視'))
      assert.ok(talent)
      const axes = 1 + Number(layout === 'rows') + Number(potentialLayout === 'rows')
      assert.deepEqual(talent.map(row => row.slice(axes).map(cell => cell.text)), expectedTalent[`${layout}/${potentialLayout}`],
        `${layout}/${potentialLayout} merge=${merge}`)
      assert.ok(html.includes('昇進2・潜在1・6'))
    }
  }
})

test('共通結合はセル数を減らしても選択値と潜在補正を保持する', () => {
  const unmerged = render(comparison, { layout: 'columns', potentialLayout: 'columns', merge: false })
  const merged = render(comparison, { layout: 'columns', potentialLayout: 'columns', merge: true })
  assert.ok((merged.match(/<td\b/g) ?? []).length < (unmerged.match(/<td\b/g) ?? []).length)
  const before = checkStructure(unmerged).bodies
  const after = checkStructure(merged).bodies
  assert.deepEqual(after.map(body => body.map(row => row.map(cell => cell.text))), before.map(body => body.map(row => row.map(cell => cell.text))))
  const bonuses = after.find(body => body[0][0].text === '攻撃力補正潜在')
  assert.deepEqual(bonuses[0].slice(1).map(cell => cell.text), ['—', '+28', '—', '+28', '—', '+28', '—', '+28'])
  assert.ok(bonuses[0].filter(cell => cell.text === '+28').every(cell => cell.html.includes('data-source="potential"')))
})

test('潜在1だけの選択は潜在6の強化や未選択の段階を混入させない', () => {
  const single = buildComparison(profile(), { 'module-x': [3], 'module-y': [] }, [1], true)
  for (const layout of ['columns', 'rows']) for (const potentialLayout of ['columns', 'rows']) {
    const html = render(single, { layout, potentialLayout })
    const bodies = checkStructure(html).bodies
    const talent = bodies.find(body => body[0][0].text.includes('術耐性無視'))
    assert.deepEqual(talent[0].filter(cell => cell.tag === 'td').map(cell => cell.text), [value(20), value(26)])
    assert.doesNotMatch(html, /潜在6|比較用Y|未選択|\+28/)
  }
})

test('未装備だけでも両方の潜在配置が成立し、Lvの空列を作らない', () => {
  const none = buildComparison(profile(), { 'module-x': [], 'module-y': [] }, [1, 6], true)
  for (const layout of ['columns', 'rows']) for (const potentialLayout of ['columns', 'rows']) {
    const html = render(none, { layout, potentialLayout })
    const { head, bodies } = checkStructure(html)
    assert.ok(head.flat().some(cell => cell.text === 'モジュールなし'))
    assert.ok(!head.flat().some(cell => cell.text.includes('Lv.')))
    const talent = bodies.find(body => body[0][0].text.includes('術耐性無視'))
    assert.deepEqual(talent.flat().filter(cell => cell.tag === 'td').map(cell => cell.text), [value(20), value(22)])
  }
})

test('変化の詳細は先頭の潜在ではなく該当セルの潜在段階を示す', () => {
  for (const layout of ['columns', 'rows']) for (const potentialLayout of ['columns', 'rows']) {
    const html = render(comparison, { layout, potentialLayout, merge: false, interactive: true })
    const cells = [...html.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(match => match[1])
    const upgraded = cells.find(cell => cell.includes('対象の術耐性を') && cell.includes('>28<'))
    assert.ok(upgraded)
    assert.match(upgraded, /AFT-X Lv\.3・潜在6/)
    assert.match(upgraded, /AFT-X Lv\.3・潜在1/)
    assert.match(upgraded, /未装備・潜在1/)
    assert.match(upgraded, /data-source="both"/)
  }
})

function talentSelectionProfile() {
  const data = profile()
  data.talents = [
    { candidates: [
      { name: '術耐性無視', description: '対象の術耐性を20無視', requiredPotentialRank: 0 },
      { name: '術耐性無視', description: '対象の術耐性を22無視', requiredPotentialRank: 2 },
    ] },
    { candidates: [
      { name: '退場猶予', description: '致命的なダメージを受けてから8秒後に退場', requiredPotentialRank: 0 },
      { name: '退場猶予', description: '致命的なダメージを受けてから9秒後に退場', requiredPotentialRank: 4 },
    ] },
  ]
  data.potentialRanks[1] = { description: '第一素質強化' }
  data.potentialRanks[3] = { description: '第二素質強化' }
  data.potentialRanks[4] = { description: '配置コスト-1', buff: { attributes: { attributeModifiers: [
    { attributeType: 'COST', formulaItem: 'ADDITION', value: -1 },
  ] } } }
  for (const module of data.modules) for (const phase of module.phases) {
    const x = module.typeName2 === 'X'
    phase.parts = [{ overrideTraitDataBundle: { candidates: [
      { additionalDescription: x ? '未ブロック時、攻撃速度+8' : '自身がブロックしている敵に10%の対術脆弱を付与' },
    ] } }]
    if (phase.equipLevel > 1) phase.parts.push({ addOrOverrideTalentDataBundle: { candidates: x ? [
      { talentIndex: 0, name: '術耐性無視', upgradeDescription: '対象の術耐性を26無視', requiredPotentialRank: 0 },
      { talentIndex: 0, name: '術耐性無視', upgradeDescription: '対象の術耐性を28無視', requiredPotentialRank: 2 },
    ] : [
      { talentIndex: 1, name: '退場猶予', upgradeDescription: '致命的なダメージを受けてから9秒後に退場', requiredPotentialRank: 0 },
      { talentIndex: 1, name: '退場猶予', upgradeDescription: '致命的なダメージを受けてから10秒後に退場', requiredPotentialRank: 4 },
    ] } })
  }
  return data
}

const renderComponent = data => renderToStaticMarkup(createElement(Component, {
  profile: data, operatorName: '比較用オペレーター', operatorId: 'char_test',
}))
const selectablePotentials = html => [...html.matchAll(/<input\b[^>]*aria-label="潜在(\d+)を比較"[^>]*>/g)]
  .map(match => ({ rank: Number(match[1]), checked: /\bchecked=""/.test(match[0]) }))

test('潜在のUI候補は基準1と素質強化の3・5に絞り、MOD能力値・特性を省略しない', () => {
  const html = renderComponent(talentSelectionProfile())
  assert.deepEqual(selectablePotentials(html), [
    { rank: 1, checked: true }, { rank: 3, checked: false }, { rank: 5, checked: false },
  ])
  const table = html.match(/<table\b[\s\S]*?<\/table>/)?.[0]
  assert.ok(table)
  assert.match(table, /攻撃力/)
  assert.match(table, /\+60/)
  assert.match(table, /\+45/)
  assert.match(plain(table), /特性/)
  assert.match(plain(table), /未ブロック時、攻撃速度\+8/)
  assert.match(plain(table), /自身がブロックしている敵に10%の対術脆弱を付与/)
  assert.match(table, /術耐性無視/)
  assert.match(table, /退場猶予/)
})

test('素質の潜在強化がないオペレーターは潜在1だけを選択でき、比較表と保存を利用できる', () => {
  const data = talentSelectionProfile()
  for (const talent of data.talents) talent.candidates = talent.candidates.filter(candidate => candidate.requiredPotentialRank === 0)
  for (const module of data.modules) for (const phase of module.phases) for (const part of phase.parts) {
    const bundle = part.addOrOverrideTalentDataBundle
    if (bundle) bundle.candidates = bundle.candidates.filter(candidate => candidate.requiredPotentialRank === 0)
  }
  // Attribute-only ranks remain in the raw operator data and must not appear as talent comparison choices.
  data.potentialRanks[1] = {}
  data.potentialRanks[3] = {}
  const html = renderComponent(data)
  assert.deepEqual(selectablePotentials(html), [{ rank: 1, checked: true }])
  assert.match(html, /<table\b[^>]*aria-label="モジュール比較"/)
  const save = html.match(/<button\b[^>]*aria-label="モジュール比較テーブルをPNG画像で保存"[^>]*>/)?.[0]
  assert.ok(save)
  assert.doesNotMatch(save, /\bdisabled/)
})
