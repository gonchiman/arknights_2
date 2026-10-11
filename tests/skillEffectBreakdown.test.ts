import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSkillEffectBreakdown } from '../src/lib/skillEffectBreakdown.ts'

const SURTR = '自身のHPを最大値まで回復\n攻撃力<@ba.vup>+{atk:0%}</>、攻撃範囲<@ba.vup>+{ability_range_forward_extend}</>マス、攻撃対象数<@ba.vup>+3</>、最大HP<@ba.vup>+{max_hp}</>、HPが徐々に減少（減少割合は時間と共に増加し、<@ba.vup>{duration}</>秒後に最大HPの{hp_ratio:0%}/秒になる）\n<@ba.rem>退場まで効果継続</>'
const SURTR_BLACKBOARD = [
  { key: 'atk', value: 3.3 }, { key: 'ability_range_forward_extend', value: 2 },
  { key: 'max_hp', value: 5000 }, { key: 'duration', value: 60 },
  { key: 'hp_ratio', value: 0.2 }, { key: 'interval', value: 0.2 },
  { key: 'attack@max_target', value: 4 },
]
const ASH = '直ちに第一素質を発動し、通常攻撃の間隔を<@ba.vup>大幅に短縮</>する。<$ba.stun>スタン</>状態の敵を攻撃する時、攻撃力が<@ba.vup>{ash_s_2[atk_scale].atk_scale:0%}</>まで上昇\n<@ba.rem>合計31発の銃弾を撃ち切るとスキルが終了（手動でスキルを停止可能）</>'

function rowFor(result: ReturnType<typeof buildSkillEffectBreakdown>, key: string) {
  const row = result.rows.find(row => row.effect?.key === key)
  assert.ok(row, key)
  return row
}

function assertSpans(result: ReturnType<typeof buildSkillEffectBreakdown>) {
  assert.equal(new Set(result.rows.map(row => row.id)).size, result.rows.length)
  for (const row of result.rows) {
    assert.equal(result.description.slice(row.sourceStart, row.sourceEnd), row.sourceText)
    assert.ok(row.sourceEnd > row.sourceStart)
    assert.ok(row.sourceStart >= 0 && row.sourceEnd <= result.description.length)
  }
}

test('スルトS3特化3の加算・定性回復・持続を元変数とともに分解する', () => {
  const result = buildSkillEffectBreakdown(SURTR, SURTR_BLACKBOARD)
  assert.doesNotMatch(result.description, /<[^>]+>|\{[^}]+\}/)
  assert.deepEqual(result.unresolvedPlaceholders, [])
  const attack = rowFor(result, 'attackPowerBonusRatio')
  assert.equal(attack.effect?.value, 3.3)
  assert.equal(attack.effect?.unit, 'ratio')
  assert.equal(attack.effect?.sourceKey, 'atk')
  assert.equal(attack.operation, '加算')
  assert.equal(attack.valueText, '+330%')
  assert.equal(attack.label, '攻撃力')
  assert.equal(attack.effect?.label, '攻撃力の加算割合')
  assert.equal(attack.timing, 'スキル中')
  assert.equal(attack.condition, '—')
  assert.equal(attack.target, '自身')
  assert.equal(attack.status, 'parsed')
  assert.equal(rowFor(result, 'targetCountBonus').effect?.value, 3)
  assert.equal(rowFor(result, 'maxHpBonus').effect?.value, 5000)
  const heal = rowFor(result, 'hpRecoveryToMaximum')
  assert.equal(heal.target, '自身')
  assert.equal(heal.effect?.value, '最大値まで')
  assert.equal(heal.operation, '回復')
  assert.equal(heal.timing, '発動時')
  assert.equal(rowFor(result, 'skillDurationMode').valueText, '退場まで')
  assertSpans(result)
})

test('60秒は最終HP減少速度20%/秒の到達条件に結合し持続時間の行にしない', () => {
  const result = buildSkillEffectBreakdown(SURTR, SURTR_BLACKBOARD)
  const loss = rowFor(result, 'maxHpLossRatioPerSecond')
  assert.equal(loss.effect?.value, 0.2)
  assert.equal(loss.effect?.sourceKey, 'hp_ratio')
  assert.equal(loss.valueText, '20%/秒')
  assert.match(`${loss.timing} ${loss.condition}`, /60秒後/)
  assert.equal(loss.sourceText, '60秒後に最大HPの20%/秒になる')
  assert.equal(result.rows.some(row => row.effect?.key === 'hpLossRateRampDurationSeconds'), false)
  assert.equal(result.effects.some(effect => effect.key === 'hpLossRateRampDurationSeconds' && effect.value === 60), true)
  assert.equal(result.rows.some(row => row.effect?.key === 'durationSeconds'), false)
  assert.ok(result.rows.some(row => row.status === 'partial' && row.effect === null && /HPが徐々に減少/.test(row.sourceText)
    && /時間と共に増加/.test(row.sourceText) && /になる）$/.test(row.sourceText)))
  assert.equal(result.rows.some(row => row.valueText === '0.2秒'), false)
})

test('Ash S2はスタン敵の条件を倍率行に保持し定性間隔に隠れた数値を挿入しない', () => {
  const result = buildSkillEffectBreakdown(ASH, [
    { key: 'base_attack_time', value: -0.8 }, { key: 'ash_s_2[atk_scale].atk_scale', value: 2.5 },
  ])
  const attack = rowFor(result, 'attackPowerMultiplier')
  assert.equal(attack.effect?.value, 2.5)
  assert.equal(attack.effect?.unit, 'multiplier')
  assert.equal(attack.effect?.sourceKey, 'ash_s_2[atk_scale].atk_scale')
  assert.match(attack.condition, /スタン状態の敵を攻撃する時/)
  assert.match(attack.sourceText, /^スタン状態の敵を攻撃する時、攻撃力が250%まで上昇$/)
  assert.equal(attack.timing, '攻撃時')
  assert.equal(attack.operation, '乗算')
  const interval = rowFor(result, 'attackIntervalChange')
  assert.equal(typeof interval.effect?.value, 'string')
  assert.equal(interval.effect?.sourceKey, null)
  assert.doesNotMatch(interval.valueText, /0\.8/)
  assert.ok(rowFor(result, 'firstTalentActivation'))
  assert.doesNotMatch(rowFor(result, 'skillAmmoCount').condition, /スタン/)
  assert.doesNotMatch(rowFor(result, 'manualSkillStop').condition, /スタン/)
  assertSpans(result)
})

test('HP閾値条件を同じ文の複数の効果に引き継ぐ', () => {
  const result = buildSkillEffectBreakdown('HPが50%以上の時、攻撃力+50%、防御力+30%')
  for (const key of ['attackPowerBonusRatio', 'defenseBonusRatio']) {
    const row = rowFor(result, key)
    assert.equal(row.condition, 'HPが50%以上の時')
    assert.match(row.sourceText, /^HPが50%以上の時/)
  }
  assertSpans(result)
})

test('効果を挟まない連続した既知条件は両方を倍率行へ結び付ける', () => {
  const result = buildSkillEffectBreakdown('HPが50%以上の時、スタン状態の敵を攻撃する時、攻撃力が250%まで上昇')
  const attack = rowFor(result, 'attackPowerMultiplier')
  assert.match(attack.condition, /HPが50%以上の時/)
  assert.match(attack.condition, /スタン状態の敵を攻撃する時/)
  assert.equal(attack.sourceText, result.description)
  assertSpans(result)
})

test('明示したAND結合は両条件を残し未知の結合語は複合条件全体を未解析にする', () => {
  for (const join of ['かつ', 'および', '及び', '且つ']) {
    const result = buildSkillEffectBreakdown(`HPが50%以上の時${join}スタン状態の敵を攻撃する時、対象の攻撃力+50%`)
    const row = rowFor(result, 'attackPowerBonusRatio')
    assert.match(row.condition, /HPが50%以上の時/)
    assert.match(row.condition, /スタン状態の敵を攻撃する時/)
    assert.match(row.sourceText, /^HPが50%以上の時/)
    assertSpans(result)
  }
  for (const description of [
    'HPが50%以上の時という特殊な前提でスタン状態の敵を攻撃する時、対象の攻撃力+50%',
    'HPが50%以上の時またはスタン状態の敵を攻撃する時、対象の攻撃力+50%',
    '特殊な前提でHPが50%以上の時、対象の攻撃力+50%',
  ]) {
    const result = buildSkillEffectBreakdown(description)
    const row = rowFor(result, 'attackPowerBonusRatio')
    assert.equal(row.condition, '未解析')
    assert.equal(row.status, 'partial')
    assert.equal(row.sourceText, description)
    assertSpans(result)
  }
})

test('明示された対象をスタンさせる句を対象列にまとめる', () => {
  const result = buildSkillEffectBreakdown('対象を1秒間スタンさせる。味方全員の攻撃力+20%')
  const stun = rowFor(result, 'stunDurationSeconds')
  assert.equal(stun.target, '対象')
  assert.equal(stun.sourceText, '対象を1秒間スタンさせる')
  assert.equal(rowFor(result, 'attackPowerBonusRatio').target, '味方全員')
  assert.equal(result.rows.some(row => row.effect === null && row.sourceText === '対象を'), false)
  assertSpans(result)
})

test('未知条件を含む複合prefixは既知HP条件だけで解析完了にしない', () => {
  const result = buildSkillEffectBreakdown('特殊な条件が成立した時、HPが50%以上の時、対象の攻撃力+50%')
  const attack = rowFor(result, 'attackPowerBonusRatio')
  assert.equal(attack.condition, '未解析')
  assert.equal(attack.status, 'partial')
  assert.match(attack.sourceText, /^特殊な条件が成立した時、HPが50%以上の時/)
  assert.ok(result.rows.some(row => row.effect === null && /特殊な条件/.test(row.sourceText)))
  assertSpans(result)
})

test('既知の自身HP漸増型へ未知条件を加えた原文では自身・無条件を補完しない', () => {
  const result = buildSkillEffectBreakdown(`未知の条件が成立した場合、${SURTR}`, SURTR_BLACKBOARD)
  const attack = rowFor(result, 'attackPowerBonusRatio')
  assert.equal(attack.target, '未解析')
  assert.equal(attack.condition, '未解析')
  assert.equal(attack.timing, '未解析')
  assert.equal(attack.status, 'partial')
  assert.ok(result.rows.some(row => row.effect === null && row.sourceText === '未知の条件が成立した場合'))
  assertSpans(result)
})

test('句点で条件・対象を区切り敵の効果を味方へ誤継承しない', () => {
  const result = buildSkillEffectBreakdown('スタン状態の敵を攻撃する時、攻撃力が250%まで上昇。味方全員の攻撃力+20%')
  const first = rowFor(result, 'attackPowerMultiplier')
  const second = rowFor(result, 'attackPowerBonusRatio')
  assert.match(first.condition, /スタン/)
  assert.doesNotMatch(second.condition, /スタン/)
  assert.equal(second.target, '味方全員')
  assert.doesNotMatch(second.sourceText, /スタン/)
  assertSpans(result)
})

test('未知条件や対象は効果を自身・無条件として断定せず原文の行を残す', () => {
  const result = buildSkillEffectBreakdown('特殊な敵が存在する場合、攻撃力+50%')
  const row = rowFor(result, 'attackPowerBonusRatio')
  assert.equal(row.condition, '未解析')
  assert.equal(row.target, '未解析')
  assert.equal(row.status, 'partial')
  assert.ok(result.rows.some(row => row.status === 'unparsed' && row.sourceText === '特殊な敵が存在する場合'))
  assertSpans(result)
})

test('手動停止の定型句も直前の既知・未知条件を消さない', () => {
  const unknown = buildSkillEffectBreakdown('特殊な条件が成立した場合、手動でスキルを停止可能')
  const stop = rowFor(unknown, 'manualSkillStop')
  assert.equal(stop.condition, '未解析')
  assert.equal(stop.status, 'partial')
  assert.match(stop.sourceText, /^特殊な条件/)
  const known = buildSkillEffectBreakdown('HPが50%以上の時、手動でスキルを停止可能')
  assert.match(rowFor(known, 'manualSkillStop').condition, /HPが50%以上の時/)
  assertSpans(unknown)
  assertSpans(known)
})

test('同値の複数出現はそれぞれの元blackboardキーと原文位置を持つ', () => {
  const result = buildSkillEffectBreakdown('攻撃力+{a:0%}。攻撃力+50%。攻撃力+{b:0%}。', [
    { key: 'a', value: 0.5 }, { key: 'b', value: 0.5 },
  ])
  const rows = result.rows.filter(row => row.effect?.key === 'attackPowerBonusRatio')
  assert.deepEqual(rows.map(row => row.effect?.sourceKey), ['a', null, 'b'])
  assert.equal(new Set(rows.map(row => row.sourceStart)).size, 3)
  assertSpans(result)
})

test('一つの原文から複数効果が出た場合は同じ原文範囲を共有する', () => {
  const result = buildSkillEffectBreakdown('攻撃力と防御力+50%。攻撃力と防御力+30%。')
  const rows = result.rows.filter(row => row.effect)
  assert.equal(rows.length, 4)
  assert.equal(rows[0].sourceStart, rows[1].sourceStart)
  assert.equal(rows[2].sourceStart, rows[3].sourceStart)
  assert.notEqual(rows[0].sourceStart, rows[2].sourceStart)
  assert.deepEqual(rows.map(row => row.effect?.key), ['attackPowerBonusRatio', 'defenseBonusRatio', 'attackPowerBonusRatio', 'defenseBonusRatio'])
  assertSpans(result)
})

test('未解決・NaN・無限大は原文に残し推測した数値行を作らない', () => {
  for (const value of [undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = buildSkillEffectBreakdown('攻撃力+{missing:0%}。攻撃力+20%。', value === undefined ? [] : [{ key: 'missing', value }])
    assert.deepEqual(result.unresolvedPlaceholders, ['{missing:0%}'])
    assert.ok(result.rows.some(row => row.status === 'unparsed' && row.sourceText.includes('{missing:0%}')))
    assert.deepEqual(result.rows.flatMap(row => row.effect?.key === 'attackPowerBonusRatio' ? [row.effect.value] : []), [0.2])
    assertSpans(result)
  }
})

test('既存parserが否定した数値句と定性句を肯定の効果へ変えない', () => {
  for (const description of [
    '自身のHPを最大値まで回復しない',
    '自身のHPを最大値まで回復する場合',
    '直ちに第一素質を発動しない',
    '直ちに第一素質を発動しなかった',
    '自身のHPを最大値まで回復することはない',
    '自身のHPを最大値まで回復するわけではない',
    '通常攻撃の間隔を大幅に短縮することがない',
    '攻撃力+50%にはならない',
  ]) {
    const result = buildSkillEffectBreakdown(description)
    assert.equal(result.rows.every(row => row.effect === null), true, description)
    assert.equal(result.rows.map(row => row.sourceText).join(''), description)
    assertSpans(result)
  }
})

test('全く未知の原文も未解析行として残す', () => {
  const result = buildSkillEffectBreakdown('未知の力を獲得する\n敵が踊り始める')
  assert.deepEqual(result.rows.map(row => row.sourceText), ['未知の力を獲得する', '敵が踊り始める'])
  assert.equal(result.rows.every(row => row.status === 'unparsed' && row.operation === '未解析'), true)
  assertSpans(result)
})

test('表示対象の全角数字・markupを正規化して原文spanを対応させる', () => {
  const result = buildSkillEffectBreakdown('<@ba.vup>攻撃力＋５０％</><br/>最大HP＋５０００')
  assert.equal(result.description, '攻撃力+50%\n最大HP+5000')
  assert.equal(rowFor(result, 'attackPowerBonusRatio').valueText, '+50%')
  assert.equal(rowFor(result, 'maxHpBonus').effect?.value, 5000)
  assertSpans(result)
})

test('空文は空行一覧となる', () => {
  const result = buildSkillEffectBreakdown('  \n ')
  assert.equal(result.description, '')
  assert.deepEqual(result.rows, [])
  assert.deepEqual(result.effects, [])
  assert.deepEqual(result.unresolvedPlaceholders, [])
})
