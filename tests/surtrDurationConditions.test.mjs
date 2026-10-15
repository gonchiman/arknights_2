import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Editor, participants, surtr, healer, enemy, baseProps
before(async () => {
  server = await createServer({
    configFile: false, plugins: [react()], cacheDir: 'node_modules/.vite/surtr-duration-conditions-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  ;({ SurtrDurationConditionEditor: Editor } = await server.ssrLoadModule('/src/components/SurtrDurationConditionEditor.tsx'))
  participants = await server.ssrLoadModule('/src/lib/surtrDurationParticipants.ts')
  const { classifySkill } = await server.ssrLoadModule('/src/lib/classifier.ts')
  const record = (operatorId, operatorName, skillId, skillIndex, profile, levels) => ({
    id: `${operatorId}:${skillId}`, operatorId, operatorName, skillId, skillIndex, operatorProfile: profile, skillLevels: levels,
    profession: operatorId === 'char_350_surtr' ? 'WARRIOR' : 'MEDIC', professionLabel: '', subProfessionId: '', subProfessionName: '',
    nameInitial: 'A_ROW', rarity: 6, skillName: levels.at(-1).name, description: '', duration: levels.at(-1).duration,
    durationType: 'NONE', skillType: 'MANUAL', spType: 'INCREASE_WITH_TIME', initSp: 0, spCost: 10,
    classification: classifySkill(levels.at(-1)), raw: levels.at(-1),
  })
  surtr = record('char_350_surtr', 'スルト', 'skchr_surtr_3', 3, {
    phases: [{ maxLevel: 50 }, { maxLevel: 80 }, { maxLevel: 90, attributesKeyFrames: [
      { level: 1, data: { maxHp: 2216, def: 343, magicResistance: 15, cost: 21 } },
      { level: 90, data: { maxHp: 2916, def: 414, magicResistance: 15, cost: 21 } },
    ] }],
    favorKeyFrames: [{ level: 0, data: { maxHp: 0, def: 0, magicResistance: 0 } }, { level: 50, data: { maxHp: 0, def: 0, magicResistance: 0 } }],
    talents: [{ candidates: [{ name: '余燼', blackboard: [{ key: 'surtr_t_2[withdraw].interval', value: 8 }] }] }],
    potentialRanks: [{}, {}, {}, {}, {}],
  }, Array.from({ length: 10 }, () => ({ name: 'ラグナロク', duration: -1, blackboard: [
    { key: 'max_hp', value: 5000 }, { key: 'interval', value: 0.2 }, { key: 'hp_ratio', value: 0.2 }, { key: 'duration', value: 60 },
  ] })))
  // Duration uses talent index 1 for Remnant, as in the runtime records.
  surtr.operatorProfile.talents.unshift({ candidates: [{ name: '劫火', blackboard: [{ key: 'magic_resist_penetrate_fixed', value: 20 }] }] })
  healer = record('char_212_ansel', 'アンセル', 'skcom_range_extend', 1, {
    phases: [40, 55].map(maxLevel => ({ maxLevel, attributesKeyFrames: [
      { level: 1, data: { atk: 262, attackSpeed: 100, baseAttackTime: 2.85 } },
      { level: maxLevel, data: { atk: 362, attackSpeed: 100, baseAttackTime: 2.85 } },
    ] })),
    favorKeyFrames: [{ level: 0, data: { atk: 0 } }, { level: 50, data: { atk: 45 } }],
    potentialRanks: [{}, {}, {}, {}, {}],
  }, Array.from({ length: 7 }, () => ({ name: '回復範囲強化', duration: 25, blackboard: [{ key: 'atk', value: 0.4 }] })))
  enemy = {
    id: 'enemy-soldier', name: '兵士', index: 'A1', sortId: 0, levelType: 'NORMAL', description: '', abilities: [], damageTypes: ['PHYSIC'],
    attackWay: 'MELEE', lifePointReduce: 1, databaseLevel: 0, databaseLevelCount: 1, stageAppearanceCount: 1, statusImmunities: [],
    ratings: { endurance: null, attack: null, defense: null, resistance: null },
    stats: { maxHp: 1000, attack: 500, defense: 0, magicResistance: 0, moveSpeed: 1, attackSpeed: 100, baseAttackTime: 2, massLevel: 1 },
  }
  baseProps = { record: surtr, skillRows: [surtr, healer], enemyRows: [enemy], onChange: () => {}, onSubmit: () => {} }
})
after(async () => { await server?.close() })

const render = (extra = {}) => renderToStaticMarkup(createElement(Editor, {
  ...baseProps, value: participants.createSurtrDurationCondition(surtr), ...extra,
}))
const text = markup => markup.replace(/<[^>]*>/g, '')
const rows = markup => [...(markup.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/)?.[1] ?? '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)]
  .map(row => [...row[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/g)].map(cell => text(cell[1])))
const buttons = markup => [...markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
  .map(match => ({ attrs: match[1], text: text(match[2]), disabled: /\bdisabled(?:=|\s|$)/.test(match[1]) }))
const button = (markup, label) => {
  const result = buttons(markup).find(item => item.text === label)
  assert.ok(result, `missing button ${label}`)
  return result
}
const validCondition = () => {
  const value = participants.createSurtrDurationCondition(surtr)
  value.name = '兵士＋アンセル'
  value.enemies = [{ ...participants.createSurtrDurationEnemyParticipant(enemy, 'enemy-1'), count: 3, firstTime: 1.25 }]
  value.healers = [{ ...participants.createSurtrDurationHealerParticipant([healer], healer.operatorId, 'healer-1'),
    skillId: healer.skillId, skillLevelIndex: 6, firstTime: 2.85, skillStart: 10, skillFirstTime: 12.9 }]
  return value
}

test('baseline contains only Surtr, with accessible edit/add actions and no implied external effects', () => {
  let changes = 0, submissions = 0
  const markup = render({ onChange: () => { changes++ }, onSubmit: () => { submissions++ } })
  assert.deepEqual(rows(markup), [['分析対象', 'スルト', '昇進2 Lv.90・信頼100・潜在1・特化3・未装備', '—', '編集']])
  assert.match(markup, /aria-label="スルトの条件を編集"/)
  for (const label of ['敵を追加', '回復役を追加', '編集', '線を追加']) assert.equal(button(markup, label).disabled, false)
  assert.equal(button(markup, '編集').attrs.includes('aria-haspopup="dialog"'), true)
  assert.doesNotMatch(markup, /<dialog\b|role="alert"|type="number"/)
  assert.equal(changes, 0, 'rendering cannot add a participant or mutate the draft')
  assert.equal(submissions, 0)
})

test('actual selected participants retain identity, cultivation, counts and distinct first-hit times', () => {
  const value = validCondition()
  const before = structuredClone(value)
  assert.deepEqual(participants.deriveSurtrDurationParticipants(surtr, value, [enemy], [surtr, healer]).unsupportedReasons, [])
  const markup = render({ value })
  assert.deepEqual(rows(markup), [
    ['分析対象', 'スルト', '昇進2 Lv.90・信頼100・潜在1・特化3・未装備', '—', '編集'],
    ['敵', '兵士', '3体・通常攻撃', '1.25秒', '編集削除'],
    ['回復役', 'アンセル', '昇進1 Lv.55・S1 Lv.7・発動10秒', '2.85秒', '編集削除'],
  ])
  assert.match(markup, /aria-label="敵1 兵士の条件を編集"/)
  assert.match(markup, /aria-label="回復役1 アンセルを削除"/)
  assert.doesNotMatch(markup, /role="alert"|<dialog\b/)
  assert.equal(button(markup, '線を追加').disabled, false)
  assert.deepEqual(value, before)
})

test('submit-only disabling preserves editing, cancelling and parent-owned footer controls', () => {
  const markup = render({ value: validCondition(), submitDisabled: true, submitLabel: '変更を適用', onCancelEdit: () => {},
    footerFields: createElement('label', null, '計算上限（秒）', createElement('input', { type: 'number', min: 1, max: 600, required: true, defaultValue: 120 })) })
  assert.equal(button(markup, '変更を適用').disabled, true)
  for (const label of ['敵を追加', '回復役を追加', '編集', '削除', 'キャンセル']) assert.equal(button(markup, label).disabled, false)
  const nameInput = markup.match(/<input\b[^>]*type="text"[^>]*>/)?.[0]
  assert.ok(nameInput)
  assert.doesNotMatch(nameInput, /\bdisabled/)
  const footerInput = markup.match(/<input\b[^>]*type="number"[^>]*>/)?.[0]
  assert.match(footerInput, /min="1"/)
  assert.match(footerInput, /max="600"/)
  assert.match(footerInput, /required=""/)
  assert.doesNotMatch(footerInput, /\bdisabled/)
})

test('invalid participant data is visible and prevents submitting a partial or guessed condition', () => {
  for (const patch of [{ enemyId: 'missing-enemy' }, { count: 0 }, { firstTime: NaN }]) {
    const value = validCondition()
    Object.assign(value.enemies[0], patch)
    const markup = render({ value })
    assert.match(markup, /role="alert"/)
    assert.equal(button(markup, '線を追加').disabled, true)
    assert.equal(button(markup, '編集').disabled, false, 'invalid rows must remain editable')
    assert.equal(button(markup, '削除').disabled, false)
  }
  const missing = render({ value: { ...validCondition(), healers: [{ ...validCondition().healers[0], operatorId: 'missing-healer' }] } })
  assert.equal(rows(missing)[2][1], '未選択')
  assert.match(text(missing), /回復役のデータが見つかりません/)
})

test('participant limits act independently and the enemy catalog remains accessible without selectable rows', () => {
  const value = validCondition()
  value.enemies = Array.from({ length: 8 }, (_, index) => ({ ...value.enemies[0], id: `enemy-${index}` }))
  const enemiesFull = render({ value })
  assert.equal(button(enemiesFull, '敵を追加').disabled, true)
  assert.equal(button(enemiesFull, '回復役を追加').disabled, false)
  assert.equal(button(enemiesFull, '線を追加').disabled, false)
  value.healers = Array.from({ length: 8 }, (_, index) => ({ ...value.healers[0], id: `healer-${index}` }))
  const bothFull = render({ value })
  assert.equal(button(bothFull, '回復役を追加').disabled, true)
  assert.equal(rows(bothFull).length, 17)
  assert.equal(button(render({ enemyRows: [] }), '敵を追加').disabled, false)
  assert.equal(button(render({ enemyRows: [] }), '回復役を追加').disabled, false)
  assert.equal(button(render({ enemyRows: [], enemyLoading: true }), '敵を追加').disabled, false)
  assert.equal(button(render({ enemyRows: [], enemyError: '取得失敗', onEnemyRetry: () => {} }), '敵を追加').disabled, false)
  assert.equal(button(render({ skillRows: [surtr] }), '回復役を追加').disabled, true)
  const unsupportedEnemy = { ...enemy, stats: { ...enemy.stats, attack: null } }
  assert.equal(button(render({ enemyRows: [unsupportedEnemy] }), '敵を追加').disabled, false)
})

test('global disabled locks each mutating control while keeping the complete selected condition visible', () => {
  const markup = render({ value: validCondition(), disabled: true })
  assert.equal(rows(markup).length, 3)
  assert.ok(buttons(markup).every(item => item.disabled))
  assert.match(markup.match(/<input\b[^>]*type="text"[^>]*>/)?.[0] ?? '', /\bdisabled/)
})
