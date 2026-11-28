import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import react from '@vitejs/plugin-react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { APP_NAV_ITEMS, ATTRIBUTE_EFFECTS_ITEM, DAMAGE_THREE_SKILL_ATTRIBUTE_MATRIX_ITEM, getStandardPageTitle } from '../src/lib/navigation.ts'
import { parseHashRoute } from '../src/lib/routes.ts'

let server, HomePage, AppSidebar, ArchivePage, PhysicalArtsLabPage, NavigationDirectory

before(async () => {
  server = await createServer({
    configFile: false, plugins: [react()], appType: 'custom', logLevel: 'error',
    cacheDir: 'node_modules/.vite/archive-navigation-test',
    server: { middlewareMode: true, watch: null, hmr: false },
  })
  ;({ HomePage } = await server.ssrLoadModule('/src/components/HomePage.tsx'))
  ;({ AppSidebar } = await server.ssrLoadModule('/src/components/AppSidebar.tsx'))
  ;({ ArchivePage } = await server.ssrLoadModule('/src/components/ArchivePage.tsx'))
  ;({ PhysicalArtsLabPage } = await server.ssrLoadModule('/src/components/PhysicalArtsLabPage.tsx'))
  ;({ NavigationDirectory } = await server.ssrLoadModule('/src/components/NavigationDirectory.tsx'))
})
after(async () => { await server?.close() })

function linkTargets(component, props) {
  const markup = renderToStaticMarkup(createElement(component, props))
  return [...markup.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map(match => match[1])
}

test('ホームとサイドバーには物理・術比較ラボ、保管庫の順に入口が並ぶ', () => {
  const entries = ['#/labs/physical-arts', '#/archive']
  assert.deepEqual(parseHashRoute(entries[0]), { view: 'physical-arts-lab' })
  assert.equal(getStandardPageTitle('physical-arts-lab'), '物理・術比較ラボ')
  assert.deepEqual(linkTargets(HomePage), entries)
  const sidebar = linkTargets(AppSidebar, { activePage: 'archive', open: true, onClose() {} })
  assert.deepEqual(sidebar.filter(href => href !== '#/'), entries)
})

test('物理・術比較ラボから属性限定効果一覧を開け、研究テーマとコピー操作がある', () => {
  const markup = renderToStaticMarkup(createElement(PhysicalArtsLabPage))
  assert.match(markup, /物理属性と術属性はどちらのほうが強いのか？/)
  assert.match(markup, /aria-label="物理・術比較ラボの場所をコピー"/)
  assert.deepEqual(linkTargets(PhysicalArtsLabPage), ['#/', ATTRIBUTE_EFFECTS_ITEM.href])
})

test('関連するページは親ページと同じ項目内のリストに表示する', () => {
  const parent = { ...DAMAGE_THREE_SKILL_ATTRIBUTE_MATRIX_ITEM, children: [ATTRIBUTE_EFFECTS_ITEM] }
  const props = { label: '関連ページ', groups: [{ label: '', items: [parent] }] }
  const markup = renderToStaticMarkup(createElement(NavigationDirectory, props))
  assert.deepEqual(linkTargets(NavigationDirectory, props), [parent.href, ATTRIBUTE_EFFECTS_ITEM.href])
  assert.match(markup, /<\/a>\s*<ul\b[^>]*>\s*<li\b/)
})

test('保管庫から全ての保管対象を重複なく開け、ホームにも戻れる', () => {
  assert.deepEqual(parseHashRoute('#/archive'), { view: 'archive' })
  assert.equal(getStandardPageTitle('archive'), '保管庫')
  const targets = linkTargets(ArchivePage)
  assert.ok(targets.includes('#/'))
  const archived = APP_NAV_ITEMS.filter(item => !['physical-arts-lab', 'attribute-effects', 'archive'].includes(item.id))
  assert.deepEqual(targets.filter(href => href !== '#/').sort(), archived.map(item => item.href).sort())
  assert.match(renderToStaticMarkup(createElement(ArchivePage)), /aria-label="保管庫の場所をコピー"/)
})
