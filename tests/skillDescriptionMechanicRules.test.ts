import test from 'node:test'
import assert from 'node:assert/strict'
import { convertSkillDescription } from '../src/lib/skillDescriptionEffects.ts'

test('浮遊ユニットの追加数は説明文から読み取り静的値の元キーを推測しない', () => {
  const bb = [{ key: 'attack@cnt', value: 2 }]
  const literal = convertSkillDescription('浮遊ユニットの数＋２', bb)
  const variable = convertSkillDescription('浮遊ユニットの数+{attack@cnt}', bb)
  assert.deepEqual(literal.effects.map(e => [e.key, e.value, e.sourceKey]), [['floatingUnitCountBonus', 2, null]])
  assert.deepEqual(variable.effects.map(e => [e.key, e.value, e.sourceKey]), [['floatingUnitCountBonus', 2, 'attack@cnt']])
  assert.deepEqual(literal.unconvertedText, [])
  assert.equal(convertSkillDescription('浮遊ユニットの数+1', [{ key: 'attack@cnt', value: 0 }]).effects[0].value, 1)
})

test('浮遊・ブロック・治療対象の加算と設定数を区別する', () => {
  const result = convertSkillDescription('浮遊ユニットの数が3になる。ブロック数-1。ブロック数が0になり、治療対象数+2')
  assert.deepEqual(result.effects.map(e => [e.key, e.value]), [
    ['floatingUnitCount', 3], ['blockCountBonus', -1], ['blockCount', 0], ['healingTargetCountBonus', 2],
  ])
})

test('回数をチャージ・使用上限・弾薬・重複上限として区別する', () => {
  const result = convertSkillDescription('3回チャージ可能。発動可能回数は4回。合計12発の弾薬を撃ち切るとスキルが終了（手動でスキルを停止可能）。最大5回まで効果重複可能')
  assert.deepEqual(result.effects.map(e => [e.key, e.value]), [
    ['skillChargeCount', 3], ['skillUseLimit', 4], ['skillAmmoCount', 12], ['manualSkillStop', '可能'], ['effectStackLimit', 5],
  ])
  assert.equal(result.effects.some(e => e.key === 'hitsPerAttack'), false)
})

test('獲得数は配置中の数と混同せずリソース名と元変数を保持する', () => {
  const result = convertSkillDescription('召喚物を{tokens}体獲得。「医療ドローン」を1個獲得する。シールドを2枚獲得', [{key:'tokens',value:3}])
  assert.deepEqual(result.effects.map(e => [e.key,e.value,e.sourceKey]), [
    ['resourceCountGained',3,'tokens'], ['resourceCountGained',1,null], ['shieldCountGained',2,null],
  ])
  assert.match(result.effects[0].label, /召喚物/)
  assert.match(result.effects[1].label, /医療ドローン/)
})

test('素質の倍率や発動確率はオペレーターの攻撃力に置き換えない', () => {
  const result = convertSkillDescription('第一素質の効果が2倍まで上昇。素質の発動率が80%まで上昇')
  assert.deepEqual(result.effects.map(e => [e.key,e.value,e.unit]), [
    ['firstTalentEffectMultiplier',2,'multiplier'], ['talentTriggerChance',0.8,'fraction'],
  ])
})

test('攻撃範囲のマス増減と拡大方向が不明な範囲変更は区別する', () => {
  const result = convertSkillDescription('攻撃範囲+2マス。攻撃範囲が戦場全体まで拡大。攻撃範囲拡大')
  assert.deepEqual(result.effects.map(e => [e.key,e.value,e.unit]), [
    ['attackRangeExtension',2,'cells'], ['attackRangeMode','戦場全体',''], ['attackRangeChange','拡大',''],
  ])
})

test('明記された継続・攻撃停止・迷彩を保持し閾値や未解決値を効果にしない', () => {
  const result = convertSkillDescription('攻撃しなくなり、迷彩状態になる。退場まで効果継続')
  assert.deepEqual(result.effects.map(e => e.key), ['attackBehavior','camouflage','skillDurationMode'])
  for (const text of [
    '浮遊ユニットの数+{unknown}', '浮遊ユニットの数+2.5', 'ブロック数が3以下の味方',
    '浮遊ユニットの数+1/2', '2.5回チャージ可能', '1/2回チャージ可能',
    '攻撃範囲が拡大しない', '通常攻撃の間隔を大幅に短縮', 'ステルス状態の敵を攻撃する',
    'HPが50%以上の敵を攻撃しなくなる', '攻撃力+50%〜100%', '攻撃速度+2~3',
    '浮遊ユニットの数+2以上', '約2回チャージ可能', '浮遊ユニットの数+2ではない',
  ]) {
    const negative = convertSkillDescription(text)
    assert.deepEqual(negative.effects, [], text)
    assert.ok(negative.unconvertedText.length, text)
  }
})

test('改行後の回数を直前の数値の続きとして扱わない', () => {
  const result = convertSkillDescription('所持コスト+1\n3回チャージ可能\n攻撃速度+70\n2秒間スタンさせる')
  assert.deepEqual(result.effects.map(e => [e.key,e.value]), [
    ['deploymentCostRecovery',1], ['skillChargeCount',3], ['attackSpeedBonus',70], ['stunDurationSeconds',2],
  ])
  assert.equal(convertSkillDescription('浮遊ユニットの数＋１．５').effects.length, 0)
})

test('ゴールデングローS3の明記された効果を拾い浮遊ユニットの動作説明を残す', () => {
  const description = '攻撃しなくなり、攻撃力+{atk:0%}、攻撃範囲が戦場全体まで拡大し、浮遊ユニットの数+2、自動索敵して攻撃する浮遊ユニットを放出し、浮遊ユニットが攻撃時、攻撃対象を{slow}秒足止めする\n索敵中の浮遊ユニットは目標が倒されるか自爆時、あるいはスキル終了時、索敵を中断する'
  const result = convertSkillDescription(description, [{key:'atk',value:0.8},{key:'attack@cnt',value:2},{key:'slow',value:0.5}])
  assert.deepEqual(result.effects.map(e => [e.key,e.value,e.sourceKey]), [
    ['attackBehavior','停止',null], ['attackPowerBonusRatio',0.8,'atk'], ['attackRangeMode','戦場全体',null],
    ['floatingUnitCountBonus',2,null], ['slowDurationSeconds',0.5,'slow'],
  ])
  assert.ok(result.effects.every(e => e.context === result.description))
  assert.match(result.unconvertedText.join('\n'), /自動索敵/)
})

test('治療の追加回数・跳躍数・対象数とデバイスのチャージ回復を区別する', () => {
  const result = convertSkillDescription('治療の跳躍回数+2。同時治療人数-1。追加でもう3回治療。味方4人を同時に回復。コーティングデバイスのチャージを1回回復')
  assert.deepEqual(result.effects.map(e => [e.key,e.value]), [
    ['healingBounceCountBonus',2], ['healingTargetCountBonus',-1], ['additionalHealingCount',3],
    ['healingTargetCount',4], ['coatingDeviceChargeRecovery',1],
  ])
})

test('上限・コイン消費・素質発動回数・バリア持続時間を区別する', () => {
  const result = convertSkillDescription('使用上限2回。コインを1枚消費し、コインの所持上限:3。第二素質を即座に2回発動する。バリアは4秒持続し、攻撃範囲が前方3マスになる')
  assert.deepEqual(result.effects.map(e => [e.key,e.value]), [
    ['skillUseLimit',2], ['coinCost',1], ['coinCapacity',3], ['secondTalentActivationCount',2],
    ['barrierDurationSeconds',4], ['forwardAttackRangeCells',3],
  ])
})

test('確率と発動失敗率を区別し不正な確率は補正しない', () => {
  const result = convertSkillDescription('30%の確率で発動失敗になる。20%の確率で対象を2秒足止めする')
  assert.deepEqual(result.effects.map(e => [e.key,e.value]), [
    ['activationFailureChance',0.3], ['effectProbability',0.2], ['slowDurationSeconds',2],
  ])
  assert.deepEqual(convertSkillDescription('120%の確率で').effects, [])
})

test('召喚・追加・配置枠消費と返還を混同しない', () => {
  const result = convertSkillDescription('「狼の隻影」2体増加。「悲嘆する下僕」を追加で1体召喚する。「呪いの人形」3体が配置可能になる。配置可能数は2消費する。配置可能数が1返還される')
  assert.deepEqual(result.effects.map(e => [e.key,e.value]), [
    ['namedUnitCountBonus',2], ['summonedUnitCount',1], ['deployableUnitCount',3],
    ['deploymentSlotCost',2], ['deploymentSlotReturn',1],
  ])
})

test('発動上限の期間と回数を保持し通常の連続攻撃には転用しない', () => {
  const result = convertSkillDescription('1回の作戦につき発動上限2回。5秒内発動上限3回。スキル発動中4回限り')
  assert.deepEqual(result.effects.map(e => [e.key,e.value]), [
    ['useLimitBattleCount',1], ['skillUseLimit',2], ['activationLimitWindowSeconds',5],
    ['activationLimitCount',3], ['activationEffectLimitCount',4],
  ])
  assert.equal(convertSkillDescription('3秒間に5回攻撃する').effects.some(e => e.key === 'activationLimitCount'), false)
})

test('行動の条件に含まれる数値は回復や能力上昇の効果と断定しない', () => {
  const result = convertSkillDescription('HPを100回復するたび、攻撃力+20%。防御力が30%増加した場合に発動する')
  assert.deepEqual(result.effects.map(e => [e.key,e.value]), [['attackPowerBonusRatio',0.2]])
  assert.match(result.unconvertedText.join('\n'), /100回復するたび/)
  assert.match(result.unconvertedText.join('\n'), /30%増加した場合/)
})
