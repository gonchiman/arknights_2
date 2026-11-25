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
const DEFAULT_INDICATORS = ['持続時間', '必要SP', '必要SP−初期SP', '配置コスト', '初期SP率', '最大対象数', '攻撃力', '攻撃間隔']

function overviewRows(markup) {
  const table = markup.match(/<table\b[^>]*class="[^"]*\bskill-dps-overview-table\b[^"]*"[^>]*>([\s\S]*?)<\/table>/)
  assert.ok(table, 'the initial overview table is present')
  const body = table[1].match(/<tbody>([\s\S]*?)<\/tbody>/)
  assert.ok(body)
  return [...body[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(match => match[1])
}

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

test('initial overview exposes two result tabs and excludes theoretical uptime by default', () => {
  const markup = render(Page, { rows, loading: false })
  assert.doesNotMatch(markup, /<h1\b/)
  assert.match(markup, /aria-label="スキルDPS分析 \/ 分析一覧 \/ 表の場所をコピー"/)
  const tabs = [...markup.matchAll(/<button\b([^>]*\brole="tab"[^>]*)>([\s\S]*?)<\/button>/g)]
  assert.equal(tabs.length, 2)
  assert.deepEqual(tabs.map(match => text(match[2])), ['分析一覧', '分析詳細'])
  assert.match(tabs[0][1], /aria-selected="true"/)
  assert.match(tabs[1][1], /aria-selected="false"/)
  const detailId = tabs[1][1].match(/aria-controls="([^"]+)"/)?.[1]
  const detailPanel = [...markup.matchAll(/<[a-z][\w-]*\b([^>]*)>/g)]
    .find(match => match[1].includes(`id="${detailId}"`) && match[1].includes('role="tabpanel"'))
  assert.ok(detailPanel, 'the detail tab controls its own panel')
  assert.match(detailPanel[1], /(?:^|\s)hidden(?:\s|=|$)/)
  const detail = markup.slice(detailPanel.index, markup.indexOf('</section>', detailPanel.index))
  assert.match(detail, /role="group" aria-label="分析方法"/)
  assert.match(detail, /aria-pressed="true"[^>]*>指標別<\/button>/)
  assert.match(detail, /aria-pressed="false"[^>]*>重回帰<\/button>/)
  assert.match(detail, /aria-pressed="false"[^>]*>組み合わせ評価<\/button>/)
  const overview = overviewRows(markup)
  assert.equal(overview.length, DEFAULT_INDICATORS.length)
  for (const label of DEFAULT_INDICATORS) {
    const row = overview.find(candidate => [...candidate.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)]
      .some(button => text(button[1]) === label))
    assert.ok(row, `${label} opens its detailed analysis`)
  }
  assert.match(markup, /<option value="INCREASE_WITH_TIME" selected="">自然回復<\/option>/)
  // The permanent skill remains in SP analysis, but not in the finite-duration pair.
  const duration = overview.find(row => text(row).startsWith('持続時間'))
  const spCost = overview.find(row => text(row).startsWith('必要SP2'))
  assert.match(duration, /<td>1<\/td>/)
  assert.ok(spCost, 'both skills remain available for the SP-cost overview')
  assert.doesNotMatch(markup, /NaN|Infinity|<svg\b[^>]*class="(?:skill-dps-chart-svg|skill-dps-target-svg)"|>画像を保存<\/button>|>回帰線<\/label>/)
})

test('shared conditions start collapsed while the DPS selector remains outside the hidden form', () => {
  const markup = render(Page, { rows, loading: false })
  const disclosure = [...markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
    .find(match => text(match[2]).endsWith('分析条件'))
  assert.ok(disclosure)
  assert.match(disclosure[1], /aria-expanded="false"/)
  const controlledId = disclosure[1].match(/aria-controls="([^"]+)"/)?.[1]
  assert.ok(controlledId)
  const controlled = [...markup.matchAll(/<([a-z][\w-]*)\b([^>]*)>/g)]
    .find(match => match[2].includes(`id="${controlledId}"`))
  assert.ok(controlled)
  assert.match(controlled[2], /(?:^|\s)hidden(?:\s|=|$)/)
  const labels = [...markup.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)]
  const dps = labels.filter(match => text(match[1]).startsWith('DPS') && match[1].includes('<select'))
  assert.equal(dps.length, 1)
  assert.match(dps[0][1], /<option value="direct" selected="">直接DPS<\/option>/)
  const uptime = labels.find(match => text(match[1]) === '理論稼働率を含める')
  assert.ok(uptime)
  assert.match(uptime[1], /type="checkbox"/)
  assert.doesNotMatch(uptime[1], /\bchecked\b/)
  const formEnd = markup.indexOf('</form>', controlled.index)
  assert.ok(dps[0].index < controlled.index || dps[0].index > formEnd, 'DPS remains visible when conditions are collapsed')
})

test('the target-group breakdown has its own initially closed native disclosure', () => {
  const markup = render(Page, { rows, loading: false })
  const details = [...markup.matchAll(/<details\b([^>]*)>\s*<summary\b[^>]*>([\s\S]*?)<\/summary>/g)]
  const targetGroups = details.find(match => text(match[2]).includes('最大対象数別のDPS'))
  assert.ok(targetGroups)
  assert.doesNotMatch(targetGroups[1], /(?:^|\s)open(?:\s|=|$)/)
  assert.doesNotMatch(targetGroups[1], /(?:^|\s)hidden(?:\s|=|$)/)
  assert.match(markup, /aria-label="最大対象数別のDPSの表"/)
})

test('empty overview retains all indicators without mounting an unusable plot export', () => {
  const markup = render(Page, { rows: [], loading: false })
  const overview = overviewRows(markup)
  assert.equal(overview.length, DEFAULT_INDICATORS.length)
  for (const row of overview) assert.match(row, /<td>0<\/td>/)
  assert.doesNotMatch(markup, />画像を保存<\/button>|<svg\b[^>]*class="(?:skill-dps-chart-svg|skill-dps-target-svg)"|NaN|Infinity/)
})

test('new metric columns keep the original SP information and do not turn unlimited capacity into a number', () => {
  const base = {
    id: 'new-indicators', skill: rows[0], stageLabel: 'スキル中', durationSeconds: 30,
    spCost: 20, initialSp: 25, spGap: -5, directDps: 1500, combinedDps: 1600, damageType: 'PHYSICAL',
    deploymentCost: 18, initialRatio: 125, uptime: 60, uptimeUnavailableReason: null,
    maxTargets: 'UNLIMITED', attack: 1900, attackInterval: 1.25,
  }
  for (const [axis, value] of [['deploymentCost', '18'], ['initialRatio', '125'], ['uptime', '60'],
    ['maxTargets', '上限なし'], ['attack', '1,900'], ['interval', '1.25']]) {
    const markup = render(Table, { observations: [base], metric: 'direct', axis })
    assert.equal((markup.match(/scope="col"/g) ?? []).length, 9)
    assert.match(markup, /必要SP−初期SP/)
    assert.match(markup, /<td>20<\/td><td>25<\/td><td>-5<\/td>/)
    assert.ok(markup.includes(`<td>${value}</td><td>1,500</td>`), axis)
    assert.doesNotMatch(markup, /UNLIMITED|NaN|Infinity/)
  }
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
