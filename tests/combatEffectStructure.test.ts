import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveCombatNumericValue, evaluateCombatCondition, resolveCombatProbability,
  formatCombatCondition, formatCombatRecipient, formatCombatDamageKind,
  getCombatContextDefinitionRows, getCombatDotDefinitionRows, getCombatNumericDefinitionRows,
  type CombatNumericValue, type CombatCondition, type CombatEffectContext, type CombatDamageOverTime,
} from '../src/lib/combatEffectStructure.ts'
import { formatTalentStructureEffectValue, getTalentStructureEffectDefinitionRows, type TalentStructureEffect } from '../src/lib/talentStructure.ts'

// These source-based samples exercise shared primitives only; they do not register new supported OPs.
test('ガヴィル型の基礎10%＋ブロック数×4%は上限を創作せず、欠損や演算overflowを値へ混ぜない', () => {
  const value: CombatNumericValue = { type: 'AFFINE', base: 0.1, coefficient: 0.04, metric: 'source.blockCount' }
  for (const [count, expected] of [[0, 0.1], [2, 0.18], [10, 0.5], [100, 4.1]]) {
    assert.ok(Math.abs(resolveCombatNumericValue(value, { 'source.blockCount': count })! - expected) < 1e-12)
  }
  assert.equal(resolveCombatNumericValue(value, {}), null)
  assert.equal(resolveCombatNumericValue({ ...value, coefficient: null }, { 'source.blockCount': 2 }), null)
  assert.equal(resolveCombatNumericValue({ ...value, max: null }, { 'source.blockCount': 2 }), null)
  assert.equal(resolveCombatNumericValue({ ...value, min: 0, max: 0.3 }, { 'source.blockCount': 10 }), 0.3)
  assert.equal(resolveCombatNumericValue({ ...value, min: 1, max: 0 }, { 'source.blockCount': 0 }), null)
  assert.equal(resolveCombatNumericValue({ ...value, coefficient: 1e308 }, { 'source.blockCount': 1e308 }), null)
  assert.ok(getCombatNumericDefinitionRows(value).some(([label, text]) => label === '値の上限' && text === '上限なし'))
  const effect: TalentStructureEffect = { ...baseContext(), item: 'ATK_BUFF_RATIO', operation: 'ADD_RATIO', unit: 'RATIO', value }
  assert.equal(formatTalentStructureEffectValue(effect), '（10＋4×自身のブロック数）％')
  const rows = getTalentStructureEffectDefinitionRows(effect)
  assert.ok(rows.some(([label, text]) => label === '単位' && text === 'RATIO'))
  assert.ok(rows.some(([label, text]) => label === '項目キー' && text === 'ATK_BUFF_RATIO'))
  assert.ok(rows.some(([label, text]) => label === '演算コード' && text === 'ADD_RATIO'))
})

test('ALL/ANYを合成した条件は境界を区別し、未知入力をfalseや反対分岐へ読み替えない', () => {
  const condition: CombatCondition = { type: 'ALL', conditions: [
    { type: 'COMPARE', metric: 'source.hpRatio', comparison: 'LTE', value: 0.5 },
    { type: 'ANY', conditions: [
      { type: 'COMPARE', metric: 'target.isBlocked', comparison: 'EQ', value: false },
      { type: 'COMPARE', metric: 'target.canUseRangedAttack', comparison: 'EQ', value: true },
    ] },
  ] }
  assert.equal(evaluateCombatCondition(condition, { 'source.hpRatio': 0.5, 'target.isBlocked': false }), true)
  assert.equal(evaluateCombatCondition(condition, { 'source.hpRatio': 0.50001, 'target.isBlocked': false }), false)
  assert.equal(evaluateCombatCondition(condition, { 'source.hpRatio': 0.5 }), null)
  assert.equal(evaluateCombatCondition(condition, { 'source.hpRatio': 0.5, 'target.isBlocked': true, 'target.canUseRangedAttack': false }), false)
  assert.equal(evaluateCombatCondition({ type: 'UNKNOWN', reason: '未検証' }, {}), null)
  assert.equal(evaluateCombatCondition({ type: 'ALL', conditions: [] }, {}), null)
  assert.equal(evaluateCombatCondition({ type: 'COMPARE', metric: 'source.hpRatio', comparison: 'GT', value: 0 }, { 'source.hpRatio': Infinity }), null)
  const rows = getCombatContextDefinitionRows({ ...baseContext(), condition })
  assert.ok(rows.some(([label, value]) => label === '条件2.1の指標' && value === 'target.isBlocked'))
  assert.match(formatCombatCondition(condition), /かつ.*または/)
})

test('適用確率は条件・tick確率と分離し、0と1を有効な値として保つ', () => {
  for (const chance of [0, 0.25, 1]) assert.equal(resolveCombatProbability({ chance, rollScope: 'APPLICATION' }), chance)
  for (const chance of [null, -0.01, 1.01, NaN, Infinity]) assert.equal(resolveCombatProbability({ chance, rollScope: 'APPLICATION' }), null)
  const effect = { ...baseContext(), probability: { chance: 0.25, rollScope: 'APPLICATION' as const, sharedRollId: 'same-attack' } }
  const rows = getCombatContextDefinitionRows(effect)
  assert.deepEqual(effect.condition, null)
  assert.ok(rows.some(([label, value]) => label === '発動確率' && value === '25％'))
  assert.ok(rows.some(([label, value]) => label === '抽選単位' && value === 'APPLICATION'))
  assert.ok(rows.some(([label, value]) => label === '共有する抽選' && value === 'same-attack'))
})

test('対象は陣営・タグ・自己除外・ランダム数・母集団を独立に持ち、効果元の編成状態と混ぜない', () => {
  const effect: CombatEffectContext = { ...baseContext(), timing: { type: 'CONTINUOUS', while: 'IN_SQUAD' }, target: {
    type: 'RECIPIENTS', side: 'ALLY', entity: 'UNIT', scope: 'ATTACK_RANGE', includeSelf: false,
    factionIds: ['faction_x', 'faction_y'], tagIds: ['medic'], filterLabels: { faction_x: '陣営X', faction_y: '陣営Y', medic: '医療' }, selection: { type: 'RANDOM', count: 1 },
  } }
  const rows = getCombatContextDefinitionRows(effect)
  for (const pair of [['効果元の有効状態', 'IN_SQUAD'], ['対象の母集団', 'ATTACK_RANGE'], ['対象の側', 'ALLY'], ['自身を含む', 'いいえ'], ['対象の選び方', 'RANDOM'], ['選択数', 1]]) assert.ok(rows.some(row => row[0] === pair[0] && row[1] === pair[1]))
  assert.match(formatCombatRecipient(effect.target), /陣営X.*陣営Y.*医療.*ランダム1体.*自身を除く/)
  // Specter alter's substitute range can retain the source's explicit range reference.
  const custom = { ...effect, target: { ...effect.target, scope: 'CUSTOM_RANGE' as const, rangeId: 'x-4' } }
  assert.ok(getCombatContextDefinitionRows(custom).some(([label, value]) => label === '範囲ID' && value === 'x-4'))
})

test('固定毎秒量・ATK倍率・持続・明示tick・重複は独立し、説明の毎秒から内部tickを推定しない', () => {
  // Blue Poison's raw duration is 3.1, though the description says 3 seconds.
  const fixed: CombatDamageOverTime = { ...baseDot(), amount: { basis: 'FIXED', value: 75, referenceTime: 'NOT_APPLICABLE' }, duration: { type: 'FIXED_SECONDS', seconds: 3.1 } }
  assert.ok(getCombatDotDefinitionRows(fixed).some(([label, value]) => label === '持続時間（秒）' && value === 3.1))
  assert.deepEqual(fixed.cadence, { intervalSeconds: null, firstTickSeconds: null })
  // Ascalon's explicit interval/max-stack data do not resolve ATK snapshot timing or refresh.
  const atkBased: CombatDamageOverTime = { ...baseDot(), amount: { basis: 'ATK_RATIO', ratio: 0.1, reference: 'SOURCE', referenceTime: 'UNSPECIFIED' },
    duration: { type: 'FIXED_SECONDS', seconds: 25 }, cadence: { intervalSeconds: 1, firstTickSeconds: null }, stacking: { mode: 'ADD_STACKS', maxStacks: 3 } }
  const rows = getCombatDotDefinitionRows(atkBased)
  for (const pair of [['量の基準', 'ATK_RATIO'], ['攻撃力倍率', 0.1], ['参照時点', 'UNSPECIFIED'], ['処理間隔（秒）', 1], ['初回ダメージの時刻（秒）', '未確定'], ['最大重複数', 3], ['再付与時の更新', 'UNSPECIFIED']]) assert.ok(rows.some(row => row[0] === pair[0] && row[1] === pair[1]))
  assert.equal('value' in atkBased, false)
})

test('通常の術/物理/確定、元素ダメージ、元素損傷を区別し、状態終了までの寿命も表せる', () => {
  for (const [damageType, label] of [['PHYSICAL', '物理'], ['ARTS', '術'], ['TRUE', '確定']] as const) assert.equal(formatCombatDamageKind({ type: 'ORDINARY', damageType }), label)
  const nymph: CombatDamageOverTime = { ...baseDot(), kind: { type: 'ELEMENTAL_DAMAGE', elementId: 'necro' },
    amount: { basis: 'ATK_RATIO', ratio: 0.4, reference: 'SOURCE', referenceTime: 'UNSPECIFIED' },
    duration: { type: 'WHILE_CONDITION', condition: { type: 'COMPARE', metric: 'target.inNecroBurst', comparison: 'EQ', value: true } } }
  const bobbing: CombatDamageOverTime = { ...baseDot(), kind: { type: 'ELEMENTAL_BUILDUP', elementId: 'burn' },
    amount: { basis: 'ATK_RATIO', ratio: 0.16, reference: 'SOURCE', referenceTime: 'UNSPECIFIED' }, duration: { type: 'FIXED_SECONDS', seconds: 5 } }
  assert.equal(formatCombatDamageKind(nymph.kind), 'necro：元素ダメージ')
  assert.equal(formatCombatDamageKind(bobbing.kind), 'burn：元素損傷')
  assert.ok(getCombatDotDefinitionRows(nymph).some(([label, value]) => label === '持続条件の指標' && value === 'target.inNecroBurst'))
  const oncePerTarget: CombatEffectContext = { ...baseContext(), restrictions: [{ type: 'APPLICATION_LIMIT', count: 1, scope: 'TARGET', reset: 'UNSPECIFIED' }, { type: 'EXCLUDE_MODIFIER', modifier: 'TRAIT_ATTACK_SCALE' }] }
  const rows = getCombatContextDefinitionRows(oncePerTarget)
  assert.ok(rows.some(([label, value]) => label === '制約1の上限回数' && value === 1))
  assert.ok(rows.some(([label, value]) => label === '制約1のリセット' && value === 'UNSPECIFIED'))
  assert.ok(rows.some(([label, value]) => label === '制約2で除外する補正' && value === 'TRAIT_ATTACK_SCALE'))
})

function baseContext(): CombatEffectContext {
  return { id: 'sample-only', timing: { type: 'EVENT', event: 'ATTACK' }, condition: null,
    target: { type: 'RECIPIENTS', side: 'SELF', entity: 'UNIT', scope: 'SELF', includeSelf: true, factionIds: [], tagIds: [], selection: { type: 'ALL' } },
    probability: { chance: 1, rollScope: 'APPLICATION' }, lifetime: { type: 'CURRENT_EVENT' }, restrictions: [], sourceBinding: 'sample:source' }
}
function baseDot(): CombatDamageOverTime {
  return { kind: { type: 'ORDINARY', damageType: 'ARTS' }, amount: { basis: 'FIXED', value: 125, referenceTime: 'NOT_APPLICABLE' }, rate: 'PER_SECOND',
    duration: { type: 'FIXED_SECONDS', seconds: 3 }, cadence: { intervalSeconds: null, firstTickSeconds: null }, stacking: { mode: 'UNSPECIFIED', maxStacks: null }, refresh: 'UNSPECIFIED' }
}
