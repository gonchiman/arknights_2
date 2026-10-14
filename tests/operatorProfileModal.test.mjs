import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Page, Modal, LegacyModal, PanelStateScope, props

before(async () => {
  server = await createServer({
    configFile: false,
    plugins: [react()],
    cacheDir: 'node_modules/.vite/operator-profile-modal-test',
    resolve: { preserveSymlinks: true },
    logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false },
    appType: 'custom',
  })
  ;({ OperatorDetailPage: Page } = await server.ssrLoadModule('/src/components/OperatorDetailPage.tsx'))
  ;({ OperatorProfileModal: Modal } = await server.ssrLoadModule('/src/components/OperatorProfileModal.tsx'))
  ;({ OperatorDetailModal: LegacyModal } = await server.ssrLoadModule('/src/components/OperatorDetailModal.tsx'))
  ;({ PanelStateScope } = await server.ssrLoadModule('/src/lib/PanelStateScope.ts'))
  const { classifySkill } = await server.ssrLoadModule('/src/lib/classifier.ts')
  const { buildOperatorDatabaseRecords } = await server.ssrLoadModule('/src/lib/operatorDatabase.ts')
  const profile = {
    phases: [
      { maxLevel: 50, attributesKeyFrames: [{ level: 50, data: { maxHp: 1000, atk: 300, def: 200 } }] },
      { maxLevel: 80, attributesKeyFrames: [{ level: 80, data: { maxHp: 1500, atk: 500, def: 300 } }] },
      { maxLevel: 90, attributesKeyFrames: [{ level: 90, data: {
        maxHp: 2000, atk: 700, def: 400, magicResistance: 15, cost: 20,
        blockCnt: 2, respawnTime: 70, attackSpeed: 100, baseAttackTime: 1.3,
      } }] },
    ],
    favorKeyFrames: [],
    traitDescription: '通常攻撃時、敵に2回ダメージを与える',
    talents: [{ candidates: [{
      name: 'テスト素質', description: '攻撃力+10%', requiredPotentialRank: 0,
      unlockCondition: { phase: 'PHASE_2', level: 1 },
    }] }],
    potentialRanks: [{ description: '配置コスト-1' }],
    modules: [{
      uniEquipId: 'module_test_x', uniEquipName: 'テストモジュール',
      type: 'ADVANCED', typeName1: 'SWO', typeName2: 'X',
      unlockEvolvePhase: 'PHASE_2', unlockLevel: 60,
      phases: [1, 2, 3].map(level => ({
        equipLevel: level, attributeBlackboard: [{ key: 'atk', value: level * 20 }], parts: [],
      })),
    }],
  }
  const skills = [1, 2, 3].map(index => {
    const raw = {
      name: `第${index}スキル`, description: `攻撃力+${index * 30}%`,
      duration: 20, durationType: 'NONE', skillType: 'MANUAL',
      spData: { spType: 'INCREASE_WITH_TIME', initSp: 5, spCost: 20 },
    }
    return {
      id: `char_test:skill_${index}`, operatorId: 'char_test', operatorName: 'テストOP',
      profession: 'WARRIOR', professionLabel: '前衛', subProfessionId: 'sword',
      subProfessionName: '剣豪', nameInitial: 'T_ROW', rarity: 6,
      skillIndex: index, skillId: `skill_${index}`, skillName: raw.name,
      description: raw.description, duration: 20, durationType: 'NONE',
      skillType: 'MANUAL', spType: 'INCREASE_WITH_TIME', initSp: 5, spCost: 20,
      classification: classifySkill(raw), skillLevels: [raw], operatorProfile: profile, raw,
    }
  })
  const operators = buildOperatorDatabaseRecords(skills)
  props = {
    operator: operators[0], comparisonOperators: operators, skills,
    overrides: {}, onOverride: () => {}, onClose: () => {},
  }
})

after(async () => { await server?.close() })

const render = (component, extra = {}) => renderToStaticMarkup(createElement(component, { ...props, ...extra }))
const text = markup => markup.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
const panels = markup => [...markup.matchAll(/<section\b[^>]*class="[^"]*collapsible-calculator-panel[^"]*"[^>]*>([\s\S]*?)<\/section>/g)]
  .map(match => text(match[1]))

test('embedded profile keeps the same three complete panels as the standalone page', () => {
  const standalone = render(Page)
  const embedded = render(Page, { embedded: true })
  assert.equal(panels(standalone).length, 3)
  assert.deepEqual(panels(embedded), panels(standalone))
  for (const markup of [standalone, embedded]) {
    assert.match(markup, /id="operator-profile-basics-heading"/)
    assert.match(markup, /id="operator-profile-skills-heading"/)
    assert.match(markup, /id="operator-profile-modules-heading"/)
    assert.match(markup, /テスト素質/)
    assert.match(markup, /通常攻撃時、敵に2回ダメージを与える/)
    assert.match(markup, /配置コスト-1/)
    assert.match(markup, /aria-label="モジュール比較"/)
    assert.match(markup, /テストモジュール/)
  }
})

test('embedded profile omits the standalone heading, breadcrumbs and directory back link', () => {
  const standalone = render(Page)
  assert.match(standalone, /<h1\b[^>]*>テストOP<\/h1>/)
  assert.match(standalone, /href="#\/operators"/)
  const embedded = render(Page, {
    embedded: true,
    breadcrumbs: { parents: [{ label: 'テスト一覧', href: '#/operators' }], current: 'オペレーター情報' },
  })
  assert.doesNotMatch(embedded, /<h1\b|OPERATOR DETAIL|operator-detail-page-back|page-heading-with-breadcrumbs|href="#\/operators"/)
  assert.match(embedded, /aria-label="テストOPのオペレーター情報"/)
})

test('profile modal has one accessible title and the full shared page body', () => {
  const markup = render(Modal)
  assert.equal([...markup.matchAll(/<dialog\b/g)].length, 1)
  const titleId = markup.match(/<dialog\b[^>]*aria-labelledby="([^"]+)"/)?.[1]
  assert.ok(titleId, 'dialog is labelled by its visible title')
  assert.ok(markup.includes(`id="${titleId}" tabIndex="-1">テストOP</h2>`)
    || markup.includes(`id="${titleId}" tabindex="-1">テストOP</h2>`))
  assert.equal([...markup.matchAll(/>テストOP<\/h2>/g)].length, 1)
  assert.match(markup, /aria-label="オペレーター情報を閉じる"/)
  assert.ok(text(markup).includes('★6 · 前衛 / 剣豪'))
  assert.doesNotMatch(markup, /<h1\b|operator-detail-page-back|OPERATOR DETAIL/)
  assert.deepEqual(panels(markup), panels(render(Page, { embedded: true })))
})

test('profile modal preserves skill selection, effect links and module stage comparison controls', () => {
  const markup = render(Modal)
  assert.match(markup, /role="group" aria-label="スキル選択"/)
  for (const index of [1, 2, 3]) assert.match(markup, new RegExp(`aria-label="S${index} 第${index}スキル"`))
  assert.match(markup, /href="#\/skill-effects\?operatorId=char_test/)
  assert.match(markup, /aria-label="比較するMOD・段階"/)
  for (const level of [1, 2, 3]) assert.match(markup, new RegExp(`aria-label="SWO-X Lv\\.${level}を比較"`))
  assert.match(markup, /aria-label="モジュール比較テーブルをPNG画像で保存"/)
})

test('modal panel preferences use the individual page scope instead of the parent list scope', () => {
  const previousWindow = globalThis.window
  const readKeys = []
  globalThis.window = { localStorage: { getItem: key => { readKeys.push(key); return null } } }
  try {
    renderToStaticMarkup(createElement(PanelStateScope.Provider, { value: 'skill-classification' },
      createElement(Modal, props)))
    const panelKeys = [...new Set(readKeys.filter(key => key.startsWith('arknights-panel-open-v1:')))]
    assert.deepEqual(panelKeys.sort(), [
      'arknights-panel-open-v1:operator-detail:operator-profile-basics',
      'arknights-panel-open-v1:operator-detail:operator-profile-skills',
      'arknights-panel-open-v1:operator-detail:operator-profile-modules',
    ].sort())
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
})

test('legacy operator modal retains its classification editing entry points', () => {
  const markup = render(LegacyModal)
  assert.match(markup, /class="operator-detail-dialog"/)
  for (const index of [1, 2, 3]) {
    assert.match(markup, new RegExp(`data-classifier-skill-id="char_test:skill_${index}"`))
    assert.match(markup, new RegExp(`aria-label="S${index} 第${index}スキルの分類情報を開く"`))
  }
  assert.doesNotMatch(render(Modal), /data-classifier-skill-id=/)
})
