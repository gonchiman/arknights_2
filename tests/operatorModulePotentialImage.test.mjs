import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Image, Preview, Table, snapshot, withoutAttributesSnapshot

before(async () => {
  server = await createServer({ configFile: false, plugins: [react()],
    cacheDir: 'node_modules/.vite/operator-module-potential-image-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  ;({ OperatorModulePotentialComparisonImage: Image, OperatorModulePotentialComparisonImagePreview: Preview }
    = await server.ssrLoadModule('/src/components/saveOperatorModuleComparisonImage.tsx'))
  ;({ OperatorModuleComparisonTable: Table } = await server.ssrLoadModule('/src/components/OperatorModuleComparisonTable.tsx'))
  const { buildOperatorModulePotentialComparison } = await server.ssrLoadModule('/src/lib/operatorModulePotentialComparison.ts')
  const profile = {
    phases: [
      { maxLevel: 50, attributesKeyFrames: [{ level: 50, data: { atk: 200 } }] },
      { maxLevel: 80, attributesKeyFrames: [{ level: 80, data: { atk: 400 } }] },
      { maxLevel: 90, attributesKeyFrames: [{ level: 90, data: { atk: 600 } }] },
    ], favorKeyFrames: [], traitDescription: '敵に術ダメージを与える',
    potentialRanks: [{ description: '配置コスト-1', buff: { attributes: { attributeModifiers: [
      { attributeType: 'COST', formulaItem: 'ADDITION', value: -1 },
      { attributeType: 'ATK', formulaItem: 'ADDITION', value: 26 },
    ] } } }, { description: '素質強化' }],
    talents: [{ candidates: [
      { name: '術耐性無視', description: '攻撃時、対象の術耐性を20無視', requiredPotentialRank: 0 },
      { name: '術耐性無視', description: '攻撃時、対象の術耐性を22無視', requiredPotentialRank: 2 },
    ] }],
    modules: [{ uniEquipId: 'test-x', uniEquipName: '長いモジュール名'.repeat(8), type: 'ADVANCED', typeName1: 'AFT', typeName2: 'X',
      phases: [1, 2, 3].map(equipLevel => ({ equipLevel, parts: [], attributeBlackboard: [{ key: 'atk', value: equipLevel * 20 }] })),
    }],
  }
  const potentialComparison = buildOperatorModulePotentialComparison(profile, { 'test-x': [1, 3] }, [1, 3], true)
  snapshot = { comparison: potentialComparison.comparisons[0], potentialComparison }
  const withoutAttributes = buildOperatorModulePotentialComparison(profile, { 'test-x': [1, 3] }, [1, 3], true, false)
  withoutAttributesSnapshot = { comparison: withoutAttributes.comparisons[0], potentialComparison: withoutAttributes }
})

after(async () => { await server?.close() })

const render = (component, props) => renderToStaticMarkup(createElement(component, props))
const tableMarkup = markup => markup.match(/<table\b[\s\S]*?<\/table>/)?.[0]
  .replace(/\s(?:id|headers)="[^"]*"/g, '')

test('全4配置と共通結合の有無でプレビュー・PNGが同じ潜在スナップショットを描画する', () => {
  for (const layout of ['columns', 'rows']) {
    for (const potentialLayout of ['columns', 'rows']) {
      for (const merge of [false, true]) {
        const props = { ...snapshot, layout, potentialLayout, merge }
        const table = render(Table, { ...props, interactive: false, showLegend: true })
        for (const aspect of [null, { width: 16, height: 9 }, { width: 9, height: 16 }]) {
          const preview = render(Preview, { ...props, aspect })
          const output = render(Image, { ...props, aspect, exporting: true })
          assert.equal(tableMarkup(preview), tableMarkup(table))
          assert.equal(tableMarkup(output), tableMarkup(table))
          assert.match(output, /data-table-image-frame="true"/)
          assert.doesNotMatch(output, /<button\b|<dialog\b/)
          assert.ok(output.includes('長いモジュール名'.repeat(8)), '長い名称も省略しない')
          assert.ok(output.includes('20'), '潜在1の効果を含む')
          assert.ok(output.includes('22'), '潜在3の効果を含む')
        }
      }
    }
  }
})

test('潜在能力値補正を非表示にした画像にもMOD能力値と潜在反映済みの素質が残る', () => {
  const visible = render(Table, { ...snapshot, interactive: false })
  assert.match(visible, /配置コスト補正/)
  assert.match(visible, /攻撃力補正/)
  for (const potentialLayout of ['columns', 'rows']) {
    const props = { ...withoutAttributesSnapshot, layout: 'rows', potentialLayout, merge: true }
    const table = render(Table, { ...props, interactive: false, showLegend: true })
    const preview = render(Preview, props)
    const output = render(Image, { ...props, exporting: true })
    assert.equal(tableMarkup(preview), tableMarkup(table))
    assert.equal(tableMarkup(output), tableMarkup(table))
    assert.doesNotMatch(output, /配置コスト補正|攻撃力補正/)
    const text = output.replace(/<[^>]*>/g, '')
    assert.match(text, /攻撃力MOD/)
    assert.match(text, /\+60/)
    assert.match(text, /攻撃時、対象の術耐性を20無視/)
    assert.match(text, /攻撃時、対象の術耐性を22無視/)
    assert.match(text, /敵に術ダメージを与える/)
  }
})
