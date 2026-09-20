import test from 'node:test'
import assert from 'node:assert/strict'
import { buildOperatorModuleComparison } from '../src/lib/operatorModuleComparison.ts'
import { splitPassiveDescriptionChanges } from '../src/lib/passiveDescriptionChanges.ts'
import type { OperatorCombatProfile, RawOperatorModule } from '../src/types/skill.ts'

const originalFirst = '配置から10秒後、物理回避と術回避+60%、敵に狙われにくくなる'
const originalSecond = '攻撃範囲内のスタン状態の敵が受ける物理ダメージ+18%'

test('元の効果を残し、異なる素質を強化するモジュールを素質番号で比較する', () => {
  const profile = createProfile()
  const comparison = buildOperatorModuleComparison(profile, null)
  assert.equal(comparison.level, 3)
  assert.deepEqual(comparison.levels, [1, 2, 3])
  assert.equal(comparison.potentialRank, 1)
  assert.deepEqual(comparison.potentialRanks, [1, 2, 3, 4, 5, 6])
  assert.deepEqual(comparison.potentialEffects, [])
  assert.equal(comparison.condition, '昇進2・潜在1')
  assert.deepEqual(comparison.columns.map((column) => [column.id, column.level]), [
    ['none', null], ['module-x', 3], ['module-y', 3],
  ])
  assert.equal(comparison.columns[0].name, 'モジュールなし')
  assert.equal(comparison.columns[1].typeLabel, 'ART-X')

  const first = comparison.rows.find((row) => row.id === 'talent:0')!
  const second = comparison.rows.find((row) => row.id === 'talent:1')!
  assert.equal(first.name, '潜伏')
  assert.equal(second.name, '悪巧み')
  assert.deepEqual(first.cells, [
    { text: originalFirst, baseline: null },
    { text: originalFirst, baseline: null },
    { text: '配置から8秒後、物理回避と術回避+60%、敵に狙われにくくなる。攻撃力が上昇', baseline: originalFirst },
  ])
  assert.deepEqual(second.cells, [
    { text: originalSecond, baseline: null },
    { text: '攻撃範囲内のスタン状態の敵が受ける物理ダメージ+24%、敵を倒す度SP+1', baseline: originalSecond },
    { text: originalSecond, baseline: null },
  ])
  const trait = comparison.rows.find((row) => row.id === 'trait')!
  assert.deepEqual(trait.cells.map((cell) => cell.text), [
    '敵に範囲物理ダメージを与える',
    '敵に範囲物理ダメージを与える ブロックされている敵を攻撃時、攻撃力が110%まで上昇',
    '敵に範囲物理ダメージを与える 攻撃時、対象の防御力を100無視',
  ])
  assert.deepEqual(trait.cells.map((cell) => cell.baseline), [
    null, '敵に範囲物理ダメージを与える', '敵に範囲物理ダメージを与える',
  ])
  assert.equal(profile.talents?.[0].candidates?.[0].description, originalFirst)
})

test('潜在の解放段階で未装備・各MODの素質を更新し、同じ潜在を差分の基準にする', () => {
  const profile = createProfile()
  const beforeUnlock = buildOperatorModuleComparison(profile, 3, 4)
  const afterUnlock = buildOperatorModuleComparison(profile, 3, 5)
  assert.equal(beforeUnlock.rows.find((row) => row.id === 'talent:1')!.cells[0].text, originalSecond)
  assert.match(beforeUnlock.rows.find((row) => row.id === 'talent:1')!.cells[1].text, /\+24%/)
  assert.deepEqual(afterUnlock.rows.find((row) => row.id === 'talent:1')!.cells, [
    { text: '潜在強化後', baseline: null },
    { text: '潜在強化後のモジュール', baseline: '潜在強化後' },
    { text: '潜在強化後', baseline: null },
  ])
  assert.deepEqual(afterUnlock.rows.find((row) => row.id === 'talent:0')!.cells, [
    { text: originalFirst, baseline: null },
    { text: originalFirst, baseline: null },
    { text: '潜在強化後のモジュール', baseline: originalFirst },
  ])
  assert.equal(afterUnlock.condition, '昇進2・潜在5')
  assert.equal(afterUnlock.potentialRank, 5)
  assert.deepEqual(buildOperatorModuleComparison(profile, 3, 6).rows, afterUnlock.rows)

  const levelOne = buildOperatorModuleComparison(profile, 1, 5)
  assert.deepEqual(levelOne.rows.find((row) => row.id === 'talent:1')!.cells, [
    { text: '潜在強化後', baseline: null },
    { text: '潜在強化後', baseline: null },
    { text: '潜在強化後', baseline: null },
  ])
})

test('共通の潜在補正を累積表示し、MOD能力値の加算量には混ぜない', () => {
  const profile = createProfile()
  profile.potentialRanks = [
    { description: 'コスト-1', buff: { attributes: { attributeModifiers: [{ attributeType: 4, formulaItem: 0, value: -1 }] } } },
    { description: '第一素質強化' },
    { description: '攻撃力+25', buff: { attributes: { attributeModifiers: [{ attributeType: 'ATK', formulaItem: 'ADDITION', value: 25 }] } } },
    { description: 'コスト-1', buff: { attributes: { attributeModifiers: [{ attributeType: '4', formulaItem: '0', value: -1 }] } } },
    { description: '<@ba.kw>第二素質強化</>' },
  ]
  const base = buildOperatorModuleComparison(profile, 3, 1)
  const middle = buildOperatorModuleComparison(profile, 3, 3)
  const maximum = buildOperatorModuleComparison(profile, 3, 6)
  assert.deepEqual(base.potentialEffects, [])
  assert.deepEqual(middle.potentialEffects, ['配置コスト-1', '第一素質強化'])
  assert.deepEqual(maximum.potentialEffects, ['配置コスト-2', '攻撃力+25', '第一素質強化', '第二素質強化'])
  assert.deepEqual(maximum.rows.filter((row) => row.kind === 'attribute'), base.rows.filter((row) => row.kind === 'attribute'))
  assert.deepEqual(maximum.rows.find((row) => row.id === 'attribute:atk')!.cells.map((cell) => cell.text), ['—', '+60', '+60'])
  assert.equal(maximum.rows.some((row) => row.id === 'attribute:cost'), false)
})

test('単純な加算と確認できない潜在補正は合計せず、元の説明を表示する', () => {
  const profile = createProfile()
  profile.potentialRanks = [
    { description: '条件付きコスト減少', buff: { attributes: { attributeModifiers: [
      { attributeType: 4, formulaItem: 0, value: -1, loadFromBlackboard: true },
    ] } } },
    { description: '割合攻撃力強化', buff: { attributes: { attributeModifiers: [
      { attributeType: 'ATK', formulaItem: 'MULTIPLICATION', value: 1.1 },
    ] } } },
    { description: '参照元に応じたHP増加', buff: { attributes: { attributeModifiers: [
      { attributeType: 'MAX_HP', formulaItem: 0, value: 100, fetchBaseValueFromSourceEntity: true },
    ] } } },
    { description: '再配置時間-4秒', buff: { attributes: { attributeModifiers: [
      { attributeType: 'RESPAWN_TIME', formulaItem: 0, value: -4 },
    ] } } },
  ]
  assert.deepEqual(buildOperatorModuleComparison(profile, 3, 5).potentialEffects, [
    '再配置時間-4秒', '条件付きコスト減少', '割合攻撃力強化', '参照元に応じたHP増加',
  ])
})

test('潜在の入力を既存の規則で丸め、オペレーターごとの解放可能範囲に収める', () => {
  const profile = createProfile()
  assert.equal(buildOperatorModuleComparison(profile, 3, Number.NaN).potentialRank, 1)
  assert.equal(buildOperatorModuleComparison(profile, 3, Number.POSITIVE_INFINITY).potentialRank, 1)
  assert.equal(buildOperatorModuleComparison(profile, 3, -2).potentialRank, 1)
  assert.equal(buildOperatorModuleComparison(profile, 3, 4.6).potentialRank, 5)
  assert.equal(buildOperatorModuleComparison(profile, 3, 99).potentialRank, 6)
  profile.potentialRanks = [{}, {}]
  const limited = buildOperatorModuleComparison(profile, 3, 99)
  assert.equal(limited.potentialRank, 3)
  assert.deepEqual(limited.potentialRanks, [1, 2, 3])
  assert.equal(limited.condition, '昇進2・潜在3')
  assert.equal(limited.rows.find((row) => row.id === 'talent:1')!.cells[0].text, originalSecond)
  delete profile.potentialRanks
  const noPotentials = buildOperatorModuleComparison(profile, 3, 6)
  assert.equal(noPotentials.potentialRank, 1)
  assert.deepEqual(noPotentials.potentialRanks, [1])
})

test('特性のブロック数変更だけをハイライトし、元の効果・未変更・データ欠損は強調しない', () => {
  const profile = createProfile()
  profile.traitDescription = '敵を3体までブロック'
  profile.modules![0].phases![2].parts = [{
    overrideTraitDataBundle: { candidates: [{
      overrideDescription: '敵を{block_cnt}体までブロック',
      blackboard: { block_cnt: 4 },
    }] },
  }]
  profile.modules![1].phases![2].parts = []
  profile.modules!.push({ type: 'ADVANCED', uniEquipId: 'missing', uniEquipName: 'データ未取得' })
  const trait = buildOperatorModuleComparison(profile, 3).rows.find((row) => row.id === 'trait')!
  assert.deepEqual(trait.cells, [
    { text: '敵を3体までブロック', baseline: null },
    { text: '敵を4体までブロック', baseline: '敵を3体までブロック' },
    { text: '敵を3体までブロック', baseline: null },
    { text: 'データなし', baseline: null },
  ])
  const segments = trait.cells.map((cell) => splitPassiveDescriptionChanges(cell.baseline ?? cell.text, cell.text))
  assert.deepEqual(segments.map((parts) => parts.filter((part) => part.changed).map((part) => part.text)), [
    [], ['4'], [], [],
  ])
  assert.deepEqual(segments.map((parts) => parts.map((part) => part.text).join('')), trait.cells.map((cell) => cell.text))
})

test('Lv.1では変更されない素質も全文を表示し、ハイライトの基準を付けない', () => {
  const comparison = buildOperatorModuleComparison(createProfile(), 1)
  for (const row of comparison.rows.filter((row) => row.kind === 'talent')) {
    assert.equal(new Set(row.cells.map((cell) => cell.text)).size, 1)
    assert.ok(row.cells.every((cell) => cell.baseline === null))
  }
  assert.equal(comparison.level, 1)
  assert.ok(comparison.columns.every((column) => column.available))
})

test('異なる能力値の和集合を並べ、存在しない補正はダッシュにし負数や単位も保持する', () => {
  const profile = createProfile()
  profile.modules![0].phases![2].attributeBlackboard = { max_hp: 210, atk: 78 }
  profile.modules![1].phases![2].attributeBlackboard = [
    { key: 'atk', value: 85 },
    { key: 'attack_speed', value: 5 },
    { key: 'respawn_time', value: -2.5 },
    { key: 'custom_stat', valueStr: '条件により変化' },
  ]
  const rows = buildOperatorModuleComparison(profile, 3).rows.filter((row) => row.kind === 'attribute')
  assert.deepEqual(rows.map((row) => [row.label, ...row.cells.map((cell) => cell.text)]), [
    ['最大HP', '—', '+210', '—'],
    ['攻撃力', '—', '+78', '+85'],
    ['攻撃速度', '—', '—', '+5'],
    ['再配置時間', '—', '—', '-2.5秒'],
    ['custom_stat', '—', '—', '条件により変化'],
  ])
  assert.ok(rows.every((row) => row.cells.every((cell) => cell.baseline === null)))
})

test('説明のある召喚物・非表示効果・追加素質を分け、説明のない内部記録は表示しない', () => {
  const profile = createProfile()
  const phase = profile.modules![0].phases![2]
  phase.tokenAttributeBlackboard = { token: { max_hp: 100, atk: 20 } }
  phase.parts!.push(
    { isToken: true, addOrOverrideTalentDataBundle: { candidates: [
      { talentIndex: 0, name: '召喚物強化', upgradeDescription: '召喚物の攻撃力+20%' },
    ] } },
    { addOrOverrideTalentDataBundle: { candidates: [
      { talentIndex: 0, isHideTalent: true, upgradeDescription: '内部の追加効果' },
    ] } },
    { addOrOverrideTalentDataBundle: { candidates: [
      { talentIndex: 2, name: '新しい素質', upgradeDescription: '追加の回復効果' },
    ] } },
    { addOrOverrideTalentDataBundle: { candidates: [
      { talentIndex: -1, isHideTalent: true, blackboard: { sp: 1 } },
    ] } },
  )
  const comparison = buildOperatorModuleComparison(profile, 3)
  assert.equal(comparison.rows.find((row) => row.id === 'talent:0')!.cells[1].text, originalFirst)
  assert.equal(comparison.rows.filter((row) => row.kind === 'talent').length, 2)
  const extras = comparison.rows.filter((row) => row.kind === 'extra')
  assert.equal(extras.length, 4)
  assert.deepEqual(extras.map((row) => row.cells[1].text), [
    '最大HP +100、攻撃力 +20', '召喚物の攻撃力+20%', '内部の追加効果', '追加の回復効果',
  ])
  assert.deepEqual(extras.map((row) => row.label), ['召喚物', '召喚物', '追加効果', '追加効果'])
  assert.ok(extras.every((row) => row.cells[0].text === '—' && row.cells[2].text === '—'))
  assert.ok(extras.every((row) => row.cells[1].baseline === ''))
  assert.equal(phase.parts!.at(-2)!.addOrOverrideTalentDataBundle!.candidates![0].isHideTalent, undefined)
})

test('非表示の素質が先行しても、安定した元データの素質番号で上書きする', () => {
  const profile = createProfile()
  profile.talents![0].candidates![0].isHideTalent = true
  const comparison = buildOperatorModuleComparison(profile, 3)
  const talents = comparison.rows.filter((row) => row.kind === 'talent')
  assert.equal(talents.length, 1)
  assert.equal(talents[0].label, '素質2')
  assert.match(talents[0].cells[1].text, /\+24%/)
  assert.equal(talents[0].cells[1].baseline, originalSecond)
  assert.ok(comparison.rows.some((row) => row.kind === 'extra' && row.cells[2].text.includes('配置から8秒')))
})

test('素質名の変更は元の名称を失わずに表示し、名称だけの変更も比較できる', () => {
  const profile = createProfile()
  const candidate = profile.modules![0].phases![2].parts![1].addOrOverrideTalentDataBundle!.candidates![0]
  candidate.name = '強化された悪巧み'
  candidate.upgradeDescription = originalSecond
  const talent = buildOperatorModuleComparison(profile, 3).rows.find((row) => row.id === 'talent:1')!
  assert.equal(talent.name, '悪巧み')
  assert.equal(talent.cells[0].text, originalSecond)
  assert.deepEqual(talent.cells[1], {
    text: `強化された悪巧み：${originalSecond}`,
    baseline: `悪巧み：${originalSecond}`,
  })
})

test('共有Lvより高い段階を勝手に選ばず、各モジュールの実際のLvと欠損を返す', () => {
  const profile = createProfile()
  profile.modules![0].phases = [profile.modules![0].phases![0], profile.modules![0].phases![2]]
  profile.modules![1].phases = [profile.modules![1].phases![1]]
  profile.modules!.push({ type: 'ADVANCED', uniEquipId: 'missing', uniEquipName: 'データ未取得' })
  let comparison = buildOperatorModuleComparison(profile, null)
  assert.deepEqual(comparison.levels, [1, 2, 3])
  assert.deepEqual(comparison.columns.map((column) => column.level), [null, 3, 2, null])
  assert.deepEqual(comparison.columns.map((column) => column.available), [true, true, true, false])
  assert.ok(comparison.rows.every((row) => row.cells[3].text === 'データなし'))
  comparison = buildOperatorModuleComparison(profile, 2)
  assert.deepEqual(comparison.columns.map((column) => column.level), [null, 1, 2, null])
  comparison = buildOperatorModuleComparison(profile, -1)
  assert.equal(comparison.level, 1)
  assert.deepEqual(comparison.columns.map((column) => column.level), [null, 1, null, null])
  assert.equal(comparison.columns[2].available, false)
  assert.equal(buildOperatorModuleComparison(profile, Number.NaN).level, 3)
  assert.equal(buildOperatorModuleComparison(profile, 99).level, 3)
})

test('存在しない共有Lvは直下へ戻し、段階番号省略時のLvも利用できる', () => {
  const profile = createProfile()
  profile.modules = [{
    type: 'ADVANCED', uniEquipName: '段階テスト',
    phases: [{ attributeBlackboard: { atk: 10 } }, { equipLevel: 3, attributeBlackboard: { atk: 30 } }],
  }]
  const comparison = buildOperatorModuleComparison(profile, 2)
  assert.deepEqual(comparison.levels, [1, 3])
  assert.equal(comparison.level, 1)
  assert.equal(comparison.columns[1].level, 1)
  assert.equal(comparison.rows.find((row) => row.id === 'attribute:atk')!.cells[1].text, '+10')
})

test('モジュールや表示効果がない場合も、元の効果と最終昇進条件を正しく返す', () => {
  const profile = createProfile()
  profile.modules = [{ type: 'INITIAL', uniEquipName: '記章' }]
  profile.phases = profile.phases.slice(0, 2)
  let comparison = buildOperatorModuleComparison(profile, 3)
  assert.equal(comparison.level, null)
  assert.deepEqual(comparison.levels, [])
  assert.equal(comparison.columns.length, 1)
  assert.equal(comparison.condition, '昇進1・潜在1')
  assert.deepEqual(comparison.rows.map((row) => row.id), ['trait'])

  comparison = buildOperatorModuleComparison({ phases: [], favorKeyFrames: [] }, null)
  assert.deepEqual(comparison.rows, [])
  assert.equal(comparison.condition, '昇進0・潜在1')
})

test('空の効果レコードを既知の変更なしとして表示しない', () => {
  const comparison = buildOperatorModuleComparison({
    phases: [], favorKeyFrames: [], modules: [
      { type: 'ADVANCED', uniEquipName: '空の効果', phases: [{ equipLevel: 1, parts: [] }] },
    ],
  }, null)
  assert.equal(comparison.columns[1].level, 1)
  assert.equal(comparison.columns[1].available, false)
  assert.deepEqual(comparison.rows[0].cells, [
    { text: '—', baseline: null }, { text: 'データなし', baseline: null },
  ])
})

function createProfile(): OperatorCombatProfile {
  return {
    phases: [{ maxLevel: 50 }, { maxLevel: 80 }, { maxLevel: 90 }],
    favorKeyFrames: [],
    traitDescription: '敵に<@ba.kw>範囲物理ダメージ</>を与える',
    talents: [
      { candidates: [{
        unlockCondition: { phase: 'PHASE_2', level: 1 },
        prefabKey: '1', name: '潜伏', description: originalFirst,
      }] },
      { candidates: [
        { unlockCondition: { phase: 'PHASE_2', level: 1 }, prefabKey: '2', name: '悪巧み', description: originalSecond },
        { unlockCondition: { phase: 'PHASE_2', level: 1 }, requiredPotentialRank: 4, prefabKey: '2', name: '悪巧み', description: '潜在強化後' },
      ] },
    ],
    potentialRanks: [{}, {}, {}, {}, {}],
    modules: [createModule('X'), createModule('Y')],
  }
}

function createModule(type: 'X' | 'Y'): RawOperatorModule {
  return {
    uniEquipId: `module-${type.toLowerCase()}`,
    uniEquipName: type === 'X' ? '傭兵の鞄' : '鈍い刃',
    type: 'ADVANCED', typeName1: 'ART', typeName2: type,
    phases: [1, 2, 3].map((level) => ({
      equipLevel: level,
      attributeBlackboard: { max_hp: 100 + 10 * level, atk: 20 * level },
      parts: [
        { overrideTraitDataBundle: { candidates: [{
          additionalDescription: type === 'X'
            ? 'ブロックされている敵を攻撃時、攻撃力が{atk_scale:0%}まで上昇'
            : '攻撃時、対象の防御力を{def_penetrate_fixed}無視',
          blackboard: { atk_scale: 1.1, def_penetrate_fixed: 100 },
        }] } },
        ...(level === 1 ? [] : [{ addOrOverrideTalentDataBundle: { candidates: [
          {
            talentIndex: type === 'X' ? 1 : 0,
            name: type === 'X' ? '悪巧み' : '潜伏',
            upgradeDescription: type === 'X'
              ? `攻撃範囲内のスタン状態の敵が受ける物理ダメージ+${level === 2 ? 21 : 24}%、敵を倒す度SP+1`
              : `配置から${level === 2 ? 10 : 8}秒後、物理回避と術回避+60%、敵に狙われにくくなる。攻撃力が上昇`,
          },
          { requiredPotentialRank: 4, talentIndex: type === 'X' ? 1 : 0, upgradeDescription: '潜在強化後のモジュール' },
        ] } }]),
      ],
    })),
  }
}
