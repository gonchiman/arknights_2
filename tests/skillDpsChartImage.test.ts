import test from 'node:test'
import assert from 'node:assert/strict'
import { CHART_IMAGE_FILENAME_BYTE_LIMIT } from '../src/lib/chartImageFilename.ts'
import { DEFAULT_SKILL_DPS_ANALYSIS_CONFIG } from '../src/lib/skillDpsAnalysis.ts'
import {
  getSkillDpsChartImageTitle, getSkillDpsChartImageConditions, getSkillDpsChartImageFilename,
  type SkillDpsChartImageSnapshot,
} from '../src/lib/skillDpsChartImage.ts'

function snapshot(overrides: Partial<SkillDpsChartImageSnapshot> = {}): SkillDpsChartImageSnapshot {
  return {
    config: { ...DEFAULT_SKILL_DPS_ANALYSIS_CONFIG }, axis: 'duration', metric: 'direct', showFit: true,
    points: [{ id: 'skill-a', x: 10, y: 100 }, { id: 'skill-b', x: 20, y: 200 }, { id: 'skill-c', x: 30, y: 300 }],
    fit: { slope: 10, intercept: 0 }, correlation: 1, rSquared: 1, ...overrides,
  }
}

test('all three hypotheses and both DPS metrics have readable distinct titles and names', () => {
  const names: string[] = []
  for (const [axis, label] of [['duration', '持続時間'], ['spCost', '必要SP'], ['spGap', '必要SP−初期SP']] as const) {
    for (const [metric, dps] of [['direct', '直接DPS'], ['combined', '合計DPS']] as const) {
      const source = snapshot({ axis, metric })
      assert.equal(getSkillDpsChartImageTitle(source), `${label}と${dps}`)
      const filename = getSkillDpsChartImageFilename(source)
      assert.ok(filename.startsWith(`スキルDPS_${label}と${dps}_`))
      assert.match(filename, /_比率自動\.png$/)
      names.push(filename)
    }
  }
  assert.equal(new Set(names).size, 6)
})

test('header conditions use the applied cohort and short main conditions rather than all fixed settings', () => {
  const source = snapshot()
  assert.equal(getSkillDpsChartImageConditions(source),
    '全職業・全レア・自然回復・スキル最高Lv・防御0／術耐性0・敵1体・n=3')
  const selected = { ...source, config: { ...source.config,
    profession: 'CASTER', rarity: 6, spRecovery: 'INCREASE_WHEN_ATTACK', damageType: 'ARTS',
    skillLevel: 'RANK_7', defense: 1250, resistance: 37.5,
  } } as SkillDpsChartImageSnapshot
  assert.equal(getSkillDpsChartImageConditions(selected),
    '術師・★6・攻撃回復・主攻撃:術・スキルLv7・防御1,250／術耐性37.5・敵1体・n=3')
  assert.doesNotMatch(getSkillDpsChartImageConditions(source), /信頼|潜在|回帰線|未装備|rSquared|correlation/)
  assert.equal(getSkillDpsChartImageConditions({ ...source, points: [] }).endsWith('n=0'), true)
})

test('automatic names identify filters, exact enemy values, skill level and fixed build', () => {
  const source = snapshot()
  const original = getSkillDpsChartImageFilename(source)
  for (const label of ['全職業', '全レア', '自然回復', '主攻撃全属性', 'スキル最高Lv',
    '育成最大-信頼100-潜在1', '未装備', '防御0', '術耐性0', '敵1体']) assert.ok(original.includes(label), label)
  for (const config of [
    { profession: 'WARRIOR' }, { rarity: 6 }, { spRecovery: 'INCREASE_WHEN_ATTACK' },
    { spRecovery: 'INCREASE_WHEN_TAKEN_DAMAGE' }, { damageType: 'PHYSICAL' }, { damageType: 'ARTS' },
    { damageType: 'TRUE' }, { damageType: 'ELEMENTAL' }, { damageType: 'MIXED' },
    { skillLevel: 'RANK_7' }, { defense: 0.00001 }, { defense: 1000 }, { resistance: 37.000001 },
  ] as Partial<SkillDpsChartImageSnapshot['config']>[]) {
    assert.notEqual(getSkillDpsChartImageFilename({ ...source, config: { ...source.config, ...config } }), original)
  }
  assert.match(getSkillDpsChartImageFilename({ ...source, config: { ...source.config, damageType: 'MIXED' } }), /主攻撃複合/)
  assert.match(getSkillDpsChartImageFilename({ ...source, config: { ...source.config, defense: 1000 } }), /防御1000_/)
})

test('regression-line naming represents visible state and never claims a line without a fit', () => {
  const source = snapshot()
  const visible = getSkillDpsChartImageFilename(source)
  const hidden = getSkillDpsChartImageFilename({ ...source, showFit: false })
  const unavailable = getSkillDpsChartImageFilename({ ...source, fit: null })
  assert.match(visible, /回帰線あり/)
  assert.match(hidden, /回帰線なし/)
  assert.equal(unavailable, hidden)
  assert.equal(getSkillDpsChartImageFilename({ ...source, showFit: false, fit: null }), hidden)
  assert.notEqual(visible, hidden)
})

test('aspect suffix uses the shared normalized-ratio rule', () => {
  const source = snapshot()
  assert.match(getSkillDpsChartImageFilename(source, 16 / 9), /_比率16x9\.png$/)
  assert.match(getSkillDpsChartImageFilename(source, 1), /_比率1x1\.png$/)
  assert.equal(getSkillDpsChartImageFilename(source, 16 / 9), getSkillDpsChartImageFilename(source, 32 / 18))
  assert.notEqual(getSkillDpsChartImageFilename(source), getSkillDpsChartImageFilename(source, 16 / 9))
  for (const ratio of [0, -1, NaN, Infinity]) assert.throws(() => getSkillDpsChartImageFilename(source, ratio), TypeError)
})

test('forbidden characters and long Unicode filters are handled by the common filename helper', () => {
  const source = snapshot()
  for (const profession of ['CON', ' /前衛<>:"\\|?*\u0000\u001f\u007f. ', '長い職業😀'.repeat(100)]) {
    const filename = getSkillDpsChartImageFilename({ ...source, config: { ...source.config, profession } }, 16 / 9)
    assert.doesNotMatch(filename, /[<>:"/\\|?*\u0000-\u001f\u007f]/)
    assert.equal(filename.isWellFormed(), true)
    assert.ok(new TextEncoder().encode(filename).length <= CHART_IMAGE_FILENAME_BYTE_LIMIT)
    assert.match(filename, /_比率16x9\.png$/)
    if (profession.length > 100) assert.match(filename, /_ほか\d+項目_比率16x9\.png$/)
  }
})

test('result values, point identities and refreshed samples do not become filename identifiers', () => {
  const source = snapshot()
  const refreshed = { ...source, correlation: -0.12, rSquared: 0.0144, fit: { slope: -7, intercept: 12345 },
    points: [...source.points.map(point => ({ id: point.id + '-new', x: point.x + 1, y: point.y + 2000 })),
      { id: 'extra', x: 200, y: 3 }],
  }
  assert.equal(getSkillDpsChartImageFilename(source), getSkillDpsChartImageFilename(refreshed))
  assert.match(getSkillDpsChartImageConditions(refreshed), /n=4$/)
})

test('reading snapshot labels and filenames does not modify frozen input data', () => {
  const source = snapshot()
  const before = structuredClone(source)
  Object.freeze(source.config)
  for (const point of source.points) Object.freeze(point)
  Object.freeze(source.points)
  Object.freeze(source.fit)
  Object.freeze(source)
  getSkillDpsChartImageTitle(source)
  getSkillDpsChartImageConditions(source)
  getSkillDpsChartImageFilename(source, 16 / 9)
  assert.deepEqual(source, before)
})
