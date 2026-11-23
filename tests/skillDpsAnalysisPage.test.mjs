import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Page, Table, rows
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props))
const text = markup => markup.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()

before(async () => {
  server = await createServer({
    configFile: false, plugins: [react()], logLevel: 'error',
    cacheDir: 'node_modules/.vite/skill-dps-analysis-page-test', resolve: { preserveSymlinks: true },
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  const page = await server.ssrLoadModule('/src/components/SkillDpsAnalysisPage.tsx')
  Page = page.default
  Table = page.SkillDpsAnalysisTable
  const { classifySkill } = await server.ssrLoadModule('/src/lib/classifier.ts')
  const guards = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardSources.json', import.meta.url), 'utf8')).guards
  const profiles = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardProfiles.json', import.meta.url), 'utf8'))
  rows = [['char_264_f12yin', 3], ['char_017_huang', 2]].map(([operatorId, skillIndex]) => {
    const operator = guards.find(candidate => candidate.id === operatorId)
    const source = operator.skills.find(candidate => candidate.skillIndex === skillIndex)
    const raw = structuredClone(source.raw)
    return {
      id: `${operatorId}/${skillIndex}`, operatorId, operatorName: operator.name, profession: 'WARRIOR',
      professionLabel: '前衛', subProfessionId: operator.subProfessionId, subProfessionName: operator.subProfessionId,
      rarity: 6, nameInitial: 'OTHER', skillIndex, skillId: source.skillId, skillName: raw.name,
      description: raw.description, duration: raw.duration, durationType: raw.durationType,
      skillType: raw.skillType, spType: raw.spData.spType, initSp: raw.spData.initSp, spCost: raw.spData.spCost,
      classification: classifySkill(raw), raw,
      skillLevels: Array.from({ length: 10 }, () => structuredClone(raw)),
      operatorProfile: profiles.find(profile => profile.operatorId === operatorId).operatorProfile,
    }
  })
})

after(async () => { await server?.close() })

test('initial analysis uses finite duration only and exposes the standard graph/table navigation', () => {
  const markup = render(Page, { rows, loading: false })
  assert.doesNotMatch(markup, /<h1\b/)
  assert.match(markup, /aria-label="スキルDPS分析 \/ 分析対象の場所をコピー"/)
  assert.match(markup, /aria-label="スキルDPS分析 \/ 計算条件の場所をコピー"/)
  assert.match(markup, /aria-label="スキルDPS分析 \/ 持続時間 \/ グラフの場所をコピー"/)
  assert.match(markup, /role="tab" aria-selected="true"[^>]*>持続時間/)
  assert.match(markup, /aria-pressed="true"[^>]*>グラフ/)
  assert.match(markup, /aria-pressed="false"[^>]*>表/)
  assert.match(markup, /<option value="INCREASE_WITH_TIME" selected="">自然回復<\/option>/)
  assert.match(text(markup), /使用 1件 ／ 除外 1件/)
  assert.match(text(markup), /持続時間・DPS未確定1件/)
  assert.match(text(markup), /通常攻撃型・1スキル1件/)
  assert.match(text(markup), /個別条件 DC3既定/)
  assert.doesNotMatch(markup, /NaN|Infinity|<table\b/)
})

test('the table retains a permanent duration, zero DPS and signed initial SP gap in separate columns', () => {
  const base = {
    skill: rows[0], stageLabel: 'スキル中', spCost: 15, initialSp: 20, spGap: -5,
    durationSeconds: null, directDps: 0, combinedDps: null, damageType: 'PHYSICAL',
  }
  const observations = [
    { ...base, id: 'zero', skill: { ...rows[0], operatorName: '零ダメージ', skillName: '永続スキル' } },
    { ...base, id: 'finite', skill: { ...rows[0], operatorName: '通常ダメージ', skillName: '有限スキル' },
      durationSeconds: 30, directDps: 900, combinedDps: 1200 },
  ]
  const direct = render(Table, { observations, metric: 'direct' })
  const body = direct.slice(direct.indexOf('<tbody>'))
  assert.ok(body.indexOf('通常ダメージ') < body.indexOf('零ダメージ'))
  assert.match(body, /零ダメージ<\/th><td[^>]*>S3<\/td><td[^>]*>永続スキル<\/td><td>—<\/td><td>15<\/td><td>20<\/td><td>-5<\/td><td>0<\/td>/)
  assert.equal((direct.match(/scope="col"/g) ?? []).length, 8)
  assert.match(direct, /role="region" tabindex="0" aria-label="分析対象のスキル"/)
  assert.doesNotMatch(direct, /NaN|Infinity|<a\b/)
  const combined = render(Table, { observations, metric: 'combined' })
  assert.match(combined, /合計DPS/)
  assert.match(combined, /1,200<\/td>/)
  assert.match(combined, /永続スキル<\/td><td>—<\/td><td>15<\/td><td>20<\/td><td>-5<\/td><td>—<\/td>/)
})

test('loading and source failure never present a calculated result', () => {
  const loading = render(Page, { rows, loading: true })
  assert.match(text(loading), /読み込み中/)
  assert.match(loading, /type="submit" disabled=""/)
  assert.doesNotMatch(loading, /role="tabpanel"/)
  const failure = render(Page, { rows, loading: false, error: 'データを取得できませんでした。' })
  assert.match(failure, /role="alert">データを取得できませんでした。/)
  assert.doesNotMatch(failure, /role="tabpanel"/)
})
