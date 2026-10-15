import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Page, Picker, rows, structures, classifySkill

before(async () => {
  server = await createServer({
    configFile: false, plugins: [react()], logLevel: 'error',
    cacheDir: 'node_modules/.vite/skill-structure-test',
    resolve: { preserveSymlinks: true },
    server: { middlewareMode: true, watch: null, preTransformRequests: false }, appType: 'custom',
  })
  ;({ SkillStructurePage: Page } = await server.ssrLoadModule('/src/components/SkillStructurePage.tsx'))
  ;({ SkillDescriptionSelectionPage: Picker } = await server.ssrLoadModule('/src/components/SkillDescriptionSelectionPage.tsx'))
  ;({ SKILL_STRUCTURES: structures } = await server.ssrLoadModule('/src/lib/skillStructure.ts'))
  ;({ classifySkill } = await server.ssrLoadModule('/src/lib/classifier.ts'))
  rows = structures.map(structure => {
    const b = structure.basicInfo
    const a = structure.activationSettings
    const skillLevels = Array.from({ length: 10 }, (_, index) => ({
      name: b.skillName, description: structure.source.rawDescription,
      duration: structure.source.duration, durationType: 'NONE', skillType: 'MANUAL',
      spData: { spType: a.spRecovery, initSp: a.initialSp, spCost: a.spCost },
      blackboard: index === 9 ? structure.source.blackboard : [{ key: 'atk', value: index / 10 }],
    }))
    const raw = skillLevels[9]
    return {
      id: `${b.operatorId}:${b.skillId}`, ...b,
      profession: 'WARRIOR', professionLabel: '前衛', subProfessionId: 'lord',
      subProfessionName: '領主', nameInitial: 'S_ROW', rarity: 6,
      description: raw.description, duration: raw.duration, durationType: 'NONE',
      skillType: 'MANUAL', spType: a.spRecovery, initSp: a.initialSp, spCost: a.spCost,
      classification: classifySkill(raw), skillLevels,
      operatorProfile: { phases: [], favorKeyFrames: [] }, raw,
    }
  })
})

after(async () => { await server?.close() })

test('初期表示はスルトS2の効果構造で、特化3だけを表示する', () => {
  const markup = renderToStaticMarkup(createElement(Page, { rows, loading: false }))
  assert.match(markup, /role="tab" aria-selected="true"[^>]*>効果構造/)
  assert.equal((markup.match(/role="tab" /g) ?? []).length, 4)
  assert.match(markup, /skill-effects-fixed-level">特化3/)
  assert.doesNotMatch(markup, /<select/)
  assert.match(markup, /攻撃対象数＝1/)
  assert.match(markup, /＋120％/)
  assert.match(markup, /×1.6/)
  assert.match(markup, /aria-hidden="true" inert=""/)
  const picker = markup.match(/<section class="skill-effects-picker"[^>]*>([\s\S]*?)<\/section>/)?.[1]
  assert.ok(picker)
  assert.match(picker, /<section class="skill-structure-description" aria-label="スキル説明文"><p>/)
  assert.ok(picker.includes(structures[1].source.description))
  assert.doesNotMatch(picker, /hidden=/)
  assert.doesNotMatch(markup, /スキル説明文を表示|スキル説明文を閉じる/)
})

test('URLで別レベルを指定した場合、特化3の構造を代用せず選び直せる', () => {
  const selection = { ...structures[1].basicInfo, levelIndex: 8 }
  const markup = renderToStaticMarkup(createElement(Page, { rows, loading: false, initialSelection: selection }))
  assert.match(markup, /このページで表示できないレベル指定です/)
  assert.match(markup, /<option value="9">特化3<\/option>/)
  assert.doesNotMatch(markup, /value="8"/)
  assert.doesNotMatch(markup, /skill-structure-content/)
  assert.doesNotMatch(markup, /skill-structure-description/)
  assert.doesNotMatch(markup, /＋120％/)
})

test('対応していないスキルのURLから別スキルの構造を暗黙に表示しない', () => {
  const initialSelection = { ...structures[1].basicInfo, skillIndex: 3, skillId: 'skchr_surtr_3' }
  const markup = renderToStaticMarkup(createElement(Page, { rows, loading: false, initialSelection }))
  assert.match(markup, /リンク先のスキルが見つかりません/)
  assert.doesNotMatch(markup, /skill-structure-content/)
  assert.doesNotMatch(markup, /skill-structure-description/)
})

test('ソーンズはレベルと独立した2段階を表示し、段階ごとの値を保持する', () => {
  const initialSelection = structures[3].basicInfo
  const markup = renderToStaticMarkup(createElement(Page, { rows, loading: false, initialSelection }))
  assert.match(markup, /発動回数＝1/)
  assert.match(markup, /発動回数≧2/)
  assert.match(markup, /時間制限なし/)
  assert.match(markup, /本人の退場/)
  assert.match(markup, /＋60％/)
  assert.match(markup, /＋120％/)
  assert.equal((markup.match(/rowSpan="4"/g) ?? []).length, 2)
})

test('既存ページはレベル制約を渡さなければ全レベルの選択を維持する', () => {
  const markup = renderToStaticMarkup(createElement(Picker, {
    rows: [rows[1]], loading: false, createHash: () => '#/skill-summary',
    title: '既存ページ', kicker: '', renderSelection: ({ levelLabel }) => createElement('output', null, levelLabel),
  }))
  assert.equal((markup.match(/<option value=/g) ?? []).length, 10)
  assert.match(markup, /<option value="0">Lv.1<\/option>/)
  assert.match(markup, /<option value="9" selected="">特化3<\/option>/)
  assert.match(markup, /<output>特化3<\/output>/)
  assert.doesNotMatch(markup, /skill-structure-description/)
})
