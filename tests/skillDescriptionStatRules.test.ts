import test from 'node:test'
import assert from 'node:assert/strict'
import { convertSkillDescription } from '../src/lib/skillDescriptionEffects.ts'

function values(description: string, key: string) {
  return convertSkillDescription(description).effects.filter((effect) => effect.key === key).map((effect) => effect.value)
}

test('stat percentages distinguish additive changes, multipliers, and exact values', () => {
  assert.deepEqual(values('攻撃力が150%まで上昇、防御力が0になり、最大HP+5000', 'attackPowerMultiplier'), [1.5])
  assert.deepEqual(values('攻撃力が150%まで上昇', 'attackPowerBonusRatio'), [])
  assert.deepEqual(values('防御力が0になり', 'defenseSetValue'), [0])
  assert.deepEqual(values('最大HP+5000', 'maxHpBonus'), [5000])
  assert.deepEqual(values('攻撃速度+20%、術耐性+50%、術耐性+5', 'attackSpeedBonusRatio'), [0.2])
  assert.deepEqual(values('術耐性+50%、術耐性+5', 'resistanceBonusRatio'), [0.5])
  assert.deepEqual(values('術耐性+50%、術耐性+5', 'resistanceBonus'), [5])
})

test('compound stats and timed debuffs keep independent source keys', () => {
  const result = convertSkillDescription('敵の攻撃速度を{duration}秒間-{slow}、防御力と術耐性-{debuff:0%}', [
    { key: 'duration', value: 3 }, { key: 'slow', value: 20 }, { key: 'debuff', value: 0.5 },
  ])
  for (const [key, value, sourceKey] of [
    ['statChangeDurationSeconds', 3, 'duration'], ['attackSpeedBonus', -20, 'slow'],
    ['defenseBonusRatio', -0.5, 'debuff'], ['resistanceBonusRatio', -0.5, 'debuff'],
  ] as const) {
    assert.ok(result.effects.some((e) => e.key === key && e.value === value && e.sourceKey === sourceKey), key)
  }
  assert.ok(result.effects.every((e) => e.context === result.description))
})

test('gradual stats distinguish initial, final, and capped values from immediate bonuses', () => {
  assert.deepEqual(values('攻撃力が+50%になるまで徐々に上昇', 'attackPowerBonusRatioLimit'), [0.5])
  assert.deepEqual(values('攻撃力が+50%になるまで徐々に上昇', 'attackPowerBonusRatio'), [])
  assert.deepEqual(values('攻撃力と防御力が徐々に+30%まで上昇', 'defenseBonusRatioLimit'), [0.3])
  assert.deepEqual(values('攻撃力が180%から320%まで徐々に上昇', 'attackPowerInitialMultiplier'), [1.8])
  assert.deepEqual(values('攻撃力が180%から320%まで徐々に上昇', 'attackPowerFinalMultiplier'), [3.2])
  assert.deepEqual(values('攻撃速度が+160から+0まで徐々に減衰', 'attackSpeedInitialBonus'), [160])
  assert.deepEqual(values('攻撃速度が+160から+0まで徐々に減衰', 'attackSpeedBonus'), [])
  assert.deepEqual(values('移動速度を徐々に40%まで低下させる', 'moveSpeedFinalMultiplier'), [0.4])
})

test('exact attack intervals and relative intervals are not interval deltas', () => {
  assert.deepEqual(values('攻撃間隔を1秒に短縮', 'attackIntervalSeconds'), [1])
  assert.deepEqual(values('攻撃間隔を1秒に短縮', 'attackIntervalDeltaSeconds'), [])
  assert.deepEqual(values('攻撃間隔を20%短縮', 'attackIntervalBonusRatio'), [-0.2])
  assert.deepEqual(values('攻撃間隔が50%になる', 'attackIntervalMultiplier'), [0.5])
  assert.deepEqual(values('反撃の最小間隔は通常攻撃間隔の100%', 'counterattackIntervalMultiplier'), [1])
  assert.deepEqual(convertSkillDescription('攻撃間隔をわずかに短縮').effects.filter((e) => typeof e.value === 'number'), [])
})

test('defense ignore, stat stealing, and evasion do not infer ordinary stat bonuses', () => {
  assert.deepEqual(values('防御力を150無視し、術耐性を30%無視', 'defenseIgnoreAmount'), [150])
  assert.deepEqual(values('防御力を150無視し、術耐性を30%無視', 'resistanceIgnoreRatio'), [0.3])
  assert.deepEqual(values('対象の防御力を10奪取（最大100まで奪取可能）', 'defenseStealLimit'), [100])
  assert.deepEqual(values('物理と術回避+60%', 'physicalEvasionBonusRatio'), [0.6])
  assert.deepEqual(values('物理と術回避+60%', 'artsEvasionBonusRatio'), [0.6])
  assert.deepEqual(values('20%の確率で物理被ダメージを無効化する', 'physicalDamageNullificationChance'), [0.2])
})

test('incoming damage reduction by a percentage differs from reduction to a percentage', () => {
  assert.deepEqual(values('被ダメージを10%軽減', 'damageTakenReductionRatio'), [0.1])
  assert.deepEqual(values('被ダメージを50%に軽減', 'damageTakenMultiplier'), [0.5])
  assert.deepEqual(values('術の被ダメージ-10%', 'artsDamageTakenBonusRatio'), [-0.1])
  assert.deepEqual(values('受ける術ダメージ+20%', 'artsDamageTakenBonusRatio'), [0.2])
  assert.deepEqual(values('物理・術の被ダメージ-50', 'physicalDamageTakenDelta'), [-50])
  assert.deepEqual(values('物理・術の被ダメージ-50', 'artsDamageTakenDelta'), [-50])
})

test('healing and HP loss require an explicit percentage basis', () => {
  assert.deepEqual(values('HPが最大値の20%回復、HPが現在値の50%減少', 'maxHpRecoveryRatio'), [0.2])
  assert.deepEqual(values('HPが最大値の20%回復、HPが現在値の50%減少', 'currentHpLossRatio'), [0.5])
  assert.deepEqual(values('自身のHPを追加で50回復', 'hpRecoveryAmount'), [50])
  for (const text of ['HPが20%減少', '自身のHPを10%回復', 'HPが最大値の50%以上の場合', 'HPを最大値の10%失うたびに攻撃速度+5']) {
    assert.deepEqual(convertSkillDescription(text).effects.filter((e) => /Hp.*(?:Recovery|Loss)|hp(?:Recovery|Loss)/.test(e.key)), [], text)
  }
})

test('periodic healing distinguishes interval and per-tick amount with separate origins', () => {
  const result = convertSkillDescription('HPが{interval}秒ごとに最大値の{heal:0%}回復', [
    { key: 'interval', value: 2 }, { key: 'heal', value: 0.06 },
  ])
  const interval = result.effects.find((e) => e.key === 'hpRecoveryIntervalSeconds')
  const amount = result.effects.find((e) => e.key === 'maxHpRecoveryRatio')
  assert.equal(interval?.value, 2)
  assert.equal(interval?.sourceKey, 'interval')
  assert.equal(amount?.value, 0.06)
  assert.equal(amount?.sourceKey, 'heal')
  assert.equal(interval?.sourceText, amount?.sourceText)
  assert.deepEqual(values('0.5秒ごとにHPを1失い', 'hpLossIntervalSeconds'), [0.5])
  assert.deepEqual(values('1秒ごとにHPが40回復', 'hpRecoveryAmount'), [40])
  assert.deepEqual(values('HPを毎秒最大値の1%失う', 'maxHpLossRatioPerSecond'), [0.01])
})

test('attack-based healing keeps the named healer and conditional branches', () => {
  const text = '1秒ごとにガヴィルの攻撃力の20%（対象のHPが50%以下の時40%）のHPを回復'
  assert.deepEqual(values(text, 'attackBasedHealingMultiplier'), [0.2])
  assert.deepEqual(values(text, 'lowHpAttackBasedHealingMultiplier'), [0.4])
  assert.deepEqual(values(text, 'lowHpHealingThresholdRatio'), [0.5])
  assert.ok(convertSkillDescription(text).effects.every((e) => e.sourceText.includes('ガヴィル')))
  assert.deepEqual(values('味方のHPを1秒ごとにセンシの攻撃力の26%分治療し', 'attackBasedHealingMultiplier'), [0.26])
  assert.deepEqual(values('味方のHPを回復（1秒ごとテンニンカの攻撃力の25%）', 'attackBasedHealingMultiplier'), [0.25])
  assert.deepEqual(values('HPを与ダメージの30%回復', 'damageBasedHealingRatio'), [0.3])
})

test('healing and elemental healing modifiers preserve different meanings', () => {
  assert.deepEqual(values('HP回復量と元素損傷に対する治療値が150%まで上昇', 'healingMultiplier'), [1.5])
  assert.deepEqual(values('HP回復量と元素損傷に対する治療値が150%まで上昇', 'elementalHealingMultiplier'), [1.5])
  assert.deepEqual(values('元素損傷を2秒間1秒ごとにハニーベリーの攻撃力の10%の値分治療', 'attackBasedElementalHealingMultiplier'), [0.1])
  assert.deepEqual(values('受ける治療と回復効果を-50%', 'healingReceivedBonusRatio'), [-0.5])
})

test('HP and attack barrier bases, typed absorption, and limits remain separate', () => {
  assert.deepEqual(values('最大HPの20%までの物理の被ダメージを吸収可能なバリアを獲得する', 'physicalBarrierMaxHpRatio'), [0.2])
  assert.deepEqual(values('攻撃力の40%までの術被ダメージを吸収可能', 'artsBarrierAttackMultiplier'), [0.4])
  assert.deepEqual(values('最大HPの60%のバリアを獲得し、バリアは最大HPの2倍まで獲得できる', 'barrierMaxHpRatio'), [0.6])
  assert.deepEqual(values('最大HPの60%のバリアを獲得し、バリアは最大HPの2倍まで獲得できる', 'barrierMaxHpLimitRatio'), [2])
  assert.deepEqual(values('受ける元素損傷を600まで吸収可能な元素損傷バリア', 'elementalBarrierCapacity'), [600])
  assert.deepEqual(values('対象が1秒ごとにキャサリンの最大HPの6%のバリアを獲得する', 'barrierGenerationIntervalSeconds'), [1])
  assert.deepEqual(values('このバリアの効果は10秒持続し', 'barrierDurationSeconds'), [10])
})

test('inspiration supports distinct values for distinct stats', () => {
  const result = convertSkillDescription('ハイディの防御力の{def:0%}と最大HPの{hp:0%}の鼓舞状態', [
    { key: 'def', value: 0.25 }, { key: 'hp', value: 0.11 },
  ])
  assert.ok(result.effects.some((e) => e.key === 'defenseInspirationRatio' && e.value === 0.25 && e.sourceKey === 'def'))
  assert.ok(result.effects.some((e) => e.key === 'maxHpInspirationRatio' && e.value === 0.11 && e.sourceKey === 'hp'))
  assert.deepEqual(values('攻撃力と防御力の20%の鼓舞状態', 'attackPowerInspirationRatio'), [0.2])
})

test('SP and cost distinguish restoration, rates, spending, and deployment cost', () => {
  assert.deepEqual(values('SP自然回復速度+0.2sp/秒', 'spRecoveryRateBonus'), [0.2])
  assert.deepEqual(values('3秒ごとにSPが追加で1回復', 'spRecoveryIntervalSeconds'), [3])
  assert.deepEqual(values('SPを最大値の50%回復', 'maxSpRecoveryRatio'), [0.5])
  assert.deepEqual(values('コストを10消費し、配置コスト-4', 'deploymentCostConsumed'), [10])
  assert.deepEqual(values('コストを10消費し、配置コスト-4', 'deploymentCostBonus'), [-4])
  assert.deepEqual(values('5秒ごとに追加でコスト+1', 'deploymentCostRecoveryIntervalSeconds'), [5])
  assert.deepEqual(values('SP・HP回復効果が2倍になる', 'healingMultiplier'), [2])
  assert.deepEqual(values('所持コストが5以上なら', 'deploymentCostConsumed'), [])
})

test('invalid or qualified numbers are not parsed as a periodic cadence', () => {
  for (const description of ['1/2秒ごとにHPを10回復', '1e2秒ごとにHPを10回復', '1.2.3秒ごとにHPを10回復', '約2秒ごとにHPを10回復']) {
    assert.deepEqual(values(description, 'hpRecoveryIntervalSeconds'), [], description)
  }
  for (const description of ['約2秒ごとにSPを1回復', '1/2秒ごとにSPを1回復']) {
    assert.deepEqual(values(description, 'spRecoveryIntervalSeconds'), [], description)
  }
  assert.deepEqual(values('HPが最大値の{missing:0%}回復', 'maxHpRecoveryRatio'), [])
})

test('negations do not turn prevented healing or damage reductions into effects', () => {
  for (const text of ['HPを50回復しない', 'HPが最大値の20%回復しない', 'SPを1回復しない', '被ダメージを10%軽減しない', '防御力を150無視しない']) {
    assert.deepEqual(convertSkillDescription(text).effects, [], text)
  }
})

test('random recovery reports its explicit bounds without claiming a deterministic amount', () => {
  const text = 'スキル終了後ランダムで5-10のコストを獲得、その後SPをランダムで最大6回復する'
  assert.deepEqual(values(text, 'deploymentCostRecoveryMinimum'), [5])
  assert.deepEqual(values(text, 'deploymentCostRecoveryMaximum'), [10])
  assert.deepEqual(values(text, 'deploymentCostRecovery'), [])
  assert.deepEqual(values(text, 'spRecoveryMaximum'), [6])
  assert.deepEqual(values(text, 'spRecoveryAmount'), [])
  assert.deepEqual(values('ランダムで10-5のコストを獲得', 'deploymentCostRecoveryMinimum'), [])
})

test('coordinated recovery and deferred damage preserve complete numeric semantics', () => {
  const result = convertSkillDescription('攻撃を受けるたびにSPを{sp}、HPを最大値の{heal:0%}回復', [
    { key: 'sp', value: 1 }, { key: 'heal', value: 0.05 },
  ])
  assert.ok(result.effects.some((e) => e.key === 'spRecoveryAmount' && e.value === 1 && e.sourceKey === 'sp'))
  assert.ok(result.effects.some((e) => e.key === 'maxHpRecoveryRatio' && e.value === 0.05 && e.sourceKey === 'heal'))
  assert.deepEqual(values('軽減したダメージ分のHPを5秒間にかけて継続的に失う', 'deferredDamageDurationSeconds'), [5])
  assert.deepEqual(values('治療量は治療主対象の50%', 'secondaryHealingMultiplier'), [0.5])
})

test('redeploy time bonuses, multipliers, and resets preserve their different meanings', () => {
  assert.deepEqual(values('サンドビーストの再配置時間-10%', 'redeployTimeBonusRatio'), [-0.1])
  assert.deepEqual(values('次回までの再配置時間が+25%される', 'redeployTimeBonusRatio'), [0.25])
  assert.deepEqual(values('「タイプライター」再配置時間が70%まで短縮', 'redeployTimeMultiplier'), [0.7])
  assert.deepEqual(values('「タイプライター」再配置時間が70%まで短縮', 'redeployTimeBonusRatio'), [])
  assert.deepEqual(values('双方の再配置待ちのオペレーターの再配置時間が0になる', 'redeployTimeSeconds'), [0])
  assert.deepEqual(values('再配置時間を10秒に短縮', 'redeployTimeSeconds'), [10])
  assert.deepEqual(values('再配置時間が最も長いオペレーター1名', 'redeployTimeSeconds'), [])
})

test('physical and arts accuracy penalties share their numeric origin', () => {
  const text = '効果時間中対象の物理・術攻撃の命中率-{miss:0%}'
  const result = convertSkillDescription(text, [{ key: 'miss', value: 0.1 }])
  for (const key of ['physicalAccuracyBonusRatio', 'artsAccuracyBonusRatio']) {
    assert.ok(result.effects.some((e) => e.key === key && e.value === -0.1 && e.sourceKey === 'miss'), key)
  }
  assert.deepEqual(values('物理攻撃の命中率-20%', 'artsAccuracyBonusRatio'), [])
})

test('mana spending is extracted while consumption thresholds remain conditions', () => {
  assert.deepEqual(values('攻撃するたびに魔力を2消費する', 'manaConsumedAmount'), [2])
  assert.deepEqual(values('魔力を35消費して使い魔を召喚する', 'manaConsumedAmount'), [35])
  for (const text of ['魔力を追加で8消費するごとに爆発の回数が1回増加', '魔力を8消費する場合', '魔力を2消費しない', '魔力を1/2消費する']) {
    assert.deepEqual(values(text, 'manaConsumedAmount'), [], text)
  }
})
