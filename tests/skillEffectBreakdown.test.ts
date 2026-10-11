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

test('スルトS2の基本能力列はスキル中として補完し後置の単体条件を遡及しない', () => {
  const result = buildSkillEffectBreakdown(
    '攻撃力+120%、攻撃範囲+1マス、攻撃対象数+1\n攻撃対象が1体のみの場合、攻撃力が160%まで上昇',
    [], { metadata: { skillType: 'MANUAL', duration: 18 } },
  )
  const initial = ['attackPowerBonusRatio', 'attackRangeExtension', 'targetCountBonus']
  for (const key of initial) {
    const row = rowFor(result, key)
    assert.equal(row.timing, 'スキル中')
    assert.equal(row.condition, '—')
    assert.equal(row.target, key === 'attackPowerBonusRatio' ? '自身' : '自身の攻撃')
    assert.equal(row.status, 'parsed')
    assert.doesNotMatch(row.sourceText, /1体のみ/)
  }
  const multiplier = rowFor(result, 'attackPowerMultiplier')
  assert.equal(multiplier.effect?.value, 1.6)
  assert.equal(multiplier.condition, '攻撃対象が1体のみの場合')
  assert.equal(multiplier.sourceText, '攻撃対象が1体のみの場合、攻撃力が160%まで上昇')
  assert.deepEqual(result.rows.filter(row => row.effect).map(row => row.effect?.key), [...initial, 'attackPowerMultiplier'])
  assertSpans(result)
})

test('サリアS2の即時回復は対象prefixを結合し回復倍率と元変数を保持する', () => {
  const result = buildSkillEffectBreakdown(
    '範囲内の味方全員を治療し、対象のHPをサリアの攻撃力の{heal_scale:0%}回復',
    [{ key: 'heal_scale', value: 1.4 }], { metadata: { skillType: 'AUTO', duration: 0 } },
  )
  const healing = rowFor(result, 'attackBasedHealingMultiplier')
  assert.equal(healing.effect?.value, 1.4)
  assert.equal(healing.effect?.unit, 'multiplier')
  assert.equal(healing.effect?.sourceKey, 'heal_scale')
  assert.equal(healing.timing, '発動時')
  assert.equal(healing.condition, '—')
  assert.equal(healing.target, '範囲内の味方全員')
  assert.equal(healing.sourceText, result.description)
  assert.equal(healing.status, 'parsed')
  assertSpans(result)
})

test('HP回復と退場まで継続の文句を別の能力列にも共通適用する', () => {
  const result = buildSkillEffectBreakdown('自身のHPを最大値まで回復\n攻撃速度+20、攻撃力+70%、最大HP+1000\n退場まで効果継続')
  const healing = rowFor(result, 'hpRecoveryToMaximum')
  assert.equal(healing.timing, '発動時')
  assert.equal(healing.condition, '—')
  assert.equal(healing.target, '自身')
  for (const key of ['attackSpeedBonus', 'attackPowerBonusRatio', 'maxHpBonus']) {
    const row = rowFor(result, key)
    assert.equal(row.timing, 'スキル中')
    assert.equal(row.condition, '—')
    assert.equal(row.target, '自身')
  }
  assert.equal(rowFor(result, 'skillDurationMode').valueText, '退場まで')
  assertSpans(result)
})

test('異なるHP漸減文でも到達秒数を減少速度の条件に保ち独立持続時間へ変えない', () => {
  const result = buildSkillEffectBreakdown('自身のHPを最大値まで回復\n攻撃力+70%、HPが徐々に減少（減少割合は時間と共に増加し、45秒後に最大HPの15%/秒になる）\n退場まで効果継続')
  const loss = rowFor(result, 'maxHpLossRatioPerSecond')
  assert.equal(loss.effect?.value, 0.15)
  assert.match(`${loss.timing} ${loss.condition}`, /45秒後/)
  assert.equal(loss.target, '自身')
  assert.equal(result.rows.some(row => row.effect?.key === 'durationSeconds' || row.effect?.key === 'hpLossRateRampDurationSeconds'), false)
  assert.ok(result.rows.some(row => row.effect === null && row.status === 'partial'
    && /HPが徐々に減少/.test(row.sourceText) && /時間と共に増加/.test(row.sourceText)))
  assertSpans(result)
})

test('次回攻撃・パッシブ・不明な技能種別にmetadataの持続時間だけでスキル中を付けない', () => {
  for (const [description, skillType] of [
    ['次の通常攻撃時、攻撃力+50%', 'MANUAL'],
    ['攻撃力+50%', 'PASSIVE'],
    ['攻撃力+50%', 'UNKNOWN'],
  ]) {
    const result = buildSkillEffectBreakdown(description, [], { metadata: { skillType, duration: 30 } })
    assert.notEqual(rowFor(result, 'attackPowerBonusRatio').timing, 'スキル中', description)
    assertSpans(result)
  }
})

test('モードと段階のprefixは無条件の自身強化として補完しない', () => {
  for (const description of [
    'モード切替後、攻撃力+50%',
    '第1段階：攻撃力+20%；第2段階：攻撃力+40%、攻撃速度+30',
  ]) {
    const result = buildSkillEffectBreakdown(description, [], { metadata: { skillType: 'MANUAL', duration: 30 } })
    const stats = result.rows.filter(row => row.effect?.key === 'attackPowerBonusRatio' || row.effect?.key === 'attackSpeedBonus')
    assert.equal(stats.length, description.startsWith('第1段階') ? 3 : 1)
    for (const row of stats) assert.notEqual(row.condition, '—', row.sourceText)
    assertSpans(result)
  }
})

test('配置後の時間を持続型metadataによるスキル中で上書きしない', () => {
  for (const description of ['配置後10秒間、攻撃力+50%', '配置後10秒間攻撃力+50%']) {
    const result = buildSkillEffectBreakdown(description, [], { metadata: { skillType: 'MANUAL', duration: 30 } })
    assert.notEqual(rowFor(result, 'attackPowerBonusRatio').timing, 'スキル中')
    assertSpans(result)
  }
})

test('召喚物の能力値を自身にせず後続の明示した自身対象を使う', () => {
  const result = buildSkillEffectBreakdown('召喚物の攻撃力+50%、自身の攻撃速度+20', [], { metadata: { skillType: 'MANUAL', duration: 30 } })
  assert.notEqual(rowFor(result, 'attackPowerBonusRatio').target, '自身')
  assert.equal(rowFor(result, 'attackSpeedBonus').target, '自身')
  assertSpans(result)
})

test('範囲内味方の能力列を後半だけ自身へ切り替えない', () => {
  const result = buildSkillEffectBreakdown('範囲内の味方全員の攻撃力+20%、防御力+30%', [], { metadata: { skillType: 'MANUAL', duration: 30 } })
  for (const key of ['attackPowerBonusRatio', 'defenseBonusRatio']) {
    const row = rowFor(result, key)
    assert.ok(['範囲内の味方全員', '味方全員', '未解析'].includes(row.target), row.target)
  }
  assertSpans(result)
})

test('敵へのダメージに続く対象の防御低下を自身にしない', () => {
  const result = buildSkillEffectBreakdown('敵に攻撃力の200%の術ダメージを与え、対象の防御力-20%', [], { metadata: { skillType: 'MANUAL', duration: 30 } })
  assert.equal(rowFor(result, 'attackDamageMultiplier').effect?.value, 2)
  const defense = rowFor(result, 'defenseBonusRatio')
  assert.equal(defense.effect?.value, -0.2)
  assert.ok(['敵', '対象', '未解析'].includes(defense.target), defense.target)
  assertSpans(result)
})

test('同blockカンマは条件を継承するが新しい条件が現れたら旧条件を終了する', () => {
  const result = buildSkillEffectBreakdown('HPが50%以上の時、攻撃力+20%、攻撃速度+30、HPが30%以下の時、防御力+40%', [], { metadata: { skillType: 'MANUAL', duration: 30 } })
  assert.equal(rowFor(result, 'attackPowerBonusRatio').condition, 'HPが50%以上の時')
  assert.equal(rowFor(result, 'attackSpeedBonus').condition, 'HPが50%以上の時')
  const defense = rowFor(result, 'defenseBonusRatio')
  assert.equal(defense.condition, 'HPが30%以下の時')
  assert.doesNotMatch(defense.sourceText, /HPが50%以上/)
  assertSpans(result)
})

test('句点・改行・括弧の境界を越えて直前のHP条件を継承しない', () => {
  for (const description of [
    'HPが50%以上の時、攻撃力+20%。防御力+30%',
    'HPが50%以上の時、攻撃力+20%\n防御力+30%',
    'HPが50%以上の時、攻撃力+20%（防御力+30%）',
    '（HPが50%以上の時、攻撃力+20%）防御力+30%',
  ]) {
    const result = buildSkillEffectBreakdown(description, [], { metadata: { skillType: 'MANUAL', duration: 30 } })
    assert.equal(rowFor(result, 'attackPowerBonusRatio').condition, 'HPが50%以上の時')
    const defense = rowFor(result, 'defenseBonusRatio')
    assert.doesNotMatch(defense.condition, /HPが50%以上/)
    assert.doesNotMatch(defense.sourceText, /HPが50%以上/)
    assertSpans(result)
  }
})

test('未知prefixとOR条件をmetadataで無条件・自身へ昇格させず次の句点で終了する', () => {
  for (const prefix of ['未知の状態で', 'HPが50%以上の時またはHPが30%以下の時']) {
    const result = buildSkillEffectBreakdown(`${prefix}、攻撃力+20%、防御力+30%。攻撃速度+40`, [], { metadata: { skillType: 'MANUAL', duration: 30 } })
    for (const key of ['attackPowerBonusRatio', 'defenseBonusRatio']) {
      const row = rowFor(result, key)
      assert.equal(row.condition, '未解析')
      assert.equal(row.status, 'partial')
      assert.notEqual(row.target, '自身')
    }
    assert.ok(result.rows.some(row => row.sourceText.includes(prefix)))
    const speed = rowFor(result, 'attackSpeedBonus')
    assert.equal(speed.condition, '—')
    assert.equal(speed.timing, 'スキル中')
    assert.equal(speed.target, '自身')
    assertSpans(result)
  }
})

test('否定した攻撃対象数は生成せず後続の独立能力値へ否定を持ち越さない', () => {
  for (const description of ['攻撃対象数+2にはならない、攻撃力+20%', '攻撃対象数2にはならない、攻撃力+20%']) {
    const result = buildSkillEffectBreakdown(description, [], { metadata: { skillType: 'MANUAL', duration: 30 } })
    assert.equal(result.rows.some(row => row.effect?.key === 'targetCount' || row.effect?.key === 'targetCountBonus'), false)
    const attack = rowFor(result, 'attackPowerBonusRatio')
    assert.equal(attack.effect?.value, 0.2)
    assert.equal(attack.condition, '—')
    assert.equal(attack.target, '自身')
    assert.doesNotMatch(attack.sourceText, /ならない/)
    assert.ok(result.rows.some(row => row.effect === null && /にはならない/.test(row.sourceText)))
    assertSpans(result)
  }
})

test('metadata下でも未解決変数から数値効果を生成せず句点後の値とsourceKeyを保つ', () => {
  const result = buildSkillEffectBreakdown('攻撃力+{missing:0%}、防御力+30%。攻撃力+{atk:0%}', [{ key: 'atk', value: 0.2 }], { metadata: { skillType: 'MANUAL', duration: 30 } })
  assert.deepEqual(result.unresolvedPlaceholders, ['{missing:0%}'])
  assert.ok(result.rows.some(row => row.effect === null && row.sourceText.includes('{missing:0%}')))
  const attacks = result.rows.filter(row => row.effect?.key === 'attackPowerBonusRatio')
  assert.equal(attacks.length, 1)
  assert.equal(attacks[0].effect?.value, 0.2)
  assert.equal(attacks[0].effect?.sourceKey, 'atk')
  assert.equal(attacks[0].condition, '—')
  assert.equal(attacks[0].target, '自身')
  assert.equal(rowFor(result, 'defenseBonusRatio').effect?.value, 0.3)
  assertSpans(result)
})

test('繰り返した条件能力列は各出現の原文位置と元変数を保つ', () => {
  const clause = 'HPが50%以上の時、攻撃力+{atk:0%}、防御力+{def:0%}'
  const result = buildSkillEffectBreakdown(`${clause}。\n${clause}。`, [{ key: 'atk', value: 0.5 }, { key: 'def', value: 0.3 }], { metadata: { skillType: 'MANUAL', duration: 30 } })
  const rows = result.rows.filter(row => row.effect)
  assert.deepEqual(rows.map(row => [row.effect?.key, row.effect?.sourceKey]), [
    ['attackPowerBonusRatio', 'atk'], ['defenseBonusRatio', 'def'],
    ['attackPowerBonusRatio', 'atk'], ['defenseBonusRatio', 'def'],
  ])
  assert.equal(rows.every(row => row.condition === 'HPが50%以上の時'), true)
  assert.ok(rows[2].sourceStart > rows[0].sourceStart)
  assert.ok(rows[3].sourceStart > rows[1].sourceStart)
  assertSpans(result)
})

test('条件見出しだけの行は改行後の効果を無条件にせず原文に残す', () => {
  for (const newline of ['\n', '\r\n']) {
    const description = `HPが50%以上の時、${newline}攻撃力+50%`
    const result = buildSkillEffectBreakdown(description, [], { metadata: { skillType: 'MANUAL', duration: 30 } })
    const attack = rowFor(result, 'attackPowerBonusRatio')
    assert.equal(result.description, description)
    assert.equal(attack.effect?.value, 0.5)
    assert.ok(['HPが50%以上の時', '未解析'].includes(attack.condition), attack.condition)
    if (attack.condition === '未解析') {
      assert.equal(attack.status, 'partial')
      assert.ok(result.rows.some(row => row.effect === null && row.sourceText.includes('HPが50%以上の時')))
    } else {
      assert.equal(attack.sourceText, description)
    }
    assertSpans(result)
  }
})

test('味方対象だけの見出しは改行後の能力列を自身にしない', () => {
  const description = '範囲内の味方全員の\n攻撃力+20%、防御力+30%'
  const result = buildSkillEffectBreakdown(description, [], { metadata: { skillType: 'MANUAL', duration: 30 } })
  assert.equal(result.description, description)
  for (const key of ['attackPowerBonusRatio', 'defenseBonusRatio']) {
    const row = rowFor(result, key)
    assert.ok(['範囲内の味方全員', '味方全員', '未解析'].includes(row.target), row.target)
    if (row.target === '未解析') assert.equal(row.status, 'partial')
  }
  assert.ok(result.rows.some(row => row.sourceText.includes('範囲内の味方全員の')))
  assertSpans(result)
})

test('段階見出しだけの行は後続数値を無条件にせず各見出しを保持する', () => {
  const description = '第1段階：\n攻撃力+20%\n第2段階：\n攻撃力+40%'
  const result = buildSkillEffectBreakdown(description, [], { metadata: { skillType: 'MANUAL', duration: 30 } })
  assert.equal(result.description, description.replaceAll('：', ':'))
  const attacks = result.rows.filter(row => row.effect?.key === 'attackPowerBonusRatio')
  assert.deepEqual(attacks.map(row => row.effect?.value), [0.2, 0.4])
  for (const [index, row] of attacks.entries()) {
    const heading = `第${index + 1}段階`
    assert.notEqual(row.condition, '—')
    assert.ok(result.rows.some(source => source.sourceText.includes(heading)))
    if (row.condition === '未解析') {
      assert.equal(row.status, 'partial')
      assert.ok(result.rows.some(source => source.effect === null && source.sourceText.includes(heading)))
    }
  }
  assertSpans(result)
})

test('配置後時間だけの見出しを改行後にmetadataのスキル中へ置き換えない', () => {
  const description = '配置後10秒間、\n攻撃力+50%'
  const result = buildSkillEffectBreakdown(description, [], { metadata: { skillType: 'MANUAL', duration: 30 } })
  const attack = rowFor(result, 'attackPowerBonusRatio')
  assert.equal(result.description, description)
  assert.notEqual(attack.timing, 'スキル中')
  assert.ok(result.rows.some(row => row.sourceText.includes('配置後10秒間')))
  if (attack.timing === '未解析') assert.equal(attack.status, 'partial')
  assertSpans(result)
})

test('未知条件の見出しは改行後でもpartialと未解析の原文を残す', () => {
  const description = '未知の状態では、\n攻撃力+50%'
  const result = buildSkillEffectBreakdown(description, [], { metadata: { skillType: 'MANUAL', duration: 30 } })
  const attack = rowFor(result, 'attackPowerBonusRatio')
  assert.equal(result.description, description)
  assert.equal(attack.condition, '未解析')
  assert.equal(attack.status, 'partial')
  assert.ok(result.rows.some(row => row.effect === null && row.sourceText.includes('未知の状態では')))
  assertSpans(result)
})

test('直後の括弧条件を無条件の自身効果にせず条件の原文を保持する', () => {
  for (const condition of ['HPが50%以上の時のみ', '特殊な敵が存在する場合のみ']) {
    const description = `攻撃力+50%（${condition}）`
    const result = buildSkillEffectBreakdown(description, [], { metadata: { skillType: 'MANUAL', duration: 30 } })
    const attack = rowFor(result, 'attackPowerBonusRatio')
    assert.equal(result.description, description)
    assert.notEqual(attack.condition, '—')
    assert.ok(result.rows.some(row => row.sourceText.includes(condition)))
    if (attack.condition === '未解析') {
      assert.equal(attack.status, 'partial')
      assert.ok(result.rows.some(row => row.effect === null && row.sourceText.includes(condition)))
    } else {
      assert.match(attack.sourceText, /（.*）$/)
    }
    assertSpans(result)
  }
})

test('後置括弧条件を結び付けた効果の後の独立行へ条件を持ち越さない', () => {
  const description = '攻撃力+50%（HPが50%以上の時のみ）\n防御力+30%'
  const result = buildSkillEffectBreakdown(description, [], { metadata: { skillType: 'MANUAL', duration: 30 } })
  assert.notEqual(rowFor(result, 'attackPowerBonusRatio').condition, '—')
  const defense = rowFor(result, 'defenseBonusRatio')
  assert.equal(defense.condition, '—')
  assert.equal(defense.target, '自身')
  assert.doesNotMatch(defense.sourceText, /HPが50%以上/)
  assertSpans(result)
})

test('サリア型の回復倍率にも後置括弧条件を保持し即時無条件回復へ補完しない', () => {
  const result = buildSkillEffectBreakdown(
    '範囲内の味方全員を治療し、対象のHPをサリアの攻撃力の{heal_scale:0%}回復（対象のHPが50%以下の時のみ）',
    [{ key: 'heal_scale', value: 1.4 }], { metadata: { skillType: 'AUTO', duration: 0 } },
  )
  const healing = rowFor(result, 'attackBasedHealingMultiplier')
  assert.equal(healing.effect?.value, 1.4)
  assert.equal(healing.effect?.sourceKey, 'heal_scale')
  assert.notEqual(healing.condition, '—')
  assert.ok(['範囲内の味方全員', '味方全員', '未解析'].includes(healing.target), healing.target)
  assert.ok(result.rows.some(row => row.sourceText.includes('範囲内の味方全員を治療し')))
  assert.ok(result.rows.some(row => row.sourceText.includes('対象のHPが50%以下の時のみ')))
  if (healing.condition === '未解析') {
    assert.equal(healing.status, 'partial')
    assert.ok(result.rows.some(row => row.effect === null && row.sourceText.includes('対象のHPが50%以下の時のみ')))
  }
  assertSpans(result)
})
